'use client';

import { useMemo } from 'react';
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
}

export function PagesPanel({
  pages,
  issues,
  currentPageNumber,
  onPageSelect,
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

  return (
    <aside className="w-[140px] bg-gray-200 border-r border-gray-300 flex flex-col flex-shrink-0">
      {/* Thumbnail list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {pages.map((page) => {
          const pageIssues = issuesByPage.get(page.page_number) || [];
          const isActive = page.page_number === currentPageNumber;
          const unresolvedCount = pageIssues.filter(
            (i) => i.status !== 'corrected' && i.status !== 'skipped'
          ).length;

          return (
            <button
              key={page.page_number}
              onClick={() => onPageSelect(page.page_number)}
              className={cn(
                'w-full rounded overflow-hidden transition-all',
                isActive
                  ? 'ring-2 ring-blue-500 ring-offset-2 ring-offset-gray-200'
                  : 'hover:ring-2 hover:ring-gray-400 hover:ring-offset-2 hover:ring-offset-gray-200'
              )}
              aria-label={`ページ ${page.page_number}`}
              aria-current={isActive ? 'page' : undefined}
            >
              {/* Thumbnail image */}
              <div className="relative bg-white shadow">
                <img
                  src={page.thumbnail_url}
                  alt={`ページ ${page.page_number}`}
                  className="w-full"
                  loading="lazy"
                />

                {/* Issue count badge */}
                {unresolvedCount > 0 && (
                  <div className="absolute top-1 right-1 px-1.5 py-0.5 bg-red-500 text-white text-[10px] font-bold rounded min-w-[16px] text-center">
                    {unresolvedCount}
                  </div>
                )}
              </div>

              {/* Page number */}
              <div className="py-1 text-center bg-transparent">
                <span className={cn(
                  'text-xs',
                  isActive ? 'text-gray-900 font-medium' : 'text-gray-600'
                )}>
                  {page.page_number}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
