'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  Edit3,
  SkipForward,
  Undo2,
  Loader2,
  Wand2,
  Type,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useProjectStore } from '@/store/project';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { formatConfidence, getIssueTypeLabel } from '@/lib/utils';
import api, { type Candidate } from '@/lib/api';

export function IssuePanel() {
  const {
    issues,
    selectedIssue,
    currentIssueIndex,
    candidates,
    selectedCandidateIndex,
    isGeneratingCandidates,
    isApplyingCorrection,
    selectNextIssue,
    selectPreviousIssue,
    setCandidates,
    setSelectedCandidateIndex,
    setIsGeneratingCandidates,
    setIsApplyingCorrection,
    updateIssueStatus,
  } = useProjectStore();

  const [customText, setCustomText] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [correctionMethod, setCorrectionMethod] = useState<'text_overlay' | 'nano_banana'>('text_overlay');

  // Filter active issues
  const activeIssues = issues.filter(
    (i) => i.status !== 'corrected' && i.status !== 'skipped'
  );
  const totalIssues = issues.length;
  const resolvedCount = issues.filter(
    (i) => i.status === 'corrected' || i.status === 'skipped'
  ).length;

  // Generate candidates when issue changes
  useEffect(() => {
    if (selectedIssue && !selectedIssue.candidates && !isGeneratingCandidates) {
      handleGenerateCandidates();
    }
  }, [selectedIssue?.id]);

  const handleGenerateCandidates = async () => {
    if (!selectedIssue) return;

    setIsGeneratingCandidates(true);
    try {
      const result = await api.generateCandidates(selectedIssue.id);
      setCandidates(result.candidates);
      if (result.auto_adopt && result.selected_index !== null) {
        setSelectedCandidateIndex(result.selected_index);
      }
    } catch (error) {
      console.error('Failed to generate candidates:', error);
    } finally {
      setIsGeneratingCandidates(false);
    }
  };

  const handleApplyCorrection = async (text: string, candidateIndex?: number) => {
    if (!selectedIssue) return;

    setIsApplyingCorrection(true);
    try {
      await api.applyCorrection(
        selectedIssue.id,
        correctionMethod,
        text,
        candidateIndex
      );
      updateIssueStatus(selectedIssue.id, 'corrected');
      // Move to next issue
      setTimeout(() => {
        selectNextIssue();
      }, 300);
    } catch (error) {
      console.error('Failed to apply correction:', error);
    } finally {
      setIsApplyingCorrection(false);
    }
  };

  const handleSkip = async () => {
    if (!selectedIssue) return;

    try {
      await api.updateIssueStatus(selectedIssue.id, 'skipped');
      updateIssueStatus(selectedIssue.id, 'skipped');
      selectNextIssue();
    } catch (error) {
      console.error('Failed to skip issue:', error);
    }
  };

  if (!selectedIssue) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mb-4">
          <CheckCircle2 className="w-8 h-8 text-gray-400" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">
          Issueを選択
        </h3>
        <p className="text-gray-500 text-sm">
          左のページから修正箇所を<br />クリックしてください
        </p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header with progress */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-gray-900">自動修正</h2>
          <Badge variant={resolvedCount === totalIssues ? 'success' : 'warning'}>
            {resolvedCount}/{totalIssues} 完了
          </Badge>
        </div>

        {/* Progress bar */}
        <div className="w-full bg-gray-200 rounded-full h-1.5">
          <motion.div
            className="h-full bg-gradient-to-r from-primary-500 to-success-500 rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${(resolvedCount / totalIssues) * 100}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
      </div>

      {/* Issue navigation */}
      <div className="px-4 py-3 flex items-center justify-between border-b border-gray-100">
        <button
          onClick={selectPreviousIssue}
          disabled={currentIssueIndex === 0}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-30"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        <span className="text-sm font-medium text-gray-600">
          Issue {currentIssueIndex + 1} / {issues.length}
        </span>

        <button
          onClick={selectNextIssue}
          disabled={currentIssueIndex === issues.length - 1}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-30"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Issue details */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Issue type and confidence */}
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="warning">
            <AlertTriangle className="w-3 h-3 mr-1" />
            {getIssueTypeLabel(selectedIssue.issue_type)}
          </Badge>
          {selectedIssue.confidence && (
            <Badge variant="default">
              信頼度: {formatConfidence(selectedIssue.confidence)}
            </Badge>
          )}
          {selectedIssue.auto_correctable && (
            <Badge variant="primary">
              <Sparkles className="w-3 h-3 mr-1" />
              自動修正可
            </Badge>
          )}
        </div>

        {/* OCR Text */}
        <Card padding="sm" className="bg-gray-50">
          <p className="text-xs text-gray-500 mb-1">OCR結果</p>
          <p className="text-sm font-mono text-gray-900 break-all">
            {selectedIssue.ocr_text || '(テキストなし)'}
          </p>
        </Card>

        {/* Detected problems */}
        {selectedIssue.detected_problems.length > 0 && (
          <div className="text-xs text-gray-500 space-y-1">
            {selectedIssue.detected_problems.map((problem, i) => (
              <p key={i}>• {problem}</p>
            ))}
          </div>
        )}

        {/* Candidates */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-gray-900">修正候補</h4>
            <button
              onClick={handleGenerateCandidates}
              disabled={isGeneratingCandidates}
              className="text-xs text-primary-600 hover:text-primary-700 flex items-center gap-1"
            >
              <Wand2 className="w-3 h-3" />
              再生成
            </button>
          </div>

          <AnimatePresence mode="wait">
            {isGeneratingCandidates ? (
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center py-8"
              >
                <Loader2 className="w-8 h-8 text-primary-500 animate-spin mb-3" />
                <p className="text-sm text-gray-500">AIが候補を生成中...</p>
              </motion.div>
            ) : candidates.length > 0 ? (
              <motion.div
                key="candidates"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-2"
              >
                {candidates.map((candidate, index) => (
                  <CandidateCard
                    key={index}
                    candidate={candidate}
                    isSelected={selectedCandidateIndex === index}
                    onSelect={() => setSelectedCandidateIndex(index)}
                  />
                ))}
              </motion.div>
            ) : (
              <motion.p
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-sm text-gray-500 text-center py-4"
              >
                候補がありません
              </motion.p>
            )}
          </AnimatePresence>
        </div>

        {/* Custom input */}
        {showCustomInput && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="space-y-2"
          >
            <input
              type="text"
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              placeholder="正しいテキストを入力..."
              className="input-field text-sm"
              autoFocus
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setShowCustomInput(false);
                  setCustomText('');
                }}
                className="flex-1"
              >
                キャンセル
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  handleApplyCorrection(customText);
                  setShowCustomInput(false);
                  setCustomText('');
                }}
                disabled={!customText.trim() || isApplyingCorrection}
                isLoading={isApplyingCorrection}
                className="flex-1"
              >
                適用
              </Button>
            </div>
          </motion.div>
        )}

        {/* Correction method toggle */}
        <div className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
          <span className="text-xs text-gray-500">方式:</span>
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
            テキスト合成
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
            AI画像修正
          </button>
        </div>
      </div>

      {/* Action buttons */}
      <div className="p-4 border-t border-gray-200 space-y-2">
        <Button
          onClick={() => {
            if (selectedCandidateIndex !== null && candidates[selectedCandidateIndex]) {
              handleApplyCorrection(
                candidates[selectedCandidateIndex].text,
                selectedCandidateIndex
              );
            }
          }}
          disabled={
            selectedCandidateIndex === null ||
            isApplyingCorrection ||
            selectedIssue.status === 'corrected'
          }
          isLoading={isApplyingCorrection}
          className="w-full"
          rightIcon={<ChevronRight className="w-4 h-4" />}
        >
          適用して次へ
        </Button>

        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowCustomInput(!showCustomInput)}
            leftIcon={<Edit3 className="w-4 h-4" />}
            className="flex-1"
          >
            手動入力
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSkip}
            leftIcon={<SkipForward className="w-4 h-4" />}
            className="flex-1"
          >
            スキップ
          </Button>
        </div>
      </div>
    </div>
  );
}

// Candidate Card Component
function CandidateCard({
  candidate,
  isSelected,
  onSelect,
}: {
  candidate: Candidate;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={cn(
        'w-full text-left p-3 rounded-xl border-2 transition-all duration-200',
        'hover:shadow-md',
        isSelected
          ? 'border-primary-500 bg-primary-50 shadow-md'
          : 'border-gray-200 bg-white hover:border-gray-300'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium text-gray-900 break-all">{candidate.text}</p>
        <Badge
          variant={
            candidate.confidence > 0.85
              ? 'success'
              : candidate.confidence > 0.7
              ? 'warning'
              : 'default'
          }
          size="sm"
        >
          {Math.round(candidate.confidence * 100)}%
        </Badge>
      </div>
      {candidate.reason && (
        <p className="text-xs text-gray-500 mt-1">{candidate.reason}</p>
      )}
    </button>
  );
}
