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
 * Uses the browser's rendering capabilities
 */
export async function processPptx(
  file: File,
  onProgress?: (current: number, total: number) => void
): Promise<ProcessedPage[]> {
  // @kandiforge/pptx-renderer のパーサーのみ使用（レンダラーはcross-fetch依存があるため自前描画）
  const { parsePPTX } = await import('@kandiforge/pptx-renderer/dist/lib/parser.js');
  
  const arrayBuffer = await file.arrayBuffer();
  const pptxData = await parsePPTX(arrayBuffer);
  
  if (pptxData.slides.length === 0) {
    throw new Error('PPTXファイルにスライドが見つかりませんでした');
  }

  const totalSlides = pptxData.slides.length;
  const pages: ProcessedPage[] = [];

  // スライドサイズ（PPTXのEMU単位からピクセルへ、デフォルト16:9）
  const slideW = pptxData.size?.width || 960;
  const slideH = pptxData.size?.height || 540;

  // レンダリング解像度
  const scale = 2;
  const canvasWidth = Math.round(slideW * scale);
  const canvasHeight = Math.round(slideH * scale);

  for (let i = 0; i < totalSlides; i++) {
    onProgress?.(i + 1, totalSlides);
    const slide = pptxData.slides[i];

    const canvas = document.createElement('canvas');
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    const ctx = canvas.getContext('2d')!;

    // 背景描画
    renderBackground(ctx, slide.background, canvasWidth, canvasHeight);

    // 全シェイプを統合して描画（master → layout → slide の順）
    const allShapes = [
      ...(slide.masterShapes || []),
      ...(slide.layoutShapes || []),
      ...(slide.slideShapes || slide.shapes || []),
    ];

    for (const shape of allShapes) {
      await renderShape(ctx, shape, scale);
    }

    const imageDataUrl = canvas.toDataURL('image/png');

    // サムネイル生成
    const thumbWidth = 150;
    const thumbScale = thumbWidth / canvasWidth;
    const thumbHeight = Math.round(canvasHeight * thumbScale);
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
      width: canvasWidth,
      height: canvasHeight,
    });
  }

  return pages;
}

// --- PPTX自前レンダリング用ヘルパー ---

function colorToCSS(color: any): string {
  if (!color) return 'transparent';
  if (typeof color === 'string') return color;
  if (color.r !== undefined) {
    const a = color.a !== undefined ? color.a : 1;
    return `rgba(${color.r}, ${color.g}, ${color.b}, ${a})`;
  }
  return 'transparent';
}

function renderBackground(ctx: CanvasRenderingContext2D, bg: any, w: number, h: number) {
  if (!bg) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    return;
  }
  if (typeof bg === 'string' || (bg && bg.r !== undefined)) {
    ctx.fillStyle = colorToCSS(bg);
    ctx.fillRect(0, 0, w, h);
    return;
  }
  // グラデーション
  if (bg.type === 'linear' && bg.stops?.length >= 2) {
    const angle = (bg.angle || 0) * Math.PI / 180;
    const grad = ctx.createLinearGradient(0, 0, w * Math.cos(angle), h * Math.sin(angle));
    for (const stop of bg.stops) {
      grad.addColorStop(stop.position, stop.color || '#ffffff');
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    return;
  }
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
}

async function renderShape(ctx: CanvasRenderingContext2D, shape: any, scale: number) {
  if (!shape) return;
  const x = (shape.position?.x || 0) * scale;
  const y = (shape.position?.y || 0) * scale;
  const w = (shape.size?.width || 0) * scale;
  const h = (shape.size?.height || 0) * scale;

  ctx.save();

  // 回転
  if (shape.rotation) {
    ctx.translate(x + w / 2, y + h / 2);
    ctx.rotate((shape.rotation * Math.PI) / 180);
    ctx.translate(-(x + w / 2), -(y + h / 2));
  }

  // グループは子要素を再帰的に描画
  if (shape.type === 'group' && shape.children) {
    for (const child of shape.children) {
      await renderShape(ctx, child, scale);
    }
    ctx.restore();
    return;
  }

  // 画像
  if (shape.type === 'image' && shape.imageUrl) {
    try {
      const img = await loadImage(shape.imageUrl);
      ctx.drawImage(img, x, y, w, h);
    } catch {
      // 画像読み込み失敗時はプレースホルダー
      ctx.fillStyle = '#f0f0f0';
      ctx.fillRect(x, y, w, h);
    }
    ctx.restore();
    return;
  }

  // 塗り
  if (shape.fill) {
    const fillColor = colorToCSS(shape.fill);
    if (fillColor !== 'transparent') {
      ctx.fillStyle = fillColor;
      if (shape.type === 'circle') {
        ctx.beginPath();
        ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillRect(x, y, w, h);
      }
    }
  }

  // 枠線
  if (shape.stroke && shape.strokeWidth) {
    ctx.strokeStyle = colorToCSS(shape.stroke);
    ctx.lineWidth = (shape.strokeWidth || 1) * scale;
    if (shape.type === 'circle') {
      ctx.beginPath();
      ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (shape.type === 'line') {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + w, y + h);
      ctx.stroke();
    } else {
      ctx.strokeRect(x, y, w, h);
    }
  }

  // テキスト描画
  if (shape.paragraphs?.length) {
    renderParagraphs(ctx, shape.paragraphs, x, y, w, h, scale, shape.textStyle);
  } else if (shape.text) {
    renderSimpleText(ctx, shape.text, x, y, w, h, scale, shape.textStyle);
  }

  // テーブル
  if (shape.type === 'table' && shape.table) {
    renderTable(ctx, shape.table, x, y, scale);
  }

  ctx.restore();
}

function renderSimpleText(
  ctx: CanvasRenderingContext2D, text: string,
  x: number, y: number, w: number, h: number,
  scale: number, style?: any
) {
  const fontSize = ((style?.fontSize || 12) * scale);
  const fontFamily = style?.fontFamily || 'sans-serif';
  const fontWeight = style?.fontWeight || 'normal';
  ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
  ctx.fillStyle = style?.color ? colorToCSS(style.color) : '#000000';
  ctx.textBaseline = 'top';

  const align = style?.align || 'left';
  ctx.textAlign = align as CanvasTextAlign;
  const textX = align === 'center' ? x + w / 2 : align === 'right' ? x + w : x + 4 * scale;

  // ワードラップ
  const lines = wrapText(ctx, text, w - 8 * scale);
  const lineHeight = fontSize * 1.3;
  const vAnchor = style?.verticalAnchor || 'top';
  let startY = y + 4 * scale;
  if (vAnchor === 'middle') startY = y + (h - lines.length * lineHeight) / 2;
  else if (vAnchor === 'bottom') startY = y + h - lines.length * lineHeight - 4 * scale;

  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], textX, startY + i * lineHeight);
  }
}

function renderParagraphs(
  ctx: CanvasRenderingContext2D, paragraphs: any[],
  x: number, y: number, w: number, h: number,
  scale: number, defaultStyle?: any
) {
  let curY = y + 4 * scale;
  const maxY = y + h;

  for (const para of paragraphs) {
    if (curY >= maxY) break;
    const align = para.align || defaultStyle?.align || 'left';

    for (const run of (para.runs || [])) {
      if (curY >= maxY) break;
      const fontSize = ((run.fontSize || defaultStyle?.fontSize || 12) * scale);
      const fontFamily = run.fontFamily || defaultStyle?.fontFamily || 'sans-serif';
      const bold = run.bold ? 'bold' : 'normal';
      const italic = run.italic ? 'italic' : '';
      ctx.font = `${italic} ${bold} ${fontSize}px ${fontFamily}`.trim();
      ctx.fillStyle = run.color ? colorToCSS(run.color) : (defaultStyle?.color ? colorToCSS(defaultStyle.color) : '#000000');
      ctx.textBaseline = 'top';
      ctx.textAlign = align as CanvasTextAlign;

      const textX = align === 'center' ? x + w / 2 : align === 'right' ? x + w : x + 4 * scale;
      const lines = wrapText(ctx, run.text || '', w - 8 * scale);
      const lineHeight = fontSize * 1.3;

      for (const line of lines) {
        if (curY >= maxY) break;
        ctx.fillText(line, textX, curY);
        curY += lineHeight;
      }
    }
    curY += 4 * scale; // paragraph spacing
  }
}

function renderTable(ctx: CanvasRenderingContext2D, table: any, offsetX: number, offsetY: number, scale: number) {
  let curY = offsetY;
  for (const row of (table.rows || [])) {
    const rowH = (row.height || 30) * scale;
    let curX = offsetX;
    for (let c = 0; c < (row.cells || []).length; c++) {
      const cell = row.cells[c];
      const colW = ((table.columnWidths?.[c] || 100) * scale);

      if (cell.fill) {
        ctx.fillStyle = colorToCSS(cell.fill);
        ctx.fillRect(curX, curY, colW, rowH);
      }
      ctx.strokeStyle = '#cccccc';
      ctx.lineWidth = 1;
      ctx.strokeRect(curX, curY, colW, rowH);

      if (cell.paragraphs?.length) {
        renderParagraphs(ctx, cell.paragraphs, curX, curY, colW, rowH, scale, cell.textStyle);
      } else if (cell.text) {
        renderSimpleText(ctx, cell.text, curX, curY, colW, rowH, scale, cell.textStyle);
      }
      curX += colW;
    }
    curY += rowH;
  }
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  if (maxWidth <= 0) return [text];
  const lines: string[] = [];
  for (const rawLine of text.split('\n')) {
    const words = rawLine.split('');
    let line = '';
    for (const ch of words) {
      const test = line + ch;
      if (ctx.measureText(test).width > maxWidth && line.length > 0) {
        lines.push(line);
        line = ch;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    if (rawLine === '') lines.push('');
  }
  return lines.length > 0 ? lines : [''];
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Image load failed'));
    img.src = src;
  });
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
