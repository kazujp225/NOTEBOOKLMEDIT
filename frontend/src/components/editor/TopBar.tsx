'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ChevronLeft,
  Undo2,
  Redo2,
  Save,
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
  onRedo: () => void;
  canRedo: boolean;
  onSave: () => void;
  isExporting?: boolean;
}

export function TopBar({
  projectName,
  totalPages,
  onExportPdf,
  onUndo,
  canUndo,
  onRedo,
  canRedo,
  onSave,
  isExporting,
}: TopBarProps) {
  return (
    <header className="h-12 bg-white border-b border-gray-200 flex items-center justify-between px-4 flex-shrink-0">
      {/* Left section */}
      <div className="flex items-center gap-3">
        <Link
          href="/"
          className="p-1.5 hover:bg-gray-100 rounded-md transition-colors"
          aria-label="ホームに戻る"
        >
          <ChevronLeft className="w-4 h-4 text-gray-400" />
        </Link>

        <div className="w-px h-5 bg-gray-200" />

        <span className="text-[13px] font-medium text-gray-700 truncate max-w-[300px]">
          {projectName}
        </span>
      </div>

      {/* Right section */}
      <div className="flex items-center gap-1">
        <button
          onClick={onUndo}
          disabled={!canUndo}
          className="p-1.5 hover:bg-gray-100 rounded-md transition-colors disabled:opacity-20"
          aria-label="元に戻す"
          title="元に戻す (Ctrl+Z / U)"
        >
          <Undo2 className="w-4 h-4 text-gray-400" />
        </button>

        <button
          onClick={onRedo}
          disabled={!canRedo}
          className="p-1.5 hover:bg-gray-100 rounded-md transition-colors disabled:opacity-20"
          aria-label="やり直す"
          title="やり直す (Ctrl+Shift+Z)"
        >
          <Redo2 className="w-4 h-4 text-gray-400" />
        </button>

        <div className="w-px h-5 bg-gray-200 mx-1" />

        <button
          onClick={onSave}
          className="p-1.5 hover:bg-gray-100 rounded-md transition-colors"
          aria-label="保存"
          title="保存 (Ctrl+S)"
        >
          <Save className="w-4 h-4 text-gray-400" />
        </button>

        <button
          onClick={onExportPdf}
          disabled={isExporting}
          className="flex items-center gap-1.5 px-3 py-1.5 text-[13px] text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors disabled:opacity-20 ml-1"
          aria-label="エクスポート"
        >
          <Download className="w-3.5 h-3.5" />
          書き出し
        </button>
      </div>
    </header>
  );
}
