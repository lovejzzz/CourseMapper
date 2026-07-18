import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('workspace reduced-motion contract', () => {
  it('turns transitions and repeating animation into an effectively stable first frame', () => {
    const css = fs.readFileSync(path.join(repoRoot, 'src/index.css'), 'utf8');
    const start = css.indexOf('@media (prefers-reduced-motion: reduce)');
    const end = css.indexOf('textarea.developer-code-editor', start);
    const reducedMotion = start >= 0 && end > start ? css.slice(start, end) : '';

    expect(reducedMotion).toContain('animation-duration: 0.01ms !important');
    expect(reducedMotion).toContain('animation-iteration-count: 1 !important');
    expect(reducedMotion).toContain('transition-duration: 0.01ms !important');
    expect(reducedMotion).toContain('scroll-behavior: auto !important');
  });
});
