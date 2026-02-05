'use client';

import Link from 'next/link';
import {
  ChevronLeft,
  Sparkles,
  Undo2,
  FileText,
  Presentation,
  Settings,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip } from '@/components/ui/Tooltip';

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
  autoFixEnabled,
  onAutoFixToggle,
  onExportPdf,
  onExportPptx,
  onUndo,
  canUndo,
  isExporting,
}: TopBarProps) {
  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-4 flex-shrink-0">
      {/* Left section */}
      <div className="flex items-center gap-3">
        <Link
          href="/"
          className="btn-ghost btn-sm flex items-center gap-1.5"
          aria-label="ホームに戻る"
        >
          <ChevronLeft className="w-4 h-4" />
          <span className="hidden sm:inline">戻る</span>
        </Link>

        <div className="w-px h-6 bg-gray-200" />

        <div className="flex items-center gap-2">
          <h1 className="font-semibold text-gray-900 truncate max-w-[200px] md:max-w-[300px]">
            {projectName}
          </h1>
          <span className="badge-default">{totalPages}p</span>
        </div>
      </div>

      {/* Center section - Auto Fix Toggle */}
      <div className="hidden md:flex items-center gap-2">
        <Tooltip content={autoFixEnabled ? '自動修正: ON' : '自動修正: OFF'}>
          <button
            onClick={onAutoFixToggle}
            className={cn(
              'flex items-center gap-2 px-3 py-1.5 rounded-full transition-all',
              autoFixEnabled
                ? 'bg-blue-100 text-blue-700'
                : 'bg-gray-100 text-gray-600'
            )}
            aria-label={autoFixEnabled ? '自動修正をオフにする' : '自動修正をオンにする'}
          >
            <Sparkles className="w-4 h-4" />
            <span className="text-sm font-medium">Auto Fix</span>
            {autoFixEnabled ? (
              <ToggleRight className="w-5 h-5" />
            ) : (
              <ToggleLeft className="w-5 h-5" />
            )}
          </button>
        </Tooltip>
      </div>

      {/* Right section */}
      <div className="flex items-center gap-1">
        <Tooltip content="元に戻す (U)">
          <button
            onClick={onUndo}
            disabled={!canUndo}
            className="btn-ghost btn-sm"
            aria-label="元に戻す"
          >
            <Undo2 className="w-4 h-4" />
          </button>
        </Tooltip>

        <div className="w-px h-6 bg-gray-200 mx-1" />

        <Tooltip content="PDFとしてエクスポート">
          <button
            onClick={onExportPdf}
            disabled={isExporting}
            className="btn-secondary btn-sm"
            aria-label="PDFとしてエクスポート"
          >
            <FileText className="w-4 h-4" />
            <span className="hidden sm:inline">PDF</span>
          </button>
        </Tooltip>

        <Tooltip content="PPTXとしてエクスポート">
          <button
            onClick={onExportPptx}
            disabled={isExporting}
            className="btn-secondary btn-sm"
            aria-label="PPTXとしてエクスポート"
          >
            <Presentation className="w-4 h-4" />
            <span className="hidden sm:inline">PPTX</span>
          </button>
        </Tooltip>
      </div>
    </header>
  );
}
