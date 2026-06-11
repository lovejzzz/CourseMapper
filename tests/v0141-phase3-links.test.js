/**
 * @vitest-environment happy-dom
 *
 * v0.14.1 Phase 3 — the linking surfaces on the assessment registry
 * (items 3.4, 3.5, 3.6).
 *
 * 3.4 — the package's course-map XLSX hyperlinks each Weekly Assessments cell
 *       to the deliverable file that fulfills it (relative paths that resolve
 *       when the zip is extracted; the standalone download carries none).
 * 3.5 — in-app click-through: map cells render assessment chips dispatching
 *       'coursemapper:focus-deliverable' (exam → quizBank, graded/oral →
 *       assignments); the focus router switches the tab and DeliverableView
 *       scrolls + highlights; assignment headers carry the reverse
 *       "Show in course map" affordance on the existing focus-coursemap-cell
 *       event.
 * 3.6 — agent addressing: "A7.2" / a registry title resolves to the right
 *       deliverable item and course-map cell through the EXISTING edit paths.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import JSZip from 'jszip';

import { compileBlueprintDeliverables } from '../src/lib/courseBlueprintCompiler';
import {
  buildBlueprintFromGraph,
  deriveCourseGraphFromCourseMap,
  renderCourseMapFromGraph,
} from '../src/lib/courseGraph';
import { buildCourseMaterialsZip } from '../src/lib/packageZipExporter.js';
import { buildXlsxBuffer } from '../src/lib/xlsxGenerator.js';
import CourseMapPreview, { resolveAssessmentChip } from '../src/components/CourseMapPreview.jsx';
import DeliverableView, { parseItemLessonNumber } from '../src/components/DeliverableView.jsx';
import useDeliverableFocusRouter, { FOCUS_SETTLE_MS } from '../src/hooks/useDeliverableFocusRouter.js';
import {
  applyAssessmentAddressing,
  executeAction,
  preValidateAction,
  resolveAssessmentReference,
} from '../src/lib/agentActions';
import { AGENT_TOOLS } from '../src/lib/agentTools';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// ── Fixture: the registry test's geology shape, compacted ───────────────────
// Lessons 1-2 carry weekly quizzes; lesson 3 carries the audit's atom mix
// across two sections — quiz + map activity (7.1-style) and midterm exam +
// in-class sketch (7.2-style).

function geologyCourseMap() {
  return {
    courseName: 'Physical Geology',
    semester: 'Fall 2026',
    lessons: [
      ...['Minerals', 'Igneous Rocks'].map((title, index) => ({
        title: `Lesson ${index + 1}: ${title}`,
        sections: [
          {
            topicSection: `${index + 1}.1: ${title}`,
            learningGoals: `1. Build field-ready understanding of ${title.toLowerCase()}.`,
            learningObjectives: `Analyze ${title.toLowerCase()} using specimen evidence.\nEvaluate how ${title.toLowerCase()} changes a field decision.`,
            weeklyAssessments: `Quiz: ${title.toLowerCase()} problems`,
            asyncActivities: `Read the assigned chapter on ${title.toLowerCase()}.`,
            syncActivities: `Workshop: ${title.toLowerCase()} case analysis.`,
            supportingResources: `OpenStax geology chapter on ${title.toLowerCase()}`,
          },
        ],
      })),
      {
        title: 'Lesson 3: Plate Tectonics and Structural Geology',
        sections: [
          {
            topicSection: '3.1: Plate Boundaries',
            learningGoals: '1. Connect plate boundary types to surface evidence.',
            learningObjectives:
              'Analyze plate boundary evidence from maps and profiles.\nEvaluate boundary classifications against seismic data.',
            weeklyAssessments: 'Quiz: plate boundary evidence\nLab Report: boundary identification',
            asyncActivities: 'Read the plate tectonics chapter.',
            syncActivities: 'Workshop: boundary classification cases.',
            supportingResources: 'OpenStax geology chapter on plate tectonics',
          },
          {
            topicSection: '3.2: Faults and Folds',
            learningGoals: '1. Read deformation structures from outcrop sketches.',
            learningObjectives:
              'Analyze fault and fold geometry from cross-sections.\nEvaluate deformation histories from structural evidence.',
            weeklyAssessments: 'Midterm Exam: minerals through plate tectonics\nGallery walk: fold structures',
            asyncActivities: 'Review structural geology notes.',
            syncActivities: 'Workshop: cross-section interpretation.',
            supportingResources: 'OpenStax geology chapter on crustal deformation',
          },
        ],
      },
    ],
  };
}

function compileFromMap(courseMap) {
  const graph = deriveCourseGraphFromCourseMap(courseMap);
  const blueprint = buildBlueprintFromGraph(graph);
  return { graph, blueprint, compiled: compileBlueprintDeliverables(blueprint, ['assignments', 'quizBank']) };
}

function decodeRelTargets(relsXml) {
  return [...relsXml.matchAll(/Target="([^"]*)"/g)].map(([, target]) =>
    decodeURI(
      target
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>'),
    ),
  );
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ── (1) 3.4 — XLSX hyperlinks in the package, none standalone ──────────────

describe('3.4 — package-context XLSX hyperlinks', () => {
  it('links each assessment cell to the real zip file the manifest names; standalone stays clean', async () => {
    const { graph, compiled } = compileFromMap(geologyCourseMap());
    const displayMap = renderCourseMapFromGraph(graph, { assessmentReferences: true });

    const result = await buildCourseMaterialsZip({
      courseMap: displayMap,
      courseName: 'Physical Geology',
      deliverables: {
        assignments: { status: 'done', data: compiled.assignments },
        quizBank: { status: 'done', data: compiled.quizBank },
      },
      featureIds: ['courseMap', 'assignments', 'quizBank'],
      courseGraph: graph,
    });

    const zip = await JSZip.loadAsync(await result.blob.arrayBuffer());
    const xlsx = await JSZip.loadAsync(
      await zip.file('Course Map/Physical Geology - Course Map.xlsx').async('arraybuffer'),
    );
    const sheet = await xlsx.file('xl/worksheets/sheet1.xml').async('string');
    const rels = await xlsx.file('xl/worksheets/_rels/sheet1.xml.rels').async('string');

    // One hyperlink per linkable cell: lessons 1-2 (1 section each) + lesson 3
    // (two sections — graded section and exam section) = 4 cells.
    const hyperlinkRefs = [...sheet.matchAll(/<hyperlink ref="([A-Z]+\d+)" r:id="(rIdHl\d+)"/g)];
    expect(hyperlinkRefs).toHaveLength(4);
    // All hyperlinks sit in one column (the Weekly Assessments column).
    expect(new Set(hyperlinkRefs.map(([, ref]) => ref.replace(/\d+$/, ''))).size).toBe(1);

    // Relationship targets are external, relative, forward-slashed, and point
    // at files that ACTUALLY exist in this zip — the manifest's own artifact
    // resolution, "../"-prefixed because the xlsx lives in "Course Map/".
    expect(rels).not.toContain('\\');
    expect((rels.match(/TargetMode="External"/g) || []).length).toBeGreaterThan(0);
    const targets = decodeRelTargets(rels);
    for (const target of targets) {
      expect(target.startsWith('../')).toBe(true);
      expect(zip.file(target.slice(3)), `zip is missing hyperlink target ${target}`).toBeTruthy();
    }

    const manifestById = new Map(result.manifest.assessments.map((entry) => [entry.id, entry]));
    // Graded section → the lesson's Assignment Briefs docx.
    expect(targets).toContain(`../${manifestById.get('A1.1').artifact}`);
    expect(targets).toContain(`../${manifestById.get('A3.1').artifact}`);
    // Exam section (exam + in-class only) → the lesson's Quiz & Exam Bank docx.
    expect(manifestById.get('A3.3').kind).toBe('exam');
    expect(targets).toContain(`../${manifestById.get('A3.3').artifact}`);
    expect(targets.some((target) => target.includes('Quiz & Exam Bank'))).toBe(true);

    // The standalone course-map download (no package context) must carry no
    // dead links: no hyperlinks block, no sheet rels part.
    const standalone = await JSZip.loadAsync(await buildXlsxBuffer(displayMap, []));
    expect(await standalone.file('xl/worksheets/sheet1.xml').async('string')).not.toContain('<hyperlink');
    expect(standalone.file('xl/worksheets/_rels/sheet1.xml.rels')).toBeFalsy();
  }, 120000);

  it('only links features that are actually in the package', async () => {
    const courseMap = renderCourseMapFromGraph(deriveCourseGraphFromCourseMap(geologyCourseMap()), {
      assessmentReferences: true,
    });
    // Quiz bank only: graded sections must NOT link to absent brief files;
    // the exam cell still links.
    const xlsx = await JSZip.loadAsync(
      await buildXlsxBuffer(courseMap, [], { packageLinks: { featureIds: ['quizBank'] } }),
    );
    const rels = await xlsx.file('xl/worksheets/_rels/sheet1.xml.rels').async('string');
    const targets = decodeRelTargets(rels);
    expect(targets).toHaveLength(1);
    expect(targets[0]).toContain('Quiz & Exam Bank');
    expect(targets.some((target) => target.includes('Assignment Briefs'))).toBe(false);
  });
});

// ── (2) 3.5 — assessment chips in CourseMapPreview ──────────────────────────

describe('3.5 — CourseMapPreview assessment chips', () => {
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

  function renderPreview(courseMap) {
    act(() => {
      root.render(
        React.createElement(CourseMapPreview, {
          courseMap,
          columns: null,
          isStreaming: false,
          onCellEdit: () => {},
        }),
      );
    });
  }

  it('renders a chip per linkable line and dispatches focus-deliverable with the registry identity', () => {
    const displayMap = renderCourseMapFromGraph(deriveCourseGraphFromCourseMap(geologyCourseMap()), {
      assessmentReferences: true,
    });
    renderPreview(displayMap);

    const chips = Array.from(container.querySelectorAll('[data-assessment-chip="true"]'));
    // A1.1, A2.1, A3.1, A3.2 (graded) + A3.3 (exam); A3.4 is in-class → plain.
    expect(chips.map((chip) => chip.dataset.assessmentId).sort()).toEqual(
      ['A1.1', 'A2.1', 'A3.1', 'A3.2', 'A3.3'].sort(),
    );
    // The in-class line renders, but not as a chip.
    expect(container.textContent).toContain('Gallery walk: fold structures');

    const received = [];
    const listener = (event) => received.push(event.detail);
    window.addEventListener('coursemapper:focus-deliverable', listener);
    try {
      const examChip = chips.find((chip) => chip.dataset.assessmentId === 'A3.3');
      const quizChip = chips.find((chip) => chip.dataset.assessmentId === 'A1.1');
      act(() => {
        examChip.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        quizChip.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
    } finally {
      window.removeEventListener('coursemapper:focus-deliverable', listener);
    }

    // Exam kind routes to the quiz bank; graded to assignment briefs.
    expect(received).toEqual([
      {
        featureId: 'quizBank',
        lessonNumber: 3,
        assessmentId: 'A3.3',
        title: 'Midterm Exam: minerals through plate tectonics',
      },
      {
        featureId: 'assignments',
        lessonNumber: 1,
        assessmentId: 'A1.1',
        title: 'Quiz: minerals problems',
      },
    ]);
  });

  it('resolveAssessmentChip matches by position, falls back to title, skips in-class', () => {
    const graph = deriveCourseGraphFromCourseMap(geologyCourseMap());
    const byId = new Map(graph.assessments.map((assessment) => [assessment.id, assessment]));
    const entries = graph.sessions[2].sections[1].assessmentRefs.map((id) => byId.get(id));

    expect(
      resolveAssessmentChip('1. Midterm Exam: minerals through plate tectonics → Quiz & Exam Bank', 0, entries),
    ).toMatchObject({ featureId: 'quizBank', assessmentId: 'A3.3' });
    // Reordered line still resolves through the exact-title fallback.
    expect(resolveAssessmentChip('Midterm Exam: minerals through plate tectonics', 1, entries)).toMatchObject({
      assessmentId: 'A3.3',
    });
    // In-class entries never become chips.
    expect(resolveAssessmentChip('2. Gallery walk: fold structures', 1, entries)).toBeNull();
    expect(resolveAssessmentChip('anything', 0, [])).toBeNull();
  });
});

// ── (3) 3.5 — the focus router and DeliverableView's listener ───────────────

describe('3.5 — focus routing and DeliverableView scroll/highlight', () => {
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

  function Harness(props) {
    useDeliverableFocusRouter(props);
    return null;
  }

  it('router switches the tab, then re-dispatches focus-deliverable-item after the settle delay', async () => {
    const setActiveTab = vi.fn();
    const setMobileWorkspaceView = vi.fn();
    act(() => {
      root.render(
        React.createElement(Harness, {
          activeTab: 'courseMap',
          setActiveTab,
          setMobileWorkspaceView,
          focusCourseMapTarget: vi.fn(),
        }),
      );
    });

    const itemEvents = [];
    const listener = (event) => itemEvents.push(event.detail);
    window.addEventListener('coursemapper:focus-deliverable-item', listener);
    try {
      const detail = { featureId: 'assignments', lessonNumber: 3, assessmentId: 'A3.1', title: 'Quiz' };
      act(() => {
        window.dispatchEvent(new CustomEvent('coursemapper:focus-deliverable', { detail }));
      });
      expect(setActiveTab).toHaveBeenCalledWith('assignments');
      expect(setMobileWorkspaceView).toHaveBeenCalledWith('content');
      expect(itemEvents).toHaveLength(0); // not before the tab settles
      await sleep(FOCUS_SETTLE_MS + 80);
      expect(itemEvents).toEqual([detail]);
    } finally {
      window.removeEventListener('coursemapper:focus-deliverable-item', listener);
    }
  });

  it('router reroutes focus-coursemap-cell through focusCourseMapTarget only while the map tab is hidden', () => {
    const focusCourseMapTarget = vi.fn();
    const renderWithTab = (activeTab) =>
      act(() => {
        root.render(
          React.createElement(Harness, {
            activeTab,
            setActiveTab: vi.fn(),
            setMobileWorkspaceView: vi.fn(),
            focusCourseMapTarget,
          }),
        );
      });

    const target = { type: 'courseMapCell', lessonIndex: 2, sectionIndex: 1, field: 'weeklyAssessments' };
    renderWithTab('assignments');
    act(() => {
      window.dispatchEvent(new CustomEvent('coursemapper:focus-coursemap-cell', { detail: target }));
    });
    expect(focusCourseMapTarget).toHaveBeenCalledTimes(1);
    expect(focusCourseMapTarget).toHaveBeenCalledWith(target);

    // On the map tab the preview's own listener handles it — no reroute loop.
    renderWithTab('courseMap');
    act(() => {
      window.dispatchEvent(new CustomEvent('coursemapper:focus-coursemap-cell', { detail: target }));
    });
    expect(focusCourseMapTarget).toHaveBeenCalledTimes(1);
  });

  it('DeliverableView scrolls to and highlights the matching anchor; assignment headers dispatch the reverse event', async () => {
    const displayMap = renderCourseMapFromGraph(deriveCourseGraphFromCourseMap(geologyCourseMap()), {
      assessmentReferences: true,
    });
    const scrollSpy = vi.fn();
    Element.prototype.scrollIntoView = scrollSpy;

    const data = {
      assignments: [
        { title: 'Quiz: minerals problems', assessmentId: 'A1.1', dueWeek: 'Week 1', overview: 'Weekly quiz.' },
        {
          title: 'Lab Report: boundary identification',
          assessmentId: 'A3.2',
          dueWeek: 'Week 3',
          overview: 'Identify boundaries.',
        },
      ],
    };
    act(() => {
      root.render(
        React.createElement(DeliverableView, {
          featureId: 'assignments',
          data,
          status: 'done',
          courseMap: displayMap,
          onDataChange: () => {},
        }),
      );
    });

    const anchors = Array.from(container.querySelectorAll('[data-assessment-anchor="true"]'));
    expect(anchors).toHaveLength(2);
    expect(anchors[1].dataset.assessmentId).toBe('A3.2');
    expect(parseItemLessonNumber(data.assignments[1])).toBe(3);

    await act(async () => {
      window.dispatchEvent(
        new CustomEvent('coursemapper:focus-deliverable-item', {
          detail: {
            featureId: 'assignments',
            lessonNumber: 3,
            assessmentId: 'A3.2',
            title: 'Lab Report: boundary identification',
          },
        }),
      );
      await sleep(220);
    });
    expect(scrollSpy).toHaveBeenCalled();
    expect(anchors[1].classList.contains('ring-2')).toBe(true);
    expect(anchors[0].classList.contains('ring-2')).toBe(false);

    // Mismatched feature ids are ignored.
    scrollSpy.mockClear();
    await act(async () => {
      window.dispatchEvent(
        new CustomEvent('coursemapper:focus-deliverable-item', {
          detail: { featureId: 'quizBank', lessonNumber: 3 },
        }),
      );
      await sleep(180);
    });
    expect(scrollSpy).not.toHaveBeenCalled();

    // Reverse: "Show in course map" dispatches the EXISTING event with the
    // owning Weekly Assessments cell coordinates (lesson 3, section 0 carries
    // the lab report line).
    const received = [];
    const listener = (event) => received.push(event.detail);
    window.addEventListener('coursemapper:focus-coursemap-cell', listener);
    try {
      const buttons = Array.from(container.querySelectorAll('[data-show-in-coursemap="true"]'));
      expect(buttons.length).toBeGreaterThanOrEqual(1);
      act(() => {
        buttons[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
    } finally {
      window.removeEventListener('coursemapper:focus-coursemap-cell', listener);
    }
    expect(received).toEqual([{ type: 'courseMapCell', lessonIndex: 2, sectionIndex: 0, field: 'weeklyAssessments' }]);
  });
});

// ── (4) 3.6 — agent addressing by registry id / title ───────────────────────

describe('3.6 — agent addressing resolves "A7.2"-style references', () => {
  const courseMap = renderCourseMapFromGraph(deriveCourseGraphFromCourseMap(geologyCourseMap()), {
    assessmentReferences: true,
  });

  const makeDeliverables = () => ({
    assignments: {
      status: 'done',
      data: {
        assignments: [
          { title: 'Quiz: minerals problems', assessmentId: 'A1.1', overview: 'Weekly quiz.' },
          { title: 'Quiz: igneous rocks problems', assessmentId: 'A2.1', overview: 'Weekly quiz.' },
          { title: 'Quiz: plate boundary evidence', assessmentId: 'A3.1', overview: 'Weekly quiz.' },
          { title: 'Lab Report: boundary identification', assessmentId: 'A3.2', overview: 'Lab brief.' },
        ],
      },
    },
    quizBank: {
      status: 'done',
      data: {
        quizzes: [
          { lessonTitle: 'Lesson 1: Minerals', questions: [] },
          { lessonTitle: 'Lesson 2: Igneous Rocks', questions: [] },
          {
            lessonTitle: 'Midterm Exam — minerals through plate tectonics',
            lessonNumber: 3,
            assessmentId: 'A3.3',
            questions: [],
          },
        ],
      },
    },
  });

  it('resolveAssessmentReference maps id and title to the owning cell and feature', () => {
    const byId = resolveAssessmentReference('A3.3', { courseMap });
    expect(byId.assessment.title).toBe('Midterm Exam: minerals through plate tectonics');
    expect(byId.courseMapTarget).toEqual({ lessonIndex: 2, sectionIndex: 1, field: 'weeklyAssessments' });
    expect(byId.deliverableFeatureId).toBe('quizBank');

    const byTitle = resolveAssessmentReference('Lab Report: boundary identification', { courseMap });
    expect(byTitle.assessment.id).toBe('A3.2');
    expect(byTitle.courseMapTarget).toEqual({ lessonIndex: 2, sectionIndex: 0, field: 'weeklyAssessments' });
    expect(byTitle.deliverableFeatureId).toBe('assignments');

    // In-class entries have no downstream artifact, only a cell.
    const inClass = resolveAssessmentReference('A3.4', { courseMap });
    expect(inClass.deliverableFeatureId).toBeNull();

    // Unknown / ambiguous references resolve to nothing instead of guessing.
    expect(resolveAssessmentReference('A9.9', { courseMap })).toBeNull();
    expect(resolveAssessmentReference('Quiz', { courseMap })).toBeNull();
  });

  it('editItem naming an assessmentId resolves to the assignments array index', () => {
    const deliverables = makeDeliverables();
    let updated = null;
    const ctx = {
      courseMap,
      deliverables,
      optimisticUpdate: (featureId, data) => {
        updated = { featureId, data };
      },
    };

    const action = { type: 'editItem', assessmentId: 'A3.2', field: 'overview', value: 'Sharper lab brief.' };
    expect(applyAssessmentAddressing(action, ctx)).toMatchObject({
      featureId: 'assignments',
      path: ['assignments', 3, 'overview'],
    });
    expect(preValidateAction(action, ctx).valid).toBe(true);

    const result = executeAction(action, ctx);
    expect(result.success).toBe(true);
    expect(updated.featureId).toBe('assignments');
    expect(updated.data.assignments[3].overview).toBe('Sharper lab brief.');
    expect(updated.data.assignments[2].overview).toBe('Weekly quiz.'); // untouched neighbor
  });

  it('removeItem by id resolves the flat assignments index; exam ids resolve the quizBank lesson entry', () => {
    const deliverables = makeDeliverables();
    let updated = null;
    const ctx = {
      courseMap,
      deliverables,
      optimisticUpdate: (featureId, data) => {
        updated = { featureId, data };
      },
    };

    const removal = executeAction({ type: 'removeItem', assessmentId: 'A3.2' }, ctx);
    expect(removal.success).toBe(true);
    expect(updated.data.assignments.map((item) => item.assessmentId)).toEqual(['A1.1', 'A2.1', 'A3.1']);

    // Exam reference → quizBank lesson entry (Phase 3a reverse stamp wins).
    const exam = applyAssessmentAddressing({ type: 'replaceItem', assessmentId: 'A3.3', item: { kind: 'exam' } }, ctx);
    expect(exam.featureId).toBe('quizBank');
    expect(exam.lessonIndex).toBe(2);
  });

  it('edit_course_map patches address the weeklyAssessments cell by registry reference', () => {
    const executed = [];
    const ctx = {
      courseMap,
      columns: [],
      executeAction: (action) => {
        executed.push(action);
        return { success: true, message: 'ok' };
      },
    };
    const result = AGENT_TOOLS.edit_course_map.execute(
      {
        patches: [
          {
            assessmentId: 'A3.3',
            value: 'Midterm Exam: minerals through plate tectonics (take-home)',
          },
        ],
      },
      ctx,
    );
    expect(result.applied).toBe(1);
    expect(result.failed).toBe(0);
    expect(executed).toHaveLength(1);
    expect(executed[0]).toMatchObject({
      type: 'editCell',
      lessonIndex: 2,
      sectionIndex: 1,
      field: 'weeklyAssessments',
    });
  });
});
