import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { extractSuppliedMaterial } from '../suppliedMaterial.js';
import {
  authorMaterialItems,
  buildMaterialFallbackItems,
  buildMaterialItemPrompt,
  isInLanguage,
  parseMaterialItemReply,
  validateMaterialItem,
  verifiedAnswerNumbers,
} from '../materialQuizItems.js';
import { applyMaterialOverlay, clearMaterialItemsCache, writeCachedMaterialItems } from '../materialOverlay.js';
import { hasLearnerFacingJargon, sanitizeLearnerFacingData, sanitizeLearnerFacingText } from '../learnerFacingText.js';
import { readCourseShapeLine, readChineseCourseShape } from '../courseShape.js';
import { detectExpectedLessons } from '../detectLessons.js';
import { detectRequestedClassSessionMinutes } from '../sourceBriefConstraints.js';
import { extractExplicitTeachingRequirements } from '../explicitTeachingRequirements.js';
import { briefLanguageInstruction, detectBriefLanguage } from '../briefLanguage.js';
import { buildPublicScionMessages } from '../publicScionProvider.js';
import {
  buildCourseBlueprint,
  compactBlueprintForStorage,
  compileBlueprintDeliverables,
} from '../courseBlueprintCompiler.js';

// The twelve pre-registered briefs from the v0.20.07 live quality test.
const { inputs } = JSON.parse(fs.readFileSync(new URL('../../../benchmarks/scion-live/briefs.json', import.meta.url)));
const brief = (id) => inputs.find((input) => input.id === id).brief;

function compileBrief(text, features = ['lessonPlans', 'assignments', 'quizBank', 'studyGuides']) {
  const title = text.split(/[:：。.]/)[0].slice(0, 40);
  const map = {
    courseName: title,
    lessons: [
      { title: `Lesson 1: ${title}`, sections: [{ topicSection: title, learningObjectives: `Explain ${title}.` }] },
    ],
  };
  const blueprint = compactBlueprintForStorage(buildCourseBlueprint(map, { sourceBrief: text }));
  return compileBlueprintDeliverables(blueprint, features);
}

describe('v0.20.08 supplied material', () => {
  it('finds the teacher material in all twelve live-test briefs', () => {
    for (const input of inputs) {
      const material = extractSuppliedMaterial(input.brief);
      expect(material.blocks.length, input.id).toBeGreaterThan(0);
      expect(material.language, input.id).toBe(input.lang);
    }
  });

  it('keeps poems, dialogues, facts and data verbatim and in the right kind', () => {
    expect(extractSuppliedMaterial(brief('A2-zh-poem')).blocks[0]).toMatchObject({
      kind: 'passage',
      title: '静夜思',
      lines: ['床前明月光，', '疑是地上霜。', '举头望明月，', '低头思故乡。'],
    });
    expect(extractSuppliedMaterial(brief('A4-en-spanish')).blocks[0]).toMatchObject({
      kind: 'dialogue',
      lines: ['Hola, soy Ana. ¿Cómo te llamas?', 'Me llamo Luis. Soy de México. ¿Y tú?', 'Soy de España.'],
    });
    expect(extractSuppliedMaterial(brief('A3-zh-tablet')).blocks[0]).toMatchObject({
      kind: 'facts',
      lines: ['某校引入平板电脑后一年，平均成绩提高了8分', '同一年学校也更换了数学老师'],
    });
    expect(extractSuppliedMaterial(brief('Q2-zh-stats')).blocks[0]).toMatchObject({
      kind: 'data',
      lines: ['3, 5, 5, 7, 10'],
    });
  });

  it('does not treat course shape, grade, requirements or topic prose as material', () => {
    for (const text of [
      'A 3-session course, 75 minutes per session. Students know elementary algebra. Session 3 must prove 1+2+...+n = n(n+1)/2.',
      'Teach photosynthesis to 9th graders over 6 lessons of 50 minutes.',
      '高中物理：8节课，讲牛顿运动定律。',
      'A 12-week intro to sociology. Students read "The Sociological Imagination".',
    ])
      expect(extractSuppliedMaterial(text).blocks).toEqual([]);
  });
});

describe('v0.20.08 questions built from the material', () => {
  it('computes exact answers for common calculation briefs', () => {
    const answers = (id) =>
      buildMaterialFallbackItems(extractSuppliedMaterial(brief(id)), { count: 4, topicText: brief(id) }).map(
        (item) => item.answer,
      );
    expect(answers('Q1-en-chem')).toEqual(expect.arrayContaining(['A', '4 mol H2O', '1 mol O2']));
    expect(
      buildMaterialFallbackItems(extractSuppliedMaterial(brief('Q1-en-chem')), { count: 1 })[0].explanation,
    ).toMatch(/H2 is the limiting reagent: 4 mol H2 needs only 2 mol O2/);
    expect(answers('Q2-zh-stats')).toEqual(['平均数 = 6', '中位数 = 5', '总体方差 = 5.6', '样本方差 = 7']);
    expect(answers('Q3-en-physics')).toEqual(expect.arrayContaining(['12 m/s', '24 m']));
    expect(answers('Q4-zh-genetics')).toEqual(
      expect.arrayContaining(['AA : Aa : aa = 1 : 2 : 1', '显性 : 隐性 = 3 : 1（显性占 3/4）', '1/4']),
    );
  });

  it('gives every brief a full, jargon-free quiz in its own language that quotes the material', () => {
    for (const input of inputs) {
      const material = extractSuppliedMaterial(input.brief);
      const items = buildMaterialFallbackItems(material, { count: 4, topicText: input.brief });
      expect(items, input.id).toHaveLength(4);
      for (const item of items) {
        expect(hasLearnerFacingJargon(`${item.question} ${item.answer}`), input.id).toBe(false);
        expect(item.question, input.id).not.toMatch(/Records? [A-D]/);
      }
      for (const item of items)
        expect(isInLanguage(item.question, input.lang), `${input.id}: ${item.question}`).toBe(true);
    }
  });

  it('uses the other poem lines as distractors for a cloze question', () => {
    const [first] = buildMaterialFallbackItems(extractSuppliedMaterial(brief('A2-zh-poem')), { count: 4 });
    expect(first.question).toContain('床前明月____');
    expect(first.options.map((option) => option.slice(3)).sort()).toEqual(['乡', '光', '月', '霜'].sort());
  });
});

describe('v0.20.08 Scion item checks', () => {
  const poem = extractSuppliedMaterial(brief('A1-en-poem'));

  it('accepts a grounded question and rejects template, off-language or ungrounded ones', () => {
    const good = parseMaterialItemReply(
      '```json\n{"question":"What words are carved on the pedestal?","options":["A. My name is Ozymandias","B. Hello","C. Farewell","D. Rest"],"answer":"A","explanation":"The inscription.","quote":"My name is Ozymandias, King of Kings"}\n```',
    );
    expect(validateMaterialItem(good, { material: poem, type: 'multiple_choice', language: 'en' }).item).toMatchObject({
      answer: 'A',
      options: ['A. My name is Ozymandias', 'B. Hello', 'C. Farewell', 'D. Rest'],
    });
    const template = {
      question: 'Use Records A-D to decide which record controls the claim.',
      options: ['a', 'b', 'c', 'd'],
      answer: 'A',
    };
    expect(validateMaterialItem(template, { material: poem, type: 'multiple_choice', language: 'en' }).reason).toMatch(
      /internal words/,
    );
    const chinese = { question: '这首诗表达了什么情感？', answer: '思乡', quote: 'Nothing beside remains' };
    expect(validateMaterialItem(chinese, { material: poem, type: 'short_answer', language: 'en' }).reason).toMatch(
      /not in English/,
    );
    const ungrounded = { question: 'Who painted the Mona Lisa and when was it finished?', answer: 'Leonardo' };
    expect(validateMaterialItem(ungrounded, { material: poem, type: 'short_answer', language: 'en' }).reason).toMatch(
      /did not come from the material/,
    );
  });

  it('asks for one question with the material inline and falls back per question', async () => {
    const prompt = buildMaterialItemPrompt({ material: poem, lessonTitle: 'Ozymandias', index: 0, total: 4 });
    expect(prompt).toContain('My name is Ozymandias, King of Kings;');
    expect(prompt).toMatch(/Never ask about "evidence", "records"/);
    const replies = [
      '{"question":"Which line names the king?","options":["My name is Ozymandias, King of Kings","Nothing beside remains","The lone and level sands","Round the decay"],"answer":"A","explanation":"The inscription names him.","quote":"My name is Ozymandias, King of Kings"}',
      'not json',
      'still not json',
    ];
    let call = 0;
    const result = await authorMaterialItems({
      material: poem,
      lessonTitle: 'Ozymandias',
      count: 2,
      callModel: async () => replies[Math.min(call++, replies.length - 1)],
    });
    expect(result.items).toHaveLength(2);
    expect(result.items[0].source).toBe('scion-material-item');
    expect(result.items[1].source).toBe('material-fallback');
    expect(result.rejections.map((entry) => entry.reason)).toContain('the reply was not valid JSON');
  });

  it('sends the item prompt to Scion unchanged instead of a course-map contract', () => {
    const messages = buildPublicScionMessages('You write one quiz question.', 'Write question 1 of 4.', {
      task: 'materialQuizItem',
    });
    expect(messages.at(-1).content).toBe('Write question 1 of 4.');
    expect(messages[0].content).toMatch(/one valid JSON object/);
  });
});

describe('v0.20.08 compiled materials', () => {
  it('replaces template quizzes with material questions and shows the material', () => {
    clearMaterialItemsCache();
    for (const input of inputs) {
      const out = compileBrief(input.brief);
      const quiz = out.quizBank.quizzes[0];
      const text = JSON.stringify(out);
      expect(quiz.suppliedMaterial?.blocks?.length, input.id).toBeGreaterThan(0);
      expect(quiz.practiceRecord, input.id).toBeUndefined();
      expect(quiz.questions.map((question) => question.question).join(' '), input.id).not.toMatch(/Records? [A-D]/);
      expect(out.lessonPlans.lessonPlans[0].suppliedMaterial, input.id).toBeTruthy();
      expect(out.studyGuides.studyGuides[0].suppliedMaterial, input.id).toBeTruthy();
      expect(text, input.id).not.toMatch(/admitted evidence|evidence ledger|source ledger|revision trail/i);
    }
  });

  it('prefers cached Scion questions over built ones', () => {
    clearMaterialItemsCache();
    const text = brief('A1-en-poem');
    const before = compileBrief(text, ['quizBank']).quizBank.quizzes[0];
    const material = before.suppliedMaterial;
    expect(material.blocks[0].kind).toBe('passage');
    const overlay = {
      byLesson: {
        1: {
          material: extractSuppliedMaterial(text),
          authored: [
            {
              type: 'short_answer',
              question: 'What does “Nothing beside remains” suggest about the king’s works?',
              answer: 'They have vanished; only the broken statue is left.',
              source: 'scion-material-item',
            },
          ],
          pool: [],
        },
      },
    };
    const next = applyMaterialOverlay(
      'quizBank',
      { quizzes: [{ ...before, questions: before.questions.slice(0, 1) }] },
      overlay,
    );
    expect(next.quizzes[0].questions[0]).toMatchObject({
      question: 'What does “Nothing beside remains” suggest about the king’s works?',
      enrichmentSource: 'scion-material-item',
    });
    expect(next.quizzes[0].materialQuestionSource).toBe('scion');
    writeCachedMaterialItems('unused', []);
  });
});

describe('v0.20.08 Chinese course shape and language', () => {
  it('reads lessons, minutes and quiz count from Chinese briefs', () => {
    expect(readCourseShapeLine(brief('Q2-zh-stats'))).toEqual({ lessons: 1, minutes: 45, quizPerLesson: 4 });
    expect(readChineseCourseShape('共八课时，每课时四十分钟，每节5道题')).toEqual({
      lessons: 8,
      minutes: 40,
      quizPerLesson: 5,
    });
    expect(readChineseCourseShape('第3节课讲浮力')).toBeNull();
    expect(detectExpectedLessons(brief('A2-zh-poem')).expected).toBe(1);
    expect(detectRequestedClassSessionMinutes(brief('A2-zh-poem'))).toBe(40);
    expect(extractExplicitTeachingRequirements(brief('T2-zh-bridge')).questionsPerLesson).toBe(4);
  });

  it('tells the model to write a Chinese brief in Chinese', () => {
    expect(detectBriefLanguage(brief('T2-zh-bridge'))).toBe('zh');
    expect(detectBriefLanguage('Mandarin for beginners: tones and 你好.')).toBe('en');
    expect(briefLanguageInstruction(brief('T2-zh-bridge'))).toMatch(/Simplified Chinese/);
    expect(briefLanguageInstruction(brief('T1-en-letter'))).toBe('');
  });
});

describe('v0.20.08 learner-facing text guard', () => {
  it('rewrites pipeline words and leaves identifiers alone', () => {
    expect(sanitizeLearnerFacingText('Distinguish admitted evidence for X from the source ledger.')).toBe(
      'Distinguish evidence for X from the source notes.',
    );
    const data = { protocol: 'source-ledger-facts-only', items: [{ explanation: 'An admitted source ledger.' }] };
    expect(sanitizeLearnerFacingData(data)).toEqual({
      protocol: 'source-ledger-facts-only',
      items: [{ explanation: 'The supplied sources.' }],
    });
  });
});

describe('v0.20.08 calculated answers', () => {
  const chem = extractSuppliedMaterial(brief('Q1-en-chem'));

  it('rejects a Scion answer key that contradicts the worked result', () => {
    const wrong = {
      question: 'How many mol of H2O can be produced from 4 mol H2 and 3 mol O2?',
      options: ['3 mol', '2 mol', '4 mol', '6 mol'],
      answer: 'B',
      quote: '4 mol H2 and 3 mol O2',
    };
    const result = validateMaterialItem(wrong, {
      material: chem,
      type: 'multiple_choice',
      language: 'en',
      verifiedNumbers: verifiedAnswerNumbers(chem),
      hasComputed: true,
    });
    expect(result.reason).toMatch(/calculation the app did not verify/);
  });

  it('keeps computed questions and asks Scion only for the remaining slots', async () => {
    let calls = 0;
    const result = await authorMaterialItems({
      material: chem,
      lessonTitle: 'Limiting reagents',
      count: 4,
      callModel: async () => {
        calls += 1;
        return '{"question":"Why is the reactant with more moles not always the one in excess, given 4 mol H2 and 3 mol O2?","answer":"The ratio in the equation decides it: H2 is used twice as fast as O2.","quote":"4 mol H2 and 3 mol O2"}';
      },
    });
    expect(result.items.slice(0, 3).every((item) => item.computed)).toBe(true);
    expect(result.items[3].source).toBe('scion-material-item');
    expect(calls).toBe(1);
  });
});

describe('v0.20.08 short-answer keys', () => {
  it('rejects a short answer keyed as a single letter', () => {
    const bridge = extractSuppliedMaterial(brief('T2-zh-bridge'));
    const result = validateMaterialItem(
      { question: '根据材料，哪一条记录给出了1631年这个时间？', answer: 'c', quote: '桥头碑文记载1631年重修' },
      { material: bridge, type: 'short_answer', language: 'zh' },
    );
    expect(result.reason).toMatch(/only a letter/);
  });
});

describe('v0.20.08 malformed Scion replies', () => {
  it('reads options given as an object and never lets one bad draft stop the quiz', async () => {
    const diary = extractSuppliedMaterial(brief('T4-zh-diary'));
    const objectOptions = validateMaterialItem(
      {
        question: '日记和回忆录关于学校是否上课的记载有什么不同？',
        options: { A: '日记说停课，回忆录说照常上课', B: '两者都说停课', C: '两者都说照常上课', D: '材料没有提到' },
        answer: 'A',
        quote: '一位教师在1937年的日记中写道当天学校停课',
      },
      { material: diary, type: 'multiple_choice', language: 'zh' },
    );
    expect(objectOptions.item.options).toHaveLength(4);
    const result = await authorMaterialItems({
      material: diary,
      lessonTitle: '比较史料',
      count: 2,
      callModel: async () => '{"question":"日记写了什么？","options":42,"answer":"A"}',
    });
    expect(result.items).toHaveLength(2);
  });
});

describe('v0.20.08 question focus', () => {
  it('asks causal questions for a cause-and-effect brief', () => {
    const prompt = buildMaterialItemPrompt({
      material: extractSuppliedMaterial(brief('A3-zh-tablet')),
      lessonTitle: '因果推断',
      index: 1,
      topicText: brief('A3-zh-tablet'),
    });
    expect(prompt).toContain('材料中还有哪件事也可能造成这个变化');
  });
});
