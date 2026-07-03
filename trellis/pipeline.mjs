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
import { authorAllLessons, authorCourseWide } from './voice/author.mjs';
import { mockAuthorLesson, mockAuthorCourseWide } from './voice/mockAuthor.mjs';
import { repairLoop } from './voice/repair.mjs';
import { blockingFindings } from './judgment/index.mjs';
import { renderPackage, writePackageToDir, createMemoryFileProvider, FEATURE_FOLDERS } from './render/deliverables.mjs';
import { intakeSyllabus } from './intake.mjs';
import { createRunLedger } from './telemetry.mjs';
import { stageTiers } from './providers.mjs';
import { autoAlignBloom, downgradeDanglingClaims } from './graph/autoAlign.mjs';

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

  // 2 · structural validation (pre-knowledge: V5 may legitimately fail here)
  let findings = validateGraph(graph);
  const structural = blockers(findings).filter((f) => f.code !== 'V5_KERNEL_OR_GAP');
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
      digest.flywheel = `${filled.length} concept(s) flywheel-filled — ${provenance}`;
    }
  }
  digest.enrichment = `genome: ${coverage.linked}/${coverage.total} concepts carry kernels (${coverage.note})`;

  // 5 · full validation must now be clean
  findings = validateGraph(graph);
  if (blockers(findings).length > 0) {
    throw new Error(
      `graph fails validation after knowledge:\n${blockers(findings)
        .map((f) => `- [${f.code}] ${f.message}`)
        .join('\n')}`,
    );
  }
  digest.validation = 'V1–V7 structural invariants: 0 blockers';

  // 6 · author (course-wide fires concurrently with the lesson batches)
  const authorOptions = mockVoice ? { mock: mockAuthorLesson } : { tier: tiers.author, ledger, budgetUsd };
  const courseWidePromise = mockVoice
    ? Promise.resolve(mockAuthorCourseWide(graph))
    : authorCourseWide(graph, { tier: tiers.author, ledger, budgetUsd });
  const { authored, failures } = await authorAllLessons(graph, authorOptions);
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

  // 6b · deterministic claim hygiene: a dangling ref becomes an explicit
  // null (JUDGED-class) — an unverifiable citation must not pose as
  // grounding, and repair calls must not be spent on what a downgrade fixes.
  const downgraded = downgradeDanglingClaims(graph, authored);
  if (downgraded.length > 0) {
    digest.claimsDowngraded = `${downgraded.length} unresolvable claim ref(s) downgraded to JUDGED (disclosed, not repaired)`;
  }

  // 7 · judge + repair
  const repair = await repairLoop(graph, authored, {
    tier: tiers.repair,
    ledger,
    budgetUsd,
    maxRounds: mockVoice ? 1 : 2,
    ...(mockVoice ? { mock: mockAuthorLesson } : {}),
  });
  const prereqEdges = graph.concepts.reduce((n, c) => n + c.requires.length, 0);
  digest.judgment = `Course judgment: ${blockingFindings(repair.findings).length === 0 ? 'no gaps' : `${blockingFindings(repair.findings).length} open finding(s)`} across ${graph.lessons.length} lessons; ${prereqEdges} prerequisite edges verified in order (V2); checks J1–J10 ran, ${repair.rounds} repair round(s) (${repair.sectionRepairs ?? 0} section, ${repair.fullRepairs ?? 0} full)`;
  if (repair.honest) digest.repairHonesty = repair.honest;

  // 8 · render + artifacts
  const { files, manifest } = renderPackage({ graph, authored, courseWide, generatedAt, digest });
  await mkdir(runDir, { recursive: true });
  await writePackageToDir(files, join(runDir, 'package'));
  await writeFile(join(runDir, 'graph.json'), JSON.stringify(graph, null, 2));
  await writeFile(join(runDir, 'authored.json'), JSON.stringify(authored, null, 2));
  await writeFile(join(runDir, 'findings.json'), JSON.stringify(repair.findings, null, 2));
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
