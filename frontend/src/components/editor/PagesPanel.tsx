'use client';

import { useState, useMemo } from 'react';
import { Search, Filter, Check, AlertTriangle, Eye } from 'lucide-react';
import { cn } from '@/lib/utils';

type FilterType = 'all' | 'unfixed' | 'fixed' | 'review';

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
  projectId,
  currentPageNumber,
  onPageSelect,
}: PagesPanelProps) {
  const [filter, setFilter] = useState<FilterType>('all');
  const [searchQuery, setSearchQuery] = useState('');

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

  // Calculate page status
  const getPageStatus = (pageNumber: number) => {
    const pageIssues = issuesByPage.get(pageNumber) || [];
    if (pageIssues.length === 0) return 'clean';

    const hasUnfixed = pageIssues.some(
      (i) => i.status !== 'corrected' && i.status !== 'skipped'
    );
    const hasReview = pageIssues.some((i) => i.status === 'needs_review');

    if (hasReview) return 'review';
    if (hasUnfixed) return 'unfixed';
    return 'fixed';
  };

  // Filter pages
  const filteredPages = useMemo(() => {
    return pages.filter((page) => {
      const status = getPageStatus(page.page_number);

      // Apply filter
      switch (filter) {
        case 'unfixed':
          if (status !== 'unfixed') return false;
          break;
        case 'fixed':
          if (status !== 'fixed' && status !== 'clean') return false;
          break;
        case 'review':
          if (status !== 'review') return false;
          break;
      }

      // Apply search (future: search by OCR text)
      if (searchQuery) {
        // For now, just search by page number
        if (!page.page_number.toString().includes(searchQuery)) {
          return false;
        }
      }

      return true;
    });
  }, [pages, filter, searchQuery, issuesByPage]);

  const filterCounts = useMemo(() => {
    let unfixed = 0;
    let fixed = 0;
    let review = 0;

    pages.forEach((page) => {
      const status = getPageStatus(page.page_number);
      if (status === 'unfixed') unfixed++;
      else if (status === 'fixed' || status === 'clean') fixed++;
      else if (status === 'review') review++;
    });

    return { all: pages.length, unfixed, fixed, review };
  }, [pages, issuesByPage]);

  return (
    <aside className="w-[180px] bg-white border-r border-gray-200 flex flex-col flex-shrink-0">
      {/* Header */}
      <div className="p-3 border-b border-gray-100">
        <h2 className="text-sm font-semibold text-gray-900 mb-2">ページ</h2>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            type="text"
            placeholder="ページ検索..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-md
                       focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Filter tabs */}
      <div className="px-2 py-2 border-b border-gray-100">
        <div className="flex gap-1">
          {[
            { key: 'all', label: '全て', count: filterCounts.all },
            { key: 'unfixed', label: '未修正', count: filterCounts.unfixed },
            { key: 'fixed', label: '完了', count: filterCounts.fixed },
          ].map(({ key, label, count }) => (
            <button
              key={key}
              onClick={() => setFilter(key as FilterType)}
              className={cn(
                'flex-1 px-2 py-1 text-xs font-medium rounded transition-colors',
                filter === key
                  ? 'bg-blue-100 text-blue-700'
                  : 'text-gray-500 hover:bg-gray-100'
              )}
            >
              {label}
              {count > 0 && (
                <span className="ml-1 text-[10px] opacity-70">({count})</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Thumbnail list */}
      <div className="flex-1 overflow-y-auto scrollbar-thin p-2 space-y-2">
        {filteredPages.map((page) => {
          const pageIssues = issuesByPage.get(page.page_number) || [];
          const status = getPageStatus(page.page_number);
          const isActive = page.page_number === currentPageNumber;
          const unresolvedCount = pageIssues.filter(
            (i) => i.status !== 'corrected' && i.status !== 'skipped'
          ).length;

          return (
            <button
              key={page.page_number}
              onClick={() => onPageSelect(page.page_number)}
              className={cn(
                'thumbnail w-full group',
                isActive && 'thumbnail-active',
                status === 'unfixed' && !isActive && 'thumbnail-has-issues',
                status === 'fixed' && !isActive && 'thumbnail-completed'
              )}
              aria-label={`ページ ${page.page_number}`}
              aria-current={isActive ? 'page' : undefined}
            >
              {/* Thumbnail image - now uses data URL directly */}
              <div className="aspect-[3/4] bg-gray-100 relative">
                <img
                  src={page.thumbnail_url}
                  alt={`ページ ${page.page_number}`}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />

                {/* Status overlay */}
                {status === 'fixed' && (
                  <div className="absolute top-1 right-1 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center">
                    <Check className="w-3 h-3 text-white" />
                  </div>
                )}

                {/* Issue count badge */}
                {unresolvedCount > 0 && (
                  <div className="absolute top-1 right-1 px-1.5 py-0.5 bg-amber-500 text-white text-[10px] font-bold rounded-full min-w-[18px] text-center">
                    {unresolvedCount}
                  </div>
                )}

                {/* Hover overlay */}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                  <Eye className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow" />
                </div>
              </div>

              {/* Page number */}
              <div className="py-1 text-center">
                <span className={cn(
                  'text-xs font-medium',
                  isActive ? 'text-blue-600' : 'text-gray-600'
                )}>
                  {page.page_number}
                </span>
              </div>
            </button>
          );
        })}

        {filteredPages.length === 0 && (
          <div className="text-center py-8 text-xs text-gray-400">
            該当するページがありません
          </div>
        )}
      </div>
    </aside>
  );
}
