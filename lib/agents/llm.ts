import { GLMClient, GLMModels } from './GLMBaseAgent';

/**
 * Provider-agnostic LLM transport for the extraction pipeline.
 *
 * Google Gemini is the primary provider; GLM (z.ai) is kept as a fallback.
 * Google was made primary because z.ai is prepaid — when the balance hits zero
 * the API returns 429 and the whole pipeline silently degrades to the regex
 * parser, which drops mother_name / address / race / religion / income.
 */

export type LLMProvider = 'gemini' | 'glm';

export interface LLMResult {
  text: string;
  provider: LLMProvider;
  /** Providers that were tried and failed before the one that answered. */
  failures: string[];
}

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

async function callGemini(
  apiKey: string,
  systemPrompt: string,
  userMessage: string,
  maxTokens: number
): Promise<string> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: userMessage }] }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: maxTokens,
        },
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  const text: string = result?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  if (!text.trim()) {
    throw new Error('Gemini returned an empty response');
  }
  return text;
}

async function callGLM(
  apiKey: string,
  systemPrompt: string,
  userMessage: string,
  maxTokens: number
): Promise<string> {
  const client = new GLMClient(apiKey);
  const response = await client.chat({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    model: GLMModels.FLASH,
    temperature: 0.3,
    maxTokens,
  });

  const text = response.choices?.[0]?.message?.content;
  if (!text) throw new Error('No response from GLM');
  return text;
}

/**
 * Try each configured provider in order and return the first usable answer.
 * Throws only when every configured provider fails, so the caller can decide
 * whether to fall back to the regex parser.
 */
export async function callLLM(
  systemPrompt: string,
  userMessage: string,
  maxTokens = 4096
): Promise<LLMResult> {
  const googleKey = process.env.GOOGLE_API_KEY;
  const glmKey = process.env.GLM_API_KEY;

  const providers: Array<{ name: LLMProvider; run: () => Promise<string> }> = [];
  if (googleKey) {
    providers.push({ name: 'gemini', run: () => callGemini(googleKey, systemPrompt, userMessage, maxTokens) });
  }
  if (glmKey) {
    providers.push({ name: 'glm', run: () => callGLM(glmKey, systemPrompt, userMessage, maxTokens) });
  }

  if (providers.length === 0) {
    throw new Error('No LLM provider configured (set GOOGLE_API_KEY or GLM_API_KEY)');
  }

  const failures: string[] = [];
  for (const provider of providers) {
    try {
      const text = await provider.run();
      return { text, provider: provider.name, failures };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[llm] ${provider.name} failed:`, message);
      failures.push(`${provider.name}: ${message}`);
    }
  }

  throw new Error(`All LLM providers failed — ${failures.join(' | ')}`);
}
