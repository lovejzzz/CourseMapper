/**
 * @vitest-environment happy-dom
 *
 * v0.14.4 WS-A — the table is the product (items A1-A4).
 *
 * A1 — the solid navy header becomes a sticky light one (bg-slate-50, 12px
 *      medium slate-600, sentence case, hairline) with a width hierarchy:
 *      objectives widest, goals/topic narrow, fixed slim section column.
 * A2 — the vertically-merged "Lesson N" cell becomes a full-width band row
 *      (lesson number + title on indigo-50, meta chips from in-scope data);
 *      section rows carry a slim "N.M" address label instead.
 * A3 — type rhythm: 13px/1.55 body, goal prefixes as 10px slate badges,
 *      Evaluate Design prose renders behind a pass/finding icon.
 * A4 — bands collapse their section rows; a comfortable/compact density
 *      toggle; both persisted in localStorage ('coursemapper-map-view'),
 *      never in the project object; collapse keyed by courseName.
 *
 * Data contract is unchanged: cell editing, the focus-coursemap-cell
 * listener, and the assessment-link dispatch all keep working.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

import CourseMapPreview, {
  classifyEvaluateDesign,
  resolveAssessmentChip,
  toSentenceCase,
} from '../src/components/CourseMapPreview.jsx';
import { deriveCourseGraphFromCourseMap, renderCourseMapFromGraph } from '../src/lib/courseGraph';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ── Fixtures ─────────────────────────────────────────────────────────────────

// Plain display map: lesson 1 has a bare title (band adds "Lesson 1 — "),
// lesson 2 is pre-numbered (no double prefix) and carries two sections with
// three assessment atoms total plus all three Evaluate Design text shapes.
function fixtureCourseMap({ courseName = 'Physical Geology' } = {}) {
  return {
    courseName,
    semester: 'Fall 2026',
    lessons: [
      {
        title: 'Minerals',
        sections: [
          {
            topicSection: '1.1: Minerals',
            learningGoals: '1. Build field-ready understanding of minerals.',
            learningObjectives:
              '1. Analyze minerals using specimen evidence.\n2. Evaluate mineral identification keys.',
            weeklyAssessments: 'Quiz: minerals problems',
            asyncActivities: 'Read the assigned chapter on minerals.',
            syncActivities: 'Workshop: minerals case analysis.',
            supportingResources: 'OpenStax geology chapter on minerals',
            evaluateDesign:
              'Each objective verb (analyze, evaluate) is exercised by an activity and measured by an assessment.',
          },
        ],
      },
      {
        title: 'Lesson 2: Igneous Rocks',
        sections: [
          {
            topicSection: '2.1: Magma',
            learningGoals: '1. Connect magma composition to rock texture.',
            learningObjectives: '1. Analyze igneous textures.\n2. Evaluate cooling histories.',
            weeklyAssessments: 'Quiz: igneous rocks problems\nLab Report: rock identification',
            asyncActivities: 'Read the igneous rocks chapter.',
            syncActivities: 'Workshop: texture classification.',
            supportingResources: 'OpenStax geology chapter on igneous rocks',
            evaluateDesign: "Objective 'Analyze igneous textures' has no matching assessment in this section.",
          },
          {
            topicSection: '2.2: Volcanoes',
            learningGoals: '1. Read eruption styles from deposits.',
            learningObjectives: '1. Analyze eruption deposits.',
            weeklyAssessments: 'Midterm Exam: minerals through igneous rocks',
            asyncActivities: 'Review volcano notes.',
            syncActivities: 'Workshop: hazard mapping.',
            supportingResources: 'OpenStax geology chapter on volcanism',
            evaluateDesign: 'Hand-written reviewer note.',
          },
        ],
      },
    ],
  };
}

// Registry-linkable map (the phase-3 geology shape) for the link sanity check.
function chipFixtureCourseMap() {
  return {
    courseName: 'Physical Geology',
    semester: 'Fall 2026',
    lessons: ['Minerals', 'Igneous Rocks'].map((title, index) => ({
      title: `Lesson ${index + 1}: ${title}`,
      sections: [
        {
          topicSection: `${index + 1}.1: ${title}`,
          learningGoals: `1. Build field-ready understanding of ${title.toLowerCase()}.`,
          learningObjectives: `Analyze ${title.toLowerCase()} using specimen evidence.`,
          weeklyAssessments: `Quiz: ${title.toLowerCase()} problems`,
          asyncActivities: `Read the assigned chapter on ${title.toLowerCase()}.`,
          syncActivities: `Workshop: ${title.toLowerCase()} case analysis.`,
          supportingResources: `OpenStax geology chapter on ${title.toLowerCase()}`,
        },
      ],
    })),
  };
}

// ── Harness (the repo's happy-dom component-test style) ─────────────────────

// This happy-dom build exposes window.localStorage without Storage methods
// (the component tolerates that via try/catch); install a functional
// in-memory mock so persistence is observable in tests.
function installLocalStorageMock() {
  const store = new Map();
  const mock = {
    getItem: (key) => (store.has(String(key)) ? store.get(String(key)) : null),
    setItem: (key, value) => store.set(String(key), String(value)),
    removeItem: (key) => store.delete(String(key)),
    clear: () => store.clear(),
  };
  Object.defineProperty(window, 'localStorage', { value: mock, configurable: true });
  return mock;
}

let container;
let root;

beforeEach(() => {
  installLocalStorageMock();
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

function renderPreview(courseMap, extraProps = {}) {
  act(() => {
    root.render(
      React.createElement(CourseMapPreview, {
        courseMap,
        columns: null,
        isStreaming: false,
        onCellEdit: () => {},
        ...extraProps,
      }),
    );
  });
}

function remount() {
  act(() => {
    root.unmount();
  });
  container.remove();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
}

const sectionLabels = () =>
  Array.from(container.querySelectorAll('[data-section-label="true"]')).map((td) => td.textContent.trim());

// ── A1 — sticky light header, sentence case, width hierarchy ────────────────

describe('A1 — header', () => {
  it('makes the overflowing course map a named keyboard-scroll region', () => {
    renderPreview(fixtureCourseMap());

    const region = container.querySelector('[role="region"][aria-label="Scrollable course map"]');
    expect(region).not.toBeNull();
    expect(region.tabIndex).toBe(0);
    expect(region.getAttribute('aria-describedby')).toBe('course-map-scroll-help');
    expect(container.querySelector('#course-map-scroll-help')?.textContent).toContain('Swipe the table');
    expect(region.className).toContain('focus-visible:ring-2');
  });

  it('replaces the navy block with a sticky light header in sentence case', () => {
    renderPreview(fixtureCourseMap());

    const thead = container.querySelector('thead');
    expect(thead.className).toContain('sticky');
    expect(thead.className).toContain('top-0');
    expect(thead.innerHTML).not.toContain('from-slate-800');

    const ths = Array.from(thead.querySelectorAll('th'));
    // Section address column header + 10 default columns + actions column.
    expect(ths).toHaveLength(12);
    expect(ths[0].textContent).toBe('Section');

    const headerTexts = ths.map((th) => th.textContent);
    expect(headerTexts).toContain('Learning goals');
    expect(headerTexts).toContain('Learning objectives');
    expect(headerTexts).toContain('Topic/section');
    expect(headerTexts).not.toContain('Learning Goals');

    for (const th of ths) {
      expect(th.className).toContain('bg-slate-50');
      expect(th.className).toContain('dark:bg-slate-800');
      expect(th.className).not.toContain('uppercase');
      expect(th.className).not.toContain('text-white');
    }
    // Label cells: 12px medium slate-600.
    expect(ths[1].className).toContain('text-[12px]');
    expect(ths[1].className).toContain('font-medium');
    expect(ths[1].className).toContain('text-slate-600');
  });

  it('keeps the table body neutral and readable in dark mode', () => {
    renderPreview(fixtureCourseMap());

    const tableShell = container.querySelector('table').parentElement;
    const contentRow = container.querySelector('tbody tr.group\\/row');

    expect(tableShell.className).toContain('dark:bg-slate-900/65');
    expect(tableShell.className).toContain('dark:border-slate-700/80');
    expect(contentRow.className).toContain('dark:hover:bg-slate-800/55');
    expect(contentRow.className).not.toContain('dark:hover:bg-indigo');
  });

  it('gives objectives the widest track, goals/topic narrow, fixed slim section column', () => {
    renderPreview(fixtureCourseMap());

    const cols = Array.from(container.querySelectorAll('colgroup col'));
    // section col + 10 content cols + actions col
    expect(cols).toHaveLength(12);
    expect(cols[0].style.width).toBe('52px');
    expect(cols[cols.length - 1].style.width).toBe('60px');

    const pct = (col) => parseFloat(col.style.width);
    const goals = pct(cols[1]); // learningGoals
    const topic = pct(cols[2]); // topicSection
    const objectives = pct(cols[3]); // learningObjectives
    const assessments = pct(cols[4]); // weeklyAssessments
    expect(objectives).toBeGreaterThan(goals);
    expect(objectives).toBeGreaterThan(assessments);
    expect(goals).toBeLessThan(assessments);
    expect(topic).toBeLessThan(assessments);
  });

  it('toSentenceCase is render-only casing that preserves short acronyms', () => {
    expect(toSentenceCase('ASYNCHRONOUS Activities')).toBe('Asynchronous activities');
    expect(toSentenceCase('Evaluate Design')).toBe('Evaluate design');
    expect(toSentenceCase('Learning Objectives')).toBe('Learning objectives');
    expect(toSentenceCase('AI Tools')).toBe('AI tools');
    expect(toSentenceCase('')).toBe('');
  });
});

// ── A2 — lesson bands replace the merged title cell ─────────────────────────

describe('A2 — lesson bands', () => {
  it('renders one full-width band per lesson with title and meta chips', () => {
    renderPreview(fixtureCourseMap());

    const bands = Array.from(container.querySelectorAll('[data-lesson-band="true"]'));
    expect(bands).toHaveLength(2);

    // Bare titles get the "Lesson N — " prefix; pre-numbered titles do not double up.
    expect(bands[0].textContent).toContain('Lesson 1 — ');
    expect(bands[0].textContent).toContain('Minerals');
    expect(bands[1].textContent).toContain('Lesson 2: Igneous Rocks');
    expect(bands[1].textContent).not.toContain('Lesson 2 — ');

    // Band spans the full table width.
    const bandCell = bands[0].querySelector('td');
    expect(bandCell.getAttribute('colspan')).toBe('12');
    expect(bandCell.className).toContain('bg-indigo-50');
    expect(bandCell.className).toContain('dark:bg-indigo-950/40');

    // Meta chips computed from the data already in scope.
    const metas = Array.from(container.querySelectorAll('[data-lesson-meta="true"]'));
    expect(metas[0].textContent.replace(/\s+/g, ' ').trim()).toBe('1 section · 1 assessment');
    expect(metas[1].textContent.replace(/\s+/g, ' ').trim()).toBe('2 sections · 3 assessments');
  });

  it('section rows carry slim N.M labels instead of a merged lesson column', () => {
    renderPreview(fixtureCourseMap());
    expect(sectionLabels()).toEqual(['1.1', '2.1', '2.2']);

    // Exactly one title cell per lesson, and it lives on the band row with the
    // original data contract (field "title", empty section index).
    const titleCells = Array.from(container.querySelectorAll('[data-coursemap-cell="true"][data-field-key="title"]'));
    expect(titleCells).toHaveLength(2);
    for (const cell of titleCells) {
      expect(cell.closest('tr').dataset.lessonBand).toBe('true');
      expect(cell.dataset.sectionIndex).toBe('');
    }
  });

  it('the focus-coursemap-cell listener still finds and highlights the band title cell', async () => {
    Element.prototype.scrollIntoView = vi.fn();
    renderPreview(fixtureCourseMap());

    act(() => {
      window.dispatchEvent(
        new CustomEvent('coursemapper:focus-coursemap-cell', {
          detail: { type: 'courseMapCell', lessonIndex: 1, field: 'title' },
        }),
      );
    });

    const bandCell = Array.from(container.querySelectorAll('[data-lesson-band="true"]'))[1].querySelector('td');
    expect(bandCell.className).toContain('ring-amber-400');
    // Let the deferred scroll timer fire against the stub before unmount.
    await act(async () => {
      await sleep(200);
    });
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });
});

// ── A3 — type rhythm: badges and the Evaluate Design verdict ────────────────

describe('A3 — type rhythm', () => {
  it('cell bodies use the 13px/1.55 rhythm in comfortable density', () => {
    renderPreview(fixtureCourseMap());
    const cell = container.querySelector('[data-coursemap-cell="true"][data-field-key="learningObjectives"]');
    expect(cell.className).toContain('text-[13px]');
    expect(cell.className).toContain('leading-[1.55]');
  });

  it('list prefixes render as tiny rounded slate badges', () => {
    renderPreview(fixtureCourseMap());
    const badge = Array.from(
      container.querySelector('[data-field-key="learningObjectives"]').querySelectorAll('span'),
    ).find((span) => span.textContent === '1.');
    expect(badge).toBeTruthy();
    expect(badge.className).toContain('bg-slate-100');
    expect(badge.className).toContain('text-slate-500');
    expect(badge.className).toContain('text-[10px]');
    expect(badge.className).toContain('rounded');
  });

  it('Evaluate Design prose renders a verdict icon: check for clean, dot for findings, nothing for arbitrary text', () => {
    renderPreview(fixtureCourseMap());

    const clean = container.querySelector('[data-evaluate-verdict="clean"]');
    expect(clean).toBeTruthy();
    expect(clean.querySelector('svg')).toBeTruthy();
    expect(clean.textContent).toContain('Each objective verb');

    const finding = container.querySelector('[data-evaluate-verdict="finding"]');
    expect(finding).toBeTruthy();
    expect(finding.querySelector('svg')).toBeFalsy();
    expect(finding.querySelector('.bg-amber-400')).toBeTruthy();
    expect(finding.textContent).toContain('no matching assessment');

    const unknown = container.querySelector('[data-evaluate-verdict="unknown"]');
    expect(unknown.textContent).toBe('Hand-written reviewer note.');
  });

  it('v0.14.6: multi-sentence finding verdicts clamp to the first check behind a count toggle', async () => {
    const longVerdict =
      "Objective 'Interpret function notation from graphs, tables, and formulas' has no matching assessment in this section. " +
      "Objective 'Present clear mathematical work under time limits' has no matching assessment in this section. " +
      "Objective 'Verify results with units, graphs, and reasoning' has no matching assessment in this section.";
    const courseMap = fixtureCourseMap();
    courseMap.lessons[0].sections[0].evaluateDesign = longVerdict;
    renderPreview(courseMap);

    const finding = container.querySelector('[data-evaluate-verdict="finding"]');
    expect(finding).toBeTruthy();
    expect(finding.textContent).toContain('Interpret function notation');
    // The second and third checks are clamped away until expanded.
    expect(finding.textContent).not.toContain('under time limits');

    const toggle = container.querySelector('[data-testid="evaluate-design-toggle"]');
    expect(toggle).toBeTruthy();
    expect(toggle.textContent).toBe('Show all 3 checks');
    await act(async () => {
      toggle.click();
    });
    const expanded = container.querySelector('[data-evaluate-verdict="finding"]');
    expect(expanded.textContent).toContain('under time limits');
    expect(expanded.textContent).toContain('Verify results with units');
    expect(container.querySelector('[data-testid="evaluate-design-toggle"]').textContent).toBe('Show less');

    // Single-sentence findings stay un-clamped — no toggle noise.
    renderPreview(fixtureCourseMap());
    expect(container.querySelector('[data-evaluate-verdict="finding"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="evaluate-design-toggle"]')).toBeFalsy();
  });

  it('classifyEvaluateDesign tolerates arbitrary text and keeps booleans out of the verdict path', () => {
    expect(classifyEvaluateDesign('Each objective verb (analyze) is exercised by an activity.')).toBe('clean');
    expect(classifyEvaluateDesign('No issues found; alignment intact.')).toBe('clean');
    expect(classifyEvaluateDesign("Objective 'X' has no matching assessment in this section.")).toBe('finding');
    expect(
      classifyEvaluateDesign('No assessment is listed for this section, so its objectives are not measured.'),
    ).toBe('finding');
    expect(classifyEvaluateDesign('Totally custom reviewer text')).toBe('unknown');
    expect(classifyEvaluateDesign(true)).toBe('boolean');
    expect(classifyEvaluateDesign('false')).toBe('boolean');
    expect(classifyEvaluateDesign('')).toBe('empty');
    expect(classifyEvaluateDesign(null)).toBe('empty');
  });

  it('legacy boolean Evaluate Design keeps the checkbox and the onCheckToggle contract', () => {
    const courseMap = fixtureCourseMap();
    courseMap.lessons[0].sections[0].evaluateDesign = true;
    const onCheckToggle = vi.fn();
    renderPreview(courseMap, { onCheckToggle });

    const checkbox = container.querySelector('input[type="checkbox"]');
    expect(checkbox).toBeTruthy();
    expect(checkbox.checked).toBe(true);
    act(() => {
      checkbox.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onCheckToggle).toHaveBeenCalledWith(0, 0);
  });
});

// ── A4 — lesson collapse + density toggle ───────────────────────────────────

describe('A4 — collapse and density', () => {
  it('band toggle collapses section rows, persists per course, resets on course change', () => {
    renderPreview(fixtureCourseMap());

    const toggles = Array.from(container.querySelectorAll('[data-lesson-toggle="true"]'));
    expect(toggles).toHaveLength(2);
    expect(toggles[1].getAttribute('aria-expanded')).toBe('true');

    act(() => {
      toggles[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(sectionLabels()).toEqual(['1.1']);
    const collapsedToggle = Array.from(container.querySelectorAll('[data-lesson-toggle="true"]'))[1];
    expect(collapsedToggle.getAttribute('aria-expanded')).toBe('false');
    expect(Array.from(container.querySelectorAll('[data-lesson-band="true"]'))[1].dataset.lessonCollapsed).toBe('true');

    // Persisted under the view key, keyed by courseName — never the project.
    const stored = JSON.parse(window.localStorage.getItem('coursemapper-map-view'));
    expect(stored.collapse).toEqual({ courseName: 'Physical Geology', lessons: [1] });

    // A different course starts fully expanded.
    renderPreview(fixtureCourseMap({ courseName: 'Other Course' }));
    expect(sectionLabels()).toEqual(['1.1', '2.1', '2.2']);

    // Returning to the saved course restores its collapse set on a fresh mount.
    remount();
    renderPreview(fixtureCourseMap());
    expect(sectionLabels()).toEqual(['1.1']);
  });

  it('density toggle switches the type rhythm and persists outside the project object', () => {
    renderPreview(fixtureCourseMap());

    const compactButton = container.querySelector('[data-density-option="compact"]');
    act(() => {
      compactButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(compactButton.getAttribute('aria-pressed')).toBe('true');
    const cell = container.querySelector('[data-coursemap-cell="true"][data-field-key="learningObjectives"]');
    expect(cell.className).toContain('text-[12px]');
    expect(cell.className).toContain('py-1.5');
    expect(JSON.parse(window.localStorage.getItem('coursemapper-map-view')).density).toBe('compact');

    const comfortableButton = container.querySelector('[data-density-option="comfortable"]');
    act(() => {
      comfortableButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    const cellAfter = container.querySelector('[data-coursemap-cell="true"][data-field-key="learningObjectives"]');
    expect(cellAfter.className).toContain('text-[13px]');
    expect(JSON.parse(window.localStorage.getItem('coursemapper-map-view')).density).toBe('comfortable');
  });

  it('restores the saved density on mount', () => {
    window.localStorage.setItem('coursemapper-map-view', JSON.stringify({ density: 'compact' }));
    renderPreview(fixtureCourseMap());
    expect(container.querySelector('[data-density-option="compact"]').getAttribute('aria-pressed')).toBe('true');
    const cell = container.querySelector('[data-coursemap-cell="true"][data-field-key="learningObjectives"]');
    expect(cell.className).toContain('text-[12px]');
  });
});

// ── Data contract — links and editing keep working inside the new structure ─

describe('contract — quiet links and editing survive the restyle', () => {
  it('assessment links still resolve and dispatch focus-deliverable from inside the bands', () => {
    const displayMap = renderCourseMapFromGraph(deriveCourseGraphFromCourseMap(chipFixtureCourseMap()), {
      assessmentReferences: true,
    });
    renderPreview(displayMap);

    const chips = Array.from(container.querySelectorAll('[data-assessment-chip="true"]'));
    expect(chips.map((chip) => chip.dataset.assessmentId).sort()).toEqual(['A1.1', 'A2.1']);
    // The chip cell sits in a section row BELOW the lesson band.
    expect(chips[0].closest('tr').dataset.lessonBand).toBeUndefined();

    const received = [];
    const listener = (event) => received.push(event.detail);
    window.addEventListener('coursemapper:focus-deliverable', listener);
    try {
      act(() => {
        chips[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
    } finally {
      window.removeEventListener('coursemapper:focus-deliverable', listener);
    }
    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({ featureId: 'assignments', assessmentId: 'A1.1' });

    // resolveAssessmentChip stays exported and behaves (spot check).
    const graph = deriveCourseGraphFromCourseMap(chipFixtureCourseMap());
    const byId = new Map(graph.assessments.map((assessment) => [assessment.id, assessment]));
    const entries = graph.sessions[0].sections[0].assessmentRefs.map((id) => byId.get(id));
    expect(resolveAssessmentChip('Quiz: minerals problems', 0, entries)).toMatchObject({ assessmentId: 'A1.1' });
  });

  it('collapsed lessons hide their link cells but the data is untouched when re-expanded', () => {
    const displayMap = renderCourseMapFromGraph(deriveCourseGraphFromCourseMap(chipFixtureCourseMap()), {
      assessmentReferences: true,
    });
    renderPreview(displayMap);

    const toggle = container.querySelectorAll('[data-lesson-toggle="true"]')[0];
    act(() => {
      toggle.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(
      Array.from(container.querySelectorAll('[data-assessment-chip="true"]')).map((c) => c.dataset.assessmentId),
    ).toEqual(['A2.1']);

    act(() => {
      container
        .querySelectorAll('[data-lesson-toggle="true"]')[0]
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(
      Array.from(container.querySelectorAll('[data-assessment-chip="true"]'))
        .map((c) => c.dataset.assessmentId)
        .sort(),
    ).toEqual(['A1.1', 'A2.1']);
  });

  it('cell editing still works: clicking a cell opens the textarea and saving calls onCellEdit', () => {
    const onCellEdit = vi.fn();
    renderPreview(fixtureCourseMap(), { onCellEdit });

    const goalsCell = container.querySelector('[data-coursemap-cell="true"][data-field-key="learningGoals"]');
    const editableSpan = goalsCell.querySelector('[role="button"]');
    act(() => {
      editableSpan.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const textarea = goalsCell.querySelector('textarea');
    expect(textarea).toBeTruthy();
    act(() => {
      // Native setter so React's value tracking sees the change.
      Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set.call(textarea, 'Edited goal.');
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });
    act(() => {
      textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(onCellEdit).toHaveBeenCalledWith(0, 0, 'learningGoals', 'Edited goal.');
  });
});
