# NOTEBOOKLM修正ツール 仕様書

## 概要

PDF/PPTX/画像ファイルのテキスト誤りをAI（Gemini）で修正するWebアプリ。
フロントエンドのみで完結するスタンドアロンモードと、バックエンド連携モードの2構成。

---

## アーキテクチャ

```
[ブラウザ]
  ├── Next.js 14 (App Router)
  ├── Zustand + localStorage (メタデータ永続化)
  ├── IndexedDB (画像データ永続化)
  └── Gemini API (Next.js API Route経由)

[オプション: バックエンド]
  ├── FastAPI + PostgreSQL
  ├── Celery + Redis (非同期タスク)
  └── Google Cloud Vision OCR
```

### データ保存先

| データ種別 | 保存先 | 理由 |
|---|---|---|
| プロジェクトメタ | localStorage (Zustand persist) | 軽量、高速 |
| ページ画像 | IndexedDB | localStorageの5-10MB制限回避 |
| 認証 | Supabase Auth | セッション管理 |
| クレジット | Supabase DB (`user_credits`) | サーバー側で原子的に管理 |

---

## ファイル構成

### フロントエンド (`frontend/src/`)

```
app/
  page.tsx              # ホーム画面（プロジェクト一覧 + アップロード）
  layout.tsx            # グローバルレイアウト
  globals.css           # グローバルCSS
  projects/[id]/page.tsx # エディタ画面
  api/gemini/route.ts   # Gemini APIプロキシ（クレジット管理）
  api/analyze-design/route.ts # デザイン分析API

components/
  Uploader.tsx          # ファイルアップロード（D&D対応）
  editor/
    Editor.tsx          # エディタ本体（状態管理の中枢）
    CanvasViewer.tsx    # Canvas表示（ズーム/パン/Issue/テキスト重ね）
    FixQueuePanel.tsx   # 右パネル（修正操作、AI候補、スタイル設定）
    PagesPanel.tsx      # 左パネル（ページサムネイル一覧）
    TopBar.tsx          # 上部バー（保存/Undo/Redo/書き出し）
    StatusBar.tsx       # 下部バー（進捗/ズーム）
    TextOverlayBox.tsx  # テキストオーバーレイ要素
    TextOverlayToolbar.tsx # テキストスタイル編集ツールバー
  panels/
    ExportPanel.tsx     # PDF書き出しモーダル
    IssuePanel.tsx      # Issue詳細パネル
  settings/
    ApiKeySettings.tsx  # APIキー設定
    UsageSettings.tsx   # 使用量表示
  auth/
    AuthForm.tsx        # ログイン/サインアップ
    AuthProvider.tsx    # 認証コンテキスト
  ui/
    Accordion, Badge, Button, Card, Progress, Tabs, Toast, Tooltip

lib/
  store.ts            # Zustand store（プロジェクト/Issue/TextOverlay）
  image-store.ts      # IndexedDB操作
  gemini.ts           # Gemini API呼び出し
  pdf-utils.ts        # PDF/PPTX/画像処理、テキスト描画
  api.ts              # バックエンドAPIクライアント（オプション）
  supabase.ts         # Supabase認証ヘルパー
  usage.ts            # 使用量管理
  utils.ts            # ユーティリティ（cn, formatDate等）

store/
  project.ts          # プロジェクトstore（API連携モード用）
```

### バックエンド (`backend/`) ※オプション

```
main.py               # FastAPIエントリーポイント
config.py             # 環境変数設定
api/
  projects.py         # プロジェクトCRUD + PDF変換
  pages.py            # ページ画像/OCR
  issues.py           # Issue検出/候補生成
  corrections.py      # 修正適用/Undo
  exports.py          # PDF/PPTX書き出し
db/
  database.py         # SQLAlchemy接続
  models.py           # ORM (Project/Page/Issue/Correction/Export)
services/
  pdf_service.py      # PDF→画像変換、ROI抽出
  ocr_service.py      # Google Cloud Vision OCR
  detection_service.py # 問題検出
  gemini_service.py   # Gemini API連携
  correction_service.py # 修正適用
  export_service.py   # エクスポート処理
```

---

## データモデル

### Project
```typescript
{
  id: string
  name: string
  fileName: string
  totalPages: number
  pages: PageMeta[]        // IndexedDBキー参照
  issues: Issue[]          // 修正対象の問題
  textOverlays: TextOverlay[] // ユーザー追加テキスト
  status: 'uploading' | 'processing' | 'ready' | 'completed'
  createdAt: string
  updatedAt: string
}
```

### Issue（修正対象）
```typescript
{
  id: string
  pageNumber: number
  bbox: { x, y, width, height }   // 画像座標系
  ocrText: string                  // OCR読み取り結果
  issueType: 'manual' | 'detected' | 'low_confidence' | 'garbled'
  editMode: 'text' | 'object'     // テキスト修正 or オブジェクト修正
  status: 'detected' | 'corrected' | 'skipped'
  correctedText?: string           // 修正後テキスト
  candidates?: Candidate[]         // AI候補
  confidence?: number
}
```

### TextOverlay（ユーザー追加テキスト）
```typescript
{
  id: string
  pageNumber: number
  bbox: { x, y, width, height }   // 画像座標系
  text: string
  fontSize: number
  fontFamily: string               // 'Noto Sans JP' 等
  fontWeight: 'normal' | 'bold'
  fontStyle: 'normal' | 'italic'
  textDecoration: 'none' | 'underline'
  textAlign: 'left' | 'center' | 'right'
  color: string                    // '#000000'
  backgroundColor: string          // 'transparent' or hex
}
```

### Candidate（AI修正候補）
```typescript
{
  text: string
  confidence: number    // 0-1
  reason?: string       // 根拠
}
```

---

## ユーザーフロー

### 1. アップロード
```
ファイル選択（D&D or ボタン）
  → PDF: pdfjs-distで2.0倍レンダリング
  → PPTX: pptx-rendererで1920px幅レンダリング
  → 画像: そのまま処理（複数可、最大20枚）
  → 各ページ → フル画像(PNG) + サムネ(150px, JPEG)
  → IndexedDBに保存
  → プロジェクト作成 → エディタ画面へ遷移
```

### 2. Issue作成（手動）
```
CanvasViewerで「範囲選択モード」(青ボタン) を選択
  → ドラッグで修正領域を囲む
  → Issue自動作成
  → Gemini Flash でOCR実行（1クレジット）
  → 読み取り結果がFixQueuePanelに表示
```

### 3. 修正適用
```
テキストモード:
  ユーザー入力 → 指示か置換テキストかAIが自動判別
  → 指示: 「この文字を消して」→ AI inpaint
  → 置換: 「正しいテキスト」→ AI inpaint

オブジェクトモード:
  ユーザー入力 → 常にAI inpaint
  → 「背景を明るくして」「ロゴを赤に変更」等

処理フロー:
  現在の画像をUndoスタックに保存
  → クレジット差引（10クレジット、原子的）
  → Gemini 3 Pro Imageで修正画像生成
  → 画像をIndexedDBに保存
  → Issue statusを 'corrected' に更新
  → 次の未解決Issueへ自動遷移
```

### 4. テキストオーバーレイ（手動テキスト追加）
```
CanvasViewerで「テキスト追加モード」(緑ボタン T) を選択
  → ドラッグでテキストボックス配置
  → ダブルクリックでテキスト編集
  → 選択時にスタイルツールバー表示
    → フォント/サイズ/太字/斜体/下線/揃え/色/背景色
  → ドラッグで移動、ハンドルでリサイズ
  → Zustand storeに永続化
```

### 5. PDF書き出し
```
TopBar「書き出し」→ ExportPanelモーダル
  → 全ページ画像をIndexedDBから読み込み
  → 各ページ:
    → TextOverlayがあればCanvas APIで画像に合成
    → jsPDFで画像をPDFに追加
  → PDFダウンロード（{プロジェクト名}_corrected.pdf）
```

---

## AI連携（Gemini API）

### 使用モデル
| 用途 | モデル | コスト |
|---|---|---|
| OCR/テキスト生成 | `gemini-2.0-flash` | 1クレジット |
| 画像修正(inpaint) | `gemini-3-pro-image-preview` | 10クレジット |

### 機能
| 操作 | 説明 |
|---|---|
| `ocrRegion()` | 選択領域のテキストをOCR（文字化け含めそのまま読み取り）|
| `generateCandidates()` | 3つの修正候補をJSON生成（信頼度スコア付き）|
| `inpaintImage()` | マスク領域を修正テキスト/指示で書き換え |
| `analyzeDesign()` | 配色/書体/レイアウトスタイルを分析 |

### Inpaint詳細
- 複数マスク同時修正対応
- リファレンスデザイン画像指定可能
- 出力サイズ: 1K / 2K / 4K
- 日本語テキスト最適化（大フォント、高コントラスト）
- リトライ: 3回、指数バックオフ（503/429エラー）

### クレジットシステム
- Supabase RPCで原子的に差引（`deduct_credits`）
- 失敗時自動返金（`refund_credits`）
- `request_id`による重複防止
- `generation_requests`テーブルで取引ログ

---

## キーボードショートカット

| キー | 動作 |
|---|---|
| `J` | 次のIssueへ |
| `K` | 前のIssueへ |
| `S` | スキップ |
| `Ctrl+S` | 保存 |
| `Ctrl+Z` | 元に戻す |
| `Ctrl+Shift+Z` / `Ctrl+Y` | やり直す |
| `U` | 元に戻す（代替） |
| `Z` | ズームイン (+25%) |
| `X` | ズームアウト (-25%) |
| `F` | 画面に合わせる |
| `Delete` | 選択中のIssue/テキストを削除 |
| `Escape` | テキスト編集終了 |
| `Ctrl+Enter` | 修正を適用（入力欄内） |

---

## Undo/Redo

| 項目 | 内容 |
|---|---|
| スタック | undoStack / redoStack（各最大20エントリ）|
| 保存内容 | `{ issueId, pageNumber, previousImageDataUrl }` |
| Undo時 | 画像復元 → Issue statusを `detected` に戻す |
| Redo時 | 画像再適用 → Issue statusを `corrected` に戻す |
| 制約 | TextOverlayの操作はUndo対象外（将来対応予定）|

---

## CanvasViewerモード

| モード | アイコン | 色 | 動作 |
|---|---|---|---|
| 選択 | MousePointer | グレー | 既存Issue/テキストをクリック |
| 範囲選択 | Square | 青 | ドラッグでIssue作成 |
| テキスト追加 | Type (T) | 緑 | ドラッグでテキストボックス配置 |

その他の操作:
- **パン**: Alt+ドラッグ or ミドルクリック
- **ズーム**: Ctrl+スクロール or ツールバーボタン

---

## 外部依存パッケージ（主要）

| パッケージ | バージョン | 用途 |
|---|---|---|
| next | 14.1.0 | Reactフレームワーク |
| react | 18.2.0 | UIライブラリ |
| zustand | 4.4.7 | 状態管理 |
| pdfjs-dist | 4.4.168 | PDF描画 |
| @kandiforge/pptx-renderer | 3.3.0 | PPTX描画 |
| jspdf | 4.1.0 | PDF生成 |
| jszip | 3.10.1 | ZIPファイル |
| @supabase/supabase-js | 2.94.1 | 認証・DB |
| lucide-react | 0.309.0 | アイコン |
| framer-motion | 10.18.0 | アニメーション |
| react-dropzone | 14.2.3 | ファイルD&D |
| tailwindcss | 3.4.1 | CSSフレームワーク |

---

## 環境変数

### フロントエンド (`.env.local`)
```
NEXT_PUBLIC_SUPABASE_URL=     # SupabaseプロジェクトURL
NEXT_PUBLIC_SUPABASE_ANON_KEY= # Supabase公開キー
GEMINI_API_KEY=                # Gemini APIキー（サーバーサイドのみ）
```

### Docker構成 (`docker-compose.yml`)
- PostgreSQL 15 (5432)
- Redis 7 (6379)
- FastAPI backend (8000)
- Celery worker
- Next.js frontend (3000)

---

## 画面構成

```
┌──────────────────────────────────────────────────────┐
│ TopBar [← プロジェクト名] [Undo][Redo][保存][書き出し] │
├────────┬──────────────────────────┬───────────────────┤
│        │                          │                   │
│ Pages  │     CanvasViewer         │   FixQueuePanel   │
│ Panel  │  (画像 + Issue枠 +      │  (Issue一覧 +     │
│        │   テキストオーバーレイ)   │   修正操作 +      │
│ サムネ │                          │   AI候補 +        │
│ 一覧   │  [選択][範囲][テキスト]  │   スタイル設定)   │
│        │  [- zoom% +] [fit]      │                   │
├────────┴──────────────────────────┴───────────────────┤
│ StatusBar [修正済み 3/10] [zoom controls]              │
└──────────────────────────────────────────────────────┘
```

---

*最終更新: 2026-02-11*
