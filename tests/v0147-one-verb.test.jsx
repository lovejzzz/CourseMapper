/**
 * @vitest-environment happy-dom
 *
 * v0.14.7 WS-F — one verb, one decision.
 *
 * F1 — PrimaryCta, the morphing header CTA: pipeline running → "Building…"
 *      (disabled, spinner); ready with reviews outstanding → "Review N"
 *      (indigo, opens the queue); ready and clear with a graded package →
 *      "Download ZIP" (dark primary, routes to the export panel's
 *      doExport('zip') via the 'coursemapper:request-zip-download' window
 *      event); anything else → nothing. Finish package and Save .coursemapper
 *      demote into the More disclosure (real buttons, aria-expanded trigger).
 *
 * F2 — quick start on the landing prompt box: "Generate with defaults",
 *      visible only with a non-empty prompt AND a stored API key; AppFlow's
 *      handleQuickStart mirrors FeatureSelect's select-all and calls the SAME
 *      onGenerate path the Config screen uses.
 */
import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import PrimaryCta from '../src/components/PrimaryCta.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

function render(element) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(element);
  });
  return {
    container,
    rerender: (next) =>
      act(() => {
        root.render(next);
      }),
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

const READY_MODEL = { stage: 'ready', running: false };
const RUNNING_MODEL = { stage: 'compile', running: true };

describe('F1 — the morphing CTA state matrix', () => {
  it('pipeline running → "Building…", disabled, with the house spinner', () => {
    const { container } = mount(<PrimaryCta ribbonModel={RUNNING_MODEL} reviewCount={0} canDownload={false} />);
    const cta = container.querySelector('[data-testid="primary-cta"]');
    expect(cta).not.toBeNull();
    expect(cta.textContent).toContain('Building…');
    expect(cta.disabled).toBe(true);
    expect(cta.querySelector('.animate-spin')).not.toBeNull();
  });

  it('ready + reviews outstanding → "Review N" (indigo interactive), click opens the queue', () => {
    const onReview = vi.fn();
    const { container } = mount(
      <PrimaryCta ribbonModel={READY_MODEL} reviewCount={3} canDownload onReview={onReview} />,
    );
    const cta = container.querySelector('[data-testid="primary-cta"]');
    expect(cta.textContent).toContain('Review 3');
    expect(cta.className).toContain('indigo');
    act(() => {
      cta.click();
    });
    expect(onReview).toHaveBeenCalledTimes(1);
  });

  it('ready + zero reviews + downloadable package → "Download ZIP" (dark primary), click downloads', () => {
    const onDownload = vi.fn();
    const { container } = mount(
      <PrimaryCta ribbonModel={READY_MODEL} reviewCount={0} canDownload onDownload={onDownload} />,
    );
    const cta = container.querySelector('[data-testid="primary-cta"]');
    expect(cta.textContent).toContain('Download ZIP');
    expect(cta.className).toContain('bg-slate-950');
    expect(cta.className).toContain('dark:bg-white');
    act(() => {
      cta.click();
    });
    expect(onDownload).toHaveBeenCalledTimes(1);
  });

  it('no package yet / blocked → renders nothing (null model, non-ready stage, ready-but-blocked)', () => {
    const idle = mount(<PrimaryCta ribbonModel={null} reviewCount={0} canDownload={false} />);
    expect(idle.container.querySelector('[data-testid="primary-cta"]')).toBeNull();
    expect(idle.container.textContent).toBe('');

    const lull = mount(<PrimaryCta ribbonModel={{ stage: 'compile', running: false }} reviewCount={5} canDownload />);
    expect(lull.container.querySelector('[data-testid="primary-cta"]')).toBeNull();

    const blocked = mount(<PrimaryCta ribbonModel={READY_MODEL} reviewCount={0} canDownload={false} />);
    expect(blocked.container.querySelector('[data-testid="primary-cta"]')).toBeNull();
  });
});

describe('F1 — ONE disclosure: the workspace More owns the package actions', () => {
  it('PrimaryCta carries NO menu of its own (two "More" buttons was the live feedback that killed it)', () => {
    const { container } = mount(<PrimaryCta ribbonModel={READY_MODEL} reviewCount={0} canDownload />);
    expect(container.querySelector('[data-testid="primary-cta-more"]')).toBeNull();
    expect(container.querySelector('[data-testid="primary-cta-menu"]')).toBeNull();
    expect(container.querySelectorAll('button')).toHaveLength(1); // the one verb
  });

  it('the workspace More menu hosts Finish package + Save .coursemapper with the existing logic (source contract)', () => {
    const appFlow = read('src/AppFlow.jsx');
    const menuStart = appFlow.indexOf('workspace-more-menu-trigger');
    expect(menuStart).toBeGreaterThan(-1);
    const menu = appFlow.slice(menuStart, menuStart + 4000);
    expect(menu).toContain('data-testid="workspace-finish-package"');
    expect(menu).toContain('data-testid="workspace-menu-save-project"');
    expect(menu).toContain('disabled={finishPackageDisabled}');
    expect(menu).toContain("isFinishPassRunning(packageQualityPass) ? 'Finishing' : 'Finish package'");
    expect(menu).toContain('onClick={handleSaveProject}');
    // And it is the ONLY "More" disclosure in the header.
    expect(appFlow).not.toContain('primary-cta-more');
  });
});

describe('F1/F2 — source wiring (the header has ONE verb; the paths exist)', () => {
  it('AppFlow renders PrimaryCta and no longer renders the Finish package button at header top level', () => {
    const appFlow = read('src/AppFlow.jsx');
    expect(appFlow).toContain('<PrimaryCta');
    // The standalone header button is gone — the finish action lives ONLY in
    // the workspace More menu (PrimaryCta carries no menu at all).
    expect(read('src/components/PrimaryCta.jsx')).not.toContain('workspace-finish-package');
    expect(appFlow).toContain('data-testid="workspace-finish-package"');
    // Download routes through the one export executor, not a second builder.
    expect(appFlow).toContain("new CustomEvent('coursemapper:request-zip-download')");
    expect(appFlow).toContain('reviewCount={headerReviewQueue.total}');
    expect(appFlow).toContain('onReview={() => handleReviewQueueOpenChange(true)}');
  });

  it('ExportSidePanel listens for the header download request and reuses the ZIP guards', () => {
    const panel = read('src/components/ExportSidePanel.jsx');
    expect(panel).toContain("window.addEventListener('coursemapper:request-zip-download'");
    expect(panel).toContain("window.removeEventListener('coursemapper:request-zip-download'");
    // One guard expression, shared by the button and the event path.
    expect(panel).toContain('const zipDownloadDisabled =');
    expect(panel).toContain('disabled={zipDownloadDisabled}');
    expect(panel).toContain('if (zipDownloadDisabled) return;');
  });

  it('Landing carries the quick-start affordance, gated on prompt + stored API key', () => {
    const landing = read('src/screens/Landing.jsx');
    expect(landing).toContain('Generate with defaults');
    expect(landing).toContain('data-testid="landing-quick-start"');
    expect(landing).toContain(
      'const canQuickStart = Boolean(onQuickStart) && promptText.trim().length > 0 && Boolean(apiKey?.trim());',
    );
    // The deliberate three-screen path stays — relabeled, not removed.
    expect(landing).toContain("{canQuickStart ? 'Adjust setup' : 'Continue'}");
    expect(landing).toContain('onClick={onGenerate}');
  });

  it('AppFlow quick start mirrors select-all and calls the SAME generate path as Config', () => {
    const appFlow = read('src/AppFlow.jsx');
    expect(appFlow).toContain('function handleQuickStart()');
    expect(appFlow).toContain('onQuickStart={handleQuickStart}');
    // Select-all mirror: built-ins (minus syllabus with a syllabus file) + customs.
    expect(appFlow).toMatch(/hasSyllabusFile \? FEATURES\.filter\(\(f\) => f\.id !== 'syllabus'\) : FEATURES/);
    expect(appFlow).toContain('listCustomDeliverables().map(toFeatureEntry)');
    // No duplicated generation logic — the pending flag hands off to onGenerate().
    expect(appFlow).toContain('if (!quickStartPending) return;');
    expect(appFlow.match(/^\s*onGenerate\(\);$/gm)?.length).toBe(1);
  });
});
