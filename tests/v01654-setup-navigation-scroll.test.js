import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('v0.16.54 setup navigation position', () => {
  it('returns each in-document setup screen to its heading', () => {
    const source = fs.readFileSync(path.join(repoRoot, 'src/AppFlow.jsx'), 'utf8');

    expect(source).toContain("window.scrollTo({ top: 0, left: 0, behavior: 'auto' })");
    expect(source).toMatch(/useEffect\(\(\) => \{[\s\S]*?window\.scrollTo[\s\S]*?\}, \[screen\]\);/);
  });
});
