/**
 * Gemini API Client for image generation/inpainting
 * Users provide their own API keys
 */

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

export interface InpaintRequest {
  imageBase64: string;
  masks: Array<{
    x: number;      // 0-1 ratio
    y: number;      // 0-1 ratio
    width: number;  // 0-1 ratio
    height: number; // 0-1 ratio
  }>;
  prompt: string;
  referenceDesign?: string; // Optional design context
}

export interface InpaintResponse {
  success: boolean;
  imageBase64?: string;
  error?: string;
}

/**
 * Get Gemini API key from localStorage
 */
export function getGeminiApiKey(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('gemini_api_key');
}

/**
 * Set Gemini API key to localStorage
 */
export function setGeminiApiKey(key: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem('gemini_api_key', key);
}

/**
 * Remove Gemini API key from localStorage
 */
export function removeGeminiApiKey(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('gemini_api_key');
}

/**
 * Check if Gemini API key is set
 */
export function hasGeminiApiKey(): boolean {
  return !!getGeminiApiKey();
}

/**
 * Generate correction candidates using Gemini
 */
export async function generateCandidates(
  imageBase64: string,
  ocrText: string,
  context?: string
): Promise<{ candidates: Array<{ text: string; confidence: number; reason: string }> }> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error('Gemini API key not set. Please configure your API key in settings.');
  }

  const prompt = `
あなたはOCR校正のエキスパートです。以下のOCR結果を分析し、正しいテキストの候補を3つ提案してください。

OCR結果: "${ocrText}"
${context ? `コンテキスト: ${context}` : ''}

以下のJSON形式で回答してください:
{
  "candidates": [
    {"text": "修正候補1", "confidence": 0.95, "reason": "理由"},
    {"text": "修正候補2", "confidence": 0.80, "reason": "理由"},
    {"text": "修正候補3", "confidence": 0.60, "reason": "理由"}
  ]
}
`;

  const response = await fetch(
    `${GEMINI_API_BASE}/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                inlineData: {
                  mimeType: 'image/png',
                  data: imageBase64.replace(/^data:image\/\w+;base64,/, ''),
                },
              },
              {
                text: prompt,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 1024,
        },
      }),
    }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message || `Gemini API error: ${response.status}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

  try {
    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (e) {
    console.error('Failed to parse Gemini response:', e);
  }

  // Fallback
  return {
    candidates: [
      { text: ocrText, confidence: 0.5, reason: 'OCR原文' },
    ],
  };
}

/**
 * Inpaint image region using Gemini 2.0 Flash (image generation)
 * Note: Gemini 2.0 Flash supports image generation with responseModalities
 */
export async function inpaintImage(request: InpaintRequest): Promise<InpaintResponse> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error('Gemini API key not set. Please configure your API key in settings.');
  }

  // Build mask description for prompt
  const maskDescriptions = request.masks.map((mask, i) => {
    const centerX = Math.round((mask.x + mask.width / 2) * 100);
    const centerY = Math.round((mask.y + mask.height / 2) * 100);
    return `領域${i + 1}: 中心(${centerX}%, ${centerY}%), サイズ(${Math.round(mask.width * 100)}% x ${Math.round(mask.height * 100)}%)`;
  }).join('\n');

  const prompt = `
画像の以下の領域を修正してください:
${maskDescriptions}

修正内容: ${request.prompt}
${request.referenceDesign ? `参考デザイン: ${request.referenceDesign}` : ''}

重要:
- 指定された領域のみを修正し、他の部分は変更しないでください
- 周囲のデザインと調和するようにしてください
- 日本語テキストの場合は読みやすいフォントを使用してください
`;

  try {
    const response = await fetch(
      `${GEMINI_API_BASE}/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  inlineData: {
                    mimeType: 'image/png',
                    data: request.imageBase64.replace(/^data:image\/\w+;base64,/, ''),
                  },
                },
                {
                  text: prompt,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.6,
            responseModalities: ['IMAGE', 'TEXT'],
          },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error?.message || `Gemini API error: ${response.status}`);
    }

    const data = await response.json();

    // Extract generated image
    const parts = data.candidates?.[0]?.content?.parts || [];
    for (const part of parts) {
      if (part.inlineData?.mimeType?.startsWith('image/')) {
        return {
          success: true,
          imageBase64: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`,
        };
      }
    }

    return {
      success: false,
      error: 'No image generated in response',
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Validate API key by making a simple request
 */
export async function validateApiKey(apiKey: string): Promise<boolean> {
  try {
    const response = await fetch(
      `${GEMINI_API_BASE}/models?key=${apiKey}`,
      { method: 'GET' }
    );
    return response.ok;
  } catch {
    return false;
  }
}
