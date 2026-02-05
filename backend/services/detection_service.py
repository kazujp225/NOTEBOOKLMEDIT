"""
Issue Detection Service - Identifies problematic text regions
"""
import re
from typing import List, Optional
from backend.config import settings


# Characters that indicate garbled text
GARBLED_CHARS = {'�', '□', '■', '?', '\ufffd', '\u25a1', '\u25a0'}

# Patterns that suggest OCR failures
SUSPICIOUS_PATTERNS = [
    r'[�□■]{2,}',  # Multiple garbled chars
    r'[\?\!]{3,}',  # Excessive punctuation
    r'[a-z][A-Z]{3,}[a-z]',  # Mixed case anomaly
    r'\d[a-zA-Z]\d[a-zA-Z]',  # Alternating digit/letter
]


def detect_issues(ocr_result: dict, page_id: str) -> List[dict]:
    """
    Analyze OCR result and detect problematic regions

    Args:
        ocr_result: OCR result from ocr_service
        page_id: Page UUID for reference

    Returns:
        List of issue dicts ready for database insertion
    """
    issues = []
    blocks = ocr_result.get("blocks", [])

    for block in blocks:
        detected_problems = []
        issue_type = None
        auto_correctable = False

        text = block.get("text", "")
        confidence = block.get("confidence", 1.0)
        bbox = block.get("bbox", {})

        # Check 1: Low confidence
        if confidence < 0.8:
            issue_type = "low_confidence"
            detected_problems.append(f"Low OCR confidence: {confidence:.2f}")

        # Check 2: Garbled characters
        garbled_found = [c for c in text if c in GARBLED_CHARS]
        if garbled_found:
            issue_type = "garbled"
            detected_problems.append(f"Garbled characters: {', '.join(set(garbled_found))}")
            auto_correctable = True  # Garbled text is usually auto-correctable

        # Check 3: Suspicious patterns
        for pattern in SUSPICIOUS_PATTERNS:
            if re.search(pattern, text):
                if not issue_type:
                    issue_type = "garbled"
                detected_problems.append(f"Suspicious pattern detected")
                break

        # Check 4: Very short text in large box (possible missing text)
        if bbox.get("width", 0) > 100 and bbox.get("height", 0) > 30:
            if len(text.strip()) < 3:
                issue_type = "missing"
                detected_problems.append("Possible missing text: large area with minimal content")

        # Check 5: Unusual character density
        if bbox.get("width", 0) > 0 and bbox.get("height", 0) > 0:
            area = bbox["width"] * bbox["height"]
            char_density = len(text) / (area / 1000)  # chars per 1000 px^2

            if char_density < 0.1 and len(text) > 5:
                if not issue_type:
                    issue_type = "missing"
                detected_problems.append(f"Low character density: {char_density:.3f}")

        # Only create issue if problems were found
        if issue_type and detected_problems:
            # Evaluate auto-correctability
            auto_correctable = evaluate_auto_correctability(
                text, confidence, detected_problems
            )

            issues.append({
                "page_id": page_id,
                "bbox_x": bbox.get("x", 0),
                "bbox_y": bbox.get("y", 0),
                "bbox_width": bbox.get("width", 0),
                "bbox_height": bbox.get("height", 0),
                "issue_type": issue_type,
                "confidence": confidence,
                "ocr_text": text,
                "detected_problems": detected_problems,
                "status": "detected",
                "auto_correctable": auto_correctable,
            })

    # Limit issues per page
    return issues[:settings.max_issues_per_page]


def evaluate_auto_correctability(
    text: str,
    confidence: float,
    problems: List[str]
) -> bool:
    """
    Determine if an issue can likely be auto-corrected

    Returns True if:
    - Clear garbled characters that can be replaced
    - High enough context for inference
    - Not a sensitive pattern (numbers, URLs, etc.)
    """
    # Never auto-correct sensitive patterns
    if contains_sensitive_pattern(text):
        return False

    # Garbled characters with reasonable confidence are correctable
    if any("Garbled" in p for p in problems):
        if confidence > 0.5:
            return True

    # Low confidence alone is not auto-correctable
    if confidence < 0.6:
        return False

    # Short text with issues is risky
    if len(text.strip()) < 5:
        return False

    return True


def contains_sensitive_pattern(text: str) -> bool:
    """Check for patterns that should not be auto-corrected"""
    sensitive_patterns = [
        r'\d{4,}',  # Long numbers
        r'https?://',  # URLs
        r'www\.',  # URLs
        r'[\w.-]+@[\w.-]+\.\w+',  # Email
        r'\d{4}[-/]\d{1,2}[-/]\d{1,2}',  # Dates
        r'[\d,]+円',  # Currency
        r'\$[\d,]+',  # Dollar amounts
        r'[A-Z]{2,}\d+',  # Product codes
        r'\d+-\d+-\d+',  # Phone-like patterns
    ]

    for pattern in sensitive_patterns:
        if re.search(pattern, text):
            return True

    return False


def looks_like_proper_noun(text: str) -> bool:
    """Check if text appears to be a proper noun"""
    # All katakana (likely proper noun)
    if re.match(r'^[ァ-ヶー]+$', text) and len(text) <= 10:
        return True

    # Short kanji string (likely name)
    if re.match(r'^[一-龥]+$', text) and len(text) <= 4:
        return True

    # Capitalized word
    if re.match(r'^[A-Z][a-z]+$', text):
        return True

    return False


def evaluate_auto_adopt(
    ocr_text: str,
    candidates: List[dict],
    ocr_confidence: float
) -> tuple[bool, Optional[int]]:
    """
    Evaluate if a correction candidate should be auto-adopted

    Args:
        ocr_text: Original OCR text
        candidates: List of correction candidates [{text, confidence, reason}]
        ocr_confidence: Original OCR confidence

    Returns:
        (should_auto_adopt, selected_candidate_index)
    """
    if not candidates:
        return False, None

    top_candidate = candidates[0]

    # Rule 1: Sensitive patterns are never auto-adopted
    if contains_sensitive_pattern(ocr_text) or contains_sensitive_pattern(top_candidate["text"]):
        return False, None

    # Rule 2: Proper nouns need review
    if looks_like_proper_noun(top_candidate["text"]):
        return False, None

    # Rule 3: If candidates are split (close confidence), need review
    if len(candidates) >= 2:
        diff = top_candidate["confidence"] - candidates[1]["confidence"]
        if diff < 0.15:
            return False, None

    # Rule 4: Garbled chars removed with high confidence = auto adopt
    garbled_in_original = any(c in ocr_text for c in GARBLED_CHARS)
    garbled_in_candidate = any(c in top_candidate["text"] for c in GARBLED_CHARS)

    if garbled_in_original and not garbled_in_candidate:
        if top_candidate["confidence"] > 0.85:
            return True, 0

    # Rule 5: High confidence match
    if top_candidate["confidence"] > 0.90:
        return True, 0

    # Rule 6: OCR was already high confidence and top candidate matches/similar
    if ocr_confidence > 0.9 and top_candidate["confidence"] > 0.85:
        # Check similarity
        if _text_similarity(ocr_text, top_candidate["text"]) > 0.8:
            return True, 0

    # Default: require review if confidence below threshold
    if top_candidate["confidence"] > 0.80:
        return True, 0

    return False, None


def _text_similarity(text1: str, text2: str) -> float:
    """Simple character-level similarity"""
    if not text1 or not text2:
        return 0.0

    # Normalize
    t1 = text1.strip().lower()
    t2 = text2.strip().lower()

    if t1 == t2:
        return 1.0

    # Character overlap
    chars1 = set(t1)
    chars2 = set(t2)

    intersection = len(chars1 & chars2)
    union = len(chars1 | chars2)

    if union == 0:
        return 0.0

    return intersection / union


def merge_nearby_issues(issues: List[dict], threshold: int = 20) -> List[dict]:
    """
    Merge issues that are very close together

    Args:
        issues: List of detected issues
        threshold: Pixel distance to consider "nearby"

    Returns:
        Merged issues list
    """
    if len(issues) <= 1:
        return issues

    merged = []
    used = set()

    for i, issue1 in enumerate(issues):
        if i in used:
            continue

        current = issue1.copy()

        for j, issue2 in enumerate(issues[i + 1:], i + 1):
            if j in used:
                continue

            # Check if bboxes are nearby
            if _bboxes_nearby(
                current,
                issue2,
                threshold
            ):
                # Merge
                current = _merge_two_issues(current, issue2)
                used.add(j)

        merged.append(current)
        used.add(i)

    return merged


def _bboxes_nearby(issue1: dict, issue2: dict, threshold: int) -> bool:
    """Check if two issue bboxes are within threshold distance"""
    # Get centers
    c1_x = issue1["bbox_x"] + issue1["bbox_width"] / 2
    c1_y = issue1["bbox_y"] + issue1["bbox_height"] / 2
    c2_x = issue2["bbox_x"] + issue2["bbox_width"] / 2
    c2_y = issue2["bbox_y"] + issue2["bbox_height"] / 2

    # Calculate edge distances
    h_dist = abs(c1_x - c2_x) - (issue1["bbox_width"] + issue2["bbox_width"]) / 2
    v_dist = abs(c1_y - c2_y) - (issue1["bbox_height"] + issue2["bbox_height"]) / 2

    return h_dist < threshold and v_dist < threshold


def _merge_two_issues(issue1: dict, issue2: dict) -> dict:
    """Merge two issues into one"""
    # Calculate combined bbox
    x1 = min(issue1["bbox_x"], issue2["bbox_x"])
    y1 = min(issue1["bbox_y"], issue2["bbox_y"])
    x2 = max(
        issue1["bbox_x"] + issue1["bbox_width"],
        issue2["bbox_x"] + issue2["bbox_width"]
    )
    y2 = max(
        issue1["bbox_y"] + issue1["bbox_height"],
        issue2["bbox_y"] + issue2["bbox_height"]
    )

    merged = issue1.copy()
    merged["bbox_x"] = x1
    merged["bbox_y"] = y1
    merged["bbox_width"] = x2 - x1
    merged["bbox_height"] = y2 - y1

    # Combine text
    merged["ocr_text"] = f"{issue1.get('ocr_text', '')} {issue2.get('ocr_text', '')}".strip()

    # Combine problems
    merged["detected_problems"] = list(set(
        issue1.get("detected_problems", []) +
        issue2.get("detected_problems", [])
    ))

    # Use lower confidence
    merged["confidence"] = min(
        issue1.get("confidence", 1.0),
        issue2.get("confidence", 1.0)
    )

    return merged
