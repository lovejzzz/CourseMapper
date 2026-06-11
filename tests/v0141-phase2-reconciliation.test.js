/**
 * v0.14.1 Phase 2.5 — the map↔deliverable reconciliation gate. The v0.14
 * audit shipped Physical Geology with a course map promising "Midterm Exam:
 * minerals through metamorphic rocks" (7.2) and a comprehensive final that
 * exist nowhere downstream, and Mandarin promised Lesson 15 oral rubrics
 * that were never generated — all behind `ready · 0 blockers`. Root: the
 * blueprint mints ONE assessment per lesson from lesson.studentArtifact
 * while the graph carries every map atom (~4 per lesson). Phase 3's
 * assessment registry will fix the identity by construction; this gate is
 * the permanent regression net that detects the drift first:
 *
 *  - every graph.assessments entry must resolve to a downstream artifact
 *    (blueprint assessment, assignment brief, rubric, syllabus grading row)
 *    via exact → token-subset → label-subset matching (fusion-aware);
 *  - unresolved HIGH-STAKES titles (midterm/final/exam/capstone/performance/
 *    portfolio) become warnings naming the assessment and lesson;
 *  - the rest fold into ONE info-level aggregate (in-class checks
 *    legitimately have no brief today);
 *  - graph-optional: legacy projects without a course graph stay quiet.
 */
import { describe, expect, it } from 'vitest';

import { buildAssessmentReconciliationIssues, runDeterministicPackageFinalizer } from '../src/lib/packageFinalizer.js';
import { buildRunDigest, formatRunDigest } from '../src/lib/runDigest.js';

// ── Fixtures ──

function graphWithAssessments(assessments, courseName = 'Test Course') {
  return {
    version: 1,
    course: { name: courseName },
    assessments: assessments.map((assessment, index) => ({
      id: `a${index + 1}`,
      label: '',
      genre: '',
      weightPct: null,
      ...assessment,
    })),
  };
}

// The Geology case: the map's Lesson 7 carries four assessment atoms; the
// blueprint fused the first two into one brief title (the v0.14 fusion bug
// shape, interior lowercase included) and dropped the rest.
const GEOLOGY_GRAPH = graphWithAssessments(
  [
    { title: 'Quiz: plate boundary evidence', dueSession: 7 },
    { title: 'Map Activity: boundary identification', dueSession: 7 },
    { title: 'Sketch exercise: crystal habit drawing', dueSession: 7 },
    { title: 'Midterm Exam: minerals through metamorphic rocks', dueSession: 7 },
  ],
  'Physical Geology',
);

const GEOLOGY_BLUEPRINT = {
  assessments: [
    {
      id: 'assessment-7',
      title: 'Quiz: plate boundary evidence and map Activity',
      artifact: 'Quiz: plate boundary evidence and map Activity',
      lessonNumbers: [7],
      relatedLessons: ['Lesson 7: Plate Tectonics and Boundary Processes'],
    },
  ],
};

// ── Core matching: the Geology phantom midterm ──

describe('buildAssessmentReconciliationIssues — Geology case (P2.5)', () => {
  const issues = buildAssessmentReconciliationIssues({
    courseGraph: GEOLOGY_GRAPH,
    blueprint: GEOLOGY_BLUEPRINT,
  });

  it('flags the midterm as a HIGH-STAKES warning with the roadmap message shape', () => {
    const warnings = issues.filter((issue) => issue.severity === 'warning');
    expect(warnings).toHaveLength(1);
    expect(warnings[0].message).toBe(
      'Midterm Exam: minerals through metamorphic rocks — promised in course map (Lesson 7), no matching assignment or exam was generated',
    );
    expect(warnings[0].source).toBe('assessmentReconciliation');
    expect(warnings[0].featureId).toBe('courseMap');
    expect(warnings[0].label).toBe('Assessment reconciliation');
    // Not auto-fixable, not retryable: no retry pass can mint a missing exam.
    expect(warnings[0].autoFixable).toBe(false);
    expect(warnings[0].retryable).toBe(false);
    expect(warnings[0].lessonIndex).toBe(6);
  });

  it('resolves the quiz atom via token-subset against the fused brief title', () => {
    expect(issues.some((issue) => issue.message.includes('Quiz: plate boundary evidence'))).toBe(false);
  });

  it('resolves the map-activity atom via label-subset (fusion kept only its pre-colon label)', () => {
    expect(issues.some((issue) => issue.message.includes('Map Activity'))).toBe(false);
  });

  it('folds the leftover sketch exercise into one info-level aggregate line', () => {
    const notices = issues.filter((issue) => issue.severity === 'info');
    expect(notices).toHaveLength(1);
    expect(notices[0].message).toBe('1 additional map assessment has no dedicated artifact (in-class activities)');
    expect(notices[0].assessmentTitles).toEqual(['Sketch exercise: crystal habit drawing']);
  });

  it('emits exactly one warning and one notice — no per-atom noise', () => {
    expect(issues).toHaveLength(2);
  });
});

// ── The Mandarin Lesson 15 oral case ──

describe('buildAssessmentReconciliationIssues — Mandarin L15 oral case (P2.5)', () => {
  const graph = graphWithAssessments(
    [
      { title: 'Oral rehearsal rubric', dueSession: 15 },
      { title: 'Speaking rubric', dueSession: 15 },
      { title: 'Final oral prompt sheet', dueSession: 15 },
      { title: 'Dialogue practice check', dueSession: 15 },
    ],
    'Elementary Mandarin Chinese I',
  );
  const blueprint = {
    assessments: [
      {
        id: 'assessment-15',
        title: 'Dialogue practice check and reflection',
        artifact: 'Dialogue practice check and reflection',
        lessonNumbers: [15],
      },
    ],
  };
  const issues = buildAssessmentReconciliationIssues({ courseGraph: graph, blueprint });

  it('flags the final oral prompt sheet as a HIGH-STAKES warning', () => {
    const warnings = issues.filter((issue) => issue.severity === 'warning');
    expect(warnings).toHaveLength(1);
    expect(warnings[0].message).toBe(
      'Final oral prompt sheet — promised in course map (Lesson 15), no matching assignment or exam was generated',
    );
  });

  it('aggregates the two missing rubrics into the info line and resolves the practice check', () => {
    const notices = issues.filter((issue) => issue.severity === 'info');
    expect(notices).toHaveLength(1);
    expect(notices[0].message).toBe('2 additional map assessments have no dedicated artifact (in-class activities)');
    expect(notices[0].assessmentTitles).toEqual(['Oral rehearsal rubric', 'Speaking rubric']);
    expect(issues.some((issue) => issue.message.includes('Dialogue practice check'))).toBe(false);
  });
});

// ── Fully resolved and fusion-only cases ──

describe('buildAssessmentReconciliationIssues — resolved courses (P2.5)', () => {
  it('stays quiet when every graph assessment has a downstream artifact', () => {
    const graph = graphWithAssessments([
      { title: 'Lesson 1 analysis memo', dueSession: 1 },
      { title: 'Lesson 2 analysis memo', dueSession: 2 },
    ]);
    const blueprint = {
      assessments: [
        { title: 'Lesson 1 analysis memo', lessonNumbers: [1] },
        { title: 'Lesson 2 analysis memo', lessonNumbers: [2] },
      ],
    };
    expect(buildAssessmentReconciliationIssues({ courseGraph: graph, blueprint })).toEqual([]);
  });

  it('resolves two map atoms against one fused blueprint title', () => {
    const graph = graphWithAssessments([
      { title: 'Grammar Check: particle usage', dueSession: 4 },
      { title: 'Oral Drill: tone pairs', dueSession: 4 },
    ]);
    const blueprint = {
      // The pre-v0.14.1 fusion shape: first atom's full label + second
      // atom's pre-colon label with interior lowercase.
      assessments: [{ title: 'Grammar Check and oral Drill', lessonNumbers: [4] }],
    };
    expect(buildAssessmentReconciliationIssues({ courseGraph: graph, blueprint })).toEqual([]);
  });

  it('does not resolve across lessons — a same-titled brief in another week does not count', () => {
    const graph = graphWithAssessments([{ title: 'Midterm Exam: units one through five', dueSession: 7 }]);
    const blueprint = {
      assessments: [
        { title: 'Midterm Exam: units one through five', lessonNumbers: [2] },
        { title: 'Weekly reading response', lessonNumbers: [7] },
      ],
    };
    const issues = buildAssessmentReconciliationIssues({ courseGraph: graph, blueprint });
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('warning');
    expect(issues[0].message).toContain('Midterm Exam: units one through five');
  });
});

// ── Graph-optional + no-candidate guards ──

describe('buildAssessmentReconciliationIssues — graph-optional (P2.5)', () => {
  const blueprint = { assessments: [{ title: 'Weekly memo', lessonNumbers: [1] }] };

  it('returns [] quietly when there is no course graph (legacy projects)', () => {
    expect(buildAssessmentReconciliationIssues({ courseGraph: null, blueprint })).toEqual([]);
    expect(buildAssessmentReconciliationIssues({ blueprint })).toEqual([]);
    expect(buildAssessmentReconciliationIssues()).toEqual([]);
  });

  it('returns [] when the graph carries no assessments', () => {
    expect(buildAssessmentReconciliationIssues({ courseGraph: graphWithAssessments([]), blueprint })).toEqual([]);
  });

  it('returns [] when the package has no assessment-bearing artifact to reconcile against', () => {
    const graph = graphWithAssessments([{ title: 'Midterm Exam: everything', dueSession: 5 }]);
    expect(buildAssessmentReconciliationIssues({ courseGraph: graph })).toEqual([]);
    expect(buildAssessmentReconciliationIssues({ courseGraph: graph, deliverables: {} })).toEqual([]);
  });
});

// ── Deliverable-surface resolution (the finalizer call-site reality:
//    no blueprint object, only compiled deliverables) ──

describe('buildAssessmentReconciliationIssues — deliverable surfaces (P2.5)', () => {
  const graph = graphWithAssessments([
    { title: 'Quiz: mineral identification', dueSession: 3 },
    { title: 'Midterm Exam: minerals and rocks', dueSession: 7 },
    { title: 'Speaking rubric', dueSession: 7 },
  ]);

  it('resolves against assignment-brief titles per dueWeek', () => {
    const deliverables = {
      assignments: {
        status: 'done',
        data: {
          assignments: [{ title: 'Quiz: mineral identification and lab log', dueWeek: 'Week 3' }],
        },
      },
    };
    const issues = buildAssessmentReconciliationIssues({ courseGraph: graph, deliverables });
    expect(issues.some((issue) => issue.message.includes('Quiz: mineral identification'))).toBe(false);
    expect(issues.filter((issue) => issue.severity === 'warning')).toHaveLength(1);
  });

  it('resolves against syllabus grading-table rows as course-level surfaces', () => {
    const deliverables = {
      syllabus: {
        status: 'done',
        data: {
          requirements: [{ name: 'Midterm Exam: minerals and rocks', weight: '20%' }],
        },
      },
    };
    const issues = buildAssessmentReconciliationIssues({ courseGraph: graph, deliverables });
    expect(issues.some((issue) => issue.message.includes('Midterm Exam'))).toBe(false);
  });

  it('resolves against rubric titles', () => {
    const deliverables = {
      rubrics: {
        status: 'done',
        data: {
          rubrics: [{ title: 'Speaking rubric Rubric', lessonTitle: 'Lesson 7: Oral Performance' }],
        },
      },
    };
    const issues = buildAssessmentReconciliationIssues({ courseGraph: graph, deliverables });
    // The speaking rubric resolved; only the unrelated quiz atom remains in
    // the aggregate (plus the midterm warning).
    const notice = issues.find((issue) => issue.severity === 'info');
    expect(notice.assessmentTitles).toEqual(['Quiz: mineral identification']);
  });

  it('skips deliverables that are not done', () => {
    const deliverables = {
      assignments: {
        status: 'error',
        data: { assignments: [{ title: 'Quiz: mineral identification', dueWeek: 'Week 3' }] },
      },
    };
    expect(buildAssessmentReconciliationIssues({ courseGraph: graph, deliverables })).toEqual([]);
  });
});

// ── Integration: the finalizer merge point and the retry channel ──

describe('finalizer integration (P2.5)', () => {
  const courseMap = {
    courseName: 'Research Methods',
    lessons: [1, 2].map((n) => ({
      title: `Lesson ${n}: Research Topic ${n}`,
      sections: [
        {
          learningGoals: `Build research methods skill ${n}.`,
          topicSection: `Research topic ${n}`,
          learningObjectives: `Analyze research topic ${n} using evidence and method criteria.`,
          weeklyAssessments: `Submit lesson ${n} analysis memo.`,
          asyncActivities: `Read examples for research topic ${n}.`,
          syncActivities: `Workshop evidence and feedback for topic ${n}.`,
        },
      ],
    })),
  };
  const courseGraph = graphWithAssessments([
    { title: 'Submit lesson 1 analysis memo', dueSession: 1 },
    { title: 'Midterm Exam: research synthesis', dueSession: 1 },
    { title: 'Sketch exercise: method diagram', dueSession: 1 },
  ]);
  const deliverables = {
    assignments: {
      status: 'done',
      data: {
        assignments: [{ title: 'Submit lesson 1 analysis memo', dueWeek: 'Week 1' }],
      },
    },
  };

  it('merges high-stakes warnings into readiness but never into the retry channel', () => {
    const result = runDeterministicPackageFinalizer({
      courseMap,
      deliverables,
      selectedFeatures: ['courseMap'],
      courseGraph,
    });
    const reconciliation = result.readiness.warnings.filter((issue) => issue.source === 'assessmentReconciliation');
    expect(reconciliation).toHaveLength(1);
    expect(reconciliation[0].message).toBe(
      'Midterm Exam: research synthesis — promised in course map (Lesson 1), no matching assignment or exam was generated',
    );
    // Not auto-fixable: the finalizer cannot mint a missing exam.
    expect((result.retryActions || []).every((action) => !(action.message || '').includes('Midterm'))).toBe(true);

    // The info aggregate stays OUT of readiness (the schema would coerce it
    // to a warning) and rides the result for the digest.
    expect(
      result.readiness.issues.some((issue) => issue.source === 'assessmentReconciliation' && issue.severity === 'info'),
    ).toBe(false);
    const notice = result.assessmentReconciliationIssues.find((issue) => issue.severity === 'info');
    expect(notice).toBeTruthy();
    expect(notice.message).toBe('1 additional map assessment has no dedicated artifact (in-class activities)');
  });

  it('changes nothing for legacy projects without a graph', () => {
    const result = runDeterministicPackageFinalizer({
      courseMap,
      deliverables,
      selectedFeatures: ['courseMap'],
    });
    expect(result.assessmentReconciliationIssues).toEqual([]);
    expect(result.readiness.issues.some((issue) => issue.source === 'assessmentReconciliation')).toBe(false);
  });
});

// ── Digest: flagged checks carry the reconciliation findings ──

describe('run digest reconciliation checks (P2.5)', () => {
  it('renders the warning and the info aggregate in the flagged checks', () => {
    const digest = buildRunDigest({
      finish: {
        finalStatus: 'ready',
        assessmentReconciliationIssues: [
          {
            severity: 'warning',
            source: 'assessmentReconciliation',
            message:
              'Midterm Exam: minerals through metamorphic rocks — promised in course map (Lesson 7), no matching assignment or exam was generated',
          },
          {
            severity: 'info',
            source: 'assessmentReconciliation',
            message: '1 additional map assessment has no dedicated artifact (in-class activities)',
          },
        ],
      },
    });
    const flagged = digest.gates.flaggedChecks.filter((check) => check.featureId === 'alignment');
    expect(flagged).toHaveLength(2);
    expect(flagged[0].status).toBe('warning');
    expect(flagged[0].message).toContain('Midterm Exam: minerals through metamorphic rocks');
    expect(flagged[1].status).toBe('info');
    expect(flagged[1].message).toContain('no dedicated artifact');
    const text = formatRunDigest(digest);
    expect(text).toContain('[warning] alignment: Midterm Exam');
    expect(text).toContain('[info] alignment: 1 additional map assessment');
  });

  it('adds no alignment checks when the finalizer found nothing', () => {
    const digest = buildRunDigest({ finish: { finalStatus: 'ready', assessmentReconciliationIssues: [] } });
    expect(digest.gates.flaggedChecks.some((check) => check.featureId === 'alignment')).toBe(false);
  });
});
