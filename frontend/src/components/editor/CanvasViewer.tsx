'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { ZoomIn, ZoomOut, Maximize, MousePointer, Square, Plus, X, Trash2, Move, Copy, Shapes, Check, AlertCircle, AlertTriangle, Loader2, Type } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip } from '@/components/ui/Tooltip';
import { TextOverlayBox, type ResizeHandle } from './TextOverlayBox';
import { TextOverlayToolbar } from './TextOverlayToolbar';
import type { TextOverlay } from '@/lib/store';

export interface BBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface IssueForCanvas {
  id: string;
  page_id: string;
  page_number: number;
  bbox: BBox;
  issue_type: string;
  confidence: number | null;
  ocr_text: string | null;
  detected_problems: string[];
  status: string;
  auto_correctable: boolean;
  edit_mode?: 'text' | 'object';
}

interface CanvasViewerProps {
  imageUrl: string;
  pageWidth: number;
  pageHeight: number;
  issues: IssueForCanvas[];
  selectedIssueId: string | null;
  onIssueClick: (issue: IssueForCanvas) => void;
  onCreateIssue?: (bbox: BBox, editMode: 'text' | 'object') => void;
  onDeleteIssue?: (issueId: string) => void;
  zoom: number;
  onZoomChange: (zoom: number) => void;
  disabled?: boolean;
  // Text overlay props
  textOverlays?: TextOverlay[];
  selectedOverlayId?: string | null;
  onOverlaySelect?: (id: string | null) => void;
  onOverlayCreate?: (bbox: BBox) => void;
  onOverlayUpdate?: (id: string, updates: Partial<TextOverlay>) => void;
  onOverlayDelete?: (id: string) => void;
}

export function CanvasViewer({
  imageUrl,
  pageWidth,
  pageHeight,
  issues,
  selectedIssueId,
  onIssueClick,
  onCreateIssue,
  onDeleteIssue,
  zoom,
  onZoomChange,
  disabled = false,
  textOverlays = [],
  selectedOverlayId = null,
  onOverlaySelect,
  onOverlayCreate,
  onOverlayUpdate,
  onOverlayDelete,
}: CanvasViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [imageLoaded, setImageLoaded] = useState(false);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  // ROI selection mode
  const [mode, setMode] = useState<'select' | 'draw' | 'text'>('draw');
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState({ x: 0, y: 0 });
  const [drawEnd, setDrawEnd] = useState({ x: 0, y: 0 });
  const [showHint, setShowHint] = useState(true);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Text overlay interaction state
  const [editingOverlayId, setEditingOverlayId] = useState<string | null>(null);
  const [draggingOverlay, setDraggingOverlay] = useState<{
    id: string;
    startBbox: BBox;
    startMouse: { x: number; y: number };
  } | null>(null);
  const [resizingOverlay, setResizingOverlay] = useState<{
    id: string;
    handle: ResizeHandle;
    startBbox: BBox;
    startMouse: { x: number; y: number };
  } | null>(null);

  // Update container size on resize
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        setContainerSize({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    };

    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  // Reset image loaded state when URL changes, using ref to avoid race condition
  const prevImageUrlRef = useRef(imageUrl);
  if (prevImageUrlRef.current !== imageUrl) {
    prevImageUrlRef.current = imageUrl;
    if (imageLoaded) {
      setImageLoaded(false);
    }
  }

  // Hide hint after first issue created or after 10 seconds
  useEffect(() => {
    if (issues.length > 0) {
      setShowHint(false);
    }
    const timer = setTimeout(() => setShowHint(false), 15000);
    return () => clearTimeout(timer);
  }, [issues.length]);

  // Elapsed time counter during AI processing
  useEffect(() => {
    if (!disabled) {
      setElapsedSeconds(0);
      return;
    }
    setElapsedSeconds(0);
    const interval = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [disabled]);

  // Calculate fit scale
  const fitScale = Math.min(
    (containerSize.width - 48) / pageWidth,
    (containerSize.height - 48) / pageHeight,
    1
  );

  const effectiveZoom = fitScale * zoom;

  // Get image position relative to container
  const getImageOffset = () => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const containerRect = containerRef.current.getBoundingClientRect();
    const imageWidth = pageWidth * effectiveZoom;
    const imageHeight = pageHeight * effectiveZoom;
    return {
      x: (containerRect.width - imageWidth) / 2 + panOffset.x,
      y: (containerRect.height - imageHeight) / 2 + panOffset.y,
    };
  };

  // Convert screen coordinates to image coordinates
  const screenToImage = (screenX: number, screenY: number) => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const containerRect = containerRef.current.getBoundingClientRect();
    const imageOffset = getImageOffset();

    const imageX = (screenX - containerRect.left - imageOffset.x) / effectiveZoom;
    const imageY = (screenY - containerRect.top - imageOffset.y) / effectiveZoom;

    return {
      x: Math.max(0, Math.min(pageWidth, imageX)),
      y: Math.max(0, Math.min(pageHeight, imageY)),
    };
  };

  // Wheel zoom handler
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        onZoomChange(Math.max(0.25, Math.min(4, zoom + delta)));
      }
    },
    [zoom, onZoomChange]
  );

  // Overlay drag/resize handlers
  const handleOverlayDragStart = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const overlay = textOverlays.find((o) => o.id === id);
    if (!overlay) return;
    const mousePos = screenToImage(e.clientX, e.clientY);
    setDraggingOverlay({
      id,
      startBbox: { ...overlay.bbox },
      startMouse: mousePos,
    });
  }, [textOverlays]);

  const handleOverlayResizeStart = useCallback((id: string, handle: ResizeHandle, e: React.MouseEvent) => {
    e.stopPropagation();
    const overlay = textOverlays.find((o) => o.id === id);
    if (!overlay) return;
    const mousePos = screenToImage(e.clientX, e.clientY);
    setResizingOverlay({
      id,
      handle,
      startBbox: { ...overlay.bbox },
      startMouse: mousePos,
    });
  }, [textOverlays]);

  // Mouse handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (disabled) return;

    // In text mode, clicking empty space deselects overlay and starts drawing new text box
    if (mode === 'text' && e.button === 0 && !e.altKey) {
      e.preventDefault();
      onOverlaySelect?.(null);
      setEditingOverlayId(null);
      const pos = screenToImage(e.clientX, e.clientY);
      setIsDrawing(true);
      setDrawStart(pos);
      setDrawEnd(pos);
      return;
    }

    if (mode === 'draw' && e.button === 0) {
      e.preventDefault();
      const pos = screenToImage(e.clientX, e.clientY);
      setIsDrawing(true);
      setDrawStart(pos);
      setDrawEnd(pos);
      setShowHint(false);
    } else if (e.button === 1 || (e.button === 0 && e.altKey)) {
      e.preventDefault();
      setIsDragging(true);
      setDragStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
    } else if (mode === 'select' && e.button === 0) {
      // Deselect overlay when clicking empty space in select mode
      onOverlaySelect?.(null);
      setEditingOverlayId(null);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (draggingOverlay && onOverlayUpdate) {
      const mousePos = screenToImage(e.clientX, e.clientY);
      const dx = mousePos.x - draggingOverlay.startMouse.x;
      const dy = mousePos.y - draggingOverlay.startMouse.y;
      const newX = Math.max(0, Math.min(pageWidth - draggingOverlay.startBbox.width, draggingOverlay.startBbox.x + dx));
      const newY = Math.max(0, Math.min(pageHeight - draggingOverlay.startBbox.height, draggingOverlay.startBbox.y + dy));
      onOverlayUpdate(draggingOverlay.id, {
        bbox: {
          x: Math.round(newX),
          y: Math.round(newY),
          width: draggingOverlay.startBbox.width,
          height: draggingOverlay.startBbox.height,
        },
      });
    } else if (resizingOverlay && onOverlayUpdate) {
      const mousePos = screenToImage(e.clientX, e.clientY);
      const dx = mousePos.x - resizingOverlay.startMouse.x;
      const dy = mousePos.y - resizingOverlay.startMouse.y;
      const { startBbox, handle } = resizingOverlay;
      let { x, y, width, height } = startBbox;

      const MIN_W = 20;
      const MIN_H = 10;

      if (handle.includes('e')) { width = Math.max(MIN_W, width + dx); }
      if (handle.includes('w')) { x = x + dx; width = Math.max(MIN_W, width - dx); if (width === MIN_W) x = startBbox.x + startBbox.width - MIN_W; }
      if (handle.includes('s')) { height = Math.max(MIN_H, height + dy); }
      if (handle.includes('n')) { y = y + dy; height = Math.max(MIN_H, height - dy); if (height === MIN_H) y = startBbox.y + startBbox.height - MIN_H; }

      onOverlayUpdate(resizingOverlay.id, {
        bbox: { x: Math.round(Math.max(0, x)), y: Math.round(Math.max(0, y)), width: Math.round(width), height: Math.round(height) },
      });
    } else if (isDrawing) {
      const pos = screenToImage(e.clientX, e.clientY);
      setDrawEnd(pos);
    } else if (isDragging) {
      setPanOffset({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (draggingOverlay) {
      setDraggingOverlay(null);
      return;
    }
    if (resizingOverlay) {
      setResizingOverlay(null);
      return;
    }
    if (isDrawing) {
      setIsDrawing(false);

      // Calculate bbox
      const x = Math.min(drawStart.x, drawEnd.x);
      const y = Math.min(drawStart.y, drawEnd.y);
      const width = Math.abs(drawEnd.x - drawStart.x);
      const height = Math.abs(drawEnd.y - drawStart.y);

      if (mode === 'text') {
        // Create text overlay
        if (width > 20 && height > 10 && onOverlayCreate) {
          onOverlayCreate({
            x: Math.round(x),
            y: Math.round(y),
            width: Math.round(width),
            height: Math.round(height),
          });
        }
      } else {
        // Create issue (draw mode)
        if (width > 10 && height > 10 && onCreateIssue) {
          onCreateIssue({
            x: Math.round(x),
            y: Math.round(y),
            width: Math.round(width),
            height: Math.round(height),
          }, 'text');
        }
      }
    }
    setIsDragging(false);
  };

  // Fit to width
  const handleFitToWidth = () => {
    onZoomChange(1);
    setPanOffset({ x: 0, y: 0 });
  };

  // Get issue box class based on status and severity
  const getIssueBoxClass = (issue: IssueForCanvas) => {
    const isSelected = issue.id === selectedIssueId;
    if (isSelected) return 'issue-box issue-box-active';
    if (issue.status === 'corrected') return 'issue-box issue-box-fixed';
    if (issue.status === 'needs_review') return 'issue-box issue-box-review';
    return 'issue-box issue-box-unfixed';
  };

  // Calculate drawing rect
  const getDrawingRect = () => {
    if (!isDrawing) return null;
    const x = Math.min(drawStart.x, drawEnd.x);
    const y = Math.min(drawStart.y, drawEnd.y);
    const width = Math.abs(drawEnd.x - drawStart.x);
    const height = Math.abs(drawEnd.y - drawStart.y);
    return { x, y, width, height };
  };

  const drawingRect = getDrawingRect();
  const selectedOverlay = textOverlays.find((o) => o.id === selectedOverlayId);

  return (
    <div className="flex-1 flex flex-col bg-gray-100 min-w-0 relative">
      {/* Canvas area */}
      <div
        ref={containerRef}
        className={cn(
          'relative flex-1 overflow-hidden',
          isDragging && 'cursor-grabbing',
          (mode === 'draw' || mode === 'text') && !isDragging && 'cursor-crosshair'
        )}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => {
          if (isDrawing) setIsDrawing(false);
          setIsDragging(false);
          if (draggingOverlay) setDraggingOverlay(null);
          if (resizingOverlay) setResizingOverlay(null);
        }}
      >
        {/* Centered container */}
        <div
          className="absolute inset-0 flex items-center justify-center transition-transform duration-150"
          style={{
            transform: `translate(${panOffset.x}px, ${panOffset.y}px)`,
          }}
        >
          {/* Page container */}
          <div
            className="relative bg-white shadow-xl rounded-sm"
            style={{
              width: pageWidth * effectiveZoom,
              height: pageHeight * effectiveZoom,
            }}
          >
            {/* Page image */}
            <img
              src={imageUrl}
              alt="ページ画像"
              className={cn(
                'w-full h-full transition-opacity duration-200',
                imageLoaded ? 'opacity-100' : 'opacity-0'
              )}
              style={{
                imageRendering: zoom > 1.5 ? 'pixelated' : 'auto',
              }}
              onLoad={() => setImageLoaded(true)}
              draggable={false}
            />

            {/* Loading skeleton */}
            {!imageLoaded && <div className="absolute inset-0 skeleton" />}

            {/* Issue boxes */}
            {imageLoaded &&
              issues.map((issue) => {
                const isSelected = issue.id === selectedIssueId;
                const isCorrected = issue.status === 'corrected';
                const isSkipped = issue.status === 'skipped';
                const badgeSize = Math.max(16, Math.min(24, 20 / zoom));
                return (
                  <div
                    key={issue.id}
                    className={getIssueBoxClass(issue)}
                    style={{
                      left: issue.bbox.x * effectiveZoom,
                      top: issue.bbox.y * effectiveZoom,
                      width: issue.bbox.width * effectiveZoom,
                      height: issue.bbox.height * effectiveZoom,
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onIssueClick(issue);
                    }}
                    role="button"
                    aria-label={`Issue: ${issue.ocr_text?.slice(0, 20) || 'Unknown'}`}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        onIssueClick(issue);
                      }
                      if (e.key === 'Delete' || e.key === 'Backspace') {
                        onDeleteIssue?.(issue.id);
                      }
                    }}
                  >
                    {/* Status badge - top-right corner */}
                    {!isSelected && (
                      <div
                        className={cn(
                          'absolute -top-2 -right-2 rounded-full flex items-center justify-center shadow-sm z-10 pointer-events-none',
                          isCorrected && 'bg-green-500',
                          isSkipped && 'bg-gray-400',
                          !isCorrected && !isSkipped && 'bg-amber-500'
                        )}
                        style={{ width: badgeSize, height: badgeSize }}
                      >
                        {isCorrected ? (
                          <Check className="text-white" style={{ width: badgeSize * 0.6, height: badgeSize * 0.6 }} />
                        ) : isSkipped ? (
                          <X className="text-white" style={{ width: badgeSize * 0.6, height: badgeSize * 0.6 }} />
                        ) : (
                          <AlertCircle className="text-white" style={{ width: badgeSize * 0.6, height: badgeSize * 0.6 }} />
                        )}
                      </div>
                    )}

                    {/* Edit mode indicator - top-left corner */}
                    {!isSelected && issue.edit_mode === 'object' && (
                      <div
                        className="absolute -top-2 -left-2 rounded-full bg-purple-500 flex items-center justify-center shadow-sm z-10 pointer-events-none"
                        style={{ width: badgeSize, height: badgeSize }}
                      >
                        <Shapes className="text-white" style={{ width: badgeSize * 0.6, height: badgeSize * 0.6 }} />
                      </div>
                    )}

                    {/* PowerPoint-style selection handles - 8 points */}
                    {isSelected && (
                      <>
                        <div className="selection-handle selection-handle-nw" />
                        <div className="selection-handle selection-handle-n" />
                        <div className="selection-handle selection-handle-ne" />
                        <div className="selection-handle selection-handle-e" />
                        <div className="selection-handle selection-handle-se" />
                        <div className="selection-handle selection-handle-s" />
                        <div className="selection-handle selection-handle-sw" />
                        <div className="selection-handle selection-handle-w" />
                      </>
                    )}

                    {/* Context toolbar */}
                    {isSelected && onDeleteIssue && (
                      <div className="context-toolbar">
                        <Tooltip content="削除 (Delete)">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteIssue(issue.id);
                            }}
                            className="context-toolbar-btn context-toolbar-btn-danger"
                            aria-label="削除"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </Tooltip>
                      </div>
                    )}

                    {/* Tooltip on hover - only show when not selected */}
                    {!isSelected && (
                      <div className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 text-xs font-medium bg-gray-900 text-white rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-20">
                        {isCorrected ? '✓ ' : ''}{issue.ocr_text?.slice(0, 30) || (issue.edit_mode === 'object' ? 'オブジェクト' : 'Issue')}
                        {((issue.ocr_text?.length || 0) > 30) && '...'}
                      </div>
                    )}
                  </div>
                );
              })}

            {/* Text overlays */}
            {imageLoaded && textOverlays.map((overlay) => (
              <TextOverlayBox
                key={overlay.id}
                overlay={overlay}
                effectiveZoom={effectiveZoom}
                isSelected={overlay.id === selectedOverlayId}
                isEditing={overlay.id === editingOverlayId}
                onSelect={(id) => {
                  onOverlaySelect?.(id);
                }}
                onDoubleClick={(id) => setEditingOverlayId(id)}
                onTextChange={(id, text) => onOverlayUpdate?.(id, { text })}
                onBlur={() => setEditingOverlayId(null)}
                onDelete={(id) => onOverlayDelete?.(id)}
                onResizeStart={handleOverlayResizeStart}
                onDragStart={handleOverlayDragStart}
              />
            ))}

            {/* Drawing rectangle */}
            {drawingRect && (
              <div
                className={cn(
                  'absolute border-2 pointer-events-none',
                  mode === 'text' ? 'border-green-500 bg-green-500/20' : 'border-blue-500 bg-blue-500/20'
                )}
                style={{
                  left: drawingRect.x * effectiveZoom,
                  top: drawingRect.y * effectiveZoom,
                  width: drawingRect.width * effectiveZoom,
                  height: drawingRect.height * effectiveZoom,
                }}
              />
            )}

            {/* Overlay hint when no issues and draw mode */}
            {imageLoaded && issues.length === 0 && showHint && mode === 'draw' && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/5 pointer-events-none">
                <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-2xl p-8 max-w-md text-center border border-gray-200">
                  <div className="w-16 h-16 mx-auto mb-4 bg-blue-100 rounded-full flex items-center justify-center">
                    <Plus className="w-8 h-8 text-blue-600" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-2">
                    修正したい箇所を選択
                  </h3>
                  <p className="text-gray-600 mb-4">
                    画像上でドラッグして、修正したいテキストや領域を囲んでください
                  </p>
                  <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
                    <Square className="w-4 h-4" />
                    <span>ドラッグで範囲選択</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Text overlay style toolbar */}
      {selectedOverlay && !editingOverlayId && onOverlayUpdate && onOverlayDelete && (
        <TextOverlayToolbar
          overlay={selectedOverlay}
          onUpdate={(updates) => onOverlayUpdate(selectedOverlay.id, updates)}
          onDelete={() => onOverlayDelete(selectedOverlay.id)}
        />
      )}

      {/* Toolbar */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-white/95 backdrop-blur rounded-full px-2 py-1.5 shadow-lg border border-gray-200">
        {/* Mode toggle */}
        <Tooltip content="選択モード (既存のIssueをクリック)">
          <button
            onClick={() => { setMode('select'); onOverlaySelect?.(null); setEditingOverlayId(null); }}
            className={cn(
              'w-8 h-8 flex items-center justify-center rounded-full transition-colors',
              mode === 'select' ? 'bg-gray-200 text-gray-900' : 'hover:bg-gray-100 text-gray-500'
            )}
            aria-label="選択モード"
          >
            <MousePointer className="w-4 h-4" />
          </button>
        </Tooltip>

        <Tooltip content="範囲選択モード (新規Issue作成)">
          <button
            onClick={() => { setMode('draw'); onOverlaySelect?.(null); setEditingOverlayId(null); }}
            className={cn(
              'w-8 h-8 flex items-center justify-center rounded-full transition-colors',
              mode === 'draw' ? 'bg-blue-500 text-white' : 'hover:bg-gray-100 text-gray-500'
            )}
            aria-label="範囲選択"
          >
            <Square className="w-4 h-4" />
          </button>
        </Tooltip>

        <Tooltip content="テキスト追加モード (T)">
          <button
            onClick={() => { setMode('text'); onOverlaySelect?.(null); setEditingOverlayId(null); }}
            className={cn(
              'w-8 h-8 flex items-center justify-center rounded-full transition-colors',
              mode === 'text' ? 'bg-green-500 text-white' : 'hover:bg-gray-100 text-gray-500'
            )}
            aria-label="テキスト追加"
          >
            <Type className="w-4 h-4" />
          </button>
        </Tooltip>

        <div className="w-px h-5 bg-gray-300 mx-1" />

        <Tooltip content="縮小 (X)">
          <button
            onClick={() => onZoomChange(Math.max(0.25, zoom - 0.25))}
            className="w-8 h-8 flex items-center justify-center hover:bg-gray-100 rounded-full transition-colors"
            disabled={zoom <= 0.25}
            aria-label="縮小"
          >
            <ZoomOut className="w-4 h-4 text-gray-600" />
          </button>
        </Tooltip>

        <div className="px-2 min-w-[60px] text-center">
          <span className="text-sm font-medium text-gray-700">
            {Math.round(zoom * 100)}%
          </span>
        </div>

        <Tooltip content="拡大 (Z)">
          <button
            onClick={() => onZoomChange(Math.min(4, zoom + 0.25))}
            className="w-8 h-8 flex items-center justify-center hover:bg-gray-100 rounded-full transition-colors"
            disabled={zoom >= 4}
            aria-label="拡大"
          >
            <ZoomIn className="w-4 h-4 text-gray-600" />
          </button>
        </Tooltip>

        <div className="w-px h-5 bg-gray-300 mx-1" />

        <Tooltip content="幅に合わせる (F)">
          <button
            onClick={handleFitToWidth}
            className="w-8 h-8 flex items-center justify-center hover:bg-gray-100 rounded-full transition-colors"
            aria-label="幅に合わせる"
          >
            <Maximize className="w-4 h-4 text-gray-600" />
          </button>
        </Tooltip>
      </div>

      {/* Disabled overlay during AI processing */}
      {disabled && (
        <div className="absolute inset-0 bg-gray-100/80 backdrop-blur-sm z-50 flex items-center justify-center pointer-events-auto">
          <div className="flex flex-col items-center gap-5 max-w-sm w-full px-6">
            {/* Spinner */}
            <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center">
              <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
            </div>

            {/* Title */}
            <div className="text-center">
              <h3 className="text-lg font-semibold text-gray-900">AIが画像を修正しています</h3>
              <p className="text-sm text-gray-500 mt-1">
                しばらくお待ちください... ({elapsedSeconds}秒)
              </p>
            </div>

            {/* Progress bar */}
            <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full animate-pulse"
                style={{ width: `${Math.min(90, elapsedSeconds * 3)}%`, transition: 'width 1s ease' }}
              />
            </div>

            {/* Warning */}
            <div className="w-full bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-amber-700">
                処理が完了するまでこのページで待機してください。
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Top mode indicator when drawing */}
      {mode === 'draw' && !disabled && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 px-4 py-2 text-white text-sm font-medium rounded-full shadow-lg flex items-center gap-2 bg-blue-600">
          <Square className="w-4 h-4" />
          ドラッグして修正範囲を選択
        </div>
      )}

      {/* Top mode indicator for text mode */}
      {mode === 'text' && !disabled && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 px-4 py-2 text-white text-sm font-medium rounded-full shadow-lg flex items-center gap-2 bg-green-600">
          <Type className="w-4 h-4" />
          ドラッグしてテキストボックスを配置
        </div>
      )}
    </div>
  );
}
