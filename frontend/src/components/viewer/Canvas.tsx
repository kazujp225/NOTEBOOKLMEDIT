'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { useProjectStore } from '@/store/project';
import type { Issue } from '@/lib/api';

interface CanvasProps {
  imageUrl: string;
  pageWidth: number;
  pageHeight: number;
  issues: Issue[];
  onIssueClick: (issue: Issue) => void;
}

export function Canvas({
  imageUrl,
  pageWidth,
  pageHeight,
  issues,
  onIssueClick,
}: CanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { zoom, setZoom, panOffset, setPanOffset, viewMode, selectedIssue } =
    useProjectStore();

  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [imageLoaded, setImageLoaded] = useState(false);

  // Calculate scale to fit container
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

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

  // Calculate the base scale to fit the page in the container
  const fitScale = Math.min(
    (containerSize.width - 40) / pageWidth,
    (containerSize.height - 40) / pageHeight,
    1
  );

  const effectiveZoom = fitScale * zoom;

  // Mouse wheel zoom
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        setZoom(zoom + delta);
      }
    },
    [zoom, setZoom]
  );

  // Pan handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (viewMode === 'pan' || e.button === 1) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      setPanOffset({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Issue box click handler
  const handleIssueBoxClick = (e: React.MouseEvent, issue: Issue) => {
    e.stopPropagation();
    onIssueClick(issue);
  };

  // Get issue box style
  const getIssueBoxStyle = (issue: Issue) => {
    const isSelected = selectedIssue?.id === issue.id;
    const isCorrected = issue.status === 'corrected';

    return {
      left: issue.bbox.x * effectiveZoom,
      top: issue.bbox.y * effectiveZoom,
      width: issue.bbox.width * effectiveZoom,
      height: issue.bbox.height * effectiveZoom,
      borderColor: isSelected
        ? '#0ea5e9'
        : isCorrected
        ? '#22c55e'
        : '#fbbf24',
      backgroundColor: isSelected
        ? 'rgba(14, 165, 233, 0.15)'
        : isCorrected
        ? 'rgba(34, 197, 94, 0.1)'
        : 'rgba(251, 191, 36, 0.1)',
      borderStyle: isSelected || isCorrected ? 'solid' : 'dashed',
    };
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative w-full h-full overflow-hidden bg-gray-100',
        viewMode === 'pan' && 'cursor-grab',
        isDragging && 'cursor-grabbing'
      )}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Centered container */}
      <div
        className="absolute inset-0 flex items-center justify-center"
        style={{
          transform: `translate(${panOffset.x}px, ${panOffset.y}px)`,
        }}
      >
        {/* Page container */}
        <div
          className="relative bg-white shadow-2xl"
          style={{
            width: pageWidth * effectiveZoom,
            height: pageHeight * effectiveZoom,
          }}
        >
          {/* Page image */}
          <img
            src={imageUrl}
            alt="Page"
            className={cn(
              'w-full h-full transition-opacity duration-300',
              imageLoaded ? 'opacity-100' : 'opacity-0'
            )}
            style={{
              imageRendering: zoom > 1.5 ? 'pixelated' : 'auto',
            }}
            onLoad={() => setImageLoaded(true)}
            draggable={false}
          />

          {/* Loading skeleton */}
          {!imageLoaded && (
            <div className="absolute inset-0 skeleton" />
          )}

          {/* Issue boxes */}
          {imageLoaded &&
            issues.map((issue) => (
              <div
                key={issue.id}
                className={cn(
                  'absolute border-2 cursor-pointer transition-all duration-150',
                  'hover:border-opacity-100',
                  selectedIssue?.id === issue.id ? 'z-10' : 'z-0'
                )}
                style={getIssueBoxStyle(issue)}
                onClick={(e) => handleIssueBoxClick(e, issue)}
              >
                {/* Tooltip on hover */}
                <div
                  className={cn(
                    'absolute -top-8 left-0 px-2 py-1 text-xs font-medium',
                    'bg-gray-900 text-white rounded shadow-lg',
                    'opacity-0 hover:opacity-100 transition-opacity',
                    'whitespace-nowrap pointer-events-none'
                  )}
                >
                  {issue.ocr_text?.slice(0, 20) || 'Issue'}
                  {(issue.ocr_text?.length || 0) > 20 && '...'}
                </div>
              </div>
            ))}
        </div>
      </div>

      {/* Zoom controls */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-white/90 backdrop-blur rounded-full px-4 py-2 shadow-lg">
        <button
          onClick={() => setZoom(zoom - 0.25)}
          className="w-8 h-8 flex items-center justify-center hover:bg-gray-100 rounded-full transition-colors"
          disabled={zoom <= 0.25}
        >
          −
        </button>
        <span className="text-sm font-medium w-14 text-center">
          {Math.round(zoom * 100)}%
        </span>
        <button
          onClick={() => setZoom(zoom + 0.25)}
          className="w-8 h-8 flex items-center justify-center hover:bg-gray-100 rounded-full transition-colors"
          disabled={zoom >= 4}
        >
          +
        </button>
        <div className="w-px h-5 bg-gray-300 mx-1" />
        <button
          onClick={() => {
            setZoom(1);
            setPanOffset({ x: 0, y: 0 });
          }}
          className="px-3 py-1 text-sm hover:bg-gray-100 rounded-full transition-colors"
        >
          リセット
        </button>
      </div>
    </div>
  );
}
