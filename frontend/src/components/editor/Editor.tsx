'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { TopBar } from './TopBar';
import { StatusBar } from './StatusBar';
import { PagesPanel } from './PagesPanel';
import { CanvasViewer } from './CanvasViewer';
import { FixQueuePanel } from './FixQueuePanel';
import { ExportPanel } from '@/components/panels/ExportPanel';
import { useToast } from '@/components/ui/Toast';
import { useAppStore, generateId, type Issue, type BBox } from '@/lib/store';

interface EditorProps {
  projectId: string;
}

export function Editor({ projectId }: EditorProps) {
  const router = useRouter();
  const { addToast } = useToast();

  // Get project from store
  const project = useAppStore((state) =>
    state.projects.find((p) => p.id === projectId)
  );
  const updateProject = useAppStore((state) => state.updateProject);
  const addIssue = useAppStore((state) => state.addIssue);
  const updateIssue = useAppStore((state) => state.updateIssue);
  const deleteIssue = useAppStore((state) => state.deleteIssue);

  // UI state
  const [isLoading, setIsLoading] = useState(true);
  const [currentPageNumber, setCurrentPageNumber] = useState(1);
  const [currentIssueIndex, setCurrentIssueIndex] = useState(0);
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null);
  const [zoom, setZoom] = useState(1);
  const [autoFixEnabled, setAutoFixEnabled] = useState(true);
  const [showExportPanel, setShowExportPanel] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [undoStack, setUndoStack] = useState<{ issueId: string; previousImageDataUrl: string }[]>([]);
  const [jobStatus, setJobStatus] = useState<{ type: 'ocr' | 'generate' | 'export'; message: string } | null>(null);

  // Initialize after mount
  useEffect(() => {
    if (project) {
      setIsLoading(false);
      // Select first unresolved issue
      const firstUnresolved = project.issues.find(
        (i) => i.status !== 'corrected' && i.status !== 'skipped'
      );
      if (firstUnresolved) {
        setSelectedIssue(firstUnresolved);
        setCurrentIssueIndex(project.issues.indexOf(firstUnresolved));
        setCurrentPageNumber(firstUnresolved.pageNumber);
      } else if (project.issues.length > 0) {
        setSelectedIssue(project.issues[0]);
        setCurrentPageNumber(project.issues[0].pageNumber);
      }
    } else {
      setIsLoading(false);
    }
  }, [project?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Memoized values
  const issues = useMemo(() => project?.issues || [], [project?.issues]);
  const pages = useMemo(() => project?.pages || [], [project?.pages]);

  const currentPage = useMemo(
    () => pages.find((p) => p.pageNumber === currentPageNumber),
    [pages, currentPageNumber]
  );

  const pageIssues = useMemo(
    () => issues.filter((i) => i.pageNumber === currentPageNumber),
    [issues, currentPageNumber]
  );

  const resolvedCount = useMemo(
    () => issues.filter((i) => i.status === 'corrected' || i.status === 'skipped').length,
    [issues]
  );

  // Handlers
  const handlePageSelect = useCallback((pageNumber: number) => {
    setCurrentPageNumber(pageNumber);
    const pageIssue = issues.find((i) => i.pageNumber === pageNumber);
    if (pageIssue) {
      setSelectedIssue(pageIssue);
      setCurrentIssueIndex(issues.indexOf(pageIssue));
    }
  }, [issues]);

  const handleIssueSelect = useCallback((issue: Issue) => {
    setSelectedIssue(issue);
    setCurrentIssueIndex(issues.indexOf(issue));
    setCurrentPageNumber(issue.pageNumber);
  }, [issues]);

  const handleNextIssue = useCallback(() => {
    if (currentIssueIndex < issues.length - 1) {
      const nextIssue = issues[currentIssueIndex + 1];
      setSelectedIssue(nextIssue);
      setCurrentIssueIndex(currentIssueIndex + 1);
      setCurrentPageNumber(nextIssue.pageNumber);
    }
  }, [currentIssueIndex, issues]);

  const handlePreviousIssue = useCallback(() => {
    if (currentIssueIndex > 0) {
      const prevIssue = issues[currentIssueIndex - 1];
      setSelectedIssue(prevIssue);
      setCurrentIssueIndex(currentIssueIndex - 1);
      setCurrentPageNumber(prevIssue.pageNumber);
    }
  }, [currentIssueIndex, issues]);

  const handleApply = useCallback(async (
    text: string,
    method: 'text_overlay' | 'nano_banana',
    candidateIndex?: number
  ) => {
    if (!selectedIssue || !project || !currentPage) return;

    setIsApplying(true);
    try {
      // Dynamic import to avoid SSR issues
      const { applyTextOverlay } = await import('@/lib/pdf-utils');

      // Save current image for undo
      const previousImageDataUrl = currentPage.imageDataUrl;

      // Apply text overlay to the image
      const newImageDataUrl = await applyTextOverlay(
        currentPage.imageDataUrl,
        selectedIssue.bbox,
        text,
        {
          fontSize: Math.min(selectedIssue.bbox.height * 0.8, 24),
          fontFamily: 'Noto Sans JP, sans-serif',
          color: '#000000',
          backgroundColor: '#ffffff',
        }
      );

      // Update page image in store
      const updatedPages = project.pages.map((p) =>
        p.pageNumber === currentPageNumber
          ? { ...p, imageDataUrl: newImageDataUrl }
          : p
      );

      updateProject(projectId, { pages: updatedPages });

      // Update issue status
      updateIssue(projectId, selectedIssue.id, {
        status: 'corrected',
        correctedText: text,
      });

      // Add to undo stack
      setUndoStack((prev) => [...prev, {
        issueId: selectedIssue.id,
        previousImageDataUrl,
      }]);

      addToast('success', '修正を適用しました');

      // Move to next unresolved issue
      const nextUnresolved = issues.find(
        (i, idx) => idx > currentIssueIndex && i.status !== 'corrected' && i.status !== 'skipped'
      );
      if (nextUnresolved) {
        setTimeout(() => handleIssueSelect(nextUnresolved), 100);
      } else {
        handleNextIssue();
      }
    } catch (err) {
      console.error('Apply correction error:', err);
      addToast('error', '修正の適用に失敗しました');
    } finally {
      setIsApplying(false);
    }
  }, [selectedIssue, project, currentPage, currentPageNumber, projectId, issues, currentIssueIndex, updateProject, updateIssue, handleIssueSelect, handleNextIssue, addToast]);

  const handleSkip = useCallback(() => {
    if (!selectedIssue) return;

    updateIssue(projectId, selectedIssue.id, { status: 'skipped' });
    addToast('warning', 'スキップしました');
    handleNextIssue();
  }, [selectedIssue, projectId, updateIssue, handleNextIssue, addToast]);

  const handleUndo = useCallback(() => {
    if (undoStack.length === 0 || !project) return;

    const lastUndo = undoStack[undoStack.length - 1];

    // Find the page that was modified
    const issue = issues.find((i) => i.id === lastUndo.issueId);
    if (issue) {
      // Restore the previous image
      const updatedPages = project.pages.map((p) =>
        p.pageNumber === issue.pageNumber
          ? { ...p, imageDataUrl: lastUndo.previousImageDataUrl }
          : p
      );

      updateProject(projectId, { pages: updatedPages });

      // Reset issue status
      updateIssue(projectId, lastUndo.issueId, {
        status: 'detected',
        correctedText: undefined,
      });

      setUndoStack((prev) => prev.slice(0, -1));
      addToast('success', '元に戻しました');
    }
  }, [undoStack, project, issues, projectId, updateProject, updateIssue, addToast]);

  const handleExportPdf = useCallback(() => {
    setShowExportPanel(true);
  }, []);

  const handleExportPptx = useCallback(() => {
    setShowExportPanel(true);
  }, []);

  // Create issue from canvas selection
  const handleCreateIssue = useCallback((bbox: BBox) => {
    const newIssue: Issue = {
      id: generateId(),
      pageNumber: currentPageNumber,
      bbox,
      ocrText: '',
      issueType: 'manual',
      status: 'detected',
    };

    addIssue(projectId, newIssue);
    setSelectedIssue(newIssue);
    setCurrentIssueIndex(issues.length);
    addToast('success', 'Issue を追加しました');
  }, [projectId, currentPageNumber, issues.length, addIssue, addToast]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (e.key.toLowerCase()) {
        case 'j':
          handleNextIssue();
          break;
        case 'k':
          handlePreviousIssue();
          break;
        case 's':
          if (!e.ctrlKey && !e.metaKey) {
            handleSkip();
          }
          break;
        case 'u':
          handleUndo();
          break;
        case 'z':
          if (!e.ctrlKey && !e.metaKey) {
            setZoom((prev) => Math.min(4, prev + 0.25));
          }
          break;
        case 'x':
          setZoom((prev) => Math.max(0.25, prev - 0.25));
          break;
        case 'f':
          setZoom(1);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleNextIssue, handlePreviousIssue, handleSkip, handleUndo]);

  // Loading state
  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="w-10 h-10 text-blue-500 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">プロジェクトを読み込み中...</p>
        </div>
      </div>
    );
  }

  // Error state - project not found
  if (!project) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center max-w-md">
          <p className="text-red-600 mb-4">プロジェクトが見つかりません</p>
          <button
            onClick={() => router.push('/')}
            className="btn-secondary"
          >
            ホームに戻る
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-100">
      <TopBar
        projectName={project.name}
        totalPages={project.totalPages}
        autoFixEnabled={autoFixEnabled}
        onAutoFixToggle={() => setAutoFixEnabled(!autoFixEnabled)}
        onExportPdf={handleExportPdf}
        onExportPptx={handleExportPptx}
        onUndo={handleUndo}
        canUndo={undoStack.length > 0}
      />

      <div className="flex-1 flex overflow-hidden">
        <PagesPanel
          pages={pages.map((p) => ({
            id: `page-${p.pageNumber}`,
            page_number: p.pageNumber,
            thumbnail_url: p.thumbnailDataUrl,
            width: p.width,
            height: p.height,
            ocr_status: 'complete',
            issue_count: issues.filter((i) => i.pageNumber === p.pageNumber).length,
            has_unresolved_issues: issues.some(
              (i) => i.pageNumber === p.pageNumber && i.status !== 'corrected' && i.status !== 'skipped'
            ),
          }))}
          issues={issues.map((i) => ({
            id: i.id,
            page_id: `page-${i.pageNumber}`,
            page_number: i.pageNumber,
            bbox: i.bbox,
            issue_type: i.issueType,
            confidence: i.confidence || null,
            ocr_text: i.ocrText,
            detected_problems: [],
            status: i.status,
            auto_correctable: true,
          }))}
          projectId={projectId}
          currentPageNumber={currentPageNumber}
          onPageSelect={handlePageSelect}
        />

        {currentPage ? (
          <CanvasViewer
            imageUrl={currentPage.imageDataUrl}
            pageWidth={currentPage.width}
            pageHeight={currentPage.height}
            issues={pageIssues.map((i) => ({
              id: i.id,
              page_id: `page-${i.pageNumber}`,
              page_number: i.pageNumber,
              bbox: i.bbox,
              issue_type: i.issueType,
              confidence: i.confidence || null,
              ocr_text: i.ocrText,
              detected_problems: [],
              status: i.status,
              auto_correctable: true,
            }))}
            selectedIssueId={selectedIssue?.id || null}
            onIssueClick={(issue) => {
              const storeIssue = issues.find((i) => i.id === issue.id);
              if (storeIssue) handleIssueSelect(storeIssue);
            }}
            onCreateIssue={handleCreateIssue}
            zoom={zoom}
            onZoomChange={setZoom}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center bg-gray-100">
            <p className="text-gray-500">ページを選択してください</p>
          </div>
        )}

        <FixQueuePanel
          issues={issues.map((i) => ({
            id: i.id,
            page_id: `page-${i.pageNumber}`,
            page_number: i.pageNumber,
            bbox: i.bbox,
            issue_type: i.issueType,
            confidence: i.confidence || null,
            ocr_text: i.ocrText,
            detected_problems: [],
            status: i.status,
            auto_correctable: true,
            candidates: i.candidates,
          }))}
          currentIssue={selectedIssue ? {
            id: selectedIssue.id,
            page_id: `page-${selectedIssue.pageNumber}`,
            page_number: selectedIssue.pageNumber,
            bbox: selectedIssue.bbox,
            issue_type: selectedIssue.issueType,
            confidence: selectedIssue.confidence || null,
            ocr_text: selectedIssue.ocrText,
            detected_problems: [],
            status: selectedIssue.status,
            auto_correctable: true,
            candidates: selectedIssue.candidates,
          } : null}
          currentIndex={currentIssueIndex}
          onSelectIssue={(issue) => {
            const storeIssue = issues.find((i) => i.id === issue.id);
            if (storeIssue) handleIssueSelect(storeIssue);
          }}
          onNext={handleNextIssue}
          onPrevious={handlePreviousIssue}
          onApply={handleApply}
          onSkip={handleSkip}
          isApplying={isApplying}
        />
      </div>

      <StatusBar
        resolvedCount={resolvedCount}
        totalCount={issues.length}
        jobStatus={jobStatus}
      />

      <ExportPanel
        projectId={projectId}
        isOpen={showExportPanel}
        onClose={() => setShowExportPanel(false)}
      />
    </div>
  );
}
