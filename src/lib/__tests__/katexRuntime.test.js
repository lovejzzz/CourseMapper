import fs from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { HTML2CANVAS_MODULE_URL, KATEX_CSS_URL, KATEX_MODULE_URL } from '../katexRuntime';

describe('KaTeX runtime loader', () => {
  it('uses pinned external runtime URLs', () => {
    expect(KATEX_MODULE_URL).toBe('https://cdn.jsdelivr.net/npm/katex@0.16.35/dist/katex.mjs');
    expect(KATEX_CSS_URL).toBe('https://cdn.jsdelivr.net/npm/katex@0.16.35/dist/katex.min.css');
    expect(HTML2CANVAS_MODULE_URL).toBe('https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/+esm');
  });

  it('prevents Vite from bundling math renderers', async () => {
    const source = await fs.readFile(new URL('../katexRuntime.js', import.meta.url), 'utf8');
    expect(source).toContain('@vite-ignore');
  });

  it('keeps KaTeX and html2canvas out of static imports', async () => {
    const files = [
      new URL('../../components/chat/MessageBubble.jsx', import.meta.url),
      new URL('../latexRenderer.js', import.meta.url),
    ];
    const sources = await Promise.all(files.map((file) => fs.readFile(file, 'utf8')));
    const source = sources.join('\n');
    expect(source).not.toMatch(/from\s+['"]katex['"]/);
    expect(source).not.toMatch(/import\s*\(\s*['"]katex['"]\s*\)/);
    expect(source).not.toMatch(/import\s*\(\s*['"]html2canvas['"]\s*\)/);
    expect(source).not.toContain('katex/dist/katex.min.css?inline');
  });
});
