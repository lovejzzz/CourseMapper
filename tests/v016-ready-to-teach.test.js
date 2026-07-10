// v0.16.0 "Ready to Teach" — regression net for the lane changes.
// Every case pins a defect Prof measured (see docs/ROADMAP_V016_READY_TO_TEACH.md).
import { describe, expect, it } from 'vitest';
import {
  buildCourseBlueprint,
  compileBlueprintDeliverables,
  buildQuizAtomsForLesson,
  bloomLevelFromStemVerb,
} from '../src/lib/courseBlueprintCompiler';

const LESSON_COUNT = 15;

function bigCourse() {
  return {
    courseName: 'Introduction to Computer Science with Python',
    lessons: Array.from({ length: LESSON_COUNT }, (_, i) => ({
      title: i === 0 ? 'Lesson 1: Python interpreter' : `Lesson ${i + 1}: Python Topic ${i + 1}`,
      sections: [
        {
          topicSection: i === 0 ? '1.1: Python interpreter' : `${i + 1}.1: Python topic ${i + 1}`,
          learningGoals: `Understand python topic ${i + 1}.`,
          learningObjectives:
            i === 0
              ? 'Write and run a short program in the Python interpreter.'
              : `Write a short program using python topic ${i + 1}.`,
          weeklyAssessments: 'Autograded quiz',
          asyncActivities: 'Read the chapter.',
          syncActivities: 'Hands-on coding lab.',
          supportingResources: 'Python textbook chapter',
        },
      ],
    })),
  };
}

function enrichedLesson() {
  return {
    quizItems: [
      {
        index: 0,
        type: 'multiple_choice',
        question: 'What does a Python interpreter do?',
        options: [
          'Reads and executes Python code directly',
          'Compiles code to native binaries first',
          'Formats source files for readability',
          'Manages package downloads only',
        ],
        answerIndex: 0,
        explanation: 'The interpreter reads and executes Python statements directly.',
      },
      {
        index: 1,
        type: 'multiple_choice',
        question: 'Should beginners start in a notebook, an editor, or an interactive shell? Take a position.',
        options: ['Notebook', 'Editor', 'Shell', 'It depends'],
        answerIndex: 3,
      },
      { index: 2, type: 'short_answer', question: 'Describe what happens when you run a saved file.' },
    ],
    keyTerms: [
      {
        term: 'Python interpreter',
        definition: 'a program that reads and executes Python statements directly',
        example: 'running python3 hello.py executes each statement in order',
        misconception: 'Students often read x = x + 1 as an unsolvable equation.',
        correction: 'In Python = is assignment: the right side is evaluated first and bound to the name.',
      },
    ],
    kernel: {
      facts: ['Python code is executed by an interpreter.', 'A source file stores statements for later execution.'],
    },
    assignmentCore: {
      taskDescription:
        'Use a starter file to build a three-line program, run it in the Python interpreter, and confirm each line executes.',
    },
  };
}

function compiledBig(featureIds) {
  const blueprint = buildCourseBlueprint(bigCourse(), {
    enrichment: { source: 'test', lessonContent: { 'lesson-1': enrichedLesson() } },
  });
  return { blueprint, compiled: compileBlueprintDeliverables(blueprint, featureIds, {}) };
}

describe('A5 — outcome surfaces cover the whole course', () => {
  it('the alignment matrix + SLO list reach the back half of a 15-lesson course', () => {
    const { compiled } = compiledBig(['syllabus']);
    const syl = compiled.syllabus.syllabus ?? compiled.syllabus;
    const text = JSON.stringify(syl.outcomeAlignmentMatrix) + JSON.stringify(syl.learningOutcomes);
    // Lessons 11-15 must be visible somewhere in the outcome surfaces
    // (their own row, or a collapsed row's practicedIn list).
    for (const n of [11, 12, 13, 14, 15]) {
      expect(text).toMatch(new RegExp(`(topic ${n}|Lesson ${n})`, 'i'));
    }
  });

  it('near-duplicate template outcomes collapse instead of repeating a shingle 14 times', () => {
    const { compiled } = compiledBig(['syllabus']);
    const outcomes = (compiled.syllabus.syllabus ?? compiled.syllabus).learningOutcomes;
    const stems = outcomes.map((o) => o.toLowerCase().split(/\s+/).slice(0, 8).join(' '));
    expect(new Set(stems).size).toBe(stems.length);
  });
});

describe('A1 — unit-integrity, authored-first quiz overlay', () => {
  it('never splices an authored stem onto template options, and opinion stems never ship as MC', () => {
    const { blueprint } = compiledBig([]);
    const atoms = buildQuizAtomsForLesson(blueprint.lessons[0], blueprint, {
      assessment: { title: 'Autograded quiz' },
    });
    const text = JSON.stringify(atoms);
    expect(text).not.toContain('Take a position'); // opinion stem gated out
    // The authored stem ships as a UNIT: wherever the interpreter question
    // appears, its authored key must be among that item's options (no
    // authored-stem-on-template-options Franken-items).
    const authored = atoms.filter((a) => /What does a Python interpreter do/.test(a.question));
    expect(authored.length).toBeGreaterThan(0);
    for (const atom of authored) {
      expect(atom.options.join(' ')).toContain('Reads and executes Python code directly');
      expect(atom.enrichmentSource).toBe('lesson-content-enrichment');
    }
    for (const atom of atoms.filter((item) => item.enrichmentSource !== 'lesson-content-enrichment')) {
      expect(JSON.stringify([atom.question, atom.options])).not.toMatch(/Autograded quiz|Week\s*1 quiz/i);
    }
  });
});

describe('A2 — the autograding spec is printable fact', () => {
  it('an all-MC weekly quiz states its machine-scoring rule', () => {
    const { compiled } = compiledBig(['quizBank']);
    const weekly = compiled.quizBank.quizzes.find((q) => q.kind !== 'exam');
    expect(weekly.questions.every((q) => q.type === 'multiple_choice')).toBe(true);
    expect(weekly.gradingSpec).toMatch(/Machine-scorable against the answer key/);
    expect(weekly.gradingSpec).toMatch(/no partial credit/);
  });
});

describe('A3 — activity language follows the assessment genre', () => {
  it('an autograded-quiz lesson practices retrieval; nobody drafts the quiz', () => {
    const { compiled } = compiledBig(['lessonPlans']);
    const plan = JSON.stringify(compiled.lessonPlans.lessonPlans[0]);
    expect(plan).not.toMatch(/Students draft (?:the )?Autograded/i);
    expect(plan).toMatch(/practice items|retrieval-practice|timed practice|quiz each other/i);
  });
});

describe('A4 — Bloom tags treat coding performances as Apply', () => {
  it('"Define a function" is a performance in a making context, not recall', () => {
    expect(bloomLevelFromStemVerb('Define a function that returns the running total')).toBe('Apply');
    expect(bloomLevelFromStemVerb('Define the key vocabulary of the unit')).not.toBe('Apply');
  });
});

describe('C1 — explanations repair the documented misconception', () => {
  it('the correct-answer explanation names and corrects the wrong turn', () => {
    const { compiled } = compiledBig(['quizBank']);
    const text = JSON.stringify(compiled.quizBank.quizzes[0].questions);
    expect(text).toMatch(/A common wrong turn/);
    expect(text).toMatch(/evaluated first and bound to the name/);
  });
});

describe('C2 — every lesson plan carries a non-reader catch-up path', () => {
  it('the mini-lesson opens with a recap for students who missed the reading', () => {
    const { compiled } = compiledBig(['lessonPlans']);
    for (const plan of compiled.lessonPlans.lessonPlans.slice(0, 3)) {
      expect(JSON.stringify(plan)).toMatch(/missed the reading/);
    }
  });
});

describe('C3 — the lesson teaches a focused core', () => {
  it('keyConcepts cap at 4 (word-mining filler no longer counts as taught content)', () => {
    const { blueprint } = compiledBig([]);
    for (const lesson of blueprint.lessons) {
      expect(lesson.keyConcepts.length).toBeLessThanOrEqual(4);
    }
  });
});

describe('B2 — rubric bands are observable behaviors', () => {
  it('strong = applies the definition; weak = shows the misconception', () => {
    const { compiled } = compiledBig(['rubrics']);
    const text = JSON.stringify(compiled.rubrics);
    expect(text).toMatch(/Strong work uses Python interpreter correctly/);
    expect(text).toMatch(/Weak work shows the common misunderstanding/);
  });
});

describe('B4 — the FAQ answers demand', () => {
  it('the lesson FAQ opens with the misconception, phrased as students ask it', () => {
    const { compiled } = compiledBig(['courseFaq']);
    const lessonOne = compiled.courseFaq.faqs[0];
    const questions = lessonOne.qs.map((q) => q.q).join('\n');
    expect(questions).toMatch(/I thought .*is that wrong/i);
    expect(questions).toMatch(/What does Python interpreter actually mean/i);
  });
});

describe('E — professional credibility tail', () => {
  it('E2: testing accommodations are tied to exams in the accessibility policy', () => {
    const { compiled } = compiledBig(['syllabus']);
    const syl = compiled.syllabus.syllabus ?? compiled.syllabus;
    expect(syl.accommodations).toMatch(/testing accommodations/i);
    expect(syl.accommodations).toMatch(/quiz, midterm, and final/i);
  });

  it('E4: Lesson 1 slides never reference "Last time"', () => {
    const { compiled } = compiledBig(['slideDecks']);
    const deckOne = JSON.stringify(compiled.slideDecks.decks[0]);
    expect(deckOne).not.toMatch(/Last time:/);
    const deckTwo = JSON.stringify(compiled.slideDecks.decks[1]);
    expect(deckTwo).toMatch(/Last time:/); // later lessons keep continuity
  });

  it('E5: hands-on technical artifacts carry a realistic after-class floor', () => {
    const { blueprint } = compiledBig([]);
    // "Autograded quiz" + "Hands-on coding lab" artifact → technical floor.
    expect(blueprint.lessons[0].workloadEstimate.afterClassMinutes).toBeGreaterThanOrEqual(90);
  });
});
