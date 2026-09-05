import fs from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { MERMAID_MODULE_URL } from '../mermaidRuntime';

describe('Mermaid runtime loader', () => {
  it('uses a pinned external ESM runtime URL', () => {
    expect(MERMAID_MODULE_URL).toBe('https://cdn.jsdelivr.net/npm/mermaid@11.14.0/+esm');
  });

  it('keeps mermaid out of static imports', async () => {
    const source = await fs.readFile(new URL('../../components/chat/DiagramCard.jsx', import.meta.url), 'utf8');
    expect(source).toContain('loadMermaidRuntime');
    expect(source).not.toMatch(/from\s+['"]mermaid['"]/);
    expect(source).not.toMatch(/import\s*\(\s*['"]mermaid['"]\s*\)/);
  });

  it('prevents Vite from bundling the external renderer', async () => {
    const source = await fs.readFile(new URL('../mermaidRuntime.js', import.meta.url), 'utf8');
    expect(source).toContain('@vite-ignore');
  });
});
