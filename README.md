# NotebookLM 修正ツール

NotebookLM等で生成されたPDF資料の文字化け・ぼやけ文字を**自動検出・自動修正**するWebアプリケーションです。

## 主な特徴

- **ROI（領域）単位での修正**: ページ全体を再生成せず、問題箇所のみをパッチ
- **AI自動検出**: OCR信頼度 + 文字化けパターン（�, □）を自動検出
- **2つの修正方式**:
  - テキスト合成（フォールバック）: 背景塗りつぶし + フォント描画
  - Gemini AI画像編集: Gemini 2.0 Flash による画像生成
- **自動採用ルール**: 高信頼度の候補は自動適用、不確実な場合のみ人間が判断
- **出力**: 修正済みPDF / PPTX（1ページ=1スライド画像）

## 🚀 クイックスタート（フロントエンドのみ）

バックエンド不要で、ブラウザのみで動作するモードです。

### 1. セットアップ

```bash
cd frontend
npm install
npm run dev
```

### 2. アクセス

http://localhost:3000 を開く

### 3. APIキー設定

1. 右上の「設定」アイコンをクリック
2. [Google AI Studio](https://aistudio.google.com/app/apikey) でGemini APIキーを取得
3. APIキーを入力して保存

**重要**: APIキーはブラウザのローカルストレージにのみ保存されます。サーバーには送信されません。

### 4. 使い方

1. PDFファイルをドラッグ＆ドロップ
2. 自動でページが画像化される
3. 問題箇所を範囲選択（ドラッグ）して Issue を追加
4. 「AI候補を生成」で修正候補を取得
5. 「適用して次へ」で修正を適用
6. 「出力」ボタンで修正済みPDF/PPTXをダウンロード

## 💰 料金について

このツールはGemini APIを使用します。API使用料は各自のGoogleアカウントに請求されます。

| 機能 | モデル | 料金目安 |
|------|--------|----------|
| テキスト候補生成 | Gemini 2.0 Flash | ~$0.075/100万トークン |
| AI画像生成 | Gemini 2.0 Flash | ~$0.04/枚 |

※ 料金は変更される可能性があります。最新情報は[Google公式ドキュメント](https://ai.google.dev/pricing)をご確認ください。

## キーボードショートカット

| キー | 動作 |
|------|------|
| `Enter` | 適用して次へ |
| `J` | 次のIssue |
| `K` | 前のIssue |
| `E` | 手動入力モード |
| `S` | スキップ |
| `U` | Undo |
| `Z` | ズームイン |
| `X` | ズームアウト |
| `F` | フィット |

## アーキテクチャ

### フロントエンドのみモード（推奨）

```
Frontend (Next.js 14)
    ↓ ローカルストレージ
PDF.js (ブラウザ内PDF処理)
    ↓
Gemini API (直接呼び出し)
    ↓
jsPDF / pptxgenjs (ブラウザ内エクスポート)
```

### フルスタックモード（オプション）

```
Frontend (Next.js 14)
    ↓ REST API
Backend (FastAPI)
    ↓
Celery + Redis (非同期ジョブ)
    ↓
PostgreSQL + Storage (Local/S3)
    ↓
Google Cloud Vision OCR + Gemini API
```

## フルスタック開発セットアップ

バックエンドを使用する場合の設定です。

### 前提条件

- Docker & Docker Compose
- Node.js 18+
- Python 3.11+
- Google Cloud サービスアカウント（Vision API有効化）
- Gemini API キー

### 1. 環境変数の設定

```bash
cp .env.example .env
# .env を編集して各種キーを設定
```

必須の環境変数:
```env
GOOGLE_CLOUD_PROJECT=your-project-id
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
GEMINI_API_KEY=your-gemini-api-key
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/notebooklm_fixer
REDIS_URL=redis://localhost:6379/0
```

### 2. Docker Compose で起動

```bash
# 全サービスを起動
docker-compose up -d

# ログを確認
docker-compose logs -f
```

### 3. 個別に起動（開発時）

```bash
# Postgres & Redis
docker-compose up -d postgres redis

# Backend
cd backend
pip install -r requirements.txt
uvicorn backend.main:app --reload --port 8000

# Worker
cd worker
celery -A worker.celery_app worker --loglevel=info

# Frontend
cd frontend
npm install
npm run dev
```

### 4. アクセス

- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- API Docs: http://localhost:8000/docs

## 技術スタック

### フロントエンド
- **Framework**: Next.js 14 (App Router)
- **UI**: React, TailwindCSS
- **状態管理**: Zustand + localStorage
- **PDF処理**: PDF.js (ブラウザ内)
- **エクスポート**: jsPDF, pptxgenjs

### バックエンド（オプション）
- **API**: FastAPI, SQLAlchemy, Pydantic
- **Worker**: Celery, Redis
- **Database**: PostgreSQL / SQLite
- **PDF処理**: PyMuPDF, ReportLab
- **OCR**: Google Cloud Vision API

### AI
- **テキスト生成**: Gemini 2.0 Flash
- **画像生成**: Gemini 2.0 Flash (with responseModalities)

## よくある質問

### Q: APIキーは安全ですか？

A: はい。APIキーはブラウザのローカルストレージにのみ保存され、サーバーには一切送信されません。

### Q: インターネット接続は必要ですか？

A: Gemini APIを使用するAI機能にはインターネット接続が必要です。PDF処理とエクスポートはオフラインで動作します。

### Q: 大きなPDFでも使えますか？

A: 100ページまでのPDFに対応しています。ブラウザのメモリ制限に注意してください。

## ライセンス

MIT License
