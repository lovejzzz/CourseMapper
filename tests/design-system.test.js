// Design-system regression gate (docs/DESIGN_SYSTEM.md).
//
// The v0.15.186 styling audit measured the drift a token system has to stop:
// 131 raw hex colors, 112 uses of 8-9px text, 15 hand-rolled button styles,
// and 4 parallel status-badge systems. These scans keep the floor from
// eroding — they gate the classes of drift, not pixel-perfect style.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const UI_ROOTS = ['src/components', 'src/screens', 'src/pages'];

function listJsxFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listJsxFiles(full));
    else if (/\.(jsx|js)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const files = UI_ROOTS.flatMap((root) => listJsxFiles(root)).map((file) => ({
  file,
  text: fs.readFileSync(file, 'utf8'),
}));

// Slide-deck thumbnails render miniature slides — their 4-6px text mimics a
// scaled-down slide and is decorative, not readable UI. The ONLY exemption.
const TYPE_FLOOR_EXEMPT = new Set([path.join('src/components/deliverables', 'SlideDecksView.jsx')]);

describe('design system — type-size floor', () => {
  it('never renders text below the 10px floor (text-[8px]/text-[9px] are banned)', () => {
    const offenders = files
      .filter(({ file }) => !TYPE_FLOOR_EXEMPT.has(file))
      .filter(({ text }) => /text-\[[0-9](?:\.\d+)?px\]/.test(text))
      .map(({ file, text }) => `${file}: ${text.match(/text-\[[0-9](?:\.\d+)?px\]/g).join(', ')}`);
    expect(offenders, 'use text-2xs (10px) or larger — see docs/DESIGN_SYSTEM.md').toEqual([]);
  });
});

describe('design system — Google brand colors are tokens', () => {
  it('never hardcodes Google Workspace brand hex in className strings', () => {
    // SVG fill/stroke attributes on the brand ICONS may stay literal; the
    // BUTTON/chip styling must come from the gbrand palette so every export
    // surface stays in sync.
    const GOOGLE_HEX = /className=[^>]*#(?:1967D2|4285F4|188038|34A853|F4B400|FBBC04|E8F0FE|E6F4EA|FFF8E1)/i;
    const offenders = files.filter(({ text }) => GOOGLE_HEX.test(text)).map(({ file }) => file);
    expect(offenders, 'use text-gbrand-*/bg-gbrand-* tokens (tailwind.config.js)').toEqual([]);
  });
});

describe('design system — token layer stays intact', () => {
  const indexCss = fs.readFileSync('src/index.css', 'utf8');
  const tailwindConfig = fs.readFileSync('tailwind.config.js', 'utf8');

  it('keeps the accent + status variables defined for both themes', () => {
    for (const token of [
      '--color-accent',
      '--color-accent-soft',
      '--color-success',
      '--color-warning',
      '--color-danger',
      '--color-neutral-soft',
    ]) {
      const occurrences = indexCss.split(token).length - 1;
      expect(occurrences, `${token} must be defined in :root AND .dark`).toBeGreaterThanOrEqual(2);
    }
  });

  it('keeps the semantic type scale and radius aliases in the tailwind theme', () => {
    for (const key of ["'2xs'", 'caption', 'label:', 'body:', "ctl: '8px'", "card: '12px'", "panel: '16px'"]) {
      expect(tailwindConfig).toContain(key);
    }
  });

  it('keeps the ui primitives exported', () => {
    const barrel = fs.readFileSync('src/components/ui/index.js', 'utf8');
    for (const name of ['Button', 'Card', 'StatusBadge']) {
      expect(barrel).toContain(name);
    }
  });
});
