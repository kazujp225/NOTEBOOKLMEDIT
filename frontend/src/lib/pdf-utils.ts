/**
 * PDF processing utilities using PDF.js
 * Runs entirely in browser - no backend needed
 */

export interface ProcessedPage {
  pageNumber: number;
  imageDataUrl: string;
  thumbnailDataUrl: string;
  width: number;
  height: number;
}

/**
 * Load PDF and convert pages to images
 * Uses dynamic import to avoid SSR issues with PDF.js
 */
export async function processPdf(
  file: File,
  onProgress?: (current: number, total: number) => void
): Promise<ProcessedPage[]> {
  // Dynamic import of PDF.js to avoid SSR issues
  const pdfjsLib = await import('pdfjs-dist');

  // Set worker source - use unpkg as fallback
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@4.4.168/build/pdf.worker.min.mjs`;

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  const totalPages = pdf.numPages;
  const pages: ProcessedPage[] = [];

  for (let i = 1; i <= totalPages; i++) {
    onProgress?.(i, totalPages);

    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 2.0 }); // High quality

    // Create canvas for full image
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d')!;
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await page.render({
      canvasContext: context,
      viewport: viewport,
    }).promise;

    const imageDataUrl = canvas.toDataURL('image/png');

    // Create thumbnail
    const thumbScale = 150 / viewport.width;
    const thumbCanvas = document.createElement('canvas');
    const thumbContext = thumbCanvas.getContext('2d')!;
    thumbCanvas.width = 150;
    thumbCanvas.height = viewport.height * thumbScale;

    thumbContext.drawImage(canvas, 0, 0, thumbCanvas.width, thumbCanvas.height);
    const thumbnailDataUrl = thumbCanvas.toDataURL('image/jpeg', 0.7);

    pages.push({
      pageNumber: i,
      imageDataUrl,
      thumbnailDataUrl,
      width: viewport.width,
      height: viewport.height,
    });
  }

  return pages;
}

/**
 * Extract ROI from page image
 */
export function extractRoi(
  imageDataUrl: string,
  bbox: { x: number; y: number; width: number; height: number },
  margin: number = 20
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;

      // Calculate ROI with margin
      const x = Math.max(0, bbox.x - margin);
      const y = Math.max(0, bbox.y - margin);
      const width = Math.min(img.width - x, bbox.width + margin * 2);
      const height = Math.min(img.height - y, bbox.height + margin * 2);

      canvas.width = width;
      canvas.height = height;

      ctx.drawImage(img, x, y, width, height, 0, 0, width, height);

      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = reject;
    img.src = imageDataUrl;
  });
}

/**
 * Apply text overlay correction to image
 */
export function applyTextOverlay(
  imageDataUrl: string,
  bbox: { x: number; y: number; width: number; height: number },
  text: string,
  options: {
    fontSize?: number;
    fontFamily?: string;
    color?: string;
    backgroundColor?: string;
  } = {}
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;

      canvas.width = img.width;
      canvas.height = img.height;

      // Draw original image
      ctx.drawImage(img, 0, 0);

      // Fill background
      const bgColor = options.backgroundColor || '#ffffff';
      ctx.fillStyle = bgColor;
      ctx.fillRect(bbox.x, bbox.y, bbox.width, bbox.height);

      // Draw text
      const fontSize = options.fontSize || Math.min(bbox.height * 0.8, 24);
      const fontFamily = options.fontFamily || 'Noto Sans JP, sans-serif';
      ctx.font = `${fontSize}px ${fontFamily}`;
      ctx.fillStyle = options.color || '#000000';
      ctx.textBaseline = 'middle';

      // Center text in bbox
      const textMetrics = ctx.measureText(text);
      const textX = bbox.x + (bbox.width - textMetrics.width) / 2;
      const textY = bbox.y + bbox.height / 2;

      ctx.fillText(text, textX, textY);

      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = reject;
    img.src = imageDataUrl;
  });
}
