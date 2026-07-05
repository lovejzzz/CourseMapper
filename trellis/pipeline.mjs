// The Trellis pipeline — docs/TRELLIS.md §14.1.
// intake → validate → assemble → flywheel → author → judge → repair →
// render → (grade). Deterministic stages are free; every model call goes
// through the ledger; the digest never overstates (residual blocks are
// disclosed, never swallowed).

import { join } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { validateGraph, blockers } from './graph/validate.mjs';
import { loadShards, assembleKnowledge } from './knowledge/assemble.mjs';
import { flywheelFill } from './knowledge/flywheel.mjs';
import { authorAllLessons, authorCourseWide, authorAllExams } from './voice/author.mjs';
import { mockAuthorLesson, mockAuthorCourseWide, mockAuthorExamItems } from './voice/mockAuthor.mjs';
import { repairLoop } from './voice/repair.mjs';
import { blockingFindings } from './judgment/index.mjs';
import { renderPackage, writePackageToDir, createMemoryFileProvider, FEATURE_FOLDERS } from './render/deliverables.mjs';
import { intakeSyllabus } from './intake.mjs';
import { createRunLedger } from './telemetry.mjs';
import { stageTiers } from './providers.mjs';
import {
  autoAlignBloom,
  downgradeDanglingClaims,
  spliceCatchDistractors,
  pairCorrectiveExplanations,
} from './graph/autoAlign.mjs';

export async function runPipeline({
  syllabusText = null,
  graph = null,
  tier = 'draft',
  budgetUsd = 5,
  runId,
  outRoot = 'trellis/runs',
  mockVoice = false,
  gradePackage = false,
  termStart = null,
  overnight = false,
  composer = false,
  tendril = true,
  freezeExposure = false,
  zeroApi = false,
  bankDiscipline = null,
  generatedAt = new Date().toISOString(),
}) {
  if (!runId) throw new Error('runPipeline requires runId');
  const runDir = join(outRoot, runId);
  const ledger = createRunLedger({ runId, runDir });
  try {
    return await runPipelineStages({
      syllabusText,
      graph,
      tier,
      budgetUsd,
      runId,
      runDir,
      mockVoice,
      gradePackage,
      termStart,
      overnight,
      composer,
      tendril,
      freezeExposure,
      zeroApi,
      bankDiscipline,
      generatedAt,
      ledger,
    });
  } finally {
    // Spend is recorded even when a stage throws — an unflushed ledger on a
    // failed run was the live-smoke bug that motivated this block.
    await mkdir(runDir, { recursive: true });
    await ledger.flush();
  }
}

async function runPipelineStages({
  syllabusText,
  graph,
  tier,
  budgetUsd,
  runId,
  runDir,
  mockVoice,
  gradePackage,
  termStart,
  overnight,
  composer,
  tendril = true,
  freezeExposure = false,
  zeroApi = false,
  bankDiscipline,
  generatedAt,
  ledger,
}) {
  const tiers = await stageTiers(tier);
  const digest = { tier, voice: mockVoice ? 'mock (no quality claim)' : `live (${tiers.author} authoring)` };

  // 1 · intake
  if (!graph) {
    if (!syllabusText) throw new Error('runPipeline needs syllabusText or graph');
    graph = await intakeSyllabus(syllabusText, { tier: tiers.intake, ledger, budgetUsd, termStart });
  }

  // 1b · deterministic metadata alignment: a Bloom TAG >1 tier from its verb
  // realigns to the verb (VERIFIED-class metadata fix, disclosed — the J2
  // class that lesson re-authoring could never repair).
  const realigned = autoAlignBloom(graph);
  if (realigned.length > 0) {
    digest.bloomAutoAligned = realigned.map((r) => `${r.outcomeId}: "${r.verb}" ${r.from}→${r.to}`);
  }

  // 2 · structural validation (pre-knowledge: V5 may legitimately fail here).
  // V2 forward-prerequisite blockers whose concept IS introduced later become
  // BRIDGES (the v0.14 gap-judgment behavior): the earlier lesson opens with
  // an authored primer, diagnosed and disclosed — never a silent reorder and
  // never a hard block on a professor's deliberate sequencing.
  const { prerequisiteBridges } = await import('./graph/validate.mjs');
  const bridges = prerequisiteBridges(graph);
  if (bridges.length > 0) {
    const byLesson = new Map();
    for (const bridge of bridges) {
      if (!byLesson.has(bridge.lessonId)) byLesson.set(bridge.lessonId, []);
      byLesson.get(bridge.lessonId).push(bridge.requiredId);
    }
    for (const lesson of graph.lessons) {
      if (byLesson.has(lesson.id)) lesson.bridgePrimers = [...new Set(byLesson.get(lesson.id))];
    }
    digest.prerequisiteBridges = bridges.map(
      (b) => `${b.lessonId}: primer for "${b.requiredName}" (formally taught in lesson ${b.introducedAtLesson})`,
    );
  }
  const bridgedKeys = new Set(bridges.map((b) => `${b.lessonId}|${b.requiredName}`));
  let findings = validateGraph(graph);
  const structural = blockers(findings).filter(
    (f) =>
      f.code !== 'V5_KERNEL_OR_GAP' &&
      !(
        f.code === 'V2_PREREQ_ORDER' &&
        [...bridgedKeys].some(
          (k) => f.path.startsWith(`lesson/${k.split('|')[0]}`) && f.message.includes(`"${k.split('|')[1]}"`),
        )
      ),
  );
  if (structural.length > 0) {
    throw new Error(
      `graph fails structural validation:\n${structural.map((f) => `- [${f.code}] ${f.message}`).join('\n')}`,
    );
  }

  // 3 · knowledge assembly (genome link)
  const shards = await loadShards();
  const { coverage } = assembleKnowledge(graph, shards);

  // 4 · flywheel for uncovered concepts (live) or declared gaps (mock)
  if (coverage.uncovered.length > 0) {
    if (mockVoice) {
      for (const id of coverage.uncovered) {
        const concept = graph.concepts.find((c) => c.id === id);
        concept.declaredGap = true; // honest: mock runs never invent knowledge
      }
      digest.flywheel = `mock: ${coverage.uncovered.length} uncovered concept(s) declared as gaps`;
    } else {
      const { filled, provenance } = await flywheelFill(graph, coverage.uncovered, {
        tier: tiers.flywheel,
        ledger,
        budgetUsd,
      });
      // Roadmap 3.3: a second model verifies extracted facts (same-family —
      // cross-family is key-gated; disclosed as such).
      const { verifyFlywheelFacts } = await import('./knowledge/flywheel.mjs');
      // v0.1.4 B5: TRUE cross-family verification (the original design
      // intent) — a deepseek seat checks openai-extracted facts. Falls
      // back to same-family if the ds call fails, disclosed either way.
      let verification;
      let verifierFamily = 'cross-family (deepseek-v4-flash)';
      try {
        verification = await verifyFlywheelFacts(graph, filled, { tier: 'ds', ledger, budgetUsd });
      } catch {
        verifierFamily = 'same-family FALLBACK (deepseek call failed)';
        verification = await verifyFlywheelFacts(graph, filled, { tier: 'cheap', ledger, budgetUsd });
      }
      digest.flywheel = `${filled.length} concept(s) flywheel-filled — ${provenance}; second-model verification: ${verification.checked} facts checked, ${verification.removed} removed${verification.gapped.length > 0 ? `, ${verification.gapped.length} concept(s) → declaredGap` : ''} (${verifierFamily})`;
    }
  }
  digest.enrichment = `genome: ${coverage.linked}/${coverage.total} concepts carry kernels (${coverage.note})`;

  // 4b · readings (live only): the hardened source-finder proposes
  // candidates; J10 gates them; drops and degradation are disclosed.
  if (!mockVoice && graph.sources.length === 0) {
    const { findReadings } = await import('./knowledge/sources.mjs');
    const readings = await findReadings(graph);
    graph.sources.push(...readings.sources);
    // Roadmap 2.2: candidates earn 'verified' by content-fetch entailment;
    // failures stay candidates, disclosed.
    const { verifyReadings } = await import('./knowledge/sources.mjs');
    const verification = await verifyReadings(graph);
    digest.readings = readings.degraded
      ? `DEGRADED: ${readings.degraded} — package ships with ${readings.kept} readings, disclosed`
      : `${readings.kept}/${readings.found} candidate readings kept (source-finder + J10); ${verification.promoted} verified by content fetch, ${verification.unverified} remain candidates`;
  }

  // 5 · full validation must now be clean (bridged V2 findings excepted —
  // they are handled by authored primers, disclosed above)
  findings = validateGraph(graph);
  const hardBlockers = blockers(findings).filter(
    (f) =>
      !(
        f.code === 'V2_PREREQ_ORDER' &&
        [...bridgedKeys].some(
          (k) => f.path.startsWith(`lesson/${k.split('|')[0]}`) && f.message.includes(`"${k.split('|')[1]}"`),
        )
      ),
  );
  if (hardBlockers.length > 0) {
    throw new Error(
      `graph fails validation after knowledge:\n${hardBlockers.map((f) => `- [${f.code}] ${f.message}`).join('\n')}`,
    );
  }
  digest.validation = 'V1–V7 structural invariants: 0 blockers';

  // 6 · author (course-wide fires concurrently with the lesson batches;
  // split-tier: judgment core on the author tier, presentation surfaces on
  // the cheaper authorSurfaces tier when the config splits them)
  // v0.1.3 item bank: deterministic selection covers what it can; the
  // model authors the remainder. Opt-in per discipline, fully disclosed.
  let bank = null;
  const bankStats = { selected: 0, fresh: 0, lessonsFullyBanked: 0 };
  if (!mockVoice && bankDiscipline) {
    const { loadBank } = await import('./knowledge/itemBank.mjs');
    bank = await loadBank(bankDiscipline);
    if (!bank) digest.itemBank = `bank "${bankDiscipline}" not found — all quiz items authored fresh`;
  }
  const authorOptions = mockVoice
    ? { mock: mockAuthorLesson }
    : {
        tier: tiers.author,
        surfacesTier: tiers.authorSurfaces ?? null,
        quizTier: tiers.authorQuiz ?? null,
        ledger,
        budgetUsd,
        bank,
        bankStats,
      };
  if (!mockVoice && tiers.authorSurfaces) {
    digest.voice = `live (split: ${tiers.author} core + ${tiers.authorSurfaces} surfaces${tiers.authorQuiz ? ` + ${tiers.authorQuiz} quiz` : ''})`;
  }
  const courseWidePromise = mockVoice
    ? Promise.resolve(mockAuthorCourseWide(graph))
    : composer && zeroApi
      ? import('./composer/zeroApi.mjs').then(({ zeroCourseWide }) => zeroCourseWide(graph))
      : authorCourseWide(graph, { tier: tiers.author, ledger, budgetUsd });
  // Overnight transport (batch API, 50% token rates): identical models,
  // schemas and validators — a latency trade, never a quality one. Only
  // the authoring fan-out batches; small serial stages stay live.
  // E6 (COMPOSER.md): assemble from the asset store; Trellis fills gaps.
  if (composer && !mockVoice) {
    const { loadAssets } = await import('./composer/assets.mjs');
    const { composeAllLessons } = await import('./composer/compose.mjs');
    const store = await loadAssets();
    if (!store) throw new Error('composer requires trellis/bank/assets.json — run trellis/composer/assets.mjs');
    // Tendril sibling dedupe (T-M1a) — default on for composed runs;
    // --no-tendril opts out. Failure to build the context (missing model,
    // cold cache on an offline box) degrades to no-dedupe, disclosed.
    let tendrilCtx = null;
    if (tendril) {
      try {
        const { buildTendrilContext } = await import('./tendril/siblingDedupe.mjs');
        tendrilCtx = await buildTendrilContext(bank, {
          ...(typeof tendril === 'string' && Number(tendril) > 0 ? { epsilon: Number(tendril) } : {}),
        });
        if (process.env.TENDRIL_RANK === '1') tendrilCtx.rankSelection = true;
      } catch (error) {
        digest.tendril = `UNAVAILABLE (${String(error.message).slice(0, 80)}) — semantic dedupe off this run`;
      }
    }
    let sGen = null;
    if (zeroApi) {
      // $0 mode: Tendril-S serves skin/blend locally; a missing venv is a
      // HARD error — zero mode must never quietly fall back to paid calls.
      const { startS, sGenerate } = await import('./tendril/sModel.mjs');
      await startS();
      sGen = sGenerate;
      digest.zero = 'ZERO-API mode: S-local skin/blend · banked exams · lexical entailment · no fresh fills · no model repair';
    }
    const outcome = await composeAllLessons(graph, store, {
      ledger,
      budgetUsd,
      tiers,
      bank,
      tendril: tendrilCtx,
      zero: zeroApi,
      sGenerate: sGen,
    });
    if (zeroApi && outcome.stats.zeroShortQuizzes) {
      digest.zero += `; ${outcome.stats.zeroShortQuizzes} lesson(s) shipped short quizzes (shelf-limited, disclosed)`;
    }
    var zeroSGenerate = sGen;
    if (tendrilCtx) {
      digest.tendril = `sibling dedupe ε=${tendrilCtx.epsilon}: excluded ${tendrilCtx.counters.itemsExcluded} item(s) + ${tendrilCtx.counters.assetsExcluded} asset(s)${outcome.stats.tendrilFallbacks ? `; ${outcome.stats.tendrilFallbacks} thin-shelf semantic fallback(s)` : ''}`;
    }
    // v0.2.2: PERSIST exposure counters — without this write-back the
    // CAT-style anti-homogenization draw was a no-op and every
    // same-syllabus composition drew identical assets (found while
    // planning the homogenization index; e6 vs e6c measured it).
    const { writeFile: writeStore } = await import('node:fs/promises');
    await writeStore('trellis/bank/assets.json', JSON.stringify(store, null, 1));
    digest.composer = `assembled from ${store.assets.length} assets: reuse ${outcome.stats.reusePct}% by surface area (${outcome.stats.reusedParts} parts reused, ${outcome.stats.freshParts} fresh); skin ${outcome.stats.skinned}/${outcome.stats.skinOf} segments unified${outcome.stats.dupReuses ? `; ${outcome.stats.dupReuses} thin-shelf dup reuse(s)` : ''}${outcome.stats.solverRejected ? `; solver rejected ${outcome.stats.solverRejected} fresh item(s)` : ''}`;
    var composerOutcome = outcome;
  }
  const useBatch = !composer && overnight && !mockVoice && tiers.authorSurfaces;
  let authorOutcome;
  if (useBatch) {
    const { authorAllLessonsBatch } = await import('./voice/author.mjs');
    authorOutcome = await authorAllLessonsBatch(graph, authorOptions);
    // The digest reports the transport that actually RAN — the first
    // overnight run fell back to live silently while the digest still
    // claimed the discount (the overstating-digest bug class).
    const bt = authorOutcome.transport;
    digest.transport =
      bt.batchedParts === 0
        ? `overnight batch FAILED (${(bt.firstError ?? 'unknown').slice(0, 160)}) — all authoring fell back to LIVE at full rate`
        : `overnight batch: ${bt.batchedParts}/${bt.totalParts} authoring parts at 50% token rates${bt.fallbackLessons > 0 ? `; ${bt.fallbackLessons} lesson(s) fell back to live` : ''}`;
  }
  const { authored, failures } =
    composer && !mockVoice ? composerOutcome : useBatch ? authorOutcome : await authorAllLessons(graph, authorOptions);
  if (bank && bankStats.selected + bankStats.fresh > 0) {
    // Shelf telemetry (v0.1.5 item 2): the thinnest lesson is named in
    // every digest — late-course shelf thinning was invisible until a
    // multi-lesson panel found it; now any single run shows it.
    const shelfByLesson = graph.lessons.map((lesson) => {
      const kernels = [...new Set([...lesson.introduces, ...(lesson.reinforces ?? [])])]
        .map((cid) => graph.concepts.find((c) => c.id === cid)?.genomeRef)
        .filter(Boolean);
      const shelf = bank.items.filter((item) => kernels.includes(item.kernelId)).length;
      return { id: lesson.id, shelf };
    });
    const thinnest = shelfByLesson.reduce((a, b) => (b.shelf < a.shelf ? b : a), shelfByLesson[0]);
    digest.itemBank = `${bankStats.selected}/${bankStats.selected + bankStats.fresh} weekly quiz items selected from the ${bank.discipline} bank (${bank.items.length} banked items over ${bank.kernels} kernels; ${bank.origins ? `${bank.origins.harvest} harvest + ${bank.origins.gapfill} gapfill; ` : ''}provenance-tracked); ${bankStats.fresh} authored fresh${bankStats.lessonsFullyBanked > 0 ? `; ${bankStats.lessonsFullyBanked} lesson(s) fully banked` : ''}; thinnest shelf: ${thinnest?.id} (${thinnest?.shelf} items)`;
  }
  if (failures.length > 0) {
    digest.authorFailures = failures.map((f) => `${f.lessonId}: ${f.error.slice(0, 120)}`);
  }
  const missing = graph.lessons.filter((lesson) => !authored[lesson.id]);
  if (missing.length > 0) {
    const detail = failures
      .slice(0, 2)
      .map((f) => `${f.lessonId}: ${f.error}`)
      .join(' | ');
    throw new Error(
      `authoring failed for ${missing.length} lesson(s): ${missing.map((l) => l.id).join(', ')} — first errors: ${detail}`,
    );
  }
  const courseWide = await courseWidePromise;

  // 6c · dedicated exam items (item 6): transfer-level, authored per exam;
  // a failed exam authoring falls back to the quiz-pull render, disclosed.
  const examOptions = mockVoice ? { mock: mockAuthorExamItems } : { tier: tiers.author, ledger, budgetUsd };
  let authoredExams;
  let examFailures = [];
  if (composer && zeroApi) {
    const { assembleExamsFromBank } = await import('./composer/zeroApi.mjs');
    authoredExams = assembleExamsFromBank(graph, bank);
    digest.examsZero = `exams assembled from the bank (${Object.values(authoredExams)
      .map((items) => items.length)
      .join('+')} items, $0)`;
  } else {
    ({ authoredExams, failures: examFailures } = await authorAllExams(graph, examOptions));
  }
  if (examFailures.length > 0) {
    digest.examAuthoring = `FALLBACK for ${examFailures.length} exam(s): ${examFailures.map((f) => f.examId).join(', ')} — quiz-pull items used, disclosed in the exam file`;
  }

  // 6b · deterministic claim hygiene: a dangling ref becomes an explicit
  // null (JUDGED-class) — an unverifiable citation must not pose as
  // grounding, and repair calls must not be spent on what a downgrade fixes.
  const downgraded = downgradeDanglingClaims(graph, authored);
  if (downgraded.length > 0) {
    digest.claimsDowngraded = `${downgraded.length} unresolvable claim ref(s) downgraded to JUDGED (disclosed, not repaired)`;
  }

  // 6e · claim entailment (roadmap 3.1): AUTHORED-GROUNDED must mean
  // "supported by the cited kernel." Unsupported citations downgrade to
  // JUDGED, disclosed.
  if (!mockVoice) {
    if (composer && zeroApi) {
      const { zeroEntailment } = await import('./composer/zeroApi.mjs');
      const entailment = zeroEntailment(graph, authored);
      digest.entailment = `zero mode WITHHOLDS grounding claims: all ${entailment.checked} checkable citations → JUDGED (a lexical verifier was retired by calibration — 64% false-keep vs the model verifier)`;
    } else {
      const { verifyAllClaims } = await import('./knowledge/entailment.mjs');
      const entailment = await verifyAllClaims(graph, authored, { tier: 'nano', ledger, budgetUsd });
      digest.entailment = `claims verified against cited kernels: ${entailment.checked} checked, ${entailment.downgraded} unsupported → JUDGED`;
    }
  }

  // 6d · deterministic catch splicing: any documented misconception still
  // uncaught gets its belief statement quoted verbatim into a distractor
  // slot (graph content, assembled — J11 passes by construction, disclosed).
  const splices = spliceCatchDistractors(graph, authored);
  if (splices.length > 0) {
    digest.catchSplices = `${splices.length} distractor(s) set verbatim from documented misconceptions (deterministic, disclosed)`;
  }
  // 6f · deterministic corrective pairing (J3b): a catching item whose
  // explanation does not confront gets the corrective appended verbatim
  // (VERIFIED-class graph data, disclosed — the run-5 lesson: 30 pairing
  // residuals and 73 repair calls that never converged on them).
  const pairings = pairCorrectiveExplanations(graph, authored);
  if (pairings.length > 0) {
    digest.correctivePairing = `${pairings.length} corrective(s) appended verbatim to catching items' explanations (deterministic, disclosed)`;
  }

  // 7 · judge + repair
  // v0.2.3 (composer only): RESELECTION BEFORE REPAIR — with a library,
  // a quiz-class defect is a selection problem first; redraw from the
  // shelf ($0, deterministic) and let the model repair only what
  // reselection couldn't (E7 measured repair at 79% of composed cost).
  if (composer && !mockVoice && bank) {
    const { reselectQuizForFindings } = await import('./composer/reselect.mjs');
    const reselect = reselectQuizForFindings(graph, authored, bank);
    if (reselect.lessonsTried > 0) {
      digest.reselection = `${reselect.lessonsSwapped}/${reselect.lessonsTried} quiz-defect lesson(s) fixed by shelf redraw ($0) before model repair`;
    }
  }
  let respliced = 0;
  let repaired = 0;
  const repair = await repairLoop(graph, authored, {
    tier: tiers.repair,
    ledger,
    budgetUsd,
    // Composed parts are pre-judged assets: one repair round catches
    // combination artifacts; a second buys little (E7b: 15 calls, $0.163,
    // residuals unchanged in kind). Fresh generation keeps two rounds.
    maxRounds: zeroApi ? 0 : mockVoice || composer ? 1 : 2,
    ...(composer ? { skipCodes: new Set(['J7_ECHO']) } : {}),
    afterRound: (g, a) => {
      // Repaired quizzes must not lose the instrument guarantees the
      // deterministic passes provide — both re-run before re-judging.
      respliced += spliceCatchDistractors(g, a).length;
      repaired += pairCorrectiveExplanations(g, a).length;
    },
    ...(mockVoice ? { mock: mockAuthorLesson } : {}),
  });
  if (respliced > 0) {
    digest.catchSplices = `${digest.catchSplices ? `${digest.catchSplices}; ` : ''}${respliced} re-spliced after repair rounds`;
  }
  if (repaired > 0) {
    digest.correctivePairing = `${digest.correctivePairing ? `${digest.correctivePairing}; ` : ''}${repaired} re-paired after repair rounds`;
  }
  const prereqEdges = graph.concepts.reduce((n, c) => n + c.requires.length, 0);
  digest.judgment = `Course judgment: ${blockingFindings(repair.findings).length === 0 ? 'no gaps' : `${blockingFindings(repair.findings).length} open finding(s)`} across ${graph.lessons.length} lessons; ${prereqEdges} prerequisite edges verified in order (V2)${bridges.length > 0 ? `; ${bridges.length} prerequisite gap(s) bridged with inline primers` : ''}; checks J1–J10 ran, ${repair.rounds} repair round(s) (${repair.sectionRepairs ?? 0} section, ${repair.fullRepairs ?? 0} full)`;
  if (repair.honest) digest.repairHonesty = repair.honest;

  // 7b · blending (roadmap v0.1.2 item 2): pasted texts — appended/quoted
  // correctives in explanations, spliced beliefForm sentences in option
  // slots — satisfy the instrument but read as pasted to the judge (the
  // A/B round's quiz 5/10). Voice passes rewrite both; every rewrite is
  // accepted only if the same lexical gate the instrument runs still
  // passes, so the classroom guarantees survive every blend. A final
  // deterministic re-pair catches any cross-effect (an option rewrite
  // that now catches a SECOND misconception gets its corrective appended
  // — restored guarantee beats restored prose).
  if (!mockVoice) {
    const { blendCorrectives, blendSplicedOptions } = await import('./voice/blend.mjs');
    const optionBlend =
      composer && zeroApi
        ? { candidates: 0, blended: 0, skipped: 'zero mode — S untrained on option rewrites; spliced forms ship (catch-gated)' }
        : await blendSplicedOptions(graph, authored, { tier: tiers.flywheel, ledger, budgetUsd });
    if (optionBlend.candidates > 0) {
      digest.optionBlending = `${optionBlend.blended}/${optionBlend.candidates} spliced option(s) rewritten as concise reason-bearing distractors (voice, catch-gated)`;
    }
    const blend = await blendCorrectives(graph, authored, {
      tier: tiers.flywheel,
      ledger,
      budgetUsd,
      ...(composer && zeroApi ? { sGenerate: zeroSGenerate } : {}),
    });
    if (blend.candidates > 0) {
      digest.correctiveBlending = `${blend.blended}/${blend.candidates} pasted corrective(s) blended into natural explanations (voice, confrontation-gated${blend.blended < blend.candidates ? '; the rest keep their appended form' : ''})`;
    }
    const safetyPairs = pairCorrectiveExplanations(graph, authored);
    if (safetyPairs.length > 0) {
      digest.correctivePairing = `${digest.correctivePairing ? `${digest.correctivePairing}; ` : ''}${safetyPairs.length} re-paired after blending (safety net)`;
    }
  }

  // 7c · the classroom gate (roadmap 3.2): Prof's zero-token battery runs
  // INSIDE the build. Its P1s cannot be repaired by tokens alone (they
  // reflect item/exposure design), so they set honest readiness — a run
  // whose classroom bars fail renders as needs_review, never 'ready'.
  let readiness = { status: 'ready', blockers: 0, warnings: 0, checkedSections: '10/10' };
  try {
    const { buildStructured } = await import('./profBridge.mjs');
    const { runClassroomArenaZeroToken } = await import('../scripts/prof/arenas/classroom.mjs');
    const structured = buildStructured(graph, authored, authoredExams);
    const arena = runClassroomArenaZeroToken({ structured, preset: 'cc-night-class', cohortSize: 25, seed: 1 });
    const classroomP1s = (arena.findings ?? []).filter((f) => f.severity === 'P1');
    digest.classroom = `zero-token classroom: repair ${arena.battery?.realistic?.misconceptions?.repairRate ?? '?'} · compliance loss ${arena.battery?.complianceRobustness?.degradation ?? '?'} · ${classroomP1s.length} P1 bar(s) unmet`;
    if (classroomP1s.length > 0) {
      digest.classroomFindings = classroomP1s.map((f) => f.detail?.slice(0, 140) ?? String(f));
      readiness = {
        status: 'needs_review',
        blockers: 0,
        warnings: classroomP1s.length,
        checkedSections: '10/10',
      };
    }
    await mkdir(runDir, { recursive: true });
    await writeFile(
      join(runDir, 'classroom.json'),
      JSON.stringify(
        {
          findings: arena.findings,
          battery: {
            itemSummary: arena.battery?.itemSummary,
            complianceRobustness: arena.battery?.complianceRobustness,
            solvability: arena.battery?.solvability,
            misconceptions: arena.battery?.realistic?.misconceptions,
          },
        },
        null,
        2,
      ),
    );
  } catch (error) {
    digest.classroom = `classroom gate unavailable (${String(error?.message ?? error).slice(0, 100)}) — readiness NOT verified by the battery`;
  }

  // 8 · render + artifacts
  const { files, manifest } = renderPackage({
    graph,
    authored,
    courseWide,
    generatedAt,
    digest,
    authoredExams,
    readiness,
  });
  await mkdir(runDir, { recursive: true });
  await writePackageToDir(files, join(runDir, 'package'));
  await writeFile(join(runDir, 'graph.json'), JSON.stringify(graph, null, 2));
  await writeFile(join(runDir, 'authored.json'), JSON.stringify(authored, null, 2));
  await writeFile(join(runDir, 'courseWide.json'), JSON.stringify(courseWide, null, 2));
  await writeFile(join(runDir, 'authoredExams.json'), JSON.stringify(authoredExams, null, 2));
  await writeFile(join(runDir, 'findings.json'), JSON.stringify(repair.findings, null, 2));

  if (zeroApi) {
    const { stopS } = await import('./tendril/sModel.mjs');
    stopS();
    digest.zeroLedger = 'expected \$0.0000 — any nonzero total is a zero-mode BUG';
  }

  // 8b · Tendril Tutor (composed runs): every course ships its offline
  // typed-answer tutor for $0 — course.json + index.html per run, the
  // shared ~76MB model/vendor assets symlinked, never duplicated.
  if (composer && !mockVoice) {
    try {
      const { buildTutorCourse, writeTutorBundle } = await import('./tendril/tutor/build.mjs');
      const { course, stats } = await buildTutorCourse(runDir);
      await writeTutorBundle(course, join(runDir, 'package', 'tutor'), { assets: 'link' });
      digest.tutor = `offline tutor bundled: ${stats.lessons} lesson(s), ${stats.items} item(s), ${stats.withCorrective} with corrective+diagnosis`;
    } catch (error) {
      digest.tutor = `tutor bundle FAILED (${String(error.message).slice(0, 80)}) — package ships without it`;
    }
  }
  await ledger.flush();

  // 9 · optional grade with the borrowed ruler (ground rule #6)
  let grade = null;
  if (gradePackage) {
    const { grade: gradeCore } = await import('../src/lib/quality/deepQualityGrader.js');
    grade = await gradeCore({
      fileProvider: createMemoryFileProvider(files),
      course: {
        id: runId,
        title: graph.course.title,
        lessonCount: graph.lessons.length,
        featureIds: Object.keys(FEATURE_FOLDERS),
      },
    });
    await writeFile(join(runDir, 'grade.json'), JSON.stringify(grade, null, 2));
  }

  return { runId, runDir, graph, authored, manifest, digest, findings: repair.findings, ledger, grade };
}
