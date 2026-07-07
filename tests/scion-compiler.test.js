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
    const generateJson = async ({ system, user, schemaProfile }) => {
      calls.push(schemaProfile.name);
      if (schemaProfile.name === 'blind_solve') return JSON.stringify({ answers: [2] }); // disagrees with ai:0 twice
      if (schemaProfile.name === 'mc_item') {
        return JSON.stringify({
          q: 'Which interval spans seven semitones and rings at a 3:2 ratio?',
          op: ['Perfect fourth', 'Perfect fifth', 'Major third', 'Octave'],
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
    expect(events.some((event) => event.pass === 'polish')).toBe(true);
    expect(calls.filter((name) => name === 'blind_solve').length).toBe(2); // tie-break ran
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
