import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { extractSuppliedMaterial } from '../suppliedMaterial.js';
import {
  attributionProblem,
  changeItems,
  confoundItems,
  conflictingFigureItems,
  dialogueSpeakers,
  isLookupItem,
  reasoningProblem,
  selectionProblem,
  sourceFigureItems,
  testsSamePoint,
} from '../materialQuestionChecks.js';
import { authorMaterialItems, buildMaterialFallbackItems, buildMaterialItemPrompt } from '../materialQuizItems.js';
import { lessonMaterialQuestions } from '../materialOverlay.js';

// Real drafts from the v0.20.08 English live runs (see benchmarks/scion-live).
const read = (file) =>
  JSON.parse(fs.readFileSync(new URL(`../../../benchmarks/scion-live/${file}`, import.meta.url))).inputs;
const all = [...read('briefs.json'), ...read('briefs-en-heldout.json')];
const material = (id) => extractSuppliedMaterial(all.find((input) => input.id === id).brief);
const mc = (question, options, answer) => ({
  type: 'multiple_choice',
  question,
  options: options.map((option, index) => `${'ABCD'[index]}. ${option}`),
  answer,
});
const sa = (question, answer, extra = {}) => ({ type: 'short_answer', question, answer, ...extra });

describe('v0.20.09 who said what', () => {
  it('reads the speakers of a dialogue from their own introductions', () => {
    expect(dialogueSpeakers(material('E6-en-french')).map((speaker) => speaker.name)).toEqual(['Marie', 'Paul']);
    expect(dialogueSpeakers(material('A4-en-spanish')).map((speaker) => speaker.name)).toEqual(['Ana', 'Luis']);
  });

  it('rejects a line given to the wrong speaker and keeps correct ones', () => {
    const french = material('E6-en-french');
    expect(
      attributionProblem(sa('What does Marie say about where she lives?', 'Marie says, "J\'habite à Lyon."'), french),
    ).toMatch(/Paul's words to Marie/);
    expect(
      attributionProblem(sa('What does Marie say about where she lives?', 'Marie says, "J\'habite à Paris."'), french),
    ).toBe('');
    expect(
      attributionProblem(
        sa(
          'If Ana says, "Soy de México," what is the correct way for Luis to reply?',
          'He should reply, "Soy de España."',
        ),
        material('A4-en-spanish'),
      ),
    ).toMatch(/Luis's words to Ana/);
  });

  it('rejects a figure given to the wrong source', () => {
    const strike = material('T3-en-strike');
    const question = "According to the mill owners' newspaper, how many workers joined the 1912 strike?";
    expect(
      attributionProblem(mc(question, ['1,200 strikers', '300 workers', 'No third count', '1912'], 'A'), strike),
    ).toMatch(/another source's figure \(1200\)/);
    expect(attributionProblem(mc(question, ['1,200', '300', 'No third count', '1912'], 'B'), strike)).toBe('');
  });
});

describe('v0.20.09 reasoning errors', () => {
  it('rejects reliability judged by the size of a number', () => {
    expect(
      reasoningProblem(
        sa('Which count is more reliable?', 'The union bulletin is more reliable because it reports a larger number.'),
        {
          material: material('T3-en-strike'),
        },
      ),
    ).toMatch(/size of the number/);
  });

  it('rejects a correlation keyed as proof in a cause-and-effect lesson only', () => {
    const fluoride = material('E2-en-fluoride');
    const proof = sa('What does the drop show?', 'It proves that fluoride caused fewer cavities.');
    expect(reasoningProblem(proof, { material: fluoride, causalTopic: true })).toMatch(/correlation/);
    expect(reasoningProblem(proof, { material: fluoride, causalTopic: false })).toBe('');
    const careful = sa(
      'Can we conclude fluoride caused it?',
      'No, the clinics may also explain it, so it does not prove the cause.',
    );
    expect(reasoningProblem(careful, { material: fluoride, causalTopic: true })).toBe('');
  });
});

describe('v0.20.09 one point per question', () => {
  it('treats three questions about the same figure as one point', () => {
    const a = mc('What change happened?', ['20% more', '20% fewer', 'fewer clinics', 'same'], 'B');
    const b = mc('Fill in: ____% fewer cavities', ['21', '22', '30', '20'], 'D');
    expect(testsSamePoint(a, b)).toBe(true);
    const c = mc('What principle?', ['The idea that all men are created equal.', 'b', 'c', 'd'], 'A');
    const d = mc(
      'What concept?',
      ['conflict', 'a nation dedicated to the proposition that all men are created equal', 'x', 'y'],
      'B',
    );
    expect(testsSamePoint(c, d)).toBe(true);
  });

  it('allows one look-up question and asks for reasoning after it', () => {
    const crowd = material('E1-en-crowd');
    const lookup = mc(
      'According to the city newspaper, how many people joined?',
      ['10,000', '2,500', '3,000', '1,000'],
      'C',
    );
    const another = mc('According to the police log, how many marched?', ['2,500', '3,000', '10,000', '500'], 'A');
    const reasoning = sa(
      'Why might the memoir give a larger number than the police log?',
      'The memoir was written decades later by a participant who may have wanted the march to seem bigger.',
    );
    expect(isLookupItem(lookup, crowd)).toBe(true);
    expect(isLookupItem(reasoning, crowd)).toBe(false);
    expect(selectionProblem(another, [lookup], crowd)).toMatch(/look-up/);
    expect(selectionProblem(reasoning, [lookup], crowd)).toBe('');
  });

  it('still fills a three-line dialogue quiz to the requested count', () => {
    const french = material('E6-en-french');
    const pool = buildMaterialFallbackItems(french, { count: 12 });
    expect(lessonMaterialQuestions({ material: french, authored: [], pool }, 4)).toHaveLength(4);
  });
});

describe('v0.20.09 exact questions', () => {
  it('pairs each account with its own figure', () => {
    const [item] = sourceFigureItems(material('E1-en-crowd'));
    const keyed = item.options.find((option) => option.startsWith(`${item.answer}.`));
    expect(keyed).toBe("D. city newspaper: 3,000; participant's memoir: 10,000; police log: 2,500");
    const [strike] = sourceFigureItems(material('T3-en-strike'));
    expect(strike.options.find((option) => option.startsWith(`${strike.answer}.`))).toMatch(
      /mill owners' newspaper: 300; union bulletin: 1,200/,
    );
  });

  it('answers why sources disagree without ranking by size', () => {
    const [item] = conflictingFigureItems(material('T3-en-strike'));
    expect(item.answer).toMatch(/not more reliable in itself/);
    expect(reasoningProblem(item, { material: material('T3-en-strike') })).toBe('');
  });

  it('asks the confounding question in a cause-and-effect lesson', () => {
    const [item] = confoundItems(material('E2-en-fluoride'), 'cause and correlation');
    expect(item.question).toMatch(/free dental clinics/);
    expect(item.answer).toMatch(/^Not from this material alone/);
    expect(confoundItems(material('E2-en-fluoride'), 'reading comprehension')).toEqual([]);
  });

  it('computes percentage change and revenue from "from A to B" data', () => {
    const items = changeItems(material('E8-en-price'));
    expect(items.map((item) => item.answer)).toEqual([
      'a 25% increase',
      'a 25% decrease',
      'Revenue fell from $800 to $750.',
    ]);
  });

  it('fills a calculation quiz with exact questions so Scion is not asked', async () => {
    let calls = 0;
    const result = await authorMaterialItems({
      material: material('E5-en-freefall'),
      lessonTitle: 'Free fall',
      count: 4,
      callModel: async () => {
        calls += 1;
        return '{}';
      },
    });
    expect(calls).toBe(0);
    expect(result.items.map((item) => item.answer)).toEqual([
      '29.4 m/s',
      '44.1 m',
      '14.7 m/s',
      '11.03 m — only a quarter of the total, because the object keeps speeding up.',
    ]);
    const stats = buildMaterialFallbackItems(material('E4-en-scores'), {
      count: 4,
      topicText: 'mean, median and range',
    });
    expect(stats.map((item) => item.answer)).toEqual(['mean = 80', 'median = 85', 'range = 22', 'mode = 85']);
  });
});

describe('v0.20.09 prompt', () => {
  it('restates who says what and asks for reasoning after the first question', () => {
    const prompt = buildMaterialItemPrompt({
      material: material('E6-en-french'),
      lessonTitle: 'Introductions',
      index: 1,
      requireReasoning: true,
    });
    expect(prompt).toContain("- Paul: Je m'appelle Paul. J'habite à Lyon. Et toi ?");
    expect(prompt).toMatch(/must need reasoning/);
    expect(prompt).toMatch(/never by how large its number is/);
  });
});
