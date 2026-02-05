# NotebookLM修正ツール MVP計画書

## 1. Overview

NotebookLM等で生成されたPDF資料（主に画像焼き込み）を対象に、文字化け・小さい/ぼやけ文字を**自動検出**し、**ROI（領域）単位**で修正して、修正済みPDFとPPTX（画像スライド）を出力するWebアプリケーション。

### 核心原則
- **ページ全体の再生成は禁止**：ROIパッチ（周辺マージン付き）のみを編集
- **人間の意思決定を最小化**：自動検出→自動修正案→自動適用（危険度高い場合のみ保留）
- **必ず完了できるフォールバック**：AI失敗時も背景塗りつぶし＋テキスト合成で対応

---

## 2. MVP Scope

### 含むもの（In Scope）
| ID | 機能 | 説明 |
|----|------|------|
| A | PDFアップロード | ページ画像化(300dpi)、サムネ生成、プロジェクト保存 |
| B | PDFビューアUI | サムネ一覧、ズーム/パン、ROIドラッグ選択、Issue Box表示 |
| C | OCR | Google Cloud Vision Document Text Detection、bbox+confidence取得 |
| D | 自動検出 | 低confidence、文字化け(�□)、短文/欠落をIssue Boxとして生成 |
| E | 自動修正 | Gemini Flash/Proで正しい文字列候補生成、自動採用ルール適用 |
| F | 修正適用 | 方式1:背景塗りつぶし+テキスト合成、方式2:Nano Banana Pro ROIパッチ |
| G | 出力 | 修正済みPDF、PPTX（1ページ=1スライド画像） |
| H | Undo/履歴 | ROIごとのbefore/after保存、戻し機能 |

### 含まないもの（Out of Scope - V2以降）
- 編集可能PPTX化（全要素分解）
- マルチテナント/課金/高度権限
- 内容校閲AI（文章の意味的チェック）
- Document AI統合（抽象化のみ実装）

---

## 3. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend (Next.js)                       │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐ │
│  │ Upload   │  │ Viewer   │  │ Issue    │  │ Export           │ │
│  │ Panel    │  │ + ROI    │  │ Panel    │  │ Panel            │ │
│  └──────────┘  └──────────┘  └──────────┘  └──────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              │ REST API
┌─────────────────────────────────────────────────────────────────┐
│                         Backend (FastAPI)                        │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐ │
│  │ Projects │  │ Pages    │  │ Issues   │  │ Corrections      │ │
│  │ API      │  │ API      │  │ API      │  │ API              │ │
│  └──────────┘  └──────────┘  └──────────┘  └──────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
          │                              │
          ▼                              ▼
┌─────────────────┐           ┌─────────────────────────────────┐
│   PostgreSQL    │           │      Celery + Redis             │
│   - projects    │           │  ┌───────────┐ ┌─────────────┐  │
│   - pages       │           │  │ OCR Task  │ │ Correction  │  │
│   - issues      │           │  │           │ │ Task        │  │
│   - corrections │           │  └───────────┘ └─────────────┘  │
│   - history     │           │  ┌───────────┐ ┌─────────────┐  │
└─────────────────┘           │  │ Export    │ │ Detection   │  │
          │                   │  │ Task      │ │ Task        │  │
          ▼                   │  └───────────┘ └─────────────┘  │
┌─────────────────┐           └─────────────────────────────────┘
│   Storage       │                        │
│   (Local/S3)    │◄───────────────────────┘
│   - originals/  │
│   - pages/      │
│   - patches/    │
│   - exports/    │
└─────────────────┘
          │
          ▼
┌─────────────────────────────────────────┐
│           External Services             │
│  ┌─────────────┐  ┌──────────────────┐  │
│  │ Google      │  │ Gemini API       │  │
│  │ Vision OCR  │  │ (Flash/Pro)      │  │
│  └─────────────┘  └──────────────────┘  │
└─────────────────────────────────────────┘
```

### ディレクトリ構成
```
/
├── frontend/               # Next.js App Router
│   ├── app/
│   │   ├── page.tsx        # Home/Upload
│   │   ├── projects/
│   │   │   └── [id]/
│   │   │       └── page.tsx  # Viewer
│   │   └── api/            # BFF routes (optional)
│   ├── components/
│   │   ├── Uploader.tsx
│   │   ├── Viewer/
│   │   │   ├── Canvas.tsx
│   │   │   ├── Thumbnails.tsx
│   │   │   └── ROISelector.tsx
│   │   ├── IssuePanel/
│   │   └── ExportPanel/
│   └── lib/
│       └── api.ts
│
├── backend/                # FastAPI
│   ├── main.py
│   ├── api/
│   │   ├── projects.py
│   │   ├── pages.py
│   │   ├── issues.py
│   │   └── corrections.py
│   ├── models/
│   │   └── schemas.py
│   ├── db/
│   │   ├── database.py
│   │   └── models.py
│   ├── services/
│   │   ├── pdf_service.py
│   │   ├── ocr_service.py
│   │   ├── detection_service.py
│   │   ├── correction_service.py
│   │   ├── gemini_service.py
│   │   └── export_service.py
│   └── storage/
│       └── storage.py
│
├── worker/                 # Celery Worker
│   ├── celery_app.py
│   └── tasks/
│       ├── ocr_task.py
│       ├── detection_task.py
│       ├── correction_task.py
│       └── export_task.py
│
├── shared/                 # 共通型定義
│   └── types.py
│
├── scripts/
│   ├── demo.sh
│   └── sample.pdf
│
├── docker-compose.yml
├── .env.example
├── plan.md
└── README.md
```

---

## 4. Data Model

### PostgreSQL Tables

```sql
-- プロジェクト
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    original_filename VARCHAR(255) NOT NULL,
    original_path VARCHAR(500) NOT NULL,
    total_pages INTEGER NOT NULL,
    status VARCHAR(50) DEFAULT 'uploaded',  -- uploaded, processing, ready, exporting, completed
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- ページ
CREATE TABLE pages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    page_number INTEGER NOT NULL,
    image_path VARCHAR(500) NOT NULL,       -- 300dpi画像
    thumbnail_path VARCHAR(500) NOT NULL,   -- サムネイル
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    ocr_status VARCHAR(50) DEFAULT 'pending', -- pending, processing, completed, failed
    ocr_result JSONB,                        -- Vision API結果
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(project_id, page_number)
);

-- Issue（自動検出された問題領域）
CREATE TABLE issues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    page_id UUID REFERENCES pages(id) ON DELETE CASCADE,
    bbox_x INTEGER NOT NULL,
    bbox_y INTEGER NOT NULL,
    bbox_width INTEGER NOT NULL,
    bbox_height INTEGER NOT NULL,
    issue_type VARCHAR(50) NOT NULL,        -- low_confidence, garbled, missing
    confidence FLOAT,
    ocr_text TEXT,
    detected_problems TEXT[],               -- ['�', '□', ...]
    status VARCHAR(50) DEFAULT 'detected',  -- detected, reviewing, corrected, skipped
    auto_correctable BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 修正履歴
CREATE TABLE corrections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    issue_id UUID REFERENCES issues(id) ON DELETE CASCADE,
    correction_method VARCHAR(50) NOT NULL, -- text_overlay, nano_banana
    original_text TEXT,
    corrected_text TEXT,
    candidates JSONB,                       -- [{text, confidence, reason}, ...]
    selected_candidate_index INTEGER,
    patch_before_path VARCHAR(500),
    patch_after_path VARCHAR(500),
    applied BOOLEAN DEFAULT FALSE,
    applied_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 出力履歴
CREATE TABLE exports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    export_type VARCHAR(50) NOT NULL,       -- pdf, pptx
    file_path VARCHAR(500),
    status VARCHAR(50) DEFAULT 'pending',   -- pending, processing, completed, failed
    created_at TIMESTAMP DEFAULT NOW()
);
```

### Pydantic Schemas

```python
# 主要スキーマ
class BBox(BaseModel):
    x: int
    y: int
    width: int
    height: int

class IssueCandidate(BaseModel):
    text: str
    confidence: float
    reason: str

class ProjectCreate(BaseModel):
    name: str

class ProjectResponse(BaseModel):
    id: UUID
    name: str
    total_pages: int
    status: str
    created_at: datetime

class IssueResponse(BaseModel):
    id: UUID
    page_number: int
    bbox: BBox
    issue_type: str
    ocr_text: Optional[str]
    detected_problems: List[str]
    status: str
    auto_correctable: bool
    candidates: Optional[List[IssueCandidate]]

class CorrectionRequest(BaseModel):
    issue_id: UUID
    method: str  # text_overlay | nano_banana
    selected_text: Optional[str]
    selected_candidate_index: Optional[int]
```

---

## 5. API Endpoints

### Projects API
| Method | Endpoint | 説明 |
|--------|----------|------|
| POST | `/api/projects/upload` | PDFアップロード、プロジェクト作成 |
| GET | `/api/projects` | プロジェクト一覧 |
| GET | `/api/projects/{id}` | プロジェクト詳細 |
| DELETE | `/api/projects/{id}` | プロジェクト削除 |

### Pages API
| Method | Endpoint | 説明 |
|--------|----------|------|
| GET | `/api/projects/{id}/pages` | ページ一覧（サムネURL含む） |
| GET | `/api/projects/{id}/pages/{num}` | ページ詳細（OCR結果含む） |
| GET | `/api/projects/{id}/pages/{num}/image` | ページ画像取得 |

### Issues API
| Method | Endpoint | 説明 |
|--------|----------|------|
| GET | `/api/projects/{id}/issues` | Issue一覧 |
| GET | `/api/issues/{id}` | Issue詳細（候補含む） |
| POST | `/api/issues/{id}/generate-candidates` | Geminiで候補生成 |
| PUT | `/api/issues/{id}/status` | ステータス更新 |

### Corrections API
| Method | Endpoint | 説明 |
|--------|----------|------|
| POST | `/api/corrections` | 修正適用 |
| POST | `/api/corrections/{id}/undo` | Undo |
| GET | `/api/issues/{id}/history` | 修正履歴 |

### Export API
| Method | Endpoint | 説明 |
|--------|----------|------|
| POST | `/api/projects/{id}/export/pdf` | PDF出力開始 |
| POST | `/api/projects/{id}/export/pptx` | PPTX出力開始 |
| GET | `/api/exports/{id}` | 出力ステータス確認 |
| GET | `/api/exports/{id}/download` | ダウンロード |

### Job Status API
| Method | Endpoint | 説明 |
|--------|----------|------|
| GET | `/api/jobs/{task_id}` | Celeryタスク状態確認 |

---

## 6. Job Pipeline

### 6.1 アップロード→OCR→検出パイプライン

```
[Upload PDF]
     │
     ▼
[pdf_to_images task]
     │ pymupdf: 各ページを300dpi PNG化
     │ サムネイル生成(150px幅)
     ▼
[ocr_page task] × N pages (並列)
     │ Google Vision Document Text Detection
     │ bbox, text, confidence保存
     ▼
[detect_issues task]
     │ 低confidence領域抽出
     │ 文字化け検出（�, □, 不自然パターン）
     │ Issue Box生成
     ▼
[Ready for Review]
```

### 6.2 修正パイプライン

```
[Issue Selected]
     │
     ▼
[generate_candidates task]
     │ ROI画像抽出（マージン+40px）
     │ 周辺文脈取得（同ページ前後行）
     │ Gemini Flash → 候補3つ生成
     │ 自動採用ルール評価
     │
     ├─[Auto-adopt]──────────────────┐
     │                               │
     └─[Review Required]─┐          │
                         ▼          ▼
              [User Selection] [apply_correction task]
                         │          │
                         └──────────┘
                                │
                    ┌───────────┴───────────┐
                    ▼                       ▼
         [text_overlay method]    [nano_banana method]
         │ 背景塗りつぶし          │ Gemini Pro Image
         │ テキスト合成            │ ROIパッチ再生成
         │ (フォールバック)        │ (thought signature管理)
         └───────────┬─────────────┘
                     ▼
              [Patch Applied]
              │ before/after保存
              │ ページ画像更新
              ▼
              [Ready for Export]
```

### 6.3 出力パイプライン

```
[Export Request]
     │
     ├─[PDF]────────────────────────┐
     │                              ▼
     │                    [merge_to_pdf task]
     │                    │ 修正済みページ画像収集
     │                    │ pikepdf/reportlab
     │                    ▼
     │                    [PDF Ready]
     │
     └─[PPTX]───────────────────────┐
                                    ▼
                          [create_pptx task]
                          │ python-pptx
                          │ 1ページ=1スライド画像
                          ▼
                          [PPTX Ready]
```

---

## 7. UI Screens

### 7.1 ホーム/アップロード画面

```
┌─────────────────────────────────────────────────────────────┐
│  NotebookLM 修正ツール                              [履歴]  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│     ┌─────────────────────────────────────────────┐        │
│     │                                             │        │
│     │        📄 PDFをドロップ                     │        │
│     │           または                            │        │
│     │        [ファイルを選択]                     │        │
│     │                                             │        │
│     └─────────────────────────────────────────────┘        │
│                                                             │
│  最近のプロジェクト:                                        │
│  ┌────────┐ ┌────────┐ ┌────────┐                          │
│  │ Doc1   │ │ Doc2   │ │ Doc3   │                          │
│  │ 12頁   │ │ 8頁    │ │ 24頁   │                          │
│  └────────┘ └────────┘ └────────┘                          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 7.2 ビューア/修正画面

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Project: Report.pdf                    [PDF出力] [PPTX出力] [設定]     │
├───────────┬───────────────────────────────────────┬─────────────────────┤
│ サムネイル │            メインビューア              │    自動修正パネル   │
│           │                                        │                     │
│ ┌───────┐ │  ┌──────────────────────────────────┐ │  Issue 1/12         │
│ │  1    │ │  │                                  │ │  ┌───────────────┐  │
│ │ [!]   │ │  │     ページ内容表示               │ │  │ OCR: "株式��社"│  │
│ └───────┘ │  │                                  │ │  └───────────────┘  │
│ ┌───────┐ │  │  ┌──────────┐                    │ │                     │
│ │  2    │ │  │  │Issue Box │ ← ROI選択可能     │ │  候補:              │
│ │       │ │  │  │  点線    │                    │ │  ● 株式会社 (95%)  │
│ └───────┘ │  │  └──────────┘                    │ │  ○ 株式合社 (80%)  │
│ ┌───────┐ │  │                                  │ │  ○ 株式總社 (60%)  │
│ │  3    │ │  │                                  │ │                     │
│ │ [!]   │ │  └──────────────────────────────────┘ │  [自動適用]         │
│ └───────┘ │                                        │  ─────────────────  │
│           │  [−] [100%] [+]  [Pan/Select切替]     │  [適用して次へ] ▶   │
│ ...       │                                        │  [スキップ]         │
│           │                                        │  [手動入力]         │
└───────────┴───────────────────────────────────────┴─────────────────────┘
```

### 7.3 自動修正フロー（ユーザー操作最小化）

```
通常フロー（自動採用可能な場合）:
1. Issueリスト自動生成
2. 各Issueに対して候補自動生成
3. confidence高い → 自動適用 → 次へ自動遷移
4. ユーザーは「次へ」を押すだけ

保留フロー（自動採用不可の場合）:
1. 候補3つ表示 + 根拠表示
2. ユーザーが選択 or 手動入力
3. 適用 → 次へ
```

---

## 8. Gemini/OCR Integration Notes

### 8.1 Google Cloud Vision OCR

```python
# ocr_service.py
from google.cloud import vision

def ocr_page(image_path: str) -> dict:
    """
    Document Text Detection を使用
    戻り値: {
        "full_text": str,
        "blocks": [
            {
                "text": str,
                "bbox": {"x", "y", "width", "height"},
                "confidence": float,
                "words": [...]
            }
        ]
    }
    """
    client = vision.ImageAnnotatorClient()
    with open(image_path, 'rb') as f:
        content = f.read()

    image = vision.Image(content=content)
    response = client.document_text_detection(image=image)

    # confidence, bbox, textを構造化して返却
    return parse_vision_response(response)
```

### 8.2 Gemini Flash - 候補生成

```python
# gemini_service.py
import google.generativeai as genai

def generate_candidates(
    roi_image: bytes,
    ocr_text: str,
    context_before: str,
    context_after: str
) -> list[dict]:
    """
    ROI画像 + OCRテキスト + 文脈から正しい文字列候補を生成
    """
    model = genai.GenerativeModel('gemini-1.5-flash')

    prompt = f"""
あなたはOCRの誤認識を修正するエキスパートです。

## 入力情報
- OCRで読み取ったテキスト: "{ocr_text}"
- 前後の文脈:
  前: {context_before}
  後: {context_after}

## タスク
画像を見て、OCRテキストの正しい読み方を推定してください。
文字化け（�, □など）や誤認識を修正した候補を3つ、
確信度とともに出力してください。

## 出力形式（JSON）
[
  {{"text": "修正候補1", "confidence": 0.95, "reason": "理由"}},
  {{"text": "修正候補2", "confidence": 0.80, "reason": "理由"}},
  {{"text": "修正候補3", "confidence": 0.60, "reason": "理由"}}
]
"""

    response = model.generate_content([
        prompt,
        {"mime_type": "image/png", "data": roi_image}
    ])

    return parse_candidates(response.text)
```

### 8.3 Nano Banana Pro (Gemini 3 Pro Image Preview) - ROIパッチ再生成

**重要: Thought Signature管理**

Gemini 3の画像編集モードでは、セッション内で「thought signature」を循環管理する必要がある可能性があります。

```python
# gemini_service.py
class GeminiImageEditor:
    """
    Nano Banana Pro (Gemini 3 Pro Image Preview) を使った画像編集
    Thought signature の循環管理を実装
    """

    def __init__(self):
        self.model = genai.GenerativeModel('gemini-2.0-flash-preview-image-generation')
        self.thought_signature: Optional[str] = None
        self.session_id: Optional[str] = None

    def edit_roi_patch(
        self,
        roi_image: bytes,
        original_text: str,
        corrected_text: str,
        margin: int = 40
    ) -> bytes:
        """
        ROIパッチの文字だけを修正し、デザインは維持

        Args:
            roi_image: マージン付きROI画像
            original_text: 元のOCRテキスト
            corrected_text: 修正後テキスト
            margin: 周辺マージン（px）

        Returns:
            修正済みROI画像
        """
        prompt = f"""
この画像内のテキストを修正してください。

【絶対ルール】
- デザイン、レイアウト、背景、フォントスタイルは完全に維持
- 文字の内容だけを変更
- 変更箇所: "{original_text}" → "{corrected_text}"

【禁止事項】
- 画像全体の再生成
- デザインの変更
- 指定箇所以外のテキスト変更
"""

        # Thought signature を含めてリクエスト
        generation_config = {
            "response_modalities": ["image", "text"],
        }

        if self.thought_signature:
            generation_config["thought_signature"] = self.thought_signature

        try:
            response = self.model.generate_content(
                [prompt, {"mime_type": "image/png", "data": roi_image}],
                generation_config=generation_config
            )

            # 新しい thought signature を保存
            if hasattr(response, 'thought_signature'):
                self.thought_signature = response.thought_signature

            # 画像を抽出
            for part in response.parts:
                if hasattr(part, 'inline_data'):
                    return part.inline_data.data

            raise ValueError("No image in response")

        except Exception as e:
            # Thought signature エラーの場合、リセットして再試行
            if "thought" in str(e).lower() or "signature" in str(e).lower():
                self.thought_signature = None
                return self.edit_roi_patch(roi_image, original_text, corrected_text, margin)
            raise

    def reset_session(self):
        """セッションをリセット"""
        self.thought_signature = None
        self.session_id = None
```

### 8.4 フォールバック: テキスト合成方式

```python
# correction_service.py
from PIL import Image, ImageDraw, ImageFont

def apply_text_overlay(
    roi_image: Image,
    bbox: dict,
    corrected_text: str,
    font_path: str = None
) -> Image:
    """
    背景塗りつぶし + テキスト描画によるフォールバック修正

    Nano Banana Pro が失敗した場合に使用
    """
    img = roi_image.copy()
    draw = ImageDraw.Draw(img)

    # 1. 背景色を推定（周辺ピクセルから）
    bg_color = estimate_background_color(img, bbox)

    # 2. テキスト領域を背景色で塗りつぶし
    draw.rectangle(
        [bbox['x'], bbox['y'],
         bbox['x'] + bbox['width'], bbox['y'] + bbox['height']],
        fill=bg_color
    )

    # 3. フォントサイズを推定
    font_size = estimate_font_size(bbox['height'])
    font = ImageFont.truetype(font_path or "NotoSansJP-Regular.otf", font_size)

    # 4. テキスト描画
    text_color = estimate_text_color(roi_image, bbox)
    draw.text(
        (bbox['x'], bbox['y']),
        corrected_text,
        font=font,
        fill=text_color
    )

    return img
```

### 8.5 自動採用ルール

```python
# detection_service.py

def evaluate_auto_adopt(
    ocr_text: str,
    candidates: list[dict],
    ocr_confidence: float
) -> tuple[bool, Optional[int]]:
    """
    自動採用可能かどうかを判定

    Returns:
        (auto_adoptable, selected_index)
    """
    # ルール1: OCR信頼度が十分高く、候補が一致
    if ocr_confidence > 0.9 and len(candidates) > 0:
        if candidates[0]['confidence'] > 0.9:
            if candidates[0]['text'] == ocr_text:
                return True, 0

    # ルール2: 文字化けが除去され、候補の信頼度が高い
    garbled_chars = {'�', '□', '■', '?'}
    if any(c in ocr_text for c in garbled_chars):
        if len(candidates) > 0 and candidates[0]['confidence'] > 0.85:
            if not any(c in candidates[0]['text'] for c in garbled_chars):
                return True, 0

    # ルール3: 固有名詞っぽい場合は保留
    if looks_like_proper_noun(candidates[0]['text'] if candidates else ocr_text):
        return False, None

    # ルール4: 候補が割れている場合は保留
    if len(candidates) >= 2:
        if candidates[0]['confidence'] - candidates[1]['confidence'] < 0.15:
            return False, None

    # ルール5: 数値/URL/メールは保留
    if contains_sensitive_pattern(ocr_text):
        return False, None

    # デフォルト: 最高候補が80%以上なら自動採用
    if len(candidates) > 0 and candidates[0]['confidence'] > 0.8:
        return True, 0

    return False, None


def looks_like_proper_noun(text: str) -> bool:
    """固有名詞っぽいかチェック"""
    # カタカナのみ、漢字のみで短い、など
    import re
    if re.match(r'^[ァ-ヶー]+$', text) and len(text) <= 10:
        return True
    if re.match(r'^[一-龥]+$', text) and len(text) <= 4:
        return True
    return False


def contains_sensitive_pattern(text: str) -> bool:
    """数値/URL/メールなど自動修正すべきでないパターン"""
    import re
    patterns = [
        r'\d{3,}',  # 3桁以上の数字
        r'https?://',  # URL
        r'[\w.-]+@[\w.-]+',  # メール
        r'\d{4}[-/]\d{1,2}[-/]\d{1,2}',  # 日付
    ]
    return any(re.search(p, text) for p in patterns)
```

---

## 9. Risks & Mitigations

| リスク | 影響 | 対策 |
|--------|------|------|
| Gemini APIレート制限 | 大量ページで処理停止 | 指数バックオフ、キュー制御、バッチ処理 |
| Thought signature 管理失敗 | 画像編集不可 | 自動リセット機構、テキスト合成フォールバック |
| ページ全体再生成の誤発生 | 品質低下、コスト爆発 | ROIサイズ上限(500x500px)、プロンプトでの明示禁止 |
| OCR精度不足 | 検出漏れ | 複数の検出ルール組み合わせ、手動ROI選択UI |
| フォント推定失敗 | テキスト合成の品質低下 | 複数フォント候補、ユーザー選択オプション |
| コスト超過 | 予算オーバー | ページ数上限、ROI数上限、Flash優先 |

### コスト制御パラメータ

```python
# config.py
MAX_PAGES_PER_PROJECT = 100
MAX_ISSUES_PER_PAGE = 20
MAX_ROI_SIZE = (500, 500)  # px
GEMINI_FLASH_FIRST = True  # Pro は必要時のみ
BATCH_SIZE_OCR = 10  # 並列OCR数
```

---

## 10. Milestones

### Day 1: 基盤構築
- [x] リポジトリ構成作成
- [ ] Docker Compose 環境構築（Postgres, Redis）
- [ ] FastAPI基本セットアップ
- [ ] Next.js基本セットアップ
- [ ] PDFアップロード→ページ画像化（pymupdf）
- [ ] サムネイル生成
- [ ] 画像ストレージ（ローカル）
- [ ] 基本UI（アップロード、サムネ一覧）

### Day 3: OCR + 検出 + 基本修正
- [ ] Celery Worker セットアップ
- [ ] Google Vision OCR統合
- [ ] Issue Box 自動検出ロジック
- [ ] ビューアUI（ズーム/パン、Issue Box表示）
- [ ] Gemini Flash 候補生成
- [ ] 自動採用ルール実装
- [ ] テキスト合成方式での修正適用

### Day 7: 完成 + デモ
- [ ] Nano Banana Pro 統合（thought signature管理）
- [ ] ROI選択UI
- [ ] Undo/履歴機能
- [ ] PDF出力
- [ ] PPTX出力
- [ ] エンドツーエンドデモ
- [ ] エラーハンドリング強化
- [ ] README完成

---

## Appendix: 環境変数一覧

```bash
# .env.example

# Google Cloud
GOOGLE_CLOUD_PROJECT=your-project-id
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json

# Gemini
GEMINI_API_KEY=your-gemini-api-key

# Storage
STORAGE_MODE=local  # local | s3 | gcs
STORAGE_BUCKET=your-bucket-name
STORAGE_PATH=/app/storage  # ローカル時のパス

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/notebooklm_fixer

# Redis
REDIS_URL=redis://localhost:6379/0

# App
MAX_PAGES_PER_PROJECT=100
MAX_ISSUES_PER_PAGE=20
```
