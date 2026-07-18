/**
 * @vitest-environment happy-dom
 *
 * v0.14.4 WS-E — tokens and parity.
 *
 * E1 accent rule: slate carries structure, indigo means interactive,
 *    amber/green/red mean status — asserted here for the specific violations
 *    the sweep fixed (non-interactive indigo in the export panel's scope
 *    line, violet custom-deliverable items in the tab dropdown).
 * E2 scale floors: 12px text floor in the owned workspace chrome (the ONLY
 *    sub-12px left is the documented 10px identity-badge scale: table prefix
 *    badges, trust chips, P0/P1 severity codes, Bloom's tags), one radius
 *    scale (no rounded-2xl/3xl in owned chrome), ALL-CAPS section labels
 *    retired, and the two amber attention components collapsed into ONE
 *    NoticeBanner (DigestCard shell + export-notice).
 * E3 dark parity: the app's dark strategy is the global `.dark` override
 *    layer in src/index.css; these tests pin the dark: companions added for
 *    the classes that layer does NOT cover (slate-950 surfaces,
 *    border-slate-300, border-indigo-300).
 */
import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import NoticeBanner from '../src/components/NoticeBanner.jsx';
import DigestCard from '../src/components/chat/DigestCard.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

// The owned workspace-chrome files the WS-E sweep covers. Deliverable
// content-card internals, slide-canvas miniatures, and Config's
// deliverable-preview mockups are deliberate carve-outs documented in the
// roadmap report and are NOT scanned here.
const OWNED_CHROME = [
  'src/components/ExportSidePanel.jsx',
  'src/components/ReviewQueue.jsx',
  'src/components/BuildRibbon.jsx',
  'src/components/PrimaryCta.jsx',
  'src/components/WorkspaceQualityChip.jsx',
  'src/components/NoticeBanner.jsx',
  'src/components/PackageTrustStrip.jsx',
  'src/components/DeliverableView.jsx',
  'src/components/CourseMapPreview.jsx',
  'src/components/chat/DigestCard.jsx',
  'src/components/deliverables/shared/SharedComponents.jsx',
];

// Files where ALL-CAPS treatment is fully retired (CourseMapPreview keeps
// ONE uppercase tiny identity badge by design; SharedComponents keeps the
// Bloom's level badge).
const NO_CAPS_FILES = [
  'src/components/ExportSidePanel.jsx',
  'src/components/ReviewQueue.jsx',
  'src/components/BuildRibbon.jsx',
  'src/components/PrimaryCta.jsx',
  'src/components/WorkspaceQualityChip.jsx',
  'src/components/NoticeBanner.jsx',
  'src/components/chat/DigestCard.jsx',
];

function render(element) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(element);
  });
  return {
    container,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

let mounted = [];
afterEach(() => {
  mounted.forEach((m) => m.unmount());
  mounted = [];
});

function mount(element) {
  const m = render(element);
  mounted.push(m);
  return m;
}

describe('E2c — NoticeBanner, the one attention component', () => {
  it('renders a warning shell with amber status tones, title, body, and header action', () => {
    const onAction = vi.fn();
    const { container } = mount(
      <NoticeBanner
        severity="warning"
        title="Worth a look"
        headerAction={
          <button data-testid="banner-action" onClick={onAction}>
            Dismiss
          </button>
        }
      >
        <p>Body text</p>
      </NoticeBanner>,
    );
    const banner = container.querySelector('[data-testid="notice-banner"]');
    expect(banner).not.toBeNull();
    expect(banner.getAttribute('data-severity')).toBe('warning');
    expect(banner.className).toContain('amber');
    expect(banner.className).toContain('rounded-lg');
    expect(banner.textContent).toContain('Worth a look');
    expect(banner.textContent).toContain('Body text');
    container.querySelector('[data-testid="banner-action"]').click();
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('defaults to a slate info shell — color only ever signals status', () => {
    const { container } = mount(<NoticeBanner title="Heads up">note</NoticeBanner>);
    const banner = container.querySelector('[data-testid="notice-banner"]');
    expect(banner.getAttribute('data-severity')).toBe('info');
    expect(banner.className).toContain('slate');
    expect(banner.className).not.toContain('amber');
  });

  it('supports a custom data-testid so consumers keep their contracts (export-notice)', () => {
    const { container } = mount(
      <NoticeBanner severity="warning" dataTestId="export-notice">
        x
      </NoticeBanner>,
    );
    expect(container.querySelector('[data-testid="export-notice"]')).not.toBeNull();
  });

  it('is the shell of the agent panel’s "Worth a look" card (DigestCard)', () => {
    const onDismiss = vi.fn();
    const { container } = mount(
      <DigestCard
        digest={{
          observations: [
            {
              id: 'obs-1',
              observation: 'Lesson 2 objective 1 has no assessment echo.',
              whyItMatters: 'Unassessed objectives are unchecked promises.',
              prompts: [],
            },
          ],
        }}
        status="pending"
        onDismiss={onDismiss}
      />,
    );
    const banner = container.querySelector('[data-testid="notice-banner"]');
    expect(banner).not.toBeNull();
    expect(banner.getAttribute('data-severity')).toBe('warning');
    expect(banner.textContent).toContain('Worth a look — 1 observation from your new package');
    expect(banner.textContent).toContain('Observations only — nothing was changed.');
  });

  it('both former amber components consume NoticeBanner (source proof)', () => {
    expect(read('src/components/chat/DigestCard.jsx')).toContain("import NoticeBanner from '../NoticeBanner'");
    const panel = read('src/components/ExportSidePanel.jsx');
    expect(panel).toContain("import NoticeBanner from './NoticeBanner'");
    expect(panel).toContain('dataTestId="export-notice"');
  });
});

describe('E2a — 12px text floor in owned workspace chrome', () => {
  it.each(OWNED_CHROME)('%s has no 8/9/11px text (10px only as the documented badge scale)', (file) => {
    const source = read(file);
    expect(source).not.toMatch(/text-\[8px\]/);
    expect(source).not.toMatch(/text-\[9px\]/);
    expect(source).not.toMatch(/text-\[11px\]/);
    expect(source).not.toMatch(/text-\[11\.5px\]/);
  });

  it('keeps the deliberate 10px badge scale only on identity badges (counted, not banned)', () => {
    // If a lane adds new 10px text, this count forces the author to decide
    // whether it is genuinely an identity badge — update the count with a
    // reason, or use text-xs.
    const counts = Object.fromEntries(
      OWNED_CHROME.map((file) => [file, (read(file).match(/text-\[10px\]/g) || []).length]),
    );
    expect(counts).toEqual({
      'src/components/ExportSidePanel.jsx': 2, // quality stamp + P0/P1 severity code
      'src/components/ReviewQueue.jsx': 0,
      'src/components/BuildRibbon.jsx': 0,
      'src/components/PrimaryCta.jsx': 0,
      'src/components/WorkspaceQualityChip.jsx': 1, // header trust-chip scale
      'src/components/NoticeBanner.jsx': 0,
      'src/components/PackageTrustStrip.jsx': 1, // header trust-chip scale
      'src/components/DeliverableView.jsx': 0,
      'src/components/CourseMapPreview.jsx': 4, // table prefix badges ×2 + lesson-count + kind badge
      'src/components/chat/DigestCard.jsx': 0,
      'src/components/deliverables/shared/SharedComponents.jsx': 3, // scorecard chip + "new" badge + Bloom's tag
    });
  });
});

describe('E2b/E2d — one radius scale, no ALL-CAPS section labels', () => {
  it.each(OWNED_CHROME)('%s has no rounded-2xl/3xl outliers', (file) => {
    const source = read(file);
    expect(source).not.toMatch(/rounded-2xl/);
    expect(source).not.toMatch(/rounded-3xl/);
  });

  it.each(NO_CAPS_FILES)('%s carries no uppercase styling at all', (file) => {
    expect(read(file)).not.toMatch(/\buppercase\b/);
  });

  it('the export panel section labels use sentence case + weight (12px slate)', () => {
    const panel = read('src/components/ExportSidePanel.jsx');
    expect(panel).toContain('text-xs font-semibold text-slate-500');
    for (const label of ['Lesson scope', 'Package ZIP', 'Download', 'Google Drive']) {
      expect(panel).toContain(`>${label}</p>`);
    }
  });

  it('the workspace header and tab dropdown labels dropped uppercase tracking', () => {
    const appFlow = read('src/AppFlow.jsx');
    expect(appFlow).toContain('className="text-xs font-semibold text-slate-400">Workspace</p>');
    expect(appFlow).toMatch(/>\s*Add deliverable\s*<\/p>/);
    expect(appFlow).toMatch(/>\s*Your custom\s*<\/p>/);
    expect(appFlow).toContain('workspace-header-row rounded-lg');
  });
});

describe('E1 — accent rule: indigo only on interactive elements', () => {
  it('the export scope line no longer colors non-interactive text indigo', () => {
    const panel = read('src/components/ExportSidePanel.jsx');
    expect(panel).not.toContain('font-semibold text-indigo-500">{tabLabel}');
    expect(panel).toContain('font-semibold text-slate-600">{tabLabel}');
  });

  it('custom deliverables in the add-tab dropdown are indigo (interactive), not violet', () => {
    const appFlow = read('src/AppFlow.jsx');
    expect(appFlow).not.toMatch(/text-violet-600 hover:bg-violet-50 hover:text-violet-700/);
  });
});

describe('E3 — dark parity for classes the global .dark layer does not cover', () => {
  it('slate-950 surfaces carry explicit dark: inversions', () => {
    const panel = read('src/components/ExportSidePanel.jsx');
    // The ZIP button and the panel icon square are bg-slate-950 — invisible
    // on the dark surface without an explicit companion (the index.css layer
    // maps bg-white/bg-slate-50..200 but NOT slate-950).
    expect(panel.match(/bg-slate-950[^"]*dark:bg-white|dark:bg-white[^"]*bg-slate-950/g)?.length ?? 0).toBeGreaterThan(
      0,
    );
    const appFlow = read('src/AppFlow.jsx');
    expect(appFlow).toContain('text-slate-950 dark:text-slate-100');
    expect(appFlow).toContain("'bg-slate-950 text-white shadow-sm dark:bg-white dark:text-slate-950'");
  });

  it('border-slate-300 / border-indigo-300 (uncovered by the layer) have dark companions', () => {
    expect(read('src/components/ExportSidePanel.jsx')).toContain('border-slate-300 dark:border-slate-600');
    expect(read('src/components/ReviewQueue.jsx')).toContain(
      'border-indigo-300 bg-indigo-50/60 dark:border-indigo-500/40',
    );
    expect(read('src/components/CourseMapPreview.jsx')).toContain('border-slate-300 dark:border-slate-600');
  });
});
