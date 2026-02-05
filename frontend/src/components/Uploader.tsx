'use client';

import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, File, X, Loader2, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './ui/Button';
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

      // Create project in local store
      const projectId = generateId();
      const now = new Date().toISOString();

      addProject({
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
    <div className="w-full max-w-2xl mx-auto">
      {uploadState === 'idle' && (
        <div
          {...getRootProps()}
          className={cn(
            'relative border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer',
            'transition-all duration-300 ease-out',
            'hover:border-blue-400 hover:bg-blue-50/50',
            isDragActive
              ? 'border-blue-500 bg-blue-50 scale-[1.02]'
              : 'border-gray-300 bg-white'
          )}
        >
          <input {...getInputProps()} />

          <div className={cn(
            'w-20 h-20 mx-auto mb-6 rounded-2xl flex items-center justify-center',
            'transition-all duration-300',
            isDragActive ? 'bg-blue-100 scale-110' : 'bg-gray-100'
          )}>
            <Upload
              className={cn(
                'w-10 h-10 transition-colors duration-300',
                isDragActive ? 'text-blue-500' : 'text-gray-400'
              )}
            />
          </div>

          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            {isDragActive ? 'ここにドロップ' : 'PDFファイルをドロップ'}
          </h3>
          <p className="text-gray-500 mb-4">
            または
            <span className="text-blue-600 font-medium mx-1">
              クリックして選択
            </span>
          </p>
          <p className="text-sm text-gray-400">
            最大100ページまでのPDFファイルに対応
          </p>
        </div>
      )}

      {(uploadState === 'selected' || uploadState === 'error') && file && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-14 h-14 bg-blue-100 rounded-xl flex items-center justify-center">
              <File className="w-7 h-7 text-blue-600" />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="font-semibold text-gray-900 truncate">{file.name}</h4>
              <p className="text-sm text-gray-500">
                {(file.size / 1024 / 1024).toFixed(2)} MB
              </p>
            </div>
            <button
              onClick={handleCancel}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <Button variant="secondary" onClick={handleCancel} className="flex-1">
              キャンセル
            </Button>
            <Button onClick={handleUpload} className="flex-1">
              処理を開始
            </Button>
          </div>
        </div>
      )}

      {uploadState === 'processing' && (
        <div className="bg-white rounded-2xl border border-gray-200 p-8 shadow-sm text-center animate-in fade-in duration-300">
          <div className="w-16 h-16 mx-auto mb-6 animate-spin">
            <Loader2 className="w-16 h-16 text-blue-500" />
          </div>

          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            PDF解析中...
          </h3>
          <p className="text-gray-500 mb-6">
            {progress.total > 0
              ? `ページ ${progress.current} / ${progress.total} を処理中`
              : 'PDFを読み込んでいます...'}
          </p>

          <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-blue-400 rounded-full transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <p className="text-sm text-gray-400 mt-2">{progressPercent}%</p>
        </div>
      )}

      {uploadState === 'complete' && (
        <div className="bg-white rounded-2xl border border-green-200 p-8 shadow-sm text-center animate-in fade-in zoom-in-95 duration-300">
          <div className="w-16 h-16 mx-auto mb-4 bg-green-100 rounded-full flex items-center justify-center animate-in zoom-in duration-300">
            <CheckCircle2 className="w-10 h-10 text-green-500" />
          </div>

          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            処理完了!
          </h3>
          <p className="text-gray-500">エディタを開いています...</p>
        </div>
      )}
    </div>
  );
}
