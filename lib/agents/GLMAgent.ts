import { GLMClient, GLMMessage, GLMModels } from './GLMBaseAgent';

export abstract class GLMAgent {
  protected client: GLMClient;
  protected modelName: string;

  constructor(apiKey: string, modelName: string = GLMModels.FLASH) {
    this.client = new GLMClient(apiKey);
    this.modelName = modelName;
  }

  protected async callGLM(
    systemPrompt: string,
    userMessage: string,
    maxTokens = 4096
  ): Promise<string> {
    try {
      const messages: GLMMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ];

      const response = await this.client.chat({
        messages,
        model: this.modelName,
        temperature: 0.3, // Lower temperature for more consistent extraction
        maxTokens,
      });

      if (response.choices && response.choices.length > 0) {
        return response.choices[0].message.content;
      }

      throw new Error('No response from GLM');
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
