import { Anthropic } from '@anthropic-ai/sdk';

export abstract class BaseAgent {
  protected client: Anthropic;
  protected modelName: string;

  constructor(apiKey?: string, modelName = 'claude-3-5-sonnet-20241022') {
    this.client = new Anthropic({
      apiKey: apiKey || process.env.ANTHROPIC_API_KEY || '',
    });
    this.modelName = modelName;
  }

  protected async callClaude(
    systemPrompt: string,
    userMessage: string,
    maxTokens = 4096
  ): Promise<string> {
    try {
      const response = await this.client.messages.create({
        model: this.modelName,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      });

      const text = response.content[0];
      if (text.type === 'text') {
        return text.text;
      }
      throw new Error('Unexpected response type from Claude');
    } catch (error) {
      console.error(`${this.constructor.name} error:`, error);
      throw error;
    }
  }

  protected extractJson<T>(text: string): T | null {
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]) as T;
      }
      return null;
    } catch {
      return null;
    }
  }

  abstract process(input: Record<string, unknown>): Promise<unknown>;
}
