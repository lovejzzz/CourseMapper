import { describe, expect, it } from 'vitest';
import { buildScionCourseAnswer, __private__ } from '../scionCourseAnswer';
import { buildScionAssignedSourceAnswer } from '../scionAssignedSourceAnswer';
import { buildScionCourseSequenceAnswer } from '../scionCourseSequenceAnswer';
import { buildScionNamedReadingAnswer } from '../scionNamedReadingAnswer';

const courseMap = {
  lessons: [
    { title: 'Lesson 1: Atmospheric Chemistry', sections: [] },
    {
      title: 'Lesson 2: Water Quality',
      sections: [
        {
          topicSection: 'Water Quality',
          learningObjectives: 'Evaluate water quality metrics. Design water quality tests.',
        },
      ],
    },
  ],
};

const deliverables = {
  studyGuides: {
    status: 'done',
    data: {
      studyGuides: [
        { lessonTitle: 'Lesson 1: Atmospheric Chemistry', keyTerms: [] },
        {
          lessonTitle: 'Lesson 2: Water Quality',
          keyTerms: [
            {
              term: 'Water quality',
              definition: 'Water quality monitoring combines physical, chemical, and biological parameters.',
              example:
                'A stream team pairs dissolved oxygen and temperature with nutrient and habitat observations before judging a suspected impairment.',
            },
            {
              term: 'Dissolved oxygen',
              definition:
                'Dissolved oxygen is interpreted using both concentration and saturation while accounting for environmental conditions.',
            },
          ],
          misconceptions: [
            {
              misconception:
                'Students may compare dissolved oxygen readings without checking temperature, pressure, salinity, or sampling time.',
              correction:
                'Interpret each reading in its physical context and distinguish concentration from percent saturation.',
            },
          ],
        },
      ],
    },
  },
};

describe('buildScionCourseAnswer', () => {
  it('answers an explicit comparison from lesson-scoped compiled evidence', () => {
    const result = buildScionCourseAnswer({
      question: 'Which two water-quality measurements should students compare in Lesson 2, and why?',
      courseMap,
      deliverables,
    });

    expect(result?.text).toContain('**dissolved oxygen** and **temperature**');
    expect(result?.text).toContain('physical context');
    expect(result?.text).not.toContain('Students may assume that more samples');
    expect(result?.text).toContain('Lesson 2: Water Quality · Study Guides');
    expect(result).toMatchObject({ kind: 'course-evidence', lessonNumber: 2 });
  });

  it('answers assigned-source questions locally with links and honest claim boundaries', () => {
    const result = buildScionAssignedSourceAnswer({
      question: 'Which assigned sources support accessible forms, and what can each source establish?',
      courseMap: {
        courseName: 'Digital Accessibility for Product Teams',
        lessons: [
          {
            title: 'Lesson 1: WCAG principles',
            sections: [],
          },
          {
            title: 'Lesson 2: accessible forms',
            sections: [
              {
                supportingResources:
                  '1. Accessible forms (official accessibility standard and tutorial, W3C permissive license — https://www.w3.org/WAI/tutorials/forms/) 2. Labels (official accessibility standard and tutorial, W3C permissive license — https://www.w3.org/WAI/tutorials/forms/labels/)',
              },
            ],
          },
        ],
      },
      deliverables: {},
    });

    expect(result).toMatchObject({ kind: 'course-evidence', lessonNumber: 2 });
    expect(result?.text).toContain('**Accessible forms**');
    expect(result?.text).toContain('**Labels**');
    expect(result?.text).toContain('https://www.w3.org/WAI/tutorials/forms/');
    expect(result?.text).toContain('do not by themselves prove');
  });

  it('falls through for edits and unsupported synthesis questions', () => {
    expect(
      buildScionCourseAnswer({
        question: 'Change Lesson 2 so students compare two measurements.',
        courseMap,
        deliverables,
      }),
    ).toBeNull();
    expect(
      buildScionCourseAnswer({
        question: 'What is the best new case study for Lesson 2?',
        courseMap,
        deliverables,
      }),
    ).toBeNull();
  });

  it('does not answer from a different lesson when the requested lesson lacks evidence', () => {
    expect(
      buildScionCourseAnswer({
        question: 'Which two measurements should students compare in Lesson 1, and why?',
        courseMap,
        deliverables,
      }),
    ).toBeNull();
  });

  it('answers why-and-where questions from the strongest compiled lesson fact', () => {
    const result = buildScionCourseAnswer({
      question: 'Why does axial tilt cause seasons, and where is that taught in this package?',
      courseMap: {
        courseName: 'Introduction to Astronomy',
        lessons: [
          { title: 'Lesson 1: Diurnal Motion', sections: [] },
          { title: 'Lesson 2: Seasons and Axial Tilt', sections: [] },
        ],
      },
      deliverables: {
        studyGuides: {
          status: 'done',
          data: {
            studyGuides: [
              { lessonTitle: 'Lesson 1: Diurnal Motion', summary: 'Earth rotates once per day.' },
              {
                lessonTitle: 'Lesson 2: Seasons and Axial Tilt',
                summary:
                  "Earth's seasons are caused by the 23.5° tilt of its rotation axis, which changes the directness of sunlight and the length of daylight through the year — not by changes in Earth's distance from the Sun.",
                keyTerms: [
                  {
                    term: 'Axial tilt',
                    definition: 'Axial tilt changes solar angle and daylight duration over the year.',
                  },
                ],
              },
            ],
          },
        },
        courseFaq: {
          status: 'done',
          data: {
            faqs: [
              { lessonTitle: 'Lesson 1: Diurnal Motion', qs: [] },
              {
                lessonTitle: 'Lesson 2: Seasons and Axial Tilt',
                qs: [
                  {
                    q: 'Why do seasons occur?',
                    an: 'Axial tilt changes sun angle and day length, producing the seasonal cycle.',
                  },
                ],
              },
            ],
          },
        },
        lessonPlans: {
          status: 'done',
          data: {
            lessonPlans: [
              { lessonTitle: 'Lesson 1: Diurnal Motion', outline: [] },
              {
                lessonTitle: 'Lesson 2: Seasons and Axial Tilt',
                outline: [
                  {
                    instructorNotes: 'Ask which Seasons and axial tilt evidence changes midterm.',
                  },
                  {
                    instructorNotes:
                      'Students think seasons are caused mainly by distance.] 16 minutes - Evidence-backed team decision: Small groups choose a side and support the choice.',
                  },
                  {
                    instructorNotes:
                      "Seed the two camps if teams converge: use Earth's distance as one interpretation versus axial tilt as the evidence-backed account.",
                  },
                  {
                    instructorNotes:
                      "Students think seasons are caused mainly by Earth's changing distance from the Sun → Seasons come from sun angle and day length changing with the 23.5° axial tilt — Earth is actually closest to the Sun in January.",
                  },
                ],
              },
            ],
          },
        },
      },
    });

    expect(result?.text).toMatch(/23\.5° tilt|directness of sunlight|daylight/i);
    expect(result?.text).toContain('Lesson 2: Seasons and Axial Tilt');
    expect(result?.text).toContain('Study Guides');
    expect(result?.text).not.toMatch(/broader course objectives|course structure links/i);
    expect(result?.text).not.toMatch(/Ask which .* evidence changes/i);
    expect(result?.text).not.toMatch(/\]\s*16 minutes|Small groups|team decision/i);
    expect(result?.text).not.toMatch(/Seed the two camps/i);
    expect(result?.text).not.toMatch(/Students think|→/i);
    expect(result).toMatchObject({ kind: 'course-evidence', lessonNumber: 2 });
  });

  it('answers admitted Mandarin pronunciation questions from the compiled quiz ledger', () => {
    const result = buildScionCourseAnswer({
      question:
        'What does 妈 (mā) mean, how should a beginner pronounce it, and which exact lesson fact supports the answer?',
      courseMap: { courseName: 'Elementary Mandarin Chinese I' },
      deliverables: {
        quizBank: {
          data: {
            quizzes: [
              {
                questions: [
                  {
                    question: 'What does 妈 (mā) mean in this lesson?',
                    options: ['A. 妈', 'B. mother', 'C. mā', 'D. Not specified'],
                    answer: 'B',
                  },
                  {
                    question:
                      'Choose the language principle that best organizes this lesson detail: “The first tone in mā is produced with a high, level pitch contour.” Cite the exact detail as evidence.',
                  },
                ],
              },
            ],
          },
        },
      },
    });

    expect(result?.text).toBe(
      '妈 (mā) means “mother.” Use mā as the exact tone-marked pronunciation guide. The supporting lesson fact is: “The first tone in mā is produced with a high, level pitch contour.”',
    );
    expect(result?.text).not.toMatch(/\\bar|latex/i);
    expect(result).toMatchObject({ kind: 'course-evidence', sources: ['Quiz & Exam Bank'] });
  });

  it('summarizes every week with the exact assigned readings from the compiled syllabus', () => {
    const result = buildScionCourseSequenceAnswer({
      question: 'Summarize the eight-week course sequence and name the assigned reading for each week.',
      courseMap: {
        courseName: 'World Literature Survey',
        lessons: [
          { title: 'Lesson 1: Narrative Structure: Gilgamesh', sections: [] },
          { title: 'Lesson 2: Narrative Structure: The Odyssey', sections: [] },
          { title: 'Lesson 3: Narrative Structure: Antigone', sections: [] },
          { title: 'Lesson 4: Poetry: Li Bai and Du Fu', sections: [] },
          { title: 'Lesson 5: Narrative Structure: The Thousand and One Nights', sections: [] },
          { title: 'Lesson 6: Narrative Structure: Dante’s Inferno', sections: [] },
          { title: 'Lesson 7: Narrative Structure: Things Fall Apart', sections: [] },
          { title: "Lesson 8: Narrative Structure: Borges's Library", sections: [] },
        ],
      },
      deliverables: {
        syllabus: {
          status: 'done',
          data: {
            syllabus: {
              requiredTexts: [
                { title: 'The Epic of Gilgamesh' },
                { title: 'The Odyssey' },
                { title: 'Antigone' },
                { title: 'Selected poems by Li Bai and Du Fu' },
                { title: 'The Thousand and One Nights' },
                { title: 'Dante’s Inferno' },
                { title: 'Things Fall Apart' },
                { title: 'The Library of Babel' },
              ],
              weeklySchedule: [
                { week: 'Week 1', topic: 'Gilgamesh', readings: 'The Epic of Gilgamesh' },
                {
                  week: 'Week 2',
                  topic: 'The Odyssey',
                  readings:
                    'The Odyssey; Prerequisite concept: Epic Structure; Wikipedia contributors. Odyssey. Wikipedia (CC BY-SA 4.0)',
                },
                { week: 'Week 3', topic: 'Antigone', readings: 'Antigone' },
                { week: 'Week 4', topic: 'Li Bai and Du Fu', readings: 'Selected poems by Li Bai and Du Fu' },
                { week: 'Week 5', topic: 'Frame narrative', readings: 'The Thousand and One Nights' },
                { week: 'Week 6', topic: 'Allegory', readings: 'Dante’s Inferno' },
                { week: 'Week 7', topic: 'Form and context', readings: 'Things Fall Apart' },
                { week: 'Week 8', topic: 'Borges’s “The Library of Babel”', readings: 'The Library of Babel' },
              ],
            },
          },
        },
      },
    });

    expect(result?.text.match(/^\- \*\*Week \d+:/gm)).toHaveLength(8);
    for (const reading of [
      'The Epic of Gilgamesh',
      'The Odyssey',
      'Antigone',
      'Selected poems by Li Bai and Du Fu',
      'The Thousand and One Nights',
      'Dante’s Inferno',
      'Things Fall Apart',
      'The Library of Babel',
    ]) {
      expect(result?.text).toContain(reading);
    }
    expect(result?.text).not.toContain('likely');
    expect(result?.text).not.toMatch(/Prerequisite concept|Wikipedia|CC BY-SA/i);
    expect(result).toMatchObject({ kind: 'course-evidence', sources: ['Syllabus', 'Course Map'] });
  });

  it('answers a sequence request with one concrete compiled skill per lesson', () => {
    const result = buildScionCourseSequenceAnswer({
      question: 'Summarize the three-lesson sequence and name one concrete skill students practice in each lesson.',
      courseMap: {
        lessons: [
          {
            title: 'Lesson 1: WCAG principles',
            sections: [{ learningObjectives: 'Audit one interface against a named WCAG success criterion.' }],
          },
          {
            title: 'Lesson 2: Keyboard access',
            sections: [
              { learningObjectives: 'Test a prototype using only the keyboard and document focus-order defects.' },
            ],
          },
          {
            title: 'Lesson 3: Remediation',
            sections: [
              {
                learningObjectives:
                  'Repair an accessible form and verify its error feedback with assistive technology.',
              },
            ],
          },
        ],
      },
      deliverables: {
        syllabus: {
          data: {
            syllabus: {
              weeklySchedule: [
                { week: 'Week 1', topic: 'WCAG principles' },
                { week: 'Week 2', topic: 'Keyboard access' },
                { week: 'Week 3', topic: 'Remediation' },
              ],
            },
          },
        },
      },
    });

    expect(result?.text.match(/Concrete skill:/g)).toHaveLength(3);
    expect(result?.text).toContain('Audit one interface against a named WCAG success criterion.');
    expect(result?.text).toContain('Test a prototype using only the keyboard');
    expect(result?.text).toContain('Repair an accessible form');
  });

  it('keeps quoted words inside a smart-quoted Mandarin lesson fact', () => {
    const result = buildScionCourseAnswer({
      question: 'What does 你好 (nǐ hǎo) mean, and which exact Lesson 2 fact supports your answer?',
      courseMap: { courseName: 'Elementary Mandarin Chinese I' },
      deliverables: {
        quizBank: {
          data: {
            quizzes: [
              {
                questions: [
                  {
                    question: 'What does 你好 (nǐ hǎo) mean in this lesson?',
                    options: ['A. goodbye', 'B. hello', 'C. thanks', 'D. Not specified'],
                    answer: 'B',
                  },
                  {
                    question:
                      'Choose the language principle that best organizes this lesson detail: “你 (nǐ) means "you" in the greeting 你好 (nǐ hǎo).” Cite the exact detail as evidence.',
                  },
                ],
              },
            ],
          },
        },
      },
    });

    expect(result?.text).toBe(
      '你好 (nǐ hǎo) means “hello.” Use nǐ hǎo as the exact tone-marked pronunciation guide. The supporting lesson fact is: “你 (nǐ) means "you" in the greeting 你好 (nǐ hǎo).”',
    );
  });

  it('answers a named-reading comparison from the compiled task instead of inventing a location', () => {
    const result = buildScionNamedReadingAnswer({
      question:
        'Where do students compare The Odyssey and The Thousand and One Nights, and what evidence, counter-reading, and claim limit must they use?',
      courseMap: {
        courseName: 'World Literature Survey',
        lessons: [
          { lessonNumber: 1, title: 'Lesson 1: Gilgamesh', sections: [{ readings: ['Gilgamesh'] }] },
          { lessonNumber: 2, title: 'Lesson 2: The Odyssey', sections: [{ readings: ['The Odyssey'] }] },
          { lessonNumber: 3, title: 'Lesson 3: Antigone', sections: [{ readings: ['Antigone'] }] },
          { lessonNumber: 4, title: 'Lesson 4: Li Bai and Du Fu', sections: [{ readings: ['Li Bai and Du Fu'] }] },
          {
            lessonNumber: 5,
            title: 'Lesson 5: Comparative Narrative Frames',
            sections: [{ readings: ['The Thousand and One Nights'] }],
          },
        ],
      },
      deliverables: {
        assignments: {
          status: 'done',
          data: {
            assignments: [
              { title: 'Gilgamesh response', overview: 'Analyze one passage from Gilgamesh.' },
              { title: 'Odyssey response', overview: 'Analyze one passage from The Odyssey.' },
              { title: 'Antigone response', overview: 'Analyze one passage from Antigone.' },
              { title: 'Poetry response', overview: 'Analyze one poem by Li Bai or Du Fu.' },
              {
                title: 'Comparative narrative response',
                overview:
                  'Compare how narrative perspective operates in The Odyssey and The Thousand and One Nights. Submit a comparative response with one locatable passage from each assigned edition, a credible counter-reading, and a statement of what the paired evidence cannot establish.',
              },
            ],
          },
        },
      },
    });

    expect(result?.text).toContain('Lesson 5: Comparative Narrative Frames');
    expect(result?.text).toContain('Assignment Briefs');
    expect(result?.text).toContain('The Odyssey');
    expect(result?.text).toContain('The Thousand and One Nights');
    expect(result?.text).toContain('one locatable passage or formal feature from each work');
    expect(result?.text).toContain('credible counter-reading');
    expect(result?.text).toContain('cannot establish');
    expect(result).toMatchObject({ kind: 'course-evidence', lessonNumber: 5 });
  });

  it('refuses to invent a named-reading pairing when the compiled package has none', () => {
    const result = buildScionNamedReadingAnswer({
      question: 'Where do students compare The Odyssey and Antigone?',
      courseMap: {
        lessons: [
          { lessonNumber: 1, title: 'Lesson 1: The Odyssey', sections: [{ readings: ['The Odyssey'] }] },
          { lessonNumber: 2, title: 'Lesson 2: Antigone', sections: [{ readings: ['Antigone'] }] },
        ],
      },
      deliverables: {
        assignments: {
          status: 'done',
          data: {
            assignments: [
              { lessonTitle: 'Lesson 1: The Odyssey', taskDescription: 'Analyze one passage from The Odyssey.' },
              { lessonTitle: 'Lesson 2: Antigone', taskDescription: 'Analyze one passage from Antigone.' },
            ],
          },
        },
      },
    });

    expect(result?.text).toContain('no compiled activity explicitly pairs these readings');
    expect(result?.text).toContain('I won’t invent a location or requirement');
    expect(result).toMatchObject({ kind: 'course-evidence', sources: ['Course Map'] });
  });

  it('uses the assignment schedule instead of its array position for a comparative answer', () => {
    const result = buildScionNamedReadingAnswer({
      question:
        'Where do students compare The Odyssey and The Thousand and One Nights, and what evidence, counter-reading, and claim limit must they use?',
      courseMap: {
        lessons: [
          { lessonNumber: 1, title: 'Lesson 1: Gilgamesh', sections: [{ readings: ['The Epic of Gilgamesh'] }] },
          { lessonNumber: 2, title: 'Lesson 2: The Odyssey', sections: [{ readings: ['The Odyssey'] }] },
          { lessonNumber: 3, title: 'Lesson 3: Antigone', sections: [{ readings: ['Antigone'] }] },
          { lessonNumber: 4, title: 'Lesson 4: Poetry', sections: [{ readings: ['Li Bai and Du Fu'] }] },
          {
            lessonNumber: 5,
            title: 'Lesson 5: The Thousand and One Nights',
            sections: [{ readings: ['The Thousand and One Nights'] }],
          },
        ],
      },
      deliverables: {
        assignments: {
          status: 'done',
          data: {
            assignments: [
              {
                title: 'Comparative Reading Responses',
                dueWeek: 'End of Week 2',
                overview:
                  'Compare The Odyssey and The Thousand and One Nights with one locatable passage from each work, a credible counter-reading, and an explicit statement of what the paired evidence cannot establish.',
              },
            ],
          },
        },
      },
    });

    expect(result?.text).toContain(
      'Comparative Reading Responses schedules the comparison between The Odyssey and The Thousand and One Nights',
    );
    expect(result?.text).not.toContain('the The Odyssey');
    expect(result?.text).toContain('Lesson 2: The Odyssey');
    expect(result?.text).toContain('make a comparative claim that needs both texts');
    expect(result?.text).toContain('what the selected passages cannot establish on their own');
    expect(result?.text).not.toContain('Lesson 1: Gilgamesh');
    expect(result).toMatchObject({ kind: 'course-evidence', lessonNumber: 2 });
  });
});

describe('comparison parsing', () => {
  it('extracts the bounded pair without swallowing trailing context', () => {
    expect(
      __private__.comparisonPairFromLine(
        'A team pairs dissolved oxygen and temperature with nutrient observations before judging impairment.',
      ),
    ).toMatchObject({ first: 'dissolved oxygen', second: 'temperature' });
  });
});
