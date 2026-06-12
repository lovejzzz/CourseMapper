/**
 * v0.14.7 WS-D2/D4 — the voice pass.
 *
 * The contract under test (roadmap WS-D, "fallback, never block"):
 *  - flag 'coursemapper-voice-pass' is DEFAULT OFF; the integration only
 *    invokes runVoicePass behind the flag + enrichment guard (source-scanned
 *    here — the pass is never wired into a default run),
 *  - exactly three surface kinds are voiceable (assignment brief overview,
 *    discussion prompt framing, study-guide narrative intro),
 *  - the per-surface lint enforces the hard contract: registry ids and the
 *    frozen "Anchor your post in …" line survive VERBATIM, length stays
 *    bounded, no markdown headers, no new invented entities,
 *  - applyVoiceResults is immutable and per-item: failures keep compiled text,
 *  - budget exhaustion mid-run is honest: exhausted:true, partial voiced,
 *    remaining surfaces reported as fallbacks,
 *  - D4: the run discloses itself (budget counter, digest pipeline line,
 *    manifest stash).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  VOICE_BATCH_SIZE,
  applyVoiceResults,
  buildVoicePrompt,
  clearVoicePassOutcome,
  lintVoiceResult,
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
function geologyMap(lessonCount = 4) {
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
          weeklyAssessments: `Quiz: ${title.toLowerCase()} identification`,
          asyncActivities: `Read the assigned chapter on ${title.toLowerCase()}.`,
          syncActivities: `Workshop: ${title.toLowerCase()} case analysis.`,
          supportingResources: `OpenStax geology chapter on ${title.toLowerCase()}`,
        },
      ],
    })),
  };
}

const VOICE_FEATURES = ['assignments', 'discussions', 'studyGuides'];

function compiledFixture(lessonCount = 4) {
  const courseMap = geologyMap(lessonCount);
  const graph = deriveCourseGraphFromCourseMap(courseMap);
  const blueprint = compactBlueprintForStorage(buildBlueprintFromGraph(graph, {}));
  const compiled = compileBlueprintDeliverables(blueprint, VOICE_FEATURES, { configMap: {} });
  const deliverables = Object.fromEntries(VOICE_FEATURES.map((featureId) => [featureId, compiled[featureId]]));
  return { courseMap, deliverables };
}

// A lint-passing rewrite built ONLY from the surface's own material: filler is
// all-lowercase prose (no new capitalized sequences), registry ids and frozen
// anchor lines from the original are carried verbatim.
function honestRewriteFor(surface) {
  const ids = surface.originalText.match(/\b[AR]\d+\.\d+\b/g) || [];
  const frozen = surface.originalText.match(/[^.!?\n]*Anchor your post in[^.!?\n]*[.!?]?/g) || [];
  const filler =
    'Start with the evidence you already trust and explain why it matters for this task. ' +
    'Keep your reasoning visible so feedback can land where it helps you most. ' +
    'Bring one concrete example from the course material, name its limits, and say what you would change next time.';
  return [filler, ids.join(' '), frozen.map((line) => line.trim()).join(' ')].filter(Boolean).join(' ').trim();
}

// ── The flag + the integration guard ────────────────────────────────────────
describe('flag off — the default path never voices anything', () => {
  it('readVoicePassMode defaults to off (no storage in node)', () => {
    expect(readVoicePassMode()).toBe('off');
  });

  it('selectVoiceSurfaces still works with the flag off (pure selection, no flag read)', () => {
    const { courseMap, deliverables } = compiledFixture(4);
    const surfaces = selectVoiceSurfaces({ deliverables, courseMap });
    expect(readVoicePassMode()).toBe('off');
    expect(surfaces).toHaveLength(12);
  });

  it('the integration invokes runVoicePass only behind the flag + enrichment guard (source scan)', () => {
    const source = readFileSync(path.join(repoRoot, 'src/hooks/useDeliverables.js'), 'utf8');
    const guard = "voicePassLib.readVoicePassMode() === 'on' && blueprintEnrichmentRequested";
    expect(source).toContain(guard);
    // runVoicePass is called exactly once, AFTER the guard opens — never on
    // an unguarded path.
    const callMatches = source.match(/\.runVoicePass\(/g) || [];
    expect(callMatches).toHaveLength(1);
    expect(source.indexOf(guard)).toBeGreaterThan(-1);
    expect(source.indexOf(guard)).toBeLessThan(source.indexOf('.runVoicePass('));
    // And the voice block runs after the compiler dispatch loop (the voiced
    // re-dispatch can only improve already-done features).
    expect(source.indexOf('compiled from blueprint')).toBeLessThan(source.indexOf(guard));
    // Law: fallback, never block — the whole block is wrapped so a voice
    // failure logs a warning instead of erroring the package.
    expect(source).toContain('Voice pass failed (compiled text kept)');
  });
});

// ── Surface selection ───────────────────────────────────────────────────────
describe('selectVoiceSurfaces — exactly the three high-read surface kinds', () => {
  const { courseMap, deliverables } = compiledFixture(4);

  it('returns one descriptor per lesson per kind with the real compiled field names', () => {
    const surfaces = selectVoiceSurfaces({ deliverables, courseMap });
    expect(surfaces).toHaveLength(12);
    const ids = surfaces.map((surface) => surface.surfaceId);
    expect(ids).toContain('assignments:lesson-1:overview');
    expect(ids).toContain('discussions:lesson-2:prompt');
    expect(ids).toContain('studyGuides:lesson-4:summary');
    for (const surface of surfaces) {
      expect(VOICE_FEATURES).toContain(surface.featureId);
      expect(['overview', 'prompt', 'summary']).toContain(surface.field);
      expect(surface.originalText.length).toBeGreaterThan(20);
      expect(surface.grounding.lessonTitle).toMatch(/^Lesson \d+: /);
      expect(Array.isArray(surface.grounding.keyConcepts)).toBe(true);
      expect(Array.isArray(surface.grounding.readings)).toBe(true);
    }
    const assignment = surfaces.find((surface) => surface.surfaceId === 'assignments:lesson-1:overview');
    expect(assignment.grounding.assessmentTitle).toMatch(/quiz/i);
  });

  it('accepts store-shaped entries ({ status, data }) as well as raw compiled data', () => {
    const wrapped = Object.fromEntries(
      VOICE_FEATURES.map((featureId) => [featureId, { status: 'done', data: deliverables[featureId] }]),
    );
    expect(selectVoiceSurfaces({ deliverables: wrapped, courseMap })).toHaveLength(12);
  });
});

// ── The batched prompt ──────────────────────────────────────────────────────
describe('buildVoicePrompt — one batched JSON contract', () => {
  const { courseMap, deliverables } = compiledFixture(5);
  const surfaces = selectVoiceSurfaces({ deliverables, courseMap });

  it('the user prompt says JSON, freezes the anchor line, and bounds the rewrite', () => {
    const prompt = buildVoicePrompt(surfaces.slice(0, 3), { courseName: courseMap.courseName });
    expect(prompt.userPrompt).toContain('JSON');
    expect(prompt.userPrompt).toContain('Anchor your post in');
    expect(prompt.userPrompt.toLowerCase()).toContain('verbatim');
    expect(prompt.userPrompt).toContain('60-140 words');
    expect(prompt.userPrompt).toContain('no markdown headers');
    expect(prompt.systemPrompt).toContain('instructor');
  });

  it('caps a batch at the batch size', () => {
    expect(surfaces.length).toBeGreaterThan(VOICE_BATCH_SIZE);
    const prompt = buildVoicePrompt(surfaces, {});
    expect(prompt.surfaceIds).toHaveLength(VOICE_BATCH_SIZE);
  });
});

// ── The contract lint ───────────────────────────────────────────────────────
describe('lintVoiceResult — the hard contract', () => {
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

  it('rejects a rewrite that drops the registry id', () => {
    const dropped = honest.replace(' (A2.1)', '');
    const verdict = lintVoiceResult(surface, dropped);
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toContain('A2.1');
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
    expect(runaway.split(/\s+/).length).toBeGreaterThanOrEqual(300);
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
});

// ── Immutable application with per-item fallback ────────────────────────────
describe('applyVoiceResults — voiced surfaces apply, failures keep compiled text', () => {
  it('never mutates inputs, applies passes, and reports lint failures as fallbacks', () => {
    const { courseMap, deliverables } = compiledFixture(4);
    const surfaces = selectVoiceSurfaces({ deliverables, courseMap });
    const guideSurface = surfaces.find((surface) => surface.surfaceId === 'studyGuides:lesson-1:summary');
    const briefSurface = surfaces.find((surface) => surface.surfaceId === 'assignments:lesson-1:overview');
    const goodText = honestRewriteFor(guideSurface);
    const badText = 'way too short';
    const inputSnapshot = JSON.stringify(deliverables);
    const originalOverview = briefSurface.originalText;

    const result = applyVoiceResults({
      deliverables,
      results: [
        { surface: guideSurface, text: goodText },
        { surface: briefSurface, text: badText },
      ],
    });

    // Inputs untouched.
    expect(JSON.stringify(deliverables)).toBe(inputSnapshot);
    // The pass applied — on NEW objects.
    expect(result.voiced).toEqual(['studyGuides:lesson-1:summary']);
    expect(result.deliverables.studyGuides).not.toBe(deliverables.studyGuides);
    expect(result.deliverables.studyGuides.studyGuides[0].summary).toBe(goodText);
    // Untouched sibling items keep identity (surgical clone, not a deep copy).
    expect(result.deliverables.studyGuides.studyGuides[1]).toBe(deliverables.studyGuides.studyGuides[1]);
    // The failure fell back to the compiled text, with the reason reported.
    expect(result.fallbacks).toHaveLength(1);
    expect(result.fallbacks[0].surfaceId).toBe('assignments:lesson-1:overview');
    expect(result.fallbacks[0].reason).toMatch(/too short/);
    expect(result.deliverables.assignments.assignments[0].overview).toBe(originalOverview);
  });
});

// ── Orchestration: budget exhaustion is honest ──────────────────────────────
describe('runVoicePass — sequential batches under a hard budget', () => {
  it('stops at the budget, voices the paid batch, and reports the rest as fallbacks', async () => {
    const { courseMap, deliverables } = compiledFixture(5); // 15 surfaces → 2 batches
    const allSurfaces = selectVoiceSurfaces({ deliverables, courseMap });
    const surfaceById = new Map(allSurfaces.map((surface) => [surface.surfaceId, surface]));
    expect(allSurfaces).toHaveLength(15);

    let calls = 0;
    const events = [];
    const callModel = async (prompt) => {
      calls += 1;
      const requestedIds = [...prompt.userPrompt.matchAll(/"surfaceId":\s*"([^"]+)"/g)]
        .map((match) => match[1])
        .filter((surfaceId) => surfaceById.has(surfaceId));
      const rewrites = requestedIds.map((surfaceId) => ({
        surfaceId,
        text: honestRewriteFor(surfaceById.get(surfaceId)),
      }));
      // The first batch's real usage eats the whole budget.
      return { fullText: JSON.stringify({ rewrites }), usage: { costUsd: 0.05 } };
    };

    const result = await runVoicePass({
      deliverables,
      courseMap,
      callModel,
      budgetUsd: 0.05,
      onEvent: (event) => events.push(event.type),
    });

    expect(calls).toBe(1); // batch 2 was never paid for
    expect(result.exhausted).toBe(true);
    expect(result.spentUsd).toBeCloseTo(0.05, 5);
    expect(result.voiced).toHaveLength(VOICE_BATCH_SIZE);
    expect(result.fallbacks).toHaveLength(15 - VOICE_BATCH_SIZE);
    for (const fallback of result.fallbacks) {
      expect(fallback.reason).toMatch(/budget exhausted/);
    }
    // Honest counts: every surface is accounted for exactly once.
    expect(result.voiced.length + result.fallbacks.length).toBe(15);
    // The paid batch is actually applied; the unpaid one keeps compiled text.
    expect(result.deliverables.assignments.assignments[0].overview).not.toBe(
      deliverables.assignments.assignments[0].overview,
    );
    const unpaid = result.fallbacks.map((fallback) => fallback.surfaceId);
    for (const surfaceId of unpaid) {
      const surface = surfaceById.get(surfaceId);
      const data = result.deliverables[surface.featureId];
      const arrayKey = surface.featureId; // assignments/discussions/studyGuides arrays share the feature name
      expect(data[arrayKey][surface.itemIndex][surface.field]).toBe(surface.originalText);
    }
    // Ledger events: one call, one done — no phantom second call.
    expect(events.filter((type) => type === 'voicePassCall')).toHaveLength(1);
    expect(events.filter((type) => type === 'voicePassDone')).toHaveLength(1);
    // Inputs untouched throughout.
    expect(deliverables.assignments.assignments[0].overview).toBe(
      allSurfaces.find((surface) => surface.surfaceId === 'assignments:lesson-1:overview').originalText,
    );
  });

  it('a model error degrades that batch to fallbacks without blocking the rest', async () => {
    const { courseMap, deliverables } = compiledFixture(4); // 12 surfaces → 1 batch
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
    expect(result.fallbacks).toHaveLength(12);
    expect(result.fallbacks[0].reason).toContain('provider 500');
    expect(result.deliverables).toEqual(deliverables);
  });
});

// ── D4: disclosure surfaces ─────────────────────────────────────────────────
describe('D4 — the voice pass discloses itself', () => {
  it('voicePassCall has a budget counter that survives the constructor rebuild (the whitelist trap)', () => {
    let budget = createApiCallBudget();
    budget = applyApiCallBudgetEvent(budget, { type: 'voicePassCall', label: 'Voice pass call' });
    expect(budget.voicePassCalls).toBe(1);
    // The next event rebuilds the budget through the constructor — the
    // counter must be whitelisted there or it silently drops to 0.
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
});
