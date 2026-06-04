/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from 'vitest';
import { sanitizeMathHtml } from '../sanitizeMathHtml';

describe('sanitizeMathHtml', () => {
  it('preserves normal KaTeX-like spans', () => {
    const html = sanitizeMathHtml('<span class="katex"><span class="mord">x</span><span>+</span></span>');

    expect(html).toContain('class="katex"');
    expect(html).toContain('class="mord"');
    expect(html).toContain('x');
  });

  it('strips malicious tags, event handlers, and javascript links from math HTML', () => {
    const html = sanitizeMathHtml(
      '<span class="katex"><span>x</span><img src=x onerror="alert(1)"><a href="javascript:alert(2)" onclick="alert(3)">bad</a><script>alert(4)</script></span>',
    );

    expect(html).toContain('class="katex"');
    expect(html).toContain('bad');
    expect(html).not.toMatch(/<script|<img|onerror|onclick|javascript:/i);
  });
});
