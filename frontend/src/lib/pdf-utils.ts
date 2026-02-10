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
 * Process image files (JPG, PNG, WebP etc.) as single-page documents
 */
export async function processImages(
  files: File[],
  onProgress?: (current: number, total: number) => void
): Promise<ProcessedPage[]> {
  const pages: ProcessedPage[] = [];

  for (let i = 0; i < files.length; i++) {
    onProgress?.(i + 1, files.length);

    const file = files[i];
    const imageDataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });

    // 画像の寸法を取得
    const { width, height } = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => reject(new Error('画像の読み込みに失敗しました'));
      img.src = imageDataUrl;
    });

    // サムネイル生成
    const thumbWidth = 150;
    const thumbScale = thumbWidth / width;
    const thumbHeight = height * thumbScale;

    const thumbCanvas = document.createElement('canvas');
    const thumbCtx = thumbCanvas.getContext('2d')!;
    thumbCanvas.width = thumbWidth;
    thumbCanvas.height = thumbHeight;

    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('サムネイル生成に失敗しました'));
      img.src = imageDataUrl;
    });

    thumbCtx.drawImage(img, 0, 0, thumbWidth, thumbHeight);
    const thumbnailDataUrl = thumbCanvas.toDataURL('image/jpeg', 0.7);

    pages.push({
      pageNumber: i + 1,
      imageDataUrl,
      thumbnailDataUrl,
      width,
      height,
    });
  }

  return pages;
}

/**
 * Process a PPTX file by converting slides to images
 * Uses @kandiforge/pptx-renderer's SlideRenderer for rendering
 */
export async function processPptx(
  file: File,
  onProgress?: (current: number, total: number) => void
): Promise<ProcessedPage[]> {
  const { parsePPTX } = await import('@kandiforge/pptx-renderer/dist/lib/parser.js');
  const { SlideRenderer } = await import('@kandiforge/pptx-renderer/dist/lib/renderer.js');

  const arrayBuffer = await file.arrayBuffer();
  const pptxData = await parsePPTX(arrayBuffer);

  if (pptxData.slides.length === 0) {
    throw new Error('PPTXファイルにスライドが見つかりませんでした');
  }

  const totalSlides = pptxData.slides.length;
  const pages: ProcessedPage[] = [];

  // スライドサイズ（parsePPTXがEMU→pt変換済み）
  const slideW = pptxData.size?.width || 960;
  const slideH = pptxData.size?.height || 540;

  // レンダリングサイズ: アスペクト比維持、長辺1920px
  const maxDim = 1920;
  const renderScale = Math.min(maxDim / slideW, maxDim / slideH);
  const renderW = Math.round(slideW * renderScale);
  const renderH = Math.round(slideH * renderScale);

  for (let i = 0; i < totalSlides; i++) {
    onProgress?.(i + 1, totalSlides);

    const canvas = document.createElement('canvas');
    const renderer = new SlideRenderer(canvas, {
      width: renderW,
      height: renderH,
      scale: 1,
      slideWidth: slideW,
      slideHeight: slideH,
    });

    await renderer.renderSlide(pptxData.slides[i], 'complete');

    const imageDataUrl = canvas.toDataURL('image/png');

    // サムネイル生成
    const thumbWidth = 150;
    const thumbScale = thumbWidth / renderW;
    const thumbHeight = Math.round(renderH * thumbScale);
    const thumbCanvas = document.createElement('canvas');
    thumbCanvas.width = thumbWidth;
    thumbCanvas.height = thumbHeight;
    const thumbCtx = thumbCanvas.getContext('2d')!;
    thumbCtx.drawImage(canvas, 0, 0, thumbWidth, thumbHeight);
    const thumbnailDataUrl = thumbCanvas.toDataURL('image/jpeg', 0.7);

    pages.push({
      pageNumber: i + 1,
      imageDataUrl,
      thumbnailDataUrl,
      width: renderW,
      height: renderH,
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
 * Enhanced with full text styling support
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
    fontWeight?: 'normal' | 'bold';
    fontStyle?: 'normal' | 'italic';
    textAlign?: 'left' | 'center' | 'right';
    textDecoration?: 'none' | 'underline';
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

      // Build font string with weight and style
      const fontSize = options.fontSize || Math.min(bbox.height * 0.8, 24);
      const fontFamily = options.fontFamily || 'Noto Sans JP, sans-serif';
      const fontWeight = options.fontWeight || 'normal';
      const fontStyle = options.fontStyle || 'normal';

      ctx.font = `${fontStyle} ${fontWeight} ${fontSize}px ${fontFamily}`;
      ctx.fillStyle = options.color || '#000000';
      ctx.textBaseline = 'middle';

      // Calculate text position based on alignment
      const textMetrics = ctx.measureText(text);
      let textX: number;
      const textAlign = options.textAlign || 'center';

      switch (textAlign) {
        case 'left':
          textX = bbox.x + 4; // Small padding
          break;
        case 'right':
          textX = bbox.x + bbox.width - textMetrics.width - 4;
          break;
        case 'center':
        default:
          textX = bbox.x + (bbox.width - textMetrics.width) / 2;
          break;
      }

      const textY = bbox.y + bbox.height / 2;

      ctx.fillText(text, textX, textY);

      // Apply underline if specified
      if (options.textDecoration === 'underline') {
        const underlineY = textY + fontSize * 0.15;
        ctx.strokeStyle = options.color || '#000000';
        ctx.lineWidth = Math.max(1, fontSize / 16);
        ctx.beginPath();
        ctx.moveTo(textX, underlineY);
        ctx.lineTo(textX + textMetrics.width, underlineY);
        ctx.stroke();
      }

      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = reject;
    img.src = imageDataUrl;
  });
}
