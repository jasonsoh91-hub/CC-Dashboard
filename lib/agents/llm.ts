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

/**
 * Tried in order. Two reasons this is a list and not one name:
 *  - gemini-2.5-flash 404s for keys from newly created Google projects
 *    ("no longer available to new users"), so the default must stay current.
 *    Both 2.5 models were dropped on 2026-10-11 after they started 404ing on
 *    the live key; verify a replacement by calling it, not by listModels —
 *    models.get still returns a retired model with generateContent listed.
 *  - the free tier's 20-requests/day cap is **per model**, so rolling to the
 *    next model buys another 20 instead of dropping to the regex parser.
 * Override with GEMINI_MODEL (comma-separated) if Google moves again.
 */
const GEMINI_MODELS = (process.env.GEMINI_MODEL || 'gemini-3.6-flash,gemini-3.8-flash,gemini-3.1-flash-lite,gemini-3.5-flash-lite')
  .split(',')
  .map(m => m.trim())
  .filter(Boolean);

/**
 * Field extraction is a structured parse, not a reasoning task, so thinking is
 * off by default — it roughly halves latency at no measured accuracy cost.
 * Set GEMINI_THINKING_BUDGET to a token count (or -1 for the model default) to
 * turn it back on.
 */
const THINKING_BUDGET = Number(process.env.GEMINI_THINKING_BUDGET ?? 0);

async function callGeminiModel(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userMessage: string,
  maxTokens: number,
  withThinkingConfig = true
): Promise<string> {
  const generationConfig: Record<string, unknown> = {
    temperature: 0.3,
    maxOutputTokens: maxTokens,
  };
  if (withThinkingConfig && THINKING_BUDGET >= 0) {
    generationConfig.thinkingConfig = { thinkingBudget: THINKING_BUDGET };
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: userMessage }] }],
        generationConfig,
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    // Not every model accepts thinkingConfig; drop it and retry once rather
    // than burning the model slot on a 400. The message is NOT reliable —
    // gemini-3.5-flash-lite rejects thinkingConfig with a bare "Request
    // contains an invalid argument", so any 400 on a thinking request is
    // retried without it. If it 400s again, the error is real and propagates.
    if (response.status === 400 && withThinkingConfig) {
      console.warn(`[llm] ${model} rejected thinkingConfig, retrying without it`);
      return callGeminiModel(apiKey, model, systemPrompt, userMessage, maxTokens, false);
    }
    const error = new Error(`Gemini API error: ${response.status} - ${errorText}`) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }

  const result = await response.json();
  const parts: Array<{ text?: string }> = result?.candidates?.[0]?.content?.parts ?? [];
  // Thinking models can emit several parts; the JSON is not always the first.
  const text = parts.map(p => p.text ?? '').join('').trim();
  if (!text) {
    throw new Error('Gemini returned an empty response');
  }
  return text;
}

/** Walk the model list, moving on when one is exhausted (429) or retired (404). */
async function callGemini(
  apiKey: string,
  systemPrompt: string,
  userMessage: string,
  maxTokens: number
): Promise<string> {
  let lastError: unknown = new Error('No Gemini model configured');
  for (const model of GEMINI_MODELS) {
    try {
      return await withRetry(() => callGeminiModel(apiKey, model, systemPrompt, userMessage, maxTokens));
    } catch (error) {
      const status = (error as { status?: number })?.status;
      lastError = error;
      // 429 = daily/rate quota for THIS model, 404 = model gone. Both mean the
      // next model in the list may still work; anything else is fatal.
      if (status !== 429 && status !== 404) throw error;
      console.warn(`[llm] gemini model ${model} unavailable (${status}), trying next`);
    }
  }
  throw lastError;
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
 * Capacity blips are worth retrying; a bad key or a dead model is not.
 * 429 is deliberately excluded — on the free tier it means the model's daily
 * quota is gone, so rolling to the next model beats sleeping and retrying.
 */
function isTransient(error: unknown): boolean {
  const status = (error as { status?: number })?.status;
  if (status === 500 || status === 503) return true;
  if (status) return false;
  const message = error instanceof Error ? error.message : '';
  return /\b(500|503)\b|UNAVAILABLE|high demand|overloaded/i.test(message);
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Gemini regularly returns 503 "high demand" for a few seconds at a time.
 * Without this the pipeline would drop straight to the regex parser on what is
 * really a transient blip.
 */
async function withRetry(run: () => Promise<string>, attempts = 3): Promise<string> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await run();
    } catch (error) {
      lastError = error;
      if (!isTransient(error) || attempt === attempts - 1) throw error;
      const backoff = 700 * Math.pow(2, attempt) + Math.random() * 300;
      console.warn(`[llm] transient failure, retrying in ${Math.round(backoff)}ms`);
      await sleep(backoff);
    }
  }
  throw lastError;
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
    // callGemini already retries per model and rolls over on quota exhaustion.
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
