import jwt from 'jsonwebtoken';

// GLM (Zhipu AI / ChatGLM) API integration

export interface GLMMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface GLMResponse {
  choices: Array<{
    message: {
      content: string;
      role: string;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export class GLMClient {
  private apiKey: string;
  private baseURL = 'https://api.z.ai/api/paas/v4';
  private cachedToken: string | null = null;
  private tokenExpiry: number | null = null;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async chat({
    messages,
    model = 'glm-4-flash',
    temperature = 0.7,
    maxTokens = 4096,
  }: {
    messages: GLMMessage[];
    model?: string;
    temperature?: number;
    maxTokens?: number;
  }): Promise<GLMResponse> {
    const url = `${this.baseURL}/chat/completions`;

    // Get or generate JWT token
    const token = await this.getAuthToken();

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('GLM API error:', response.status, errorText);
      throw new Error(`GLM API error: ${response.status} - ${errorText}`);
    }

    return response.json() as Promise<GLMResponse>;
  }

  // Generate JWT token for GLM API authentication
  private async getAuthToken(): Promise<string> {
    // Check if we have a valid cached token
    if (this.cachedToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
      return this.cachedToken;
    }

    // Parse API key (format: id.secret)
    const parts = this.apiKey.split('.');
    if (parts.length !== 2) {
      // If not in id.secret format, try using it directly
      return this.apiKey;
    }

    const [id, secret] = parts;

    // Generate JWT token
    const now = Date.now();
    const payload = {
      api_key: id,
      exp: now + 3600 * 1000, // Token expires in 1 hour
      timestamp: now,
    };

    const header = {
      alg: 'HS256',
      sign_type: 'SIGN',
    };

    try {
      // Sign with the secret
      this.cachedToken = jwt.sign(payload, secret, { header });
      // Cache for 50 minutes (safety margin before expiry)
      this.tokenExpiry = now + 50 * 60 * 1000;
      return this.cachedToken;
    } catch (error) {
      console.error('JWT generation error:', error);
      // Fallback to using API key directly
      return this.apiKey;
    }
  }
}

// Available GLM models
export const GLMModels = {
  FLASH: 'glm-4-plus',       // Fast, cost-effective (mapped to working model)
  PLUS: 'glm-4-plus',         // Balanced performance
  AIR: 'glm-4-plus',         // Lightweight (mapped to working model)
  STD: 'glm-4-plus',         // Standard (mapped to working model)
} as const;
