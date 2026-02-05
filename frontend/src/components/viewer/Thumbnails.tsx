'use client';

import { cn } from '@/lib/utils';
import { useProjectStore } from '@/store/project';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { Page } from '@/lib/api';

interface ThumbnailsProps {
  pages: Page[];
  projectId: string;
}

export function Thumbnails({ pages, projectId }: ThumbnailsProps) {
  const { currentPageNumber, setCurrentPageNumber, issues } = useProjectStore();

  const getPageIssueCount = (pageNumber: number) => {
    return issues.filter(
      (i) => i.page_number === pageNumber && i.status !== 'corrected' && i.status !== 'skipped'
    ).length;
  };

  return (
    <div className="h-full overflow-y-auto p-3 space-y-2">
      {pages.map((page) => {
        const issueCount = getPageIssueCount(page.page_number);
        const isActive = currentPageNumber === page.page_number;
        const hasIssues = issueCount > 0;

        return (
          <button
            key={page.id}
            onClick={() => setCurrentPageNumber(page.page_number)}
            className={cn(
              'relative w-full aspect-[3/4] rounded-lg overflow-hidden transition-all duration-200',
              'border-2 hover:border-primary-400 hover:shadow-lg',
              'focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2',
              isActive
                ? 'border-primary-500 shadow-lg ring-2 ring-primary-200'
                : hasIssues
                ? 'border-warning-400'
                : 'border-transparent'
            )}
          >
            {/* Thumbnail Image */}
            <img
              src={page.thumbnail_url}
              alt={`Page ${page.page_number}`}
              className="w-full h-full object-cover"
              loading="lazy"
            />

            {/* Page Number Badge */}
            <div
              className={cn(
                'absolute bottom-1 left-1 px-1.5 py-0.5 text-xs font-medium rounded',
                isActive
                  ? 'bg-primary-500 text-white'
                  : 'bg-black/50 text-white'
              )}
            >
              {page.page_number}
            </div>

            {/* Issue Indicator */}
            {hasIssues && (
              <div className="absolute top-1 right-1 flex items-center gap-1 px-1.5 py-0.5 bg-warning-500 text-white text-xs font-medium rounded-full">
                <AlertTriangle className="w-3 h-3" />
                {issueCount}
              </div>
            )}

            {/* All Corrected Indicator */}
            {!hasIssues && page.issue_count > 0 && (
              <div className="absolute top-1 right-1">
                <CheckCircle2 className="w-5 h-5 text-success-500 drop-shadow" />
              </div>
            )}

            {/* OCR Status */}
            {page.ocr_status === 'processing' && (
              <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
