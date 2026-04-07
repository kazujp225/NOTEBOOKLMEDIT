'use client';

import { useState, useEffect, useMemo } from 'react';
import { X, Image as ImageIcon, Download, Copy, Check, ImageOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PageData, ExtractedImageData } from '@/lib/store';

interface ImageLibraryPanelProps {
  isOpen: boolean;
  onClose: () => void;
  pages: PageData[];
  projectName?: string;
}

interface FlatImage extends ExtractedImageData {
  pageNumber: number;
  index: number;
}

export function ImageLibraryPanel({ isOpen, onClose, pages, projectName }: ImageLibraryPanelProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [selected, setSelected] = useState<FlatImage | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Animate in
  useEffect(() => {
    if (isOpen) setIsVisible(true);
    else setSelected(null);
  }, [isOpen]);

  // Flatten extracted images across all pages
  const allImages = useMemo<FlatImage[]>(() => {
    const out: FlatImage[] = [];
    for (const page of pages) {
      const exs = page.extractedImages || [];
      exs.forEach((ex, i) => {
        out.push({ ...ex, pageNumber: page.pageNumber, index: i });
      });
    }
    return out;
  }, [pages]);

  // Group by page number for display
  const grouped = useMemo(() => {
    const map = new Map<number, FlatImage[]>();
    for (const img of allImages) {
      const arr = map.get(img.pageNumber) || [];
      arr.push(img);
      map.set(img.pageNumber, arr);
    }
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
  }, [allImages]);

  const handleClose = () => {
    setIsVisible(false);
    setTimeout(onClose, 150);
  };

  const handleDownload = (img: FlatImage) => {
    const link = document.createElement('a');
    link.href = img.dataUrl;
    const safeName = projectName ? projectName.replace(/[^\w-]+/g, '_') : 'image';
    link.download = `${safeName}_p${img.pageNumber}_${img.index + 1}.png`;
    link.click();
  };

  const handleCopy = async (img: FlatImage) => {
    try {
      // Convert dataURL → Blob → write to clipboard
      const res = await fetch(img.dataUrl);
      const blob = await res.blob();
      // ClipboardItem may not be available in some environments; fall back to text URL.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ClipboardItemRef = (window as any).ClipboardItem;
      if (ClipboardItemRef && navigator.clipboard && navigator.clipboard.write) {
        await navigator.clipboard.write([new ClipboardItemRef({ [blob.type]: blob })]);
      } else {
        await navigator.clipboard.writeText(img.dataUrl);
      }
      const k = `${img.pageNumber}-${img.index}`;
      setCopiedKey(k);
      setTimeout(() => setCopiedKey((cur) => (cur === k ? null : cur)), 1500);
    } catch (err) {
      console.warn('clipboard copy failed', err);
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
            <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
              <ImageIcon className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">画像ライブラリ</h2>
              <p className="text-sm text-gray-400">
                {allImages.length > 0
                  ? `${allImages.length} 枚の画像（${grouped.length} ページから抽出）`
                  : '抽出された画像はありません'}
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
          {allImages.length === 0 ? (
            <div className="h-full min-h-[300px] flex flex-col items-center justify-center text-center px-6 py-12">
              <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
                <ImageOff className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-base font-semibold text-gray-700">画像がありません</h3>
              <p className="text-sm text-gray-400 mt-2 max-w-sm">
                このプロジェクトには抽出された埋め込み画像がありません。
                <br />
                新しくPDFをアップロードすると、PDF内の画像が自動で抽出されてここに表示されます。
              </p>
            </div>
          ) : (
            <div className="p-6 space-y-8">
              {grouped.map(([pageNumber, imgs]) => (
                <section key={pageNumber}>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                    ページ {pageNumber} ・ {imgs.length} 枚
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                    {imgs.map((img) => {
                      const k = `${img.pageNumber}-${img.index}`;
                      return (
                        <div
                          key={k}
                          className="group relative bg-gray-50 border border-gray-200 rounded-lg overflow-hidden hover:border-blue-400 hover:shadow-md transition-all"
                        >
                          <button
                            type="button"
                            onClick={() => setSelected(img)}
                            className="block w-full aspect-square bg-[url('data:image/svg+xml;utf8,<svg%20xmlns=%22http://www.w3.org/2000/svg%22%20width=%2220%22%20height=%2220%22><rect%20width=%2210%22%20height=%2210%22%20fill=%22%23f3f4f6%22/><rect%20x=%2210%22%20y=%2210%22%20width=%2210%22%20height=%2210%22%20fill=%22%23f3f4f6%22/></svg>')]"
                            aria-label="画像を拡大表示"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={img.dataUrl}
                              alt={img.sourceName || `画像 ${img.index + 1}`}
                              className="w-full h-full object-contain"
                              loading="lazy"
                            />
                          </button>
                          <div className="px-2 py-1.5 text-[10px] text-gray-500 flex items-center justify-between bg-white border-t border-gray-100">
                            <span className="tabular-nums">
                              {img.width}×{img.height}
                            </span>
                            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleCopy(img);
                                }}
                                className="p-1 hover:bg-gray-100 rounded text-gray-500"
                                title="クリップボードにコピー"
                              >
                                {copiedKey === k ? (
                                  <Check className="w-3 h-3 text-green-500" />
                                ) : (
                                  <Copy className="w-3 h-3" />
                                )}
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDownload(img);
                                }}
                                className="p-1 hover:bg-gray-100 rounded text-gray-500"
                                title="ダウンロード"
                              >
                                <Download className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 flex-shrink-0">
          <button
            onClick={handleClose}
            className="w-full py-2.5 text-sm font-medium text-gray-500 hover:text-gray-700 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors"
          >
            閉じる
          </button>
        </div>
      </div>

      {/* Lightbox for enlarged image */}
      {selected && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-6"
          onClick={() => setSelected(null)}
        >
          <div
            className="relative max-w-[90vw] max-h-[90vh] flex flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={selected.dataUrl}
              alt={selected.sourceName || `ページ${selected.pageNumber}の画像`}
              className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl"
            />
            <div className="mt-4 flex items-center gap-2">
              <div className="px-3 py-1.5 bg-white/90 rounded-lg text-xs text-gray-700 tabular-nums">
                ページ {selected.pageNumber} ・ {selected.width}×{selected.height}
                {selected.sourceName && <span className="ml-2 text-gray-400">{selected.sourceName}</span>}
              </div>
              <button
                onClick={() => handleCopy(selected)}
                className="p-2 bg-white/90 hover:bg-white rounded-lg text-gray-700"
                title="クリップボードにコピー"
              >
                {copiedKey === `${selected.pageNumber}-${selected.index}` ? (
                  <Check className="w-4 h-4 text-green-500" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </button>
              <button
                onClick={() => handleDownload(selected)}
                className="p-2 bg-white/90 hover:bg-white rounded-lg text-gray-700"
                title="ダウンロード"
              >
                <Download className="w-4 h-4" />
              </button>
              <button
                onClick={() => setSelected(null)}
                className="p-2 bg-white/90 hover:bg-white rounded-lg text-gray-700"
                title="閉じる"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
