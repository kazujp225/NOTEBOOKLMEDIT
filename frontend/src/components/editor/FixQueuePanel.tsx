'use client';

import { useState, useEffect } from 'react';
import {
  ChevronRight,
  ChevronLeft,
  Edit3,
  SkipForward,
  Loader2,
  Sparkles,
  Type,
  AlertTriangle,
  CheckCircle2,
  Eye,
  EyeOff,
  ChevronDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/Accordion';

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
}

interface FixQueuePanelProps {
  issues: IssueForFixQueue[];
  currentIssue: IssueForFixQueue | null;
  currentIndex: number;
  onSelectIssue: (issue: IssueForFixQueue) => void;
  onNext: () => void;
  onPrevious: () => void;
  onApply: (text: string, method: 'text_overlay' | 'nano_banana', candidateIndex?: number) => Promise<void>;
  onSkip: () => void;
  isApplying: boolean;
}

export function FixQueuePanel({
  issues,
  currentIssue,
  currentIndex,
  onSelectIssue,
  onNext,
  onPrevious,
  onApply,
  onSkip,
  isApplying,
}: FixQueuePanelProps) {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selectedCandidateIndex, setSelectedCandidateIndex] = useState<number | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customText, setCustomText] = useState('');
  const [correctionMethod, setCorrectionMethod] = useState<'text_overlay' | 'nano_banana'>('text_overlay');
  const [showBeforeAfter, setShowBeforeAfter] = useState<'before' | 'after'>('before');

  // Progress calculations
  const resolvedCount = issues.filter(
    (i) => i.status === 'corrected' || i.status === 'skipped'
  ).length;
  const totalCount = issues.length;
  const percentage = totalCount > 0 ? Math.round((resolvedCount / totalCount) * 100) : 0;

  // Load candidates when issue changes
  useEffect(() => {
    if (currentIssue?.candidates) {
      setCandidates(currentIssue.candidates);
      // Auto-select high confidence candidate
      const highConfIdx = currentIssue.candidates.findIndex((c) => c.confidence > 0.85);
      setSelectedCandidateIndex(highConfIdx >= 0 ? highConfIdx : null);
    } else {
      setCandidates([]);
      setSelectedCandidateIndex(null);
    }
    // Reset custom input when issue changes
    setShowCustomInput(false);
    setCustomText('');
  }, [currentIssue?.id]);

  // Placeholder for future Gemini API integration
  const generateCandidates = async () => {
    if (!currentIssue) return;
    setIsGenerating(true);
    try {
      // TODO: Integrate Gemini API directly from frontend
      // For now, just show a message that candidates need to be generated
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Mock candidates for demo (will be replaced with Gemini API)
      if (currentIssue.ocr_text) {
        const mockCandidates: Candidate[] = [
          { text: currentIssue.ocr_text, confidence: 0.6, reason: 'OCR原文' },
        ];
        setCandidates(mockCandidates);
        setSelectedCandidateIndex(0);
      }
    } catch (error) {
      console.error('Failed to generate candidates:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleApply = async () => {
    if (!currentIssue) return;

    let text = customText;
    let candidateIdx: number | undefined;

    if (!showCustomInput && selectedCandidateIndex !== null && candidates[selectedCandidateIndex]) {
      text = candidates[selectedCandidateIndex].text;
      candidateIdx = selectedCandidateIndex;
    }

    if (!text.trim()) return;

    await onApply(text, correctionMethod, candidateIdx);
    setCustomText('');
    setShowCustomInput(false);
    setSelectedCandidateIndex(null);
  };

  // Get confidence level
  const getConfidenceLevel = (confidence: number) => {
    if (confidence >= 0.85) return { label: 'High', color: 'text-green-600 bg-green-100' };
    if (confidence >= 0.7) return { label: 'Med', color: 'text-amber-600 bg-amber-100' };
    return { label: 'Low', color: 'text-red-600 bg-red-100' };
  };

  // Empty state
  if (!currentIssue) {
    return (
      <aside className="w-[360px] bg-white border-l border-gray-200 flex flex-col flex-shrink-0">
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-2xl flex items-center justify-center mb-4">
            <CheckCircle2 className="w-8 h-8 text-green-500" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            {totalCount === 0 ? 'Issue なし' : 'すべて完了!'}
          </h3>
          <p className="text-sm text-gray-500">
            {totalCount === 0
              ? 'ドラッグで範囲選択して Issue を追加できます'
              : 'すべての修正が完了しました。エクスポートできます。'}
          </p>
        </div>
      </aside>
    );
  }

  const selectedCandidate = selectedCandidateIndex !== null ? candidates[selectedCandidateIndex] : null;
  const confidenceInfo = selectedCandidate ? getConfidenceLevel(selectedCandidate.confidence) : null;
  const isLowConfidence = candidates.length > 0 && candidates.every((c) => c.confidence < 0.7);

  return (
    <aside className="w-[360px] bg-white border-l border-gray-200 flex flex-col flex-shrink-0">
      {/* Header with progress */}
      <div className="p-4 border-b border-gray-100">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-900">Fix Queue</h2>
          <span className={cn(
            'badge',
            resolvedCount === totalCount ? 'badge-success' : 'badge-default'
          )}>
            {resolvedCount}/{totalCount}
          </span>
        </div>

        {/* Progress bar */}
        <div className="progress-bar">
          <div
            className={cn(
              'progress-bar-fill',
              resolvedCount === totalCount && 'progress-bar-success'
            )}
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>

      {/* Navigation */}
      <div className="px-4 py-2 flex items-center justify-between border-b border-gray-100">
        <button
          onClick={onPrevious}
          disabled={currentIndex === 0}
          className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-30"
          aria-label="前のIssue"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        <span className="text-xs font-medium text-gray-500">
          {currentIndex + 1} / {totalCount}
        </span>

        <button
          onClick={onNext}
          disabled={currentIndex === totalCount - 1}
          className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-30"
          aria-label="次のIssue"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Now Fixing - Main content */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="p-4 space-y-4">
          {/* Issue type badges */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="badge badge-warning">
              <AlertTriangle className="w-3 h-3" />
              {currentIssue.issue_type === 'low_confidence' && '低信頼度'}
              {currentIssue.issue_type === 'garbled' && '文字化け'}
              {currentIssue.issue_type === 'missing' && '欠落'}
              {currentIssue.issue_type === 'manual' && '手動追加'}
              {!['low_confidence', 'garbled', 'missing', 'manual'].includes(currentIssue.issue_type) && currentIssue.issue_type}
            </span>
            {currentIssue.auto_correctable && (
              <span className="badge badge-primary">
                <Sparkles className="w-3 h-3" />
                自動修正可
              </span>
            )}
          </div>

          {/* OCR Text (small) */}
          <div className="p-3 bg-gray-50 rounded-lg">
            <p className="text-xs text-gray-500 mb-1">OCR結果</p>
            <p className="text-sm font-mono text-gray-700 break-all">
              {currentIssue.ocr_text || '(テキストなし)'}
            </p>
          </div>

          {/* Generate candidates button */}
          {candidates.length === 0 && !isGenerating && (
            <button
              onClick={generateCandidates}
              className="w-full py-3 border-2 border-dashed border-gray-300 rounded-xl text-gray-500 hover:border-blue-400 hover:text-blue-500 transition-colors flex items-center justify-center gap-2"
            >
              <Sparkles className="w-4 h-4" />
              AI候補を生成
            </button>
          )}

          {/* AI Suggestion (prominent) */}
          {isGenerating ? (
            <div className="flex flex-col items-center py-6">
              <Loader2 className="w-6 h-6 text-blue-500 animate-spin mb-2" />
              <p className="text-sm text-gray-500">AI候補を生成中...</p>
            </div>
          ) : selectedCandidate ? (
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
              <div className="flex items-start justify-between mb-2">
                <p className="text-xs text-blue-600 font-medium">AI提案</p>
                {confidenceInfo && (
                  <span className={cn('px-1.5 py-0.5 text-xs font-medium rounded', confidenceInfo.color)}>
                    {confidenceInfo.label}
                  </span>
                )}
              </div>
              <p className="text-lg font-semibold text-gray-900 break-all">
                {selectedCandidate.text}
              </p>
              {selectedCandidate.reason && (
                <p className="text-xs text-gray-500 mt-2">{selectedCandidate.reason}</p>
              )}
            </div>
          ) : null}

          {/* Low confidence: show all candidates */}
          {isLowConfidence && candidates.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-700">候補を選択:</p>
              {candidates.map((candidate, index) => (
                <button
                  key={index}
                  onClick={() => setSelectedCandidateIndex(index)}
                  className={cn(
                    'w-full text-left p-3 rounded-lg border-2 transition-all',
                    selectedCandidateIndex === index
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-gray-900">{candidate.text}</span>
                    <span className={cn(
                      'text-xs px-1.5 py-0.5 rounded',
                      getConfidenceLevel(candidate.confidence).color
                    )}>
                      {Math.round(candidate.confidence * 100)}%
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Custom input */}
          {showCustomInput && (
            <div className="space-y-2 animate-slide-up">
              <input
                type="text"
                value={customText}
                onChange={(e) => setCustomText(e.target.value)}
                placeholder="正しいテキストを入力..."
                className="input-field text-sm"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && customText.trim()) {
                    handleApply();
                  }
                  if (e.key === 'Escape') {
                    setShowCustomInput(false);
                    setCustomText('');
                  }
                }}
              />
            </div>
          )}

          {/* Advanced: Method toggle (collapsed by default) */}
          <Accordion type="single">
            <AccordionItem value="advanced">
              <AccordionTrigger value="advanced" className="text-xs text-gray-500">
                詳細設定
              </AccordionTrigger>
              <AccordionContent value="advanced">
                <div className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg mt-2">
                  <span className="text-xs text-gray-500">修正方式:</span>
                  <button
                    onClick={() => setCorrectionMethod('text_overlay')}
                    className={cn(
                      'flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors',
                      correctionMethod === 'text_overlay'
                        ? 'bg-white shadow text-gray-900'
                        : 'text-gray-500 hover:text-gray-700'
                    )}
                  >
                    <Type className="w-3 h-3" />
                    合成
                  </button>
                  <button
                    onClick={() => setCorrectionMethod('nano_banana')}
                    className={cn(
                      'flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors',
                      correctionMethod === 'nano_banana'
                        ? 'bg-white shadow text-gray-900'
                        : 'text-gray-500 hover:text-gray-700'
                    )}
                  >
                    <Sparkles className="w-3 h-3" />
                    AI画像
                  </button>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </div>

      {/* Action buttons - fixed at bottom */}
      <div className="p-4 border-t border-gray-200 space-y-2 bg-white">
        <button
          onClick={handleApply}
          disabled={
            isApplying ||
            currentIssue.status === 'corrected' ||
            (!showCustomInput && selectedCandidateIndex === null) ||
            (showCustomInput && !customText.trim())
          }
          className={cn(
            'btn-primary w-full justify-center',
            isApplying && 'opacity-70'
          )}
          aria-label="適用して次へ (Enter)"
        >
          {isApplying ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <>
              適用して次へ
              <ChevronRight className="w-4 h-4" />
            </>
          )}
        </button>

        <div className="flex gap-2">
          <button
            onClick={() => setShowCustomInput(!showCustomInput)}
            className="btn-secondary btn-sm flex-1 justify-center"
            aria-label="手動入力 (E)"
          >
            <Edit3 className="w-4 h-4" />
            {showCustomInput ? 'キャンセル' : '手動入力'}
          </button>
          <button
            onClick={onSkip}
            className="btn-ghost btn-sm flex-1 justify-center"
            aria-label="スキップ (S)"
          >
            <SkipForward className="w-4 h-4" />
            スキップ
          </button>
        </div>
      </div>
    </aside>
  );
}
