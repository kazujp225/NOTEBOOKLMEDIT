/**
 * Design Analysis API
 * Analyzes reference images to extract design definitions (colors, typography, etc.)
 * Based on wordpressdemo implementation
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Lazy-initialize Supabase client (avoid build-time error when env vars are missing)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _supabase: any = null;
function getSupabase() {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    if (!url || !key) throw new Error('Supabase環境変数が設定されていません');
    _supabase = createClient(url, key);
  }
  return _supabase;
}

// Type definitions for the design structure
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
  const { data: { user }, error } = await getSupabase().auth.getUser(token);

  if (error || !user) {
    return null;
  }

  return user.id;
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

    const { imageUrl, imageBase64 } = await request.json();

    if (!imageUrl && !imageBase64) {
      return NextResponse.json(
        { error: '画像を指定してください' },
        { status: 400 }
      );
    }

    const apiKey = getApiKey();

    // Handle image data - either base64 data URL or regular URL
    let base64Content: string;
    let mimeType = 'image/png';

    if (imageBase64) {
      // Already provided as base64
      base64Content = imageBase64.replace(/^data:image\/\w+;base64,/, '');
      const mimeMatch = imageBase64.match(/^data:(image\/\w+);base64,/);
      if (mimeMatch) {
        mimeType = mimeMatch[1];
      }
    } else if (imageUrl.startsWith('data:')) {
      // Base64 data URL
      const matches = imageUrl.match(/^data:(image\/[^;]+);base64,(.+)$/);
      if (!matches) {
        throw new Error('Invalid base64 data URL format');
      }
      mimeType = matches[1];
      base64Content = matches[2];
    } else {
      // Regular URL - fetch the image
      const imgRes = await fetch(imageUrl);
      if (!imgRes.ok) {
        throw new Error(`Failed to fetch image: ${imgRes.statusText}`);
      }
      const buffer = await imgRes.arrayBuffer();
      base64Content = Buffer.from(buffer).toString('base64');
      mimeType = imgRes.headers.get('content-type') || 'image/png';
    }

    const prompt = `
You are an expert Creative Director and UI/UX Designer.
Analyze the provided image (which is a reference design) and extract its "Design Definition".

Focus on capturing the "Soul" and "Vibe" of the design so it can be replicated.

Return ONLY a JSON object with this structure:
{
    "colorPalette": {
        "primary": "dominant color code or name",
        "secondary": "secondary color",
        "accent": "highlight/action color",
        "background": "main background color"
    },
    "typography": {
        "style": "e.g., Sans-Serif / Serif / Monospace / Handwritten",
        "mood": "e.g., Modern / Classic / Bold / Elegant / Playful"
    },
    "layout": {
        "density": "e.g., High (cluttered) / Medium / Low (spacious)",
        "style": "e.g., Grid / Hero-focused / Minimal / Broken Grid / Card-based"
    },
    "vibe": "3-5 keywords describing the aesthetic (e.g., Luxury, Dark Mode, Corporate, Pop)",
    "description": "A concise 2-sentence summary of the design language for a developer."
}
`;

    // Call Gemini API
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: prompt },
              {
                inlineData: {
                  mimeType: mimeType,
                  data: base64Content
                }
              }
            ]
          }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 1024,
          }
        })
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `Gemini API error: ${response.status}`);
    }

    const data = await response.json();
    const resText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // Extract JSON
    const jsonMatch = resText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("Raw AI Response:", resText);
      throw new Error('Failed to parse AI response as JSON');
    }

    const designDefinition: DesignDefinition = JSON.parse(jsonMatch[0]);

    return NextResponse.json(designDefinition);

  } catch (error: any) {
    console.error('Design Analysis Error:', error);
    return NextResponse.json(
      { error: error.message || 'デザイン解析に失敗しました' },
      { status: 500 }
    );
  }
}
