import { describe, expect, it } from 'vitest';

import { buildCourseBlueprint, compileBlueprintDeliverables } from '../src/lib/courseBlueprintCompiler.js';
import {
  buildObservationProtocol,
  detectSkyObservationCourse,
  repairMisappliedObservationProtocols,
} from '../src/lib/observationProtocols.js';
import { applyQualityToFinalizerResult, runDeterministicPackageFinalizer } from '../src/lib/packageFinalizer.js';
import { grade } from '../src/lib/quality/deepQualityGrader.js';
import { createMemoryFileProvider } from '../src/lib/quality/fileProviders.js';

const EDUCATIONAL_PSYCH_COURSE = {
  courseName: 'Educational Psychology',
  lessons: [
    {
      title: 'Lesson 1: Classroom observation logs',
      sections: [
        {
          topicSection: '1.1: classroom observation logs',
          learningObjectives: 'Record objective field notes about classroom events.',
          weeklyAssessments: 'Classroom observation log entry.',
          asyncActivities: 'Read about observation notes and teacher reflection.',
          syncActivities: 'Practice separating description from interpretation.',
        },
      ],
    },
  ],
};

const ASTRONOMY_COURSE = {
  courseName: 'Introduction to Astronomy',
  lessons: [
    {
      title: 'Lesson 1: Motions of the Sky',
      sections: [
        {
          topicSection: '1.1: celestial sphere and night-sky observing',
          learningObjectives: 'Use observations to explain apparent sky motion.',
          weeklyAssessments: 'Night-sky observation log entry.',
          asyncActivities: 'Read about the celestial sphere.',
          syncActivities: 'Planetarium practice with a sky chart.',
        },
      ],
    },
  ],
};

describe('discipline-safe observation protocols', () => {
  it('does not treat classroom observation logs as sky-observation work', () => {
    expect(detectSkyObservationCourse(EDUCATIONAL_PSYCH_COURSE)).toBe(false);
    expect(buildObservationProtocol({ ...EDUCATIONAL_PSYCH_COURSE, lesson: EDUCATIONAL_PSYCH_COURSE.lessons[0] })).toBe(
      null,
    );

    const blueprint = buildCourseBlueprint(EDUCATIONAL_PSYCH_COURSE);
    const compiled = compileBlueprintDeliverables(blueprint, ['lessonPlans']);
    const planText = JSON.stringify(compiled.lessonPlans.lessonPlans);
    expect(planText).not.toMatch(/observationProtocol|Stellarium|telescope|naked-eye|light-pollution/i);
  });

  it('keeps the concrete protocol for true night-sky observation courses', () => {
    expect(detectSkyObservationCourse(ASTRONOMY_COURSE)).toBe(true);
    const protocol = buildObservationProtocol({ ...ASTRONOMY_COURSE, lesson: ASTRONOMY_COURSE.lessons[0] });
    expect(protocol?.cloudyAlternative).toMatch(/Stellarium/);
    expect(protocol?.logFields.join(' ')).toMatch(/telescope|limiting magnitude/i);
  });

  it('repairs stale sky protocols in non-sky lesson plan data only', () => {
    const data = {
      lessonPlans: [
        {
          lessonTitle: 'Lesson 1: Classroom observation logs',
          observationProtocol: {
            weeklyFocus: 'Spend 15 minutes naked-eye observing.',
            cloudyAlternative: 'Cloudy night: run the same session in Stellarium.',
          },
        },
      ],
    };

    const repaired = repairMisappliedObservationProtocols({ ...EDUCATIONAL_PSYCH_COURSE, data });
    const arrayRepaired = repairMisappliedObservationProtocols({ ...EDUCATIONAL_PSYCH_COURSE, data: data.lessonPlans });
    const astronomy = repairMisappliedObservationProtocols({ ...ASTRONOMY_COURSE, data });

    expect(repaired.changed).toBe(true);
    expect(repaired.removedCount).toBe(1);
    expect(repaired.data.lessonPlans[0].observationProtocol).toBeUndefined();
    expect(arrayRepaired.changed).toBe(true);
    expect(arrayRepaired.data[0].observationProtocol).toBeUndefined();
    expect(astronomy.changed).toBe(false);
    expect(astronomy.data.lessonPlans[0].observationProtocol).toBeDefined();
  });
});

describe('foreign-domain contamination quality gate', () => {
  it('grades leaked astronomy observation protocol as a P0 in Educational Psychology', async () => {
    const result = await grade({
      fileProvider: createMemoryFileProvider({
        'Lesson Plans/Lesson 01 - Classroom observation logs - Lesson Plans.txt':
          'OBSERVATION PROTOCOL THIS WEEK Spend 15 minutes naked-eye observing. Date, time, and observing location. Sky conditions: cloud cover, and limiting magnitude as a light-pollution estimate. Instrument: naked eye, binoculars, or telescope. Cloudy night: use Stellarium.',
      }),
      course: { title: 'Educational Psychology' },
    });

    const contamination = result.findings.find((finding) =>
      /foreign astronomy observation protocol/i.test(finding.detail),
    );
    expect(contamination).toMatchObject({
      severity: 'P0',
      dimension: 'discipline',
      file: 'Lesson Plans/Lesson 01 - Classroom observation logs - Lesson Plans.txt',
    });
    expect(result.stats.p0).toBeGreaterThanOrEqual(1);
    expect(result.overall.grade).not.toBe('A');
  });

  it('grades leaked music-theory quiz content as a P0 in Business Ethics but not in a music course', async () => {
    const files = {
      'Quiz & Exam Bank/Lesson 01 - Ethics - Quiz.txt':
        'When analyzing a Baroque counterpoint passage, what distinguishes species counterpoint from a fugal texture? A composer uses two independent melodic lines.',
    };
    const business = await grade({
      fileProvider: createMemoryFileProvider(files),
      course: { title: 'Business Ethics', probeProfile: 'generic' },
    });
    const music = await grade({
      fileProvider: createMemoryFileProvider(files),
      course: { title: 'Music Theory' },
    });

    expect(business.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'P0',
          dimension: 'discipline',
          detail: expect.stringMatching(/foreign music-theory content/i),
        }),
      ]),
    );
    expect(music.findings.some((finding) => /foreign music-theory content/i.test(finding.detail))).toBe(false);
  });

  it('uses manifest course identity when offline grading has no explicit course object', async () => {
    const result = await grade({
      fileProvider: createMemoryFileProvider({
        'Course FAQ/Lesson 01 - Staff and Notation - Course FAQ.txt':
          'The composer needs to write a short melodic line using staff notation.',
        'PACKAGE_MANIFEST.json': JSON.stringify({ courseName: 'Music Theory Fundamentals' }),
      }),
    });

    expect(result.findings.some((finding) => /foreign music-theory content/i.test(finding.detail))).toBe(false);
  });

  it('turns any quality P0 into a readiness blocker', () => {
    const result = applyQualityToFinalizerResult(
      {
        readiness: {
          status: 'ready',
          isBlocked: false,
          blockers: [],
          warnings: [],
          issues: [],
        },
      },
      {
        status: 'graded',
        score: 75,
        grade: 'C',
        findingCounts: { p0: 1, p1: 0, p2: 0 },
      },
    );

    expect(result.readiness.status).toBe('blocked');
    expect(result.readiness.blockers).toHaveLength(1);
    expect(result.readiness.blockers[0]).toMatchObject({
      severity: 'blocker',
      source: 'qualityGate',
    });
  });

  it('auto-repairs stale sky protocols during finish package', () => {
    const result = runDeterministicPackageFinalizer({
      courseMap: EDUCATIONAL_PSYCH_COURSE,
      selectedFeatures: ['lessonPlans'],
      includeClassroomReadiness: false,
      includePedagogicalValidation: false,
      retryWarnings: false,
      deliverables: {
        lessonPlans: {
          status: 'done',
          data: {
            lessonPlans: [
              {
                lessonTitle: 'Lesson 1: Classroom observation logs',
                objectives: ['Record objective field notes about classroom events.'],
                observationProtocol: {
                  logFields: [
                    'Sky conditions: cloud cover, and limiting magnitude as a light-pollution estimate',
                    'Instrument: naked eye, binoculars, or telescope',
                  ],
                  cloudyAlternative: 'Cloudy night: use Stellarium.',
                },
              },
            ],
          },
        },
      },
    });

    expect(result.repairs).toContainEqual(
      expect.objectContaining({
        featureId: 'lessonPlans',
        changes: ['removed 1 misapplied sky-observation protocol(s)'],
      }),
    );
    expect(result.deliverables.lessonPlans.data.lessonPlans[0].observationProtocol).toBeUndefined();
  });
});
