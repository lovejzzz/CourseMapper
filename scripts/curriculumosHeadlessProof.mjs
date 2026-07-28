// curriculumosHeadlessProof.mjs — v0.15 S1: the brain runs without the app.
//
// Compiles and DEEP-GRADES a full course through the src/curriculumos facade
// under plain vite-node: no browser, no React, no localStorage. The standing
// proof that the compiler + genome + grader are separable from the website
// ("the website is the first client of the product").
//
//   npm run curriculumos:proof
//
// Exit 0 only when: every shard loads, the fixture links 6+, all nine
// deliverables compile, and the assembled package grades ≥95 with zero P0s.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  compileCourse,
  createKernelLibrary,
  gradePackage,
  inferCourseDisciplines,
  linkGenome,
} from '../src/curriculumos/index.js';

const repoRoot = process.cwd();

function log(message) {
  console.log(`[curriculumos-proof] ${message}`);
}

const COURSE = {
  courseName: 'Introductory Astronomy',
  lessons: [
    ['Diurnal Motion', 'diurnal motion Earth rotation rise and set'],
    ['The Celestial Sphere', 'celestial sphere sky coordinates'],
    ['Seasons and Axial Tilt', 'seasons axial tilt sunlight angle'],
    ['Phases of the Moon', 'moon phases illumination geometry'],
    ["Kepler's Third Law", 'Kepler third law orbital period semimajor axis'],
    ['The Electromagnetic Spectrum', 'electromagnetic spectrum wavelength frequency'],
    ['Spectral Lines', 'spectral lines atoms composition'],
    ['Telescope Aperture', 'telescope aperture light gathering power'],
  ].map(([title, topics], index) => ({
    title: `Lesson ${index + 1}: ${title}`,
    sections: [
      {
        topicSection: `${index + 1}.1: ${topics}`,
        learningObjectives: `Students will be able to:\n1. Apply ${topics} to interpret an astronomical observation`,
        weeklyAssessments: `Observation analysis ${index + 1}: explain one evidence-based conclusion`,
        asyncActivities: 'Annotate a sky map, spectrum, or orbital diagram and record one inference.',
        syncActivities: 'Compare interpretations in pairs, then defend the stronger evidence chain.',
        supportingResources: '',
      },
    ],
  })),
};

async function main() {
  // 1. The genome, from disk — the same shards the deployed app fetches.
  const map = new Map();
  const library = createKernelLibrary({
    storage: { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, v) },
  });
  const manifest = JSON.parse(readFileSync(join(repoRoot, 'public/genome/manifest.json'), 'utf8'));
  for (const shard of manifest.shards) {
    const body = JSON.parse(readFileSync(join(repoRoot, 'public/genome', shard.path), 'utf8'));
    library.addKernels(body.kernels, { source: 'shard' });
  }
  log(`genome loaded: ${manifest.shards.length} shards, ${library.size()} kernels`);

  // 2. Infer + link.
  const disciplines = inferCourseDisciplines(COURSE);
  const linked = linkGenome({
    courseMap: COURSE,
    library,
    sourceReferences: manifest.references || {},
  });
  const resolved = linked.telemetry.resolvedFromGenome + linked.telemetry.resolvedFromCache;
  log(
    `disciplines ${JSON.stringify(disciplines)} · linked ${resolved}/${COURSE.lessons.length} lessons (${linked.telemetry.conceptHits} concepts)`,
  );
  if (!disciplines.includes('astro')) throw new Error('astro not inferred');
  if (resolved < 6) throw new Error(`linked ${resolved} < 6`);

  // 3. Compile the full package from the linked kernels.
  const { deliverables, compiledFeatureIds, courseGraph } = compileCourse({
    courseMap: COURSE,
    enrichmentOverlay: { lessonContent: linked.lessonContent },
  });
  const compiledCount = compiledFeatureIds.filter((id) => deliverables[id]).length;
  const linkedCitationCount = Object.values(linked.lessonContent || {}).reduce(
    (sum, payload) => sum + (payload?.conceptProvenance?.citations?.length || 0),
    0,
  );
  log(
    `compiled ${compiledCount}/${compiledFeatureIds.length} deliverables · ${linkedCitationCount} linked citations · ${courseGraph?.resources?.length || 0} source resources`,
  );
  if (compiledCount !== compiledFeatureIds.length) throw new Error('compile incomplete');

  // 4. Assemble the real export files and deep-grade them.
  const deliverableState = Object.fromEntries(
    compiledFeatureIds.map((id) => [id, { status: 'done', data: deliverables[id] }]),
  );
  const judgment = linked.prerequisiteJudgment || {};
  const judgmentReceipt =
    Number(judgment.total) > 0
      ? `${Number(judgment.total)} prerequisite gaps (${Number(judgment.bridgeable) || 0} bridgeable with cited primers, ${
          Number(judgment.assumedBackground) || 0
        } assumed background) · ${Number(judgment.outOfOrder) || 0} out-of-order · ${
          Number(judgment.primersBuilt) || 0
        } primers built`
      : `no gaps across ${Number(linked.telemetry.conceptHits) || resolved} linked concepts`;
  // v0.15.1 C3: ALL NINE features assemble and grade headless — the slide
  // text-fit measurer gained a heuristic tier for canvas-less runtimes,
  // and the last named browser exception died here.
  const graded = await gradePackage({
    courseMap: COURSE,
    deliverables: deliverableState,
    featureIds: ['courseMap', ...compiledFeatureIds],
    courseGraph,
    pipelineState: { judgment: judgmentReceipt },
  });
  const quality = graded.quality || {};
  log(
    `graded: ${quality.score}/${quality.grade} · P0 ${quality.findingCounts?.p0 ?? '?'} · ${graded.files.length} files · texture ${quality.texture?.score ?? '—'}`,
  );
  if (quality.status !== 'graded') throw new Error(`not graded: ${quality.reason || 'unknown'}`);
  if (!(quality.score >= 95) || (quality.findingCounts?.p0 || 0) > 0) {
    const findings = Array.isArray(graded.qualityResult?.findings)
      ? graded.qualityResult.findings.map(({ severity, featureId, message, dimension, detail, evidence }) => ({
          severity,
          featureId,
          message,
          dimension,
          detail,
          evidence,
        }))
      : [];
    log(`quality dimensions: ${JSON.stringify(graded.qualityResult?.scores || {})}`);
    log(`quality findings: ${JSON.stringify(findings)}`);
    throw new Error(`grade below bar: ${quality.score}, P0 ${quality.findingCounts?.p0}`);
  }

  log('PASSED — the brain compiled, linked, and graded a course with zero browser APIs');
}

main().catch((error) => {
  console.error(`[curriculumos-proof] FAILED: ${error.stack || error}`);
  process.exit(1);
});
