/**
 * Voice v2 — the post-mortem rebuild of the voice pass.
 *
 * v1 failed its live bar (judge 3/10 voiced vs 4/10 quiet; 38/52 fallbacks;
 * texture 76→75). The v2 contract under test:
 *  - NEVER-RENAME replaces verbatim-title stuffing: a rewrite may OMIT
 *    registry ids (identity lives in the compiled header) but may never
 *    carry an id its own original doesn't have,
 *  - kernels are whitelisted substance: rewrites may commit to kernel
 *    terms/definitions/sources; invented entities still reject,
 *  - asymmetric selection: at most VOICE_MAX_SURFACES surfaces, ≤2 per
 *    lesson, week-one brief prioritized — uneven emphasis by design,
 *  - variety by construction: rotated per-surface directives in the prompt
 *    and a cross-surface duplicate-opener lint,
 *  - the texture SELF-CHECK: if the touched features' texture score did not
 *    improve, the whole pass reverts and reports itself,
 *  - unchanged laws: flag default off, fallback never block, honest budget
 *    exhaustion, D4 disclosure.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  VOICE_BATCH_SIZE,
  VOICE_MAX_SURFACES,
  applyVoiceResults,
  buildVoicePrompt,
  clearVoicePassOutcome,
  lintVoiceResult,
  openingTrigram,
  peekVoicePassOutcome,
  readVoicePassMode,
  recordVoicePassOutcome,
  runVoicePass,
  selectVoiceSurfaces,
} from '../src/lib/voicePass.js';
import { applyApiCallBudgetEvent, createApiCallBudget } from '../src/lib/apiCallBudget.js';
import { formatRunDigest } from '../src/lib/runDigest.js';
import { deriveCourseGraphFromCourseMap } from '../src/lib/courseGraph/deriveFromCourseMap.js';
import { buildBlueprintFromGraph } from '../src/lib/courseGraph/blueprintFromGraph.js';
import { compactBlueprintForStorage, compileBlueprintDeliverables } from '../src/lib/courseBlueprintCompiler.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ── Fixture: the WS-G geology map, compiled for real (no compiler mocks) ────
function geologyMap(lessonCount = 4, { includeTasks = true } = {}) {
  const topics = ['Minerals', 'Igneous Rocks', 'Sedimentary Rocks', 'Metamorphic Rocks', 'Weathering'].slice(
    0,
    lessonCount,
  );
  return {
    courseName: 'Physical Geology',
    semester: 'Fall 2026',
    lessons: topics.map((title, index) => ({
      title: `Lesson ${index + 1}: ${title}`,
      sections: [
        {
          topicSection: `${index + 1}.1: ${title}`,
          learningGoals: `1. Build field-ready understanding of ${title.toLowerCase()}.`,
          learningObjectives: `Analyze ${title.toLowerCase()} using specimen evidence.\nEvaluate identification keys for ${title.toLowerCase()}.`,
          weeklyAssessments: [
            `Quiz: ${title.toLowerCase()} identification`,
            ...(includeTasks ? [`Task: ${title.toLowerCase()} field evidence memo`] : []),
          ].join('\n'),
          asyncActivities: `Read the assigned chapter on ${title.toLowerCase()}.`,
          syncActivities: `Workshop: ${title.toLowerCase()} case analysis.`,
          supportingResources: `OpenStax geology chapter on ${title.toLowerCase()}`,
        },
      ],
    })),
  };
}

const VOICE_FEATURES = ['assignments', 'discussions', 'studyGuides'];

function compiledFixture(lessonCount = 4, options = {}) {
  const courseMap = geologyMap(lessonCount, options);
  const graph = deriveCourseGraphFromCourseMap(courseMap);
  const blueprint = compactBlueprintForStorage(buildBlueprintFromGraph(graph, {}));
  const compiled = compileBlueprintDeliverables(blueprint, VOICE_FEATURES, { configMap: {} });
  const deliverables = Object.fromEntries(VOICE_FEATURES.map((featureId) => [featureId, compiled[featureId]]));
  return { courseMap, deliverables };
}

// Distinct lint-passing rewrites — all-lowercase prose (no new capitalized
// sequences), original ids/frozen lines carried verbatim, and DIFFERENT
// openers/structures per salt so the opener lint and the texture self-check
// see genuine variety (v1's identical filler would trip both, correctly).
const VARIED_FILLERS = [
  'start with the evidence you already trust and explain why it matters for this task, then say what would change your mind and what you would check first in the field before committing to an answer.',
  'most students lose points here by skipping the reasoning step: name your claim early, show the observation that supports it, and admit the one detail that still bothers you about the identification.',
  'bring one concrete specimen example to this work and treat it as a test case: what does it confirm, what does it complicate, and which property would you re-examine before deciding for good.',
  'connect this task to what you practiced earlier in the course; the same decision habits apply, and your work should show how the new material sharpens rather than replaces those habits each week.',
  'work through the task twice if you can: once quickly for instinct, once slowly for evidence, and write down where the two passes disagreed — that gap is where the learning actually is.',
  'before submitting, read your work aloud and cut anything you cannot defend with an observation; what remains will be shorter, sharper, and far easier to give useful feedback on this time.',
  'treat the rubric as a checklist of decisions rather than boxes: each criterion names a judgment call, and your submission should make every one of those calls visible and defensible to a reader.',
  'choose depth over coverage in this piece: one well-defended identification with honest limits earns more than three rushed ones, and it builds the habit the later weeks will lean on heavily.',
];

function variedRewriteFor(surface, salt = 0) {
  const ids = surface.originalText.match(/\b[AR]\d+\.\d+\b/g) || [];
  const frozen = surface.originalText.match(/[^.!?\n]*Anchor your post in[^.!?\n]*[.!?]?/g) || [];
  const filler = VARIED_FILLERS[salt % VARIED_FILLERS.length];
  return [filler, ids.join(' '), frozen.map((line) => line.trim()).join(' ')].filter(Boolean).join(' ').trim();
}

// ── The flag + the integration guard ────────────────────────────────────────
describe('flag off — the default path never voices anything', () => {
  // v0.15.1 F2 — THE FLIP: voice defaults ON after going 3-0 across two
  // de-confounded same-generation rounds (structural 100/A on every twin,
  // ~$0.01 each); 'off' is the explicit opt-out and the texture self-check
  // keeps reverting any pass that doesn't measurably improve texture.
  it('readVoicePassMode defaults to ON (no storage in node)', () => {
    expect(readVoicePassMode()).toBe('on');
  });

  it('selectVoiceSurfaces is pure selection (no flag read)', () => {
    const { courseMap, deliverables } = compiledFixture(4);
    const surfaces = selectVoiceSurfaces({ deliverables, courseMap });
    expect(readVoicePassMode()).toBe('on');
    expect(surfaces.length).toBeGreaterThan(0);
    expect(surfaces.length).toBeLessThanOrEqual(VOICE_MAX_SURFACES);
  });

  it('the integration invokes runVoicePass only behind the flag + enrichment guard (source scan)', () => {
    const source = readFileSync(path.join(repoRoot, 'src/hooks/useDeliverables.js'), 'utf8');
    const guardIndex = source.indexOf("voicePassLib.readVoicePassMode() === 'on'");
    expect(guardIndex).toBeGreaterThan(-1);
    expect(source.indexOf('blueprintEnrichmentRequested', guardIndex)).toBeGreaterThan(guardIndex);
    expect(source.indexOf('enrichmentModelAvailable', guardIndex)).toBeGreaterThan(guardIndex);
    expect(source.indexOf('!enrichmentOutcome.missingLessons?.length', guardIndex)).toBeGreaterThan(guardIndex);
    const callMatches = source.match(/\.runVoicePass\(/g) || [];
    // v0.14.9 C2: TWO call sites — the in-pipeline pass (behind the guard
    // above) and runVoicePassPostHoc, the same-generation A/B hook, which
    // gates itself on readVoicePassMode() !== 'on' before anything else.
    expect(callMatches).toHaveLength(2);
    expect(guardIndex).toBeLessThan(source.indexOf('.runVoicePass('));
    expect(source).toContain(
      "if (voicePassLib.readVoicePassMode() !== 'on') return { ran: false, reason: 'voice flag off' };",
    );
    expect(source).toContain('Voice pass failed (compiled text kept)');
    // v2 integration upgrades: kernels ride the grounding, and the output
    // cap is FIXED per batch (v1 inherited the ambient budget — truncation
    // read as 38 silent 'no rewrite returned' fallbacks in the failed round).
    expect(source).toMatch(/admittedCompilerBlueprint\?\.enrichment\?\.lessonContent/);
    expect(source).toContain('maxOutputTokens: 4000');
  });
});

// ── Asymmetric selection ────────────────────────────────────────────────────
describe('selectVoiceSurfaces — asymmetric, capped, kernel-aware', () => {
  const { courseMap, deliverables } = compiledFixture(4);

  it('caps at VOICE_MAX_SURFACES with ≤2 surfaces per lesson and the week-one brief always in', () => {
    const surfaces = selectVoiceSurfaces({ deliverables, courseMap });
    expect(surfaces.length).toBeLessThanOrEqual(VOICE_MAX_SURFACES);
    expect(surfaces.map((surface) => surface.surfaceId)).toContain('assignments:lesson-1:overview');
    const perLesson = new Map();
    for (const surface of surfaces) {
      perLesson.set(surface.lessonNumber, (perLesson.get(surface.lessonNumber) || 0) + 1);
      expect(VOICE_FEATURES).toContain(surface.featureId);
      expect(['overview', 'prompt', 'summary']).toContain(surface.field);
      expect(surface.originalText.length).toBeGreaterThan(20);
      expect(surface.grounding.lessonTitle).toMatch(/^Lesson \d+: /);
    }
    for (const count of perLesson.values()) expect(count).toBeLessThanOrEqual(2);
  });

  it('respects a smaller maxSurfaces (deliberate scarcity)', () => {
    const surfaces = selectVoiceSurfaces({ deliverables, courseMap, maxSurfaces: 3 });
    expect(surfaces).toHaveLength(3);
    expect(surfaces.map((surface) => surface.surfaceId)).toContain('assignments:lesson-1:overview');
  });

  it('uses the real quiz brief when a quiz-only course has no richer task', () => {
    const quizOnly = compiledFixture(4, { includeTasks: false });
    const surfaces = selectVoiceSurfaces(quizOnly);
    expect(surfaces.length).toBeGreaterThan(0);
    expect(surfaces.map((surface) => surface.surfaceId)).toContain('assignments:lesson-1:overview');
    expect(surfaces.every((surface) => surface.originalText.length > 20)).toBe(true);
  });

  it('accepts store-shaped entries ({ status, data }) as well as raw compiled data', () => {
    const wrapped = Object.fromEntries(
      VOICE_FEATURES.map((featureId) => [featureId, { status: 'done', data: deliverables[featureId] }]),
    );
    const surfaces = selectVoiceSurfaces({ deliverables: wrapped, courseMap });
    expect(surfaces.length).toBeGreaterThan(0);
  });

  it('kernels ride the grounding when supplied (the verified-substance channel)', () => {
    const kernels = {
      'lesson-2': {
        keyTerms: [
          {
            term: 'Bowen Reaction Series',
            definition: 'crystallization order of silicate minerals',
            source: 'OpenStax §4.2',
          },
        ],
        sourceCue: 'the OpenStax igneous rocks chapter',
      },
    };
    const surfaces = selectVoiceSurfaces({ deliverables, courseMap, kernels });
    const lessonTwo = surfaces.find((surface) => surface.lessonNumber === 2);
    expect(lessonTwo).toBeTruthy();
    expect(lessonTwo.grounding.kernel).toBeTruthy();
    expect(lessonTwo.grounding.kernel.terms[0].term).toBe('Bowen Reaction Series');
  });

  it('keeps verified music-interval surfaces compiler-owned instead of re-voicing them', () => {
    const musicCourseMap = {
      courseName: 'Interval Evidence Studio',
      lessons: [
        {
          title: 'Lesson 1: Inclusive Interval Counting',
          sections: [
            {
              topicSection: 'Generic interval number and semitone verification',
              learningObjectives: 'Count intervals inclusively and verify quality from pitch spelling.',
              weeklyAssessments: 'Notation Drill L classification check',
              supportingResources: 'Notation Drill L',
            },
          ],
        },
      ],
    };
    const musicDeliverables = {
      assignments: {
        assignments: [{ lessonNumber: 1, overview: 'Classify the notated intervals and show the pitch evidence.' }],
      },
      discussions: {
        discussions: [
          {
            lessonNumber: 1,
            prompt:
              'A student labels C4–E-flat4 an augmented second. Use inclusive letter-name counting and semitone evidence to correct or defend the label.',
          },
        ],
      },
      studyGuides: {
        studyGuides: [{ lessonNumber: 1, summary: 'Count letter names first, then verify interval quality.' }],
      },
    };
    expect(selectVoiceSurfaces({ deliverables: musicDeliverables, courseMap: musicCourseMap })).toEqual([]);
  });
});

// ── The batched prompt ──────────────────────────────────────────────────────
describe('buildVoicePrompt — rotated directives, never-rename, JSON contract', () => {
  const { courseMap, deliverables } = compiledFixture(5);
  const surfaces = selectVoiceSurfaces({ deliverables, courseMap });

  it('says JSON, freezes the anchor line, rotates registers, and forbids shared openers', () => {
    const prompt = buildVoicePrompt(surfaces.slice(0, 4), { courseName: courseMap.courseName });
    expect(prompt.userPrompt).toContain('JSON');
    expect(prompt.userPrompt).toContain('Anchor your post in');
    expect(prompt.userPrompt.toLowerCase()).toContain('verbatim');
    // v2: per-surface directives instead of one global register/length.
    expect(prompt.userPrompt).toContain('"register"');
    expect(prompt.userPrompt).toContain('30-70 words');
    expect(prompt.userPrompt).toContain('70-120 words');
    expect(prompt.userPrompt).toContain('begin with the same three words');
    // v2 never-rename, not verbatim-title stuffing.
    expect(prompt.userPrompt.toLowerCase()).toContain('naturally');
    expect(prompt.userPrompt.toLowerCase()).toContain('conflicts');
    expect(prompt.userPrompt).not.toContain('60-140 words');
    expect(prompt.userPrompt).toContain('no markdown headers');
    expect(prompt.systemPrompt).toContain('instructor');
    expect(prompt.systemPrompt.toLowerCase()).toContain('kernel');
  });

  it('caps a batch at the selected-surface maximum', () => {
    expect(VOICE_BATCH_SIZE).toBeLessThanOrEqual(VOICE_MAX_SURFACES);
    const prompt = buildVoicePrompt(surfaces, {});
    expect(prompt.surfaceIds.length).toBeLessThanOrEqual(VOICE_BATCH_SIZE);
  });
});

// ── The contract lint ───────────────────────────────────────────────────────
describe('lintVoiceResult — never-rename, kernel-aware, no padding floor', () => {
  const surface = {
    surfaceId: 'discussions:lesson-2:prompt',
    featureId: 'discussions',
    itemIndex: 1,
    field: 'prompt',
    originalText:
      'Which igneous rocks claim should students defend in the Week 2 quiz (A2.1), and how does the cooling-rate evidence complicate that decision? Anchor your post in Earth Materials, Chapter 4.',
    grounding: {
      lessonTitle: 'Lesson 2: Igneous Rocks',
      keyConcepts: ['2.1: Igneous Rocks'],
      readings: ['Earth Materials, Chapter 4'],
      assessmentTitle: 'Quiz: igneous rocks identification',
      kernel: {
        terms: [
          {
            term: 'Bowen Reaction Series',
            definition: 'crystallization order of silicate minerals',
            source: 'OpenStax §4.2',
          },
        ],
      },
    },
  };
  const honest =
    'Before you post, decide which igneous rocks claim you are willing to defend in the Week 2 quiz (A2.1). ' +
    'Use the cooling-rate evidence to test that claim honestly: does it strengthen your position or complicate it? ' +
    'Name the strongest counter-reading you can find, and explain the call you would make in the field. ' +
    'Anchor your post in Earth Materials, Chapter 4.';

  it('accepts an honest rewrite that keeps the id and the frozen line', () => {
    expect(lintVoiceResult(surface, honest)).toEqual({ ok: true, reason: '' });
  });

  it('v2 NEVER-RENAME: omitting the registry id is allowed (identity lives in the compiled header)', () => {
    const omitted = honest.replace(' (A2.1)', '');
    expect(lintVoiceResult(surface, omitted).ok).toBe(true);
  });

  it("v2 NEVER-RENAME: an id the surface's original does not carry rejects (cross-wired identity)", () => {
    const crossWired = honest.replace('(A2.1)', '(A9.9)');
    const verdict = lintVoiceResult(surface, crossWired);
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toContain('A9.9');
  });

  it('v2 KERNEL WHITELIST: kernel-sourced specifics pass; the same entity without kernel grounding rejects', () => {
    const withKernelFact = `${honest} The Bowen Reaction Series predicts which minerals you should expect first.`;
    expect(lintVoiceResult(surface, withKernelFact).ok).toBe(true);
    const bareSurface = { ...surface, grounding: { ...surface.grounding, kernel: undefined } };
    const verdict = lintVoiceResult(bareSurface, withKernelFact);
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toContain('Bowen Reaction Series');
  });

  it("rejects a rewrite that drops the frozen 'Anchor your post in' line", () => {
    const dropped = honest.replace(' Anchor your post in Earth Materials, Chapter 4.', '');
    const verdict = lintVoiceResult(surface, dropped);
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toMatch(/frozen/i);
  });

  it('rejects a frozen line that was reworded instead of reproduced verbatim', () => {
    const reworded = honest.replace(
      'Anchor your post in Earth Materials, Chapter 4.',
      'Be sure to anchor your post in the fourth chapter of Earth Materials.',
    );
    expect(lintVoiceResult(surface, reworded).ok).toBe(false);
  });

  it('rejects a 300-word runaway', () => {
    const runaway = `${honest} ${'the model keeps talking and talking about rocks and evidence and posting norms without saying anything new at all. '.repeat(16)}`;
    const verdict = lintVoiceResult(surface, runaway);
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toMatch(/too long/);
  });

  it('rejects a newly invented entity (Professor Quantumfield)', () => {
    const invented = `${honest} Professor Quantumfield insists this is the only defensible reading.`;
    const verdict = lintVoiceResult(surface, invented);
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toContain('Professor Quantumfield');
  });

  it('rejects markdown headers', () => {
    expect(lintVoiceResult(surface, `## Discussion\n${honest}`).ok).toBe(false);
  });

  it('rejects mathematical-interval drift when the surface grounding is unmistakably music theory', () => {
    const musicSurface = {
      ...surface,
      originalText:
        'Which interval label should students defend, and how does the semitone evidence support the answer? Anchor your post in Audio Set M.',
      grounding: {
        lessonTitle: 'Lesson 2: Simple and Compound Intervals',
        keyConcepts: ['Classify notated intervals from pitch and semitone evidence.'],
        readings: ['Audio Set M'],
        assessmentTitle: 'Interval Classification and Inversion Analysis',
      },
    };
    const drift =
      'Analyze how the classification system used to categorize mathematical sets based on fundamental structural composition strengthens your decision. ' +
      'Use the continuous segment on the number line as the main evidence, then explain the limitation before you submit. ' +
      'Anchor your post in Audio Set M.';
    const verdict = lintVoiceResult(musicSurface, drift);
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toMatch(/semantic drift.*music-theory/i);
  });

  it('does not reject legitimate mathematical-interval language without music grounding', () => {
    const mathSurface = {
      ...surface,
      originalText:
        'Compare an open interval with a closed interval on the real number line, then justify which set notation matches each endpoint rule.',
      grounding: {
        lessonTitle: 'Lesson 2: Open and Closed Intervals',
        keyConcepts: ['real number line', 'set notation', 'endpoint inclusion'],
        readings: ['Calculus Notes M'],
        assessmentTitle: 'Interval notation proof',
      },
    };
    const legitimate =
      'Start with the real number line and compare each continuous segment carefully. Explain whether the mathematical interval includes either endpoint, ' +
      'then write the matching set notation and justify the choice from the stated endpoint rule before submitting the proof.';
    expect(lintVoiceResult(mathSurface, legitimate)).toEqual({ ok: true, reason: '' });
  });
});

// ── Immutable application with per-item fallback ────────────────────────────
describe('applyVoiceResults — voiced surfaces apply, failures keep compiled text', () => {
  it('never mutates inputs, applies passes, and reports lint failures as fallbacks', () => {
    const { courseMap, deliverables } = compiledFixture(4);
    const surfaces = selectVoiceSurfaces({ deliverables, courseMap });
    const goodSurface = surfaces[0];
    const badSurface = surfaces[1];
    const goodText = variedRewriteFor(goodSurface, 0);
    const badText = 'way too short';
    const inputSnapshot = JSON.stringify(deliverables);

    const result = applyVoiceResults({
      deliverables,
      results: [
        { surface: goodSurface, text: goodText },
        { surface: badSurface, text: badText },
      ],
    });

    expect(JSON.stringify(deliverables)).toBe(inputSnapshot);
    expect(result.voiced).toEqual([goodSurface.surfaceId]);
    const goodData = result.deliverables[goodSurface.featureId];
    expect(goodData[goodSurface.featureId][goodSurface.itemIndex][goodSurface.field]).toBe(goodText);
    expect(result.fallbacks).toHaveLength(1);
    expect(result.fallbacks[0].surfaceId).toBe(badSurface.surfaceId);
    expect(result.fallbacks[0].reason).toMatch(/too short/);
    const badData = result.deliverables[badSurface.featureId];
    expect(badData[badSurface.featureId][badSurface.itemIndex][badSurface.field]).toBe(badSurface.originalText);
  });
});

// ── Orchestration: budget, errors, openers, the texture self-check ─────────
describe('runVoicePass — honest budgets and the v2 variety/texture gates', () => {
  it('skips the provider call when selected prose is already at the texture ceiling', async () => {
    const { courseMap, deliverables } = compiledFixture(1);
    const selected = selectVoiceSurfaces({ deliverables, courseMap });
    expect(selected.length).toBeGreaterThan(0);
    let calls = 0;

    const result = await runVoicePass({
      deliverables,
      courseMap,
      callModel: async () => {
        calls += 1;
        return { fullText: '{"rewrites":[]}' };
      },
    });

    expect(calls).toBe(0);
    expect(result.spentUsd).toBe(0);
    expect(result.selfCheck).toEqual({ pre: 100, post: 100, verdict: 'skipped' });
    expect(result.skipped).toHaveLength(selected.length);
    expect(result.deliverables).toEqual(deliverables);
  });

  it('stops at the budget, voices the paid batch, and reports the rest as fallbacks', async () => {
    const { courseMap, deliverables } = compiledFixture(8);
    const allSurfaces = selectVoiceSurfaces({ deliverables, courseMap, maxSurfaces: VOICE_MAX_SURFACES + 4 });
    expect(allSurfaces.length).toBeGreaterThan(VOICE_BATCH_SIZE);
    const surfaceById = new Map(allSurfaces.map((surface) => [surface.surfaceId, surface]));

    let calls = 0;
    let salt = 0;
    const events = [];
    const callModel = async (prompt) => {
      calls += 1;
      const requestedIds = [...prompt.userPrompt.matchAll(/"surfaceId":\s*"([^"]+)"/g)]
        .map((match) => match[1])
        .filter((surfaceId) => surfaceById.has(surfaceId));
      return {
        fullText: JSON.stringify({
          rewrites: requestedIds.map((surfaceId) => ({
            surfaceId,
            text: variedRewriteFor(surfaceById.get(surfaceId), salt++),
          })),
        }),
        usage: { costUsd: 0.05 }, // batch 1 eats the budget
      };
    };

    const result = await runVoicePass({
      deliverables,
      courseMap,
      callModel,
      budgetUsd: 0.05,
      maxSurfaces: VOICE_MAX_SURFACES + 4,
      onEvent: (event) => events.push(event.type),
    });

    expect(calls).toBe(1);
    expect(result.exhausted).toBe(true);
    expect(result.spentUsd).toBeCloseTo(0.05, 5);
    expect(result.voiced.length + result.fallbacks.length).toBe(allSurfaces.length);
    const budgetFallbacks = result.fallbacks.filter((fallback) => /budget exhausted/.test(fallback.reason));
    expect(budgetFallbacks).toHaveLength(allSurfaces.length - VOICE_BATCH_SIZE);
    expect(events.filter((type) => type === 'voicePassCall')).toHaveLength(1);
    expect(events.filter((type) => type === 'voicePassDone')).toHaveLength(1);
  });

  it('a model error degrades that batch to fallbacks without blocking the rest', async () => {
    const { courseMap, deliverables } = compiledFixture(4);
    const selected = selectVoiceSurfaces({ deliverables, courseMap });
    const result = await runVoicePass({
      deliverables,
      courseMap,
      callModel: async () => {
        throw new Error('provider 500');
      },
      budgetUsd: 0.05,
    });
    expect(result.exhausted).toBe(false);
    expect(result.voiced).toHaveLength(0);
    expect(result.fallbacks).toHaveLength(selected.length);
    expect(result.fallbacks[0].reason).toContain('provider 500');
    expect(result.deliverables).toEqual(deliverables);
  });

  it('v2 OPENER LINT: a second rewrite claiming the same opening trigram falls back', async () => {
    const { courseMap, deliverables } = compiledFixture(4);
    const allSurfaces = selectVoiceSurfaces({ deliverables, courseMap, maxSurfaces: 2 });
    expect(allSurfaces).toHaveLength(2);
    const clone = `${VARIED_FILLERS[0]}`;
    const callModel = async () => ({
      fullText: JSON.stringify({
        rewrites: allSurfaces.map((surface) => ({ surfaceId: surface.surfaceId, text: clone })),
      }),
    });
    const result = await runVoicePass({ deliverables, courseMap, callModel, budgetUsd: 0.05, maxSurfaces: 2 });
    const duplicate = result.fallbacks.find((fallback) => /duplicate opening/.test(fallback.reason));
    expect(duplicate).toBeTruthy();
    expect(openingTrigram(clone)).toBe('start with the');
  });

  it('v2 TEXTURE SELF-CHECK: echoing the compiled text back reverts the whole pass, loudly', async () => {
    const { courseMap, deliverables } = compiledFixture(4);
    const allSurfaces = selectVoiceSurfaces({ deliverables, courseMap });
    const surfaceById = new Map(allSurfaces.map((surface) => [surface.surfaceId, surface]));
    // The model "rewrites" by returning each surface's own compiled text —
    // a zero-improvement pass that v1 would have shipped and charged for.
    const callModel = async (prompt) => {
      const requestedIds = [...prompt.userPrompt.matchAll(/"surfaceId":\s*"([^"]+)"/g)]
        .map((match) => match[1])
        .filter((surfaceId) => surfaceById.has(surfaceId));
      return {
        fullText: JSON.stringify({
          rewrites: requestedIds.map((surfaceId) => ({
            surfaceId,
            text: surfaceById.get(surfaceId).originalText,
          })),
        }),
      };
    };
    const result = await runVoicePass({ deliverables, courseMap, callModel, budgetUsd: 0.05 });
    expect(result.selfCheck).toBeTruthy();
    expect(result.selfCheck.verdict).toBe('reverted');
    expect(result.voiced).toHaveLength(0);
    expect(result.deliverables).toEqual(deliverables);
    expect(result.fallbacks.some((fallback) => /texture self-check/.test(fallback.reason))).toBe(true);
  });

  it('v2 TEXTURE SELF-CHECK: genuinely varied rewrites improve texture and are kept', async () => {
    const { courseMap, deliverables } = compiledFixture(5);
    const allSurfaces = selectVoiceSurfaces({ deliverables, courseMap });
    const surfaceById = new Map(allSurfaces.map((surface) => [surface.surfaceId, surface]));
    let salt = 0;
    const callModel = async (prompt) => {
      const requestedIds = [...prompt.userPrompt.matchAll(/"surfaceId":\s*"([^"]+)"/g)]
        .map((match) => match[1])
        .filter((surfaceId) => surfaceById.has(surfaceId));
      return {
        fullText: JSON.stringify({
          rewrites: requestedIds.map((surfaceId) => ({
            surfaceId,
            text: variedRewriteFor(surfaceById.get(surfaceId), salt++),
          })),
        }),
      };
    };
    const result = await runVoicePass({ deliverables, courseMap, callModel, budgetUsd: 0.05 });
    expect(result.selfCheck).toBeTruthy();
    expect(result.selfCheck.verdict).toBe('improved');
    expect(result.selfCheck.post).toBeGreaterThan(result.selfCheck.pre);
    expect(result.voiced.length).toBeGreaterThan(0);
  });
});

// ── D4: disclosure surfaces ─────────────────────────────────────────────────
describe('D4 — the voice pass discloses itself', () => {
  it('voicePassCall has a budget counter that survives the constructor rebuild (the whitelist trap)', () => {
    let budget = createApiCallBudget();
    budget = applyApiCallBudgetEvent(budget, { type: 'voicePassCall', label: 'Voice pass call' });
    expect(budget.voicePassCalls).toBe(1);
    budget = applyApiCallBudgetEvent(budget, { type: 'deliverableChunkCall', label: 'Chunk' });
    expect(budget.voicePassCalls).toBe(1);
  });

  it('the digest pipeline prints a "voice pass:" line when the stage reported', () => {
    let budget = createApiCallBudget();
    budget = applyApiCallBudgetEvent(budget, {
      type: 'pipelineDecision',
      stage: 'voicePass',
      label: 'Voice pass',
      detail: 'voiced 10 surface(s), 2 fallback(s) (~$0.020)',
    });
    expect(budget.pipeline.voicePass).toContain('voiced 10');
    const digest = {
      digestVersion: 1,
      appVersion: 'test',
      runId: 'run-x',
      elapsedMs: null,
      run: { provider: 'anthropic', models: [], lessonCount: 4, features: [], providerCalls: 1 },
      pipeline: { ...budget.pipeline },
      compilerSavings: null,
      cost: {
        totalUsd: 0.02,
        totalDisplay: '$0.02',
        inputTokens: 0,
        outputTokens: 0,
        reasoningOutputTokens: 0,
        cachedInputTokens: 0,
        accuracy: 'reported',
        byTask: [],
      },
      gates: {
        finalStatus: 'ready',
        exportStatus: 'passed',
        exportChecked: 0,
        exportFailed: 0,
        exportWarnings: 0,
        repairsApplied: 0,
        retryCallCount: 0,
        flaggedChecks: [],
      },
    };
    expect(formatRunDigest(digest)).toContain('voice pass: voiced 10 surface(s), 2 fallback(s)');
  });

  it('the manifest stash round-trips and clears (no stale claims across runs)', () => {
    clearVoicePassOutcome();
    expect(peekVoicePassOutcome()).toBeNull();
    recordVoicePassOutcome({ enabled: true, voicedCount: 9, fallbackCount: 3, spentUsd: 0.02, exhausted: false });
    expect(peekVoicePassOutcome()).toMatchObject({ enabled: true, voicedCount: 9, fallbackCount: 3 });
    clearVoicePassOutcome();
    expect(peekVoicePassOutcome()).toBeNull();
  });

  it('PACKAGE_MANIFEST assembly wires manifest.voicePass from the stash (source contract)', () => {
    const source = readFileSync(path.join(repoRoot, 'src/lib/packageZipExporter.js'), 'utf8');
    expect(source).toContain('peekVoicePassOutcome');
    expect(source).toContain('voicePass:');
    expect(source).toMatch(/voicedCount/);
    expect(source).toMatch(/fallbackCount/);
  });

  it('v2: the integration ships the texture self-check verdict in the outcome (source contract)', () => {
    const source = readFileSync(path.join(repoRoot, 'src/hooks/useDeliverables.js'), 'utf8');
    expect(source).toContain('texturePre');
    expect(source).toContain('texturePost');
    expect(source).toContain('selfCheck: voiceResult.selfCheck.verdict');
  });
});
