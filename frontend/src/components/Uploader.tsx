'use client';

import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, File, X, Loader2, Check, FileUp, Image, Presentation } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore, generateId } from '@/lib/store';

interface UploaderProps {
  onUploadComplete: (projectId: string) => void;
}

type UploadState = 'idle' | 'selected' | 'processing' | 'complete' | 'error';

// 対応ファイル形式
const ACCEPTED_TYPES = {
  'application/pdf': ['.pdf'],
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
};

function getFileType(file: File): 'pdf' | 'pptx' | 'image' | 'unknown' {
  if (file.type === 'application/pdf') return 'pdf';
  if (file.type === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
      file.name.endsWith('.pptx')) return 'pptx';
  if (file.type.startsWith('image/')) return 'image';
  return 'unknown';
}

function getFileIcon(file: File) {
  const type = getFileType(file);
  switch (type) {
    case 'pdf': return <File className="w-5 h-5 text-red-500" />;
    case 'pptx': return <Presentation className="w-5 h-5 text-orange-500" />;
    case 'image': return <Image className="w-5 h-5 text-blue-500" />;
    default: return <File className="w-5 h-5 text-gray-500" />;
  }
}

function getFileIconBg(file: File) {
  const type = getFileType(file);
  switch (type) {
    case 'pdf': return 'bg-red-50';
    case 'pptx': return 'bg-orange-50';
    case 'image': return 'bg-blue-50';
    default: return 'bg-gray-50';
  }
}

export function Uploader({ onUploadComplete }: UploaderProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [uploadState, setUploadState] = useState<UploadState>('idle');
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);

  const addProject = useAppStore((state) => state.addProject);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const validFiles = acceptedFiles.filter((f) => {
      const type = getFileType(f);
      return type !== 'unknown';
    });

    if (validFiles.length > 0) {
      setFiles(validFiles);
      setUploadState('selected');
      setError(null);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED_TYPES,
    maxFiles: 20, // 画像の場合は複数ファイル対応
    disabled: uploadState === 'processing',
  });

  const handleUpload = async () => {
    if (files.length === 0) return;

    setUploadState('processing');
    setProgress({ current: 0, total: 0 });

    try {
      const firstFile = files[0];
      const fileType = getFileType(firstFile);

      let pages;
      let projectName: string;

      if (fileType === 'pdf') {
        const { processPdf } = await import('@/lib/pdf-utils');
        pages = await processPdf(firstFile, (current, total) => {
          setProgress({ current, total });
        });
        projectName = firstFile.name.replace(/\.pdf$/i, '');

      } else if (fileType === 'pptx') {
        const { processPptx } = await import('@/lib/pdf-utils');
        pages = await processPptx(firstFile, (current, total) => {
          setProgress({ current, total });
        });
        projectName = firstFile.name.replace(/\.pptx$/i, '');

      } else if (fileType === 'image') {
        const { processImages } = await import('@/lib/pdf-utils');
        pages = await processImages(files, (current, total) => {
          setProgress({ current, total });
        });
        projectName = files.length === 1
          ? firstFile.name.replace(/\.[^.]+$/, '')
          : `画像 ${files.length}枚`;

      } else {
        throw new Error('対応していないファイル形式です');
      }

      // プロジェクト作成
      const projectId = generateId();
      const now = new Date().toISOString();

      await addProject({
        id: projectId,
        name: projectName,
        fileName: firstFile.name,
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

      setTimeout(() => {
        onUploadComplete(projectId);
      }, 800);
    } catch (err) {
      console.error('File processing error:', err);
      setError(err instanceof Error ? err.message : 'ファイル処理に失敗しました');
      setUploadState('error');
    }
  };

  const handleCancel = () => {
    setFiles([]);
    setUploadState('idle');
    setProgress({ current: 0, total: 0 });
    setError(null);
  };

  const progressPercent = progress.total > 0
    ? Math.round((progress.current / progress.total) * 100)
    : 0;

  const displayFile = files[0];
  const displayName = files.length === 1
    ? displayFile?.name
    : `${files.length}個のファイル`;
  const displaySize = files.reduce((sum, f) => sum + f.size, 0);

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
              {isDragActive ? 'ここにドロップ' : 'ファイルをドラッグ＆ドロップ'}
            </p>
            <p className="text-sm text-gray-500">
              または <span className="text-blue-600 font-medium hover:underline">ファイルを選択</span>
            </p>
            <p className="text-xs text-gray-400 mt-4">
              PDF / PPTX / JPG / PNG / WebP
            </p>
          </div>
        </div>
      )}

      {(uploadState === 'selected' || uploadState === 'error') && displayFile && (
        <div className="bg-white rounded-2xl ring-1 ring-gray-200 overflow-hidden">
          <div className="px-6 py-5 flex items-center gap-4">
            <div className={cn('w-11 h-11 rounded-lg flex items-center justify-center flex-shrink-0', getFileIconBg(displayFile))}>
              {getFileIcon(displayFile)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{displayName}</p>
              <p className="text-xs text-gray-500">
                {(displaySize / 1024 / 1024).toFixed(1)} MB
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
            ファイルを処理しています
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
