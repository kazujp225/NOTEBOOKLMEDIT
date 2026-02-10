'use client';

import { useState, useEffect, useRef } from 'react';
import {
  ChevronRight,
  ChevronLeft,
  Edit3,
  SkipForward,
  Loader2,
  Check,
  Type,
  Upload,
  X,
  Settings2,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Zap,
  FileText,
  ChevronDown,
  ChevronUp,
  Info,
  Target,
  Palette,
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  AlignRight,
  RotateCcw,
  RotateCw,
  FlipHorizontal,
  FlipVertical,
  Sun,
  Contrast,
  Eraser,
  Highlighter,
  Copy,
  Trash2,
  RefreshCw,
  ScanText,
  ImagePlus,
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
  Move,
  Crop,
  Layers,
  PaintBucket,
  Pipette,
  CircleDot,
  Square,
  Minus,
  Plus,
  Shapes,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { analyzeDesign, type DesignDefinition } from '@/lib/gemini';

export interface Candidate {
  text: string;
  confidence: number;
  reason?: string;
}

export interface IssueForFixQueue {
  id: string;
  page_id: string;
  page_number: number;
  bbox: { x: number; y: number; width: number; height: number };
  issue_type: string;
  confidence: number | null;
  ocr_text: string | null;
  detected_problems: string[];
  status: string;
  auto_correctable: boolean;
  candidates?: Candidate[];
  edit_mode?: 'text' | 'object';
}

export interface AIInpaintOptions {
  referenceDesign?: DesignDefinition;
  referenceImageBase64?: string;
  outputSize: '1K' | '2K' | '4K';
}

export interface TextStyle {
  fontSize: number;
  fontFamily: string;
  fontWeight: 'normal' | 'bold';
  fontStyle: 'normal' | 'italic';
  textDecoration: 'none' | 'underline';
  textAlign: 'left' | 'center' | 'right';
  color: string;
  backgroundColor: string;
}

interface FixQueuePanelProps {
  issues: IssueForFixQueue[];
  currentIssue: IssueForFixQueue | null;
  currentIndex: number;
  onSelectIssue?: (issue: IssueForFixQueue) => void;
  onNext: () => void;
  onPrevious: () => void;
  onApply: (text: string, method: 'text_overlay' | 'ai_inpaint', candidateIndex?: number, aiOptions?: AIInpaintOptions, textStyle?: TextStyle) => Promise<void>;
  onSkip: () => void;
  isApplying: boolean;
  pageWidth?: number;
  pageHeight?: number;
  regionPreviewUrl?: string;
  onDeleteIssue?: (issueId: string) => void;
  onRerunOcr?: (issueId: string) => void;
}

// Toolbar button component
function ToolbarButton({
  icon: Icon,
  label,
  active = false,
  disabled = false,
  danger = false,
  onClick
}: {
  icon: React.ElementType;
  label: string;
  active?: boolean;
  disabled?: boolean;
  danger?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      className={cn(
        'w-8 h-8 flex items-center justify-center rounded-lg transition-all',
        active && 'bg-blue-100 text-blue-600',
        danger && 'hover:bg-red-100 hover:text-red-600',
        !active && !danger && 'hover:bg-gray-100 text-gray-600',
        disabled && 'opacity-30 cursor-not-allowed'
      )}
    >
      <Icon className="w-4 h-4" />
    </button>
  );
}

// Toolbar divider
function ToolbarDivider() {
  return <div className="w-px h-6 bg-gray-200 mx-1" />;
}

// Color picker button
function ColorPickerButton({ color, onChange, label }: { color: string; onChange: (color: string) => void; label: string }) {
  return (
    <div className="relative">
      <input
        type="color"
        value={color}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        title={label}
      />
      <div
        className="w-6 h-6 rounded border-2 border-gray-300 cursor-pointer hover:border-gray-400"
        style={{ backgroundColor: color }}
      />
    </div>
  );
}

// Number stepper
function NumberStepper({ value, onChange, min, max, step = 1, label }: {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  label: string;
}) {
  return (
    <div className="flex items-center gap-1" title={label}>
      <button
        onClick={() => onChange(Math.max(min, value - step))}
        className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-100 text-gray-600"
        disabled={value <= min}
      >
        <Minus className="w-3 h-3" />
      </button>
      <span className="w-8 text-center text-xs font-medium text-gray-700">{value}</span>
      <button
        onClick={() => onChange(Math.min(max, value + step))}
        className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-100 text-gray-600"
        disabled={value >= max}
      >
        <Plus className="w-3 h-3" />
      </button>
    </div>
  );
}

// Confidence badge component
function ConfidenceBadge({ confidence }: { confidence: number }) {
  const percentage = Math.round(confidence * 100);
  let colorClass = 'bg-gray-100 text-gray-600';
  let icon = null;

  if (percentage >= 85) {
    colorClass = 'bg-green-100 text-green-700';
    icon = <CheckCircle2 className="w-3 h-3" />;
  } else if (percentage >= 60) {
    colorClass = 'bg-amber-100 text-amber-700';
    icon = <AlertTriangle className="w-3 h-3" />;
  } else {
    colorClass = 'bg-gray-100 text-gray-600';
    icon = <Info className="w-3 h-3" />;
  }

  return (
    <span className={cn('inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium', colorClass)}>
      {icon}
      {percentage}%
    </span>
  );
}

// Status badge component
function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; class: string; icon: React.ReactNode }> = {
    pending: { label: '未処理', class: 'bg-gray-100 text-gray-600', icon: <Clock className="w-3 h-3" /> },
    corrected: { label: '修正済', class: 'bg-green-100 text-green-700', icon: <CheckCircle2 className="w-3 h-3" /> },
    skipped: { label: 'スキップ', class: 'bg-gray-100 text-gray-500', icon: <SkipForward className="w-3 h-3" /> },
    needs_review: { label: '要確認', class: 'bg-amber-100 text-amber-700', icon: <AlertTriangle className="w-3 h-3" /> },
  };

  const { label, class: className, icon } = config[status] || config.pending;

  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium', className)}>
      {icon}
      {label}
    </span>
  );
}

export function FixQueuePanel({
  issues,
  currentIssue,
  currentIndex,
  onNext,
  onPrevious,
  onApply,
  onSkip,
  onSelectIssue,
  isApplying,
  regionPreviewUrl,
  onDeleteIssue,
  onRerunOcr,
}: FixQueuePanelProps) {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selectedCandidateIndex, setSelectedCandidateIndex] = useState<number | null>(null);
  const [customText, setCustomText] = useState('');
  const [objectPrompt, setObjectPrompt] = useState('');
  const [correctionMethod, setCorrectionMethod] = useState<'text_overlay' | 'ai_inpaint'>('ai_inpaint');
  const [activeTab, setActiveTab] = useState<'edit' | 'style' | 'ai'>('edit');

  const isObjectMode = currentIssue?.edit_mode === 'object';

  // Text styling
  const [textStyle, setTextStyle] = useState<TextStyle>({
    fontSize: 16,
    fontFamily: 'Noto Sans JP',
    fontWeight: 'normal',
    fontStyle: 'normal',
    textDecoration: 'none',
    textAlign: 'left',
    color: '#000000',
    backgroundColor: '#ffffff',
  });

  // AI Options
  const [outputSize, setOutputSize] = useState<'1K' | '2K' | '4K'>('4K');
  const [referenceImage, setReferenceImage] = useState<string | null>(null);
  const [referenceDesign, setReferenceDesign] = useState<DesignDefinition | null>(null);
  const [isAnalyzingDesign, setIsAnalyzingDesign] = useState(false);
  const [fontAccordionOpen, setFontAccordionOpen] = useState(false);
  const [issueListOpen, setIssueListOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Progress calculations
  const resolvedCount = issues.filter(
    (i) => i.status === 'corrected' || i.status === 'skipped'
  ).length;
  const totalCount = issues.length;
  const progressPercent = totalCount > 0 ? (resolvedCount / totalCount) * 100 : 0;

  // Reset state when issue changes
  useEffect(() => {
    setObjectPrompt('');
    if (!currentIssue || currentIssue.edit_mode !== 'object') {
      setActiveTab('edit');
    }
  }, [currentIssue?.id]);

  // Load candidates and set initial text when issue changes
  useEffect(() => {
    if (currentIssue?.candidates) {
      setCandidates(currentIssue.candidates);
      const highConfIdx = currentIssue.candidates.findIndex((c) => c.confidence > 0.85);
      setSelectedCandidateIndex(highConfIdx >= 0 ? highConfIdx : 0);
      if (highConfIdx >= 0) {
        setCustomText(currentIssue.candidates[highConfIdx].text);
      } else if (currentIssue.candidates.length > 0) {
        setCustomText(currentIssue.candidates[0].text);
      } else {
        setCustomText(currentIssue.ocr_text || '');
      }
    } else if (currentIssue?.ocr_text) {
      setCandidates([{ text: currentIssue.ocr_text, confidence: 0.5, reason: 'OCR結果' }]);
      setSelectedCandidateIndex(0);
      setCustomText(currentIssue.ocr_text);
    } else {
      setCandidates([]);
      setSelectedCandidateIndex(null);
      setCustomText('');
    }
  }, [currentIssue?.id]);

  // Handle reference image upload
  const handleReferenceImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = event.target?.result as string;
      setReferenceImage(base64);

      setIsAnalyzingDesign(true);
      try {
        const design = await analyzeDesign(undefined, base64);
        setReferenceDesign(design);
      } catch (err) {
        console.error('Failed to analyze design:', err);
      } finally {
        setIsAnalyzingDesign(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const clearReferenceImage = () => {
    setReferenceImage(null);
    setReferenceDesign(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleApply = async () => {
    if (!currentIssue) return;

    if (isObjectMode) {
      const prompt = objectPrompt.trim();
      if (!prompt) return;

      const aiOptions: AIInpaintOptions = {
        outputSize,
        referenceDesign: referenceDesign || undefined,
        referenceImageBase64: referenceImage || undefined,
      };

      await onApply(prompt, 'ai_inpaint', undefined, aiOptions);
      setObjectPrompt('');
      return;
    }

    const text = customText.trim();
    if (!text) return;

    const aiOptions: AIInpaintOptions = {
      outputSize,
      referenceDesign: referenceDesign || undefined,
      referenceImageBase64: referenceImage || undefined,
    };

    await onApply(text, correctionMethod, selectedCandidateIndex ?? undefined, aiOptions, textStyle);
    setCustomText('');
    setSelectedCandidateIndex(null);
  };

  // Empty state
  if (!currentIssue) {
    return (
      <aside className="w-[400px] bg-white border-l border-gray-200 flex flex-col flex-shrink-0">
        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-gray-900">編集ツールバー</h2>
            <span className="text-xs text-gray-400">{resolvedCount}/{totalCount} 完了</span>
          </div>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          {totalCount === 0 ? (
            <>
              <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mb-5">
                <Target className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-base font-semibold text-gray-900 mb-1">
                修正箇所を選択
              </h3>
              <p className="text-sm text-gray-500 mb-8 leading-relaxed">
                左の画像上でドラッグして<br />
                修正したい箇所を選択してください
              </p>

              {/* Quick guide */}
              <div className="w-full space-y-1.5">
                {[
                  { step: 1, title: '範囲を選択', desc: 'ドラッグで囲む', active: true },
                  { step: 2, title: 'テキストを編集', desc: '文字化けを修正', active: false },
                  { step: 3, title: 'スタイルを調整', desc: 'フォント・色など', active: false },
                  { step: 4, title: '適用', desc: '修正を反映', active: false },
                ].map(({ step, title, desc, active }) => (
                  <div
                    key={step}
                    className={cn(
                      'flex items-center gap-3 p-3 rounded-lg text-left',
                      active ? 'bg-blue-50 border border-blue-200' : 'bg-gray-50'
                    )}
                  >
                    <div className={cn(
                      'w-7 h-7 rounded-md flex items-center justify-center text-xs font-semibold flex-shrink-0',
                      active ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'
                    )}>
                      {step}
                    </div>
                    <div>
                      <p className={cn('text-sm font-medium', active ? 'text-gray-900' : 'text-gray-500')}>
                        {title}
                      </p>
                      <p className="text-xs text-gray-400">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="w-16 h-16 bg-green-50 rounded-2xl flex items-center justify-center mb-5">
                <CheckCircle2 className="w-8 h-8 text-green-600" />
              </div>
              <h3 className="text-base font-semibold text-gray-900 mb-1">
                すべて完了！
              </h3>
              <p className="text-sm text-gray-500 mb-6">
                {resolvedCount}件の修正が完了しました
              </p>
              <div className="p-3 bg-gray-50 rounded-lg border border-gray-200 w-full">
                <p className="text-sm text-gray-700">
                  右上の「書き出し」からPDFを保存できます
                </p>
              </div>
            </>
          )}
        </div>
      </aside>
    );
  }

  return (
    <aside className="w-[400px] bg-white border-l border-gray-200 flex flex-col flex-shrink-0">
      {/* Header with progress */}
      <div className="px-4 py-3 border-b border-gray-200">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">編集ツールバー</h2>
            <p className="text-xs text-gray-400">Issue {currentIndex + 1} / {totalCount}</p>
          </div>
          <StatusBadge status={currentIssue.status} />
        </div>

        {/* Progress bar */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-gray-400">進捗</span>
            <span className="text-gray-600 font-medium">{Math.round(progressPercent)}%</span>
          </div>
          <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* Issue mini-list (collapsible) */}
      <div className="border-b border-gray-100">
        <button
          onClick={() => setIssueListOpen(!issueListOpen)}
          className="w-full px-4 py-2 flex items-center justify-between text-xs text-gray-500 hover:bg-gray-50 transition-colors"
        >
          <span className="font-medium">修正一覧 ({resolvedCount}/{totalCount})</span>
          {issueListOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
        {issueListOpen && (
          <div className="max-h-[160px] overflow-y-auto px-2 pb-2 space-y-0.5">
            {issues.map((issue, idx) => {
              const isCurrent = issue.id === currentIssue?.id;
              const isResolved = issue.status === 'corrected' || issue.status === 'skipped';
              return (
                <button
                  key={issue.id}
                  onClick={() => onSelectIssue?.(issue)}
                  className={cn(
                    'w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-left text-xs transition-colors',
                    isCurrent ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-50',
                  )}
                >
                  <div className={cn(
                    'w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0',
                    issue.status === 'corrected' ? 'bg-green-500' :
                    issue.status === 'skipped' ? 'bg-gray-300' :
                    'bg-amber-400'
                  )}>
                    {issue.status === 'corrected' ? (
                      <Check className="w-2.5 h-2.5 text-white" />
                    ) : issue.status === 'skipped' ? (
                      <Minus className="w-2.5 h-2.5 text-white" />
                    ) : (
                      <span className="text-[8px] font-bold text-white">{idx + 1}</span>
                    )}
                  </div>
                  <span className={cn(
                    'truncate flex-1',
                    isResolved ? 'text-gray-400 line-through' : 'text-gray-700',
                    isCurrent && 'font-medium text-gray-900 no-underline'
                  )}>
                    {issue.ocr_text?.slice(0, 25) || (issue.edit_mode === 'object' ? 'オブジェクト' : `Issue ${idx + 1}`)}
                    {((issue.ocr_text?.length || 0) > 25) && '...'}
                  </span>
                  {issue.edit_mode === 'object' && (
                    <Shapes className="w-3 h-3 text-gray-400 flex-shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="px-4 py-2 flex items-center justify-between border-b border-gray-100">
        <button
          onClick={onPrevious}
          disabled={currentIndex === 0}
          className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-md transition-colors disabled:opacity-30"
        >
          <ChevronLeft className="w-4 h-4" />
          前へ
        </button>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onDeleteIssue?.(currentIssue.id)}
            className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors"
            title="この選択を削除"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => onRerunOcr?.(currentIssue.id)}
            className="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-md transition-colors"
            title="OCRを再実行"
          >
            <ScanText className="w-4 h-4" />
          </button>
        </div>

        <button
          onClick={onNext}
          disabled={currentIndex === totalCount - 1}
          className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-md transition-colors disabled:opacity-30"
        >
          次へ
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Mode indicator */}
      <div className="px-4 py-2 flex items-center gap-2 text-xs font-medium border-b border-gray-100 text-gray-500">
        {isObjectMode ? <Shapes className="w-3.5 h-3.5" /> : <Type className="w-3.5 h-3.5" />}
        {isObjectMode ? 'オブジェクト修正モード' : 'テキスト修正モード'}
      </div>

      {/* Tab bar - only show for object mode which has multiple tabs */}
      {isObjectMode && (
        <div className="flex border-b border-gray-200">
          {[
            { id: 'edit', label: '編集', icon: Edit3 },
            { id: 'ai', label: 'AI設定', icon: Settings2 },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id as typeof activeTab)}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors border-b-2',
                activeTab === id
                  ? 'text-blue-600 border-blue-500'
                  : 'text-gray-500 border-transparent hover:text-gray-700 hover:bg-gray-50'
              )}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Content - Scrollable */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {/* Edit Tab */}
        {activeTab === 'edit' && (
          <div className="p-4 space-y-4">
            {/* Region Preview */}
            {regionPreviewUrl && (
              <div>
                <label className="text-xs font-medium text-gray-500 mb-2 block">選択領域</label>
                <div className="rounded-lg border border-gray-200 overflow-hidden bg-gray-50">
                  <img
                    src={regionPreviewUrl}
                    alt="選択領域"
                    className="w-full h-auto max-h-28 object-contain"
                  />
                </div>
                <div className="mt-1.5 flex items-center gap-3 text-xs text-gray-400">
                  <span>ページ {currentIssue.page_number}</span>
                  <span>{Math.round(currentIssue.bbox.width)} × {Math.round(currentIssue.bbox.height)} px</span>
                </div>
              </div>
            )}

            {isObjectMode ? (
              /* Object mode: free prompt input */
              <>
                <div>
                  <label className="text-xs font-medium text-gray-700 mb-2 block">修正プロンプト</label>
                  <textarea
                    value={objectPrompt}
                    onChange={(e) => setObjectPrompt(e.target.value)}
                    placeholder="例: この画像を明るくして&#10;例: ロゴを赤に変更して&#10;例: 背景をぼかして"
                    className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white resize-none"
                    rows={4}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && objectPrompt.trim()) {
                        handleApply();
                      }
                    }}
                  />
                  <p className="text-xs text-gray-400 mt-1">⌘+Enter で適用</p>
                </div>

                {/* AI info */}
                <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="flex items-start gap-2">
                    <Info className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                    <div className="text-xs text-gray-600">
                      <p className="font-medium mb-1">Gemini AI で画像を編集</p>
                      <p className="text-gray-500">選択した領域に対して、プロンプトの指示通りにAIが画像を編集します。10クレジット/回</p>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              /* Text mode: unified edit input */
              <>
                {/* OCR Text */}
                {currentIssue.ocr_text && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-medium text-gray-500">検出テキスト</label>
                      <button
                        onClick={() => setCustomText(currentIssue.ocr_text || '')}
                        className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
                      >
                        <Copy className="w-3 h-3" />
                        コピー
                      </button>
                    </div>
                    <div className="p-2.5 bg-gray-50 rounded-md border border-gray-200 text-sm text-gray-700 font-mono">
                      {currentIssue.ocr_text}
                    </div>
                  </div>
                )}

                {/* Unified Edit Input */}
                <div>
                  <label className="text-xs font-medium text-gray-700 mb-2 block">この領域をどう編集しますか？</label>
                  <textarea
                    value={customText}
                    onChange={(e) => setCustomText(e.target.value)}
                    placeholder={"テキスト置換:\n  正しいテキストをそのまま入力\n\nAI編集:\n  例: フォントを大きくして\n  例: 背景を白に変えて\n  例: この文字を消して"}
                    className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white resize-none"
                    rows={3}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && customText.trim()) {
                        handleApply();
                      }
                    }}
                  />
                  <p className="text-xs text-gray-400 mt-1">⌘+Enter で適用</p>
                </div>

                {/* Method toggle */}
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-2 block">適用方法</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setCorrectionMethod('text_overlay')}
                      className={cn(
                        'flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-lg border transition-colors',
                        correctionMethod === 'text_overlay'
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                      )}
                    >
                      <Type className="w-4 h-4" />
                      テキスト置換
                    </button>
                    <button
                      onClick={() => setCorrectionMethod('ai_inpaint')}
                      className={cn(
                        'flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-lg border transition-colors',
                        correctionMethod === 'ai_inpaint'
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                      )}
                    >
                      <Edit3 className="w-4 h-4" />
                      AI編集
                    </button>
                  </div>
                  <p className="text-xs text-gray-400 mt-1.5">
                    {correctionMethod === 'text_overlay'
                      ? '入力したテキストでそのまま置換します（無料）'
                      : 'AIが指示に従って画像を編集します（10クレジット）'}
                  </p>
                </div>

                {/* Candidates */}
                {candidates.length > 0 && correctionMethod === 'text_overlay' && (
                  <div>
                    <label className="text-xs font-medium text-gray-500 mb-2 block">候補から選択</label>
                    <div className="space-y-1.5">
                      {candidates.map((candidate, index) => (
                        <button
                          key={index}
                          onClick={() => {
                            setSelectedCandidateIndex(index);
                            setCustomText(candidate.text);
                          }}
                          className={cn(
                            'w-full text-left p-2.5 rounded-md border transition-colors text-sm',
                            customText === candidate.text
                              ? 'border-blue-500 bg-blue-50'
                              : 'border-gray-200 hover:bg-gray-50'
                          )}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium text-gray-900 truncate">{candidate.text}</span>
                            <ConfidenceBadge confidence={candidate.confidence} />
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Style Tab */}
        {activeTab === 'style' && (
          <div className="p-4 space-y-4">
            {/* Quick format toolbar */}
            <div>
              <label className="text-xs font-medium text-gray-500 mb-2 block">テキスト書式</label>
              <div className="flex items-center gap-1 p-2 bg-gray-50 rounded-lg">
                <ToolbarButton
                  icon={Bold}
                  label="太字"
                  active={textStyle.fontWeight === 'bold'}
                  onClick={() => setTextStyle(s => ({ ...s, fontWeight: s.fontWeight === 'bold' ? 'normal' : 'bold' }))}
                />
                <ToolbarButton
                  icon={Italic}
                  label="斜体"
                  active={textStyle.fontStyle === 'italic'}
                  onClick={() => setTextStyle(s => ({ ...s, fontStyle: s.fontStyle === 'italic' ? 'normal' : 'italic' }))}
                />
                <ToolbarButton
                  icon={Underline}
                  label="下線"
                  active={textStyle.textDecoration === 'underline'}
                  onClick={() => setTextStyle(s => ({ ...s, textDecoration: s.textDecoration === 'underline' ? 'none' : 'underline' }))}
                />
                <ToolbarDivider />
                <ToolbarButton
                  icon={AlignLeft}
                  label="左揃え"
                  active={textStyle.textAlign === 'left'}
                  onClick={() => setTextStyle(s => ({ ...s, textAlign: 'left' }))}
                />
                <ToolbarButton
                  icon={AlignCenter}
                  label="中央揃え"
                  active={textStyle.textAlign === 'center'}
                  onClick={() => setTextStyle(s => ({ ...s, textAlign: 'center' }))}
                />
                <ToolbarButton
                  icon={AlignRight}
                  label="右揃え"
                  active={textStyle.textAlign === 'right'}
                  onClick={() => setTextStyle(s => ({ ...s, textAlign: 'right' }))}
                />
              </div>
            </div>

            {/* Font size */}
            <div>
              <label className="text-xs font-medium text-gray-500 mb-2 block">フォントサイズ</label>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min="8"
                  max="72"
                  value={textStyle.fontSize}
                  onChange={(e) => setTextStyle(s => ({ ...s, fontSize: parseInt(e.target.value) }))}
                  className="flex-1 h-2 bg-gray-200 rounded-full appearance-none cursor-pointer"
                />
                <span className="w-12 text-center text-sm font-medium text-gray-700">{textStyle.fontSize}px</span>
              </div>
            </div>

            {/* Font family - Accordion */}
            <div>
              <button
                onClick={() => setFontAccordionOpen(prev => !prev)}
                className="w-full flex items-center justify-between text-xs font-medium text-gray-500 mb-2"
              >
                <span>フォント: <span className="text-gray-900 font-bold">{
                  { 'Noto Sans JP': 'Noto Sans JP', 'Hiragino Sans': 'ヒラギノ角ゴ', 'Yu Gothic': '游ゴシック', 'Meiryo': 'メイリオ', 'Arial': 'Arial', 'Times New Roman': 'Times New Roman' }[textStyle.fontFamily] || textStyle.fontFamily
                }</span></span>
                {fontAccordionOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
              {fontAccordionOpen && (
                <div className="space-y-1">
                  {[
                    { value: 'Noto Sans JP', label: 'Noto Sans JP' },
                    { value: 'Hiragino Sans', label: 'ヒラギノ角ゴ' },
                    { value: 'Yu Gothic', label: '游ゴシック' },
                    { value: 'Meiryo', label: 'メイリオ' },
                    { value: 'Arial', label: 'Arial' },
                    { value: 'Times New Roman', label: 'Times New Roman' },
                  ].map(({ value, label }) => (
                    <button
                      key={value}
                      onClick={() => {
                        setTextStyle(s => ({ ...s, fontFamily: value }));
                        setFontAccordionOpen(false);
                      }}
                      className={cn(
                        'w-full text-left px-3 py-2 text-sm rounded-md transition-colors',
                        textStyle.fontFamily === value
                          ? 'bg-blue-50 text-blue-700 font-medium border border-blue-200'
                          : 'hover:bg-gray-50 text-gray-700 border border-transparent'
                      )}
                      style={{ fontFamily: value }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Colors */}
            <div>
              <label className="text-xs font-medium text-gray-500 mb-2 block">色</label>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">文字</span>
                  <ColorPickerButton
                    color={textStyle.color}
                    onChange={(color) => setTextStyle(s => ({ ...s, color }))}
                    label="文字色"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">背景</span>
                  <ColorPickerButton
                    color={textStyle.backgroundColor}
                    onChange={(color) => setTextStyle(s => ({ ...s, backgroundColor: color }))}
                    label="背景色"
                  />
                </div>
              </div>
            </div>

            {/* Preset colors */}
            <div>
              <label className="text-xs font-medium text-gray-500 mb-2 block">プリセット</label>
              <div className="flex flex-wrap gap-2">
                {[
                  { color: '#000000', bg: '#ffffff', label: '黒/白' },
                  { color: '#ffffff', bg: '#000000', label: '白/黒' },
                  { color: '#1e40af', bg: '#dbeafe', label: '青' },
                  { color: '#166534', bg: '#dcfce7', label: '緑' },
                  { color: '#9a3412', bg: '#ffedd5', label: 'オレンジ' },
                  { color: '#7c2d12', bg: '#fef3c7', label: '茶' },
                ].map(({ color, bg, label }) => (
                  <button
                    key={label}
                    onClick={() => setTextStyle(s => ({ ...s, color, backgroundColor: bg }))}
                    className="px-3 py-1.5 text-xs font-medium rounded-md border border-gray-200 hover:border-gray-300"
                    style={{ color, backgroundColor: bg }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Preview */}
            <div>
              <label className="text-xs font-medium text-gray-500 mb-2 block">プレビュー</label>
              <div
                className="p-4 rounded-md border border-gray-200 min-h-[60px] flex items-center justify-center"
                style={{ backgroundColor: textStyle.backgroundColor }}
              >
                <span
                  style={{
                    fontFamily: textStyle.fontFamily,
                    fontSize: `${Math.min(textStyle.fontSize, 24)}px`,
                    fontWeight: textStyle.fontWeight,
                    fontStyle: textStyle.fontStyle,
                    textDecoration: textStyle.textDecoration,
                    color: textStyle.color,
                    textAlign: textStyle.textAlign,
                  }}
                >
                  {customText || 'サンプルテキスト'}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* AI Tab */}
        {activeTab === 'ai' && (
          <div className="p-4 space-y-4">
            {/* Method Selection */}
            <div>
              <label className="text-xs font-medium text-gray-500 mb-2 block">修正方法</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setCorrectionMethod('text_overlay')}
                  className={cn(
                    'relative flex flex-col items-center gap-2 p-4 rounded-lg border transition-colors',
                    correctionMethod === 'text_overlay'
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:bg-gray-50'
                  )}
                >
                  <Type className={cn('w-6 h-6', correctionMethod === 'text_overlay' ? 'text-blue-600' : 'text-gray-400')} />
                  <span className={cn('text-sm font-medium', correctionMethod === 'text_overlay' ? 'text-blue-700' : 'text-gray-600')}>
                    テキスト合成
                  </span>
                  <span className="text-xs text-gray-400">無料</span>
                </button>

                <button
                  onClick={() => setCorrectionMethod('ai_inpaint')}
                  className={cn(
                    'relative flex flex-col items-center gap-2 p-4 rounded-lg border transition-colors',
                    correctionMethod === 'ai_inpaint'
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:bg-gray-50'
                  )}
                >
                  <Edit3 className={cn('w-6 h-6', correctionMethod === 'ai_inpaint' ? 'text-blue-600' : 'text-gray-400')} />
                  <span className={cn('text-sm font-medium', correctionMethod === 'ai_inpaint' ? 'text-blue-700' : 'text-gray-600')}>
                    AI修正
                  </span>
                  <span className="text-xs text-gray-400">10クレジット</span>
                </button>
              </div>
            </div>

            {/* AI Settings */}
            {correctionMethod === 'ai_inpaint' && (
              <>
                {/* Output Size */}
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-2 block">出力品質</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['1K', '2K', '4K'] as const).map((size) => (
                      <button
                        key={size}
                        onClick={() => setOutputSize(size)}
                        className={cn(
                          'py-2 text-sm font-medium rounded-md border transition-colors',
                          outputSize === size
                            ? 'border-blue-500 bg-blue-50 text-blue-700'
                            : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                        )}
                      >
                        {size}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Reference Design */}
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-2 block">参考デザイン（任意）</label>
                  {referenceImage ? (
                    <div className="relative rounded-lg overflow-hidden border border-gray-200">
                      <img
                        src={referenceImage}
                        alt="参考デザイン"
                        className="w-full h-28 object-cover"
                      />
                      <button
                        onClick={clearReferenceImage}
                        className="absolute top-2 right-2 p-1.5 bg-white/90 rounded-md shadow-sm hover:bg-white"
                      >
                        <X className="w-4 h-4 text-gray-600" />
                      </button>
                      {isAnalyzingDesign && (
                        <div className="absolute inset-0 flex items-center justify-center bg-white/80">
                          <Loader2 className="w-6 h-6 text-gray-500 animate-spin" />
                        </div>
                      )}
                      {referenceDesign && !isAnalyzingDesign && (
                        <div className="absolute bottom-0 left-0 right-0 p-2 bg-black/60">
                          <p className="text-xs text-white font-medium">{referenceDesign.vibe}</p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full py-6 border border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-gray-400 hover:bg-gray-50 transition-colors flex flex-col items-center gap-2"
                    >
                      <ImagePlus className="w-6 h-6" />
                      <span className="text-sm font-medium">画像をアップロード</span>
                    </button>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleReferenceImageUpload}
                    className="hidden"
                  />
                </div>
              </>
            )}

            {/* AI Tips */}
            <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
              <div className="flex items-start gap-2">
                <Info className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                <div className="text-xs text-gray-600">
                  <p className="font-medium mb-1">AI修正のヒント</p>
                  <ul className="space-y-0.5 text-gray-500">
                    <li>・文字化けの修正に最適</li>
                    <li>・背景に合わせて自然に生成</li>
                    <li>・参考画像でスタイルを指定可能</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Actions - Fixed at bottom */}
      <div className="p-4 border-t border-gray-200 space-y-2">
        <button
          onClick={handleApply}
          disabled={isApplying || currentIssue.status === 'corrected' || (isObjectMode ? !objectPrompt.trim() : !customText.trim())}
          className="w-full py-3 text-sm font-semibold rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white"
        >
          {isApplying ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              {(isObjectMode || correctionMethod === 'ai_inpaint') ? 'AI生成中...' : '適用中...'}
            </>
          ) : currentIssue.status === 'corrected' ? (
            <>
              <CheckCircle2 className="w-4 h-4" />
              修正済み
            </>
          ) : (
            <>
              <Check className="w-4 h-4" />
              {isObjectMode ? 'AI編集を実行' : '適用して次へ'}
            </>
          )}
        </button>

        <button
          onClick={onSkip}
          disabled={currentIssue.status === 'corrected' || currentIssue.status === 'skipped'}
          className="w-full py-2.5 text-sm font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-40"
        >
          <SkipForward className="w-4 h-4" />
          スキップ
        </button>
      </div>
    </aside>
  );
}
