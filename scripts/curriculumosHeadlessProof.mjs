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
  courseName: 'Beginning Korean I',
  lessons: [
    ['Hangul Foundations', 'hangul consonants vowels syllable blocks alphabet'],
    ['Pronunciation and Sound Patterns', 'korean pronunciation sound rules'],
    ['Greetings and Introductions', 'basic greetings self-introduction'],
    ['Numbers and Counting', 'korean numbers counting systems counters'],
    ['Particles and Sentence Basics', 'subject markers particles sentence structure'],
    ['Present Tense Verbs', 'present tense verb conjugation non-past forms'],
    ['Honorifics and Politeness', 'honorifics politeness levels speech levels'],
    ['Asking Questions', 'question forms interrogatives question endings'],
  ].map(([title, topics], index) => ({
    title: `Lesson ${index + 1}: ${title}`,
    sections: [
      {
        topicSection: `${index + 1}.1: ${topics}`,
        learningObjectives: `Students will be able to:\n1. Apply ${topics} in short dialogues`,
        weeklyAssessments: `Speaking check ${index + 1}: short dialogue`,
        asyncActivities: 'Listen to the drills.',
        syncActivities: 'Pair practice.',
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
  const linked = linkGenome({ courseMap: COURSE, library });
  const resolved = linked.telemetry.resolvedFromGenome + linked.telemetry.resolvedFromCache;
  log(
    `disciplines ${JSON.stringify(disciplines)} · linked ${resolved}/${COURSE.lessons.length} lessons (${linked.telemetry.conceptHits} concepts)`,
  );
  if (!disciplines.includes('lang')) throw new Error('lang not inferred');
  if (resolved < 6) throw new Error(`linked ${resolved} < 6`);

  // 3. Compile the full package from the linked kernels.
  const { deliverables, compiledFeatureIds } = compileCourse({
    courseMap: COURSE,
    enrichmentOverlay: { lessonContent: linked.lessonContent },
  });
  const compiledCount = compiledFeatureIds.filter((id) => deliverables[id]).length;
  log(`compiled ${compiledCount}/${compiledFeatureIds.length} deliverables`);
  if (compiledCount !== compiledFeatureIds.length) throw new Error('compile incomplete');

  // 4. Assemble the real export files and deep-grade them.
  const deliverableState = Object.fromEntries(
    compiledFeatureIds.map((id) => [id, { status: 'done', data: deliverables[id] }]),
  );
  // pptxgenjs needs a DOM `document` — the ONE browser-coupled corner the
  // boundary work surfaced (named here, scheduled for the v0.15.1 diet).
  // The other eight features assemble and grade fully headless.
  const headlessFeatureIds = ['courseMap', ...compiledFeatureIds.filter((id) => id !== 'slideDecks')];
  const graded = await gradePackage({
    courseMap: COURSE,
    deliverables: deliverableState,
    featureIds: headlessFeatureIds,
  });
  const quality = graded.quality || {};
  log(
    `graded: ${quality.score}/${quality.grade} · P0 ${quality.findingCounts?.p0 ?? '?'} · ${graded.files.length} files · texture ${quality.texture?.score ?? '—'}`,
  );
  if (quality.status !== 'graded') throw new Error(`not graded: ${quality.reason || 'unknown'}`);
  if (!(quality.score >= 95) || (quality.findingCounts?.p0 || 0) > 0) {
    throw new Error(`grade below bar: ${quality.score}, P0 ${quality.findingCounts?.p0}`);
  }

  log('PASSED — the brain compiled, linked, and graded a course with zero browser APIs');
}

main().catch((error) => {
  console.error(`[curriculumos-proof] FAILED: ${error.stack || error}`);
  process.exit(1);
});
