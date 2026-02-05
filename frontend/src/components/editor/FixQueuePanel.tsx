'use client';

import { useState, useEffect } from 'react';
import {
  ChevronRight,
  ChevronLeft,
  Edit3,
  SkipForward,
  Loader2,
  Check,
  Sparkles,
  Type,
  Square,
} from 'lucide-react';
import { cn } from '@/lib/utils';

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
  onSelectIssue?: (issue: IssueForFixQueue) => void;
  onNext: () => void;
  onPrevious: () => void;
  onApply: (text: string, method: 'text_overlay' | 'ai_inpaint', candidateIndex?: number) => Promise<void>;
  onSkip: () => void;
  isApplying: boolean;
  pageWidth?: number;
  pageHeight?: number;
}

export function FixQueuePanel({
  issues,
  currentIssue,
  currentIndex,
  onNext,
  onPrevious,
  onApply,
  onSkip,
  isApplying,
}: FixQueuePanelProps) {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selectedCandidateIndex, setSelectedCandidateIndex] = useState<number | null>(null);
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customText, setCustomText] = useState('');
  const [correctionMethod, setCorrectionMethod] = useState<'text_overlay' | 'ai_inpaint'>('text_overlay');

  // Progress calculations
  const resolvedCount = issues.filter(
    (i) => i.status === 'corrected' || i.status === 'skipped'
  ).length;
  const totalCount = issues.length;

  // Load candidates when issue changes
  useEffect(() => {
    if (currentIssue?.candidates) {
      setCandidates(currentIssue.candidates);
      const highConfIdx = currentIssue.candidates.findIndex((c) => c.confidence > 0.85);
      setSelectedCandidateIndex(highConfIdx >= 0 ? highConfIdx : 0);
    } else if (currentIssue?.ocr_text) {
      setCandidates([{ text: currentIssue.ocr_text, confidence: 0.5, reason: 'OCR結果' }]);
      setSelectedCandidateIndex(0);
    } else {
      setCandidates([]);
      setSelectedCandidateIndex(null);
    }
    setShowCustomInput(false);
    setCustomText('');
  }, [currentIssue?.id]);

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

  // Empty state
  if (!currentIssue) {
    return (
      <aside className="w-[320px] bg-white border-l border-gray-200 flex flex-col flex-shrink-0">
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          {totalCount === 0 ? (
            <>
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4">
                <Square className="w-8 h-8 text-blue-600" />
              </div>
              <p className="text-lg font-semibold text-gray-900 mb-2">
                修正箇所を選択
              </p>
              <p className="text-sm text-gray-500 mb-6 leading-relaxed">
                左の画像上で<br />
                修正したい箇所をドラッグして<br />
                範囲を選択してください
              </p>
              <div className="p-4 bg-blue-50 rounded-xl text-left w-full">
                <p className="text-xs font-medium text-blue-800 mb-2">使い方</p>
                <ol className="text-xs text-blue-700 space-y-1.5">
                  <li className="flex items-start gap-2">
                    <span className="bg-blue-200 text-blue-800 w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5">1</span>
                    <span>画像上でドラッグして範囲選択</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="bg-blue-200 text-blue-800 w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5">2</span>
                    <span>修正テキストを入力</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="bg-blue-200 text-blue-800 w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5">3</span>
                    <span>「適用」で修正を反映</span>
                  </li>
                </ol>
              </div>
            </>
          ) : (
            <>
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
                <Check className="w-8 h-8 text-green-600" />
              </div>
              <p className="text-lg font-semibold text-gray-900 mb-2">
                すべて完了
              </p>
              <p className="text-sm text-gray-500">
                修正が完了しました。<br />
                右上の「書き出し」から保存できます。
              </p>
            </>
          )}
        </div>
      </aside>
    );
  }

  const selectedCandidate = selectedCandidateIndex !== null ? candidates[selectedCandidateIndex] : null;

  return (
    <aside className="w-[320px] bg-white border-l border-gray-200 flex flex-col flex-shrink-0">
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-gray-900">修正パネル</span>
          <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
            {resolvedCount}/{totalCount} 完了
          </span>
        </div>
      </div>

      {/* Navigation */}
      <div className="px-4 py-3 flex items-center justify-between border-b border-gray-100">
        <button
          onClick={onPrevious}
          disabled={currentIndex === 0}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-30"
        >
          <ChevronLeft className="w-5 h-5 text-gray-600" />
        </button>

        <span className="text-sm font-medium text-gray-700">
          Issue {currentIndex + 1} / {totalCount}
        </span>

        <button
          onClick={onNext}
          disabled={currentIndex === totalCount - 1}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-30"
        >
          <ChevronRight className="w-5 h-5 text-gray-600" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* OCR Text */}
        <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
          <p className="text-xs text-gray-500 mb-2">OCR結果</p>
          <p className="text-sm text-gray-900 font-mono break-all">
            {currentIssue.ocr_text || '(テキストなし)'}
          </p>
        </div>

        {/* Correction Method Toggle */}
        <div>
          <p className="text-xs text-gray-500 mb-2">修正方法</p>
          <div className="flex gap-2">
            <button
              onClick={() => setCorrectionMethod('text_overlay')}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border transition-colors',
                correctionMethod === 'text_overlay'
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
              )}
            >
              <Type className="w-4 h-4" />
              テキスト合成
            </button>
            <button
              onClick={() => setCorrectionMethod('ai_inpaint')}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border transition-colors',
                correctionMethod === 'ai_inpaint'
                  ? 'border-purple-500 bg-purple-50 text-purple-700'
                  : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
              )}
            >
              <Sparkles className="w-4 h-4" />
              AI修正
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-2">
            {correctionMethod === 'text_overlay'
              ? 'シンプルなテキスト置換（無料）'
              : 'Gemini AIで画像を再生成（10クレジット）'}
          </p>
        </div>

        {/* Candidates */}
        {candidates.length > 0 && (
          <div>
            <p className="text-xs text-gray-500 mb-2">修正候補</p>
            <div className="space-y-2">
              {candidates.map((candidate, index) => (
                <button
                  key={index}
                  onClick={() => {
                    setSelectedCandidateIndex(index);
                    setShowCustomInput(false);
                  }}
                  className={cn(
                    'w-full text-left p-3 rounded-lg border transition-all',
                    selectedCandidateIndex === index && !showCustomInput
                      ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500'
                      : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                  )}
                >
                  <p className="text-sm font-medium text-gray-900">{candidate.text}</p>
                  {candidate.reason && (
                    <p className="text-xs text-gray-500 mt-1">{candidate.reason}</p>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Custom input */}
        {showCustomInput && (
          <div>
            <p className="text-xs text-gray-500 mb-2">手動入力</p>
            <input
              type="text"
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              placeholder="正しいテキストを入力..."
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && customText.trim()) {
                  handleApply();
                }
              }}
            />
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="p-4 border-t border-gray-200 space-y-3 bg-gray-50">
        <button
          onClick={handleApply}
          disabled={
            isApplying ||
            currentIssue.status === 'corrected' ||
            (!showCustomInput && selectedCandidateIndex === null) ||
            (showCustomInput && !customText.trim())
          }
          className={cn(
            'w-full py-3 text-sm font-semibold rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2',
            correctionMethod === 'ai_inpaint'
              ? 'bg-purple-600 hover:bg-purple-700 text-white'
              : 'bg-blue-600 hover:bg-blue-700 text-white'
          )}
        >
          {isApplying ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              {correctionMethod === 'ai_inpaint' ? 'AI生成中...' : '適用中...'}
            </>
          ) : (
            <>
              {correctionMethod === 'ai_inpaint' ? (
                <>
                  <Sparkles className="w-4 h-4" />
                  AI修正を適用
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  適用して次へ
                </>
              )}
            </>
          )}
        </button>

        <div className="flex gap-2">
          <button
            onClick={() => {
              setShowCustomInput(!showCustomInput);
              if (!showCustomInput) setSelectedCandidateIndex(null);
            }}
            className="flex-1 py-2 text-sm font-medium text-gray-600 hover:bg-gray-200 rounded-lg transition-colors flex items-center justify-center gap-1.5"
          >
            <Edit3 className="w-4 h-4" />
            {showCustomInput ? 'キャンセル' : '手動入力'}
          </button>
          <button
            onClick={onSkip}
            className="flex-1 py-2 text-sm font-medium text-gray-600 hover:bg-gray-200 rounded-lg transition-colors flex items-center justify-center gap-1.5"
          >
            <SkipForward className="w-4 h-4" />
            スキップ
          </button>
        </div>
      </div>
    </aside>
  );
}
