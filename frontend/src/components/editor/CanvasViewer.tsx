'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { ZoomIn, ZoomOut, Maximize, MousePointer, Square, Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip } from '@/components/ui/Tooltip';

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
}

interface CanvasViewerProps {
  imageUrl: string;
  pageWidth: number;
  pageHeight: number;
  issues: IssueForCanvas[];
  selectedIssueId: string | null;
  onIssueClick: (issue: IssueForCanvas) => void;
  onCreateIssue?: (bbox: BBox) => void;
  onDeleteIssue?: (issueId: string) => void;
  zoom: number;
  onZoomChange: (zoom: number) => void;
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
}: CanvasViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [imageLoaded, setImageLoaded] = useState(false);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  // ROI selection mode
  const [mode, setMode] = useState<'select' | 'draw'>('draw'); // Default to draw mode
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState({ x: 0, y: 0 });
  const [drawEnd, setDrawEnd] = useState({ x: 0, y: 0 });
  const [showHint, setShowHint] = useState(true);

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

  // Reset image loaded state when URL changes
  useEffect(() => {
    setImageLoaded(false);
  }, [imageUrl]);

  // Hide hint after first issue created or after 10 seconds
  useEffect(() => {
    if (issues.length > 0) {
      setShowHint(false);
    }
    const timer = setTimeout(() => setShowHint(false), 15000);
    return () => clearTimeout(timer);
  }, [issues.length]);

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

  // Mouse handlers
  const handleMouseDown = (e: React.MouseEvent) => {
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
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDrawing) {
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
    if (isDrawing) {
      setIsDrawing(false);

      // Calculate bbox
      const x = Math.min(drawStart.x, drawEnd.x);
      const y = Math.min(drawStart.y, drawEnd.y);
      const width = Math.abs(drawEnd.x - drawStart.x);
      const height = Math.abs(drawEnd.y - drawStart.y);

      // Only create if area is significant
      if (width > 10 && height > 10 && onCreateIssue) {
        onCreateIssue({
          x: Math.round(x),
          y: Math.round(y),
          width: Math.round(width),
          height: Math.round(height),
        });
      }
    }
    setIsDragging(false);
  };

  // Fit to width
  const handleFitToWidth = () => {
    onZoomChange(1);
    setPanOffset({ x: 0, y: 0 });
  };

  // Get issue box class based on status
  const getIssueBoxClass = (issue: IssueForCanvas) => {
    const isSelected = issue.id === selectedIssueId;
    if (isSelected) return 'issue-box issue-box-active';
    if (issue.status === 'corrected') return 'issue-box issue-box-fixed';
    if (issue.status === 'needs_review') return 'issue-box issue-box-review';
    return 'issue-box issue-box-unfixed';
  };

  // Scroll to selected issue
  useEffect(() => {
    if (selectedIssueId && containerRef.current) {
      const selectedIssue = issues.find((i) => i.id === selectedIssueId);
      if (selectedIssue) {
        const centerX = (selectedIssue.bbox.x + selectedIssue.bbox.width / 2) * effectiveZoom;
        const centerY = (selectedIssue.bbox.y + selectedIssue.bbox.height / 2) * effectiveZoom;

        const newPanX = containerSize.width / 2 - centerX - pageWidth * effectiveZoom / 2;
        const newPanY = containerSize.height / 2 - centerY - pageHeight * effectiveZoom / 2;

        setPanOffset({ x: newPanX, y: newPanY });
      }
    }
  }, [selectedIssueId]);

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

  return (
    <div className="flex-1 flex flex-col bg-gray-100 min-w-0 relative">
      {/* Canvas area */}
      <div
        ref={containerRef}
        className={cn(
          'relative flex-1 overflow-hidden',
          isDragging && 'cursor-grabbing',
          mode === 'draw' && !isDragging && 'cursor-crosshair'
        )}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
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
                    {/* Delete button - shown when selected */}
                    {isSelected && onDeleteIssue && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteIssue(issue.id);
                        }}
                        className="absolute -top-3 -right-3 w-6 h-6 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center shadow-lg z-30 transition-colors"
                        aria-label="削除"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                    {/* Tooltip on hover */}
                    <div className="absolute -top-7 left-0 px-2 py-1 text-xs font-medium bg-gray-900 text-white rounded shadow-lg opacity-0 hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-20">
                      {issue.ocr_text?.slice(0, 30) || 'Issue'}
                      {(issue.ocr_text?.length || 0) > 30 && '...'}
                    </div>
                  </div>
                );
              })}

            {/* Drawing rectangle */}
            {drawingRect && (
              <div
                className="absolute border-2 border-blue-500 bg-blue-500/20 pointer-events-none"
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

      {/* Toolbar */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-white/95 backdrop-blur rounded-full px-2 py-1.5 shadow-lg border border-gray-200">
        {/* Mode toggle */}
        <Tooltip content="選択モード (既存のIssueをクリック)">
          <button
            onClick={() => setMode('select')}
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
            onClick={() => setMode('draw')}
            className={cn(
              'w-8 h-8 flex items-center justify-center rounded-full transition-colors',
              mode === 'draw' ? 'bg-blue-500 text-white' : 'hover:bg-gray-100 text-gray-500'
            )}
            aria-label="範囲選択"
          >
            <Square className="w-4 h-4" />
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

      {/* Top mode indicator when drawing */}
      {mode === 'draw' && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-full shadow-lg flex items-center gap-2">
          <Square className="w-4 h-4" />
          範囲選択モード: ドラッグして修正箇所を選択
        </div>
      )}
    </div>
  );
}
