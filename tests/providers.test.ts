import { describe, it, expect } from 'vitest';
import { mockProvider, getProvider } from '../modules/ai/providers.js';

describe('AI provider stub', () => {
  it('mockProvider.generate returns a mock response', async () => {
    const result = await mockProvider.generate({ prompt: 'Hello world' });
    expect(result.text).toContain('mock response');
    expect(result.usage.completionTokens).toBe(42);
  });

  it('getProvider returns mock provider', () => {
    const provider = getProvider();
    expect(provider.name).toBe('mock');
  });
});
