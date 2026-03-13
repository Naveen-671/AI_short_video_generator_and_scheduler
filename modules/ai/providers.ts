/**
 * AI Provider abstraction — all AI/cloud calls must go through this module.
 * For the scaffold step this is a mock-only stub.
 */

export interface GenerateOptions {
  prompt: string;
  maxTokens?: number;
  temperature?: number;
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
 * Get the configured provider. For now, returns mock.
 * Future modules will read LLM_PROVIDER env var and return the real provider.
 */
export function getProvider(): AIProvider {
  return mockProvider;
}
