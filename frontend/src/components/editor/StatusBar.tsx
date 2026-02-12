'use client';

import { Loader2, ZoomIn, ZoomOut, Maximize } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StatusBarProps {
  resolvedCount: number;
  totalCount: number;
  jobStatus?: {
    type: 'ocr' | 'generate' | 'export';
    message: string;
  } | null;
  zoom?: number;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onZoomFit?: () => void;
}

export function StatusBar({
  resolvedCount,
  totalCount,
  jobStatus,
  zoom = 1,
  onZoomIn,
  onZoomOut,
  onZoomFit,
}: StatusBarProps) {
  const percentage = totalCount > 0 ? Math.round((resolvedCount / totalCount) * 100) : 0;

  return (
    <footer className="h-8 bg-white border-t border-gray-200 flex items-center justify-between px-4 text-xs flex-shrink-0">
      {/* Left - Progress */}
      <div className="flex items-center gap-2">
        <span className="text-gray-400 tabular-nums">{resolvedCount}/{totalCount}</span>
        <div className="w-20 h-1 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-500 rounded-full transition-all"
            style={{ width: `${percentage}%` }}
          />
        </div>
        <span className="text-gray-300 tabular-nums">{percentage}%</span>
      </div>

      {/* Center - Job Status */}
      <div className="flex items-center gap-2">
        {jobStatus && (
          <>
            <Loader2 className="w-3 h-3 text-gray-400 animate-spin" />
            <span className="text-gray-500">{jobStatus.message}</span>
          </>
        )}
      </div>

      {/* Right - Zoom controls */}
      <div className="flex items-center gap-0.5">
        {onZoomOut && (
          <button
            onClick={onZoomOut}
            className="p-1 hover:bg-gray-100 rounded transition-colors"
            title="縮小"
          >
            <ZoomOut className="w-3.5 h-3.5 text-gray-400" />
          </button>
        )}

        {onZoomFit && (
          <button
            onClick={onZoomFit}
            className="px-2 py-0.5 hover:bg-gray-100 rounded transition-colors text-gray-400 tabular-nums"
            title="フィット"
          >
            {Math.round(zoom * 100)}%
          </button>
        )}

        {onZoomIn && (
          <button
            onClick={onZoomIn}
            className="p-1 hover:bg-gray-100 rounded transition-colors"
            title="拡大"
          >
            <ZoomIn className="w-3.5 h-3.5 text-gray-400" />
          </button>
        )}
      </div>
    </footer>
  );
}
