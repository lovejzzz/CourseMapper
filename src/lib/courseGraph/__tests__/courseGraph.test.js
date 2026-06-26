import { describe, expect, it } from 'vitest';
import { COURSE_GRAPH_VERSION, courseGraphStats, createEmptyCourseGraph, validateCourseGraph } from '../schema.js';
import { deriveCourseGraphFromCourseMap } from '../deriveFromCourseMap.js';
import { renderCourseMapFromGraph } from '../renderCourseMap.js';
import { enrichmentFromGraph } from '../blueprintFromGraph.js';
import { lintCourseGraphAlignment } from '../alignmentLint.js';

function fixtureMap() {
  return {
    courseName: 'Principles of Microeconomics',
    lessons: [
      {
        title: 'Lesson 1: Scarcity and Economic Thinking',
        sections: [
          {
            topicSection: '1.1: Opportunity Cost',
            learningGoals: '1. Build an economic way of thinking grounded in tradeoffs.',
            learningObjectives:
              '1a. Analyze opportunity cost using personal examples.\n1b. Evaluate tradeoffs in a budget decision.',
            weeklyAssessments: '1. Week 1 quiz: applied opportunity cost problems.',
            asyncActivities: '1. Read: chapter on scarcity.\n2. Watch: tradeoffs mini-lecture.',
            syncActivities: '1. Workshop: budget-line case analysis.',
            technologyNeeded: 'Shared workspace and LMS quiz.',
            presentationFormat: 'Case discussion',
            supportingResources: 'OpenStax chapter on scarcity',
            evaluateDesign: 'Objectives are measurable and assessed by the weekly quiz.',
          },
        ],
      },
      {
        title: 'Lesson 2: Demand and Supply Basics',
        sections: [
          {
            topicSection: '2.1: Demand Curve',
            learningObjectives: 'Analyze demand shifts using market events.',
            weeklyAssessments: 'Problem set 2: demand and supply shifts.',
            supportingResources: 'OpenStax chapter on demand and supply',
            customColumn: 'Custom value survives the round trip.',
          },
        ],
      },
    ],
  };
}

describe('courseGraph (v0.13 P0)', () => {
  it('creates a valid empty graph and validates referential integrity', () => {
    const graph = createEmptyCourseGraph({ courseName: 'Test Course' });
    expect(graph.version).toBe(COURSE_GRAPH_VERSION);
    expect(validateCourseGraph(graph).valid).toBe(true);

    graph.edges.teaches.push({ from: 's99', to: 'c99' });
    const invalid = validateCourseGraph(graph);
    expect(invalid.valid).toBe(false);
    expect(invalid.issues.some((issue) => issue.code === 'dangling-edge')).toBe(true);
  });

  it('derives entities, edges, and lossless extras from a course map', () => {
    const graph = deriveCourseGraphFromCourseMap(fixtureMap());
    expect(validateCourseGraph(graph).valid).toBe(true);
    expect(graph.sessions).toHaveLength(2);
    expect(graph.outcomes).toHaveLength(3);
    expect(graph.outcomes[0]).toMatchObject({ label: '1a', bloomVerb: 'analyze' });
    expect(graph.assessments).toHaveLength(2);
    expect(graph.resources).toHaveLength(2);
    expect(graph.concepts.map((concept) => concept.term)).toEqual(['Opportunity Cost', 'Demand Curve']);
    // Alignment edges: each assessment assesses its section's outcomes.
    expect(graph.edges.assesses.length).toBeGreaterThan(0);
    // Compiler-owned and custom columns pass through verbatim.
    expect(graph.sessions[0].sections[0].extras.presentationFormat).toBe('Case discussion');
    expect(graph.sessions[1].sections[0].extras.customColumn).toBe('Custom value survives the round trip.');
  });

  it('round-trips derive → render preserving every readiness-relevant cell', () => {
    const original = fixtureMap();
    const rendered = renderCourseMapFromGraph(deriveCourseGraphFromCourseMap(original));

    expect(rendered.courseName).toBe(original.courseName);
    expect(rendered.lessons).toHaveLength(2);
    expect(rendered.lessons[0].title).toBe(original.lessons[0].title);
    const section = rendered.lessons[0].sections[0];
    expect(section.topicSection).toBe('1.1: Opportunity Cost');
    expect(section.learningObjectives).toBe(
      '1a. Analyze opportunity cost using personal examples.\n1b. Evaluate tradeoffs in a budget decision.',
    );
    expect(section.weeklyAssessments).toBe('1. Week 1 quiz: applied opportunity cost problems.');
    expect(section.asyncActivities).toBe('1. Read: chapter on scarcity.\n2. Watch: tradeoffs mini-lecture.');
    expect(section.presentationFormat).toBe('Case discussion');
    expect(rendered.lessons[1].sections[0].customColumn).toBe('Custom value survives the round trip.');
    // The v0.12.1 stem rule holds at render time: no stem in the cell.
    expect(section.learningObjectives).not.toContain('Students will be able to');
  });

  it('renders manual overrides verbatim over entity rendering', () => {
    const graph = deriveCourseGraphFromCourseMap(fixtureMap());
    graph.sessions[0].sections[0].overrides.learningObjectives = 'Instructor wrote this exact text.';
    const rendered = renderCourseMapFromGraph(graph);
    expect(rendered.lessons[0].sections[0].learningObjectives).toBe('Instructor wrote this exact text.');
  });

  it('uses enriched kernel focus instead of generic Session labels in rendered maps', () => {
    const graph = deriveCourseGraphFromCourseMap({
      courseName: 'Project Management',
      lessons: [
        {
          title: 'Lesson 1: Session 1',
          sections: [
            {
              topicSection: '1.1: Session 1',
              learningGoals: 'Use Session 1 to explain a course problem.',
              learningObjectives: 'Explain how Session 1 changes project decisions.',
              weeklyAssessments: 'Session 1 evidence check.',
              asyncActivities: 'Review assigned materials and prepare notes on Session 1.',
              syncActivities: 'Discuss examples and practice applying Session 1.',
            },
          ],
        },
      ],
    });
    graph.enrichmentOverlay = {
      lessonContent: {
        'lesson-1': {
          keyTerms: [{ term: 'Project charter' }, { term: 'Stakeholder analysis' }, { term: 'Scope baseline' }],
        },
      },
    };

    const rendered = renderCourseMapFromGraph(graph);

    expect(rendered.lessons[0].title).toBe('Lesson 1: Project charter, Stakeholder analysis, and Scope baseline');
    expect(rendered.lessons[0].sections[0].topicSection).toBe(
      '1.1: Project charter, Stakeholder analysis, and Scope baseline',
    );
    expect(rendered.lessons[0].sections[0].learningObjectives).toContain('Project charter');
    expect(rendered.lessons[0].sections[0].learningObjectives).not.toContain('Session 1');
  });

  it('lints alignment structurally — unassessed outcomes, premature assessments, weights', () => {
    const graph = deriveCourseGraphFromCourseMap(fixtureMap());
    // The derived fixture is aligned: every section's assessments assess its
    // outcomes, nothing is due before it is taught.
    expect(lintCourseGraphAlignment(graph)).toEqual([]);

    // Break alignment: an outcome nothing assesses…
    graph.edges.assesses = graph.edges.assesses.filter((edge) => edge.to !== graph.outcomes[0].id);
    // …and an assessment due before its outcome's session is taught.
    const lateOutcome = graph.outcomes.find((outcome) => outcome.sessionRef === graph.sessions[1].id);
    graph.assessments[0].dueSession = 1;
    graph.edges.assesses.push({ from: graph.assessments[0].id, to: lateOutcome.id });
    // …and weights that cannot account for the whole grade.
    graph.assessments.forEach((assessment, index) => {
      assessment.weightPct = index === 0 ? 10 : 20;
    });
    graph.assessments.push({ id: 'a99', title: 'Extra quiz', dueSession: 2, weightPct: 10 });

    const findings = lintCourseGraphAlignment(graph);
    const codes = findings.map((finding) => finding.code);
    expect(codes).toContain('unassessed-outcomes');
    expect(codes).toContain('assessed-before-taught');
    expect(codes).toContain('weights-do-not-sum');
  });

  // The cloud project snapshot carries the graph, and Firestore rejects
  // directly nested arrays — tuple-shaped edges broke cloud save the day
  // v0.13.0 shipped. Edges are { from, to } objects; this walk guards the
  // whole structure against the class of bug, not just edges.
  it('serializes without nested arrays (Firestore-safe)', () => {
    const graph = deriveCourseGraphFromCourseMap(fixtureMap());
    graph.edges.genomeLink.push({ from: graph.concepts[0].id, to: 'econ/opportunity-cost' });
    const offenders = [];
    const walk = (node, path) => {
      if (Array.isArray(node)) {
        node.forEach((item, index) => {
          if (Array.isArray(item)) offenders.push(`${path}[${index}]`);
          walk(item, `${path}[${index}]`);
        });
      } else if (node && typeof node === 'object') {
        for (const [key, value] of Object.entries(node)) walk(value, `${path}.${key}`);
      }
    };
    walk(graph, '$');
    expect(offenders, offenders.join(', ')).toEqual([]);
  });

  it('assembles the enrichment overlay from concept kernels and reports stats', () => {
    const graph = deriveCourseGraphFromCourseMap(fixtureMap());
    const conceptId = graph.concepts[0].id;
    graph.concepts[0].kernel = { tm: 'Opportunity Cost', fs: [{ tx: 'A real fact.' }] };
    graph.edges.genomeLink.push({ from: conceptId, to: 'econ/opportunity-cost' });

    const overlay = enrichmentFromGraph(graph);
    expect(overlay.lessonContent['lesson-1']).toMatchObject({ tm: 'Opportunity Cost' });

    const stats = courseGraphStats(graph);
    expect(stats).toMatchObject({ sessions: 2, genomeLinkedConcepts: 1 });
  });
});
