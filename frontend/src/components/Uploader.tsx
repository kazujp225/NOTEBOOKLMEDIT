'use client';

import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, File, X, Loader2, Check, FileUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore, generateId } from '@/lib/store';

interface UploaderProps {
  onUploadComplete: (projectId: string) => void;
}

type UploadState = 'idle' | 'selected' | 'processing' | 'complete' | 'error';

export function Uploader({ onUploadComplete }: UploaderProps) {
  const [file, setFile] = useState<File | null>(null);
  const [uploadState, setUploadState] = useState<UploadState>('idle');
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);

  const addProject = useAppStore((state) => state.addProject);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const pdfFile = acceptedFiles.find((f) => f.type === 'application/pdf');
    if (pdfFile) {
      setFile(pdfFile);
      setUploadState('selected');
      setError(null);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
    },
    maxFiles: 1,
    disabled: uploadState === 'processing',
  });

  const handleUpload = async () => {
    if (!file) return;

    setUploadState('processing');
    setProgress({ current: 0, total: 0 });

    try {
      // Dynamic import to avoid SSR issues with PDF.js
      const { processPdf } = await import('@/lib/pdf-utils');

      // Process PDF in browser using PDF.js
      const pages = await processPdf(file, (current, total) => {
        setProgress({ current, total });
      });

      // Create project in local store (images saved to IndexedDB)
      const projectId = generateId();
      const now = new Date().toISOString();

      await addProject({
        id: projectId,
        name: file.name.replace(/\.pdf$/i, ''),
        fileName: file.name,
        totalPages: pages.length,
        pages: pages.map((page) => ({
          pageNumber: page.pageNumber,
          imageDataUrl: page.imageDataUrl,
          width: page.width,
          height: page.height,
          thumbnailDataUrl: page.thumbnailDataUrl,
        })),
        issues: [],
        status: 'ready',
        createdAt: now,
        updatedAt: now,
      });

      setUploadState('complete');

      // Navigate to editor after brief delay
      setTimeout(() => {
        onUploadComplete(projectId);
      }, 800);
    } catch (err) {
      console.error('PDF processing error:', err);
      setError(err instanceof Error ? err.message : 'PDF処理に失敗しました');
      setUploadState('error');
    }
  };

  const handleCancel = () => {
    setFile(null);
    setUploadState('idle');
    setProgress({ current: 0, total: 0 });
    setError(null);
  };

  const progressPercent = progress.total > 0
    ? Math.round((progress.current / progress.total) * 100)
    : 0;

  return (
    <div className="w-full max-w-3xl mx-auto">
      {uploadState === 'idle' && (
        <div
          {...getRootProps()}
          className={cn(
            'group relative rounded-2xl transition-all cursor-pointer overflow-hidden',
            isDragActive
              ? 'bg-blue-50 ring-2 ring-blue-500'
              : 'bg-white hover:bg-gray-50 ring-1 ring-gray-200 hover:ring-gray-300 hover:shadow-md'
          )}
        >
          <input {...getInputProps()} />

          <div className="px-8 py-14 flex flex-col items-center">
            {/* Icon */}
            <div className={cn(
              'w-16 h-16 rounded-full flex items-center justify-center mb-5 transition-colors',
              isDragActive ? 'bg-blue-100' : 'bg-gray-100 group-hover:bg-blue-50'
            )}>
              <FileUp className={cn(
                'w-7 h-7 transition-colors',
                isDragActive ? 'text-blue-600' : 'text-gray-400 group-hover:text-blue-500'
              )} />
            </div>

            {/* Text */}
            <p className="text-base font-medium text-gray-900 mb-1">
              {isDragActive ? 'ここにドロップ' : 'PDFファイルをドラッグ＆ドロップ'}
            </p>
            <p className="text-sm text-gray-500">
              または <span className="text-blue-600 font-medium hover:underline">ファイルを選択</span>
            </p>
            <p className="text-xs text-gray-400 mt-4">
              PDF / 最大100ページ
            </p>
          </div>
        </div>
      )}

      {(uploadState === 'selected' || uploadState === 'error') && file && (
        <div className="bg-white rounded-2xl ring-1 ring-gray-200 overflow-hidden">
          <div className="px-6 py-5 flex items-center gap-4">
            <div className="w-11 h-11 bg-red-50 rounded-lg flex items-center justify-center flex-shrink-0">
              <File className="w-5 h-5 text-red-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{file.name}</p>
              <p className="text-xs text-gray-500">
                {(file.size / 1024 / 1024).toFixed(1)} MB
              </p>
            </div>
            <button
              onClick={handleCancel}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            >
              <X className="w-4 h-4 text-gray-400" />
            </button>
          </div>

          {error && (
            <div className="mx-6 mb-4 px-4 py-3 bg-red-50 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="px-6 pb-5 flex gap-3">
            <button
              onClick={handleCancel}
              className="flex-1 px-5 py-2.5 text-sm font-medium text-gray-700 bg-white ring-1 ring-gray-300 hover:bg-gray-50 rounded-full transition-colors"
            >
              キャンセル
            </button>
            <button
              onClick={handleUpload}
              className="flex-1 px-5 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-full transition-colors shadow-sm"
            >
              開始
            </button>
          </div>
        </div>
      )}

      {uploadState === 'processing' && (
        <div className="bg-white rounded-2xl ring-1 ring-gray-200 px-8 py-10 text-center">
          <div className="w-10 h-10 mx-auto mb-5">
            <svg className="animate-spin w-full h-full text-blue-600" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
              <path className="opacity-80" d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            </svg>
          </div>

          <p className="text-sm font-medium text-gray-900 mb-1">
            PDFを処理しています
          </p>
          <p className="text-xs text-gray-500 mb-5">
            {progress.total > 0
              ? `${progress.current} / ${progress.total} ページ`
              : '読み込み中...'}
          </p>

          <div className="w-full max-w-xs mx-auto bg-gray-100 rounded-full h-1 overflow-hidden">
            <div
              className="h-full bg-blue-600 rounded-full transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      )}

      {uploadState === 'complete' && (
        <div className="bg-white rounded-2xl ring-1 ring-gray-200 px-8 py-10 text-center">
          <div className="w-12 h-12 mx-auto mb-4 bg-green-100 rounded-full flex items-center justify-center">
            <Check className="w-6 h-6 text-green-600" />
          </div>

          <p className="text-sm font-medium text-gray-900 mb-1">
            完了
          </p>
          <p className="text-xs text-gray-500">エディタを開いています...</p>
        </div>
      )}
    </div>
  );
}
