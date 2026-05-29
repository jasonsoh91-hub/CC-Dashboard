import { NextResponse } from 'next/server';

export async function GET() {
  const hasGLMKey = !!process.env.GLM_API_KEY;
  const hasGoogleKey = !!process.env.GOOGLE_API_KEY;

  return NextResponse.json({
    multiAgentSystem: {
      status: hasGLMKey ? 'enabled' : 'disabled',
      provider: 'GLM (Zhipu AI / ChatGLM)',
      message: hasGLMKey
        ? 'Using GLM-powered multi-agent system'
        : 'Add GLM_API_KEY to enable AI agents',
    },
    fallback: {
      status: hasGoogleKey ? 'available' : 'disabled',
      message: hasGoogleKey
        ? 'Google Gemini extraction available as fallback'
        : 'No extraction method configured',
    },
    agents: [
      { name: 'Extraction Agent', description: 'GLM-powered data extraction from messy text' },
      { name: 'Validation Agent', description: 'Data quality and completeness checks' },
      { name: 'Fraud Detection Agent', description: 'Risk scoring and suspicious pattern detection' },
      { name: 'Enrichment Agent', description: 'Intelligent field completion and suggestions' },
    ],
    configuration: {
      setup: 'Add GLM_API_KEY to .env.local to enable the full multi-agent system',
      models: [
        'glm-4-flash (extraction - fast)',
        'glm-4-air (validation - lightweight)',
      ],
    },
  });
}
