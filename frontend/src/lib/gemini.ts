/**
 * Gemini API Client
 * Calls server-side API route to keep API key secure
 * Uses credit/ticket system with atomic deduction
 * Enhanced with reference design support (like wordpressdemo)
 */

import { supabase } from './supabase';

// デザイン定義（参考画像から解析されたスタイル）
export interface DesignDefinition {
  colorPalette: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
  };
  typography: {
    style: string;
    mood: string;
  };
  layout: {
    density: string;
    style: string;
  };
  vibe: string;
  description: string;
}

export interface InpaintRequest {
  imageBase64: string;
  mask?: {
    x: number;      // 0-1 ratio
    y: number;      // 0-1 ratio
    width: number;  // 0-1 ratio
    height: number; // 0-1 ratio
  };
  masks?: Array<{
    x: number;      // 0-1 ratio
    y: number;      // 0-1 ratio
    width: number;  // 0-1 ratio
    height: number; // 0-1 ratio
  }>;
  prompt: string;
  referenceDesign?: DesignDefinition;    // 参考デザイン定義
  referenceImageBase64?: string;         // 参考デザイン画像
  outputSize?: '1K' | '2K' | '4K';       // 出力画像サイズ
}

export interface InpaintResponse {
  success: boolean;
  imageBase64?: string;
  error?: string;
  balance?: number;
}

export interface CreditsInfo {
  balance: number;
  costs: {
    image_generation: number;
    text_generation: number;
  };
  recent_transactions: Array<{
    transaction_type: string;
    amount: number;
    balance_after: number;
    description: string;
    created_at: string;
  }>;
}

/**
 * Generate a unique request ID
 */
function generateRequestId(): string {
  return crypto.randomUUID();
}

/**
 * Get auth token for API calls
 */
async function getAuthToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token || null;
}

/**
 * OCR a region of an image using Gemini Flash
 */
export async function ocrRegion(
  imageBase64: string
): Promise<{ text: string; balance?: number }> {
  const token = await getAuthToken();
  if (!token) {
    throw new Error('認証が必要です。ログインしてください。');
  }

  const response = await fetch('/api/gemini', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      action: 'ocr_region',
      request_id: generateRequestId(),
      imageBase64,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));

    if (response.status === 402) {
      throw new Error(error.error || 'クレジットが不足しています');
    }

    throw new Error(error.error || `API error: ${response.status}`);
  }

  return response.json();
}

/**
 * Generate correction candidates using Gemini
 */
export async function generateCandidates(
  imageBase64: string,
  ocrText: string,
  context?: string
): Promise<{
  candidates: Array<{ text: string; confidence: number; reason: string }>;
  balance?: number;
}> {
  const token = await getAuthToken();
  if (!token) {
    throw new Error('認証が必要です。ログインしてください。');
  }

  const response = await fetch('/api/gemini', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      action: 'generate_candidates',
      request_id: generateRequestId(),
      imageBase64,
      ocrText,
      context,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));

    if (response.status === 402) {
      throw new Error(error.error || 'クレジットが不足しています');
    }

    throw new Error(error.error || `API error: ${response.status}`);
  }

  return response.json();
}

/**
 * Inpaint image region using Gemini
 * Enhanced with reference design support
 */
export async function inpaintImage(request: InpaintRequest): Promise<InpaintResponse> {
  const token = await getAuthToken();
  if (!token) {
    return { success: false, error: '認証が必要です。ログインしてください。' };
  }

  const response = await fetch('/api/gemini', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      action: 'inpaint_image',
      request_id: generateRequestId(),
      ...request,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));

    if (response.status === 402) {
      return {
        success: false,
        error: error.error || 'クレジットが不足しています',
        balance: error.balance,
      };
    }

    return { success: false, error: error.error || `API error: ${response.status}` };
  }

  return response.json();
}

/**
 * Analyze design from reference image
 */
export async function analyzeDesign(
  imageUrl?: string,
  imageBase64?: string
): Promise<DesignDefinition> {
  const token = await getAuthToken();
  if (!token) {
    throw new Error('認証が必要です。ログインしてください。');
  }

  const response = await fetch('/api/analyze-design', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      imageUrl,
      imageBase64,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'デザイン解析に失敗しました');
  }

  return response.json();
}

/**
 * Get current credits info
 */
export async function getCreditsInfo(): Promise<CreditsInfo | null> {
  const token = await getAuthToken();
  if (!token) {
    return null;
  }

  const response = await fetch('/api/gemini', {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    return null;
  }

  return response.json();
}

// Legacy functions for backward compatibility
export function getGeminiApiKey(): string | null {
  return null;
}

export function setGeminiApiKey(_key: string): void {
  // No-op
}

export function removeGeminiApiKey(): void {
  // No-op
}

export function hasGeminiApiKey(): boolean {
  return true;
}

export async function validateApiKey(_apiKey: string): Promise<boolean> {
  return true;
}

// Alias for backward compatibility
export const getUsageInfo = getCreditsInfo;
