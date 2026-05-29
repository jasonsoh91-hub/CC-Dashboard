import { NextRequest, NextResponse } from 'next/server';
import { getGLMOrchestrator } from '@/lib/agents/GLMAgentOrchestrator';

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

    // Get GLM API key
    const apiKey = process.env.GLM_API_KEY;

    if (!apiKey) {
      return NextResponse.json({
        success: true,
        data: null,
        meta: {
          message: 'GLM API key not configured. Add GLM_API_KEY to .env.local',
          setup: 'Get your API key from z.ai and add to .env.local',
          agentsEnabled: false,
        },
      });
    }

    // Process through GLM agent pipeline
    const orchestrator = getGLMOrchestrator(apiKey);
    const result = await orchestrator.processApplication(raw_text);

    return NextResponse.json({
      success: true,
      data: result.finalData,
      meta: {
        provider: 'GLM (Zhipu AI)',
        extractionConfidence: result.extraction.confidence,
        extractionWarnings: result.extraction.warnings,
        validation: {
          isValid: result.validation.isValid,
          missingFields: result.validation.missingFields,
          invalidFields: result.validation.invalidFields,
          warnings: result.validation.warnings,
          suggestions: result.validation.suggestions,
        },
        fraudCheck: result.fraudCheck ? {
          riskScore: result.fraudCheck.riskScore,
          riskLevel: result.fraudCheck.riskLevel,
          flags: result.fraudCheck.flags,
          reasons: result.fraudCheck.reasons,
        } : null,
        enrichment: result.enrichment ? {
          sources: result.enrichment.sources,
          confidence: result.enrichment.confidence,
        } : null,
        processingTime: result.processingTime,
      },
    });
  } catch (error) {
    console.error('GLM Agent extraction API error:', error);
    return NextResponse.json(
      {
        error: 'Failed to extract data using GLM agents',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'GLM-based multi-agent extraction endpoint',
    version: '1.0.0',
    provider: 'GLM (Zhipu AI / ChatGLM)',
    agents: ['Extraction', 'Validation', 'Fraud Detection', 'Enrichment'],
    status: process.env.GLM_API_KEY ? 'enabled' : 'disabled',
  });
}
