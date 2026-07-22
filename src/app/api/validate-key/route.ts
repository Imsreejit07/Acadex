export const maxDuration = 30;
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

export async function POST(request: Request) {
  try {
    const body = await request.json() as { apiKey?: string };
    const rawKey = body.apiKey?.replace(/^\uFEFF/, '').trim();

    if (!rawKey) {
      return NextResponse.json(
        { success: false, error: 'API key is required.' },
        { status: 400 }
      );
    }

    // Lightweight test call to Gemini API
    const ai = new GoogleGenAI({ apiKey: rawKey });
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-lite',
      contents: 'Reply with "API OK" in exactly two words.',
    });

    const reply = response.text?.trim() || '';

    return NextResponse.json({
      success: true,
      model: 'gemini-2.5-flash-lite',
      message: `API Key validated successfully! Gemini response: "${reply}"`,
    });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('[BYOK Validation Error]:', errMsg);

    let userFriendlyError = 'Failed to validate API key.';
    if (errMsg.includes('API_KEY_INVALID') || errMsg.includes('invalid') || errMsg.includes('400')) {
      userFriendlyError = 'Invalid Gemini API key. Please check your key in Google AI Studio.';
    } else if (errMsg.includes('RESOURCE_EXHAUSTED') || errMsg.includes('429') || errMsg.includes('quota')) {
      userFriendlyError = 'API key quota exceeded. Please enable billing or use another key.';
    }

    return NextResponse.json(
      {
        success: false,
        error: userFriendlyError,
        details: errMsg,
      },
      { status: 400 }
    );
  }
}
