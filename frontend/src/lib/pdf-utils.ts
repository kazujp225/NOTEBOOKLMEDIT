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
  // PPTXはZIPファイルなので、JSZipで展開してスライド画像を抽出
  const JSZip = (await import('jszip')).default;
  const arrayBuffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);

  // スライド画像を探す（ppt/media/ 内の画像ファイル）
  // まずスライドのリレーションからスライド数を特定
  const slideFiles: string[] = [];
  zip.forEach((relativePath) => {
    if (relativePath.match(/^ppt\/slides\/slide\d+\.xml$/)) {
      slideFiles.push(relativePath);
    }
  });

  // スライド番号順にソート
  slideFiles.sort((a, b) => {
    const numA = parseInt(a.match(/slide(\d+)/)?.[1] || '0');
    const numB = parseInt(b.match(/slide(\d+)/)?.[1] || '0');
    return numA - numB;
  });

  if (slideFiles.length === 0) {
    throw new Error('PPTXファイルにスライドが見つかりませんでした');
  }

  const totalSlides = slideFiles.length;
  const pages: ProcessedPage[] = [];

  // スライドごとに関連画像を取得
  for (let i = 0; i < totalSlides; i++) {
    onProgress?.(i + 1, totalSlides);

    const slideNum = i + 1;
    const relPath = `ppt/slides/_rels/slide${slideNum}.xml.rels`;
    const relFile = zip.file(relPath);

    let slideImageDataUrl: string | null = null;

    if (relFile) {
      const relXml = await relFile.async('string');

      // リレーションから画像ファイルパスを抽出
      const imageMatches = relXml.match(/Target="([^"]*\.(png|jpg|jpeg|gif|bmp|emf|wmf))"/gi);
      if (imageMatches) {
        for (const match of imageMatches) {
          const targetMatch = match.match(/Target="([^"]*)"/);
          if (!targetMatch) continue;

          let imagePath = targetMatch[1];
          // 相対パスを解決
          if (imagePath.startsWith('../')) {
            imagePath = 'ppt/' + imagePath.replace('../', '');
          } else if (!imagePath.startsWith('ppt/')) {
            imagePath = 'ppt/slides/' + imagePath;
          }

          const imageFile = zip.file(imagePath);
          if (imageFile) {
            const blob = await imageFile.async('blob');
            const mimeType = imagePath.match(/\.png$/i) ? 'image/png' :
                             imagePath.match(/\.(jpg|jpeg)$/i) ? 'image/jpeg' :
                             'image/png';
            const blobWithType = new Blob([blob], { type: mimeType });
            slideImageDataUrl = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result as string);
              reader.onerror = () => reject(reader.error);
              reader.readAsDataURL(blobWithType);
            });
            break; // 最初の画像を使用
          }
        }
      }
    }

    // 画像が見つからない場合はプレースホルダーを作成
    if (!slideImageDataUrl) {
      const canvas = document.createElement('canvas');
      canvas.width = 1920;
      canvas.height = 1080;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 1920, 1080);
      ctx.fillStyle = '#999999';
      ctx.font = '32px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`スライド ${slideNum}`, 960, 540);
      slideImageDataUrl = canvas.toDataURL('image/png');
    }

    // 画像の寸法を取得
    const { width, height } = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => reject(new Error('スライド画像の読み込みに失敗しました'));
      img.src = slideImageDataUrl!;
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
      img.onerror = () => reject();
      img.src = slideImageDataUrl!;
    });
    thumbCtx.drawImage(img, 0, 0, thumbWidth, thumbHeight);
    const thumbnailDataUrl = thumbCanvas.toDataURL('image/jpeg', 0.7);

    pages.push({
      pageNumber: slideNum,
      imageDataUrl: slideImageDataUrl,
      thumbnailDataUrl,
      width,
      height,
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
