# UI設計メモ

## 画面構成

### Editor（メイン画面）
```
┌────────────────────────────────────────────────────────────────┐
│ TopBar: [←戻る] Project名 | Auto-Fix ON/OFF | Export | Undo   │
├──────┬───────────────────────────────────────┬─────────────────┤
│      │                                       │                 │
│ Pages│          Canvas                       │   Fix Queue     │
│      │                                       │                 │
│ サムネ │     [ページ画像 + Issue Box]          │  Now Fixing:    │
│ 一覧  │                                       │  ┌───────────┐  │
│      │                                       │  │ AI提案    │  │
│ フィルタ│     [ズーム/パンコントロール]          │  │ Apply&Next│  │
│ 検索  │                                       │  └───────────┘  │
│      │                                       │                 │
│      │                                       │  Queue:         │
│      │                                       │  • Issue 2      │
│      │                                       │  • Issue 3      │
├──────┴───────────────────────────────────────┴─────────────────┤
│ StatusBar: 12/43完了 | OCR処理中... | Enter: Apply J/K: 前後  │
└────────────────────────────────────────────────────────────────┘
```

### カラム幅
- 左（Pages）: 180px（折りたたみ可）
- 中央（Canvas）: flex-1
- 右（Fix Queue）: 360px

## キーボードショートカット

| キー | 操作 |
|------|------|
| Enter | Apply & Next |
| Shift+Enter | Apply（次へ進まない）|
| J | 次のIssue |
| K | 前のIssue |
| E | Edit Text（手動入力モード）|
| S | Skip |
| U | Undo |
| Z | Zoom in |
| X | Zoom out |
| F | Fit to width |
| Esc | キャンセル/閉じる |

## 状態遷移

### Issue Status
```
detected → [Apply] → corrected
         → [Skip] → skipped
         → [Review] → needs_review
```

### Correction Flow
```
1. Issue選択（自動または手動）
2. 候補生成（自動/高confidence時は自動選択）
3. ユーザー確認（低confidence時のみ選択要求）
4. Apply → 次のIssueへ自動遷移
```

## デザイントークン

### 色
- Primary: blue-500/600
- Success: green-500
- Warning: amber-500
- Error: red-500
- Text: gray-900/600/500/400
- Background: white, gray-50, gray-100

### 角丸
- xs: 4px (Badge)
- sm: 8px (Button)
- md: 12px (Card)
- lg: 16px (Panel)

### 影
- sm: 0 1px 2px rgba(0,0,0,0.05)
- md: 0 4px 6px rgba(0,0,0,0.07)
- lg: 0 10px 15px rgba(0,0,0,0.1)

## コンポーネント一覧

### 共通UI
- Button (primary/secondary/ghost/danger)
- Card
- Badge (success/warning/error/default/primary)
- Progress
- Toast
- Tooltip
- Tabs
- Accordion

### Editor専用
- TopBar
- StatusBar
- PagesPanel
- CanvasViewer
- FixQueuePanel
- IssueListItem
- BeforeAfterToggle
- CandidateSelector
- ShortcutHelp
