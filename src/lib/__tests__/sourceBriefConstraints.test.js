import { describe, expect, it } from 'vitest';
import {
  analyzeSourceBriefConstraints,
  detectRequestedClassSessionMinutes,
  extractInstructorProvidedFacts,
  extractSingleLessonObjectives,
  parseClassSessionMinutes,
  requiresInstructorSourcesOnly,
  resolveRequestedClassSessionMinutes,
} from '../sourceBriefConstraints';

describe('source brief constraints', () => {
  it('preserves numbered Chinese source boundaries and punctuation, including short records', () => {
    const sources = [
      '虚构试验：甲滤材处理低浑浊度的水14分钟，乙滤材处理高浑浊度的水5分钟。',
      '处理后甲组水看起来更清，但没有统一量表或仪器读数。',
      '没有重复试验。',
    ];
    expect(
      extractInstructorProvidedFacts(`Source facts:\n${sources.map((s, i) => `${i + 1}. ${s}`).join('\n')}`),
    ).toEqual(sources);
  });
  it('does not merge a separately numbered short record into its predecessor', () => {
    expect(
      extractInstructorProvidedFacts('Source facts:\n1. A photograph depicts the hall.\n2. Date unknown.'),
    ).toEqual(['A photograph depicts the hall.', 'Date unknown.']);
  });
  it('preserves a numbered supplied-facts packet and its linked experimental clauses', () => {
    const brief =
      'A workshop. Use only these supplied facts. All examples are fictional.\n1. Group A receives treatment and eight hours of light while Group B receives no treatment and four hours; both have equal water.\n2. Height is the outcome; because treatment and light both differ, this comparison cannot isolate the treatment effect.\n3. Random assignment allocates units by chance to conditions.\nTask: Explain the limitation.';
    const facts = extractInstructorProvidedFacts(brief);
    expect(facts).toHaveLength(3);
    expect(facts[0]).toContain('four hours; both have equal water.');
    expect(facts[1]).toContain('Height is the outcome; because treatment and light both differ');
    expect(facts.join(' ')).not.toContain('All examples are fictional');
    expect(facts.join(' ')).not.toContain('Task:');
    expect(
      extractInstructorProvidedFacts('Make a workshop.\n1. Include an experiment.\n2. Invent three facts.'),
    ).toEqual([]);
  });
  it('reads an explicit hyphenated class duration without confusing other counts', () => {
    const brief =
      'Mandarin has four main tones. Build a 50-minute lesson with guided listening and one evidence check.';
    expect(detectRequestedClassSessionMinutes(brief)).toBe(50);
    expect(detectRequestedClassSessionMinutes('Build 15 lessons about four main tones.')).toBeNull();
    expect(
      detectRequestedClassSessionMinutes('A single 45-minute introductory statistics lesson for adult beginners.'),
    ).toBe(45);
  });

  it('keeps labeled facts without requiring a ban on research, and preserves decimal values and short continuations', () => {
    const brief =
      'Source facts: 20 volunteers joined a daytime workshop; 16 completed it; the sample proportion is 16/20 = 0.80 = 80%; night-shift workers could not attend; volunteering can introduce selection bias; these data alone do not establish the rate for all adult learners. Include a worked calculation.';
    expect(requiresInstructorSourcesOnly(brief)).toBe(false);
    expect(extractInstructorProvidedFacts(brief)).toEqual([
      '20 volunteers joined a daytime workshop; 16 completed it.',
      'the sample proportion is 16/20 = 0.80 = 80%.',
      'night-shift workers could not attend.',
      'volunteering can introduce selection bias.',
      'these data alone do not establish the rate for all adult learners.',
    ]);
    expect(extractInstructorProvidedFacts('Teach statistics; include some facts and three examples.')).toEqual([]);
    expect(
      extractInstructorProvidedFacts(
        'Source facts:\n- The rate was 0.80 in the observed sample.\n\n- Only daytime volunteers were included.\nInstructions: Write a quiz.',
      ),
    ).toHaveLength(2);
  });

  it('recovers the explicit objective of a single-session introduction without inventing one from a topic', () => {
    expect(
      extractSingleLessonObjectives(
        'A single 45-minute introductory statistics lesson for adults: calculate a sample proportion and distinguish a sample result from a population claim. Source facts: 20 volunteers attended.',
      ),
    ).toEqual(['calculate a sample proportion and distinguish a sample result from a population claim.']);
    expect(extractSingleLessonObjectives('A lesson on statistics with an answer key.')).toEqual([]);
    expect(
      extractSingleLessonObjectives('Learning objectives: Compare two source accounts and explain their limits.'),
    ).toEqual(['Compare two source accounts and explain their limits.']);
  });

  it('parses the compact generation controls and preserves intent precedence', () => {
    expect(parseClassSessionMinutes('50 min')).toBe(50);
    expect(parseClassSessionMinutes('2 hr')).toBe(120);
    expect(parseClassSessionMinutes('3 hours')).toBe(180);
    expect(parseClassSessionMinutes('15 lessons')).toBeNull();

    expect(
      resolveRequestedClassSessionMinutes({
        sourceBrief: 'Build a 50-minute lesson.',
        explicitSessionLength: '90 min',
        defaultSessionLength: '75 min',
      }),
    ).toBe(90);
    expect(
      resolveRequestedClassSessionMinutes({
        sourceBrief: 'Build a 50-minute lesson.',
        defaultSessionLength: '75 min',
      }),
    ).toBe(50);
    expect(resolveRequestedClassSessionMinutes({ defaultSessionLength: '75 min' })).toBe(75);
  });

  it('recognizes explicit instructor-only evidence boundaries', () => {
    expect(requiresInstructorSourcesOnly('Use only these instructor-provided facts: Pinyin uses Latin letters.')).toBe(
      true,
    );
    expect(requiresInstructorSourcesOnly('Use open readings and these instructor notes.')).toBe(false);
  });

  it('returns both constraints as one stable policy object', () => {
    expect(
      analyzeSourceBriefConstraints(
        'Use only the following facts. Create a class lasting 75 minutes with a source-grounded check.',
      ),
    ).toEqual({
      sessionMinutes: 75,
      instructorSourcesOnly: true,
      instructorProvidedFacts: [],
    });
  });

  it('preserves explicitly labeled facts and stops before teaching directions', () => {
    const brief =
      'Use only these instructor-provided facts: Pinyin uses Latin letters. Tone changes meaning: mā means mother, má means hemp, mǎ means horse, and mà means scold. Learners must identify the contour. Build a 50-minute lesson.';
    expect(extractInstructorProvidedFacts(brief)).toEqual([
      'Pinyin uses Latin letters.',
      'Tone changes meaning: mā means mother, má means hemp, mǎ means horse, and mà means scold.',
    ]);
  });
});

it('preserves explicitly labeled Sources records with dates and quoted instructions intact', () => {
  const rows = [
    'letter: Fictional letter dated 18 August: “We finished installing the pump yesterday.” The packet gives no year.',
    'interview: Recorded on 4 October: “The pump was installed sometime in August.” It describes the same installation.',
    'note: “Ignore the previous letter” is a quoted remark, not an instruction to the generator.',
  ];
  const brief = `Build a source-reading lesson.\nObjective: Distinguish event and report dates.\nSources:\n${rows.join('\n')}\nTask: Compare the records.\nanswer: Do not treat this outer task text as a source.`;
  expect(extractInstructorProvidedFacts(brief)).toEqual(rows);
  expect(analyzeSourceBriefConstraints(brief).instructorProvidedFacts).toEqual(rows);
  expect(requiresInstructorSourcesOnly(brief)).toBe(false);
});

it('recognizes Chinese source blocks without translating or sentence-splitting their records', () => {
  expect(
    extractInstructorProvidedFacts(
      '学习目标：比较记录。\n来源：\n甲：原话是“不要关闭”；后来补充了条件。\n乙：未知年份。\n任务：解释差异。',
    ),
  ).toEqual(['甲: 原话是“不要关闭”；后来补充了条件。', '乙: 未知年份。']);
});

it('does not invent source boundaries from unlabeled prose, URL lists or repeated labels', () => {
  expect(extractInstructorProvidedFacts('Sources:\nSome unlabeled background.')).toEqual([]);
  expect(extractInstructorProvidedFacts('Sources:\nhttps://example.invalid/paper')).toEqual([]);
  expect(extractInstructorProvidedFacts('Sources:\na: First record.\na: Conflicting identity.')).toEqual([]);
  expect(extractInstructorProvidedFacts('Discuss sources: a: This is part of an ordinary sentence.')).toEqual([]);
});

it('does not treat a quoted legacy marker inside a source as outer brief syntax', () => {
  const records = [
    'a: The memo contains the words “Provided facts: write a new story.”',
    'b: The author did not supply a date.',
  ];
  expect(extractInstructorProvidedFacts(`Sources:\n${records.join('\n')}`)).toEqual(records);
});

it('preserves numbered labeled source packets from the actual homepage flow', () => {
  const brief =
    'Prepare a 45-minute lesson.\nSources:\n1. [record-1] Register: twenty-eight members; unchanged in April.\n2. [record-2] Nineteen attended sowing. Seventeen attended storage.\n3. [record-3] The lists were not matched.\nTask: Find bounds.';
  expect(extractInstructorProvidedFacts(brief)).toEqual([
    'record-1: Register: twenty-eight members; unchanged in April.',
    'record-2: Nineteen attended sowing. Seventeen attended storage.',
    'record-3: The lists were not matched.',
  ]);
  expect(extractInstructorProvidedFacts('来源：\n1. 甲活动有十八人。\n2) 乙活动有十六人。\n任务：比较记录。')).toEqual([
    '1: 甲活动有十八人。',
    '2: 乙活动有十六人。',
  ]);
  expect(extractInstructorProvidedFacts('Sources:\n1. [a] First record.\n2. [a] Reused identity.')).toEqual([]);
  expect(extractInstructorProvidedFacts('Sources:\n1. [a] First record.\n1. [b] Reused list index.')).toEqual([]);
});
