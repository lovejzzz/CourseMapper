#!/usr/bin/env node
/**
 * scripts/prof.mjs — Project Prof orchestrator (design doc Rev 4).
 *
 *   npm run prof -- --arena a1 --scenario cs-python-adoption --universes 3 --mode course
 *   npm run prof -- --arena a1 --scenario cs-python-adoption --universes 9 --mode instrument
 *
 * A term = one orchestrated run: universes fan out over the immutable
 * artifact, verdicts pass quote-or-discard, the collapse stage produces
 * agreement-ranked findings and mean±CI KPIs, and everything persists under
 * verification-output/prof/term-<id>/ (crucible round discipline).
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createTerm, buildUniverses } from './prof/universe.mjs';
import { SpendMeter } from './prof/modelClient.mjs';
import { VerdictLedger, normalizeForQuoteMatch } from './prof/verdictLedger.mjs';
import { buildWorkloadAccount } from './prof/workloadAccountant.mjs';
import { runAdoptionArena } from './prof/arenas/adoption.mjs';
import { collapseFindings, personaPairAgreement } from './prof/collapse.mjs';
import { adoptionKpis, renderTermReport } from './prof/profReport.mjs';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(moduleDir, '..');

function parseArgs(argv) {
  const args = { arena: 'a1', universes: 3, mode: '', scenario: '', capUsd: 10, seed: 1 };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--arena') args.arena = String(argv[++index] || 'a1');
    else if (arg === '--scenario') args.scenario = String(argv[++index] || '');
    else if (arg === '--universes') args.universes = Number(argv[++index] || 3);
    else if (arg === '--mode') args.mode = String(argv[++index] || '');
    else if (arg === '--budget') args.capUsd = Number(argv[++index] || 10);
    else if (arg === '--seed') args.seed = Number(argv[++index] || 1);
    else if (arg === '--package-dir') args.packageDirOverride = String(argv[++index] || '');
  }
  return args;
}

async function loadScenario(scenarioId) {
  const raw = await fs.readFile(path.join(moduleDir, 'prof', 'scenarios', `${scenarioId}.json`), 'utf8');
  return JSON.parse(raw);
}

/** Artifact Bridge: extract the package through the grader's own extraction
 *  (the tests/lib shim is the proven node-side seam — crucible uses it).
 *  A `.json` path is a pre-extracted fixture (calibration known-bad), whose
 *  files were produced by the same exporters — still export-shaped text. */
async function extractPackageDir(packageDir) {
  if (packageDir.endsWith('.json')) {
    const fixture = JSON.parse(await fs.readFile(packageDir, 'utf8'));
    if (!Array.isArray(fixture.files)) throw new Error(`Fixture ${packageDir} has no files array.`);
    return { files: fixture.files, manifest: null, fixtureLabel: fixture.label };
  }
  const { extractPackage, createFsFileProvider } = await import(
    pathToFileURL(path.join(repoRoot, 'tests/lib/deepQualityGrader.js')).href
  );
  const provider = createFsFileProvider(packageDir);
  return extractPackage(provider);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.scenario) throw new Error('Usage: prof --arena a1 --scenario <id> --universes N --mode instrument|course');
  const scenario = await loadScenario(args.scenario);
  if (args.packageDirOverride) scenario.packageDir = args.packageDirOverride;
  const term = createTerm({
    mode: args.mode,
    scenarioId: scenario.id,
    arena: args.arena,
    capUsd: args.capUsd,
    seed: args.seed,
  });

  const termDir = path.join(repoRoot, 'verification-output', 'prof', term.termId);
  await fs.mkdir(termDir, { recursive: true });

  if (args.arena === 'a2') {
    // Zero-token classroom (P1): pure arithmetic, no meter, no API.
    const { runClassroomArenaZeroToken } = await import('./prof/arenas/classroom.mjs');
    const structuredPath = path.isAbsolute(scenario.structuredPackage)
      ? scenario.structuredPackage
      : path.join(repoRoot, scenario.structuredPackage);
    const structured = JSON.parse(await fs.readFile(structuredPath, 'utf8'));
    const arena = runClassroomArenaZeroToken({
      structured,
      preset: scenario.cohortPreset || 'cc-night-class',
      cohortSize: scenario.cohortSize || 25,
      seed: term.seed,
    });
    const { battery, ...rest } = arena;
    const result = {
      term,
      scenario: { id: scenario.id, structuredPackage: scenario.structuredPackage },
      ...rest,
      itemSummary: battery.itemSummary,
      complianceRobustness: battery.complianceRobustness,
      solvability: battery.solvability,
      misconceptions: battery.realistic.misconceptions,
      pacing: battery.realistic.pacing,
      cohortMeanMastery: battery.realistic.cohortMeanMastery,
      spend: { capUsd: term.capUsd, spentUsd: 0, callCount: 0 },
    };
    await fs.writeFile(path.join(termDir, 'term-result.json'), JSON.stringify(result, null, 2));
    await fs.writeFile(
      path.join(termDir, 'item-statistics.json'),
      JSON.stringify(battery.realistic.itemStats, null, 2),
    );
    console.log(
      `[prof] a2 zero-token · items ${result.itemSummary.items} (healthy ${result.itemSummary.healthyFraction}) · repair ${result.misconceptions.repairRate} · solvability quiz ${result.solvability.weeklyQuizExpected} exam ${result.solvability.examExpected}`,
    );
    console.log(
      `[prof] coverage ${result.coverage.covered}/${result.coverage.total} concepts genome-testable · compliance degradation ${result.complianceRobustness.degradation}`,
    );
    console.log(`[prof] findings ${result.findings.length} · spend $0 (zero-token layer)`);
    for (const finding of result.findings) console.log(`  [${finding.severity}] ${finding.detail}`);
    console.log(`[prof] result: ${path.relative(repoRoot, path.join(termDir, 'term-result.json'))}`);
    return;
  }

  if (args.arena === 'a2mouth') {
    // P2: the mouth layer — quarantined performances, FAQ demand, TA
    // round-trip, seminar. Small stratified samples on the cheap tier.
    const { sampleCohort } = await import('./prof/student/cohortFactory.mjs');
    const { buildMisconceptionCast } = await import('./prof/student/misconceptionCast.mjs');
    const { seededRandom } = await import('./prof/universe.mjs');
    const { runConfusionHeatmap, runTaRoundTrip, runSeminar } = await import('./prof/arenas/classroomMouth.mjs');
    const structuredPath = path.isAbsolute(scenario.structuredPackage)
      ? scenario.structuredPackage
      : path.join(repoRoot, scenario.structuredPackage);
    const structured = JSON.parse(await fs.readFile(structuredPath, 'utf8'));
    const meter = new SpendMeter({ capUsd: term.capUsd });
    const cohort = sampleCohort({
      preset: scenario.cohortPreset || 'cc-night-class',
      size: scenario.cohortSize || 25,
      seed: term.seed,
    });
    const concepts = structured.lessons.flatMap((lesson) => lesson.concepts);
    const cast = buildMisconceptionCast({ concepts, students: cohort.students, rng: seededRandom(term.seed * 31 + 5) });

    const lessonNumbers = structured.lessons.map((lesson) => lesson.lesson);
    const heatmapLessons = [
      1,
      Math.ceil(lessonNumbers.length / 3),
      Math.ceil((2 * lessonNumbers.length) / 3),
      lessonNumbers.length,
    ]
      .map((i) => lessonNumbers[Math.min(i - 1, lessonNumbers.length - 1)])
      .filter((v, i, arr) => arr.indexOf(v) === i);
    const heatmap = await runConfusionHeatmap({
      structured,
      faqQuestions: structured.mouthMaterials?.faqQuestions || [],
      cast,
      cohort,
      lessons: heatmapLessons,
      sampleSize: 5,
      meter,
      seed: term.seed,
    });
    const midLesson = lessonNumbers[Math.floor(lessonNumbers.length / 2)];
    const materials =
      structured.mouthMaterials?.byLesson?.[String(midLesson)] || structured.mouthMaterials?.byLesson?.[midLesson] || {};
    const taRoundTrip =
      materials.briefText && materials.rubricText
        ? await runTaRoundTrip({
            structured,
            cast,
            cohort,
            lessonNumber: midLesson,
            briefText: materials.briefText,
            rubricText: materials.rubricText,
            meter,
            seed: term.seed,
          })
        : { skipped: 'no brief/rubric text for the sampled lesson' };
    const seminar = materials.discussionPrompt
      ? await runSeminar({
          structured,
          cast,
          cohort,
          lessonNumber: midLesson,
          discussionPrompt: materials.discussionPrompt,
          positions: materials.positions,
          meter,
          seed: term.seed,
        })
      : { skipped: 'no discussion prompt for the sampled lesson' };

    const taLeaks = (taRoundTrip.leakageEvents || []).length;
    const totalPerformances = (heatmap.leakage.totalResponses || 0) + 3 + (seminar.turns || 0);
    const totalLeaked = (heatmap.leakage.leakedResponses || 0) + taLeaks;
    const leakageRate = totalPerformances > 0 ? Math.round((totalLeaked / totalPerformances) * 1000) / 1000 : null;

    const findings = [];
    if (heatmap.faqHitRate !== null && heatmap.faqHitRate < 0.6) {
      findings.push({
        severity: 'P1',
        instrument: 'faq-demand',
        detail: `FAQ hit rate ${heatmap.faqHitRate} (bar 0.6): the generated FAQ answers supply-side guesses, not the questions the simulated cohort actually asked`,
        evidence: (heatmap.unansweredDemand[0] || {}).question || '',
      });
    }
    if (taRoundTrip.discriminates === false) {
      findings.push({
        severity: 'P1',
        instrument: 'rubric-discrimination',
        detail: `the rubric separated strong and weak submissions by ${taRoundTrip.discrimination} band(s) (bar: 2)`,
        evidence: JSON.stringify(taRoundTrip.bands),
      });
    }
    if ((taRoundTrip.missingCriteria || []).length > 0) {
      findings.push({
        severity: 'P2',
        instrument: 'rubric-coverage',
        detail: `the TA needed ${taRoundTrip.missingCriteria.length} criteria the rubric lacks`,
        evidence: taRoundTrip.missingCriteria.slice(0, 2).join('; '),
      });
    }
    if (seminar.deadPrompt) {
      findings.push({
        severity: 'P1',
        instrument: 'dead-prompt',
        detail: `the lesson ${midLesson} discussion produced no disagreement and no citations in ${seminar.turns} turns`,
        evidence: seminar.transcript?.[0]?.text || '',
      });
    }

    const spend = meter.summary();
    const result = {
      term,
      scenario: { id: scenario.id, structuredPackage: scenario.structuredPackage },
      heatmap,
      taRoundTrip,
      seminar: { ...seminar, transcript: undefined, sampleTurn: seminar.transcript?.[0] || null },
      leakage: {
        totalPerformances,
        totalLeaked,
        rate: leakageRate,
        killBar: 0.05,
        killTripped: leakageRate !== null && leakageRate >= 0.05,
      },
      findings,
      spend: { capUsd: spend.capUsd, spentUsd: spend.spentUsd, callCount: spend.callCount },
    };
    await fs.writeFile(path.join(termDir, 'term-result.json'), JSON.stringify(result, null, 2));
    await fs.writeFile(path.join(termDir, 'seminar-transcript.json'), JSON.stringify(seminar.transcript || [], null, 2));
    console.log(
      `[prof] a2mouth · questions ${heatmap.questionsAsked} · FAQ hit ${heatmap.faqHitRate} · TA bands ${JSON.stringify(taRoundTrip.bands || {})} · seminar ${seminar.deadPrompt ? 'DEAD' : 'alive'} (${seminar.turns ?? 0} turns)`,
    );
    console.log(
      `[prof] leakage ${totalLeaked}/${totalPerformances} = ${leakageRate} (kill bar 0.05${leakageRate >= 0.05 ? ' — TRIPPED' : ''})`,
    );
    for (const finding of findings) console.log(`  [${finding.severity}] ${finding.detail}`);
    console.log(`[prof] spend $${spend.spentUsd.toFixed(3)} of $${spend.capUsd}`);
    return;
  }

  const packageDir = path.isAbsolute(scenario.packageDir)
    ? scenario.packageDir
    : path.join(repoRoot, scenario.packageDir);
  console.log(`[prof] ${term.termId} · mode=${term.mode} · arena=${args.arena} · universes=${args.universes}`);
  console.log(`[prof] artifact: ${packageDir}`);
  const extracted = await extractPackageDir(packageDir);
  console.log(`[prof] extracted ${extracted.files.length} files (Artifact Bridge: export text only)`);

  const normalizedCorpus = normalizeForQuoteMatch(extracted.files.map((file) => file.text).join('\n'));
  const ledger = new VerdictLedger({ termDir, normalizedCorpus });
  const meter = new SpendMeter({ capUsd: term.capUsd });
  const workloadAccount = buildWorkloadAccount(extracted);

  const universes = buildUniverses({ scenario, count: args.universes, seed: term.seed });
  await fs.writeFile(path.join(termDir, 'universes.json'), JSON.stringify({ term, scenario, universes }, null, 2));

  if (args.arena !== 'a1')
    throw new Error(`Arena ${args.arena} is not built yet (P0 ships A1, P1 ships A2's zero-token layer).`);
  const { reviews, errors } = await runAdoptionArena({
    universes,
    extracted,
    workloadAccount,
    courseBrief: scenario.courseBrief,
    meter,
    ledger,
    artifactLabel: scenario.packageDir,
  });

  const ledgerStats = await ledger.flush();
  const findingEntries = reviews.flatMap((review) =>
    review.verdict.findings.map((finding) => ({
      universeId: review.universeId,
      personaId: review.personaId,
      finding,
    })),
  );
  const findings = collapseFindings(findingEntries, universes.length);
  const kpis = adoptionKpis(reviews);
  const pairAgreement = personaPairAgreement(
    reviews.map((review) => ({ personaId: review.personaId, artifact: review.artifact, tier: review.verdict.tier })),
  );

  const spend = meter.summary();
  const result = {
    term,
    scenario: { id: scenario.id, packageDir: scenario.packageDir },
    kpis,
    findings,
    workloadAccount: { ...workloadAccount, weeks: workloadAccount.weeks.map(({ sources, ...week }) => week) },
    pairAgreement,
    ledger: ledgerStats,
    errors,
    spend: { capUsd: spend.capUsd, spentUsd: spend.spentUsd, callCount: spend.callCount },
  };
  await fs.writeFile(path.join(termDir, 'term-result.json'), JSON.stringify(result, null, 2));
  await fs.writeFile(path.join(termDir, 'spend-ledger.json'), JSON.stringify(spend, null, 2));
  const report = renderTermReport({ term, scenario, kpis, findings, workloadAccount, spend, errors, pairAgreement });
  await fs.writeFile(path.join(termDir, 'PROF_REPORT.md'), report);

  console.log(`[prof] ${reviews.length}/${universes.length} universes returned verdicts (${errors.length} errors)`);
  console.log(
    `[prof] ledger: ${ledgerStats.accepted} verdicts, ${ledgerStats.discarded} claims discarded (quote-or-discard)`,
  );
  console.log(
    `[prof] adoption rate ${kpis.adoptionRate === null ? 'n/a' : kpis.adoptionRate * 100 + '%'} · teach-as-is ${kpis.teachAsIs.mean}${
      kpis.teachAsIs.ci95 ? ` (CI ${kpis.teachAsIs.ci95[0]}–${kpis.teachAsIs.ci95[1]})` : ''
    } · findings ${findings.length}`,
  );
  console.log(`[prof] spend $${spend.spentUsd.toFixed(3)} of $${spend.capUsd}`);
  console.log(`[prof] report: ${path.relative(repoRoot, path.join(termDir, 'PROF_REPORT.md'))}`);
}

main().catch((error) => {
  console.error(`[prof] FAILED: ${error.message}`);
  process.exitCode = 1;
});
