/**
 * Tests for CSV exporter pure functions: deliverableToCsvRows.
 * Covers all deliverable types and edge cases (null data, empty arrays, etc.).
 */
import { describe, it, expect } from 'vitest';
import { deliverableToCsvRows } from '../exporters/csvExporter';

// ═════════════════════════════════════════════════════════════════════════════
// Null / empty input
// ═════════════════════════════════════════════════════════════════════════════

describe('deliverableToCsvRows — null/empty input', () => {
  it('returns empty headers and rows for null data', () => {
    const result = deliverableToCsvRows('lessonPlans', null);
    expect(result).toEqual({ headers: [], rows: [] });
  });

  it('returns empty headers and rows for undefined data', () => {
    const result = deliverableToCsvRows('quizBank', undefined);
    expect(result).toEqual({ headers: [], rows: [] });
  });

  it('returns headers but empty rows for empty array data', () => {
    const result = deliverableToCsvRows('lessonPlans', { lessonPlans: [] });
    expect(result.headers.length).toBeGreaterThan(0);
    expect(result.rows).toHaveLength(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Lesson Plans
// ═════════════════════════════════════════════════════════════════════════════

describe('deliverableToCsvRows — lessonPlans', () => {
  it('extracts basic fields from lesson plans', () => {
    const data = {
      lessonPlans: [
        {
          lessonTitle: 'Intro to ML',
          duration: '60 min',
          bloomsLevels: ['Remember', 'Understand'],
          objectives: ['Define ML', 'List applications'],
          materials: ['Textbook Ch.1'],
          outline: [{ time: '10m', activity: 'Warm-up', description: 'Discuss AI' }],
          closingActivity: 'Recap quiz',
        },
      ],
    };
    const { headers, rows } = deliverableToCsvRows('lessonPlans', data);

    expect(headers).toContain('Lesson');
    expect(headers).toContain('Duration');
    expect(headers).toContain("Bloom's Levels");
    expect(rows).toHaveLength(1);
    expect(rows[0][0]).toBe('Intro to ML');
    expect(rows[0][1]).toBe('60 min');
    expect(rows[0][2]).toBe('Remember, Understand');
    expect(rows[0][3]).toContain('Define ML');
  });

  it('supports "plans" key alias', () => {
    const data = { plans: [{ title: 'Lesson via plans key', duration: '45 min' }] };
    const { rows } = deliverableToCsvRows('lessonPlans', data);
    expect(rows).toHaveLength(1);
    expect(rows[0][0]).toBe('Lesson via plans key');
  });

  it('formats warmUp object', () => {
    const data = {
      lessonPlans: [
        {
          lessonTitle: 'L1',
          warmUp: { type: 'Think-Pair-Share', prompt: 'What is AI?', purpose: 'Activate prior knowledge' },
        },
      ],
    };
    const { rows } = deliverableToCsvRows('lessonPlans', data);
    expect(rows[0][4]).toContain('Think-Pair-Share');
    expect(rows[0][4]).toContain('What is AI?');
  });

  it('formats formativeCheck object', () => {
    const data = {
      lessonPlans: [
        {
          lessonTitle: 'L1',
          formativeCheck: { type: 'Exit ticket', prompt: 'Name 2 types', objectiveAligned: 'Obj 1' },
        },
      ],
    };
    const { rows } = deliverableToCsvRows('lessonPlans', data);
    expect(rows[0][7]).toContain('Exit ticket');
    expect(rows[0][7]).toContain('Name 2 types');
  });

  it('formats UDL notes', () => {
    const data = {
      lessonPlans: [
        {
          lessonTitle: 'L1',
          udlNotes: { representation: 'Visual aids', engagement: 'Group work', expression: 'Written essay' },
        },
      ],
    };
    const { rows } = deliverableToCsvRows('lessonPlans', data);
    expect(rows[0][8]).toContain('Repr: Visual aids');
    expect(rows[0][8]).toContain('Engage: Group work');
  });

  it('formats homework as object', () => {
    const data = {
      lessonPlans: [
        {
          lessonTitle: 'L1',
          homework: { title: 'Read Ch.2', description: 'Focus on key terms', estimatedTime: '30 min' },
        },
      ],
    };
    const { rows } = deliverableToCsvRows('lessonPlans', data);
    expect(rows[0][9]).toContain('Read Ch.2');
    expect(rows[0][9]).toContain('30 min');
  });

  it('formats homework as plain string', () => {
    const data = { lessonPlans: [{ lessonTitle: 'L1', homework: 'Read chapter 3' }] };
    const { rows } = deliverableToCsvRows('lessonPlans', data);
    expect(rows[0][9]).toBe('Read chapter 3');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Rubrics
// ═════════════════════════════════════════════════════════════════════════════

describe('deliverableToCsvRows — rubrics', () => {
  it('creates one row per criterion', () => {
    const data = {
      rubrics: [
        {
          title: 'Essay Rubric',
          totalPoints: 100,
          assessmentType: 'Summative',
          criteria: [
            {
              criterion: 'Thesis',
              weight: 30,
              excellent: 'Strong thesis',
              proficient: 'Clear thesis',
              developing: 'Weak thesis',
              beginning: 'No thesis',
            },
            { criterion: 'Evidence', weight: 40, excellent: 'Strong evidence', proficient: 'Some evidence' },
          ],
        },
      ],
    };
    const { headers, rows } = deliverableToCsvRows('rubrics', data);
    expect(headers).toContain('Rubric');
    expect(headers).toContain('Criterion');
    expect(rows).toHaveLength(2);
    expect(rows[0][0]).toBe('Essay Rubric');
    expect(rows[0][3]).toBe('Thesis');
    expect(rows[1][3]).toBe('Evidence');
  });

  it('handles rubric with no criteria', () => {
    const data = { rubrics: [{ title: 'Empty', criteria: [] }] };
    const { rows } = deliverableToCsvRows('rubrics', data);
    expect(rows).toHaveLength(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Slide Decks
// ═════════════════════════════════════════════════════════════════════════════

describe('deliverableToCsvRows — slideDecks', () => {
  it('creates one row per slide', () => {
    const data = {
      decks: [
        {
          lessonTitle: 'Lecture 1',
          slides: [
            { title: 'Title Slide', bullets: ['Welcome', 'Overview'], speakerNotes: 'Greet students' },
            { title: 'Content Slide', bullets: ['Point A'], speakerNotes: '' },
          ],
        },
      ],
    };
    const { headers, rows } = deliverableToCsvRows('slideDecks', data);
    expect(headers).toContain('Slide #');
    expect(headers).toContain('Bullets');
    expect(rows).toHaveLength(2);
    expect(rows[0][0]).toBe('Lecture 1');
    expect(rows[0][1]).toBe('1');
    expect(rows[0][3]).toBe('Welcome; Overview');
    expect(rows[1][1]).toBe('2');
  });

  it('supports "slideDecks" key', () => {
    const data = { slideDecks: [{ lessonTitle: 'L1', slides: [{ title: 'S1' }] }] };
    const { rows } = deliverableToCsvRows('slideDecks', data);
    expect(rows).toHaveLength(1);
  });

  it('expands compact slide deck keys before building rows', () => {
    const data = {
      decks: [
        {
          lt: 'Lesson 1: Compact Slides',
          sl: [
            {
              t: 'Export evidence should survive',
              bu: ['Compact titles appear', 'Compact bullets appear'],
              no: 'Speaker notes explain how the export should be reviewed by an instructor.',
            },
          ],
        },
      ],
    };
    const { rows } = deliverableToCsvRows('slideDecks', data);

    expect(rows).toEqual([
      [
        'Lesson 1: Compact Slides',
        '1',
        'Export evidence should survive',
        'Compact titles appear; Compact bullets appear',
        'Speaker notes explain how the export should be reviewed by an instructor.',
      ],
    ]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Quiz Bank
// ═════════════════════════════════════════════════════════════════════════════

describe('deliverableToCsvRows — quizBank', () => {
  it('creates one row per question', () => {
    const data = {
      quizzes: [
        {
          lessonTitle: 'Quiz 1',
          questions: [
            {
              type: 'mc',
              bloomsLevel: 'Remember',
              difficulty: 'easy',
              question: 'What is ML?',
              options: ['A', 'B', 'C'],
              answer: 'A',
              explanation: 'ML is...',
              points: 5,
            },
            {
              type: 'sa',
              bloomsLevel: 'Apply',
              difficulty: 'hard',
              question: 'Explain CNNs',
              sampleAnswer: 'CNNs are...',
            },
          ],
        },
      ],
    };
    const { headers, rows } = deliverableToCsvRows('quizBank', data);
    expect(headers).toContain('Question');
    expect(headers).toContain('Options');
    expect(rows).toHaveLength(2);
    expect(rows[0][4]).toBe('What is ML?');
    expect(rows[0][5]).toBe('A; B; C');
    expect(rows[0][8]).toBe('5');
    expect(rows[1][9]).toBe('CNNs are...');
  });

  it('supports "quizBank" key', () => {
    const data = { quizBank: [{ lessonTitle: 'Q1', questions: [{ question: 'Test?' }] }] };
    const { rows } = deliverableToCsvRows('quizBank', data);
    expect(rows).toHaveLength(1);
  });

  it('expands compact quiz-bank keys before building rows', () => {
    const data = {
      quizzes: [
        {
          lt: 'Lesson 1: Compact Quiz',
          qs: [
            {
              ty: 'multiple_choice',
              bl: 'Analyze',
              df: 'Medium',
              q: 'Which export check catches missing quiz rows?',
              op: ['A. Readiness only', 'B. CSV row inspection', 'C. Theme preview', 'D. Login check'],
              an: 'B',
              ex: 'CSV row inspection verifies the delivered artifact contains each compact question.',
              pt: 2,
              sa: 'Inspect the downloaded CSV.',
            },
          ],
        },
      ],
    };

    const { rows } = deliverableToCsvRows('quizBank', data);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual([
      'Lesson 1: Compact Quiz',
      'multiple_choice',
      'Analyze',
      'Medium',
      'Which export check catches missing quiz rows?',
      'A. Readiness only; B. CSV row inspection; C. Theme preview; D. Login check',
      'B',
      'CSV row inspection verifies the delivered artifact contains each compact question.',
      '2',
      'Inspect the downloaded CSV.',
    ]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Discussions
// ═════════════════════════════════════════════════════════════════════════════

describe('deliverableToCsvRows — discussions', () => {
  it('maps discussion fields correctly', () => {
    const data = {
      discussions: [
        {
          lessonTitle: 'Week 1 Discussion',
          bloomsLevel: 'Analyze',
          format: 'Fishbowl',
          prompt: 'Is AI ethical?',
          context: 'Recent AI advances',
          followUpProbes: ['What about bias?', 'Privacy concerns?'],
          responseStarters: ['I believe...', 'One perspective is...'],
          evaluationCriteria: ['Depth', 'Engagement'],
          facilitationTips: { opening: 'Start with video', ifStalls: 'Use think-pair-share', closure: 'Summary round' },
          guidelines: 'Be respectful',
        },
      ],
    };
    const { rows } = deliverableToCsvRows('discussions', data);
    expect(rows).toHaveLength(1);
    expect(rows[0][0]).toBe('Week 1 Discussion');
    expect(rows[0][3]).toBe('Is AI ethical?');
    expect(rows[0][5]).toContain('What about bias?');
    expect(rows[0][8]).toContain('Start with video');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Assignments
// ═════════════════════════════════════════════════════════════════════════════

describe('deliverableToCsvRows — assignments', () => {
  it('maps assignment fields correctly', () => {
    const data = {
      assignments: [
        {
          title: 'Final Project',
          assignmentType: 'Project',
          bloomsLevel: 'Create',
          dueWeek: 'Week 15',
          estimatedTime: '20 hours',
          totalPoints: 200,
          overview: 'Build a complete system',
          objectives: ['Design', 'Implement', 'Test'],
          instructions: ['Step 1: Plan', { step: 'Step 2: Build' }],
          deliverables: ['Report', { name: 'Code repository' }],
          formatRequirements: { length: '10 pages', format: 'APA', citationStyle: 'APA 7th' },
          scaffoldingMilestones: [{ milestone: 'Proposal', description: 'Submit outline' }],
        },
      ],
    };
    const { headers, rows } = deliverableToCsvRows('assignments', data);
    expect(headers).toContain('Title');
    expect(rows).toHaveLength(1);
    expect(rows[0][0]).toBe('Final Project');
    expect(rows[0][5]).toBe('200');
    expect(rows[0][7]).toContain('Design');
    expect(rows[0][8]).toContain('Step 1: Plan');
    expect(rows[0][8]).toContain('Step 2: Build');
    expect(rows[0][9]).toContain('Code repository');
    expect(rows[0][10]).toContain('APA 7th');
    expect(rows[0][12]).toContain('Proposal');
  });

  it('expands compact assignment keys before building rows', () => {
    const data = {
      assignments: [
        {
          t: 'Compact Export Review Brief',
          at: 'Project',
          rl: ['Lesson 1: Export Reliability'],
          dw: 'Week 4',
          et: '3 hours',
          tp: 50,
          pg: '25%',
          bl: 'Evaluate',
          ov: 'Audit exported course materials for instructor handoff readiness.',
          ob: ['Verify assignment artifacts', 'Document remaining readiness warnings'],
          ins: ['Open each exported file.', { step: 'Record any missing assignment details.' }],
          fr: { ln: '2 pages', fm: 'Memo', cs: 'APA 7th', sp: 'LMS upload' },
          dl: ['Audit memo', { name: 'Evidence checklist' }],
          sm: [{ ms: 'Draft audit', dd: 'Week 3', de: 'Submit initial export findings.' }],
          gc: 'Specific evidence and actionable recommendations.',
        },
      ],
    };

    const { rows } = deliverableToCsvRows('assignments', data);

    expect(rows).toHaveLength(1);
    expect(rows[0][0]).toBe('Compact Export Review Brief');
    expect(rows[0][1]).toBe('Project');
    expect(rows[0][2]).toBe('Evaluate');
    expect(rows[0][5]).toBe('50');
    expect(rows[0][6]).toBe('Audit exported course materials for instructor handoff readiness.');
    expect(rows[0][7]).toContain('Verify assignment artifacts');
    expect(rows[0][8]).toContain('Record any missing assignment details.');
    expect(rows[0][9]).toContain('Evidence checklist');
    expect(rows[0][10]).toContain('APA 7th');
    expect(rows[0][12]).toContain('Draft audit: Submit initial export findings.');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Study Guides
// ═════════════════════════════════════════════════════════════════════════════

describe('deliverableToCsvRows — studyGuides', () => {
  it('maps study guide fields correctly', () => {
    const data = {
      studyGuides: [
        {
          lessonTitle: 'Week 1 Guide',
          summary: 'Intro to ML concepts',
          keyTerms: [{ term: 'ML', definition: 'Machine Learning', example: 'Image classification' }],
          conceptConnections: [{ from: 'ML', to: 'AI' }],
          commonMisconceptions: [{ misconception: 'AI = ML', correction: 'ML is a subset of AI' }],
          reviewQuestions: [{ question: 'What is ML?' }],
          practiceActivities: [{ activity: 'Build a classifier' }],
          examPrep: {
            keyTopicsToKnow: ['Supervised learning', 'Unsupervised learning'],
            reviewStrategy: 'Practice problems',
          },
        },
      ],
    };
    const { rows } = deliverableToCsvRows('studyGuides', data);
    expect(rows).toHaveLength(1);
    expect(rows[0][0]).toBe('Week 1 Guide');
    expect(rows[0][2]).toContain('ML: Machine Learning');
    expect(rows[0][2]).toContain('e.g., Image classification');
    expect(rows[0][3]).toContain('ML');
    expect(rows[0][4]).toContain('AI = ML');
    expect(rows[0][7]).toContain('Supervised learning');
  });

  it('supports "guides" key alias', () => {
    const data = { guides: [{ lessonTitle: 'G1', summary: 'Summary' }] };
    const { rows } = deliverableToCsvRows('studyGuides', data);
    expect(rows).toHaveLength(1);
    expect(rows[0][0]).toBe('G1');
  });

  it('handles string-typed misconceptions and review questions', () => {
    const data = {
      studyGuides: [
        {
          lessonTitle: 'L1',
          commonMisconceptions: ['AI is magic'],
          reviewQuestions: ['What is ML?'],
          practiceActivities: ['Code a model'],
        },
      ],
    };
    const { rows } = deliverableToCsvRows('studyGuides', data);
    expect(rows[0][4]).toBe('AI is magic');
    expect(rows[0][5]).toBe('What is ML?');
    expect(rows[0][6]).toBe('Code a model');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Course FAQ
// ═════════════════════════════════════════════════════════════════════════════

describe('deliverableToCsvRows — courseFaq', () => {
  it('creates one row per FAQ question', () => {
    const data = {
      faqs: [
        {
          lessonTitle: 'Lesson 1',
          questions: [
            {
              category: 'Course Logistics',
              question: 'How do I verify an export?',
              answer: 'Open the downloaded file and confirm the expected rows.',
              relatedConcepts: ['CSV', 'Readiness'],
              difficulty: 'Basic',
            },
            {
              category: 'Technical Help',
              question: 'Which format supports spreadsheet review?',
              answer: 'CSV or XLSX works best for row-level review.',
              relatedConcepts: ['Google Sheets'],
              difficulty: 'Intermediate',
            },
          ],
        },
      ],
    };
    const { headers, rows } = deliverableToCsvRows('courseFaq', data);

    expect(headers).toEqual(['Lesson', 'Category', 'Question', 'Answer', 'Related Concepts', 'Difficulty']);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual([
      'Lesson 1',
      'Course Logistics',
      'How do I verify an export?',
      'Open the downloaded file and confirm the expected rows.',
      'CSV; Readiness',
      'Basic',
    ]);
    expect(rows[1][2]).toBe('Which format supports spreadsheet review?');
  });

  it('expands compact FAQ keys before building rows', () => {
    const data = {
      faqs: [
        {
          lt: 'Lesson 2',
          qs: [
            {
              ca: 'Assessment Prep',
              q: 'What should I study before the quiz?',
              an: 'Review the lesson objectives and practice questions.',
              rc: ['Quiz Bank', 'Study Guide'],
              df: 'Basic',
            },
          ],
        },
      ],
    };
    const { rows } = deliverableToCsvRows('courseFaq', data);

    expect(rows).toEqual([
      [
        'Lesson 2',
        'Assessment Prep',
        'What should I study before the quiz?',
        'Review the lesson objectives and practice questions.',
        'Quiz Bank; Study Guide',
        'Basic',
      ],
    ]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Syllabus
// ═════════════════════════════════════════════════════════════════════════════

describe('deliverableToCsvRows — syllabus', () => {
  it('extracts syllabus fields as key-value rows', () => {
    const data = {
      syllabus: {
        courseTitle: 'CS 101',
        semester: 'Fall 2025',
        instructor: 'Dr. Smith',
        courseDescription: 'Intro to CS',
        learningOutcomes: ['Understand algorithms', 'Write code'],
        attendancePolicy: 'Mandatory',
      },
    };
    const { headers, rows } = deliverableToCsvRows('syllabus', data);
    expect(headers).toEqual(['Section', 'Content']);
    expect(rows.find((r) => r[0] === 'Course Title')[1]).toBe('CS 101');
    expect(rows.find((r) => r[0] === 'Instructor')[1]).toBe('Dr. Smith');
    expect(rows.find((r) => r[0] === 'Learning Outcomes')[1]).toContain('Understand algorithms');
    expect(rows.find((r) => r[0] === 'Attendance & Participation')[1]).toBe('Mandatory');
  });

  it('handles syllabus without wrapper key', () => {
    const data = { courseTitle: 'Direct CS 101', semester: 'Spring 2026' };
    const { rows } = deliverableToCsvRows('syllabus', data);
    expect(rows.find((r) => r[0] === 'Course Title')[1]).toBe('Direct CS 101');
  });

  it('includes weekly schedule entries', () => {
    const data = {
      syllabus: {
        weeklySchedule: [
          { week: 'Week 1', topic: 'Intro', readings: 'Ch.1', assignments: 'HW1' },
          { week: 'Week 2', topic: 'Data', readings: 'Ch.2', assignments: 'HW2' },
        ],
      },
    };
    const { rows } = deliverableToCsvRows('syllabus', data);
    expect(rows).toHaveLength(2);
    expect(rows[0][0]).toBe('Week 1');
    expect(rows[0][1]).toContain('Intro');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Custom / unknown deliverable (default handler)
// ═════════════════════════════════════════════════════════════════════════════

describe('deliverableToCsvRows — custom/unknown deliverables', () => {
  it('auto-detects array key and extracts headers from item keys', () => {
    const data = {
      customItems: [
        { name: 'Item 1', description: 'First', tags: ['a', 'b'] },
        { name: 'Item 2', description: 'Second', extra: 42 },
      ],
    };
    const { headers, rows } = deliverableToCsvRows('custom_myDeliverable', data);
    expect(headers).toContain('Name');
    expect(headers).toContain('Description');
    expect(rows).toHaveLength(2);
    expect(rows[0][0]).toBe('Item 1');
    expect(rows[0][2]).toBe('a; b');
    expect(rows[1][3]).toBe('42');
  });

  it('returns empty for data with no arrays', () => {
    const data = { onlyScalar: 'hello' };
    const { headers, rows } = deliverableToCsvRows('custom_something', data);
    expect(headers).toEqual([]);
    expect(rows).toEqual([]);
  });

  it('handles null values in items', () => {
    const data = { items: [{ a: null, b: 'value' }] };
    const { rows } = deliverableToCsvRows('custom_x', data);
    expect(rows[0][0]).toBe('');
    expect(rows[0][1]).toBe('value');
  });

  it('stringifies nested objects in items', () => {
    const data = { items: [{ nested: { deep: true } }] };
    const { rows } = deliverableToCsvRows('custom_x', data);
    expect(rows[0][0]).toBe('{"deep":true}');
  });
});
