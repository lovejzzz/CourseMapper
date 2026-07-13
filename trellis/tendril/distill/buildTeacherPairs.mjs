// TEACHER-PREFERENCE CORPUS BUILDER (E2B-MAX V2.1 Workstream A1).
//
// The V2 campaign measured mini's compiler-seat kernels ~1 judge point above
// E2B's — so (mini output = chosen, E2B output = rejected) preference pairs
// exist BY CONSTRUCTION. This builder authors the SAME per-lesson kernel
// contract twice per lesson across the crucible course pools:
//   chosen   = gpt-5.4-mini (paid, ~$0.01/lesson, json_object)
//   rejected = E2B greedy under the deployed grammar (the serving
//              distribution training must move)
// and emits BOTH lesson-level pairs and per-atom pairs (mc items, keyTerms)
// into data-g4-orpo/ in mlx_vlm.lora's {prompt, chosen, rejected} format.
//
// Poison filters (the SFT-collapse law, enforced at BUILD time):
//   - near-identity: chosen/rejected token overlap ≥ 0.9 → dropped
//   - both-bad: chosen must parse as JSON with a lessons[0] → else dropped
//   - per-course cap so no discipline monoculture forms
// Every drop is COUNTED and reported — silent truncation reads as coverage.
//
// Usage:
//   PAIRS=run npx vite-node trellis/tendril/distill/buildTeacherPairs.mjs \
//     [courseId,courseId,...]      (default: music-theory,cs-python,geology)
//
// Scaling note (roadmap A1): the full pool sweep is the same command with
// 'extended' — rerun across sessions; the JSONL appends idempotently by
// (courseId, lessonId) key. Training gate: ≥3K pairs (roadmap §2 A3).
import fs from 'node:fs';
import path from 'node:path';
import { buildLessonKernelPrompt } from '../../../src/lib/blueprintEnrichmentPass.js';
import {
  assessScionPreferencePair,
  deriveDeterministicContractEvidence,
} from '../../../src/lib/scionPreferenceGate.js';
import { resolveCourses } from '../../../scripts/crucible/courses.mjs';
import { loadApiKey } from '../../../scripts/lib/crucibleBrowser.mjs';
import { sGenerate, stopS } from '../sModel.mjs';
import { singleLessonEnvelope } from './kernelSchemas.mjs';

const OUT_DIR = new URL('./data-g4-orpo/', import.meta.url).pathname;
const TRAIN = path.join(OUT_DIR, 'train.jsonl');
const LEDGER = path.join(OUT_DIR, 'ledger.json');
const MINI_MODEL = 'gpt-5.4-mini';
const PER_COURSE_LESSON_CAP = 16;

// The crucible course prompts carry "Lessons cover: a; b; c" — synthesize the
// course-map shape buildLessonKernelPrompt reads (title + sections.topicSection).
function courseMapFromCourse(course) {
  const m = String(course.prompt || '').match(/Lessons cover:\s*(.+?)(?:\.\s*$|$)/s);
  const topics = m
    ? m[1]
        .split(/;\s*(?:and\s+)?/)
        .map((t) => t.trim().replace(/\.$/, ''))
        .filter(Boolean)
    : [];
  const lessons = Array.from({ length: course.lessonCount }, (_, index) => {
    const topic = topics[index] || `${course.title} topic ${index + 1}`;
    return {
      title: `Lesson ${index + 1}: ${topic.charAt(0).toUpperCase()}${topic.slice(1)}`,
      sections: [{ topicSection: topic, learningObjectives: '', supportingResources: '' }],
    };
  });
  return { courseName: course.title, lessons };
}

async function miniKernel(apiKey, systemPrompt, userPrompt) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MINI_MODEL,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_completion_tokens: 8000,
    }),
  });
  if (!response.ok) throw new Error(`mini HTTP ${response.status}`);
  const data = await response.json();
  return {
    text: data.choices?.[0]?.message?.content ?? '',
    costUsd: ((data.usage?.prompt_tokens ?? 0) * 0.15 + (data.usage?.completion_tokens ?? 0) * 0.6) / 1e6,
  };
}

function tokenOverlap(a, b) {
  const ta = new Set(
    String(a)
      .toLowerCase()
      .match(/[a-z]{3,}/g) ?? [],
  );
  const tb = new Set(
    String(b)
      .toLowerCase()
      .match(/[a-z]{3,}/g) ?? [],
  );
  if (ta.size === 0 || tb.size === 0) return 0;
  let hit = 0;
  for (const t of ta) if (tb.has(t)) hit += 1;
  return hit / Math.min(ta.size, tb.size);
}

export function buildDeterministicPreferencePair({ kind, prompt, chosen, rejected, metadata = {} }) {
  const chosenValue = typeof chosen === 'string' ? JSON.parse(chosen) : chosen;
  const rejectedValue = typeof rejected === 'string' ? JSON.parse(rejected) : rejected;
  const chosenAssessment = kind === 'lesson' ? (chosenValue?.lessons?.[0] ?? chosenValue) : chosenValue;
  const rejectedAssessment = kind === 'lesson' ? (rejectedValue?.lessons?.[0] ?? rejectedValue) : rejectedValue;
  const preferenceEvidence = deriveDeterministicContractEvidence({
    kind,
    chosen: chosenAssessment,
    rejected: rejectedAssessment,
  });
  const result = assessScionPreferencePair({
    kind,
    chosen: chosenAssessment,
    rejected: rejectedAssessment,
    preferenceEvidence,
  });
  if (!result.eligible) return { row: null, issues: result.issues };
  return {
    row: {
      kind,
      prompt,
      chosen: typeof chosen === 'string' ? chosen : JSON.stringify(chosen),
      rejected: typeof rejected === 'string' ? rejected : JSON.stringify(rejected),
      preferenceEvidence,
      ...metadata,
    },
    issues: [],
  };
}

function atomPairs(prompt, chosenLesson, rejectedLesson) {
  const pairs = [];
  const cMc = Array.isArray(chosenLesson?.mc) ? chosenLesson.mc : [];
  const rMc = Array.isArray(rejectedLesson?.mc) ? rejectedLesson.mc : [];
  for (let i = 0; i < Math.min(cMc.length, rMc.length); i += 1) {
    const candidate = buildDeterministicPreferencePair({
      kind: 'mc-item',
      prompt: `${prompt}\nWrite ONE multiple-choice item (q, op[4], ai, ex) for this lesson as JSON.`,
      chosen: cMc[i],
      rejected: rMc[i],
    });
    if (candidate.row) pairs.push(candidate.row);
  }
  const cKt = Array.isArray(chosenLesson?.keyTerms) ? chosenLesson.keyTerms : [];
  const rKt = Array.isArray(rejectedLesson?.keyTerms) ? rejectedLesson.keyTerms : [];
  for (let i = 0; i < Math.min(cKt.length, rKt.length); i += 1) {
    const candidate = buildDeterministicPreferencePair({
      kind: 'key-term',
      prompt: `${prompt}\nWrite ONE keyTerm (tr, df, eg, mi, cx) for this lesson as JSON.`,
      chosen: cKt[i],
      rejected: rKt[i],
    });
    if (candidate.row) pairs.push(candidate.row);
  }
  return pairs;
}

export async function buildPairs(courseIds) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const ledger = fs.existsSync(LEDGER) ? JSON.parse(fs.readFileSync(LEDGER, 'utf8')) : { done: {}, spendUsd: 0 };
  const apiKey = await loadApiKey(undefined, 'openai');
  const courses = resolveCourses(courseIds.join(','));
  const stats = {
    pairs: 0,
    droppedIdentity: 0,
    droppedBadChosen: 0,
    droppedBadRejected: 0,
    droppedUnprovenPreference: 0,
    spendUsd: 0,
  };

  for (const course of courses) {
    const courseMap = courseMapFromCourse(course);
    const lessonCount = Math.min(course.lessonCount, PER_COURSE_LESSON_CAP);
    for (let index = 0; index < lessonCount; index += 1) {
      const doneKey = `${course.id}|lesson-${index + 1}`;
      if (ledger.done[doneKey]) continue;
      const markDone = (status) => {
        ledger.done[doneKey] = status;
        fs.writeFileSync(LEDGER, JSON.stringify(ledger, null, 2));
      };
      const { systemPrompt, userPrompt } = buildLessonKernelPrompt(courseMap, [index]);
      let chosenText = '';
      try {
        const mini = await miniKernel(apiKey, systemPrompt, userPrompt);
        chosenText = mini.text;
        stats.spendUsd += mini.costUsd;
        ledger.spendUsd = Number(ledger.spendUsd || 0) + mini.costUsd;
        fs.writeFileSync(LEDGER, JSON.stringify(ledger, null, 2));
      } catch (error) {
        console.error(`[pairs] ${doneKey} mini failed: ${error.message}`);
        continue;
      }
      let chosenLesson = null;
      try {
        chosenLesson = JSON.parse(chosenText)?.lessons?.[0] ?? null;
      } catch {
        /* counted below */
      }
      if (!chosenLesson) {
        stats.droppedBadChosen += 1;
        markDone('bad-chosen');
        continue;
      }
      let rejectedText = '';
      try {
        rejectedText = String(
          (await sGenerate(
            {
              system: systemPrompt,
              user: userPrompt,
              task: 'items',
              maxTokens: 8000,
              schema: singleLessonEnvelope(`lesson-${index + 1}`),
            },
            { timeoutMs: 600_000 },
          )) ?? '',
        );
      } catch (error) {
        console.error(`[pairs] ${doneKey} e2b failed: ${error.message}`);
        continue;
      }
      let rejectedLesson = null;
      try {
        rejectedLesson = JSON.parse(rejectedText)?.lessons?.[0] ?? null;
      } catch {
        /* counted below */
      }
      if (!rejectedLesson) {
        stats.droppedBadRejected += 1;
        markDone('bad-rejected');
        continue;
      }
      if (tokenOverlap(chosenText, rejectedText) >= 0.9) {
        stats.droppedIdentity += 1;
        markDone('near-identity');
        continue;
      }
      const pairPrompt = `${systemPrompt}\n\n${userPrompt}`;
      const lessonPair = buildDeterministicPreferencePair({
        kind: 'lesson',
        prompt: pairPrompt,
        chosen: chosenText,
        rejected: rejectedText,
      });
      const rows = [lessonPair.row, ...atomPairs(pairPrompt, chosenLesson, rejectedLesson)]
        .filter(Boolean)
        .map((row) => ({
          ...row,
          courseId: course.id,
          lessonId: `lesson-${index + 1}`,
          context: { courseId: course.id, domain: course.domain || course.discipline || course.id },
        }));
      if (rows.length === 0) {
        stats.droppedUnprovenPreference += 1;
        markDone('no-pair-level-preference-evidence');
        continue;
      }
      fs.appendFileSync(TRAIN, rows.map((row) => JSON.stringify(row)).join('\n') + '\n');
      stats.pairs += rows.length;
      markDone(rows.length);
      console.error(`[pairs] ${doneKey}: +${rows.length} pairs (total ${stats.pairs}, $${stats.spendUsd.toFixed(3)})`);
    }
  }
  return stats;
}

if (process.env.PAIRS === 'run') {
  const ids = (process.argv[2] || 'music-theory,cs-python,geology').split(',');
  const stats = await buildPairs(ids);
  console.log(JSON.stringify(stats, null, 2));
  stopS();
}
