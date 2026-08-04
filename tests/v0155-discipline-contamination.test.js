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

  it('preserves an observing promise from the source brief when a small model compresses it out of the map', () => {
    const compressedMap = {
      courseName: 'Introduction to Astronomy',
      lessons: [
        {
          title: 'Lesson 1: Diurnal Motion Mechanics',
          sections: [
            {
              topicSection: "1.1: Earth's Rotation Vector",
              learningObjectives: "Explain Earth's rotation.",
              weeklyAssessments: 'Quick evidence check.',
            },
          ],
        },
      ],
    };
    const blueprint = buildCourseBlueprint(compressedMap, {
      sourceBrief:
        'Introduction to Astronomy, with diurnal motion, seasons, phases of the Moon, and evening observing sessions.',
    });
    const compiled = compileBlueprintDeliverables(blueprint, ['syllabus', 'lessonPlans']);

    expect(blueprint.coursePromises).toEqual({ skyObservation: true });
    expect(compiled.lessonPlans.lessonPlans[0].observationProtocol?.cloudyAlternative).toMatch(/Stellarium/);
    expect(compiled.lessonPlans.lessonPlans[0].observationProtocol?.logFields.join(' ')).toMatch(
      /observing location|limiting magnitude/i,
    );
    expect(compiled.syllabus.syllabus.signatureExperience).toMatchObject({
      title: 'Evening Observation Sessions',
    });
    expect(JSON.stringify(compiled.syllabus.syllabus.signatureExperience)).toMatch(
      /observing log|cloudy-night|Stellarium|partner/i,
    );
    expect(compiled.syllabus.syllabus.weeklySchedule[0].assignments).toMatch(/Evening observation:/);
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

  it('keeps a promised protocol through finalization when the small model compresses observing out of the map', () => {
    const compressedMap = {
      courseName: 'Introduction to Astronomy',
      lessons: [
        {
          title: 'Lesson 1: Diurnal Motion',
          sections: [{ topicSection: 'Earth rotation', learningObjectives: 'Explain apparent daily motion.' }],
        },
      ],
    };
    const data = {
      lessonPlans: [
        {
          lessonTitle: 'Lesson 1: Diurnal Motion',
          observationProtocol: buildObservationProtocol({
            courseName: compressedMap.courseName,
            lessons: compressedMap.lessons,
            lesson: compressedMap.lessons[0],
            promised: true,
          }),
        },
      ],
    };

    const repaired = repairMisappliedObservationProtocols({
      courseName: compressedMap.courseName,
      lessons: compressedMap.lessons,
      sourceText: 'Astronomy with evening observing sessions.',
      data,
    });

    expect(repaired.changed).toBe(false);
    expect(repaired.data.lessonPlans[0].observationProtocol?.cloudyAlternative).toMatch(/Stellarium/);
  });
});

describe('foreign-domain contamination quality gate', () => {
  it('blocks the canned linear-algebra fallback inside an astronomy deck', async () => {
    const result = await grade({
      fileProvider: createMemoryFileProvider({
        'Slide Decks/Lesson 01 - Diurnal Motion - Slide Decks.txt':
          'Worked example: Solve the system x + y = 3 and x - y = 1. Step 1: Add the equations: 2x = 4. Step 2: Solve x = 2. The solution is (2, 1).',
      }),
      course: { title: 'Introduction to Astronomy' },
    });

    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'P0',
          dimension: 'discipline',
          detail: expect.stringMatching(/foreign linear-algebra worked example/i),
        }),
      ]),
    );
    expect(result.overall.grade).not.toBe('A');
  });

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

  it('grades music and poetry metre sources propagated through a film-editing lesson as a P0', async () => {
    const result = await grade({
      fileProvider: createMemoryFileProvider({
        'Slide Decks/Lesson 03 - Editing rhythms - Slide Decks.txt':
          'Editing rhythms. Evidence: Metre (music). Meter may be defined as a regular recurring pattern of strong and weak beats. In Indian music, tala organizes rhythmic cycles; compare triple metre and additive rhythm before revising the cut.',
      }),
      course: { title: 'Film Form and Cultural Analysis', probeProfile: 'generic' },
    });

    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'film-editing-music-metre-contamination',
          severity: 'P0',
          dimension: 'discipline',
          detail: expect.stringMatching(/foreign music\/poetry metre content/i),
        }),
      ]),
    );
    expect(result.scores.discipline).toBeLessThan(100);
    expect(result.overall.grade).not.toBe('A');
  });

  it('blocks mathematical interval definitions inside an abstractly titled music package', async () => {
    const result = await grade({
      fileProvider: createMemoryFileProvider({
        'Study Guides/Lesson 02 - Simple Compound Intervals - Study Guides.txt':
          'Pitch and semitone evidence distinguishes interval quality. A major third spans four semitones. A simple interval is represented by a single continuous segment on the real number line.',
        'Course FAQ/Lesson 02 - Simple Compound Intervals - Course FAQ.txt':
          'Simple intervals are defined by their basic structure and relationship between start and end points. Compound intervals require the combination of two or more simple intervals into a larger structure.',
      }),
      course: { title: 'Interval Evidence Studio' },
    });

    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'P0',
          dimension: 'discipline',
          detail: expect.stringMatching(/foreign mathematical-interval definition/i),
        }),
      ]),
    );
    expect(result.overall.grade).not.toBe('A');
  });

  it('blocks subtler start/end-point and simple-combination definitions in a music FAQ', async () => {
    const result = await grade({
      fileProvider: createMemoryFileProvider({
        'Course FAQ/Lesson 02 - Simple Compound Intervals - Course FAQ.txt':
          'Pitch and semitone evidence distinguishes musical interval quality. Simple intervals are defined by their basic structure and relationship between start and end points. Compound intervals require the combination of two or more simple intervals into a larger structure.',
      }),
      course: { title: 'Interval Evidence Studio' },
    });

    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'P0',
          dimension: 'discipline',
          evidence: expect.stringMatching(/start and end points|two or more simple intervals/i),
        }),
      ]),
    );
    expect(result.overall.grade).not.toBe('A');
  });

  it('does not award an A when abstract music lessons retain medical or design false-friend readings', async () => {
    const result = await grade({
      fileProvider: createMemoryFileProvider({
        'Syllabus/Interval Evidence Studio - Syllabus.txt': [
          'INTERVAL EVIDENCE STUDIO — SYLLABUS',
          'WEEKLY READINGS',
          'Week 1: Alannah Oleson et al. (2022). Teaching Inclusive Design Skills with the CIDER Assumption Elicitation Technique.',
          'Week 2: Rebecca Payne et al. (2021). Immunogenicity of standard and extended dosing intervals of BNT162b2 mRNA vaccine.',
          'Week 2: Dwi Agustini and Siti Cholifah (2026). Analysis of Premature Rupture of Membranes Interval on Types of Labor. https://doi.org/10.21070/ups.10391',
        ].join('\n'),
        'Study Guides/Lesson 01 - Interval Quality - Study Guides.txt':
          'A semitone verifies the chromatic size of a notated musical interval.',
      }),
      course: { title: 'Interval Evidence Studio' },
    });

    const citationFindings = result.findings.filter((finding) => finding.dimension === 'citations');
    expect(citationFindings.length).toBeGreaterThanOrEqual(3);
    expect(citationFindings.map((finding) => finding.evidence).join(' ')).toMatch(
      /CIDER Assumption|BNT162b2|Premature Rupture of Membranes/,
    );
    expect(result.overall.grade).not.toBe('A');
  });

  it('grades Korean teaching content as a P0 in Mandarin without rejecting a Korean-speakers citation', async () => {
    const contaminated = await grade({
      fileProvider: createMemoryFileProvider({
        'Lesson Plans/Lesson 04 - Numbers - Lesson Plans.txt':
          'Korean commonly uses two number systems: native Korean and Sino-Korean. Students review Hangul counters before stating age.',
      }),
      course: { title: 'Elementary Mandarin Chinese I' },
    });
    expect(contaminated.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'P0',
          dimension: 'discipline',
          detail: expect.stringMatching(/foreign Korean-language teaching content/i),
        }),
      ]),
    );

    const citationOnly = await grade({
      fileProvider: createMemoryFileProvider({
        'Syllabus/Elementary Mandarin Chinese I - Syllabus.txt':
          'The Second Language Acquisition of Mandarin Chinese Tones by English, Japanese and Korean Speakers.',
      }),
      course: { title: 'Elementary Mandarin Chinese I' },
    });
    expect(
      citationOnly.findings.some((finding) => /foreign Korean-language teaching content/i.test(finding.detail)),
    ).toBe(false);
  });

  it('measures Mandarin target-language depth per lesson instead of letting one dense file mask the course', async () => {
    const files = {
      'Lesson Plans/Lesson 01 - Greetings - Lesson Plans.txt': 'Practice 你好 (nǐ hǎo) in a short exchange.',
      'Lesson Plans/Lesson 02 - Family - Lesson Plans.txt': 'Practice family vocabulary in pairs.',
      'Lesson Plans/Lesson 03 - Time - Lesson Plans.txt': 'Practice telling time in pairs.',
      'Lesson Plans/Lesson 04 - Food - Lesson Plans.txt': 'Practice ordering food in pairs.',
      'Study Guides/Lesson 01 - Greetings - Study Guides.txt': '你好 (nǐ hǎo) means hello.',
      'Study Guides/Lesson 02 - Family - Study Guides.txt': 'Review the family vocabulary list.',
      'Study Guides/Lesson 03 - Time - Study Guides.txt': 'Review the time expressions.',
      'Study Guides/Lesson 04 - Food - Study Guides.txt': 'Review the menu expressions.',
    };
    const result = await grade({
      fileProvider: createMemoryFileProvider(files),
      course: {
        title: 'Elementary Mandarin Chinese I',
        prompt: 'Use actual hanzi alongside tone-marked pinyin throughout.',
      },
    });

    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'P0',
          dimension: 'discipline',
          detail: expect.stringMatching(
            /coverage reaches 1\/4 lessons; 3 lesson\(s\) lack hanzi with tone-marked pinyin/,
          ),
        }),
        expect.objectContaining({
          severity: 'P1',
          dimension: 'discipline',
          detail: '3/4 study guides do not pair hanzi with tone-marked pinyin',
        }),
      ]),
    );
  });

  it('accepts tone-marked Pinyin without forcing unsupported Hanzi in a Pinyin-only brief', async () => {
    const files = {
      'Lesson Plans/Lesson 01 - Pinyin and Tones - Lesson Plans.txt':
        'Compare mā, má, mǎ, and mà. The first tone is high and level, the second rises, the third dips then rises, and the fourth falls sharply.',
      'Slide Decks/Lesson 01 - Pinyin and Tones - Slide Decks.txt':
        'Listen for mā, má, mǎ, and mà; identify each contour before producing it.',
      'Study Guides/Lesson 01 - Pinyin and Tones - Study Guides.txt':
        'Review mā, má, mǎ, and mà by tracing the four tone contours and checking a recording.',
    };
    const result = await grade({
      fileProvider: createMemoryFileProvider(files),
      course: {
        title: 'Elementary Mandarin',
        prompt:
          'One lesson on Pinyin and Tones. Use only supplied facts about initials, finals, and the four tone contours.',
      },
    });

    expect(result.findings.some((finding) => /lack hanzi|do not pair hanzi/i.test(finding.detail))).toBe(false);
    expect(result.findings.some((finding) => /target-language coverage/i.test(finding.detail))).toBe(false);
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
