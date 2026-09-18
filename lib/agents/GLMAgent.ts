import { GLMClient, GLMModels } from './GLMBaseAgent';
import { callLLM, LLMResult } from './llm';

export abstract class GLMAgent {
  protected client: GLMClient;
  protected modelName: string;

  constructor(apiKey: string, modelName: string = GLMModels.FLASH) {
    this.client = new GLMClient(apiKey);
    this.modelName = modelName;
  }

  /**
   * Calls the LLM through the provider chain (Gemini first, GLM fallback).
   * Returns which provider answered so the caller can warn when the primary
   * one is down instead of silently degrading.
   */
  protected async callModel(
    systemPrompt: string,
    userMessage: string,
    maxTokens = 4096
  ): Promise<LLMResult> {
    try {
      return await callLLM(systemPrompt, userMessage, maxTokens);
    } catch (error) {
      console.error(`${this.constructor.name} error:`, error);
      throw error;
    }
  }

  protected extractJson<T>(text: string): T | null {
    try {
      // Try to find JSON in the response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]) as T;
      }
      // Also try for array responses
      const arrayMatch = text.match(/\[[\s\S]*\]/);
      if (arrayMatch) {
        return JSON.parse(arrayMatch[0]) as T;
      }
      return null;
    } catch {
      return null;
    }
  }

  abstract process(input: Record<string, unknown>): Promise<unknown>;
}
