'use client';

import { useEffect, useState } from 'react';
import { useProjectStore } from '@/store/project';
import { Thumbnails } from './Thumbnails';
import { Canvas } from './Canvas';
import { IssuePanel } from '@/components/panels/IssuePanel';
import { ExportPanel } from '@/components/panels/ExportPanel';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import api, { type Page, type Issue } from '@/lib/api';
import {
  ChevronLeft,
  FileText,
  Presentation,
  Loader2,
  RefreshCw,
  Sparkles,
  Settings,
} from 'lucide-react';
import Link from 'next/link';

interface ViewerProps {
  projectId: string;
}

export function Viewer({ projectId }: ViewerProps) {
  const {
    project,
    pages,
    issues,
    currentPageNumber,
    isLoading,
    error,
    setProject,
    setPages,
    setIssues,
    setCurrentPageNumber,
    selectIssue,
    setLoading,
    setError,
    reset,
  } = useProjectStore();

  const [showExportPanel, setShowExportPanel] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Load project data
  useEffect(() => {
    const loadProject = async () => {
      setLoading(true);
      try {
        const [projectData, pagesData, issuesData] = await Promise.all([
          api.getProject(projectId),
          api.listPages(projectId),
          api.listIssues(projectId),
        ]);

        setProject(projectData);
        setPages(pagesData);
        setIssues(issuesData);

        // Select first issue if exists
        if (issuesData.length > 0) {
          selectIssue(issuesData[0]);
          setCurrentPageNumber(issuesData[0].page_number);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load project');
      } finally {
        setLoading(false);
      }
    };

    loadProject();

    return () => {
      reset();
    };
  }, [projectId]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const [pagesData, issuesData] = await Promise.all([
        api.listPages(projectId),
        api.listIssues(projectId),
      ]);
      setPages(pagesData);
      setIssues(issuesData);
    } catch (err) {
      console.error('Refresh failed:', err);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleIssueClick = (issue: Issue) => {
    selectIssue(issue);
  };

  const currentPage = pages.find((p) => p.page_number === currentPageNumber);
  const pageIssues = issues.filter((i) => i.page_number === currentPageNumber);

  const unresolvedCount = issues.filter(
    (i) => i.status !== 'corrected' && i.status !== 'skipped'
  ).length;

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-primary-500 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">プロジェクトを読み込み中...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="text-danger-600 mb-4">{error}</p>
          <Link href="/">
            <Button variant="secondary">ホームに戻る</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-100">
      {/* Header */}
      <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <Link href="/">
            <Button variant="ghost" size="sm" leftIcon={<ChevronLeft className="w-4 h-4" />}>
              戻る
            </Button>
          </Link>
          <div className="w-px h-6 bg-gray-200" />
          <h1 className="font-semibold text-gray-900 truncate max-w-[300px]">
            {project?.name || 'Loading...'}
          </h1>
          {project && (
            <Badge variant="default">{project.total_pages}ページ</Badge>
          )}
        </div>

        <div className="flex items-center gap-2">
          {unresolvedCount > 0 && (
            <Badge variant="warning">
              <Sparkles className="w-3 h-3 mr-1" />
              {unresolvedCount}件の修正候補
            </Badge>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefresh}
            isLoading={isRefreshing}
            leftIcon={<RefreshCw className="w-4 h-4" />}
          >
            更新
          </Button>

          <div className="w-px h-6 bg-gray-200" />

          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowExportPanel(true)}
            leftIcon={<FileText className="w-4 h-4" />}
          >
            PDF
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowExportPanel(true)}
            leftIcon={<Presentation className="w-4 h-4" />}
          >
            PPTX
          </Button>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Thumbnails sidebar */}
        <aside className="w-28 bg-white border-r border-gray-200 flex-shrink-0">
          <Thumbnails pages={pages} projectId={projectId} />
        </aside>

        {/* Canvas area */}
        <main className="flex-1 min-w-0">
          {currentPage ? (
            <Canvas
              imageUrl={api.getPageImageUrl(projectId, currentPageNumber)}
              pageWidth={currentPage.width}
              pageHeight={currentPage.height}
              issues={pageIssues}
              onIssueClick={handleIssueClick}
            />
          ) : (
            <div className="h-full flex items-center justify-center">
              <p className="text-gray-500">ページを選択してください</p>
            </div>
          )}
        </main>

        {/* Issue panel */}
        <aside className="w-80 bg-white border-l border-gray-200 flex-shrink-0">
          <IssuePanel />
        </aside>
      </div>

      {/* Export panel modal */}
      <ExportPanel
        projectId={projectId}
        isOpen={showExportPanel}
        onClose={() => setShowExportPanel(false)}
      />
    </div>
  );
}
