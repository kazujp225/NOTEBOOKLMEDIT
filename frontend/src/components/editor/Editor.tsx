'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { TopBar } from './TopBar';
import { StatusBar } from './StatusBar';
import { PagesPanel } from './PagesPanel';
import { CanvasViewer } from './CanvasViewer';
import { FixQueuePanel, type AIInpaintOptions, type TextStyle } from './FixQueuePanel';
import { ExportPanel } from '@/components/panels/ExportPanel';
import { useToast } from '@/components/ui/Toast';
import { useAppStore, generateId, type Issue, type BBox, type PageData, type ProjectWithImages } from '@/lib/store';
import { saveImage, getImage } from '@/lib/image-store';

interface EditorProps {
  projectId: string;
}

export function Editor({ projectId }: EditorProps) {
  const router = useRouter();
  const { addToast } = useToast();

  // Get project metadata from store
  const projectMeta = useAppStore((state) =>
    state.projects.find((p) => p.id === projectId)
  );
  const loadProjectWithImages = useAppStore((state) => state.loadProjectWithImages);
  const updateProject = useAppStore((state) => state.updateProject);
  const addIssue = useAppStore((state) => state.addIssue);
  const updateIssue = useAppStore((state) => state.updateIssue);
  const deleteIssue = useAppStore((state) => state.deleteIssue);

  // Loaded project with images
  const [project, setProject] = useState<ProjectWithImages | null>(null);

  // UI state
  const [isLoading, setIsLoading] = useState(true);
  const [currentPageNumber, setCurrentPageNumber] = useState(1);
  const [currentIssueIndex, setCurrentIssueIndex] = useState(0);
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null);
  const [zoom, setZoom] = useState(1);
  const [autoFixEnabled, setAutoFixEnabled] = useState(true);
  const [showExportPanel, setShowExportPanel] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [undoStack, setUndoStack] = useState<{ issueId: string; pageNumber: number; previousImageDataUrl: string }[]>([]);
  const [redoStack, setRedoStack] = useState<{ issueId: string; pageNumber: number; previousImageDataUrl: string }[]>([]);
  const [jobStatus, setJobStatus] = useState<{ type: 'ocr' | 'generate' | 'export'; message: string } | null>(null);
  const [regionPreviewUrl, setRegionPreviewUrl] = useState<string | null>(null);

  // Load project images from IndexedDB
  useEffect(() => {
    async function loadProject() {
      if (!projectMeta) {
        setIsLoading(false);
        return;
      }

      try {
        const loadedProject = await loadProjectWithImages(projectId);
        if (loadedProject) {
          setProject(loadedProject);

          // Select first unresolved issue
          const firstUnresolved = loadedProject.issues.find(
            (i) => i.status !== 'corrected' && i.status !== 'skipped'
          );
          if (firstUnresolved) {
            setSelectedIssue(firstUnresolved);
            setCurrentIssueIndex(loadedProject.issues.indexOf(firstUnresolved));
            setCurrentPageNumber(firstUnresolved.pageNumber);
          } else if (loadedProject.issues.length > 0) {
            setSelectedIssue(loadedProject.issues[0]);
            setCurrentPageNumber(loadedProject.issues[0].pageNumber);
          }
        }
      } catch (err) {
        console.error('Failed to load project:', err);
        addToast('error', 'プロジェクトの読み込みに失敗しました');
      } finally {
        setIsLoading(false);
      }
    }

    loadProject();
  }, [projectId, projectMeta, loadProjectWithImages, addToast]);

  // Sync issues from store when they change
  useEffect(() => {
    if (project && projectMeta) {
      setProject((prev) => prev ? { ...prev, issues: projectMeta.issues } : null);
    }
  }, [projectMeta?.issues]);

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

  // Generate region preview when issue selection changes
  useEffect(() => {
    if (!selectedIssue || !currentPage) {
      setRegionPreviewUrl(null);
      return;
    }

    // Create a canvas to crop the region
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const { x, y, width, height } = selectedIssue.bbox;
      // Add some padding
      const padding = 20;
      const cropX = Math.max(0, x - padding);
      const cropY = Math.max(0, y - padding);
      const cropW = Math.min(width + padding * 2, img.width - cropX);
      const cropH = Math.min(height + padding * 2, img.height - cropY);

      canvas.width = cropW;
      canvas.height = cropH;

      ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

      setRegionPreviewUrl(canvas.toDataURL('image/png'));
    };
    img.src = currentPage.imageDataUrl;
  }, [selectedIssue?.id, selectedIssue?.bbox, currentPage?.imageDataUrl]);

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
    method: 'text_overlay' | 'ai_inpaint',
    candidateIndex?: number,
    aiOptions?: AIInpaintOptions,
    textStyle?: TextStyle
  ) => {
    if (!selectedIssue || !project || !currentPage) return;

    setIsApplying(true);
    try {
      // Save current image for undo
      const previousImageDataUrl = currentPage.imageDataUrl;
      let newImageDataUrl: string;

      if (method === 'ai_inpaint') {
        // Use Gemini AI for inpainting
        const { inpaintImage } = await import('@/lib/gemini');

        // Get base64 data URL from IndexedDB (ObjectURL can't be sent to API)
        const imageKey = `${projectId}/page-${currentPageNumber}`;
        const imageBase64 = await getImage(imageKey);
        if (!imageBase64) {
          throw new Error('画像データを取得できませんでした');
        }

        // Convert bbox to 0-1 ratio
        const mask = {
          x: selectedIssue.bbox.x / currentPage.width,
          y: selectedIssue.bbox.y / currentPage.height,
          width: selectedIssue.bbox.width / currentPage.width,
          height: selectedIssue.bbox.height / currentPage.height,
        };

        // Build prompt based on edit mode and input content
        const isObjectEdit = selectedIssue.editMode === 'object';
        let inpaintPrompt: string;

        if (isObjectEdit) {
          // Object mode: user input is always an instruction
          inpaintPrompt = `この画像の指定された領域について: ${text}。周囲のデザインと調和するようにしてください。`;
        } else {
          // Text mode with AI edit: detect if input is an instruction or replacement text
          const isInstruction = /[してくれ|ください|変えて|消して|削除|除去|なくし|修正|変更|大きく|小さく|太く|薄く|濃く|明るく|暗く]/.test(text) || text.length > 30;
          if (isInstruction) {
            // User is giving an instruction (e.g., "この文字を消して")
            inpaintPrompt = `この画像の指定された領域について: ${text}。周囲のデザインと自然に調和するようにしてください。`;
          } else {
            // User is providing replacement text (e.g., "正しいテキスト")
            inpaintPrompt = `この領域のテキスト「${selectedIssue.ocrText || ''}」を「${text}」に修正してください。フォント・サイズ・色は元のテキストと同じにし、周囲のデザインと調和するようにしてください。`;
          }
        }

        const result = await inpaintImage({
          imageBase64,
          masks: [mask],
          prompt: inpaintPrompt,
          referenceDesign: aiOptions?.referenceDesign,
          referenceImageBase64: aiOptions?.referenceImageBase64,
          outputSize: aiOptions?.outputSize || '4K',
        });

        if (!result.success || !result.imageBase64) {
          throw new Error(result.error || 'AI修正に失敗しました');
        }

        newImageDataUrl = result.imageBase64;
        addToast('success', 'AI修正を適用しました');
      } else {
        // Use simple text overlay with custom text style
        const { applyTextOverlay } = await import('@/lib/pdf-utils');

        newImageDataUrl = await applyTextOverlay(
          currentPage.imageDataUrl,
          selectedIssue.bbox,
          text,
          {
            fontSize: textStyle?.fontSize || Math.min(selectedIssue.bbox.height * 0.8, 24),
            fontFamily: textStyle?.fontFamily || 'Noto Sans JP, sans-serif',
            color: textStyle?.color || '#000000',
            backgroundColor: textStyle?.backgroundColor || '#ffffff',
            fontWeight: textStyle?.fontWeight,
            fontStyle: textStyle?.fontStyle,
            textAlign: textStyle?.textAlign,
          }
        );
        addToast('success', '修正を適用しました');
      }

      // Save new image to IndexedDB
      const imageKey = `${projectId}/page-${currentPageNumber}`;
      await saveImage(imageKey, newImageDataUrl);

      // Update local state
      setProject((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          pages: prev.pages.map((p) =>
            p.pageNumber === currentPageNumber
              ? { ...p, imageDataUrl: newImageDataUrl }
              : p
          ),
        };
      });

      // Update issue status in store
      updateIssue(projectId, selectedIssue.id, {
        status: 'corrected',
        correctedText: text,
      });

      // Add to undo stack (limit to 20 entries) and clear redo stack
      setUndoStack((prev) => [...prev, {
        issueId: selectedIssue.id,
        pageNumber: currentPageNumber,
        previousImageDataUrl,
      }].slice(-20));
      setRedoStack([]);

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
      addToast('error', err instanceof Error ? err.message : '修正の適用に失敗しました');
    } finally {
      setIsApplying(false);
    }
  }, [selectedIssue, project, currentPage, currentPageNumber, projectId, issues, currentIssueIndex, updateIssue, handleIssueSelect, handleNextIssue, addToast]);

  const handleSkip = useCallback(() => {
    if (!selectedIssue) return;

    updateIssue(projectId, selectedIssue.id, { status: 'skipped' });
    addToast('warning', 'スキップしました');
    handleNextIssue();
  }, [selectedIssue, projectId, updateIssue, handleNextIssue, addToast]);

  const handleUndo = useCallback(async () => {
    if (undoStack.length === 0 || !project) return;

    const lastUndo = undoStack[undoStack.length - 1];

    // Save current image for redo before restoring
    const imageKey = `${projectId}/page-${lastUndo.pageNumber}`;
    const currentPage = project.pages.find((p) => p.pageNumber === lastUndo.pageNumber);
    const currentImageDataUrl = currentPage?.imageDataUrl || '';

    // Restore the previous image to IndexedDB
    await saveImage(imageKey, lastUndo.previousImageDataUrl);

    // Update local state
    setProject((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        pages: prev.pages.map((p) =>
          p.pageNumber === lastUndo.pageNumber
            ? { ...p, imageDataUrl: lastUndo.previousImageDataUrl }
            : p
        ),
      };
    });

    // Reset issue status in store
    updateIssue(projectId, lastUndo.issueId, {
      status: 'detected',
      correctedText: undefined,
    });

    // Push to redo stack
    setRedoStack((prev) => [...prev, {
      issueId: lastUndo.issueId,
      pageNumber: lastUndo.pageNumber,
      previousImageDataUrl: currentImageDataUrl,
    }].slice(-20));

    setUndoStack((prev) => prev.slice(0, -1));
    addToast('success', '元に戻しました');
  }, [undoStack, project, projectId, updateIssue, addToast]);

  const handleRedo = useCallback(async () => {
    if (redoStack.length === 0 || !project) return;

    const lastRedo = redoStack[redoStack.length - 1];

    // Save current image for undo before applying redo
    const imageKey = `${projectId}/page-${lastRedo.pageNumber}`;
    const currentPage = project.pages.find((p) => p.pageNumber === lastRedo.pageNumber);
    const currentImageDataUrl = currentPage?.imageDataUrl || '';

    // Restore the redo image to IndexedDB
    await saveImage(imageKey, lastRedo.previousImageDataUrl);

    // Update local state
    setProject((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        pages: prev.pages.map((p) =>
          p.pageNumber === lastRedo.pageNumber
            ? { ...p, imageDataUrl: lastRedo.previousImageDataUrl }
            : p
        ),
      };
    });

    // Restore issue status to corrected
    updateIssue(projectId, lastRedo.issueId, {
      status: 'corrected',
    });

    // Push to undo stack
    setUndoStack((prev) => [...prev, {
      issueId: lastRedo.issueId,
      pageNumber: lastRedo.pageNumber,
      previousImageDataUrl: currentImageDataUrl,
    }].slice(-20));

    setRedoStack((prev) => prev.slice(0, -1));
    addToast('success', 'やり直しました');
  }, [redoStack, project, projectId, updateIssue, addToast]);

  const handleSave = useCallback(async () => {
    if (!project) return;
    try {
      // Save all page images to IndexedDB
      for (const page of project.pages) {
        const imageKey = `${projectId}/page-${page.pageNumber}`;
        await saveImage(imageKey, page.imageDataUrl);
      }
      // Update project metadata timestamp
      updateProject(projectId, {});
      addToast('success', '保存しました');
    } catch (err) {
      console.error('Save failed:', err);
      addToast('error', '保存に失敗しました');
    }
  }, [project, projectId, updateProject, addToast]);

  const handleExportPdf = useCallback(() => {
    setShowExportPanel(true);
  }, []);

  const handleExportPptx = useCallback(() => {
    setShowExportPanel(true);
  }, []);

  // Create issue from canvas selection, then auto-OCR
  const handleCreateIssue = useCallback((bbox: BBox, editMode: 'text' | 'object' = 'text') => {
    const newIssue: Issue = {
      id: generateId(),
      pageNumber: currentPageNumber,
      bbox,
      ocrText: '',
      issueType: 'manual',
      editMode,
      status: 'detected',
    };

    addIssue(projectId, newIssue);

    // Update local state
    setProject((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        issues: [...prev.issues, newIssue],
      };
    });

    setSelectedIssue(newIssue);
    setCurrentIssueIndex(issues.length);

    if (editMode === 'object') {
      addToast('success', 'オブジェクト修正: プロンプトを入力してください');
      return;
    }

    addToast('success', 'Issue を追加しました。テキストを読み取り中...');

    // Auto-OCR the selected region using Gemini (text mode only)
    if (currentPage) {
      (async () => {
        try {
          // Crop the region from the page image
          const img = new window.Image();
          img.src = currentPage.imageDataUrl;
          await new Promise<void>((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = () => reject(new Error('Image load failed'));
          });

          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          if (!ctx) return;

          const padding = 10;
          const cropX = Math.max(0, bbox.x - padding);
          const cropY = Math.max(0, bbox.y - padding);
          const cropW = Math.min(bbox.width + padding * 2, img.width - cropX);
          const cropH = Math.min(bbox.height + padding * 2, img.height - cropY);

          canvas.width = cropW;
          canvas.height = cropH;
          ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

          const regionBase64 = canvas.toDataURL('image/png');

          const { ocrRegion } = await import('@/lib/gemini');
          const result = await ocrRegion(regionBase64);

          if (result.text) {
            // Update ocrText in store and local state
            updateIssue(projectId, newIssue.id, { ocrText: result.text });
            setProject((prev) => {
              if (!prev) return null;
              return {
                ...prev,
                issues: prev.issues.map((i) =>
                  i.id === newIssue.id ? { ...i, ocrText: result.text } : i
                ),
              };
            });
            setSelectedIssue((prev) =>
              prev?.id === newIssue.id ? { ...prev, ocrText: result.text } : prev
            );
            addToast('success', `テキスト読み取り完了: "${result.text.substring(0, 30)}${result.text.length > 30 ? '...' : ''}"`);
          } else {
            addToast('warning', 'テキストが検出されませんでした');
          }
        } catch (err) {
          console.error('Auto OCR failed:', err);
          addToast('error', `テキスト読み取り失敗: ${err instanceof Error ? err.message : '不明なエラー'}`);
        }
      })();
    }
  }, [projectId, currentPageNumber, currentPage, issues.length, addIssue, updateIssue, addToast]);

  // Delete issue from canvas
  const handleDeleteIssue = useCallback((issueId: string) => {
    deleteIssue(projectId, issueId);

    // Update local state
    setProject((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        issues: prev.issues.filter((i) => i.id !== issueId),
      };
    });

    // Clear selection if deleted issue was selected
    if (selectedIssue?.id === issueId) {
      setSelectedIssue(null);
      setCurrentIssueIndex(0);
    }

    addToast('success', '選択箇所を削除しました');
  }, [projectId, selectedIssue?.id, deleteIssue, addToast]);

  // Re-run OCR on an existing issue
  const handleRerunOcr = useCallback(async (issueId: string) => {
    const issue = issues.find((i) => i.id === issueId);
    if (!issue) return;

    const page = pages.find((p) => p.pageNumber === issue.pageNumber);
    if (!page) return;

    addToast('success', 'テキストを再読み取り中...');

    try {
      const img = new window.Image();
      img.src = page.imageDataUrl;
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Image load failed'));
      });

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const padding = 10;
      const cropX = Math.max(0, issue.bbox.x - padding);
      const cropY = Math.max(0, issue.bbox.y - padding);
      const cropW = Math.min(issue.bbox.width + padding * 2, img.width - cropX);
      const cropH = Math.min(issue.bbox.height + padding * 2, img.height - cropY);

      canvas.width = cropW;
      canvas.height = cropH;
      ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

      const regionBase64 = canvas.toDataURL('image/png');

      const { ocrRegion } = await import('@/lib/gemini');
      const result = await ocrRegion(regionBase64);

      if (result.text) {
        updateIssue(projectId, issueId, { ocrText: result.text });
        setProject((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            issues: prev.issues.map((i) =>
              i.id === issueId ? { ...i, ocrText: result.text } : i
            ),
          };
        });
        setSelectedIssue((prev) =>
          prev?.id === issueId ? { ...prev, ocrText: result.text } : prev
        );
        addToast('success', `テキスト読み取り完了: "${result.text.substring(0, 30)}${result.text.length > 30 ? '...' : ''}"`);
      } else {
        addToast('warning', 'テキストが検出されませんでした');
      }
    } catch (err) {
      console.error('Re-run OCR failed:', err);
      addToast('error', `テキスト読み取り失敗: ${err instanceof Error ? err.message : '不明なエラー'}`);
    }
  }, [issues, pages, projectId, updateIssue, addToast]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      const isModifier = e.ctrlKey || e.metaKey;

      switch (e.key.toLowerCase()) {
        case 'j':
          handleNextIssue();
          break;
        case 'k':
          handlePreviousIssue();
          break;
        case 's':
          if (isModifier) {
            e.preventDefault();
            handleSave();
          } else {
            handleSkip();
          }
          break;
        case 'u':
          handleUndo();
          break;
        case 'z':
          if (isModifier && e.shiftKey) {
            e.preventDefault();
            handleRedo();
          } else if (isModifier) {
            e.preventDefault();
            handleUndo();
          } else {
            setZoom((prev) => Math.min(4, prev + 0.25));
          }
          break;
        case 'y':
          if (isModifier) {
            e.preventDefault();
            handleRedo();
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
  }, [handleNextIssue, handlePreviousIssue, handleSkip, handleUndo, handleRedo, handleSave]);

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
    <div className="h-screen flex flex-col bg-gray-300">
      <TopBar
        projectName={project.name}
        totalPages={project.totalPages}
        autoFixEnabled={autoFixEnabled}
        onAutoFixToggle={() => setAutoFixEnabled(!autoFixEnabled)}
        onExportPdf={handleExportPdf}
        onExportPptx={handleExportPptx}
        onUndo={handleUndo}
        canUndo={undoStack.length > 0}
        onRedo={handleRedo}
        canRedo={redoStack.length > 0}
        onSave={handleSave}
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
          onPageSelect={isApplying ? () => {} : handlePageSelect}
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
              edit_mode: i.editMode,
            }))}
            selectedIssueId={selectedIssue?.id || null}
            onIssueClick={(issue) => {
              if (isApplying) return;
              const storeIssue = issues.find((i) => i.id === issue.id);
              if (storeIssue) handleIssueSelect(storeIssue);
            }}
            onCreateIssue={isApplying ? undefined : handleCreateIssue}
            onDeleteIssue={isApplying ? undefined : handleDeleteIssue}
            zoom={zoom}
            onZoomChange={setZoom}
            disabled={isApplying}
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
            edit_mode: i.editMode || 'text',
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
            edit_mode: selectedIssue.editMode || 'text',
          } : null}
          currentIndex={currentIssueIndex}
          onNext={handleNextIssue}
          onPrevious={handlePreviousIssue}
          onApply={handleApply}
          onSkip={handleSkip}
          onSelectIssue={(fixIssue) => {
            const storeIssue = issues.find((i) => i.id === fixIssue.id);
            if (storeIssue) handleIssueSelect(storeIssue);
          }}
          isApplying={isApplying}
          regionPreviewUrl={regionPreviewUrl || undefined}
          onDeleteIssue={handleDeleteIssue}
          onRerunOcr={handleRerunOcr}
        />
      </div>

      <StatusBar
        resolvedCount={resolvedCount}
        totalCount={issues.length}
        jobStatus={jobStatus}
        zoom={zoom}
        onZoomIn={() => setZoom((prev) => Math.min(4, prev + 0.25))}
        onZoomOut={() => setZoom((prev) => Math.max(0.25, prev - 0.25))}
        onZoomFit={() => setZoom(1)}
      />

      <ExportPanel
        projectId={projectId}
        isOpen={showExportPanel}
        onClose={() => setShowExportPanel(false)}
      />
    </div>
  );
}
