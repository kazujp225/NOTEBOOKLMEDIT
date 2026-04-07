'use client';

import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, File, X, Loader2, Check, FileUp, Image } from 'lucide-react';
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
  if (file.type === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' || file.name.endsWith('.pptx')) return 'pptx';
  if (file.type.startsWith('image/')) return 'image';
  return 'unknown';
}

function getFileIcon(file: File) {
  const type = getFileType(file);
  switch (type) {
    case 'pdf': return <File className="w-5 h-5 text-red-500" />;
    case 'pptx': return <File className="w-5 h-5 text-orange-500" />;
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

interface CreatedProject {
  id: string;
  name: string;
  pageCount: number;
}

interface UploadProgress {
  fileIndex: number;
  fileTotal: number;
  fileName: string;
  pageCurrent: number;
  pageTotal: number;
}

export function Uploader({ onUploadComplete }: UploaderProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [uploadState, setUploadState] = useState<UploadState>('idle');
  const [progress, setProgress] = useState<UploadProgress>({
    fileIndex: 0,
    fileTotal: 0,
    fileName: '',
    pageCurrent: 0,
    pageTotal: 0,
  });
  const [error, setError] = useState<string | null>(null);
  const [createdProjects, setCreatedProjects] = useState<CreatedProject[]>([]);
  const [failedFiles, setFailedFiles] = useState<string[]>([]);

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
    maxFiles: 20,
    disabled: uploadState === 'processing',
  });

  const handleUpload = async () => {
    if (files.length === 0) return;

    setUploadState('processing');
    setError(null);
    setCreatedProjects([]);
    setFailedFiles([]);

    // Group images together as a single collection (existing behavior).
    // PDF and PPTX files each become their own project.
    const docFiles = files.filter((f) => {
      const t = getFileType(f);
      return t === 'pdf' || t === 'pptx';
    });
    const imageFiles = files.filter((f) => getFileType(f) === 'image');

    // "Tasks" — each entry is one project to create
    type Task =
      | { kind: 'pdf'; file: File }
      | { kind: 'pptx'; file: File }
      | { kind: 'images'; files: File[] };

    const tasks: Task[] = [
      ...docFiles.map<Task>((file) =>
        getFileType(file) === 'pdf' ? { kind: 'pdf', file } : { kind: 'pptx', file }
      ),
      ...(imageFiles.length > 0 ? [{ kind: 'images', files: imageFiles } as Task] : []),
    ];

    const created: CreatedProject[] = [];
    const failed: string[] = [];

    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];
      const fileLabel =
        task.kind === 'images'
          ? `画像 ${task.files.length}枚`
          : task.file.name;

      setProgress({
        fileIndex: i + 1,
        fileTotal: tasks.length,
        fileName: fileLabel,
        pageCurrent: 0,
        pageTotal: 0,
      });

      try {
        let pages;
        let projectName: string;
        let firstFileName: string;

        if (task.kind === 'pdf') {
          const { processPdf } = await import('@/lib/pdf-utils');
          pages = await processPdf(task.file, (current, total) => {
            setProgress((prev) => ({ ...prev, pageCurrent: current, pageTotal: total }));
          });
          projectName = task.file.name.replace(/\.pdf$/i, '');
          firstFileName = task.file.name;
        } else if (task.kind === 'pptx') {
          const { processPptx } = await import('@/lib/pdf-utils');
          pages = await processPptx(task.file, (current, total) => {
            setProgress((prev) => ({ ...prev, pageCurrent: current, pageTotal: total }));
          });
          projectName = task.file.name.replace(/\.pptx$/i, '');
          firstFileName = task.file.name;
        } else {
          // images
          const { processImages } = await import('@/lib/pdf-utils');
          pages = await processImages(task.files, (current, total) => {
            setProgress((prev) => ({ ...prev, pageCurrent: current, pageTotal: total }));
          });
          projectName =
            task.files.length === 1
              ? task.files[0].name.replace(/\.[^.]+$/, '')
              : `画像 ${task.files.length}枚`;
          firstFileName = task.files[0].name;
        }

        if (!pages || pages.length === 0) {
          throw new Error('ページが取得できませんでした');
        }

        const projectId = generateId();
        const now = new Date().toISOString();

        await addProject({
          id: projectId,
          name: projectName,
          fileName: firstFileName,
          totalPages: pages.length,
          pages: pages.map((page) => ({
            pageNumber: page.pageNumber,
            imageDataUrl: page.imageDataUrl,
            width: page.width,
            height: page.height,
            thumbnailDataUrl: page.thumbnailDataUrl,
            extractedImages: page.extractedImages?.map((ex) => ({
              width: ex.width,
              height: ex.height,
              sourceName: ex.name,
              dataUrl: ex.dataUrl,
            })),
          })),
          issues: [],
          textOverlays: [],
          status: 'ready',
          createdAt: now,
          updatedAt: now,
        });

        created.push({ id: projectId, name: projectName, pageCount: pages.length });
        setCreatedProjects([...created]);
      } catch (err) {
        console.error(`File processing error for ${fileLabel}:`, err);
        failed.push(fileLabel);
        setFailedFiles([...failed]);
      }
    }

    if (created.length === 0) {
      setError('すべてのファイルの処理に失敗しました。もう一度お試しください。');
      setUploadState('error');
      return;
    }

    setUploadState('complete');

    // Single project → existing auto-navigate behavior.
    // Multiple → show the completion list and let the user pick.
    if (created.length === 1 && failed.length === 0) {
      setTimeout(() => {
        onUploadComplete(created[0].id);
      }, 800);
    }
  };

  const handleCancel = () => {
    setFiles([]);
    setUploadState('idle');
    setProgress({ fileIndex: 0, fileTotal: 0, fileName: '', pageCurrent: 0, pageTotal: 0 });
    setError(null);
    setCreatedProjects([]);
    setFailedFiles([]);
  };

  // Combined progress: completed files + (current file pageCurrent/pageTotal as a fraction)
  const fileFraction =
    progress.pageTotal > 0 ? progress.pageCurrent / progress.pageTotal : 0;
  const overallFraction =
    progress.fileTotal > 0
      ? ((progress.fileIndex - 1) + fileFraction) / progress.fileTotal
      : 0;
  const progressPercent = Math.round(overallFraction * 100);

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
            {progress.fileTotal > 1
              ? `ファイル ${progress.fileIndex} / ${progress.fileTotal} を処理中`
              : 'ファイルを処理しています'}
          </p>
          <p className="text-xs text-gray-500 mb-1 truncate max-w-sm mx-auto">
            {progress.fileName}
          </p>
          <p className="text-xs text-gray-400 mb-5">
            {progress.pageTotal > 0
              ? `${progress.pageCurrent} / ${progress.pageTotal} ページ`
              : '読み込み中...'}
          </p>

          <div className="w-full max-w-xs mx-auto bg-gray-100 rounded-full h-1 overflow-hidden">
            <div
              className="h-full bg-blue-600 rounded-full transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          {createdProjects.length > 0 && (
            <p className="text-xs text-gray-400 mt-4">
              {createdProjects.length} 個のプロジェクトを作成済み
            </p>
          )}
        </div>
      )}

      {uploadState === 'complete' && createdProjects.length === 1 && failedFiles.length === 0 && (
        <div className="bg-white rounded-2xl ring-1 ring-gray-200 px-8 py-10 text-center">
          <div className="w-12 h-12 mx-auto mb-4 bg-green-100 rounded-full flex items-center justify-center">
            <Check className="w-6 h-6 text-green-600" />
          </div>

          <p className="text-sm font-medium text-gray-900 mb-1">完了</p>
          <p className="text-xs text-gray-500">エディタを開いています...</p>
        </div>
      )}

      {uploadState === 'complete' && (createdProjects.length > 1 || failedFiles.length > 0) && (
        <div className="bg-white rounded-2xl ring-1 ring-gray-200 overflow-hidden">
          <div className="px-6 py-5 flex items-center gap-3 border-b border-gray-100">
            <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
              <Check className="w-5 h-5 text-green-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900">
                {createdProjects.length} 個のプロジェクトを作成しました
              </p>
              {failedFiles.length > 0 && (
                <p className="text-xs text-red-600 mt-0.5">
                  {failedFiles.length} 個のファイルが処理に失敗しました
                </p>
              )}
            </div>
          </div>

          <div className="max-h-[320px] overflow-y-auto">
            {createdProjects.map((p) => (
              <button
                key={p.id}
                onClick={() => onUploadComplete(p.id)}
                className="w-full px-6 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-b-0 text-left"
              >
                <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                  <File className="w-4 h-4 text-blue-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{p.name}</p>
                  <p className="text-xs text-gray-400">{p.pageCount} ページ</p>
                </div>
                <span className="text-xs text-blue-600 font-medium flex-shrink-0">開く →</span>
              </button>
            ))}
            {failedFiles.length > 0 && (
              <div className="px-6 py-3 bg-red-50 border-t border-red-100">
                <p className="text-xs text-red-700 font-medium mb-1">処理に失敗:</p>
                <ul className="text-xs text-red-600 space-y-0.5">
                  {failedFiles.map((name, i) => (
                    <li key={i} className="truncate">・{name}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="px-6 py-4 border-t border-gray-100">
            <button
              onClick={handleCancel}
              className="w-full py-2.5 text-sm font-medium text-gray-700 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors"
            >
              続けてアップロード
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
