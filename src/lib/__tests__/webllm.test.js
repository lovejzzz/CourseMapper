import fs from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { isEngineReady, WEBLLM_MODULE_URL } from '../webllm';

describe('WebLLM runtime loader', () => {
  it('uses a pinned external ESM runtime URL', () => {
    expect(WEBLLM_MODULE_URL).toBe('https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.81/lib/index.js');
    expect(WEBLLM_MODULE_URL).not.toContain('esm.sh');
  });

  it('does not statically import the WebLLM npm package', async () => {
    const source = await fs.readFile(new URL('../webllm.js', import.meta.url), 'utf8');
    expect(source).toContain('@vite-ignore');
    expect(source).not.toMatch(/from\s+['"]@mlc-ai\/web-llm['"]/);
    expect(source).not.toMatch(/import\s+['"]@mlc-ai\/web-llm['"]/);
  });

  it('starts with no local engine loaded', () => {
    expect(isEngineReady()).toBe(false);
  });
});
