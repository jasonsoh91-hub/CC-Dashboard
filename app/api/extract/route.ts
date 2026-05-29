import { NextRequest, NextResponse } from 'next/server';
import { extractDataFromN8n } from '@/lib/n8n';
import { SmartExtractionAgent } from '@/lib/agents/SmartExtractionAgent';

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || '';

console.log('[extract API] Route loaded, GOOGLE_API_KEY present:', !!GOOGLE_API_KEY);
console.log('[extract API] GOOGLE_API_KEY length:', GOOGLE_API_KEY.length);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { raw_text } = body;

    if (!raw_text || typeof raw_text !== 'string') {
      return NextResponse.json(
        { error: 'raw_text is required and must be a string' },
        { status: 400 }
      );
    }

    let extractedData;

    // Try Smart AI Extraction first if Google API key is available
    if (GOOGLE_API_KEY) {
      try {
        console.log('[extract API] Using Smart AI with Google Gemini');
        console.log('[extract API] raw_text preview:', raw_text.substring(0, 200));
        const smartAgent = new SmartExtractionAgent(GOOGLE_API_KEY);
        extractedData = await smartAgent.extract(raw_text);
        console.log('[extract API] Smart AI result:', JSON.stringify(extractedData, null, 2));
      } catch (aiError) {
        console.warn('[extract API] Smart AI extraction failed, using fallback:', aiError);
        extractedData = await extractDataFromN8n(raw_text);
        console.log('[extract API] Fallback result:', JSON.stringify(extractedData, null, 2));
      }
    } else {
      console.log('[extract API] No Google API key, using regex fallback');
      extractedData = await extractDataFromN8n(raw_text);
      console.log('[extract API] Fallback result:', JSON.stringify(extractedData, null, 2));
    }

    return NextResponse.json({
      success: true,
      data: extractedData,
    });
  } catch (error) {
    console.error('Extract API error:', error);
    return NextResponse.json(
      { error: 'Failed to extract data' },
      { status: 500 }
    );
  }
}
