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
  AlertTriangle,
  CheckCircle2,
  Clock,
  Zap,
  ChevronDown,
  ChevronUp,
  Info,
  Target,
  Palette,
  Copy,
  Trash2,
  ScanText,
  PaintBucket,
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
  onUpdateOcrText?: (issueId: string, text: string) => void;
  onBatchApply?: (prompt: string, pageNumbers: 'all' | number[]) => Promise<void>;
  totalPages?: number;
  creditBalance?: number | null;
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
  onUpdateOcrText,
  onBatchApply,
  totalPages = 1,
  creditBalance,
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
  const [issueListOpen, setIssueListOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Batch operation state
  const [batchPrompt, setBatchPrompt] = useState('');
  const [isBatchApplying, setIsBatchApplying] = useState(false);
  const [batchTarget, setBatchTarget] = useState<'all' | 'current'>('all');
  const [activeBatchCategory, setActiveBatchCategory] = useState<string | null>(null);
  const [selectedBgColor, setSelectedBgColor] = useState('#FFFFFF');
  const [selectedTextColor, setSelectedTextColor] = useState('#000000');
  const [showFreeInput, setShowFreeInput] = useState(false);

  // Cost confirmation dialog
  const [costConfirm, setCostConfirm] = useState<{
    message: string;
    cost: number;
    insufficient: boolean;
    balance: number | null;
    onConfirm: () => void;
  } | null>(null);

  // Progress calculations
  const resolvedCount = issues.filter(
    (i) => i.status === 'corrected' || i.status === 'skipped'
  ).length;
  const totalCount = issues.length;
  const progressPercent = totalCount > 0 ? (resolvedCount / totalCount) * 100 : 0;

  // Reset state when issue changes
  useEffect(() => {
    setObjectPrompt('');
    // Reset to edit tab; also handle: switching from text mode (style tab) to object mode (no style tab)
    if (currentIssue?.edit_mode === 'object' && activeTab === 'style') {
      setActiveTab('edit');
    } else if (!currentIssue || currentIssue.edit_mode !== 'object') {
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

  const executeApply = async () => {
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

  const handleApply = () => {
    if (!currentIssue) return;
    const cost = correctionMethod === 'ai_inpaint' || isObjectMode ? 13 : 1;
    const bal = creditBalance ?? null;
    const insufficient = bal !== null && bal < cost;
    setCostConfirm({
      message: `この修正を実行しますか？`,
      cost,
      insufficient,
      balance: bal,
      onConfirm: () => {
        setCostConfirm(null);
        executeApply();
      },
    });
  };

  const executeBatch = async (prompt: string) => {
    if (!onBatchApply) return;
    setIsBatchApplying(true);
    try {
      await onBatchApply(prompt, 'all');
    } finally {
      setIsBatchApplying(false);
      setActiveBatchCategory(null);
      setBatchPrompt('');
    }
  };

  const confirmBatch = (description: string, prompt: string) => {
    const cost = totalPages * 13;
    const bal = creditBalance ?? null;
    const insufficient = bal !== null && bal < cost;
    setCostConfirm({
      message: `「${description}」を全${totalPages}ページに適用しますか？`,
      cost,
      insufficient,
      balance: bal,
      onConfirm: () => {
        setCostConfirm(null);
        executeBatch(prompt);
      },
    });
  };

  const handleBatchApply = () => {
    if (!batchPrompt.trim() || !onBatchApply) return;
    confirmBatch(batchPrompt.trim().slice(0, 20) + (batchPrompt.trim().length > 20 ? '...' : ''), batchPrompt.trim());
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

        <div className="flex-1 flex flex-col p-6 overflow-y-auto scrollbar-thin">
          <div className="flex flex-col items-center text-center mb-6">
            {totalCount === 0 ? (
              <>
                <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mb-5">
                  <Target className="w-8 h-8 text-gray-400" />
                </div>
                <h3 className="text-base font-semibold text-gray-900 mb-1">
                  修正箇所を選択
                </h3>
                <p className="text-sm text-gray-500 mb-6 leading-relaxed">
                  左の画像上でドラッグして<br />
                  修正したい箇所を選択してください
                </p>

                {/* Quick guide */}
                <div className="w-full space-y-1.5">
                  {[
                    { step: 1, title: '範囲を選択', desc: 'ドラッグで囲む', active: true },
                    { step: 2, title: '修正内容を入力', desc: 'テキスト・色・レイアウト等', active: false },
                    { step: 3, title: '適用', desc: 'AIが自動で修正', active: false },
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
                <p className="text-sm text-gray-500 mb-4">
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

          {/* Batch Operations */}
          {onBatchApply && (
            <div className="mt-auto pt-4 border-t border-gray-200 space-y-3">
              <div className="flex items-center gap-2 mb-1">
                <PaintBucket className="w-4 h-4 text-purple-500" />
                <h3 className="text-sm font-semibold text-gray-900">一括編集</h3>
              </div>
              <p className="text-xs text-gray-400 mb-2">
                全ページに一括変更（{totalPages}ページ × 10cr = <span className="font-semibold text-orange-500">{totalPages * 10}cr</span>）
              </p>

              {/* Category: Background Color */}
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <button
                  onClick={() => setActiveBatchCategory(activeBatchCategory === 'bg' ? null : 'bg')}
                  className="w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                  disabled={isBatchApplying}
                >
                  <span className="flex items-center gap-2">
                    <Palette className="w-4 h-4 text-gray-400" />
                    背景色を変更
                    <span className="text-[10px] text-orange-500 font-medium">{totalPages * 10}cr</span>
                  </span>
                  {activeBatchCategory === 'bg' ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                </button>
                {activeBatchCategory === 'bg' && (
                  <div className="px-3 pb-3 space-y-2 border-t border-gray-100">
                    <div className="flex items-center gap-1.5 pt-2 flex-wrap">
                      {[
                        { color: '#FFFFFF', label: '白' },
                        { color: '#000000', label: '黒' },
                        { color: '#EF4444', label: '赤' },
                        { color: '#3B82F6', label: '青' },
                        { color: '#22C55E', label: '緑' },
                        { color: '#EAB308', label: '黄' },
                      ].map(({ color, label }) => (
                        <button
                          key={color}
                          onClick={() => setSelectedBgColor(color)}
                          title={label}
                          className={cn(
                            'w-8 h-8 rounded-full border-2 transition-all flex-shrink-0',
                            selectedBgColor === color ? 'border-purple-500 scale-110' : 'border-gray-200 hover:border-gray-400'
                          )}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                      <label className="relative w-8 h-8 rounded-full border-2 border-dashed border-gray-300 hover:border-gray-400 cursor-pointer flex items-center justify-center flex-shrink-0 overflow-hidden" title="カスタム色">
                        <Plus className="w-3.5 h-3.5 text-gray-400" />
                        <input
                          type="color"
                          value={selectedBgColor}
                          onChange={(e) => setSelectedBgColor(e.target.value)}
                          className="absolute inset-0 opacity-0 cursor-pointer"
                        />
                      </label>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded border border-gray-200 flex-shrink-0" style={{ backgroundColor: selectedBgColor }} />
                      <span className="text-xs text-gray-500 flex-1">{selectedBgColor}</span>
                      <button
                        onClick={() => {
                          const colorName = { '#FFFFFF': '白', '#000000': '黒', '#EF4444': '赤', '#3B82F6': '青', '#22C55E': '緑', '#EAB308': '黄' }[selectedBgColor] || selectedBgColor;
                          confirmBatch(`背景色を${colorName}に変更`, `全ページの背景色を${colorName}（${selectedBgColor}）に変更してください`);
                        }}
                        disabled={isBatchApplying}
                        className="px-3 py-1.5 text-xs font-medium rounded-md bg-purple-600 hover:bg-purple-700 text-white transition-colors disabled:opacity-40"
                      >
                        {isBatchApplying ? <Loader2 className="w-3 h-3 animate-spin" /> : '適用'}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Category: Text Color */}
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <button
                  onClick={() => setActiveBatchCategory(activeBatchCategory === 'text' ? null : 'text')}
                  className="w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                  disabled={isBatchApplying}
                >
                  <span className="flex items-center gap-2">
                    <Type className="w-4 h-4 text-gray-400" />
                    テキスト色を変更
                    <span className="text-[10px] text-orange-500 font-medium">{totalPages * 10}cr</span>
                  </span>
                  {activeBatchCategory === 'text' ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                </button>
                {activeBatchCategory === 'text' && (
                  <div className="px-3 pb-3 space-y-2 border-t border-gray-100">
                    <div className="flex items-center gap-1.5 pt-2 flex-wrap">
                      {[
                        { color: '#FFFFFF', label: '白' },
                        { color: '#000000', label: '黒' },
                        { color: '#EF4444', label: '赤' },
                        { color: '#3B82F6', label: '青' },
                        { color: '#22C55E', label: '緑' },
                        { color: '#EAB308', label: '黄' },
                      ].map(({ color, label }) => (
                        <button
                          key={color}
                          onClick={() => setSelectedTextColor(color)}
                          title={label}
                          className={cn(
                            'w-8 h-8 rounded-full border-2 transition-all flex-shrink-0',
                            selectedTextColor === color ? 'border-purple-500 scale-110' : 'border-gray-200 hover:border-gray-400'
                          )}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                      <label className="relative w-8 h-8 rounded-full border-2 border-dashed border-gray-300 hover:border-gray-400 cursor-pointer flex items-center justify-center flex-shrink-0 overflow-hidden" title="カスタム色">
                        <Plus className="w-3.5 h-3.5 text-gray-400" />
                        <input
                          type="color"
                          value={selectedTextColor}
                          onChange={(e) => setSelectedTextColor(e.target.value)}
                          className="absolute inset-0 opacity-0 cursor-pointer"
                        />
                      </label>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded border border-gray-200 flex-shrink-0" style={{ backgroundColor: selectedTextColor }} />
                      <span className="text-xs text-gray-500 flex-1">{selectedTextColor}</span>
                      <button
                        onClick={() => {
                          const colorName = { '#FFFFFF': '白', '#000000': '黒', '#EF4444': '赤', '#3B82F6': '青', '#22C55E': '緑', '#EAB308': '黄' }[selectedTextColor] || selectedTextColor;
                          confirmBatch(`テキスト色を${colorName}に変更`, `全ページのテキストの色を${colorName}（${selectedTextColor}）に変更してください`);
                        }}
                        disabled={isBatchApplying}
                        className="px-3 py-1.5 text-xs font-medium rounded-md bg-purple-600 hover:bg-purple-700 text-white transition-colors disabled:opacity-40"
                      >
                        {isBatchApplying ? <Loader2 className="w-3 h-3 animate-spin" /> : '適用'}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Category: Mood/Atmosphere */}
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <button
                  onClick={() => setActiveBatchCategory(activeBatchCategory === 'mood' ? null : 'mood')}
                  className="w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                  disabled={isBatchApplying}
                >
                  <span className="flex items-center gap-2">
                    <Shapes className="w-4 h-4 text-gray-400" />
                    雰囲気を変更
                    <span className="text-[10px] text-orange-500 font-medium">{totalPages * 10}cr</span>
                  </span>
                  {activeBatchCategory === 'mood' ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                </button>
                {activeBatchCategory === 'mood' && (
                  <div className="px-3 pb-3 pt-2 border-t border-gray-100">
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { label: '明るく', prompt: '全体をより明るい雰囲気にしてください' },
                        { label: '暗く', prompt: '全体をより暗い・落ち着いた雰囲気にしてください' },
                        { label: 'モダンに', prompt: '全体をよりモダンでスタイリッシュなデザインにしてください' },
                        { label: 'レトロに', prompt: '全体をレトロ・ヴィンテージな雰囲気にしてください' },
                        { label: 'プロフェッショナル', prompt: '全体をよりプロフェッショナルでビジネス向けなデザインにしてください' },
                        { label: 'カジュアル', prompt: '全体をよりカジュアルでフレンドリーな雰囲気にしてください' },
                      ].map(({ label, prompt }) => (
                        <button
                          key={label}
                          onClick={() => confirmBatch(label, prompt)}
                          disabled={isBatchApplying}
                          className="py-2 text-xs font-medium rounded-md border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-40"
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Free Input (collapsible) */}
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <button
                  onClick={() => setShowFreeInput(!showFreeInput)}
                  className="w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                  disabled={isBatchApplying}
                >
                  <span className="flex items-center gap-2">
                    <Edit3 className="w-4 h-4 text-gray-400" />
                    その他の編集
                    <span className="text-[10px] text-orange-500 font-medium">{totalPages * 10}cr</span>
                  </span>
                  {showFreeInput ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                </button>
                {showFreeInput && (
                  <div className="px-3 pb-3 pt-2 space-y-2 border-t border-gray-100">
                    <textarea
                      value={batchPrompt}
                      onChange={(e) => setBatchPrompt(e.target.value)}
                      placeholder={"自由に指示を入力\n例: ヘッダーのロゴを大きくして"}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-300 bg-white resize-none"
                      rows={2}
                      disabled={isBatchApplying}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && batchPrompt.trim()) {
                          handleBatchApply();
                        }
                      }}
                    />
                    <button
                      onClick={handleBatchApply}
                      disabled={isBatchApplying || !batchPrompt.trim()}
                      className="w-full py-2 text-sm font-medium rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 text-white"
                    >
                      {isBatchApplying ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          処理中...
                        </>
                      ) : (
                        <>
                          <Zap className="w-3.5 h-3.5" />
                          全ページに適用
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Cost confirmation dialog */}
        {costConfirm && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden border border-gray-200">
              <div className="p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className={cn(
                    'w-10 h-10 rounded-xl flex items-center justify-center',
                    costConfirm.insufficient ? 'bg-red-100' : 'bg-orange-100'
                  )}>
                    {costConfirm.insufficient
                      ? <AlertTriangle className="w-5 h-5 text-red-500" />
                      : <Zap className="w-5 h-5 text-orange-500" />
                    }
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">
                      {costConfirm.insufficient ? 'クレジット不足' : 'クレジット消費の確認'}
                    </h3>
                    <p className="text-xs text-gray-400">
                      {costConfirm.insufficient ? '実行に必要なクレジットが足りません' : '実行前にご確認ください'}
                    </p>
                  </div>
                </div>
                <p className="text-sm text-gray-700 mb-3">{costConfirm.message}</p>
                <div className={cn(
                  'p-3 rounded-lg border',
                  costConfirm.insufficient ? 'bg-red-50 border-red-200' : 'bg-orange-50 border-orange-200'
                )}>
                  <p className={cn(
                    'text-sm font-semibold text-center',
                    costConfirm.insufficient ? 'text-red-800' : 'text-orange-800'
                  )}>
                    消費: <span className="text-lg">{costConfirm.cost}</span> クレジット
                  </p>
                  {costConfirm.balance !== null && (
                    <p className={cn(
                      'text-xs text-center mt-1',
                      costConfirm.insufficient ? 'text-red-600' : 'text-orange-600'
                    )}>
                      現在の残高: {costConfirm.balance} クレジット
                      {costConfirm.insufficient && ` （${costConfirm.cost - costConfirm.balance} 不足）`}
                    </p>
                  )}
                </div>
              </div>
              <div className="px-5 pb-5 flex gap-2">
                <button
                  onClick={() => setCostConfirm(null)}
                  className="flex-1 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  {costConfirm.insufficient ? '閉じる' : 'キャンセル'}
                </button>
                {!costConfirm.insufficient && (
                  <button
                    onClick={costConfirm.onConfirm}
                    className="flex-1 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Zap className="w-3.5 h-3.5" />
                    実行する
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
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
      <div className="px-4 py-2 flex items-center gap-2 text-xs font-medium text-gray-500 border-b border-gray-100">
        <Edit3 className="w-3.5 h-3.5" />
        修正モード
      </div>

      {/* Content - Scrollable, no tabs */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
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
                <label className="text-xs font-medium text-gray-700 mb-2 block">この領域をどう修正しますか？</label>
                <textarea
                  value={objectPrompt}
                  onChange={(e) => setObjectPrompt(e.target.value)}
                  placeholder="例: この画像を明るくして&#10;例: ロゴを赤に変更して&#10;例: 背景をぼかして"
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 bg-white resize-none"
                  rows={3}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && objectPrompt.trim()) {
                      handleApply();
                    }
                  }}
                />
                <p className="text-xs text-gray-400 mt-1"><span className="text-orange-500 font-medium">10cr</span>/回 ⌘+Enter で実行</p>
              </div>
            </>
          ) : (
            /* Text mode - unified */
            <>
              {/* OCR Text */}
              {currentIssue.ocr_text !== undefined && (
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
                  <input
                    type="text"
                    value={currentIssue.ocr_text || ''}
                    onChange={(e) => onUpdateOcrText?.(currentIssue.id, e.target.value)}
                    className="w-full p-2.5 bg-gray-50 rounded-md border border-gray-200 text-sm text-gray-700 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 focus:bg-white"
                    placeholder="OCR結果をここで修正..."
                  />
                </div>
              )}

              {/* Correction input */}
              <div>
                <label className="text-xs font-medium text-gray-700 mb-2 block">修正内容</label>
                <textarea
                  value={customText}
                  onChange={(e) => setCustomText(e.target.value)}
                  placeholder={"なんでも修正できます\n例: 誤字を直す、色を変える、フォントを大きく、背景を白に..."}
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 bg-white resize-none"
                  rows={3}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && customText.trim()) {
                      handleApply();
                    }
                  }}
                />
                <p className="text-xs text-gray-400 mt-1"><span className="text-orange-500 font-medium">10cr</span>/回 テキスト・色・レイアウトなど自由に指示 ⌘+Enter</p>
              </div>

            </>
          )}
        </div>
      </div>

      {/* Actions - Fixed at bottom */}
      <div className="p-4 border-t border-gray-200 space-y-2">
        <button
          onClick={handleApply}
          disabled={isApplying || currentIssue.status === 'corrected' || (isObjectMode ? !objectPrompt.trim() : !customText.trim())}
          className="w-full py-3 text-sm font-semibold rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-white bg-blue-600 hover:bg-blue-700"
        >
          {isApplying ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              修正中...
            </>
          ) : currentIssue.status === 'corrected' ? (
            <>
              <CheckCircle2 className="w-4 h-4" />
              修正済み
            </>
          ) : (
            <>
              <Zap className="w-4 h-4" />
              修正を実行（10cr）
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

      {/* Cost confirmation dialog */}
      {costConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden border border-gray-200">
            <div className="p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center">
                  <Zap className="w-5 h-5 text-orange-500" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">クレジット消費の確認</h3>
                  <p className="text-xs text-gray-400">実行前にご確認ください</p>
                </div>
              </div>
              <p className="text-sm text-gray-700 mb-3">{costConfirm.message}</p>
              <div className="p-3 bg-orange-50 rounded-lg border border-orange-200">
                <p className="text-sm font-semibold text-orange-800 text-center">
                  消費: <span className="text-lg">{costConfirm.cost}</span> クレジット
                </p>
              </div>
            </div>
            <div className="px-5 pb-5 flex gap-2">
              <button
                onClick={() => setCostConfirm(null)}
                className="flex-1 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                キャンセル
              </button>
              <button
                onClick={costConfirm.onConfirm}
                className="flex-1 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors flex items-center justify-center gap-1.5"
              >
                <Zap className="w-3.5 h-3.5" />
                実行する
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
