import { describe, expect, it } from 'vitest';

import { compileBlueprintDeliverables } from '../src/lib/courseBlueprintCompiler.js';
import { buildBlueprintFromGraph, deriveCourseGraphFromCourseMap } from '../src/lib/courseGraph/index.js';
import { createMemoryFileProvider } from '../src/lib/quality/fileProviders.js';
import { grade } from './lib/deepQualityGrader.js';

function linearAlgebraCourseMap() {
  return {
    courseName: 'Linear Algebra',
    lessons: [
      {
        title: 'Lesson 1: Vector Spaces and Bases',
        sections: [
          {
            topicSection: '1.1: vector spaces and bases',
            learningGoals: 'Build fluency with vector spaces, spans, and bases.',
            learningObjectives: 'Compute whether a proposed set spans a vector space and identify a basis.',
            weeklyAssessments: 'Proof-based problem set: This lesson\nComputational lab in Python: This lesson',
            asyncActivities: 'Read instructor notes and complete two basis examples.',
            syncActivities: 'Work basis and span examples in pairs.',
            supportingResources: 'Instructor notes and worked matrix examples.',
          },
        ],
      },
      {
        title: 'Lesson 2: Eigenvalues and Eigenvectors',
        sections: [
          {
            topicSection: '2.1: eigenvalues and eigenvectors',
            learningGoals: 'Connect eigenvalues to matrix transformations.',
            learningObjectives: 'Calculate eigenvalues for a diagonal matrix and interpret the transformation.',
            weeklyAssessments: 'Proof-based problem set: eigenvalues\nComputational lab in Python: eigenvectors',
            asyncActivities: 'Practice diagonal-matrix eigenvalue examples.',
            syncActivities: 'Compare geometric and algebraic interpretations.',
            supportingResources: 'Instructor notes and eigenvalue worked examples.',
          },
        ],
      },
    ],
  };
}

describe('v0.15.4 Linear Algebra output quality regressions', () => {
  it('compiles study guides without generic lesson artifacts and gives math decks worked examples', () => {
    const graph = deriveCourseGraphFromCourseMap(linearAlgebraCourseMap());
    const blueprint = buildBlueprintFromGraph(graph);
    const compiled = compileBlueprintDeliverables(blueprint, ['studyGuides', 'slideDecks']);

    const studyGuideText = JSON.stringify(
      compiled.studyGuides.studyGuides.map((guide) => ({
        lessonTitle: guide.lessonTitle,
        examScope: guide.examScope,
        summary: guide.summary,
        conceptConnections: guide.conceptConnections,
        reviewQuestions: guide.reviewQuestions,
        practiceActivities: guide.practiceActivities,
        examPrep: guide.examPrep,
        studentResources: guide.studentResources,
      })),
    );
    expect(studyGuideText).not.toMatch(/this this lesson|this the lesson|the lesson criterion/i);
    expect(studyGuideText).not.toMatch(
      /(?:Proof-based problem set|Computational lab in Python):\s*(?:This|The)\s+lesson/i,
    );

    const workedSlides = compiled.slideDecks.decks.flatMap((deck) =>
      deck.slides.filter((slide) => slide.enrichmentSource === 'deterministic-worked-example'),
    );
    expect(workedSlides.length).toBeGreaterThan(0);
    expect(workedSlides.some((slide) => slide.visual?.wePlot?.pairs?.length >= 2)).toBe(true);
  });

  it('grades the audited bad package signals instead of reporting a clean 100', async () => {
    const result = await grade({
      fileProvider: createMemoryFileProvider({
        'PACKAGE_MANIFEST.json': JSON.stringify({
          courseName: 'Linear Algebra',
          lessonScope: 'all',
          assessments: [],
          files: [],
          readiness: { status: 'ready', blockers: 0 },
          pipeline: {
            genomeLinker: '0 genome + 0 cached of 14 lessons (0 concepts, 0 citations, 0 bridges)',
            judgment: 'not evaluated (0 genome-linked lessons)',
          },
        }),
        'Required Assets/Linear Algebra - Required Lab Assets.md': [
          '# Required Assets',
          '- Specimen or sample kit',
          '- Lab safety equipment and briefing',
          '- Hand lenses and observation tools',
        ].join('\n'),
        'Study Guides/Lesson 01 - Vector Spaces - Study Guides.md': [
          '# Lesson 1 Study Guide',
          'Proof-based problem set: This lesson',
          'Week 1 prepares students to meet this this lesson criterion for Proof-based problem set: This lesson.',
        ].join('\n'),
      }),
      course: { id: 'linear-algebra', title: 'Linear Algebra', featureIds: ['studyGuides'] },
    });

    expect(result.overall.score).toBeLessThan(100);
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'P1',
          dimension: 'structure',
          detail: expect.stringMatching(/physical wet-lab materials/i),
        }),
        expect.objectContaining({
          severity: 'P1',
          dimension: 'format',
          detail: expect.stringMatching(/generic lesson placeholder/i),
        }),
        expect.objectContaining({
          severity: 'P2',
          dimension: 'honesty',
          detail: expect.stringMatching(/judgment was not evaluated/i),
        }),
      ]),
    );
  });
});
