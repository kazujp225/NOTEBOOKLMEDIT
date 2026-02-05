/**
 * Gemini API Client
 * Calls server-side API route to keep API key secure
 * Uses credit/ticket system with atomic deduction
 */

import { supabase } from './supabase';

export interface InpaintRequest {
  imageBase64: string;
  masks: Array<{
    x: number;      // 0-1 ratio
    y: number;      // 0-1 ratio
    width: number;  // 0-1 ratio
    height: number; // 0-1 ratio
  }>;
  prompt: string;
  referenceDesign?: string;
}

export interface InpaintResponse {
  success: boolean;
  imageBase64?: string;
  error?: string;
  balance?: number;
  refunded?: boolean;
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
