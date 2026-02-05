'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ChevronLeft,
  Undo2,
  Download,
} from 'lucide-react';

interface TopBarProps {
  projectName: string;
  totalPages: number;
  autoFixEnabled: boolean;
  onAutoFixToggle: () => void;
  onExportPdf: () => void;
  onExportPptx: () => void;
  onUndo: () => void;
  canUndo: boolean;
  isExporting?: boolean;
}

export function TopBar({
  projectName,
  totalPages,
  onExportPdf,
  onUndo,
  canUndo,
  isExporting,
}: TopBarProps) {
  return (
    <header className="h-12 bg-gray-100 border-b border-gray-300 flex items-center justify-between px-3 flex-shrink-0">
      {/* Left section */}
      <div className="flex items-center gap-2">
        <Link
          href="/"
          className="p-1.5 hover:bg-gray-200 rounded transition-colors"
          aria-label="ホームに戻る"
        >
          <ChevronLeft className="w-5 h-5 text-gray-600" />
        </Link>

        <span className="text-sm font-medium text-gray-900 truncate max-w-[300px]">
          {projectName}
        </span>
      </div>

      {/* Right section */}
      <div className="flex items-center gap-1">
        <button
          onClick={onUndo}
          disabled={!canUndo}
          className="p-1.5 hover:bg-gray-200 rounded transition-colors disabled:opacity-30"
          aria-label="元に戻す"
          title="元に戻す (U)"
        >
          <Undo2 className="w-4 h-4 text-gray-600" />
        </button>

        <button
          onClick={onExportPdf}
          disabled={isExporting}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-200 rounded transition-colors disabled:opacity-30"
          aria-label="エクスポート"
        >
          <Download className="w-4 h-4" />
          書き出し
        </button>
      </div>
    </header>
  );
}
