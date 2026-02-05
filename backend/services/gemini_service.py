"""
Gemini Service - Text correction candidates and image editing
Includes thought signature management for Nano Banana Pro
"""
import json
import base64
import re
from typing import List, Optional, Tuple
from backend.config import settings


class GeminiService:
    """
    Gemini API service for text correction
    Uses Flash for candidate generation, Pro for image editing
    """

    def __init__(self):
        import google.generativeai as genai

        if settings.gemini_api_key:
            genai.configure(api_key=settings.gemini_api_key)

        self.genai = genai
        self.flash_model = None
        self.image_model = None

        # Thought signature management for image editing
        self.thought_signature: Optional[str] = None
        self.session_counter: int = 0
        self.max_retries: int = 3

    def _get_flash_model(self):
        """Lazy load Flash model"""
        if self.flash_model is None:
            self.flash_model = self.genai.GenerativeModel('gemini-1.5-flash')
        return self.flash_model

    def _get_image_model(self):
        """Lazy load image editing model (Nano Banana Pro)"""
        if self.image_model is None:
            # Gemini 2.0 Flash with image generation
            self.image_model = self.genai.GenerativeModel('gemini-2.0-flash-exp')
        return self.image_model

    def generate_candidates(
        self,
        roi_image: bytes,
        ocr_text: str,
        context_before: str = "",
        context_after: str = ""
    ) -> List[dict]:
        """
        Generate correction candidates using Gemini Flash

        Args:
            roi_image: ROI image bytes
            ocr_text: Current OCR text
            context_before: Text before the ROI
            context_after: Text after the ROI

        Returns:
            List of candidates: [{text, confidence, reason}, ...]
        """
        model = self._get_flash_model()

        prompt = f"""あなたはOCRの誤認識を修正するエキスパートです。

## 入力情報
- OCRで読み取ったテキスト: "{ocr_text}"
- 前の文脈: {context_before if context_before else "(なし)"}
- 後の文脈: {context_after if context_after else "(なし)"}

## タスク
添付の画像を見て、OCRテキストの正しい読み方を推定してください。
文字化け（�, □など）や誤認識があれば修正した候補を提示してください。

## ルール
1. 画像に写っているテキストを正確に読み取る
2. 文脈から意味が通るように修正する
3. 固有名詞や数値は慎重に扱う
4. 確信度は0.0〜1.0で評価

## 出力形式（JSON配列のみ、説明不要）
[
  {{"text": "修正候補1", "confidence": 0.95, "reason": "画像から明確に読み取れる"}},
  {{"text": "修正候補2", "confidence": 0.80, "reason": "文脈から推測"}},
  {{"text": "修正候補3", "confidence": 0.60, "reason": "可能性のある別解釈"}}
]
"""

        try:
            # Prepare image part
            image_part = {
                "mime_type": "image/png",
                "data": base64.b64encode(roi_image).decode('utf-8')
            }

            response = model.generate_content([prompt, image_part])

            # Parse JSON response
            return self._parse_candidates_response(response.text)

        except Exception as e:
            # Return fallback candidate on error
            return [{
                "text": ocr_text,
                "confidence": 0.5,
                "reason": f"Gemini API error: {str(e)}"
            }]

    def _parse_candidates_response(self, response_text: str) -> List[dict]:
        """Parse Gemini response to extract candidates"""
        # Try to extract JSON from response
        try:
            # Look for JSON array in response
            json_match = re.search(r'\[[\s\S]*\]', response_text)
            if json_match:
                candidates = json.loads(json_match.group())

                # Validate and normalize
                valid_candidates = []
                for c in candidates:
                    if isinstance(c, dict) and "text" in c:
                        valid_candidates.append({
                            "text": str(c.get("text", "")),
                            "confidence": float(c.get("confidence", 0.5)),
                            "reason": str(c.get("reason", ""))
                        })

                if valid_candidates:
                    # Sort by confidence
                    return sorted(valid_candidates, key=lambda x: x["confidence"], reverse=True)

        except (json.JSONDecodeError, ValueError) as e:
            pass

        # Fallback: return original text as candidate
        return [{
            "text": response_text.strip()[:200],  # Truncate if too long
            "confidence": 0.5,
            "reason": "Could not parse structured response"
        }]


class GeminiImageEditor:
    """
    Gemini Image Editor for ROI patch regeneration
    Manages thought signature for session continuity
    """

    def __init__(self):
        import google.generativeai as genai

        if settings.gemini_api_key:
            genai.configure(api_key=settings.gemini_api_key)

        self.genai = genai
        self.model = None
        self.thought_signature: Optional[str] = None
        self.retry_count: int = 0
        self.max_retries: int = 3

    def _get_model(self):
        """Lazy load image model"""
        if self.model is None:
            # Use Gemini 2.0 Flash with image generation capability
            self.model = self.genai.GenerativeModel(
                'gemini-2.0-flash-exp',
                generation_config={
                    "response_modalities": ["text", "image"]
                }
            )
        return self.model

    def edit_roi_patch(
        self,
        roi_image: bytes,
        original_text: str,
        corrected_text: str,
        margin: int = 40
    ) -> Tuple[Optional[bytes], str]:
        """
        Edit ROI patch to correct text while preserving design

        Args:
            roi_image: ROI image with margin
            original_text: Original (incorrect) text
            corrected_text: Corrected text to replace with
            margin: Margin around the text area

        Returns:
            (edited_image_bytes, status_message)
            edited_image_bytes is None if editing failed
        """
        prompt = f"""この画像内のテキストを修正してください。

【変更内容】
変更前: "{original_text}"
変更後: "{corrected_text}"

【絶対に守るルール】
1. デザイン、レイアウト、背景、フォントスタイルは完全に維持
2. 文字の内容だけを変更
3. 指定された箇所以外は一切変更しない
4. 画像全体を再生成しない - 文字部分のみ編集

【出力】
修正後の画像のみを出力してください。"""

        model = self._get_model()

        for attempt in range(self.max_retries):
            try:
                image_part = {
                    "mime_type": "image/png",
                    "data": base64.b64encode(roi_image).decode('utf-8')
                }

                response = model.generate_content([prompt, image_part])

                # Try to extract image from response
                for part in response.parts:
                    if hasattr(part, 'inline_data') and part.inline_data:
                        # Found image data
                        image_data = part.inline_data.data
                        if isinstance(image_data, str):
                            image_data = base64.b64decode(image_data)
                        return image_data, "success"

                # No image in response
                return None, "No image in Gemini response"

            except Exception as e:
                error_msg = str(e).lower()

                # Check for thought signature errors
                if "thought" in error_msg or "signature" in error_msg:
                    self.thought_signature = None
                    self.retry_count += 1
                    continue

                # Check for rate limiting
                if "rate" in error_msg or "quota" in error_msg:
                    return None, f"Rate limited: {str(e)}"

                # Other errors
                if attempt == self.max_retries - 1:
                    return None, f"Gemini error after {self.max_retries} attempts: {str(e)}"

        return None, "Max retries exceeded"

    def reset_session(self):
        """Reset thought signature for new session"""
        self.thought_signature = None
        self.retry_count = 0


# Singleton instances
_gemini_service: Optional[GeminiService] = None
_gemini_editor: Optional[GeminiImageEditor] = None


def get_gemini_service() -> GeminiService:
    """Get Gemini service singleton"""
    global _gemini_service
    if _gemini_service is None:
        _gemini_service = GeminiService()
    return _gemini_service


def get_gemini_editor() -> GeminiImageEditor:
    """Get Gemini image editor singleton"""
    global _gemini_editor
    if _gemini_editor is None:
        _gemini_editor = GeminiImageEditor()
    return _gemini_editor
