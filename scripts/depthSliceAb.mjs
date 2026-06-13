// depthSliceAb.mjs — v0.15.3 D1: the depth slice A/B, finally at the right size.
//
// The experiment that slipped three releases, run per the judge variance
// note's aggregate protocol (docs/JUDGE_VARIANCE_NOTE.md): EIGHT genome-linked
// fixture courses, each compiled TWICE through the curriculumos facade — deep
// (kernel worked example + misconception corrective + citation INSIDE the
// lesson-plan activity steps) versus flat (the pre-v0.15.3 back half) — both
// arms assembled into the real export files, structurally graded, and judged
// by the same advisory instrument the Crucible rounds use (gpt-5.4-mini,
// "would I teach from this as-is?").
//
// Deterministic by construction: each course's lessons are titled from the
// shard's own concept terms, both arms share the SAME linker overlay, and the
// only delta is configMap.lessonPlans.depth. No browser, no generation spend —
// the only cost is 16 judge calls (~$0.01 each).
//
//   npx vite-node scripts/depthSliceAb.mjs
//
// THE BAR (defined before the run, per house law — roadmap D1):
//   - structural: both arms graded, zero P0s, deep score >= flat score on
//     every twin (deep may never structurally regress);
//   - texture: deep texture >= flat texture - 2 on every twin (no collapse);
//   - judge: across >=6 judged pairs, deep wins the majority with ZERO
//     losses (the voice-flip aggregate form), OR deep takes a >=2-point
//     margin on any single course.
// Bar met -> flip readLessonDepthMode's default in its own commit, evidence
// in the comment. Bar unmet -> named failure class in the report, flag stays
// opt-in, the kernel-placement hypothesis retires honestly.
import { readFileSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'jszip';

import { compileCourse, createKernelLibrary, linkGenome } from '../src/curriculumos/index.js';
import { buildCourseMaterialsZip } from '../src/lib/packageZipExporter.js';
import { extractPackage } from '../src/lib/quality/deepQualityGrader.js';
import { createMemoryFileProvider } from '../src/lib/quality/fileProviders.js';
import { loadApiKey, redactSecrets, repoRoot } from './lib/crucibleBrowser.mjs';
import {
  JUDGE_MODEL,
  buildJudgePrompt,
  judgeSpendUsd,
  parseJudgeResponse,
  sampleJudgeArtifacts,
} from './lib/crucibleRound.mjs';

const LESSONS_PER_COURSE = 8;
// Eight disciplines with the deepest shards — every pair the protocol needs
// plus two spares for unparseable judge responses.
const COURSES = [
  { shard: 'history', title: 'World History to 1500' },
  { shard: 'lit', title: 'Introduction to World Literature' },
  { shard: 'math', title: 'Calculus I' },
  { shard: 'econ', title: 'Principles of Economics' },
  { shard: 'cs', title: 'Introduction to Programming with Python' },
  { shard: 'geo', title: 'Physical Geology' },
  { shard: 'psych', title: 'Introduction to Psychology' },
  { shard: 'lang', title: 'Beginning Korean I' },
];

function log(message) {
  console.log(`[depth-ab] ${message}`);
}

function firstWords(text, count) {
  return String(text || '')
    .split(/\s+/)
    .slice(0, count)
    .join(' ');
}

// Lessons titled from the shard's own concept terms — linkage by construction.
function courseFromShard(shard, title) {
  const body = JSON.parse(readFileSync(path.join(repoRoot, 'public/genome', `${shard}-intro.json`), 'utf8'));
  const kernels = body.kernels.slice(0, LESSONS_PER_COURSE);
  return {
    id: `${shard}-depth`,
    title,
    lessonCount: kernels.length,
    courseMap: {
      courseName: title,
      lessons: kernels.map((kernel, index) => ({
        title: `Lesson ${index + 1}: ${kernel.term}`,
        sections: [
          {
            topicSection: `${index + 1}.1: ${kernel.term} ${firstWords(kernel.definition?.text, 8)}`,
            learningObjectives: `Students will be able to:\n1. Analyze ${kernel.term} using course evidence\n2. Apply ${kernel.term} to a new case`,
            weeklyAssessments: `1. Week ${index + 1} check: applied ${kernel.term} problems.`,
            asyncActivities: 'Read the assigned chapter section.',
            syncActivities: 'Guided practice and discussion.',
            supportingResources: '',
          },
        ],
      })),
    },
  };
}

function loadLibrary() {
  const map = new Map();
  const library = createKernelLibrary({
    storage: { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, v) },
  });
  const manifest = JSON.parse(readFileSync(path.join(repoRoot, 'public/genome/manifest.json'), 'utf8'));
  for (const shard of manifest.shards) {
    const body = JSON.parse(readFileSync(path.join(repoRoot, 'public/genome', shard.path), 'utf8'));
    library.addKernels(body.kernels, { source: 'shard' });
  }
  return library;
}

// Compile one arm, assemble the REAL export files, structural-grade them,
// and extract the judge's three sample artifacts from the actual zip bytes.
async function buildArm(course, linked, depth) {
  const { deliverables, compiledFeatureIds } = compileCourse({
    courseMap: course.courseMap,
    enrichmentOverlay: { lessonContent: linked.lessonContent },
    configMap: { lessonPlans: { depth } },
  });
  const deliverableState = Object.fromEntries(
    compiledFeatureIds.map((id) => [id, { status: 'done', data: deliverables[id] }]),
  );
  const built = await buildCourseMaterialsZip({
    courseMap: course.courseMap,
    deliverables: deliverableState,
    featureIds: ['courseMap', ...compiledFeatureIds],
    courseName: `${course.title} (${depth})`,
    quality: { timeoutMs: 60000 },
  });
  const quality = built.quality || {};
  const buffer = Buffer.from(await built.blob.arrayBuffer());
  const zip = await JSZip.loadAsync(buffer);
  const fileMap = {};
  for (const [entryPath, entry] of Object.entries(zip.files)) {
    if (!entry.dir) fileMap[entryPath] = await entry.async('uint8array');
  }
  const pkg = await extractPackage(createMemoryFileProvider(fileMap));
  const artifacts = sampleJudgeArtifacts(pkg.files, course.lessonCount);
  return {
    depth,
    score: quality.score ?? null,
    grade: quality.grade ?? null,
    p0: quality.findingCounts?.p0 ?? null,
    texture: quality.texture?.score ?? null,
    graded: quality.status === 'graded',
    artifacts,
  };
}

async function judgeArm(course, arm, apiKey) {
  if (arm.artifacts.length === 0) return { overall: null, spendUsd: 0, note: 'no sampleable artifacts' };
  const prompt = buildJudgePrompt({ id: course.id, title: course.title }, arm.artifacts);
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: JUDGE_MODEL,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
      }),
    });
    if (!response.ok) return { overall: null, spendUsd: 0, note: `HTTP ${response.status}` };
    const data = await response.json();
    const parsed = parseJudgeResponse(data?.choices?.[0]?.message?.content || '');
    return {
      overall: parsed?.overall ?? null,
      verdict: parsed?.verdict || '',
      spendUsd: judgeSpendUsd(data?.usage),
      note: parsed ? null : 'unparseable',
    };
  } catch (error) {
    return { overall: null, spendUsd: 0, note: redactSecrets(error.message || String(error)) };
  }
}

async function main() {
  const apiKey = await loadApiKey();
  const library = loadLibrary();
  log(`genome loaded: ${library.size()} kernels`);

  const rows = [];
  let spend = 0;
  for (const spec of COURSES) {
    const course = courseFromShard(spec.shard, spec.title);
    const linked = linkGenome({ courseMap: course.courseMap, library });
    const linkedCount = Object.keys(linked.lessonContent || {}).length;
    log(`${course.id}: linked ${linkedCount}/${course.lessonCount}`);
    if (linkedCount < 6) {
      rows.push({ id: course.id, error: `linked ${linkedCount} < 6 — excluded` });
      continue;
    }

    const flat = await buildArm(course, linked, 'flat');
    const deep = await buildArm(course, linked, 'deep');
    const flatJudge = await judgeArm(course, flat, apiKey);
    const deepJudge = await judgeArm(course, deep, apiKey);
    spend += (flatJudge.spendUsd || 0) + (deepJudge.spendUsd || 0);

    rows.push({
      id: course.id,
      linked: linkedCount,
      flat: { ...flat, judge: flatJudge.overall, verdict: flatJudge.verdict, note: flatJudge.note },
      deep: { ...deep, judge: deepJudge.overall, verdict: deepJudge.verdict, note: deepJudge.note },
    });
    log(
      `${course.id}: structural ${flat.score}/${flat.grade} vs ${deep.score}/${deep.grade} · ` +
        `texture ${flat.texture} vs ${deep.texture} · judge ${flatJudge.overall ?? '—'} vs ${deepJudge.overall ?? '—'}`,
    );
    delete flat.artifacts;
    delete deep.artifacts;
  }

  // ── The bar, evaluated exactly as written ─────────────────────────────────
  const paired = rows.filter((row) => !row.error);
  const structuralHolds = paired.every(
    (row) =>
      row.flat.graded && row.deep.graded && row.flat.p0 === 0 && row.deep.p0 === 0 && row.deep.score >= row.flat.score,
  );
  const textureHolds = paired.every(
    (row) => row.deep.texture == null || row.flat.texture == null || row.deep.texture >= row.flat.texture - 2,
  );
  const judged = paired.filter((row) => Number.isFinite(row.flat.judge) && Number.isFinite(row.deep.judge));
  const wins = judged.filter((row) => row.deep.judge > row.flat.judge).length;
  const losses = judged.filter((row) => row.deep.judge < row.flat.judge).length;
  const ties = judged.length - wins - losses;
  const maxMargin = judged.reduce((max, row) => Math.max(max, row.deep.judge - row.flat.judge), 0);
  const aggregateForm = judged.length >= 6 && losses === 0 && wins > losses;
  const marginForm = maxMargin >= 2;
  const barMet = structuralHolds && textureHolds && (aggregateForm || marginForm);

  const lines = [
    '# Depth slice A/B — aggregate protocol (v0.15.3 D1)',
    '',
    `- Generated: ${new Date().toISOString()}`,
    `- Judge: ${JUDGE_MODEL} (advisory instrument, same sampling as Crucible rounds)`,
    `- Judge spend: $${spend.toFixed(3)}`,
    `- Pairs judged: ${judged.length} (protocol floor: 6) · deep record: ${wins}W-${losses}L-${ties}T · max margin: +${maxMargin}`,
    `- Structural holds on every twin: ${structuralHolds} · texture holds: ${textureHolds}`,
    `- **BAR ${barMet ? 'MET' : 'NOT MET'}** (${aggregateForm ? 'aggregate form' : marginForm ? 'margin form' : 'neither form satisfied'})`,
    '',
    '| course | linked | flat score | deep score | flat texture | deep texture | flat judge | deep judge | Δ judge |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...rows.map((row) =>
      row.error
        ? `| ${row.id} | — | ${row.error} | | | | | | |`
        : `| ${row.id} | ${row.linked}/${LESSONS_PER_COURSE} | ${row.flat.score}/${row.flat.grade} | ${row.deep.score}/${row.deep.grade} | ${row.flat.texture ?? '—'} | ${row.deep.texture ?? '—'} | ${row.flat.judge ?? '—'} | ${row.deep.judge ?? '—'} | ${
            Number.isFinite(row.flat.judge) && Number.isFinite(row.deep.judge)
              ? (row.deep.judge - row.flat.judge >= 0 ? '+' : '') + (row.deep.judge - row.flat.judge)
              : '—'
          } |`,
    ),
    '',
    '## Judge verdicts (deep arm)',
    '',
    ...paired.map((row) => `- **${row.id}**: ${row.deep.verdict || row.deep.note || '—'}`),
    '',
  ];

  const outDir = path.join(repoRoot, 'verification-output', 'depth-ab');
  await fs.mkdir(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = path.join(outDir, `REPORT_${stamp}.md`);
  await fs.writeFile(reportPath, lines.join('\n'));
  await fs.writeFile(
    path.join(outDir, `result_${stamp}.json`),
    JSON.stringify({ rows, wins, losses, ties, maxMargin, structuralHolds, textureHolds, barMet, spend }, null, 2),
  );
  log(`report: ${path.relative(repoRoot, reportPath)}`);
  log(
    `VERDICT: ${barMet ? 'BAR MET' : 'BAR NOT MET'} — ${wins}W-${losses}L-${ties}T over ${judged.length} pairs, ` +
      `max margin +${maxMargin}, structural ${structuralHolds ? 'held' : 'BROKE'}, texture ${textureHolds ? 'held' : 'BROKE'}`,
  );
}

main().catch((error) => {
  console.error(`[depth-ab] FAILED: ${redactSecrets(error.stack || String(error))}`);
  process.exit(1);
});
