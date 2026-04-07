'use client';

import { useMemo, useState } from 'react';
import { Check, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface PageForPanel {
  id: string;
  page_number: number;
  thumbnail_url: string;
  width: number;
  height: number;
  ocr_status: string;
  issue_count: number;
  has_unresolved_issues: boolean;
}

export interface IssueForPanel {
  id: string;
  page_id: string;
  page_number: number;
  bbox: { x: number; y: number; width: number; height: number };
  issue_type: string;
  confidence: number | null;
  ocr_text: string | null;
  detected_problems: string[];
  status: string;
  auto_correctable: boolean;
}

interface PagesPanelProps {
  pages: PageForPanel[];
  issues: IssueForPanel[];
  projectId: string;
  currentPageNumber: number;
  onPageSelect: (pageNumber: number) => void;
  onPageDelete?: (pageNumber: number) => void;
  onPageMove?: (fromPageNumber: number, toPageNumber: number) => void;
}

export function PagesPanel({
  pages,
  issues,
  currentPageNumber,
  onPageSelect,
  onPageDelete,
  onPageMove,
}: PagesPanelProps) {
  // Group issues by page
  const issuesByPage = useMemo(() => {
    const map = new Map<number, IssueForPanel[]>();
    issues.forEach((issue) => {
      const existing = map.get(issue.page_number) || [];
      existing.push(issue);
      map.set(issue.page_number, existing);
    });
    return map;
  }, [issues]);

  // Drag-and-drop reordering state
  const [draggedPageNumber, setDraggedPageNumber] = useState<number | null>(null);
  const [dragOverPageNumber, setDragOverPageNumber] = useState<number | null>(null);
  const [dragOverPosition, setDragOverPosition] = useState<'before' | 'after'>('before');

  return (
    <aside className="w-[140px] bg-gray-50 border-r border-gray-200 flex flex-col flex-shrink-0">
      {/* Thumbnail list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {pages.map((page) => {
          const pageIssues = issuesByPage.get(page.page_number) || [];
          const isActive = page.page_number === currentPageNumber;
          const unresolvedCount = pageIssues.filter(
            (i) => i.status !== 'corrected' && i.status !== 'skipped'
          ).length;

          const canDelete = !!onPageDelete && pages.length > 1;
          const canDrag = !!onPageMove && pages.length > 1;
          const isDragging = draggedPageNumber === page.page_number;
          const isDragOver = dragOverPageNumber === page.page_number && draggedPageNumber !== page.page_number;

          return (
            <div
              key={page.page_number}
              onClick={() => onPageSelect(page.page_number)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onPageSelect(page.page_number);
                }
              }}
              draggable={canDrag}
              onDragStart={(e) => {
                if (!canDrag) return;
                setDraggedPageNumber(page.page_number);
                e.dataTransfer.effectAllowed = 'move';
                // Setting some data is required for Firefox to fire dragend.
                try { e.dataTransfer.setData('text/plain', String(page.page_number)); } catch { /* noop */ }
              }}
              onDragEnter={(e) => {
                if (!canDrag || draggedPageNumber === null || draggedPageNumber === page.page_number) return;
                e.preventDefault();
                setDragOverPageNumber(page.page_number);
              }}
              onDragOver={(e) => {
                if (!canDrag || draggedPageNumber === null) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                const midpoint = rect.top + rect.height / 2;
                setDragOverPosition(e.clientY < midpoint ? 'before' : 'after');
                setDragOverPageNumber(page.page_number);
              }}
              onDragLeave={(e) => {
                // Only clear if we're leaving the element itself (not a child)
                const related = e.relatedTarget as Node | null;
                if (related && (e.currentTarget as HTMLElement).contains(related)) return;
                setDragOverPageNumber((cur) => (cur === page.page_number ? null : cur));
              }}
              onDrop={(e) => {
                if (!canDrag || draggedPageNumber === null || draggedPageNumber === page.page_number) {
                  setDraggedPageNumber(null);
                  setDragOverPageNumber(null);
                  return;
                }
                e.preventDefault();
                const from = draggedPageNumber;
                let target = page.page_number;
                if (dragOverPosition === 'after') target += 1;
                // When dragging downward, removal of the source shifts the target index by -1.
                if (from < target) target -= 1;
                const finalTarget = Math.max(1, Math.min(pages.length, target));
                if (finalTarget !== from) {
                  onPageMove?.(from, finalTarget);
                }
                setDraggedPageNumber(null);
                setDragOverPageNumber(null);
              }}
              onDragEnd={() => {
                setDraggedPageNumber(null);
                setDragOverPageNumber(null);
              }}
              className={cn(
                'group relative w-full rounded-md overflow-hidden transition-all cursor-pointer',
                isActive
                  ? 'ring-2 ring-blue-500 ring-offset-2 ring-offset-gray-50'
                  : 'hover:ring-1 hover:ring-gray-300 hover:ring-offset-2 hover:ring-offset-gray-50 opacity-60 hover:opacity-100',
                isDragging && 'opacity-30'
              )}
              role="button"
              tabIndex={0}
              aria-label={`ページ ${page.page_number}`}
              aria-current={isActive ? 'page' : undefined}
            >
              {/* Drop indicator */}
              {isDragOver && (
                <div
                  className={cn(
                    'absolute left-0 right-0 h-0.5 bg-blue-500 z-20 pointer-events-none',
                    dragOverPosition === 'before' ? '-top-1' : '-bottom-1'
                  )}
                />
              )}
              {/* Thumbnail image */}
              <div className="relative bg-white">
                <img
                  src={page.thumbnail_url}
                  alt={`ページ ${page.page_number}`}
                  className="w-full"
                  loading="lazy"
                />

                {/* Delete page button (top-left, hover) */}
                {canDelete && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onPageDelete?.(page.page_number);
                    }}
                    className="absolute top-1 left-1 w-5 h-5 bg-red-500 hover:bg-red-600 text-white rounded flex items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
                    title="このページを削除"
                    aria-label={`ページ ${page.page_number} を削除`}
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}

                {/* Issue count badge */}
                {unresolvedCount > 0 ? (
                  <div className="absolute top-1 right-1 px-1.5 py-0.5 bg-amber-500 text-white text-[10px] font-bold rounded min-w-[16px] text-center shadow-lg">
                    {unresolvedCount}
                  </div>
                ) : pageIssues.length > 0 ? (
                  <div className="absolute top-1 right-1 w-4 h-4 bg-emerald-500 text-white rounded-full flex items-center justify-center shadow-lg">
                    <Check className="w-2.5 h-2.5" />
                  </div>
                ) : null}
              </div>

              {/* Page number */}
              <div className="py-1 text-center">
                <span className={cn(
                  'text-xs tabular-nums',
                  isActive ? 'text-gray-900 font-medium' : 'text-gray-400'
                )}>
                  {page.page_number}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
