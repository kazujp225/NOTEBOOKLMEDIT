'use client';

import { Loader2, Keyboard } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StatusBarProps {
  resolvedCount: number;
  totalCount: number;
  jobStatus?: {
    type: 'ocr' | 'generate' | 'export';
    message: string;
  } | null;
  showShortcuts?: boolean;
}

export function StatusBar({
  resolvedCount,
  totalCount,
  jobStatus,
  showShortcuts = true,
}: StatusBarProps) {
  const percentage = totalCount > 0 ? Math.round((resolvedCount / totalCount) * 100) : 0;
  const isComplete = resolvedCount === totalCount && totalCount > 0;

  return (
    <footer className="h-9 bg-white border-t border-gray-200 flex items-center justify-between px-4 text-xs flex-shrink-0">
      {/* Left - Progress */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'font-medium',
              isComplete ? 'text-green-600' : 'text-gray-700'
            )}
          >
            {resolvedCount}/{totalCount}
          </span>
          <span className="text-gray-400">完了</span>
          <span
            className={cn(
              'px-1.5 py-0.5 rounded text-xs font-medium',
              isComplete ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
            )}
          >
            {percentage}%
          </span>
        </div>

        {/* Progress bar mini */}
        <div className="w-24 h-1.5 bg-gray-200 rounded-full overflow-hidden hidden sm:block">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-300',
              isComplete ? 'bg-green-500' : 'bg-blue-500'
            )}
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>

      {/* Center - Job Status */}
      <div className="flex items-center gap-2">
        {jobStatus && (
          <>
            <Loader2 className="w-3 h-3 text-blue-500 animate-spin" />
            <span className="text-gray-600">{jobStatus.message}</span>
          </>
        )}
      </div>

      {/* Right - Shortcuts hint */}
      {showShortcuts && (
        <div className="hidden md:flex items-center gap-3 text-gray-400">
          <Keyboard className="w-3 h-3" />
          <span>
            <kbd className="kbd">Enter</kbd> 適用
          </span>
          <span>
            <kbd className="kbd">J</kbd>/<kbd className="kbd">K</kbd> 前後
          </span>
          <span>
            <kbd className="kbd">E</kbd> 編集
          </span>
          <span>
            <kbd className="kbd">S</kbd> スキップ
          </span>
        </div>
      )}
    </footer>
  );
}

// Mini kbd component styling
const kbdStyles = `
.kbd {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 4px;
  font-family: ui-monospace, monospace;
  font-size: 10px;
  font-weight: 500;
  background: #f3f4f6;
  border: 1px solid #e5e7eb;
  border-radius: 3px;
  color: #374151;
}
`;

// Inject styles
if (typeof document !== 'undefined') {
  const styleEl = document.createElement('style');
  styleEl.textContent = kbdStyles;
  document.head.appendChild(styleEl);
}
