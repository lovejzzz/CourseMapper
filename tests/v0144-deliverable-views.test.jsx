/**
 * @vitest-environment happy-dom
 *
 * v0.14.4 WS-D — deliverable views at registry scale (items D1-D3).
 *
 * D1 — assignments and rubrics group by lesson: sticky group headers
 *      ("Lesson 7 — <title>", count chip), registry identity line on every
 *      card (id · kind · weight + the courseMapRef stamp), a jump-nav rail
 *      (L1…L13 + Ungrouped), tolerant grouping fallback, and an "Ungrouped"
 *      tail that never drops items. Rubric cards link to their brief.
 * D2 — exam entries in the Quiz & Exam Bank stand out: indigo-bordered shell,
 *      "Exam" chip, the examScope "Covers Lessons…" line, presentation-only
 *      reorder (exam right after its lesson's weekly quiz), and a visually
 *      separated answer-key section.
 * D3 — round-trip: "Show in course map" extends to exam entries and rubric
 *      cards on the EXISTING focus-coursemap-cell contract; rubric "View
 *      brief" rides the focus-deliverable router. The v0.14.1 (3.5)
 *      focus-deliverable-item scroll/highlight keeps working inside groups.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

import DeliverableView from '../src/components/DeliverableView.jsx';
import AssignmentsView from '../src/components/deliverables/AssignmentsView.jsx';
import {
  UNGROUPED_KEY,
  groupItemsByLesson,
  lessonTitleForNumber,
  parseLessonNumberFromText,
  quizPresentationOrder,
  resolveLessonNumber,
} from '../src/components/deliverables/shared/lessonGrouping.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ── Fixtures ─────────────────────────────────────────────────────────────────

// 13-lesson course map; lesson 2 carries the exam line in a second section so
// the show-in-map probes have a real cell to resolve.
function thirteenLessonCourseMap() {
  return {
    courseName: 'Probability & Statistics for Engineers',
    semester: 'Fall 2026',
    lessons: Array.from({ length: 13 }, (_, index) => {
      const n = index + 1;
      const sections = [
        {
          topicSection: `${n}.1: Topic ${n}`,
          learningGoals: `1. Reason about topic ${n}.`,
          learningObjectives: `Analyze topic ${n} with course data.`,
          weeklyAssessments: `Brief L${n}.1\nBrief L${n}.2\nQuiz: topic ${n} problems`,
          asyncActivities: `Read the chapter on topic ${n}.`,
          syncActivities: `Workshop: topic ${n}.`,
          supportingResources: `OpenStax chapter on topic ${n}`,
        },
      ];
      if (n === 2) {
        sections.push({
          topicSection: '2.2: Review',
          learningGoals: '1. Consolidate the covered range.',
          learningObjectives: 'Synthesize lessons 1–2.',
          weeklyAssessments: 'Midterm Exam: topic checks\nGallery walk: topic posters',
          asyncActivities: 'Review notes.',
          syncActivities: 'Exam session.',
          supportingResources: 'Course review packet',
        });
      }
      return { title: `Lesson ${n}: Topic ${n}`, sections };
    }),
  };
}

// 51 briefs at registry scale: 13 lessons × ~4 (lesson 13 keeps one), one
// title-only "Week 9" item exercising the tolerant fallback, and two orphans
// that resolve nowhere (the Ungrouped tail).
function registryAssignmentsFixture() {
  const assignments = [];
  for (let n = 1; n <= 12; n += 1) {
    for (let k = 1; k <= 4; k += 1) {
      assignments.push({
        title: `Brief L${n}.${k}`,
        assessmentId: `A${n}.${k}`,
        lessonNumber: n,
        courseMapRef: `Course Map L${n} · A${n}.${k} · 5%`,
        dueWeek: `Week ${n}`,
        weightPercent: 5,
        percentOfGrade: '5%',
        assignmentType: 'Checkpoint response',
        overview: `Registry brief ${n}.${k}.`,
      });
    }
  }
  assignments.push({ title: 'Brief L13.1', assessmentId: 'A13.1', lessonNumber: 13, percentOfGrade: '4%' });
  // Tolerant fallback: no lessonNumber, no dueWeek — only the title names it.
  assignments.push({ title: 'Week 9 Reflection Memo', overview: 'Title-only lesson reference.' });
  // The Ungrouped tail — never dropped.
  assignments.push({ title: 'Orphan brief one', overview: 'No lesson reference at all.' });
  assignments.push({ title: 'Orphan brief two', overview: 'Also unresolvable.' });
  return { assignments };
}

function rubricsFixture() {
  return {
    rubrics: [
      {
        title: 'Brief L1.1 Rubric',
        assessmentId: 'A1.1',
        lessonNumber: 1,
        lessonTitle: 'Lesson 1: Topic 1',
        gradedWork: 'Brief L1.1',
        assessmentType: 'Assignment',
        weightPercent: 5,
        percentOfGrade: '5%',
        totalPoints: 100,
        criteria: [
          {
            criterion: 'Evidence',
            weight: 50,
            points: 50,
            excellent: 'Strong',
            proficient: 'Good',
            developing: 'Thin',
            beginning: 'Missing',
          },
        ],
      },
      {
        title: 'Brief L2.1 Rubric',
        assessmentId: 'A2.1',
        lessonNumber: 2,
        lessonTitle: 'Lesson 2: Topic 2',
        gradedWork: 'Brief L2.1',
        assessmentType: 'Assignment',
        percentOfGrade: '5%',
        criteria: [],
      },
      // Legacy rubric with no registry identity and no lesson reference.
      { title: 'Participation Rubric', gradedWork: 'Discussion participation', criteria: [] },
    ],
  };
}

// Two weekly quizzes + one exam appended LAST by the compiler (its lesson is
// 1, so presentation must move it between the two weeklies).
function quizBankFixture() {
  return {
    quizzes: [
      {
        lessonTitle: 'Lesson 1: Topic 1',
        questions: [{ question: 'Weekly Q1?', type: 'multiple_choice', options: ['A) x', 'B) y'], answer: 'A' }],
      },
      {
        lessonTitle: 'Lesson 2: Topic 2',
        questions: [{ question: 'Weekly Q2?', type: 'multiple_choice', options: ['A) x', 'B) y'], answer: 'B' }],
      },
      {
        lessonTitle: 'Midterm Exam — topic checks',
        kind: 'exam',
        assessmentId: 'A2.9',
        lessonNumber: 1,
        examScope: 'Covers Lessons 1–2: Topic 1 through Topic 2.',
        totalPoints: 22,
        questions: [
          { question: 'Exam Q1?', type: 'multiple_choice', options: ['A) x', 'B) y'], answer: 'D' },
          { question: 'Exam essay?', type: 'essay', rubricHints: 'Synthesis across lessons.' },
        ],
        answerKey: [
          { question: 1, type: 'multiple_choice', answer: 'D' },
          { question: 2, type: 'essay', answer: 'Synthesis across lessons.' },
        ],
      },
    ],
  };
}

// ── Pure grouping helpers ────────────────────────────────────────────────────

describe('D1 — lessonGrouping helpers', () => {
  it('resolveLessonNumber prefers explicit lessonNumber, falls back through text probes to the title', () => {
    expect(resolveLessonNumber({ lessonNumber: 7, title: 'Lesson 2: decoy' })).toBe(7);
    expect(resolveLessonNumber({ dueWeek: 'Week 4' })).toBe(4);
    expect(resolveLessonNumber({ lessonTitle: 'Lesson 11: Sampling' })).toBe(11);
    expect(resolveLessonNumber({ title: 'Week 9 Reflection Memo' })).toBe(9);
    expect(resolveLessonNumber({ relatedLessons: ['Lesson 3: Topic 3'] })).toBe(3);
    expect(resolveLessonNumber({ title: 'Orphan brief' })).toBeNull();
    expect(parseLessonNumberFromText('covers Lesson 12 only')).toBe(12);
  });

  it('groupItemsByLesson sorts lessons ascending, keeps original indices, and never drops items', () => {
    const { assignments } = registryAssignmentsFixture();
    const groups = groupItemsByLesson(assignments);

    // 13 lesson groups + the Ungrouped tail.
    expect(groups).toHaveLength(14);
    expect(groups.map((group) => group.lessonNumber).slice(0, 13)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
    expect(groups[13].key).toBe(UNGROUPED_KEY);
    expect(groups[13].lessonNumber).toBeNull();
    expect(groups[13].items.map(({ item }) => item.title)).toEqual(['Orphan brief one', 'Orphan brief two']);

    // The title-only "Week 9" memo grouped into lesson 9 (tolerant fallback).
    const lesson9 = groups.find((group) => group.lessonNumber === 9);
    expect(lesson9.items.map(({ item }) => item.title)).toContain('Week 9 Reflection Memo');

    // Zero items dropped; every original index appears exactly once.
    const indices = groups.flatMap((group) => group.items.map(({ index }) => index)).sort((a, b) => a - b);
    expect(indices).toHaveLength(assignments.length);
    expect(indices).toEqual(Array.from({ length: assignments.length }, (_, i) => i));
  });

  it('lessonTitleForNumber strips the lesson prefix from the course map title', () => {
    const courseMap = thirteenLessonCourseMap();
    expect(lessonTitleForNumber(courseMap, 7)).toBe('Topic 7');
    expect(lessonTitleForNumber(courseMap, null)).toBe('');
    expect(lessonTitleForNumber(courseMap, 99)).toBe('');
  });

  it('quizPresentationOrder slots exams after their own lesson weekly quiz without touching indices', () => {
    const { quizzes } = quizBankFixture();
    const ordered = quizPresentationOrder(quizzes, (quiz, index) => {
      if (Number.isInteger(quiz?.lessonNumber)) return quiz.lessonNumber;
      const parsed = parseLessonNumberFromText(quiz?.lessonTitle);
      return parsed ?? index + 1;
    });
    expect(ordered.map(({ item }) => item.lessonTitle)).toEqual([
      'Lesson 1: Topic 1',
      'Midterm Exam — topic checks',
      'Lesson 2: Topic 2',
    ]);
    // Presentation only — original indices ride along for edit paths.
    expect(ordered.map(({ index }) => index)).toEqual([0, 2, 1]);
  });
});

// ── Component tests ──────────────────────────────────────────────────────────

describe('WS-D — deliverable views at registry scale', () => {
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

  function renderDeliverable(featureId, data, extraProps = {}) {
    act(() => {
      root.render(
        React.createElement(DeliverableView, {
          featureId,
          data,
          status: 'done',
          courseMap: thirteenLessonCourseMap(),
          onDataChange: () => {},
          ...extraProps,
        }),
      );
    });
  }

  it('uses the same array-valid authority as export when the canonical lesson-plan root is malformed', () => {
    renderDeliverable('lessonPlans', {
      lessonPlans: { malformed: true },
      lessons: [
        {
          lessonTitle: 'Alias plan that is actually rendered',
          objectives: ['Use the valid lesson-plan alias.'],
          outline: [],
        },
      ],
    });

    expect(container.textContent).toContain('Alias plan that is actually rendered');
  });

  it('renders canonical roots across aliased deliverable views when stale aliases coexist', () => {
    renderDeliverable('lessonPlans', {
      lessonPlans: [{ lessonTitle: 'Canonical lesson plan', objectives: [], outline: [] }],
      plans: [{ lessonTitle: 'Stale lesson plan' }],
    });
    expect(container.textContent).toContain('Canonical lesson plan');
    expect(container.textContent).not.toContain('Stale lesson plan');

    renderDeliverable('quizBank', {
      quizBank: [{ lessonTitle: 'Canonical quiz', questions: [] }],
      quizzes: [{ lessonTitle: 'Stale quiz', questions: [] }],
    });
    expect(container.textContent).toContain('Canonical quiz');
    expect(container.textContent).not.toContain('Stale quiz');

    renderDeliverable('courseFaq', {
      courseFaq: [
        {
          lessonTitle: 'Canonical FAQ lesson',
          questions: [
            {
              question: 'Which FAQ is authoritative?',
              answer: 'The canonical FAQ.',
              category: 'Course Logistics',
            },
          ],
        },
      ],
      faqs: [
        {
          lessonTitle: 'Stale FAQ lesson',
          questions: [{ question: 'Stale question', answer: 'Stale answer', category: 'General' }],
        },
      ],
    });
    expect(container.textContent).toContain('Canonical FAQ lesson');
    expect(container.textContent).toContain('Which FAQ is authoritative?');
    expect(container.textContent).not.toContain('Stale FAQ lesson');

    renderDeliverable('slideDecks', {
      slideDecks: [
        {
          lessonTitle: 'Canonical slide deck',
          slides: [{ title: 'Canonical slide title', type: 'content', bullets: ['Canonical slide bullet'] }],
        },
      ],
      decks: [
        {
          lessonTitle: 'Stale slide deck',
          slides: [{ title: 'Stale slide title', type: 'content', bullets: ['Stale slide bullet'] }],
        },
      ],
    });
    expect(container.textContent).toContain('Canonical slide title');
    expect(container.textContent).not.toContain('Stale slide title');

    renderDeliverable('studyGuides', {
      studyGuides: [{ lessonTitle: 'Canonical study guide', summary: 'Canonical guide summary.' }],
      guides: [{ lessonTitle: 'Stale study guide', summary: 'Stale guide summary.' }],
    });
    expect(container.textContent).toContain('Canonical study guide');
    expect(container.textContent).not.toContain('Stale study guide');
  });

  it('writes title edits back through the authoritative lesson-plan root', () => {
    const onDataChange = vi.fn();
    renderDeliverable(
      'lessonPlans',
      {
        lessonPlans: [{ lessonTitle: 'Canonical editable plan', objectives: [], outline: [] }],
        plans: [{ lessonTitle: 'Stale plan' }],
      },
      { onDataChange },
    );

    const title = container.querySelector('.deliverable-editable-title');
    expect(title).not.toBeNull();
    act(() => title.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })));
    const input = container.querySelector('input');
    expect(input).not.toBeNull();
    const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    act(() => {
      valueSetter.call(input, 'Edited canonical plan');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    });

    expect(onDataChange).toHaveBeenCalledWith(
      expect.objectContaining({
        lessonPlans: [expect.objectContaining({ lessonTitle: 'Edited canonical plan' })],
        plans: [{ lessonTitle: 'Stale plan' }],
      }),
      ['lessonPlans', 0, 'lessonTitle'],
    );
  });

  it('D1 — assignments render 51 items in lesson groups with sticky headers, counts, and an Ungrouped tail', () => {
    const data = registryAssignmentsFixture();
    expect(data.assignments).toHaveLength(52);
    renderDeliverable('assignments', data);

    // Every item renders — grouping never drops.
    const anchors = container.querySelectorAll('[data-assessment-anchor="true"]');
    expect(anchors).toHaveLength(52);

    const headers = Array.from(container.querySelectorAll('[data-lesson-group-header]'));
    expect(headers).toHaveLength(14);
    expect(headers[0].textContent).toContain('Lesson 1 — Topic 1');
    expect(headers[6].textContent).toContain('Lesson 7 — Topic 7');
    expect(headers[13].textContent).toContain('Ungrouped');
    // Sticky chrome (the rail pins above, headers below it).
    headers.forEach((header) => expect(header.className).toContain('sticky'));

    // Count chips: lesson 1 has 4 briefs, lesson 9 has 4 + the Week-9 memo,
    // lesson 13 has 1, the tail has the 2 orphans.
    const countOf = (header) => header.querySelector('[data-group-count="true"]').textContent;
    expect(countOf(headers[0])).toBe('4');
    expect(countOf(headers[8])).toBe('5');
    expect(countOf(headers[12])).toBe('1');
    expect(countOf(headers[13])).toBe('2');

    // Group sections wrap their items: lesson 9 contains the fallback memo.
    const lesson9Section = container.querySelector('[data-lesson-group="lesson-9"]');
    expect(lesson9Section.textContent).toContain('Week 9 Reflection Memo');
  });

  it('D1 — registry identity lines carry id · kind · weight and the courseMapRef stamp', () => {
    renderDeliverable('assignments', registryAssignmentsFixture());

    const identityLines = Array.from(container.querySelectorAll('[data-registry-identity="true"]'));
    // One per registry brief (the orphans and the Week-9 memo have no identity fields).
    expect(identityLines).toHaveLength(49);
    expect(identityLines[0].textContent).toContain('A1.1 · Checkpoint response · 5%');
    expect(identityLines[0].textContent).toContain('Course Map L1 · A1.1 · 5%');
  });

  it('D1 — the jump rail scrolls to its lesson group', () => {
    const scrollSpy = vi.fn();
    Element.prototype.scrollIntoView = scrollSpy;
    renderDeliverable('assignments', registryAssignmentsFixture());

    const rail = container.querySelector('[data-jump-nav-rail="true"]');
    expect(rail).toBeTruthy();
    const buttons = Array.from(rail.querySelectorAll('[data-jump-nav]'));
    expect(buttons.map((button) => button.textContent)).toEqual([
      'L1',
      'L2',
      'L3',
      'L4',
      'L5',
      'L6',
      'L7',
      'L8',
      'L9',
      'L10',
      'L11',
      'L12',
      'L13',
      'Ungrouped',
    ]);

    act(() => {
      buttons
        .find((button) => button.dataset.jumpNav === 'lesson-7')
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(scrollSpy).toHaveBeenCalledTimes(1);
    // The scroll target is the lesson 7 group header itself.
    const target = scrollSpy.mock.instances?.[0] || scrollSpy.mock.contexts?.[0];
    expect(target?.dataset?.lessonGroupHeader).toBe('lesson-7');
  });

  it('D1/3.5 — focus-deliverable-item still scrolls + highlights the right anchor inside a group', async () => {
    const scrollSpy = vi.fn();
    Element.prototype.scrollIntoView = scrollSpy;
    renderDeliverable('assignments', registryAssignmentsFixture());

    await act(async () => {
      window.dispatchEvent(
        new CustomEvent('coursemapper:focus-deliverable-item', {
          detail: { featureId: 'assignments', lessonNumber: 7, assessmentId: 'A7.2', title: 'Brief L7.2' },
        }),
      );
      await sleep(220);
    });

    expect(scrollSpy).toHaveBeenCalled();
    const highlighted = Array.from(container.querySelectorAll('[data-assessment-anchor="true"]')).filter((anchor) =>
      anchor.classList.contains('ring-2'),
    );
    expect(highlighted).toHaveLength(1);
    expect(highlighted[0].dataset.assessmentId).toBe('A7.2');
  });

  it('D1 — rubrics group by lesson with identity lines and an ungrouped tail', () => {
    renderDeliverable('rubrics', rubricsFixture());

    const headers = Array.from(container.querySelectorAll('[data-lesson-group-header]'));
    expect(headers.map((header) => header.dataset.lessonGroupHeader)).toEqual(['lesson-1', 'lesson-2', UNGROUPED_KEY]);
    expect(headers[0].textContent).toContain('Lesson 1 — Topic 1');

    const rail = container.querySelector('[data-jump-nav-rail="true"]');
    expect(rail).toBeTruthy();

    const identityLines = Array.from(container.querySelectorAll('[data-registry-identity="true"]'));
    expect(identityLines).toHaveLength(2);
    expect(identityLines[0].textContent).toBe('A1.1 · Assignment · 5%');

    // Anchors make rubric cards addressable too; the legacy rubric is kept.
    const anchors = container.querySelectorAll('[data-assessment-anchor="true"]');
    expect(anchors).toHaveLength(3);
  });

  it('D1/D3 — rubric "View brief" dispatches focus-deliverable with the brief identity', () => {
    renderDeliverable('rubrics', rubricsFixture());

    const received = [];
    const listener = (event) => received.push(event.detail);
    window.addEventListener('coursemapper:focus-deliverable', listener);
    try {
      const briefButtons = Array.from(container.querySelectorAll('[data-view-brief="true"]'));
      expect(briefButtons.length).toBeGreaterThanOrEqual(2);
      act(() => {
        briefButtons[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
    } finally {
      window.removeEventListener('coursemapper:focus-deliverable', listener);
    }

    expect(received).toEqual([
      { featureId: 'assignments', assessmentId: 'A1.1', lessonNumber: 1, title: 'Brief L1.1' },
    ]);
  });

  it('D3 — rubric "Show in course map" dispatches the existing cell event with exact coordinates', () => {
    renderDeliverable('rubrics', rubricsFixture());

    const received = [];
    const listener = (event) => received.push(event.detail);
    window.addEventListener('coursemapper:focus-coursemap-cell', listener);
    try {
      const buttons = Array.from(container.querySelectorAll('[data-show-in-coursemap="true"]'));
      expect(buttons.length).toBeGreaterThanOrEqual(2);
      act(() => {
        buttons[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
    } finally {
      window.removeEventListener('coursemapper:focus-coursemap-cell', listener);
    }

    // "Brief L1.1" lives in lesson 1's only section.
    expect(received).toEqual([{ type: 'courseMapCell', lessonIndex: 0, sectionIndex: 0, field: 'weeklyAssessments' }]);
  });

  it('D2 — exam entries stand out, sit after their lesson weekly quiz, and separate the answer key', () => {
    renderDeliverable('quizBank', quizBankFixture());

    // Presentation order: L1 weekly → exam (lesson 1) → L2 weekly, even
    // though the compiler appended the exam last.
    const anchors = Array.from(container.querySelectorAll('[data-assessment-anchor="true"]'));
    expect(anchors.map((anchor) => anchor.dataset.assessmentTitle)).toEqual([
      'Lesson 1: Topic 1',
      'Midterm Exam — topic checks',
      'Lesson 2: Topic 2',
    ]);

    // Exactly one exam shell — weeklies carry no exam chrome.
    const examEntries = container.querySelectorAll('[data-exam-entry="true"]');
    expect(examEntries).toHaveLength(1);
    expect(anchors[1].querySelector('[data-exam-entry="true"]')).toBeTruthy();
    expect(anchors[0].querySelector('[data-exam-entry="true"]')).toBeFalsy();

    const chip = examEntries[0].querySelector('[data-exam-chip="true"]');
    expect(chip.textContent).toBe('Exam');
    const scope = examEntries[0].querySelector('[data-exam-scope="true"]');
    expect(scope.textContent).toBe('Covers Lessons 1–2: Topic 1 through Topic 2.');

    // Registry identity on the exam header.
    const identity = examEntries[0].querySelector('[data-registry-identity="true"]');
    expect(identity.textContent).toBe('A2.9 · Exam · 22 pts');

    // Answer key renders as its own separated section with one row per entry.
    const answerKey = examEntries[0].querySelector('[data-exam-answer-key="true"]');
    expect(answerKey).toBeTruthy();
    expect(answerKey.textContent).toContain('Answer key');
    const rows = answerKey.querySelectorAll('li');
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('Q1');
    expect(rows[0].textContent).toContain('D');
    expect(rows[1].textContent).toContain('Synthesis across lessons.');
    // Weeklies never render an answer-key block.
    expect(anchors[0].querySelector('[data-exam-answer-key="true"]')).toBeFalsy();
  });

  it('D3 — exam "Show in course map" dispatches the existing cell event for the exam cell', () => {
    renderDeliverable('quizBank', quizBankFixture());

    const received = [];
    const listener = (event) => received.push(event.detail);
    window.addEventListener('coursemapper:focus-coursemap-cell', listener);
    try {
      const button = container
        .querySelector('[data-exam-entry="true"]')
        .querySelector('[data-show-in-coursemap="true"]');
      expect(button).toBeTruthy();
      act(() => {
        button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
    } finally {
      window.removeEventListener('coursemapper:focus-coursemap-cell', listener);
    }

    // The exam's lessonNumber is 1 (no "Midterm Exam" line there), so the
    // probe falls back to lesson 1's populated assessments cell — the
    // existing handler's exact detail contract.
    expect(received).toEqual([{ type: 'courseMapCell', lessonIndex: 0, sectionIndex: 0, field: 'weeklyAssessments' }]);
  });

  it('D2/D3 — a lesson-2 exam resolves its own section through the title probe', () => {
    const data = quizBankFixture();
    data.quizzes[2].lessonNumber = 2; // the exam lives in lesson 2's review section
    renderDeliverable('quizBank', data);

    const received = [];
    const listener = (event) => received.push(event.detail);
    window.addEventListener('coursemapper:focus-coursemap-cell', listener);
    try {
      const button = container
        .querySelector('[data-exam-entry="true"]')
        .querySelector('[data-show-in-coursemap="true"]');
      act(() => {
        button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
    } finally {
      window.removeEventListener('coursemapper:focus-coursemap-cell', listener);
    }

    // The em-dash display title converts back to the colon form and matches
    // "Midterm Exam: topic checks" in lesson 2, section 2 (index 1).
    expect(received).toEqual([{ type: 'courseMapCell', lessonIndex: 1, sectionIndex: 1, field: 'weeklyAssessments' }]);
  });

  it('student view hides the round-trip affordances', () => {
    renderDeliverable('rubrics', rubricsFixture(), { isStudentView: true });
    expect(container.querySelector('[data-view-brief="true"]')).toBeFalsy();
    expect(container.querySelector('[data-show-in-coursemap="true"]')).toBeFalsy();

    renderDeliverable('quizBank', quizBankFixture(), { isStudentView: true });
    expect(container.querySelector('[data-exam-entry="true"]')).toBeTruthy();
    expect(container.querySelector('[data-show-in-coursemap="true"]')).toBeFalsy();
  });

  it('AssignmentsView without a course map still groups (headers fall back to lesson numbers)', () => {
    act(() => {
      root.render(
        React.createElement(AssignmentsView, {
          data: { assignments: [{ title: 'Brief L4.1', lessonNumber: 4 }, { title: 'Orphan' }] },
          isStreaming: false,
        }),
      );
    });
    const headers = Array.from(container.querySelectorAll('[data-lesson-group-header]'));
    expect(headers.map((header) => header.querySelector('span').textContent.trim())).toEqual(['Lesson 4', 'Ungrouped']);
  });

  it('shows every distributable experiential-activity surface in the assignment workspace', () => {
    act(() => {
      root.render(
        React.createElement(AssignmentsView, {
          data: {
            assignments: [
              {
                title: 'Strait de-escalation protocol — activity packet',
                lessonNumber: 9,
                overview: 'Run the full simulation.',
                activityPacket: {
                  activityType: 'Maritime crisis negotiation',
                  totalMinutes: 75,
                  scenario: 'A disputed border incident creates an attribution crisis.',
                  safetyBoundary: 'This is a fictional classroom scenario.',
                  evidence: ['The monitoring feed stopped before the incident.'],
                  roles: [
                    {
                      name: 'Regional organization delegation',
                      goal: 'Restore monitoring and stop escalation.',
                      constraint: 'No agreement without verification.',
                      privateInformation: 'Two members will veto sanctions.',
                    },
                  ],
                  phases: [
                    {
                      title: 'Synchronized radar update',
                      information: 'New imagery weakens the original attribution.',
                      requiredDecision: 'Revise one assumption and one proposed action.',
                    },
                  ],
                  timing: [
                    { phase: 'Briefing', minutes: 10 },
                    { phase: 'Negotiation', minutes: 65 },
                  ],
                  activityLogFields: ['Confirmed evidence used'],
                  artifact: {
                    title: 'Strait de-escalation protocol',
                    requirements: ['State the final action in one sentence.'],
                  },
                  debriefPrompts: ['Which evidence changed the decision?'],
                },
              },
            ],
          },
          isStreaming: false,
        }),
      );
    });

    const packet = container.querySelector('[data-experiential-activity="true"]');
    expect(packet).toBeTruthy();
    expect(packet.textContent).toContain('fictional classroom scenario');
    expect(packet.textContent).toContain('Participant or Working Roles');
    expect(packet.textContent).toContain('Two members will veto sanctions');
    expect(packet.textContent).toContain('Synchronized radar update');
    expect(packet.textContent).toContain('Activity Log');
    expect(packet.textContent).toContain('Strait de-escalation protocol');
    expect(packet.textContent).toContain('Debrief');
  });
});
