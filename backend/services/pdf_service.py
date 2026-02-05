"""
PDF processing service - converts PDF to images
"""
import io
import fitz  # pymupdf
from PIL import Image
from typing import List, Tuple
from backend.config import settings
from backend.storage import storage


def pdf_to_images(
    pdf_bytes: bytes,
    project_id: str,
    dpi: int = None
) -> List[dict]:
    """
    Convert PDF to page images

    Args:
        pdf_bytes: PDF file content
        project_id: Project UUID for storage path
        dpi: Resolution (default from settings)

    Returns:
        List of page info dicts with paths and dimensions
    """
    if dpi is None:
        dpi = settings.pdf_dpi

    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    pages_info = []

    # Limit pages
    total_pages = min(len(doc), settings.max_pages_per_project)

    for page_num in range(total_pages):
        page = doc[page_num]

        # Render page at specified DPI
        # Default PDF is 72 DPI, so scale factor = dpi / 72
        scale = dpi / 72.0
        mat = fitz.Matrix(scale, scale)
        pix = page.get_pixmap(matrix=mat, alpha=False)

        # Convert to PIL Image
        img_data = pix.tobytes("png")
        img = Image.open(io.BytesIO(img_data))

        # Save full-size image
        image_path = f"projects/{project_id}/pages/{page_num + 1}.png"
        storage().save_bytes(img_data, image_path)

        # Generate and save thumbnail
        thumbnail = generate_thumbnail(img, settings.thumbnail_width)
        thumb_buffer = io.BytesIO()
        thumbnail.save(thumb_buffer, format="PNG", optimize=True)
        thumb_path = f"projects/{project_id}/thumbnails/{page_num + 1}.png"
        storage().save_bytes(thumb_buffer.getvalue(), thumb_path)

        pages_info.append({
            "page_number": page_num + 1,
            "image_path": image_path,
            "thumbnail_path": thumb_path,
            "width": pix.width,
            "height": pix.height,
        })

    doc.close()
    return pages_info


def generate_thumbnail(img: Image.Image, target_width: int) -> Image.Image:
    """Generate thumbnail maintaining aspect ratio"""
    aspect = img.height / img.width
    target_height = int(target_width * aspect)
    return img.resize((target_width, target_height), Image.Resampling.LANCZOS)


def extract_roi_with_margin(
    page_image_path: str,
    bbox: dict,
    margin: int = None
) -> Tuple[bytes, dict]:
    """
    Extract ROI from page image with margin

    Args:
        page_image_path: Path to page image in storage
        bbox: {"x", "y", "width", "height"}
        margin: Pixel margin around ROI

    Returns:
        (roi_image_bytes, adjusted_bbox)
    """
    if margin is None:
        margin = settings.roi_margin

    # Load image
    img_bytes = storage().get(page_image_path)
    img = Image.open(io.BytesIO(img_bytes))

    # Calculate ROI with margin (clamped to image bounds)
    x1 = max(0, bbox["x"] - margin)
    y1 = max(0, bbox["y"] - margin)
    x2 = min(img.width, bbox["x"] + bbox["width"] + margin)
    y2 = min(img.height, bbox["y"] + bbox["height"] + margin)

    # Enforce max ROI size
    if x2 - x1 > settings.max_roi_width:
        excess = (x2 - x1) - settings.max_roi_width
        x1 += excess // 2
        x2 -= excess // 2
    if y2 - y1 > settings.max_roi_height:
        excess = (y2 - y1) - settings.max_roi_height
        y1 += excess // 2
        y2 -= excess // 2

    # Crop
    roi = img.crop((x1, y1, x2, y2))

    # Convert to bytes
    buffer = io.BytesIO()
    roi.save(buffer, format="PNG")

    adjusted_bbox = {
        "x": x1,
        "y": y1,
        "width": x2 - x1,
        "height": y2 - y1,
        "original_bbox_offset": {
            "x": bbox["x"] - x1,
            "y": bbox["y"] - y1,
        }
    }

    return buffer.getvalue(), adjusted_bbox


def apply_patch_to_page(
    page_image_path: str,
    patch_bytes: bytes,
    patch_bbox: dict
) -> bytes:
    """
    Apply a corrected patch back to the page image

    Args:
        page_image_path: Path to page image in storage
        patch_bytes: Corrected patch image
        patch_bbox: Position where to apply patch

    Returns:
        Updated page image bytes
    """
    # Load page image
    page_bytes = storage().get(page_image_path)
    page_img = Image.open(io.BytesIO(page_bytes)).convert("RGBA")

    # Load patch
    patch_img = Image.open(io.BytesIO(patch_bytes)).convert("RGBA")

    # Paste patch onto page
    page_img.paste(
        patch_img,
        (patch_bbox["x"], patch_bbox["y"]),
        patch_img if patch_img.mode == 'RGBA' else None
    )

    # Convert back to RGB and save
    result = page_img.convert("RGB")
    buffer = io.BytesIO()
    result.save(buffer, format="PNG")

    return buffer.getvalue()


def merge_pages_to_pdf(page_paths: List[str]) -> bytes:
    """
    Merge page images into a single PDF

    Args:
        page_paths: List of storage paths to page images

    Returns:
        PDF bytes
    """
    from reportlab.lib.pagesizes import letter
    from reportlab.pdfgen import canvas
    from reportlab.lib.utils import ImageReader

    buffer = io.BytesIO()

    # Get first image to determine page size
    first_img_bytes = storage().get(page_paths[0])
    first_img = Image.open(io.BytesIO(first_img_bytes))

    # Create PDF with same dimensions as images
    c = canvas.Canvas(buffer)

    for path in page_paths:
        img_bytes = storage().get(path)
        img = Image.open(io.BytesIO(img_bytes))

        # Set page size to match image
        c.setPageSize((img.width, img.height))

        # Draw image
        img_reader = ImageReader(io.BytesIO(img_bytes))
        c.drawImage(img_reader, 0, 0, width=img.width, height=img.height)

        c.showPage()

    c.save()
    return buffer.getvalue()
