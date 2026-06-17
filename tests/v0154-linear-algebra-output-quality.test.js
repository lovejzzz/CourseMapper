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

describe('v0.15.6 anatomy and texture quality regressions', () => {
  it('flags geology field-lab assets when an anatomy package asks for them', async () => {
    const result = await grade({
      fileProvider: createMemoryFileProvider({
        'PACKAGE_MANIFEST.json': JSON.stringify({
          courseName: 'Human Anatomy and Physiology I',
          lessonScope: 'all',
          assessments: [],
          files: [],
          readiness: { status: 'ready', blockers: 0 },
        }),
        'Required Assets/Human Anatomy and Physiology I - Required Lab Assets.md': [
          '# Required Assets',
          '- Specimen or sample kit with rock, mineral, biological, or chemical samples',
          '- Hand lenses and observation tools',
          '- Field or lab notebook template',
          '- Streak plates for observations',
        ].join('\n'),
      }),
      course: { id: 'human-anatomy-physiology-i', title: 'Human Anatomy and Physiology I', featureIds: [] },
    });

    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'P1',
          dimension: 'structure',
          detail: expect.stringMatching(/geology\/chemistry field-lab materials/i),
        }),
      ]),
    );
    expect(result.overall.score).toBeLessThan(100);
  });

  it('turns repeated template phrases and low texture into actionable findings', async () => {
    const repeated = [
      '# Lesson Plan',
      'Lesson 1 application check: tissue types.',
      'Lesson 2 application check: epithelial tissue.',
      'Lesson 3 application check: connective tissue.',
      'Lesson 4 application check: integumentary system.',
      'Lesson 5 application check: skeletal system.',
      'Instructor notes and selected readings on tissue types.',
      'Instructor notes and selected readings on epithelial tissue.',
      'Instructor notes and selected readings on connective tissue.',
      'Instructor notes and selected readings on integumentary system.',
      'Instructor notes and selected readings on skeletal system.',
    ].join('\n');
    const result = await grade({
      fileProvider: createMemoryFileProvider({
        'PACKAGE_MANIFEST.json': JSON.stringify({
          courseName: 'Human Anatomy and Physiology I',
          lessonScope: 'all',
          assessments: [],
          files: [],
          readiness: { status: 'ready', blockers: 0 },
        }),
        'Lesson Plans/Lesson 01.md': repeated,
        'Lesson Plans/Lesson 02.md': repeated,
        'Lesson Plans/Lesson 03.md': repeated,
        'Lesson Plans/Lesson 04.md': repeated,
      }),
      course: {
        id: 'human-anatomy-physiology-i',
        title: 'Human Anatomy and Physiology I',
        featureIds: ['lessonPlans'],
      },
    });

    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'P2',
          dimension: 'format',
          detail: expect.stringMatching(/Lesson N application check.*repeats/i),
        }),
        expect.objectContaining({
          severity: 'P2',
          dimension: 'texture',
          detail: expect.stringMatching(/Texture score \d+\/100/i),
        }),
      ]),
    );
    expect(result.overall.score).toBeLessThan(100);
  });

  it('grades generic lab/STEM fallback language as a history discipline defect', async () => {
    const result = await grade({
      fileProvider: createMemoryFileProvider({
        'PACKAGE_MANIFEST.json': JSON.stringify({
          courseName: 'Western Civilization to 1500',
          lessonScope: 'all',
          assessments: [],
          files: [],
          readiness: { status: 'ready', blockers: 0 },
        }),
        'Course Map/Western Civilization to 1500 - Course Map.md': [
          '# Course Map',
          'Lesson 1: Mesopotamia and Egypt',
          'Trace how Egypt changes what students can observe, label, calculate, or decide.',
          'Apply the main concepts from Greek civilization to a course task or example.',
          'Explain the key ideas in Roman Republic and apply them in course activities.',
          'Course LMS, shared files, and any discipline-specific tools named by the instructor.',
          'Instructor-approved readings, examples, or lab materials for Byzantine Empire.',
          'Check that the Renaissance activity, resource, and assessment ask students to produce the same evidence of learning.',
          'Check that the Reformation activity, resource, and assessment ask students to produce the same evidence of learning.',
          'Check that the Crusades activity, resource, and assessment ask students to produce the same evidence of learning.',
        ].join('\n'),
      }),
      course: { id: 'western-civ-to-1500', title: 'Western Civilization to 1500', featureIds: ['courseMap'] },
    });

    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'P1',
          dimension: 'discipline',
          detail: expect.stringMatching(/generic history fallback appears/i),
        }),
      ]),
    );
    expect(result.overall.score).toBeLessThan(100);
  });
});
