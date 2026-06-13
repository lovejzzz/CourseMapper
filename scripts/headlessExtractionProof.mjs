// headlessExtractionProof.mjs — v0.15.2: the flywheel turns WITHOUT the app.
//
// The second contribution round-trip, run entirely through the CurriculumOS
// facade under vite-node: link a Korean course against the shipped shards,
// take the true misses (the four lessons the first extraction never saw),
// extract kernel candidates with a real model call, verify every citation
// against the real providers (OpenAlex / Open Library), and write the
// admitted kernels as a foundry source file for review.
//
//   npx vite-node scripts/headlessExtractionProof.mjs    (~$0.01, one call)
//
// This is the S1 boundary doing real work: no browser, no React, no
// localStorage — the same gates, the same honesty rules.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createKernelLibrary, extractOnMiss, linkGenome } from '../src/curriculumos/index.js';
import * as providers from '../src/lib/knowledge/providers.js';
import { loadApiKey } from './lib/crucibleBrowser.mjs';

const repoRoot = process.cwd();
const log = (message) => console.log(`[headless-extract] ${message}`);

const COURSE = {
  courseName: 'Beginning Korean I',
  lessons: [
    ['Hangul Foundations', 'hangul consonants vowels syllable blocks'],
    ['Pronunciation and Sound Patterns', 'korean pronunciation sound rules'],
    ['Greetings and Introductions', 'basic greetings self-introduction'],
    ['Numbers and Counting', 'korean numbers counting systems counters'],
    ['Particles and Sentence Basics', 'subject markers particles sentence structure'],
    ['Present Tense Verbs', 'present tense verb conjugation non-past forms'],
    ['Honorifics and Politeness', 'honorifics politeness levels speech levels'],
    ['Asking Questions', 'question forms interrogatives question endings'],
    // The four lessons the first extraction never saw — today's misses.
    ['Food and Ordering at Restaurants', 'food vocabulary ordering politely menu reading restaurant dialogue'],
    ['Daily Routines and Time', 'daily routine verbs time expressions schedules frequency words'],
    ['Simple Past Tense', 'past tense conjugation yesterday narration completed actions'],
    ['The Final Conversation Project', 'conversation script planning fluency practice peer feedback'],
  ].map(([title, topics], index) => ({
    title: `Lesson ${index + 1}: ${title}`,
    sections: [
      {
        topicSection: `${index + 1}.1: ${topics}`,
        learningObjectives: `Students will be able to:\n1. Apply ${topics} in short dialogues`,
        weeklyAssessments: `Check ${index + 1}`,
      },
    ],
  })),
};

async function main() {
  const apiKey = await loadApiKey(undefined, 'openai');

  const map = new Map();
  const library = createKernelLibrary({
    storage: { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, v) },
  });
  const manifest = JSON.parse(readFileSync(join(repoRoot, 'public/genome/manifest.json'), 'utf8'));
  for (const shard of manifest.shards) {
    const body = JSON.parse(readFileSync(join(repoRoot, 'public/genome', shard.path), 'utf8'));
    library.addKernels(body.kernels, { source: 'shard' });
  }

  const linked = linkGenome({ courseMap: COURSE, library });
  const resolved = linked.telemetry.resolvedFromGenome + linked.telemetry.resolvedFromCache;
  // missingIndices includes PARTIAL overlays (they still ride the model
  // path) — the extraction targets only lessons with NO linked content at
  // all, or the cap fills with concepts the genome already knows.
  const missedTitles = COURSE.lessons
    .map((lesson, index) => ({ lesson, index }))
    .filter(({ index }) => !linked.lessonContent?.[`lesson-${index + 1}`])
    .map(({ lesson }) => lesson.title);
  log(`linked ${resolved}/12 · TRUE misses: ${JSON.stringify(missedTitles)}`);
  if (missedTitles.length === 0) {
    log('no misses — nothing to extract');
    return;
  }

  const callModel = async (prompt) => {
    const res = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: 'gpt-5.4-mini', input: prompt, max_output_tokens: 4000 }),
    });
    if (!res.ok) throw new Error(`OpenAI ${res.status}`);
    const json = await res.json();
    return (
      json.output
        ?.flatMap((item) => item.content || [])
        .map((block) => block.text || '')
        .join('') || ''
    );
  };

  const result = await extractOnMiss({
    flagValue: 'on',
    linkResult: linked,
    conceptNames: missedTitles,
    courseTitle: COURSE.courseName,
    discipline: 'lang',
    callModel,
    providers,
  });
  log(
    `extraction: ${result.entries.length}/${result.candidateCount} admitted` +
      (result.rejected.length > 0
        ? ` · rejected: ${result.rejected.map((r) => `${r.id} (${r.reasons.join('/')})`).join(', ')}`
        : ''),
  );
  for (const entry of result.admitted) {
    log(`  ${entry.kernel.id} — ${entry.verifiedCitations.length} verified citation(s)`);
  }
  if (result.entries.length === 0) {
    log('nothing admitted — no source file written');
    process.exitCode = 1;
    return;
  }

  const outPath = join(repoRoot, 'scripts/foundry/sources/lang-contributed-2.json');
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        _comment:
          'CONTRIBUTED by the HEADLESS extraction flywheel (v0.15.2, scripts/headlessExtractionProof.mjs — ' +
          'the CurriculumOS facade running without the app). TIER-1 CONSENSUS kernels: model-generated prose, ' +
          'NO source anchors; attributions are published works verified to EXIST via Open Library/OpenAlex ' +
          '(coverage references, not quoted sources). HUMAN REVIEW REQUIRED before genome:build.',
        _contributedFrom: 'headless facade run (second round-trip)',
        sourceSnapshots: {},
        kernels: result.entries,
      },
      null,
      2,
    ),
  );
  log(
    `wrote ${outPath} — review, then: npx vite-node scripts/foundry/validateSource.mjs sources/lang-contributed-2.json`,
  );
}

main().catch((error) => {
  console.error(`[headless-extract] FAILED: ${error.stack || error}`);
  process.exit(1);
});
