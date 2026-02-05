"""
Correction Service - Applies text corrections to images
Two methods: text overlay (fallback) and Nano Banana Pro (AI)
"""
import io
from typing import Tuple, Optional
from PIL import Image, ImageDraw, ImageFont
from pathlib import Path
from backend.config import settings
from backend.storage import storage
from backend.services.gemini_service import get_gemini_editor


# Font paths to try (in order of preference)
FONT_PATHS = [
    "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
    "/System/Library/Fonts/ヒラギノ角ゴシック W3.ttc",
    "/System/Library/Fonts/Hiragino Sans GB.ttc",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    None  # Fallback to default
]


def apply_text_overlay(
    roi_image_bytes: bytes,
    bbox_in_roi: dict,
    corrected_text: str,
    original_text: str = ""
) -> bytes:
    """
    Apply text correction using background fill + text rendering
    This is the reliable fallback method

    Args:
        roi_image_bytes: ROI image bytes
        bbox_in_roi: Bbox within the ROI where text should be placed
        corrected_text: Text to render
        original_text: Original text (for reference)

    Returns:
        Corrected image bytes
    """
    img = Image.open(io.BytesIO(roi_image_bytes)).convert("RGB")
    draw = ImageDraw.Draw(img)

    # Get bbox coordinates
    x = bbox_in_roi.get("x", 0)
    y = bbox_in_roi.get("y", 0)
    width = bbox_in_roi.get("width", 100)
    height = bbox_in_roi.get("height", 30)

    # Estimate background color from surrounding pixels
    bg_color = estimate_background_color(img, x, y, width, height)

    # Estimate text color (contrasting with background)
    text_color = estimate_text_color(img, x, y, width, height)

    # Fill background
    draw.rectangle([x, y, x + width, y + height], fill=bg_color)

    # Estimate font size based on bbox height
    font_size = max(12, int(height * 0.7))
    font = get_font(font_size)

    # Calculate text position (centered vertically)
    text_bbox = draw.textbbox((0, 0), corrected_text, font=font)
    text_width = text_bbox[2] - text_bbox[0]
    text_height = text_bbox[3] - text_bbox[1]

    text_x = x + (width - text_width) // 2
    text_y = y + (height - text_height) // 2

    # Draw text
    draw.text((text_x, text_y), corrected_text, font=font, fill=text_color)

    # Save result
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    return buffer.getvalue()


def apply_nano_banana(
    roi_image_bytes: bytes,
    original_text: str,
    corrected_text: str
) -> Tuple[Optional[bytes], str]:
    """
    Apply text correction using Gemini image editing (Nano Banana Pro)
    Falls back to text_overlay on failure

    Args:
        roi_image_bytes: ROI image bytes
        original_text: Original (incorrect) text
        corrected_text: Corrected text

    Returns:
        (corrected_image_bytes, status_message)
    """
    editor = get_gemini_editor()

    try:
        result_bytes, status = editor.edit_roi_patch(
            roi_image_bytes,
            original_text,
            corrected_text
        )

        if result_bytes is not None:
            return result_bytes, "nano_banana_success"
        else:
            # Fallback to text overlay
            return None, f"nano_banana_failed: {status}"

    except Exception as e:
        return None, f"nano_banana_error: {str(e)}"


def estimate_background_color(
    img: Image.Image,
    x: int, y: int,
    width: int, height: int,
    sample_margin: int = 5
) -> Tuple[int, int, int]:
    """
    Estimate background color by sampling pixels around the bbox
    """
    pixels = []

    # Sample from edges
    for dx in range(0, width, max(1, width // 10)):
        # Top edge (above bbox)
        if y - sample_margin >= 0:
            pixels.append(img.getpixel((min(x + dx, img.width - 1), y - sample_margin)))
        # Bottom edge (below bbox)
        if y + height + sample_margin < img.height:
            pixels.append(img.getpixel((min(x + dx, img.width - 1), y + height + sample_margin)))

    for dy in range(0, height, max(1, height // 10)):
        # Left edge
        if x - sample_margin >= 0:
            pixels.append(img.getpixel((x - sample_margin, min(y + dy, img.height - 1))))
        # Right edge
        if x + width + sample_margin < img.width:
            pixels.append(img.getpixel((x + width + sample_margin, min(y + dy, img.height - 1))))

    if not pixels:
        return (255, 255, 255)  # Default white

    # Calculate average color
    r = sum(p[0] for p in pixels) // len(pixels)
    g = sum(p[1] for p in pixels) // len(pixels)
    b = sum(p[2] for p in pixels) // len(pixels)

    return (r, g, b)


def estimate_text_color(
    img: Image.Image,
    x: int, y: int,
    width: int, height: int
) -> Tuple[int, int, int]:
    """
    Estimate text color by sampling pixels inside the bbox
    and finding contrasting color
    """
    pixels = []

    # Sample from inside bbox
    for dx in range(0, width, max(1, width // 5)):
        for dy in range(0, height, max(1, height // 5)):
            px = min(x + dx, img.width - 1)
            py = min(y + dy, img.height - 1)
            pixels.append(img.getpixel((px, py)))

    if not pixels:
        return (0, 0, 0)  # Default black

    # Find the darkest and lightest colors
    luminances = []
    for p in pixels:
        lum = 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2]
        luminances.append((lum, p))

    luminances.sort(key=lambda x: x[0])

    # Get average background luminance
    bg_color = estimate_background_color(img, x, y, width, height)
    bg_lum = 0.299 * bg_color[0] + 0.587 * bg_color[1] + 0.114 * bg_color[2]

    # Choose text color that contrasts with background
    if bg_lum > 128:
        # Light background -> dark text
        # Find darkest sampled color or use black
        if luminances[0][0] < 100:
            return luminances[0][1][:3]
        return (0, 0, 0)
    else:
        # Dark background -> light text
        if luminances[-1][0] > 155:
            return luminances[-1][1][:3]
        return (255, 255, 255)


def get_font(size: int) -> ImageFont.FreeTypeFont:
    """Get font with fallback"""
    for font_path in FONT_PATHS:
        if font_path is None:
            return ImageFont.load_default()

        try:
            if Path(font_path).exists():
                return ImageFont.truetype(font_path, size)
        except Exception:
            continue

    return ImageFont.load_default()


def apply_correction(
    page_image_path: str,
    issue_bbox: dict,
    corrected_text: str,
    original_text: str,
    method: str = "text_overlay",
    project_id: str = "",
    issue_id: str = ""
) -> Tuple[str, str, str]:
    """
    Apply correction to a page and save before/after patches

    Args:
        page_image_path: Storage path to page image
        issue_bbox: Issue bbox on page
        corrected_text: Corrected text
        original_text: Original text
        method: "text_overlay" or "nano_banana"
        project_id: For storage paths
        issue_id: For storage paths

    Returns:
        (patch_before_path, patch_after_path, status)
    """
    from backend.services.pdf_service import extract_roi_with_margin, apply_patch_to_page

    # Extract ROI with margin
    roi_bytes, adjusted_bbox = extract_roi_with_margin(
        page_image_path,
        issue_bbox,
        margin=settings.roi_margin
    )

    # Save before patch
    before_path = f"projects/{project_id}/patches/{issue_id}_before.png"
    storage().save_bytes(roi_bytes, before_path)

    # Calculate bbox within ROI
    bbox_in_roi = {
        "x": adjusted_bbox["original_bbox_offset"]["x"],
        "y": adjusted_bbox["original_bbox_offset"]["y"],
        "width": issue_bbox["width"],
        "height": issue_bbox["height"]
    }

    # Apply correction
    if method == "nano_banana":
        corrected_bytes, status = apply_nano_banana(
            roi_bytes,
            original_text,
            corrected_text
        )

        if corrected_bytes is None:
            # Fallback to text overlay
            corrected_bytes = apply_text_overlay(
                roi_bytes,
                bbox_in_roi,
                corrected_text,
                original_text
            )
            status = "fallback_to_text_overlay"
    else:
        corrected_bytes = apply_text_overlay(
            roi_bytes,
            bbox_in_roi,
            corrected_text,
            original_text
        )
        status = "text_overlay_success"

    # Save after patch
    after_path = f"projects/{project_id}/patches/{issue_id}_after.png"
    storage().save_bytes(corrected_bytes, after_path)

    # Apply patch to page
    updated_page_bytes = apply_patch_to_page(
        page_image_path,
        corrected_bytes,
        {"x": adjusted_bbox["x"], "y": adjusted_bbox["y"]}
    )

    # Save updated page
    storage().save_bytes(updated_page_bytes, page_image_path)

    return before_path, after_path, status


def undo_correction(
    page_image_path: str,
    patch_before_path: str,
    patch_bbox: dict
) -> bool:
    """
    Undo a correction by restoring the before patch

    Args:
        page_image_path: Storage path to page image
        patch_before_path: Storage path to before patch
        patch_bbox: Position of patch on page

    Returns:
        Success status
    """
    from backend.services.pdf_service import apply_patch_to_page

    try:
        before_bytes = storage().get(patch_before_path)

        updated_page_bytes = apply_patch_to_page(
            page_image_path,
            before_bytes,
            patch_bbox
        )

        storage().save_bytes(updated_page_bytes, page_image_path)
        return True

    except Exception as e:
        return False
