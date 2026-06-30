import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';

import { compileBlueprintDeliverables } from '../src/lib/courseBlueprintCompiler.js';
import { buildBlueprintFromGraph, deriveCourseGraphFromCourseMap } from '../src/lib/courseGraph/index.js';
import { createMemoryFileProvider } from '../src/lib/quality/fileProviders.js';
import { grade, honestyFromDigest } from './lib/deepQualityGrader.js';

async function pptxWithNotes(notesText) {
  const zip = new JSZip();
  zip.file(
    'ppt/slides/slide1.xml',
    '<p:sld><p:cSld><p:spTree><a:p><a:r><a:t>Lesson slide</a:t></a:r></a:p></p:spTree></p:cSld></p:sld>',
  );
  zip.file(
    'ppt/notesSlides/notesSlide1.xml',
    `<p:notes><p:cSld><p:spTree><a:p><a:r><a:t>${notesText}</a:t></a:r></a:p></p:spTree></p:cSld></p:notes>`,
  );
  return zip.generateAsync({ type: 'uint8array' });
}

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

  it('does not let stale zero-genome console text override a source-backed final judgment', async () => {
    const sourceRefCoverage = {
      version: 'courseir.v1',
      sourceLedgerRows: 2,
      totals: { total: 24, withRefs: 24, missing: 0, danglingRefs: 0 },
      categories: {
        outcomes: { total: 8, withRefs: 8, missing: 0, danglingRefs: 0, missingIds: [] },
        activities: { total: 8, withRefs: 8, missing: 0, danglingRefs: 0, missingIds: [] },
        assessments: { total: 4, withRefs: 4, missing: 0, danglingRefs: 0, missingIds: [] },
        factualClaims: { total: 4, withRefs: 4, missing: 0, danglingRefs: 0, missingIds: [] },
      },
    };
    const result = await grade({
      fileProvider: createMemoryFileProvider({
        'PACKAGE_MANIFEST.json': JSON.stringify({
          courseName: 'Introduction to Computer Science with Python',
          lessonScope: 'all',
          assessments: [],
          files: [],
          readiness: { status: 'ready', blockers: 0 },
          pipeline: {
            genomeLinker: '0 genome + 0 cached of 15 lessons (0 concepts, 0 citations, 0 bridges)',
            knowledgeBackbone:
              '0/15 lessons genome-linked · 2 cited open resources (openstax: 2) · 15 lessons with readings',
            judgment:
              'source-backed coverage check (24/24 sourceRef atoms covered; 15/15 lessons with cited resources; genome prerequisite judgment unavailable)',
          },
          sourceLedger: [
            {
              id: 'SL1',
              title: 'OpenStax Introduction to Python Programming: Variables',
              provider: 'openstax',
              url: 'https://openstax.org/books/introduction-python-programming/pages/2-introduction',
              license: 'CC BY 4.0',
              conceptLinks: [{ id: 'lesson-1:variables', label: 'Variables' }],
            },
            {
              id: 'SL2',
              title: 'OpenStax Introduction to Python Programming: Dictionaries',
              provider: 'openstax',
              url: 'https://openstax.org/books/introduction-python-programming/pages/9-introduction',
              license: 'CC BY 4.0',
              conceptLinks: [{ id: 'lesson-7:dictionaries', label: 'Dictionaries' }],
            },
          ],
          sourceReport: {
            path: 'SOURCE_REPORT.md',
            sourceCount: 2,
            sourceRefCoverage,
          },
          courseIR: { sourceRefCoverage },
        }),
        'SOURCE_REPORT.md': [
          '# Source Report',
          '## Source Ledger',
          '- SL1: OpenStax Introduction to Python Programming: Variables',
          '- SL2: OpenStax Introduction to Python Programming: Dictionaries',
          '## SourceRef Coverage',
          '- totals: 24/24',
        ].join('\n'),
      }),
      consoleLogText:
        '[CM][API] pipelineDecision {"stage":"judgment","detail":"not evaluated (0 genome-linked lessons)"}',
      course: {
        id: 'intro-cs-python',
        title: 'Introduction to Computer Science with Python',
        featureIds: [],
      },
    });

    expect(result.findings).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'P2',
          dimension: 'honesty',
          detail: expect.stringMatching(/judgment was not evaluated/i),
        }),
      ]),
    );
  });

  it('scores in-app run digest caveats that the exported package already admits', async () => {
    const digest = {
      pipeline: {
        genomeLinker: '5 genome + 0 cached of 15 lessons (5 concepts, 6 citations, 0 bridges)',
        knowledgeBackbone: '5/15 lessons genome-linked · 23 open resources',
        judgment: '2 prerequisite gaps (2 bridgeable with cited primers, 0 assumed background) · 2 primers built',
      },
      gates: {
        exportStatus: 'passed',
        exportFailed: 0,
        flaggedChecks: [
          {
            featureId: 'content',
            status: 'failed',
            message: 'partial enrichment (12/15) — lessons 13, 14, 15 fell back to template',
          },
          {
            featureId: 'alignment',
            status: 'info',
            message: '25 additional map assessments have no dedicated artifact (in-class activities)',
          },
        ],
      },
    };
    const result = await grade({
      fileProvider: createMemoryFileProvider({
        'PACKAGE_MANIFEST.json': JSON.stringify({
          courseName: 'Calculus I - Limits and Derivatives',
          lessonScope: 'all',
          assessments: [],
          files: [],
          readiness: { status: 'ready', blockers: 0 },
          pipeline: {
            enrichment: 'ran (12/15 — lessons 13, 14, 15 fell back to template)',
            genomeLinker: '5 genome + 0 cached of 15 lessons (5 concepts, 6 citations, 0 bridges)',
            judgment: '2 prerequisite gaps (2 bridgeable with cited primers, 0 assumed background) · 2 primers built',
          },
        }),
      }),
      honesty: honestyFromDigest(null, digest),
      course: { id: 'calculus-i', title: 'Calculus I - Limits and Derivatives', featureIds: [] },
    });

    expect(result.overall.score).toBeLessThan(99);
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'P1',
          dimension: 'substance',
          detail: expect.stringMatching(/partial enrichment left 3 of 15 lessons/i),
        }),
        expect.objectContaining({
          severity: 'P2',
          dimension: 'identity',
          detail: expect.stringMatching(/25 course-map assessments/i),
        }),
      ]),
    );
  });

  it('scopes console honesty checks to the current digest when DevTools includes prior runs', async () => {
    const currentDigest = {
      runId: 'run-new',
      finishRunId: 'finish-new',
      pipeline: {
        genomeLinker: '4 genome + 0 cached of 15 lessons (4 concepts, 4 citations, 0 bridges)',
        knowledgeBackbone: '4/15 lessons genome-linked · 22 open resources',
        judgment: '4 prerequisite gaps (4 bridgeable with cited primers, 0 assumed background) · 4 primers built',
      },
      gates: {
        exportStatus: 'passed',
        exportFailed: 0,
        flaggedChecks: [
          {
            featureId: 'content',
            status: 'failed',
            message: 'partial enrichment (11/15) — lessons 9, 10, 11, 12 fell back to template',
          },
        ],
      },
    };
    const result = await grade({
      fileProvider: createMemoryFileProvider({
        'PACKAGE_MANIFEST.json': JSON.stringify({
          courseName: 'Introduction to Computer Science with Python',
          lessonScope: 'all',
          assessments: [],
          files: [],
          readiness: { status: 'ready', blockers: 0 },
          pipeline: {
            enrichment: 'ran (11/15 — lessons 9, 10, 11, 12 fell back to template)',
            genomeLinker: '4 genome + 0 cached of 15 lessons (4 concepts, 4 citations, 0 bridges)',
            judgment: '4 prerequisite gaps (4 bridgeable with cited primers, 0 assumed background) · 4 primers built',
          },
        }),
      }),
      consoleLogText: [
        '[CM][API] genomeLink {"detail":"5 genome + 0 cached of 15 lessons (5 concepts, 6 citations, 0 bridges)"}',
        '[CM][DIGEST] {"runId":"run-old","finishRunId":"finish-old","pipeline":{"genomeLinker":"5 genome + 0 cached of 15 lessons","knowledgeBackbone":"5/15 lessons genome-linked"}}',
        '[CM][API] genomeLink {"detail":"4 genome + 0 cached of 15 lessons (4 concepts, 4 citations, 0 bridges)"}',
        `[CM][DIGEST] ${JSON.stringify(currentDigest)}`,
      ].join('\n'),
      digest: currentDigest,
      course: {
        id: 'intro-cs-python',
        title: 'Introduction to Computer Science with Python',
        featureIds: [],
      },
    });

    expect(result.findings).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'P1',
          dimension: 'honesty',
          detail: expect.stringMatching(/genome-linked count disagrees/i),
        }),
      ]),
    );
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'P1',
          dimension: 'substance',
          detail: expect.stringMatching(/partial enrichment left 4 of 15 lessons/i),
        }),
      ]),
    );
  });

  it('flags title-only assignment briefs as substantive package defects', async () => {
    const result = await grade({
      fileProvider: createMemoryFileProvider({
        'PACKAGE_MANIFEST.json': JSON.stringify({
          courseName: 'Introduction to Computer Science with Python',
          lessonScope: 'all',
          assessments: [],
          files: [],
          readiness: { status: 'ready', blockers: 0 },
        }),
        'Assignment Briefs/Lesson 14 - Midterm and project work - Assignment Briefs.md':
          'ASSIGNMENT BRIEFS Introduction to Computer Science with Python - Lesson 14 - Midterm and project work',
      }),
      course: {
        id: 'intro-cs-python',
        title: 'Introduction to Computer Science with Python',
        featureIds: ['assignments'],
      },
    });

    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'P1',
          dimension: 'substance',
          detail: expect.stringMatching(/assignment brief has no substantive/i),
        }),
      ]),
    );
  });

  it('ignores Chrome extension content-script errors when auditing console logs', async () => {
    const result = await grade({
      fileProvider: createMemoryFileProvider({
        'PACKAGE_MANIFEST.json': JSON.stringify({
          courseName: 'Calculus I - Limits and Derivatives',
          lessonScope: 'all',
          assessments: [],
          files: [],
          readiness: { status: 'ready', blockers: 0 },
          pipeline: {
            enrichment: 'ran (15/15)',
            genomeLinker: '5 genome + 0 cached of 15 lessons',
            judgment: 'no gaps across 5 linked concepts',
          },
        }),
      }),
      consoleLogText: [
        "(index):1 Error handling response: TypeError: Cannot read properties of undefined (reading 'config')",
        '    at chrome-extension://pcjdfmihalemjjomplpfbdnicngfnopn/js/content.js:1:777',
        "(index):1 Unchecked runtime.lastError: Uncaught TypeError: Cannot read properties of null (reading 'privUrl')",
      ].join('\n'),
      digest: {
        gates: { exportStatus: 'passed', exportFailed: 0, flaggedChecks: [] },
      },
      course: { id: 'calculus-i', title: 'Calculus I - Limits and Derivatives', featureIds: [] },
    });

    expect(result.findings).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          dimension: 'honesty',
          detail: expect.stringMatching(/unexplained console error/i),
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

describe('v0.15.11 prompt-artifact contamination regressions', () => {
  it('flags assessment-label lesson identities before they can look like a clean package', async () => {
    const result = await grade({
      fileProvider: createMemoryFileProvider({
        'PACKAGE_MANIFEST.json': JSON.stringify({
          courseName: 'User Experience Design Studio',
          lessonScope: 'all',
          assessments: [
            { id: 'A1.1', title: 'Evidence check: Studio critique (9%) evidence memo.', weightPct: 9 },
            { id: 'A2.1', title: 'Applied problem: Studio critique (9%) annotation.', weightPct: 9 },
          ],
          files: [],
          readiness: { status: 'ready', blockers: 0 },
        }),
        'Lesson Plans/Lesson 01 - evidence check - Studio critique (9%) - Lesson Plans.md': [
          '# User Experience Design Studio - Lesson 01 - evidence check - Studio critique (9%) - Lesson Plans',
          'Course Map L1. Students prepare critique evidence and revision notes.',
        ].join('\n'),
        'Course FAQ/Lesson 01 - evidence check - Studio critique (9%) - Course FAQ.md': [
          '# Lesson 1 FAQ',
          'Students review critique evidence and revision choices.',
        ].join('\n'),
        'Study Guides/Lesson 02 - applied problem - Studio critique (9%) - Study Guides.md': [
          '# Lesson 2 Study Guide',
          'Students connect critique feedback to design choices.',
        ].join('\n'),
        'Slide Decks/Lesson 03 - practice brief - Studio critique (9%) - Slide Decks.md': [
          '# Lesson 3 Slides',
          'Students rehearse critique claims with evidence.',
        ].join('\n'),
      }),
      course: {
        id: 'ux-design-studio',
        title: 'User Experience Design Studio',
        featureIds: ['lessonPlans', 'courseFaq', 'studyGuides', 'slideDecks'],
      },
    });

    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'P1',
          dimension: 'identity',
          detail: expect.stringMatching(/assessment labels or grading weights are being used as lesson identities/i),
          evidence: expect.stringMatching(/evidence check - Studio critique \(9%\)/i),
        }),
      ]),
    );
    expect(result.overall.score).toBeLessThan(100);
  });

  it('blocks packages that use requested deliverable labels as lesson concepts', async () => {
    const result = await grade({
      fileProvider: createMemoryFileProvider({
        'PACKAGE_MANIFEST.json': JSON.stringify({
          courseName: 'Introduction to Environmental Science: Climate, Ecology, and Sustainability',
          lessonScope: 'all',
          assessments: [],
          files: [],
          readiness: { status: 'ready', blockers: 0 },
        }),
        'Course Map/Introduction to Environmental Science - Course Map.md': [
          '# Course Map',
          'Lesson 1: Ecosystems',
          '1.1: ecosystems',
          'Supporting resources: evidence-rich lesson plans; slide decks; assignment briefs; rubrics; discussion prompts',
          '1.2: evidence-rich lesson plans',
          '1.3: slide decks',
          'Lesson 5: Environmental justice',
          '5.2: course FAQ',
        ].join('\n'),
        'Study Guides/Lesson 01 - Ecosystems - Study Guides.md': [
          '# Lesson 1: Ecosystems',
          'Use this guide to prepare for week 1 checks on ecosystems, evidence-rich lesson plans, slide decks and later assessments.',
          'Concept summary: Lesson 1 focuses on evidence-rich lesson plans, slide decks.',
        ].join('\n'),
      }),
      course: {
        id: 'environmental-science',
        title: 'Introduction to Environmental Science: Climate, Ecology, and Sustainability',
        featureIds: ['courseMap', 'studyGuides'],
      },
    });

    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'P0',
          dimension: 'substance',
          detail: expect.stringMatching(/prompt artifact labels used as lesson concepts/i),
        }),
      ]),
    );
    expect(result.overall.score).toBeLessThanOrEqual(74);
  });

  it('does not flag instructional-design courses that explicitly teach those artifact genres', async () => {
    const result = await grade({
      fileProvider: createMemoryFileProvider({
        'PACKAGE_MANIFEST.json': JSON.stringify({
          courseName: 'Instructional Design Studio: Assessment and Course Artifacts',
          lessonScope: 'all',
          assessments: [],
          files: [],
          readiness: { status: 'ready', blockers: 0 },
        }),
        'Course Map/Instructional Design Studio - Course Map.md': [
          '# Course Map',
          'Lesson 1: Rubrics and Assignment Briefs',
          '1.1: rubrics',
          '1.2: assignment briefs',
          'Students compare rubric criteria with assignment briefs.',
        ].join('\n'),
      }),
      course: {
        id: 'instructional-design-studio',
        title: 'Instructional Design Studio: Assessment and Course Artifacts',
        featureIds: ['courseMap'],
      },
    });

    expect(result.findings).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          detail: expect.stringMatching(/prompt artifact labels/i),
        }),
      ]),
    );
  });

  it('does not flag worked examples when they are supporting resources, not lesson concepts', async () => {
    const result = await grade({
      fileProvider: createMemoryFileProvider({
        'PACKAGE_MANIFEST.json': JSON.stringify({
          courseName: 'Introductory Astronomy: Stars, Planets, and the Observable Universe',
          lessonScope: 'all',
          assessments: [],
          files: [],
          readiness: { status: 'ready', blockers: 0 },
        }),
        'Course FAQ/Lesson 03 - Solar system formation - Course FAQ.md': [
          '# Course FAQ',
          'Q1. What should I focus on for Lesson 3: Solar system formation?',
          'Focus on Solar system formation, how temperature differences shaped planet types, accretion outcomes for rocky, then connect those ideas to Practice response that names the evidence needed for solar system formation. Strong work uses Worked examples, readings, or activity sheets aligned to Solar system formation.',
        ].join('\n'),
      }),
      course: {
        id: 'introductory-astronomy',
        title: 'Introductory Astronomy: Stars, Planets, and the Observable Universe',
        featureIds: ['courseFaq'],
      },
    });

    expect(result.findings).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          detail: expect.stringMatching(/prompt artifact labels/i),
        }),
      ]),
    );
  });

  it('does not flag legitimate UX capstone presentations as prompt-artifact labels', async () => {
    const result = await grade({
      fileProvider: createMemoryFileProvider({
        'PACKAGE_MANIFEST.json': JSON.stringify({
          courseName: 'User Experience Design Studio',
          lessonScope: 'all',
          assessments: [],
          files: [],
          readiness: { status: 'ready', blockers: 0 },
        }),
        'Course FAQ/Lesson 12 - Portfolio-ready capstone presentation - Course FAQ.md': [
          '# Course FAQ',
          'Q1. What should I focus on for Lesson 12: Portfolio-ready capstone presentation?',
          'Focus on Portfolio-ready capstone presentation, final presentation, and coherent portfolio evidence.',
          'Strong work explains which usability findings changed the capstone presentation and why.',
        ].join('\n'),
      }),
      course: {
        id: 'ux-design-studio',
        title: 'User Experience Design Studio',
        featureIds: ['courseFaq'],
      },
    });

    expect(result.findings).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          detail: expect.stringMatching(/prompt artifact labels/i),
        }),
      ]),
    );
  });

  it('flags raw PPTX visual-planning labels as exported scaffolding', async () => {
    const result = await grade({
      fileProvider: createMemoryFileProvider({
        'PACKAGE_MANIFEST.json': JSON.stringify({
          courseName: 'User Experience Design Studio',
          lessonScope: 'all',
          assessments: [],
          files: [],
          readiness: { status: 'ready', blockers: 0 },
        }),
        'Slide Decks/Lesson 12 - Portfolio-ready capstone presentation - Slide Decks.pptx': await pptxWithNotes(
          'SUGGESTED VISUAL (learning-thread timeline): Trace the evidence thread. ALT TEXT: Timeline for the capstone presentation.',
        ),
      }),
      course: {
        id: 'ux-design-studio',
        title: 'User Experience Design Studio',
        featureIds: ['slideDecks'],
      },
    });

    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'P0',
          dimension: 'format',
          detail: expect.stringMatching(/raw PPTX visual-note labels/i),
        }),
      ]),
    );
  });
});
