"""
OCR Service - Google Cloud Vision Document Text Detection
Abstracted to allow future Document AI integration
"""
import io
import json
from abc import ABC, abstractmethod
from typing import List, Optional
from backend.config import settings
from backend.storage import storage


class OCRProvider(ABC):
    """Abstract OCR provider - allows swapping backends"""

    @abstractmethod
    def detect_text(self, image_bytes: bytes) -> dict:
        """
        Detect text in image

        Returns:
            {
                "full_text": str,
                "blocks": [
                    {
                        "text": str,
                        "bbox": {"x", "y", "width", "height"},
                        "confidence": float,
                        "words": [{"text", "bbox", "confidence"}, ...]
                    }
                ]
            }
        """
        pass


class GoogleVisionOCR(OCRProvider):
    """Google Cloud Vision Document Text Detection"""

    def __init__(self):
        from google.cloud import vision
        self.client = vision.ImageAnnotatorClient()

    def detect_text(self, image_bytes: bytes) -> dict:
        from google.cloud import vision

        image = vision.Image(content=image_bytes)

        # Use document_text_detection for better structure
        response = self.client.document_text_detection(image=image)

        if response.error.message:
            raise Exception(f"Vision API error: {response.error.message}")

        return self._parse_response(response)

    def _parse_response(self, response) -> dict:
        """Parse Vision API response into standard format"""
        result = {
            "full_text": "",
            "blocks": []
        }

        if not response.full_text_annotation:
            return result

        annotation = response.full_text_annotation
        result["full_text"] = annotation.text

        # Process pages -> blocks -> paragraphs -> words
        for page in annotation.pages:
            for block in page.blocks:
                block_text = ""
                block_words = []
                block_confidence = 0
                word_count = 0

                for paragraph in block.paragraphs:
                    for word in paragraph.words:
                        word_text = "".join([
                            symbol.text for symbol in word.symbols
                        ])
                        word_confidence = word.confidence

                        # Get word bounding box
                        word_bbox = self._vertices_to_bbox(word.bounding_box.vertices)

                        block_words.append({
                            "text": word_text,
                            "bbox": word_bbox,
                            "confidence": word_confidence
                        })

                        block_text += word_text + " "
                        block_confidence += word_confidence
                        word_count += 1

                if word_count > 0:
                    block_confidence /= word_count

                block_bbox = self._vertices_to_bbox(block.bounding_box.vertices)

                result["blocks"].append({
                    "text": block_text.strip(),
                    "bbox": block_bbox,
                    "confidence": block_confidence,
                    "words": block_words
                })

        return result

    def _vertices_to_bbox(self, vertices) -> dict:
        """Convert Vision API vertices to bbox format"""
        xs = [v.x for v in vertices]
        ys = [v.y for v in vertices]

        return {
            "x": min(xs),
            "y": min(ys),
            "width": max(xs) - min(xs),
            "height": max(ys) - min(ys)
        }


class MockOCR(OCRProvider):
    """Mock OCR for testing without API calls"""

    def detect_text(self, image_bytes: bytes) -> dict:
        return {
            "full_text": "Sample text for testing",
            "blocks": [
                {
                    "text": "Sample text",
                    "bbox": {"x": 100, "y": 100, "width": 200, "height": 50},
                    "confidence": 0.95,
                    "words": [
                        {
                            "text": "Sample",
                            "bbox": {"x": 100, "y": 100, "width": 80, "height": 50},
                            "confidence": 0.95
                        },
                        {
                            "text": "text",
                            "bbox": {"x": 190, "y": 100, "width": 60, "height": 50},
                            "confidence": 0.95
                        }
                    ]
                }
            ]
        }


# Factory function
_ocr_provider: Optional[OCRProvider] = None


def get_ocr_provider() -> OCRProvider:
    """Get configured OCR provider"""
    global _ocr_provider

    if _ocr_provider is None:
        if settings.google_cloud_project:
            _ocr_provider = GoogleVisionOCR()
        else:
            # Fallback to mock for development
            _ocr_provider = MockOCR()

    return _ocr_provider


def ocr_page(image_path: str) -> dict:
    """
    Run OCR on a page image

    Args:
        image_path: Storage path to page image

    Returns:
        OCR result dict
    """
    image_bytes = storage().get(image_path)
    provider = get_ocr_provider()
    return provider.detect_text(image_bytes)


def ocr_roi(roi_bytes: bytes) -> dict:
    """
    Run OCR on a ROI image

    Args:
        roi_bytes: ROI image bytes

    Returns:
        OCR result dict
    """
    provider = get_ocr_provider()
    return provider.detect_text(roi_bytes)


def get_context_around_bbox(
    ocr_result: dict,
    target_bbox: dict,
    max_lines: int = 3
) -> tuple[str, str]:
    """
    Get text context before and after a target bbox

    Args:
        ocr_result: Full page OCR result
        target_bbox: Target bbox to find context for
        max_lines: Maximum lines of context

    Returns:
        (context_before, context_after)
    """
    blocks = ocr_result.get("blocks", [])

    # Sort blocks by vertical position
    sorted_blocks = sorted(blocks, key=lambda b: b["bbox"]["y"])

    target_y = target_bbox["y"]
    target_y_end = target_bbox["y"] + target_bbox["height"]

    before_texts = []
    after_texts = []

    for block in sorted_blocks:
        block_y = block["bbox"]["y"]
        block_y_end = block_y + block["bbox"]["height"]

        if block_y_end < target_y:
            before_texts.append(block["text"])
        elif block_y > target_y_end:
            after_texts.append(block["text"])

    # Take last N lines before and first N lines after
    context_before = "\n".join(before_texts[-max_lines:])
    context_after = "\n".join(after_texts[:max_lines])

    return context_before, context_after
