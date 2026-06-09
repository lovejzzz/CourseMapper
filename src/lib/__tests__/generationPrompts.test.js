/**
 * Tests for generation-flow pure functions from prompts.js:
 * buildGapFillPrompt, countGaps, buildExamineUserPrompt.
 *
 * These functions are called during the useGeneration flow but are
 * pure data transformations that can be tested without React hooks.
 */
import { describe, it, expect } from 'vitest';
import { EXAMINE_SYSTEM_PROMPT, buildGapFillPrompt, countGaps, buildExamineUserPrompt } from '../prompts';

// ── Test fixtures ────────────────────────────────────────────────────────────

const makeFilledCourseMap = () => ({
  courseName: 'CS 101',
  semester: 'Fall 2026',
  lessons: [
    {
      title: 'Lesson 1: Intro to CS',
      sections: [
        {
          learningGoals: 'Understand the basics of computer science',
          topicSection: 'Introduction to algorithms',
          learningObjectives: 'Students will be able to define an algorithm',
          weeklyAssessments: 'Quiz on algorithm definitions',
          asyncActivities: 'Read Chapter 1 of the textbook',
          syncActivities: 'In-class algorithm design exercise',
          technologyNeeded: 'Python IDE',
          presentationFormat: 'Interactive workshop',
          supportingResources: 'Textbook Chapter 1',
        },
      ],
    },
    {
      title: 'Lesson 2: Data Structures',
      sections: [
        {
          learningGoals: 'Learn about arrays and linked lists',
          topicSection: 'Arrays and linked lists',
          learningObjectives: 'Students will be able to implement arrays',
          weeklyAssessments: 'Lab assignment on arrays',
          asyncActivities: 'Watch data structures video',
          syncActivities: 'Pair programming exercise',
          technologyNeeded: 'Python IDE',
          presentationFormat: 'Video lecture + lab',
          supportingResources: 'Textbook Chapter 2',
        },
      ],
    },
  ],
});

const makeGappyCourseMap = () => ({
  courseName: 'CS 101',
  semester: 'Fall 2026',
  lessons: [
    {
      title: 'Lesson 1: Intro',
      sections: [
        {
          learningGoals: 'Understand CS basics',
          topicSection: '',
          learningObjectives: 'TBD',
          weeklyAssessments: '',
          asyncActivities: null,
          syncActivities: 'ok', // short but >= 5 chars — not a gap with >= 5 chars? No, "ok" is 2 chars < 5
          technologyNeeded: 'N/A',
          presentationFormat: '',
          supportingResources: 'TODO',
        },
      ],
    },
    {
      title: 'Lesson 2: Data',
      sections: [
        {
          learningGoals: '',
          topicSection: 'Arrays', // valid, 6 chars
          learningObjectives: '?',
          weeklyAssessments: 'Lab', // 3 chars < 5 → gap
          asyncActivities: 'Read Chapter 2 thoroughly', // valid
          syncActivities: '',
          technologyNeeded: '',
          presentationFormat: '',
          supportingResources: '',
        },
      ],
    },
  ],
});

// ═════════════════════════════════════════════════════════════════════════════
// countGaps
// ═════════════════════════════════════════════════════════════════════════════

describe('countGaps', () => {
  it('returns 0 for a fully filled course map', () => {
    expect(countGaps(makeFilledCourseMap())).toBe(0);
  });

  it('counts empty strings as gaps', () => {
    const cm = {
      lessons: [
        {
          title: 'L1',
          sections: [
            {
              learningGoals: '',
              topicSection: 'Valid topic content here',
              learningObjectives: '',
            },
          ],
        },
      ],
    };
    // Only checks default keys; learningGoals and learningObjectives are empty
    expect(countGaps(cm)).toBeGreaterThan(0);
  });

  it('counts null values as gaps', () => {
    const cm = {
      lessons: [
        {
          title: 'L1',
          sections: [{ learningGoals: null, topicSection: 'Valid content here' }],
        },
      ],
    };
    expect(countGaps(cm)).toBeGreaterThan(0);
  });

  it('counts "TBD", "TODO", "N/A", "?" as gaps', () => {
    const cm = {
      lessons: [
        {
          title: 'L1',
          sections: [
            {
              learningGoals: 'TBD',
              topicSection: 'TODO',
              learningObjectives: 'N/A',
              weeklyAssessments: '?',
              asyncActivities: 'Real content with enough length',
              syncActivities: 'Real activities described here',
              technologyNeeded: 'Python IDE setup needed',
              presentationFormat: 'Interactive seminar',
              supportingResources: 'Textbook and course reader',
            },
          ],
        },
      ],
    };
    expect(countGaps(cm)).toBe(4);
  });

  it('counts strings shorter than 5 chars as gaps', () => {
    const cm = {
      lessons: [
        {
          title: 'L1',
          sections: [
            {
              learningGoals: 'ok', // 2 chars < 5
              topicSection: 'This is a real topic section',
              learningObjectives: 'Learn about important concepts',
              weeklyAssessments: 'Lab', // 3 chars < 5
              asyncActivities: 'Read the required textbook chapter',
              syncActivities: 'Group discussion on today topic',
              technologyNeeded: 'hi', // 2 chars < 5
              presentationFormat: 'Case discussion',
              supportingResources: 'Complete reference list available',
            },
          ],
        },
      ],
    };
    expect(countGaps(cm)).toBe(3);
  });

  it('uses custom column keys when provided', () => {
    const cm = {
      lessons: [
        {
          title: 'L1',
          sections: [{ customField: '', anotherField: 'Valid custom content' }],
        },
      ],
    };
    expect(countGaps(cm, ['customField', 'anotherField'])).toBe(1);
  });

  it('returns 0 for null course map', () => {
    expect(countGaps(null)).toBe(0);
  });

  it('returns 0 for course map with no lessons', () => {
    expect(countGaps({ lessons: [] })).toBe(0);
  });

  it('handles lessons with no sections (creates empty section)', () => {
    const cm = { lessons: [{ title: 'L1', sections: [] }] };
    // Empty sections → falls back to [{}], which has all keys missing
    const count = countGaps(cm);
    expect(count).toBeGreaterThan(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// buildGapFillPrompt
// ═════════════════════════════════════════════════════════════════════════════

describe('buildGapFillPrompt', () => {
  it('returns "All fields are already filled" for a complete course map', () => {
    const prompt = buildGapFillPrompt(makeFilledCourseMap());
    expect(prompt).toContain('All fields are already filled');
    expect(prompt).toContain('Return []');
  });

  it('lists gap locations for a gappy course map', () => {
    const prompt = buildGapFillPrompt(makeGappyCourseMap());
    expect(prompt).toContain('CS 101');
    expect(prompt).toContain('Fall 2026');
    expect(prompt).toContain('empty and need to be filled');
    // Should reference specific lesson/section positions
    expect(prompt).toContain('L1S1');
  });

  it('includes lesson titles in gap descriptions', () => {
    const prompt = buildGapFillPrompt(makeGappyCourseMap());
    expect(prompt).toContain('Lesson 1: Intro');
  });

  it('includes field names in gap descriptions', () => {
    const prompt = buildGapFillPrompt(makeGappyCourseMap());
    // topicSection is empty in lesson 1
    expect(prompt).toContain('topicSection');
  });

  it('caps listed gaps at 30', () => {
    // Create course map with many gaps
    const cm = {
      courseName: 'Big Course',
      semester: 'FA26',
      lessons: Array.from({ length: 10 }, (_, i) => ({
        title: `Lesson ${i + 1}`,
        sections: [
          {
            learningGoals: '',
            topicSection: '',
            learningObjectives: '',
            weeklyAssessments: '',
          },
        ],
      })),
    };
    const prompt = buildGapFillPrompt(cm, ['learningGoals', 'topicSection', 'learningObjectives', 'weeklyAssessments']);
    // 10 lessons * 4 keys = 40 gaps, but only 30 should be listed
    const lineMatches = prompt.match(/L\d+S\d+/g);
    expect(lineMatches.length).toBeLessThanOrEqual(30);
  });

  it('uses custom column keys when provided', () => {
    const cm = {
      courseName: 'Test',
      lessons: [{ title: 'L1', sections: [{ myField: '', otherField: 'Has real content here' }] }],
    };
    const prompt = buildGapFillPrompt(cm, ['myField', 'otherField']);
    expect(prompt).toContain('myField');
    // otherField has content, so should not be in gap list
    expect(prompt).not.toContain('"otherField"');
  });

  it('handles null course map gracefully', () => {
    const prompt = buildGapFillPrompt(null);
    expect(prompt).toContain('All fields are already filled');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// buildExamineUserPrompt
// ═════════════════════════════════════════════════════════════════════════════

describe('buildExamineUserPrompt', () => {
  const sampleMap = { courseName: 'AI 101', lessons: [{ title: 'Lesson 1' }] };

  it('includes serialized course map', () => {
    const prompt = buildExamineUserPrompt(sampleMap, '');
    expect(prompt).toContain('AI 101');
    expect(prompt).toContain('Lesson 1');
    expect(prompt).toContain('Examine this course map');
  });

  it('includes syllabus text when provided', () => {
    const prompt = buildExamineUserPrompt(sampleMap, 'This is a 15-week AI course.');
    expect(prompt).toContain('original syllabus');
    expect(prompt).toContain('15-week AI course');
  });

  it('omits syllabus section when no text provided', () => {
    const prompt = buildExamineUserPrompt(sampleMap, '');
    expect(prompt).not.toContain('original syllabus');
  });

  it('truncates syllabus to 30000 characters', () => {
    const longSyllabus = 'x'.repeat(50000);
    const prompt = buildExamineUserPrompt(sampleMap, longSyllabus);
    // The syllabus portion should be truncated
    const syllabusContent = prompt.split('reference:\n\n')[1]?.split('\n\nExamine')[0] || '';
    expect(syllabusContent.length).toBeLessThanOrEqual(30000);
  });

  it('includes scope constraint when scopeIndices provided', () => {
    const prompt = buildExamineUserPrompt(sampleMap, '', [0, 2, 4]);
    expect(prompt).toContain('SCOPE CONSTRAINT');
    expect(prompt).toContain('3 lesson(s)');
    expect(prompt).toContain('lessons 1, 3, 5');
  });

  it('omits scope constraint when scopeIndices is null', () => {
    const prompt = buildExamineUserPrompt(sampleMap, '', null);
    expect(prompt).not.toContain('SCOPE CONSTRAINT');
  });

  it('omits scope constraint for empty array', () => {
    const prompt = buildExamineUserPrompt(sampleMap, '', []);
    expect(prompt).not.toContain('SCOPE CONSTRAINT');
  });

  it('sends only focus lessons with original indices in focused review mode', () => {
    const map = {
      courseName: 'Focus Course',
      lessons: [
        { title: 'Alpha Lesson', sections: [{ topicSection: 'A' }] },
        { title: 'Beta Lesson', sections: [{ topicSection: 'B' }] },
        { title: 'Gamma Lesson', sections: [{ topicSection: 'C' }] },
      ],
    };
    const prompt = buildExamineUserPrompt(map, '', null, { focusLessonIndices: [2] });
    expect(prompt).toContain('FOCUSED REVIEW');
    expect(prompt).toContain('"lessonIndex":2');
    expect(prompt).toContain('Gamma Lesson');
    expect(prompt).not.toContain('Alpha Lesson');
    expect(prompt).not.toContain('Beta Lesson');
    expect(prompt).toContain('"totalLessonCount":3');
  });

  it('falls back to the full map when focus covers all lessons or is invalid', () => {
    const map = {
      courseName: 'Focus Course',
      lessons: [{ title: 'Alpha Lesson' }, { title: 'Beta Lesson' }],
    };
    const allFocus = buildExamineUserPrompt(map, '', null, { focusLessonIndices: [0, 1] });
    expect(allFocus).not.toContain('FOCUSED REVIEW');
    expect(allFocus).toContain('Alpha Lesson');

    const invalidFocus = buildExamineUserPrompt(map, '', null, { focusLessonIndices: [9] });
    expect(invalidFocus).not.toContain('FOCUSED REVIEW');
    expect(invalidFocus).toContain('Beta Lesson');
  });

  it('always asks for JSON patches return format', () => {
    const prompt = buildExamineUserPrompt(sampleMap, '');
    expect(prompt).toContain('patches');
    expect(prompt).toContain('JSON');
  });

  it('tells the examiner not to stuff metadata into courseName', () => {
    expect(EXAMINE_SYSTEM_PROMPT).toContain('courseName field is the official catalog/title only');
    expect(EXAMINE_SYSTEM_PROMPT).toContain('Social Policy and Welfare, 14-week undergraduate course');
  });
});
