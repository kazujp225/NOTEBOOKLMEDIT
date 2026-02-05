'use client';

import { useState, useEffect } from 'react';
import {
  ChevronRight,
  ChevronLeft,
  Edit3,
  SkipForward,
  Loader2,
  Check,
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
  onApply: (text: string, method: 'text_overlay' | 'nano_banana', candidateIndex?: number) => Promise<void>;
  onSkip: () => void;
  isApplying: boolean;
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

    await onApply(text, 'text_overlay', candidateIdx);
    setCustomText('');
    setShowCustomInput(false);
    setSelectedCandidateIndex(null);
  };

  // Empty state
  if (!currentIssue) {
    return (
      <aside className="w-[280px] bg-gray-100 border-l border-gray-300 flex flex-col flex-shrink-0">
        <div className="flex-1 flex flex-col items-center justify-center p-4 text-center">
          <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center mb-3">
            <Check className="w-5 h-5 text-green-600" />
          </div>
          <p className="text-sm font-medium text-gray-900 mb-1">
            {totalCount === 0 ? 'Issue なし' : '完了'}
          </p>
          <p className="text-xs text-gray-500">
            {totalCount === 0
              ? 'ドラッグで範囲を選択'
              : '書き出しできます'}
          </p>
        </div>
      </aside>
    );
  }

  const selectedCandidate = selectedCandidateIndex !== null ? candidates[selectedCandidateIndex] : null;

  return (
    <aside className="w-[280px] bg-gray-100 border-l border-gray-300 flex flex-col flex-shrink-0">
      {/* Header */}
      <div className="p-3 border-b border-gray-300 bg-gray-200">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-gray-700">Issue</span>
          <span className="text-xs text-gray-500">
            {resolvedCount}/{totalCount}
          </span>
        </div>
      </div>

      {/* Navigation */}
      <div className="px-3 py-2 flex items-center justify-between border-b border-gray-200">
        <button
          onClick={onPrevious}
          disabled={currentIndex === 0}
          className="p-1 hover:bg-gray-200 rounded transition-colors disabled:opacity-30"
        >
          <ChevronLeft className="w-4 h-4 text-gray-600" />
        </button>

        <span className="text-xs text-gray-600">
          {currentIndex + 1} / {totalCount}
        </span>

        <button
          onClick={onNext}
          disabled={currentIndex === totalCount - 1}
          className="p-1 hover:bg-gray-200 rounded transition-colors disabled:opacity-30"
        >
          <ChevronRight className="w-4 h-4 text-gray-600" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* OCR Text */}
        <div className="p-2 bg-white rounded border border-gray-200">
          <p className="text-[10px] text-gray-400 mb-1">OCR結果</p>
          <p className="text-sm text-gray-800 font-mono break-all">
            {currentIssue.ocr_text || '(なし)'}
          </p>
        </div>

        {/* Candidates */}
        {candidates.length > 0 && (
          <div className="space-y-1">
            <p className="text-[10px] text-gray-500">修正候補</p>
            {candidates.map((candidate, index) => (
              <button
                key={index}
                onClick={() => {
                  setSelectedCandidateIndex(index);
                  setShowCustomInput(false);
                }}
                className={cn(
                  'w-full text-left p-2 rounded border transition-colors text-sm',
                  selectedCandidateIndex === index && !showCustomInput
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                )}
              >
                {candidate.text}
              </button>
            ))}
          </div>
        )}

        {/* Custom input */}
        {showCustomInput && (
          <div>
            <p className="text-[10px] text-gray-500 mb-1">手動入力</p>
            <input
              type="text"
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              placeholder="テキストを入力..."
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500"
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
      <div className="p-3 border-t border-gray-300 space-y-2 bg-gray-200">
        <button
          onClick={handleApply}
          disabled={
            isApplying ||
            currentIssue.status === 'corrected' ||
            (!showCustomInput && selectedCandidateIndex === null) ||
            (showCustomInput && !customText.trim())
          }
          className="w-full py-2 bg-gray-900 text-white text-sm font-medium rounded hover:bg-gray-800 transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-1"
        >
          {isApplying ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <>
              適用
              <ChevronRight className="w-4 h-4" />
            </>
          )}
        </button>

        <div className="flex gap-2">
          <button
            onClick={() => {
              setShowCustomInput(!showCustomInput);
              if (!showCustomInput) setSelectedCandidateIndex(null);
            }}
            className="flex-1 py-1.5 text-xs text-gray-600 hover:bg-gray-300 rounded transition-colors flex items-center justify-center gap-1"
          >
            <Edit3 className="w-3 h-3" />
            {showCustomInput ? 'キャンセル' : '手動'}
          </button>
          <button
            onClick={onSkip}
            className="flex-1 py-1.5 text-xs text-gray-600 hover:bg-gray-300 rounded transition-colors flex items-center justify-center gap-1"
          >
            <SkipForward className="w-3 h-3" />
            スキップ
          </button>
        </div>
      </div>
    </aside>
  );
}
