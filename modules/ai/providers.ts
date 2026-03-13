/**
 * AI Provider abstraction — all AI/cloud calls must go through this module.
 * Supports: mock, groq, nim (NVIDIA NIM).
 */

import { createLogger } from '../logger.js';

const logger = createLogger('ai');

export interface GenerateOptions {
  prompt: string;
  maxTokens?: number;
  temperature?: number;
  jsonMode?: boolean;
}

export interface GenerateResult {
  text: string;
  usage: { promptTokens: number; completionTokens: number };
}

export interface AIProvider {
  name: string;
  generate(options: GenerateOptions): Promise<GenerateResult>;
}

/**
 * Mock provider for local development and testing.
 */
export const mockProvider: AIProvider = {
  name: 'mock',
  async generate(options: GenerateOptions): Promise<GenerateResult> {
    return {
      text: `[mock response for prompt of length ${options.prompt.length}]`,
      usage: { promptTokens: options.prompt.length, completionTokens: 42 },
    };
  },
};

/**
 * Generic OpenAI-compatible chat completions provider.
 * Works with Groq, NVIDIA NIM, and any OpenAI-compatible endpoint.
 */
function createChatProvider(
  name: string,
  baseUrl: string,
  apiKey: string,
  defaultModel: string,
): AIProvider {
  return {
    name,
    async generate(options: GenerateOptions): Promise<GenerateResult> {
      const model = process.env['LLM_MODEL'] ?? defaultModel;
      const body: Record<string, unknown> = {
        model,
        messages: [{ role: 'user', content: options.prompt }],
        max_tokens: options.maxTokens ?? 1024,
        temperature: options.temperature ?? 0.7,
      };
      if (options.jsonMode) {
        body['response_format'] = { type: 'json_object' };
      }

      logger.info(`[${name}] Calling ${model} (max_tokens=${body.max_tokens})`);

      const resp = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });

      if (!resp.ok) {
        const errorText = await resp.text();
        throw new Error(`${name} API ${resp.status}: ${errorText}`);
      }

      const data = (await resp.json()) as {
        choices: Array<{ message: { content: string } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };

      const text = data.choices?.[0]?.message?.content ?? '';
      const usage = {
        promptTokens: data.usage?.prompt_tokens ?? 0,
        completionTokens: data.usage?.completion_tokens ?? 0,
      };

      logger.info(`[${name}] Response: ${text.length} chars, tokens: ${usage.promptTokens}+${usage.completionTokens}`);
      return { text, usage };
    },
  };
}

/**
 * Get the configured provider based on LLM_PROVIDER env var.
 * Supports: 'groq', 'nim' (NVIDIA NIM), 'mock' (default).
 */
export function getProvider(): AIProvider {
  const providerName = process.env['LLM_PROVIDER'] ?? 'mock';

  if (providerName === 'groq') {
    const apiKey = process.env['GROQ_API_KEY'];
    if (!apiKey) throw new Error('GROQ_API_KEY is required when LLM_PROVIDER=groq');
    return createChatProvider(
      'groq',
      'https://api.groq.com/openai/v1',
      apiKey,
      'llama-3.3-70b-versatile',
    );
  }

  if (providerName === 'nim') {
    const apiKey = process.env['NVIDIA_API_KEY'];
    if (!apiKey) throw new Error('NVIDIA_API_KEY is required when LLM_PROVIDER=nim');
    return createChatProvider(
      'nim',
      'https://integrate.api.nvidia.com/v1',
      apiKey,
      'meta/llama-3.3-70b-instruct',
    );
  }

  return mockProvider;
}
