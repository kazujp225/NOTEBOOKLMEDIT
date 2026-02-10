/**
 * Gemini API Proxy Route
 * - Keeps API key secure on server side
 * - Uses credit/ticket system with atomic deduction
 * - Handles refunds on failure
 * - Prevents duplicate requests via request_id
 * - Supports reference design for style matching (like wordpressdemo)
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

// 出力画像サイズの型定義
const VALID_IMAGE_SIZES = ['1K', '2K', '4K'] as const;
type GeminiImageSize = typeof VALID_IMAGE_SIZES[number];

// 安全なサイズ変換関数
function toValidImageSize(size: string | undefined | null): GeminiImageSize {
  if (!size) return '4K'; // デフォルトは4K（高画質）

  const upperSize = size.toUpperCase();

  if (VALID_IMAGE_SIZES.includes(upperSize as GeminiImageSize)) {
    return upperSize as GeminiImageSize;
  }

  if (upperSize === 'ORIGINAL') {
    return '4K';
  }

  console.warn(`[INPAINT] Invalid outputSize "${size}", falling back to 4K`);
  return '4K';
}

// デザイン定義（参考画像から解析されたスタイル）
interface DesignDefinition {
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

interface MaskArea {
  x: number;      // 選択範囲の左上X（0-1の比率）
  y: number;      // 選択範囲の左上Y（0-1の比率）
  width: number;  // 選択範囲の幅（0-1の比率）
  height: number; // 選択範囲の高さ（0-1の比率）
}

// Initialize Supabase client with service role for server-side operations
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://REMOVED_PROJECT_REF.supabase.co';
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

    if (action === 'ocr_region') {
      const cost = COSTS.text_generation;

      // Deduct credits first
      const deductResult = await deductCredits(
        userId,
        request_id,
        cost,
        'OCRテキスト読み取り'
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

      await recordRequest(request_id, userId, 'text_generation', cost, 'processing');

      try {
        const result = await ocrRegion(params);

        await recordRequest(request_id, userId, 'text_generation', cost, 'completed');
        await supabase
          .from('generation_requests')
          .update({ metadata: { result } })
          .eq('request_id', request_id);

        return NextResponse.json({ ...result, balance: deductResult.balance });
      } catch (error) {
        await refundCredits(userId, request_id, cost, 'OCR失敗による返金');
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

// Inpaint image - Enhanced version matching wordpressdemo
async function inpaintImage(params: {
  imageBase64: string;
  mask?: MaskArea;        // 単一選択（後方互換性）
  masks?: MaskArea[];     // 複数選択
  prompt: string;
  referenceDesign?: DesignDefinition;    // 参考デザイン定義
  referenceImageBase64?: string;         // 参考デザイン画像
  outputSize?: string;                   // 出力サイズ 1K, 2K, 4K
}): Promise<{ success: boolean; imageBase64?: string; error?: string }> {
  const apiKey = getApiKey();

  // 複数選択か単一選択か判定
  const allMasks: MaskArea[] = params.masks && params.masks.length > 0
    ? params.masks
    : (params.mask ? [params.mask] : []);

  // 出力サイズを安全に変換
  const validImageSize = toValidImageSize(params.outputSize);
  console.log(`[INPAINT] Output size: requested="${params.outputSize}", using="${validImageSize}"`);

  // 位置説明を生成
  const getPositionDesc = (m: MaskArea) => {
    const xPercent = Math.round(m.x * 100);
    const yPercent = Math.round(m.y * 100);
    let pos = '';
    if (yPercent < 33) pos = '上部';
    else if (yPercent < 66) pos = '中央';
    else pos = '下部';
    if (xPercent < 33) pos += '左側';
    else if (xPercent < 66) pos += '中央';
    else pos += '右側';
    return pos;
  };

  const areasDescription = allMasks.map((m, i) => {
    const xPercent = Math.round(m.x * 100);
    const yPercent = Math.round(m.y * 100);
    const widthPercent = Math.round(m.width * 100);
    const heightPercent = Math.round(m.height * 100);
    return `領域${i + 1}: ${getPositionDesc(m)}（左から${xPercent}%、上から${yPercent}%、幅${widthPercent}%、高さ${heightPercent}%）`;
  }).join('\n');

  // 参考デザインスタイルの説明を生成
  let designStyleSection = '';
  if (params.referenceDesign || params.referenceImageBase64) {
    if (params.referenceImageBase64) {
      designStyleSection = `
【参考デザイン画像について】
2枚目の画像は「参考デザイン」です。この画像のデザインスタイル（色使い、雰囲気、トーン、質感）を参考にして、1枚目の画像を編集してください。
`;
    }
    if (params.referenceDesign) {
      const { colorPalette, typography, layout, vibe, description } = params.referenceDesign;
      designStyleSection += `
【参考デザインスタイル解析結果】
- カラーパレット:
  - プライマリ: ${colorPalette.primary}
  - セカンダリ: ${colorPalette.secondary}
  - アクセント: ${colorPalette.accent}
  - 背景: ${colorPalette.background}
- タイポグラフィ: ${typography.style}（${typography.mood}）
- レイアウト: ${layout.style}（密度: ${layout.density}）
- 雰囲気: ${vibe}
- スタイル説明: ${description}

編集後の画像は上記のデザインスタイル（色味、雰囲気、トーン）に合わせてください。
`;
    }
  }

  // テキスト追加系の指示かどうかを判定
  const isTextAddition = /(?:入れ|追加|書い|変更|テキスト|文字|タイトル|見出し)/i.test(params.prompt);

  // インペインティング用プロンプト - 日本語LP最適化版
  const inpaintPrompt = `あなたは日本語デザイン専門の画像編集エキスパートです。提供された画像を編集して、新しい画像を生成してください。

【修正指示】
${params.prompt}

【対象エリア】
${areasDescription}
${designStyleSection}
【重要なルール】
1. 指定されたエリア内の要素のみを修正してください
2. 文字・テキストの変更が指示されている場合は、一文字ずつ正確にその文字列に置き換えてください
3. ${(params.referenceDesign || params.referenceImageBase64) ? '参考デザインスタイルの色味、雰囲気、トーンを反映してください' : '元の画像のスタイル、フォント、色使いをできる限り維持してください'}
4. 修正箇所以外は変更しないでください
5. 画像全体を出力してください（説明文は不要です）
${isTextAddition ? `
【🇯🇵 日本語テキスト追加時の厳守事項】
- 絶対に白い背景や白い余白を追加しないでください
- テキストは選択エリアの既存の背景色・画像の上に直接描画してください
- ひらがな、カタカナ、漢字は一文字ずつ正確に描画（類似文字への置換禁止）
- ゴシック体（サンセリフ）で太めの線、文字間は均等配置
- 背景に対して十分なコントラストを確保（背景が明るい場合は暗い文字、逆も同様）
- 文字のエッジは鮮明に、アンチエイリアスは最小限

【⚠️ 文字サイズ重要ルール - TEXT SIZE RULE】
- 元のテキストより10-20%大きめに生成すること（小さい文字は崩れやすい）
- 最小フォントサイズ: 各文字は20ピクセル以上の高さを確保
- 小さいエリアの場合: テキストを少し大きく・太くして読みやすさを確保
` : ''}

Generate the complete edited image with pixel-perfect quality now.`;

  // リクエストのpartsを構築
  const requestParts: any[] = [
    {
      inlineData: {
        mimeType: 'image/png',
        data: params.imageBase64.replace(/^data:image\/\w+;base64,/, '')
      }
    }
  ];

  // 参考デザイン画像がある場合は追加
  if (params.referenceImageBase64) {
    const refBase64 = params.referenceImageBase64.replace(/^data:image\/\w+;base64,/, '');
    const refMimeMatch = params.referenceImageBase64.match(/^data:(image\/\w+);base64,/);
    const refMimeType = refMimeMatch ? refMimeMatch[1] : 'image/png';

    requestParts.push({
      inlineData: {
        mimeType: refMimeType,
        data: refBase64
      }
    });
  }

  // プロンプトを追加
  requestParts.push({ text: inpaintPrompt });

  // Retry logic
  let lastError: Error | null = null;
  for (let i = 0; i < 3; i++) {
    try {
      console.log(`[INPAINT] Attempt ${i + 1}/3...`);
      const response = await fetch(
        `${GEMINI_API_BASE}/models/${GEMINI_IMAGE_MODEL}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: requestParts
            }],
            generationConfig: {
              responseModalities: ['IMAGE', 'TEXT'],
              temperature: 0.6,
              imageConfig: {
                imageSize: validImageSize
              }
            },
            toolConfig: {
              functionCallingConfig: {
                mode: 'NONE'
              }
            }
          }),
        }
      );

      if (response.ok) {
        console.log(`[INPAINT] Success on attempt ${i + 1}`);
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
      }

      // 503/429エラーの場合はリトライ
      if (response.status === 503 || response.status === 429) {
        const errorText = await response.text();
        console.error(`[INPAINT] Attempt ${i + 1} failed with ${response.status}:`, errorText);
        lastError = new Error(`インペインティングに失敗しました: ${response.status}`);

        if (i < 2) {
          const waitTime = Math.pow(2, i + 1) * 1000;
          console.log(`[INPAINT] Retrying in ${waitTime}ms...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue;
        }
      } else {
        const errorText = await response.text();
        console.error('Gemini API error:', errorText);
        throw new Error(`インペインティングに失敗しました: ${response.status}`);
      }
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

// OCR region using Gemini Flash
async function ocrRegion(params: {
  imageBase64: string;
}): Promise<{ text: string }> {
  const apiKey = getApiKey();

  const prompt = `この画像に含まれるテキストを正確に読み取ってください。

【ルール】
- 画像内に見えるテキストだけをそのまま出力してください
- 文字化け（�, □など）がある場合もそのまま出力してください
- 改行はそのまま維持してください
- テキスト以外の説明は一切不要です
- テキストが見つからない場合は空文字を返してください`;

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
          temperature: 0.1,
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

  return { text: text.trim() };
}

