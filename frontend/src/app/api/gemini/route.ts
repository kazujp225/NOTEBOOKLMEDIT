/**
 * Gemini API Proxy Route
 * - Keeps API key secure on server side
 * - Uses credit/ticket system with atomic deduction
 * - Handles refunds on failure
 * - Prevents duplicate requests via request_id
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const GEMINI_IMAGE_MODEL = 'gemini-3-pro-image-preview';
const GEMINI_TEXT_MODEL = 'gemini-2.0-flash';

// Credit costs
const COSTS = {
  image_generation: 10,  // 画像生成: 10クレジット
  text_generation: 1,    // テキスト生成: 1クレジット
};

// Initialize Supabase client with service role for server-side operations
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://bvwsxraghycywnenkzsb.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Get Gemini API key from environment
function getApiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error('GEMINI_API_KEY environment variable not set');
  }
  return key;
}

// Verify user authentication
async function verifyAuth(request: NextRequest): Promise<string | null> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.substring(7);
  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    return null;
  }

  return user.id;
}

// Deduct credits atomically
async function deductCredits(
  userId: string,
  requestId: string,
  amount: number,
  description: string
): Promise<{ success: boolean; error?: string; balance?: number }> {
  const { data, error } = await supabase.rpc('deduct_credits', {
    p_user_id: userId,
    p_request_id: requestId,
    p_amount: amount,
    p_description: description,
  });

  if (error) {
    console.error('Deduct credits error:', error);
    return { success: false, error: error.message };
  }

  if (!data.success) {
    return { success: false, error: data.error, balance: data.current_balance };
  }

  return { success: true, balance: data.balance_after };
}

// Refund credits
async function refundCredits(
  userId: string,
  requestId: string,
  amount: number,
  description: string
): Promise<void> {
  const { error } = await supabase.rpc('refund_credits', {
    p_user_id: userId,
    p_request_id: requestId,
    p_amount: amount,
    p_description: description,
  });

  if (error) {
    console.error('Refund credits error:', error);
  }
}

// Record generation request
async function recordRequest(
  requestId: string,
  userId: string,
  requestType: 'image_generation' | 'text_generation',
  cost: number,
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'refunded',
  errorMessage?: string
): Promise<void> {
  // Check if request already exists
  const { data: existing } = await supabase
    .from('generation_requests')
    .select('id, status')
    .eq('request_id', requestId)
    .single();

  if (existing) {
    // Update existing request
    await supabase
      .from('generation_requests')
      .update({
        status,
        error_message: errorMessage,
        completed_at: status === 'completed' || status === 'failed' ? new Date().toISOString() : null,
      })
      .eq('request_id', requestId);
  } else {
    // Insert new request
    await supabase.from('generation_requests').insert({
      request_id: requestId,
      user_id: userId,
      request_type: requestType,
      cost,
      status,
      error_message: errorMessage,
    });
  }
}

// Check for existing completed request (idempotency)
async function getExistingResult(requestId: string): Promise<{
  exists: boolean;
  status?: string;
  result?: unknown;
}> {
  const { data } = await supabase
    .from('generation_requests')
    .select('status, metadata')
    .eq('request_id', requestId)
    .single();

  if (data) {
    return {
      exists: true,
      status: data.status,
      result: data.metadata?.result,
    };
  }

  return { exists: false };
}

export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    const userId = await verifyAuth(request);
    if (!userId) {
      return NextResponse.json(
        { error: '認証が必要です' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { action, request_id, ...params } = body;

    // request_id is required for idempotency
    if (!request_id) {
      return NextResponse.json(
        { error: 'request_id is required' },
        { status: 400 }
      );
    }

    // Check for existing request (idempotency)
    const existing = await getExistingResult(request_id);
    if (existing.exists) {
      if (existing.status === 'completed' && existing.result) {
        return NextResponse.json(existing.result);
      }
      if (existing.status === 'processing') {
        return NextResponse.json(
          { error: 'Request is already being processed' },
          { status: 409 }
        );
      }
    }

    if (action === 'generate_candidates') {
      const cost = COSTS.text_generation;

      // Deduct credits first
      const deductResult = await deductCredits(
        userId,
        request_id,
        cost,
        'テキスト候補生成'
      );

      if (!deductResult.success) {
        if (deductResult.error === 'duplicate_request') {
          return NextResponse.json(
            { error: 'このリクエストは既に処理されています' },
            { status: 409 }
          );
        }
        if (deductResult.error === 'insufficient_credits') {
          return NextResponse.json(
            { error: `クレジットが不足しています（残高: ${deductResult.balance}、必要: ${cost}）` },
            { status: 402 }
          );
        }
        return NextResponse.json(
          { error: deductResult.error || 'クレジット処理に失敗しました' },
          { status: 500 }
        );
      }

      // Record request as processing
      await recordRequest(request_id, userId, 'text_generation', cost, 'processing');

      try {
        const result = await generateCandidates(params);

        // Record success
        await recordRequest(request_id, userId, 'text_generation', cost, 'completed');

        // Save result for idempotency
        await supabase
          .from('generation_requests')
          .update({ metadata: { result } })
          .eq('request_id', request_id);

        return NextResponse.json({ ...result, balance: deductResult.balance });
      } catch (error) {
        // Refund on failure
        await refundCredits(userId, request_id, cost, 'テキスト生成失敗による返金');
        await recordRequest(
          request_id,
          userId,
          'text_generation',
          cost,
          'refunded',
          error instanceof Error ? error.message : 'Unknown error'
        );

        throw error;
      }
    }

    if (action === 'inpaint_image') {
      const cost = COSTS.image_generation;

      // Deduct credits first
      const deductResult = await deductCredits(
        userId,
        request_id,
        cost,
        '画像生成'
      );

      if (!deductResult.success) {
        if (deductResult.error === 'duplicate_request') {
          return NextResponse.json(
            { error: 'このリクエストは既に処理されています' },
            { status: 409 }
          );
        }
        if (deductResult.error === 'insufficient_credits') {
          return NextResponse.json(
            {
              error: `クレジットが不足しています（残高: ${deductResult.balance}、必要: ${cost}）`,
              balance: deductResult.balance,
              required: cost,
            },
            { status: 402 }
          );
        }
        return NextResponse.json(
          { error: deductResult.error || 'クレジット処理に失敗しました' },
          { status: 500 }
        );
      }

      // Record request as processing
      await recordRequest(request_id, userId, 'image_generation', cost, 'processing');

      try {
        const result = await inpaintImage(params);

        if (result.success) {
          // Record success
          await recordRequest(request_id, userId, 'image_generation', cost, 'completed');

          return NextResponse.json({ ...result, balance: deductResult.balance });
        } else {
          // Refund on failure
          await refundCredits(userId, request_id, cost, '画像生成失敗による返金');
          await recordRequest(
            request_id,
            userId,
            'image_generation',
            cost,
            'refunded',
            result.error
          );

          // Return balance after refund
          const { data: credits } = await supabase
            .from('user_credits')
            .select('balance')
            .eq('user_id', userId)
            .single();

          return NextResponse.json({
            ...result,
            balance: credits?.balance,
            refunded: true,
          });
        }
      } catch (error) {
        // Refund on exception
        await refundCredits(userId, request_id, cost, '画像生成エラーによる返金');
        await recordRequest(
          request_id,
          userId,
          'image_generation',
          cost,
          'refunded',
          error instanceof Error ? error.message : 'Unknown error'
        );

        throw error;
      }
    }

    return NextResponse.json(
      { error: 'Invalid action' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Gemini API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

// Get credits info
export async function GET(request: NextRequest) {
  try {
    const userId = await verifyAuth(request);
    if (!userId) {
      return NextResponse.json(
        { error: '認証が必要です' },
        { status: 401 }
      );
    }

    // Get user credits using the function
    const { data, error } = await supabase.rpc('get_user_credits', {
      p_user_id: userId,
    });

    if (error) {
      console.error('Get credits error:', error);
      return NextResponse.json(
        { error: 'クレジット情報の取得に失敗しました' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      balance: data.balance,
      costs: COSTS,
      recent_transactions: data.recent_transactions || [],
    });
  } catch (error) {
    console.error('Credits API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Generate text candidates
async function generateCandidates(params: {
  imageBase64: string;
  ocrText: string;
  context?: string;
}): Promise<{ candidates: Array<{ text: string; confidence: number; reason: string }> }> {
  const apiKey = getApiKey();

  const prompt = `
あなたはOCR校正のエキスパートです。以下のOCR結果を分析し、正しいテキストの候補を3つ提案してください。

OCR結果: "${params.ocrText}"
${params.context ? `コンテキスト: ${params.context}` : ''}

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
    `${GEMINI_API_BASE}/models/${GEMINI_TEXT_MODEL}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                inlineData: {
                  mimeType: 'image/png',
                  data: params.imageBase64.replace(/^data:image\/\w+;base64,/, ''),
                },
              },
              { text: prompt },
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
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (e) {
    console.error('Failed to parse Gemini response:', e);
  }

  return {
    candidates: [{ text: params.ocrText, confidence: 0.5, reason: 'OCR原文' }],
  };
}

// Inpaint image
async function inpaintImage(params: {
  imageBase64: string;
  masks: Array<{ x: number; y: number; width: number; height: number }>;
  prompt: string;
  referenceDesign?: string;
}): Promise<{ success: boolean; imageBase64?: string; error?: string }> {
  const apiKey = getApiKey();

  const maskDescriptions = params.masks.map((mask, i) => {
    const centerX = Math.round((mask.x + mask.width / 2) * 100);
    const centerY = Math.round((mask.y + mask.height / 2) * 100);
    return `領域${i + 1}: 中心位置(横${centerX}%, 縦${centerY}%), サイズ(幅${Math.round(mask.width * 100)}%, 高さ${Math.round(mask.height * 100)}%)`;
  }).join('\n');

  const prompt = `
画像の以下の領域を修正してください:
${maskDescriptions}

修正内容: ${params.prompt}
${params.referenceDesign ? `参考デザイン: ${params.referenceDesign}` : ''}

重要な指示:
- 指定された領域のみを修正し、他の部分は絶対に変更しないでください
- 周囲のデザイン・色調・スタイルと完全に調和させてください
- 日本語テキストの場合は読みやすく美しいフォントを使用してください
- 元の画像の解像度と品質を維持してください
- 背景色や周囲の要素との境界が自然になるようにしてください
`;

  // Retry logic
  let lastError: Error | null = null;
  for (let i = 0; i < 3; i++) {
    try {
      const response = await fetch(
        `${GEMINI_API_BASE}/models/${GEMINI_IMAGE_MODEL}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    inlineData: {
                      mimeType: 'image/png',
                      data: params.imageBase64.replace(/^data:image\/\w+;base64,/, ''),
                    },
                  },
                  { text: prompt },
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
      const parts = data.candidates?.[0]?.content?.parts || [];

      for (const part of parts) {
        if (part.inlineData?.mimeType?.startsWith('image/')) {
          return {
            success: true,
            imageBase64: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`,
          };
        }
      }

      return { success: false, error: 'No image generated in response' };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const errorMessage = lastError.message.toLowerCase();

      if (errorMessage.includes('503') || errorMessage.includes('429') || errorMessage.includes('overloaded')) {
        const delay = 2000 * Math.pow(2, i);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      throw lastError;
    }
  }

  return { success: false, error: lastError?.message || 'Unknown error' };
}
