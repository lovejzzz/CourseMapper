/**
 * @vitest-environment happy-dom
 *
 * v0.14.4 WS-C1/C2 — one review queue.
 *
 * C1 — buildReviewQueue (pure classifier) merges the three former review
 *      entrances into one queue with three classes:
 *        - agent digest observations (agentDigest.js shape) → observations
 *        - "N items need your eyes" checklist (preExportChecklist.js shape)
 *          → spotChecks
 *        - export-verify warnings (runDigest gates.flaggedChecks /
 *          exportVerification.checks) + P2 quality-grade findings
 *          (packageQualityPass.quality.findings) → structural
 *      Every fixture below mirrors the REAL producer shape, cited inline.
 *
 * C2 — the ReviewQueue drawer steps through items, Jump dispatches the
 *      EXISTING focus events only (focus-deliverable / focus-coursemap-cell
 *      — DeliverableView behavior is another lane's contract and is NOT
 *      asserted here), and progress persists per finish run id in
 *      localStorage with an honest reset when a new run lands.
 */
import React, { useState } from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import ReviewQueue from '../src/components/ReviewQueue.jsx';
import DigestCard from '../src/components/chat/DigestCard.jsx';
import {
  REVIEW_PROGRESS_STORAGE_KEY,
  applyReviewMark,
  buildFocusEventForTarget,
  buildReviewQueue,
  flattenReviewQueue,
  loadReviewProgress,
  resolveReviewRunId,
  reviewItemId,
  saveReviewProgress,
  selectOutstandingQueue,
} from '../src/lib/reviewQueueModel.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// happy-dom's localStorage lacks clear() in this setup — Map-backed stub,
// the ModelConfig.test.jsx pattern.
const originalLocalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
function createStorageMock() {
  const store = new Map();
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => {
      store.set(key, String(value));
    },
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
  };
}
beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: createStorageMock() });
});
afterAll(() => {
  if (originalLocalStorage) Object.defineProperty(globalThis, 'localStorage', originalLocalStorage);
  else delete globalThis.localStorage;
});

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readSource = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

// ── Fixtures: the real source shapes ─────────────────────────────────────────

// agentDigest.js observations — { id, observation, whyItMatters, anchor, prompts }
const DIGEST_OBSERVATIONS = [
  {
    id: 'coverage-l5',
    observation: 'Lesson 5’s first objective ("Apply Bayes’ rule…") has no clear echo in its assessments.',
    whyItMatters: 'An objective nothing assesses is a promise the gradebook never checks.',
    anchor: { featureId: 'quizBank', itemIndex: 4 },
    prompts: [
      { label: 'Trace it', prompt: 'Trace Lesson 5’s first objective through the quiz.' },
      { label: 'Propose coverage', prompt: 'Propose assessment items for Lesson 5.' },
    ],
  },
  {
    id: 'blooms-flat',
    observation: 'Quiz for lesson 2 sits entirely at Remember/Understand level.',
    whyItMatters: 'Students can pass these without ever applying the concepts.',
    anchor: { featureId: 'quizBank', itemIndex: 1 },
    prompts: [],
  },
];

// preExportChecklist.js items — { id, kind, label, detail, anchor?, confirmed }
const CHECKLIST_ITEMS = [
  {
    id: 'localization-instructorName',
    kind: 'localization',
    label: 'Instructor name',
    detail: 'Not set — exports fall back to a neutral placeholder.',
    confirmed: false,
  },
  {
    id: 'review-lessonPlans-3',
    kind: 'local-review',
    label: 'Confirm the Lesson 4 lab equipment list against your room',
    detail: 'The compiler flagged this for local confirmation before teaching.',
    anchor: { featureId: 'lessonPlans', itemIndex: 3 },
    confirmed: false,
  },
  {
    id: 'review-quizBank-0',
    kind: 'local-review',
    label: 'Verify the weekly quiz point values match your gradebook',
    detail: 'The compiler flagged this for local confirmation before teaching.',
    anchor: { featureId: 'quizBank', itemIndex: 0 },
    confirmed: true, // already confirmed in the pre-queue era → reviewedAtSource
  },
];

const REPEATED_PHRASE_MESSAGE = 'CSV: repeated phrase "(Multiple choice, 2 pts, ~2 min)" appears 13×';

// runDigest.js digest — { finishRunId, gates: { flaggedChecks: [{ featureId, status, message }] } };
// the dedupe fixture also carries raw exportVerification.checks (packageFinalizer shape).
const RUN_DIGEST = {
  finishRunId: 'finish-1781228533296',
  gates: {
    flaggedChecks: [
      { featureId: 'quizBank', status: 'warning', message: REPEATED_PHRASE_MESSAGE },
      {
        featureId: 'content',
        status: 'warning',
        message: 'partial enrichment (12/14) — lessons 3, 7 fell back to template',
      },
      { featureId: 'alignment', status: 'info', message: 'assessment registry reconciled 13/13' }, // info → excluded
    ],
  },
  exportVerification: {
    checks: [
      // duplicate of the flagged check above → must dedupe to ONE structural item
      { featureId: 'quizBank', label: 'Quiz Bank', format: 'csv', status: 'warning', message: REPEATED_PHRASE_MESSAGE },
      {
        featureId: 'syllabus',
        label: 'Syllabus',
        format: 'docx',
        status: 'warning',
        message: 'DOCX: heading depth jumps from H1 to H3',
      },
      { featureId: 'lessonPlans', label: 'Lesson Plans', format: 'pdf', status: 'passed', message: 'ok' }, // passed → excluded
    ],
  },
};

// packageQualityPass — { quality: { findings: [{ id, severity, dimension, file, detail, evidence }] } }
const QUALITY_PASS = {
  status: 'ready',
  quality: {
    status: 'graded',
    score: 96,
    grade: 'A',
    gradedAt: '2026-06-11T10:00:00.000Z',
    findingCounts: { p0: 0, p1: 1, p2: 1 },
    findings: [
      {
        id: 'find-p1',
        severity: 'P1', // P1 stays on the readiness/quality channel, NOT the queue
        dimension: 'identity',
        file: 'syllabus.docx',
        detail: 'syllabus grading table carries no registry ids',
        evidence: 'quote',
      },
      {
        id: 'find-p2',
        severity: 'P2',
        dimension: 'structure',
        file: 'PACKAGE_MANIFEST.json',
        detail: 'quizBank: manifest lists 14 files, 13 present on disk',
        evidence: '14 vs 13',
      },
    ],
  },
};

function buildFixtureQueue() {
  return buildReviewQueue({
    reviewItems: CHECKLIST_ITEMS,
    observations: DIGEST_OBSERVATIONS,
    finalizerResult: RUN_DIGEST,
    qualityPass: QUALITY_PASS,
  });
}

// ── C1: the classifier ───────────────────────────────────────────────────────

describe('buildReviewQueue — three classes from three entrances', () => {
  it('classes every source into observations / spotChecks / structural with honest counts', () => {
    const queue = buildFixtureQueue();
    expect(queue.counts).toEqual({ observations: 2, spotChecks: 3, structural: 4 });
    expect(queue.total).toBe(9);
    // structural = 2 flagged warnings (info excluded) + 1 non-duplicate
    // export check (passed excluded, duplicate deduped) + 1 P2 finding (P1 excluded)
    const structuralSources = queue.classes.structural.map((item) => item.source);
    expect(structuralSources.filter((source) => source === 'exportVerification')).toHaveLength(3);
    expect(structuralSources.filter((source) => source === 'qualityGrader')).toHaveLength(1);
  });

  it('builds jump targets from the source anchors and leaves unresolvable items target-null', () => {
    const queue = buildFixtureQueue();
    // observation anchor { featureId, itemIndex } → { featureId, lessonNumber }
    expect(queue.classes.observations[0].target).toEqual({ featureId: 'quizBank', lessonNumber: 5 });
    // localization checklist item carries no anchor → no jump
    expect(queue.classes.spotChecks[0].target).toBeNull();
    expect(queue.classes.spotChecks[1].target).toEqual({ featureId: 'lessonPlans', lessonNumber: 4 });
    // pipeline-category featureIds (content/alignment) are not workspace tabs
    const partialEnrichment = queue.classes.structural.find((item) => /partial enrichment/.test(item.title));
    expect(partialEnrichment.target).toBeNull();
    const syllabusCheck = queue.classes.structural.find((item) => /heading depth/.test(item.title));
    expect(syllabusCheck.target).toEqual({ featureId: 'syllabus' });
    // quality findings carry file paths, not feature anchors → no jump
    const p2 = queue.classes.structural.find((item) => item.source === 'qualityGrader');
    expect(p2.target).toBeNull();
    expect(p2.detail).toContain('P2');
  });

  it('keeps ids stable across rebuilds and unique within the queue', () => {
    const first = flattenReviewQueue(buildFixtureQueue()).map((item) => item.id);
    const second = flattenReviewQueue(buildFixtureQueue()).map((item) => item.id);
    expect(first).toEqual(second);
    expect(new Set(first).size).toBe(first.length);
    expect(reviewItemId('agentDigest', 'coverage-l5')).toBe(first[0]);
  });

  it('carries source confirmations as reviewedAtSource and excludes them from outstanding counts', () => {
    const queue = buildFixtureQueue();
    const confirmed = queue.classes.spotChecks.find((item) => item.sourceId === 'review-quizBank-0');
    expect(confirmed.reviewedAtSource).toBe(true);
    const outstanding = selectOutstandingQueue(queue, { reviewed: [], dismissed: [] });
    expect(outstanding.counts).toEqual({ observations: 2, spotChecks: 2, structural: 4 });
  });

  it('handles empty / missing sources without throwing', () => {
    const queue = buildReviewQueue({});
    expect(queue.total).toBe(0);
    expect(queue.classes.observations).toEqual([]);
    expect(selectOutstandingQueue(queue, null).total).toBe(0);
  });
});

describe('buildFocusEventForTarget — existing plumbing only', () => {
  it('maps deliverable targets onto coursemapper:focus-deliverable', () => {
    expect(buildFocusEventForTarget({ featureId: 'quizBank', lessonNumber: 5 })).toEqual({
      type: 'coursemapper:focus-deliverable',
      detail: { featureId: 'quizBank', lessonNumber: 5 },
    });
  });

  it('maps course-map targets onto coursemapper:focus-coursemap-cell', () => {
    expect(
      buildFocusEventForTarget({
        featureId: 'courseMap',
        cellRef: { lessonIndex: 2, sectionIndex: 0, field: 'weeklyAssessments' },
      }),
    ).toEqual({
      type: 'coursemapper:focus-coursemap-cell',
      detail: { type: 'courseMapCell', lessonIndex: 2, sectionIndex: 0, field: 'weeklyAssessments' },
    });
  });

  it('returns null for unresolvable targets', () => {
    expect(buildFocusEventForTarget(null)).toBeNull();
    expect(buildFocusEventForTarget({})).toBeNull();
  });
});

// ── C2: persistence ──────────────────────────────────────────────────────────

describe('review progress persistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('round-trips reviewed/dismissed ids for the same run id', () => {
    const progress = applyReviewMark(
      applyReviewMark({ runId: 'finish-1', reviewed: [], dismissed: [] }, 'rq-a', 'reviewed'),
      'rq-b',
      'dismissed',
    );
    saveReviewProgress(progress);
    expect(loadReviewProgress('finish-1')).toEqual({ runId: 'finish-1', reviewed: ['rq-a'], dismissed: ['rq-b'] });
  });

  it('resets when a NEW finish pass (different run id) lands', () => {
    saveReviewProgress({ runId: 'finish-1', reviewed: ['rq-a'], dismissed: [] });
    expect(loadReviewProgress('finish-2')).toEqual({ runId: 'finish-2', reviewed: [], dismissed: [] });
  });

  it('survives corrupted storage', () => {
    localStorage.setItem(REVIEW_PROGRESS_STORAGE_KEY, '{not json');
    expect(loadReviewProgress('finish-1')).toEqual({ runId: 'finish-1', reviewed: [], dismissed: [] });
  });

  it('applyReviewMark keeps reviewed/dismissed exclusive and supports clearing', () => {
    let progress = { runId: 'finish-1', reviewed: [], dismissed: [] };
    progress = applyReviewMark(progress, 'rq-a', 'reviewed');
    progress = applyReviewMark(progress, 'rq-a', 'dismissed');
    expect(progress).toEqual({ runId: 'finish-1', reviewed: [], dismissed: ['rq-a'] });
    progress = applyReviewMark(progress, 'rq-a', 'clear');
    expect(progress).toEqual({ runId: 'finish-1', reviewed: [], dismissed: [] });
  });

  it('resolveReviewRunId prefers the finish run id, then the grade stamp, then the course', () => {
    expect(resolveReviewRunId({ finalizerResult: RUN_DIGEST, qualityPass: QUALITY_PASS })).toBe('finish-1781228533296');
    expect(resolveReviewRunId({ qualityPass: QUALITY_PASS })).toBe('graded:2026-06-11T10:00:00.000Z');
    expect(resolveReviewRunId({ courseName: 'Intro Stats' })).toBe('course:intro stats');
  });
});

// ── C2: the drawer component ─────────────────────────────────────────────────

function Harness({ queue, initialProgress, focusItemId = null, onClose = () => {} }) {
  const [progress, setProgress] = useState(initialProgress);
  return (
    <ReviewQueue
      open
      queue={queue}
      progress={progress}
      focusItemId={focusItemId}
      onClose={onClose}
      onMark={(item, mark) => setProgress((prev) => applyReviewMark(prev, item.id, mark))}
    />
  );
}

describe('ReviewQueue drawer', () => {
  let container;
  let root;

  beforeEach(() => {
    localStorage.clear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.restoreAllMocks();
  });

  async function render(element) {
    await act(async () => {
      root.render(element);
    });
  }

  it('renders the grouped list with class headers, per-item actions, and no-jump presentation', async () => {
    const queue = buildFixtureQueue();
    await render(<Harness queue={queue} initialProgress={{ runId: 'r', reviewed: [], dismissed: [] }} />);

    expect(document.querySelector('[data-testid="review-queue-drawer"]')).not.toBeNull();
    expect(document.querySelector('[data-testid="review-queue-class-observations"]')).not.toBeNull();
    expect(document.querySelector('[data-testid="review-queue-class-spotChecks"]')).not.toBeNull();
    expect(document.querySelector('[data-testid="review-queue-class-structural"]')).not.toBeNull();
    expect(document.querySelectorAll('[data-testid="review-queue-item"]')).toHaveLength(9);
    // localization item + content/quality items have no resolvable target
    expect(document.querySelectorAll('[data-testid="review-queue-no-jump"]').length).toBeGreaterThanOrEqual(3);
    // pre-confirmed checklist item arrives already checked
    expect(document.querySelectorAll('[data-review-state="reviewed"]')).toHaveLength(1);
  });

  it('Jump dispatches the focus event with the item target detail', async () => {
    const queue = buildFixtureQueue();
    const seen = [];
    const listener = (event) => seen.push(event.detail);
    window.addEventListener('coursemapper:focus-deliverable', listener);
    try {
      await render(<Harness queue={queue} initialProgress={{ runId: 'r', reviewed: [], dismissed: [] }} />);
      const jump = document.querySelector(
        '[data-testid="review-queue-class-observations"] [data-testid="review-queue-jump"]',
      );
      await act(async () => {
        jump.click();
      });
      expect(seen).toEqual([{ featureId: 'quizBank', lessonNumber: 5 }]);
    } finally {
      window.removeEventListener('coursemapper:focus-deliverable', listener);
    }
  });

  it('step-through Next auto-jumps to the advanced item', async () => {
    const queue = buildFixtureQueue();
    const seen = [];
    const listener = (event) => seen.push(event.detail);
    window.addEventListener('coursemapper:focus-deliverable', listener);
    try {
      await render(<Harness queue={queue} initialProgress={{ runId: 'r', reviewed: [], dismissed: [] }} />);
      await act(async () => {
        document.querySelector('[data-testid="review-queue-next"]').click();
      });
      // item 2 is the second observation (quizBank lesson 2)
      expect(seen).toEqual([{ featureId: 'quizBank', lessonNumber: 2 }]);
    } finally {
      window.removeEventListener('coursemapper:focus-deliverable', listener);
    }
  });

  it('marks reviewed with a persistent checkmark and shows all-clear when everything is handled', async () => {
    const queue = buildFixtureQueue();
    await render(<Harness queue={queue} initialProgress={{ runId: 'r', reviewed: [], dismissed: [] }} />);

    const firstMark = document.querySelector('[data-testid="review-queue-mark"]');
    await act(async () => {
      firstMark.click();
    });
    expect(document.querySelectorAll('[data-review-state="reviewed"]')).toHaveLength(2);
    expect(document.querySelector('[data-testid="review-queue-all-clear"]')).toBeNull();

    // hand-handle the rest: mark every remaining open item
    for (let guard = 0; guard < 20; guard++) {
      const openItem = document.querySelector('[data-review-state="open"] [data-testid="review-queue-mark"]');
      if (!openItem) break;
      await act(async () => {
        openItem.click();
      });
    }
    expect(document.querySelector('[data-testid="review-queue-all-clear"]')).not.toBeNull();
  });

  it('focuses the requested observation when opened from the agent-panel card', async () => {
    const queue = buildFixtureQueue();
    await render(
      <Harness queue={queue} initialProgress={{ runId: 'r', reviewed: [], dismissed: [] }} focusItemId="blooms-flat" />,
    );
    const items = [...document.querySelectorAll('[data-testid="review-queue-item"]')];
    const current = items.find((item) => item.className.includes('border-indigo-300'));
    expect(current.textContent).toContain('Remember/Understand');
  });
});

// ── C1: the observation card routes into the queue ──────────────────────────

describe('DigestCard → review queue routing', () => {
  let container;
  let root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('routes its action into the queue instead of a separate prompt path when wired', async () => {
    const onOpenInQueue = vi.fn();
    const onPrompt = vi.fn();
    await act(async () => {
      root.render(
        <DigestCard
          digest={{ observations: DIGEST_OBSERVATIONS }}
          onPrompt={onPrompt}
          onOpenInQueue={onOpenInQueue}
          status="pending"
        />,
      );
    });
    expect(container.textContent).not.toContain('Trace it');
    const button = container.querySelector('[data-testid="digest-open-in-queue"]');
    await act(async () => {
      button.click();
    });
    expect(onOpenInQueue).toHaveBeenCalledWith(DIGEST_OBSERVATIONS[0]);
    expect(onPrompt).not.toHaveBeenCalled();
    // the card stays a narrative surface
    expect(container.textContent).toContain('Observations only — nothing was changed.');
  });

  it('keeps the legacy prompt buttons when no queue is wired (back-compat contract)', async () => {
    const onPrompt = vi.fn();
    await act(async () => {
      root.render(<DigestCard digest={{ observations: DIGEST_OBSERVATIONS }} onPrompt={onPrompt} status="pending" />);
    });
    expect(container.textContent).toContain('Trace it');
    expect(container.querySelector('[data-testid="digest-open-in-queue"]')).toBeNull();
  });
});

// ── Surface contracts (source scans, build-ribbon test convention) ──────────

describe('WS-C surface contracts', () => {
  it('ExportSidePanel replaced the anxious checklist banner with the queue entry', () => {
    const source = readSource('src/components/ExportSidePanel.jsx');
    expect(source).not.toContain('preexport-checklist');
    expect(source).not.toContain('summarizeChecklist');
    expect(source).toContain('review-queue-entry');
    expect(source).toContain('buildReviewQueue');
  });

  it('the queue only dispatches the existing focus events (DeliverableView is another lane)', () => {
    const model = readSource('src/lib/reviewQueueModel.js');
    const component = readSource('src/components/ReviewQueue.jsx');
    expect(model).toContain("'coursemapper:focus-deliverable'");
    expect(model).toContain("'coursemapper:focus-coursemap-cell'");
    expect(component).not.toContain('focus-deliverable-item');
    expect(model).not.toContain('focus-deliverable-item');
  });
});
