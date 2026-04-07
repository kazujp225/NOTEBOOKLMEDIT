'use client';

import { useState, useEffect, useMemo } from 'react';
import { X, FolderInput, Check, Loader2, Inbox, ArrowLeft, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore, type Project, type PageData } from '@/lib/store';

interface ImportPagesPanelProps {
  isOpen: boolean;
  onClose: () => void;
  currentProjectId: string;
  onImport: (sourceProjectId: string, sourcePageNumbers: number[]) => Promise<void>;
}

export function ImportPagesPanel({ isOpen, onClose, currentProjectId, onImport }: ImportPagesPanelProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [sourcePages, setSourcePages] = useState<PageData[]>([]);
  const [sourceMetaPageCount, setSourceMetaPageCount] = useState<number>(0);
  const [loadingSource, setLoadingSource] = useState(false);
  const [selectedPageNumbers, setSelectedPageNumbers] = useState<Set<number>>(new Set());
  const [importing, setImporting] = useState(false);

  const projects = useAppStore((state) => state.projects);
  const loadProjectWithImages = useAppStore((state) => state.loadProjectWithImages);

  // Other projects: exclude the current one AND any project with zero pages
  // (those are stale/empty and would just confuse the user as a source).
  const otherProjects = useMemo<Project[]>(
    () => projects.filter((p) => p.id !== currentProjectId && p.pages.length > 0),
    [projects, currentProjectId]
  );

  useEffect(() => {
    if (isOpen) setIsVisible(true);
    else {
      // Reset on close
      setSelectedSourceId(null);
      setSourcePages([]);
      setSelectedPageNumbers(new Set());
    }
  }, [isOpen]);

  // Load thumbnails when a source project is selected
  useEffect(() => {
    if (!selectedSourceId) {
      setSourcePages([]);
      setSourceMetaPageCount(0);
      return;
    }
    // Capture metadata-side page count immediately so we can detect orphan metadata
    const meta = projects.find((p) => p.id === selectedSourceId);
    setSourceMetaPageCount(meta?.pages.length || 0);

    let cancelled = false;
    setLoadingSource(true);
    setSelectedPageNumbers(new Set());
    loadProjectWithImages(selectedSourceId)
      .then((p) => {
        if (cancelled) return;
        if (p) setSourcePages(p.pages);
      })
      .catch((err) => console.warn('failed to load source project', err))
      .finally(() => {
        if (!cancelled) setLoadingSource(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedSourceId, loadProjectWithImages, projects]);

  const handleClose = () => {
    setIsVisible(false);
    setTimeout(onClose, 150);
  };

  const togglePage = (pageNumber: number) => {
    setSelectedPageNumbers((prev) => {
      const next = new Set(prev);
      if (next.has(pageNumber)) next.delete(pageNumber);
      else next.add(pageNumber);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedPageNumbers(new Set(sourcePages.map((p) => p.pageNumber)));
  };

  const clearSelection = () => {
    setSelectedPageNumbers(new Set());
  };

  const handleImport = async () => {
    if (!selectedSourceId || selectedPageNumbers.size === 0) return;
    setImporting(true);
    try {
      // Preserve the source page order, not the click order
      const sorted = Array.from(selectedPageNumbers).sort((a, b) => a - b);
      await onImport(selectedSourceId, sorted);
      handleClose();
    } finally {
      setImporting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className={cn(
        'fixed inset-0 z-50 flex items-center justify-center transition-all duration-150',
        isVisible ? 'bg-black/40 backdrop-blur-sm' : 'bg-transparent'
      )}
      onClick={handleClose}
    >
      <div
        className={cn(
          'bg-white rounded-2xl shadow-2xl w-full max-w-5xl mx-4 max-h-[85vh] overflow-hidden flex flex-col transition-all duration-150 border border-gray-200',
          isVisible ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-gray-200 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            {selectedSourceId && (
              <button
                onClick={() => setSelectedSourceId(null)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                aria-label="プロジェクト一覧に戻る"
              >
                <ArrowLeft className="w-4 h-4 text-gray-500" />
              </button>
            )}
            <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center">
              <FolderInput className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">他のPDFからページを取り込む</h2>
              <p className="text-sm text-gray-400">
                {selectedSourceId
                  ? `取り込みたいページを選択 (${selectedPageNumbers.size} 件選択中)`
                  : `取り込み元のプロジェクトを選択 (${otherProjects.length} 件)`}
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="閉じる"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {/* Empty state */}
          {otherProjects.length === 0 && (
            <div className="h-full min-h-[300px] flex flex-col items-center justify-center text-center px-6 py-12">
              <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
                <Inbox className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-base font-semibold text-gray-700">他のプロジェクトがありません</h3>
              <p className="text-sm text-gray-400 mt-2 max-w-sm">
                取り込み元として使えるプロジェクトがありません。
                <br />
                ホーム画面から先に他のPDFをアップロードしてください。
              </p>
            </div>
          )}

          {/* Project list */}
          {otherProjects.length > 0 && !selectedSourceId && (
            <div className="p-6 space-y-2">
              {otherProjects.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setSelectedSourceId(p.id)}
                  className="w-full px-4 py-3 flex items-center gap-4 bg-gray-50 hover:bg-gray-100 hover:border-blue-400 border border-gray-200 rounded-xl transition-colors text-left"
                >
                  <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                    <FolderInput className="w-5 h-5 text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{p.name}</p>
                    <p className="text-xs text-gray-400">{p.totalPages} ページ</p>
                  </div>
                  <span className="text-xs text-blue-600 font-medium flex-shrink-0">選択 →</span>
                </button>
              ))}
            </div>
          )}

          {/* Page selector for chosen source project */}
          {selectedSourceId && (
            <div className="p-6">
              {loadingSource ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
                </div>
              ) : sourcePages.length === 0 ? (
                <div className="flex flex-col items-center text-center py-12 px-6">
                  <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center mb-4">
                    <AlertTriangle className="w-6 h-6 text-amber-600" />
                  </div>
                  <h4 className="text-sm font-semibold text-gray-900 mb-2">
                    {sourceMetaPageCount > 0
                      ? 'ページの画像データが見つかりません'
                      : 'このプロジェクトにはページがありません'}
                  </h4>
                  <p className="text-xs text-gray-500 max-w-md leading-relaxed">
                    {sourceMetaPageCount > 0 ? (
                      <>
                        メタデータ上は <strong>{sourceMetaPageCount}</strong> ページありますが、ブラウザの
                        IndexedDBから画像が読み込めませんでした。
                        <br />
                        ストレージがクリアされた、別ブラウザで作成された、または容量超過の可能性があります。
                        <br />
                        該当のPDFを再アップロードしてください。
                      </>
                    ) : (
                      <>このプロジェクトにはページがありません。</>
                    )}
                  </p>
                  <div className="mt-4 p-2 bg-gray-100 rounded text-[10px] text-gray-500 font-mono break-all max-w-md">
                    debug: id={selectedSourceId} / meta_pages={sourceMetaPageCount} / loaded={sourcePages.length}
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-xs text-gray-500">
                      クリックでページを選択 / 解除
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={selectAll}
                        className="text-xs text-blue-600 hover:text-blue-800 font-medium px-2 py-1 rounded hover:bg-blue-50"
                      >
                        すべて選択
                      </button>
                      <button
                        onClick={clearSelection}
                        className="text-xs text-gray-600 hover:text-gray-800 font-medium px-2 py-1 rounded hover:bg-gray-100"
                      >
                        解除
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
                    {sourcePages.map((p) => {
                      const selected = selectedPageNumbers.has(p.pageNumber);
                      return (
                        <button
                          key={p.pageNumber}
                          onClick={() => togglePage(p.pageNumber)}
                          className={cn(
                            'group relative bg-gray-50 border rounded-lg overflow-hidden transition-all',
                            selected
                              ? 'border-blue-500 ring-2 ring-blue-500 ring-offset-1'
                              : 'border-gray-200 hover:border-blue-300'
                          )}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={p.thumbnailDataUrl}
                            alt={`ページ ${p.pageNumber}`}
                            className="w-full aspect-[3/4] object-contain bg-white"
                            loading="lazy"
                          />
                          {selected && (
                            <div className="absolute top-1 right-1 w-5 h-5 bg-blue-500 text-white rounded-full flex items-center justify-center shadow-lg">
                              <Check className="w-3 h-3" />
                            </div>
                          )}
                          <div className="px-2 py-1 text-[10px] text-gray-500 text-center bg-white border-t border-gray-100">
                            ページ {p.pageNumber}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 flex items-center gap-3 flex-shrink-0">
          <button
            onClick={handleClose}
            className="flex-1 py-2.5 text-sm font-medium text-gray-700 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors"
          >
            キャンセル
          </button>
          <button
            onClick={handleImport}
            disabled={!selectedSourceId || selectedPageNumbers.size === 0 || importing}
            className="flex-1 py-2.5 text-sm font-semibold text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            {importing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                取り込み中...
              </>
            ) : (
              <>
                <FolderInput className="w-4 h-4" />
                {selectedPageNumbers.size > 0
                  ? `${selectedPageNumbers.size} ページを末尾に追加`
                  : 'ページを選択してください'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
