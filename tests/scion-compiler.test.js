// V2.1 Workstream D — the Scion-native compiler. Gates the four tiers:
// D1 contract handoff (declared json_schema, per-lesson chunks, pinned
// skeleton), D2 time-planner (CourseIR skip, greedy-first retry temperature),
// D3 quality passes in the compiler, D4 the on-device flywheel.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import {
  isScionProvider,
  kernelBatchSchemaProfile,
  skeletonSchemaProfile,
  SCION_SKELETON_DIRECTIVE,
  scionPassesEnabled,
  scionFlywheelEnabled,
} from '../src/lib/scionContracts';
import { applyScionKernelPasses } from '../src/lib/scionPasses';
import { getAdaptiveNativePassBBatchSize } from '../src/lib/adaptiveProviderBatching';
import { buildProviderTextRequest } from '../src/lib/modelRequestBuilders';
import { isAppliedQuizStem } from '../src/lib/quality/quizItemDepth';
import { assessScionKeyTerm } from '../src/lib/scionPreferenceGate';

describe('Scion-native compiler (V2.1 Workstream D)', () => {
  it('D1: Pass B runs per-lesson for the local provider', () => {
    const size = getAdaptiveNativePassBBatchSize({
      lessonCount: 7,
      maxOutputTokens: 16000,
      generationPlan: {},
      modelCapabilities: { provider: 'local' },
    });
    expect(size).toBe(1);
  });

  it('D1: the kernel batch contract pins lesson ids, counts, and atoms', () => {
    const profile = kernelBatchSchemaProfile({
      expectedLessonIds: ['lesson-3'],
      includeCourseLevel: false,
      mcCount: 4,
    });
    expect(profile.name).toBe('kernel_lesson_batch');
    const lessons = profile.schema.properties.lessons;
    expect(lessons.minItems).toBe(1);
    expect(lessons.maxItems).toBe(1);
    expect(lessons.items.properties.lessonId.enum).toEqual(['lesson-3']);
    expect(lessons.items.required).toContain('mc');
    expect(lessons.items.required).toContain('studyGuide');
    expect(lessons.items.additionalProperties).toBe(false);
    expect(lessons.items.properties.mc.minItems).toBe(4);
  });

  it('D1: content-sourced lessons get the session-only variant', () => {
    const profile = kernelBatchSchemaProfile({
      expectedLessonIds: ['lesson-1'],
      contentSourcedLessonIds: ['lesson-1'],
    });
    expect(profile.schema.properties.lessons.items.required).toEqual(['lessonId', 'goal', 'outcomes', 'async', 'sync']);
    expect(profile.schema.properties.lessons.items.properties.mc).toBeUndefined();
  });

  it('D1: the skeleton contract pins the session count and requires assessments', () => {
    const profile = skeletonSchemaProfile({ sessionCount: 7 });
    expect(profile.schema.properties.sessions.minItems).toBe(7);
    expect(profile.schema.properties.sessions.maxItems).toBe(7);
    expect(profile.schema.required).toContain('assessments');
    expect(profile.schema.properties.assessments.minItems).toBe(7);
    expect(SCION_SKELETON_DIRECTIVE).toContain('concise 2-4 word topic names');
  });

  it('D2: local requests are greedy by default and sample only on override', () => {
    const base = {
      provider: 'local',
      apiKey: '',
      modelId: 'scion-1',
      systemPrompt: 's',
      userPrompt: 'u',
      maxOutputTokens: 1000,
    };
    expect(buildProviderTextRequest(base).body.temperature).toBeUndefined();
    expect(buildProviderTextRequest({ ...base, temperatureOverride: 0.7 }).body.temperature).toBe(0.7);
  });

  it('D2: CourseIR direct authoring is skipped for the local provider (source wiring)', () => {
    const runtime = fs.readFileSync('src/lib/courseIRAuthoringRuntime.js', 'utf8');
    expect(runtime).toContain("if (provider === 'local') {");
    expect(runtime).toContain('Scion time-planner');
  });

  it('D2: anonymous Scion skips unsupported native skeleton authoring (source wiring)', () => {
    const runtime = fs.readFileSync('src/lib/courseIRAuthoringRuntime.js', 'utf8');
    expect(runtime).toContain("if (provider === 'public') {");
    expect(runtime).toContain('public Scion uses the compact course-map contract');
  });

  it('D3: passes fix keys, gate topics, and polish prose through the callback', async () => {
    const lesson = {
      lessonId: 'lesson-1',
      mc: [
        {
          q: 'Which interval has a 3:2 frequency ratio in just intonation today?',
          op: ['Minor third', 'Major second', 'Perfect fifth', 'Minor seventh'],
          ai: 0,
          ex: 'The perfect fifth is the 3:2 interval in just intonation.',
        },
      ],
      scenario: {
        su: 'A musician hears two notes a perfect fifth apart and wants to name the interval by ear.',
        ma: 'A piano and staff paper',
      },
      discussionPrompt: {
        pr: 'Is consonance culturally learned or acoustically inherent?',
        tn: 'Reasonable musicians disagree on nature versus nurture.',
        po: ['It is acoustic', 'It is learned'],
      },
      assignmentCore: {
        td: 'Students transcribe three intervals played in class and defend each identification in one sentence.',
        pa: ['Three intervals', 'One page'],
      },
      studyGuide: {
        sm: 'Intervals measure the distance between two pitches; the perfect fifth (3:2) anchors tuning systems across traditions and eras.',
        rs: 'Drill interval recognition daily with a partner at the keyboard.',
      },
    };
    const calls = [];
    const blindSchemas = [];
    const generateJson = async ({ system, user, schemaProfile }) => {
      calls.push(schemaProfile.name);
      if (schemaProfile.name === 'blind_solve') {
        blindSchemas.push(schemaProfile.schema);
        // Exact option text maps to index 2 in the original and index 1 in
        // the replacement without asking the weak model to translate the
        // proposition into a zero-based integer.
        return JSON.stringify({ answers: ['Perfect fifth'] });
      }
      if (schemaProfile.name === 'mc_item') {
        return JSON.stringify({
          q: 'Which interval spans seven semitones and rings at a 3:2 ratio?',
          op: ['A. Perfect fourth', 'B. Perfect fifth', 'C. Major third', 'D. Octave'],
          ai: 1,
          ex: 'Seven semitones with the 3:2 just ratio defines the perfect fifth interval.',
        });
      }
      return JSON.stringify({
        scenario: lesson.scenario,
        discussionPrompt: lesson.discussionPrompt,
        assignmentCore: lesson.assignmentCore,
        studyGuide: lesson.studyGuide,
      });
    };
    const raw = JSON.stringify({ lessons: [lesson] });
    const { text, events } = await applyScionKernelPasses(raw, {
      promptLessons: [
        { lessonId: 'lesson-1', title: 'Lesson 1: Intervals', topics: '1.1: Intervals; 1.2: Consonance' },
      ],
      generateJson,
    });
    const patched = JSON.parse(text).lessons[0];
    expect(events.some((event) => event.pass === 'mcVerify' && event.action === 'regenerated')).toBe(true);
    expect(patched.mc[0].ai).toBe(1); // the two-solve-confirmed regeneration landed
    expect(patched.mc[0].op).toEqual(['Perfect fourth', 'Perfect fifth', 'Major third', 'Octave']);
    expect(events.some((event) => event.pass === 'polish')).toBe(true);
    expect(calls.filter((name) => name === 'blind_solve').length).toBe(4); // original + replacement each solved twice
    expect(blindSchemas[0].properties.answers.prefixItems[0].enum).toEqual([
      'Minor third',
      'Major second',
      'Perfect fifth',
      'Minor seventh',
    ]);
    expect(blindSchemas[0].properties.answers.items).toBe(false);
    const event = events.find((entry) => entry.pass === 'mcVerify' && entry.action === 'regenerated');
    expect(event).toMatchObject({ trainingEligible: true });
    expect(event.preferenceEvidence).toMatchObject({ verified: true, chosenAnswers: [1, 1] });
  });

  it('D3: never ships or banks a regenerated item whose new key fails verification', async () => {
    const original = {
      q: 'Which interval has a 3:2 frequency ratio in just intonation today?',
      op: ['Minor third', 'Major second', 'Perfect fifth', 'Minor seventh'],
      ai: 0,
      ex: 'The perfect fifth is the 3:2 interval in just intonation.',
    };
    const lesson = {
      lessonId: 'lesson-1',
      mc: [original],
      scenario: {
        su: 'A sufficiently concrete scenario that will not be polished in this focused test.',
        ma: 'A score excerpt',
      },
    };
    const generateJson = async ({ schemaProfile }) => {
      if (schemaProfile.name === 'blind_solve') return JSON.stringify({ answers: [2] });
      return JSON.stringify({
        q: 'Which interval spans seven semitones and rings at a 3:2 ratio?',
        op: ['Perfect fourth', 'Perfect fifth', 'Major third', 'Octave'],
        ai: 1,
        ex: 'This explanation claims the answer is correct but the cold solver rejects that key.',
      });
    };
    const result = await applyScionKernelPasses(JSON.stringify({ lessons: [lesson] }), {
      promptLessons: [{ lessonId: 'lesson-1', title: 'Intervals', topics: 'intervals consonance' }],
      generateJson,
    });
    expect(JSON.parse(result.text).lessons[0].mc[0]).toEqual(original);
    expect(result.events.some((event) => event.trainingEligible)).toBe(false);
  });

  it('D3: repairs admission failures before projection can silently drop quiz seats', async () => {
    const brokenItem = (suffix) => ({
      q: `Which method organizes interview response ${suffix}?`,
      op: ['Thematic coding', 'Thematic coding', 'Random sampling', 'A/B testing'],
      ai: 0,
      ex: 'Thematic coding organizes recurring ideas in interview transcripts.',
    });
    const lesson = {
      lessonId: 'lesson-1',
      mc: [brokenItem('one'), brokenItem('two'), brokenItem('three'), brokenItem('four')],
      scenario: {
        su: 'A researcher observes recurring navigation confusion across three participant interviews and must decide how to organize the evidence.',
        ma: 'Three interview transcripts, timestamped observations, and a coding worksheet',
      },
    };
    const repairedOptions = ['Thematic coding', 'Random sampling', 'A/B testing', 'Linear regression'];
    const generateJson = async ({ schemaProfile, user }) => {
      if (schemaProfile.name === 'blind_solve') {
        return JSON.stringify({ answers: JSON.parse(user).map(() => 0) });
      }
      if (schemaProfile.name === 'mc_admission_batch') {
        return JSON.stringify({
          repairs: [0, 1, 2, 3].map((index) => ({
            index,
            q: `A researcher observes navigation confusion in three interview transcripts for case ${index + 1}. Which method best organizes this evidence?`,
            op: repairedOptions,
            ai: 0,
            ex: 'Thematic coding organizes recurring transcript evidence, while random sampling changes recruitment instead of analyzing these records.',
          })),
        });
      }
      return JSON.stringify({
        scenario: lesson.scenario,
        discussionPrompt: { pr: 'Compare interpretations.', tn: 'The records conflict.', po: ['One', 'Two', 'Three'] },
        assignmentCore: {
          td: 'Analyze the supplied records and recommend a bounded next step.',
          pa: ['A', 'B', 'C', 'D'],
        },
        studyGuide: {
          sm: 'Review recurring patterns in the interview evidence before selecting a method.',
          rs: 'Map each excerpt to a candidate code.',
        },
      });
    };
    const result = await applyScionKernelPasses(JSON.stringify({ lessons: [lesson] }), {
      promptLessons: [{ lessonId: 'lesson-1', title: 'Interview coding', topics: 'interview thematic coding' }],
      generateJson,
    });
    const patched = JSON.parse(result.text).lessons[0];
    expect(patched.mc).toHaveLength(4);
    expect(patched.mc.every((item) => new Set(item.op).size === 4)).toBe(true);
    const repairs = result.events.filter((event) => event.pass === 'admissionGate' && event.action === 'regenerated');
    expect(repairs).toHaveLength(4);
    expect(repairs.every((event) => event.trainingEligible && event.preferenceEvidence?.verified)).toBe(true);
    expect(repairs[0].preferenceEvidence.rejectedIssues).toContain('duplicate-options');
  });

  it('D3: backfills missing MC seats and verifies their keys without inventing rejected preference data', async () => {
    const options = ['Thematic coding', 'Random sampling', 'A/B testing', 'Linear regression'];
    const lesson = {
      lessonId: 'lesson-1',
      mc: [
        {
          q: 'Which method organizes recurring evidence in interview transcripts?',
          op: options,
          ai: 0,
          ex: 'Thematic coding groups recurring transcript evidence, while the alternatives answer different questions.',
        },
      ],
      scenario: {
        su: 'A researcher observes recurring navigation confusion across three participant interviews and must decide how to organize the evidence.',
        ma: 'Three interview transcripts, timestamped observations, and a coding worksheet',
      },
    };
    const generateJson = async ({ schemaProfile, user }) => {
      if (schemaProfile.name === 'blind_solve') {
        return JSON.stringify({ answers: JSON.parse(user).map(() => 0) });
      }
      if (schemaProfile.name === 'mc_admission_batch') {
        return JSON.stringify({
          repairs: [1, 2, 3].map((index) => ({
            index,
            q: `A researcher compares navigation evidence from three interview transcripts in case ${index}. Which method best organizes the recurring observations?`,
            op: options.map((option, optionIndex) => `${String.fromCharCode(65 + optionIndex)}. ${option}`),
            ai: 0,
            ex: 'The correct method organizes recurring transcript evidence, while changing recruitment would not analyze these existing records.',
          })),
        });
      }
      return JSON.stringify({
        scenario: lesson.scenario,
        discussionPrompt: { pr: 'Compare interpretations.', tn: 'Two codes overlap.', po: ['One', 'Two', 'Three'] },
        assignmentCore: {
          td: 'Analyze the records and recommend one bounded coding decision.',
          pa: ['A', 'B', 'C', 'D'],
        },
        studyGuide: {
          sm: 'Review the interview evidence and compare how each method organizes recurring observations.',
          rs: 'Map each excerpt to a candidate code.',
        },
      });
    };
    const result = await applyScionKernelPasses(JSON.stringify({ lessons: [lesson] }), {
      promptLessons: [{ lessonId: 'lesson-1', title: 'Interview coding', topics: 'interview thematic coding' }],
      generateJson,
      expectedMcCount: 4,
    });
    const patched = JSON.parse(result.text).lessons[0];
    expect(patched.mc).toHaveLength(4);
    expect(patched.mc.slice(1).every((item) => item.ai === 0)).toBe(true);
    expect(patched.mc.slice(1).every((item) => !/^[A-D][.)]\s/.test(item.op[0]))).toBe(true);
    const backfills = result.events.filter(
      (event) => event.pass === 'admissionGate' && event.action === 'regenerated' && event.rejected === null,
    );
    expect(backfills).toHaveLength(3);
    expect(backfills.every((event) => event.trainingEligible === false && !event.preferenceEvidence)).toBe(true);
  });

  it('D3: batches remaining off-topic repairs and verifies the batch twice', async () => {
    const offTopic = (suffix) => ({
      q: `Which interval describes the unrelated music example ${suffix}?`,
      op: ['Perfect fifth', 'Minor third', 'Octave', 'Major second'],
      ai: 0,
      ex: 'The perfect fifth is the keyed music interval, while the alternatives name different intervals.',
    });
    const lesson = {
      lessonId: 'lesson-1',
      mc: [offTopic('one'), offTopic('two')],
      scenario: {
        su: 'A researcher observes repeated navigation confusion across three interviews and must organize the evidence.',
        ma: 'Three interview transcripts and a shared coding worksheet',
      },
    };
    const calls = [];
    const repairedOptions = ['Thematic coding', 'Random sampling', 'A/B testing', 'Linear regression'];
    const generateJson = async ({ schemaProfile, user }) => {
      calls.push(schemaProfile.name);
      if (schemaProfile.name === 'blind_solve') {
        return JSON.stringify({ answers: JSON.parse(user).map(() => 0) });
      }
      if (schemaProfile.name === 'mc_admission_batch') {
        return JSON.stringify({
          repairs: [0, 1].map((index) => ({ index, ...lesson.mc[index] })),
        });
      }
      if (schemaProfile.name === 'topic_repair_batch') {
        return JSON.stringify({
          repairs: [0, 1].map((index) => ({
            index,
            q: `A researcher compares recurring navigation failures in three interviews for case ${index + 1}. Which method best organizes this evidence?`,
            op: repairedOptions.map((option, optionIndex) => `${String.fromCharCode(65 + optionIndex)}. ${option}`),
            ai: 0,
            ex: 'Thematic coding organizes recurring interview evidence, while the alternatives answer different research questions.',
          })),
        });
      }
      return JSON.stringify({
        scenario: lesson.scenario,
        discussionPrompt: { pr: 'Compare the interpretations.', tn: 'Two codes overlap.', po: ['One', 'Two', 'Three'] },
        assignmentCore: { td: 'Analyze the records and recommend one coding decision.', pa: ['A', 'B', 'C', 'D'] },
        studyGuide: { sm: 'Review how coding organizes recurring interview evidence.', rs: 'Map excerpts to codes.' },
      });
    };

    const result = await applyScionKernelPasses(JSON.stringify({ lessons: [lesson] }), {
      promptLessons: [{ lessonId: 'lesson-1', title: 'Interview coding', topics: 'interview thematic coding' }],
      generateJson,
    });
    const patched = JSON.parse(result.text).lessons[0];
    expect(calls.filter((name) => name === 'topic_repair_batch')).toHaveLength(1);
    expect(calls.filter((name) => name === 'mc_item')).toHaveLength(0);
    expect(patched.mc.every((item) => item.op[0] === 'Thematic coding')).toBe(true);
    const repairs = result.events.filter((event) => event.pass === 'topicGate' && event.action === 'regenerated');
    expect(repairs).toHaveLength(2);
    expect(repairs.every((event) => event.preferenceEvidence?.chosenAnswers.join(',') === '0,0')).toBe(true);
  });

  it('D3: repairs malformed key-term atoms without treating open-ended prose as verified preference data', async () => {
    const lesson = {
      lessonId: 'lesson-1',
      mc: [],
      facts: ['Thematic coding groups recurring evidence from qualitative records.'],
      keyTerms: [{ tr: 'Thematic coding', df: 'Too short', eg: 'Example', mi: 'Wrong', cx: 'Fix' }],
      scenario: {
        su: 'A researcher compares three interview transcripts before selecting a coding method.',
        ma: 'Three transcripts and a coding worksheet',
      },
      discussionPrompt: {
        pr: 'Which coding interpretation fits?',
        tn: 'Two plausible codes overlap.',
        po: ['One', 'Two', 'Three'],
      },
      assignmentCore: {
        td: 'Analyze the interview evidence and produce a bounded coding recommendation.',
        pa: ['A', 'B', 'C', 'D'],
      },
      studyGuide: {
        sm: 'Review the coding terms and compare how each one organizes qualitative evidence in the supplied records.',
        rs: 'Map each transcript excerpt to a code and explain one boundary.',
      },
    };
    const generateJson = async ({ schemaProfile }) => {
      if (schemaProfile.name === 'blind_solve') return JSON.stringify({ answers: [] });
      if (schemaProfile.name === 'key_term_admission_batch') {
        return JSON.stringify({
          repairs: ['Thematic coding', 'Codebook', 'Analytic memo'].map((tr, index) => ({
            index,
            tr,
            df: 'A structured concept used to organize and interpret recurring evidence in qualitative records.',
            eg: 'A researcher applies the concept to repeated navigation comments in three interview transcripts.',
            mi: 'The concept is only a label and does not require evidence from the underlying records.',
            cx: 'The concept links a named category to specific excerpts and preserves contradictory observations.',
          })),
        });
      }
      return JSON.stringify({
        scenario: lesson.scenario,
        discussionPrompt: lesson.discussionPrompt,
        assignmentCore: lesson.assignmentCore,
        studyGuide: lesson.studyGuide,
      });
    };
    const result = await applyScionKernelPasses(JSON.stringify({ lessons: [lesson] }), {
      promptLessons: [{ lessonId: 'lesson-1', title: 'Interview coding', topics: 'interview thematic coding' }],
      generateJson,
      minimumKeyTermCount: 3,
    });
    const patched = JSON.parse(result.text).lessons[0];
    expect(patched.keyTerms.every((term) => assessScionKeyTerm(term).eligible)).toBe(true);
    const repairs = result.events.filter(
      (event) => event.pass === 'keyTermAdmission' && event.action === 'regenerated',
    );
    expect(repairs).toHaveLength(3);
    expect(repairs.every((event) => event.trainingEligible === false)).toBe(true);
  });

  it('D3/D4: rewrites non-Remember MC seats around admitted scenario evidence and banks verified pairs', async () => {
    const options = ['Thematic coding', 'Random sampling', 'A/B testing', 'Linear regression'];
    const recallItem = (question) => ({
      q: question,
      op: options,
      ai: 0,
      ex: 'Thematic coding organizes recurring ideas in interview transcripts, whereas the alternatives answer other questions.',
    });
    const lesson = {
      lessonId: 'lesson-1',
      mc: [
        recallItem('Which method organizes recurring ideas in interview transcripts?'),
        recallItem('Which method is used to code interview responses?'),
        recallItem('Which approach groups repeated patterns in qualitative data?'),
        recallItem('Which technique labels repeated ideas in interview notes?'),
      ],
      scenario: {
        su: 'A researcher observes the same navigation confusion in three participant interviews and must decide how to organize the repeated explanations.',
        ma: 'Three interview transcripts, timestamped observations, and a shared coding worksheet',
      },
      discussionPrompt: {
        pr: 'Which interpretation should guide the next analysis step?',
        tn: 'The repeated comments support competing explanations of the navigation failure.',
        po: ['Code the repeated pattern', 'Collect a larger sample', 'Condition the decision on another observation'],
      },
      assignmentCore: {
        td: 'Analyze the supplied interview records and produce a bounded recommendation for the next research step.',
        pa: ['Use three transcripts', 'Submit a coding table', 'Cite two observations', 'Limit the memo to 500 words'],
      },
      studyGuide: {
        sm: 'Thematic coding groups recurring ideas in qualitative records while preserving the evidence that supports each interpretation.',
        rs: 'Practice mapping transcript excerpts to candidate codes, then compare where two plausible codes diverge.',
      },
    };
    const generateJson = async ({ schemaProfile, user }) => {
      if (schemaProfile.name === 'blind_solve') {
        return JSON.stringify({ answers: JSON.parse(user).map(() => 0) });
      }
      if (schemaProfile.name === 'applied_mc_batch') {
        return JSON.stringify({
          repairs: [1, 2].map((index) => ({
            index,
            q:
              index === 1
                ? 'A researcher observes repeated navigation confusion across three interview transcripts. Which approach best organizes this evidence before choosing a revision?'
                : "A researcher records the same pattern in three participant interviews but one conflicting response. Which approach best analyzes the claim: 'the pattern is conclusive.'?",
          })),
        });
      }
      return JSON.stringify({
        scenario: lesson.scenario,
        discussionPrompt: lesson.discussionPrompt,
        assignmentCore: lesson.assignmentCore,
        studyGuide: lesson.studyGuide,
      });
    };

    const result = await applyScionKernelPasses(JSON.stringify({ lessons: [lesson] }), {
      promptLessons: [{ lessonId: 'lesson-1', title: 'Interview coding', topics: 'interview thematic coding' }],
      generateJson,
    });
    const patched = JSON.parse(result.text).lessons[0];
    expect(isAppliedQuizStem(patched.mc[0].q)).toBe(false);
    expect(isAppliedQuizStem(patched.mc[1].q)).toBe(true);
    expect(isAppliedQuizStem(patched.mc[2].q)).toBe(true);
    expect(patched.mc[3].q).toBe('Which technique labels repeated ideas in interview notes?');
    expect(patched.mc[2].q).toContain("'the pattern is conclusive'?");
    expect(patched.mc[1].op).toEqual(options);
    expect(patched.mc[1].ex).toBe(lesson.mc[1].ex);
    const repairs = result.events.filter((event) => event.pass === 'appliedDepth');
    expect(repairs).toHaveLength(2);
    expect(repairs.every((event) => event.trainingEligible && event.preferenceEvidence?.verified)).toBe(true);
    expect(repairs[0].preferenceEvidence).toMatchObject({
      kind: 'applied-depth-and-key-repair',
      chosenAnswers: [0, 0],
    });
  });

  it('D3/D4: gates default ON and honor the explicit opt-out', () => {
    expect(isScionProvider('local')).toBe(true);
    expect(scionPassesEnabled()).toBe(true);
    expect(scionFlywheelEnabled()).toBe(true);
    const store = new Map([
      ['coursemapper-scion-passes', 'off'],
      ['coursemapper-scion-flywheel', 'off'],
    ]);
    globalThis.localStorage = { getItem: (key) => store.get(key) ?? null };
    try {
      expect(scionPassesEnabled()).toBe(false);
      expect(scionFlywheelEnabled()).toBe(false);
    } finally {
      delete globalThis.localStorage;
    }
  });

  it('D4: the flywheel and pass wiring exist in the compiler (source wiring)', () => {
    // The compiler lazy-loads the Scion orchestration (scionPassB) so the
    // local-only wiring stays out of the main bundle chunk.
    const deliverables = fs.readFileSync('src/hooks/useDeliverables.js', 'utf8');
    expect(deliverables).toContain("import('../lib/scionPassB')");
    expect(deliverables).toContain('scionCallOpts');
    expect(deliverables).toContain('runScionPasses');
    const passB = fs.readFileSync('src/lib/scionPassB.js', 'utf8');
    expect(passB).toContain('kernelBatchSchemaProfile');
    expect(passB).toContain('applyScionKernelPasses');
    expect(passB).toContain('postFlywheelEvents');
    expect(passB).toContain('recoveryAttempt > 0 ? 0.7 : 0');
    const server = fs.readFileSync('scripts/crucible/e2bOpenAIShim.mjs', 'utf8');
    expect(server).toContain('/flywheel');
    expect(server).toContain('app-flywheel.jsonl');
  });
});
