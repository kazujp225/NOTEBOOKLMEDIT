'use client';

import { useState, useEffect } from 'react';
import {
  FileText,
  Download,
  Loader2,
  CheckCircle2,
  XCircle,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore, type PageData, type TextOverlay } from '@/lib/store';
import { renderOverlaysOntoImage } from '@/lib/pdf-utils';

interface ExportPanelProps {
  projectId: string;
  isOpen: boolean;
  onClose: () => void;
}

type ExportStatus = 'idle' | 'loading' | 'processing' | 'completed' | 'error';

interface ExportState {
  pdf: { status: ExportStatus; url?: string; error?: string };
}

export function ExportPanel({ projectId, isOpen, onClose }: ExportPanelProps) {
  const projectMeta = useAppStore((state) =>
    state.projects.find((p) => p.id === projectId)
  );
  const loadProjectWithImages = useAppStore((state) => state.loadProjectWithImages);

  const [pages, setPages] = useState<PageData[]>([]);
  const [exports, setExports] = useState<ExportState>({
    pdf: { status: 'idle' },
  });
  const [isVisible, setIsVisible] = useState(false);

  // Handle animation
  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
    }
  }, [isOpen]);

  // Load images when panel opens
  useEffect(() => {
    async function loadImages() {
      if (!isOpen || !projectMeta) return;

      try {
        const project = await loadProjectWithImages(projectId);
        if (project) {
          setPages(project.pages);
        }
      } catch (error) {
        console.error('Failed to load project images:', error);
      }
    }

    loadImages();
  }, [isOpen, projectId, projectMeta, loadProjectWithImages]);

  const handleClose = () => {
    setIsVisible(false);
    setTimeout(onClose, 150);
  };

  const handleExportPdf = async () => {
    if (!projectMeta || pages.length === 0) return;

    setExports((prev) => ({
      ...prev,
      pdf: { status: 'processing' },
    }));

    try {
      // Dynamic import to avoid SSR issues
      const { jsPDF } = await import('jspdf');

      const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'px',
      });

      const textOverlays = projectMeta?.textOverlays || [];

      for (let i = 0; i < pages.length; i++) {
        const page = pages[i];

        if (i > 0) {
          doc.addPage();
        }

        // Render text overlays onto the page image if any exist
        const pageOverlays = textOverlays.filter((o) => o.pageNumber === page.pageNumber);
        let finalImageDataUrl = page.imageDataUrl;
        if (pageOverlays.length > 0) {
          finalImageDataUrl = await renderOverlaysOntoImage(page.imageDataUrl, pageOverlays);
        }

        // Add page image
        const imgWidth = doc.internal.pageSize.getWidth();
        const imgHeight = (page.height / page.width) * imgWidth;

        doc.addImage(
          finalImageDataUrl,
          'PNG',
          0,
          0,
          imgWidth,
          Math.min(imgHeight, doc.internal.pageSize.getHeight())
        );
      }

      const pdfBlob = doc.output('blob');
      const url = URL.createObjectURL(pdfBlob);

      setExports((prev) => ({
        ...prev,
        pdf: { status: 'completed', url },
      }));
    } catch (error) {
      console.error('PDF export error:', error);
      setExports((prev) => ({
        ...prev,
        pdf: {
          status: 'error',
          error: error instanceof Error ? error.message : 'PDF生成に失敗しました',
        },
      }));
    }
  };

  const handleDownloadPdf = () => {
    const url = exports.pdf.url;
    if (url && projectMeta) {
      const link = document.createElement('a');
      link.href = url;
      link.download = `${projectMeta.name}_corrected.pdf`;
      link.click();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className={cn(
        'fixed inset-0 z-50 flex items-center justify-center transition-all duration-150',
        isVisible ? 'bg-black/50 backdrop-blur-sm' : 'bg-transparent'
      )}
      onClick={handleClose}
    >
      <div
        className={cn(
          'bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden transition-all duration-150',
          isVisible ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">出力</h2>
            <p className="text-sm text-gray-500 mt-1">
              修正済みファイルをダウンロード
            </p>
          </div>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="閉じる"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Export options */}
        <div className="p-6 space-y-4">
          {/* PDF Export */}
          <ExportOption
            icon={FileText}
            title="PDF"
            description="修正済みPDFファイル"
            status={exports.pdf.status}
            error={exports.pdf.error}
            onExport={handleExportPdf}
            onDownload={handleDownloadPdf}
            disabled={pages.length === 0}
          />
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-100 bg-gray-50">
          <button
            onClick={handleClose}
            className="btn-secondary w-full justify-center"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}

interface ExportOptionProps {
  icon: React.ElementType;
  title: string;
  description: string;
  status: ExportStatus;
  error?: string;
  onExport: () => void;
  onDownload: () => void;
  disabled?: boolean;
}

function ExportOption({
  icon: Icon,
  title,
  description,
  status,
  error,
  onExport,
  onDownload,
  disabled,
}: ExportOptionProps) {
  return (
    <div
      className={cn(
        'card p-4 flex items-center gap-4 transition-all',
        status === 'completed' && 'ring-2 ring-green-200 bg-green-50/50',
        status === 'error' && 'ring-2 ring-red-200 bg-red-50/50'
      )}
    >
      <div
        className={cn(
          'w-12 h-12 rounded-xl flex items-center justify-center',
          status === 'completed'
            ? 'bg-green-100'
            : status === 'error'
            ? 'bg-red-100'
            : 'bg-blue-100'
        )}
      >
        {status === 'processing' || status === 'loading' ? (
          <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
        ) : status === 'completed' ? (
          <CheckCircle2 className="w-6 h-6 text-green-600" />
        ) : status === 'error' ? (
          <XCircle className="w-6 h-6 text-red-600" />
        ) : (
          <Icon className="w-6 h-6 text-blue-600" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <h3 className="font-semibold text-gray-900">{title}</h3>
        <p className="text-sm text-gray-500 truncate">
          {status === 'error' ? error : description}
        </p>
      </div>

      {status === 'completed' ? (
        <button
          onClick={onDownload}
          className="btn-primary btn-sm"
        >
          <Download className="w-4 h-4" />
          DL
        </button>
      ) : (
        <button
          onClick={onExport}
          disabled={status === 'processing' || status === 'loading' || disabled}
          className={cn(
            'btn-sm',
            status === 'error' ? 'btn-danger' : 'btn-primary'
          )}
        >
          {status === 'processing' || status === 'loading' ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : status === 'error' ? (
            '再試行'
          ) : (
            '生成'
          )}
        </button>
      )}
    </div>
  );
}
