#!/usr/bin/env node
/**
 * genomeHitRate.mjs — how much of a course can Algi V0 actually teach?
 *
 * Algi composes lessons from genome concepts, so its ceiling is not composition
 * quality (which matches Scion at 99/A) but COVERAGE: whether a lesson's topic
 * resolves to a concept at all. Every Algi failure measured so far reduces to
 * this, and no roadmap decision — default provider, authoring priority, which
 * shard to write next — can be made without it.
 *
 * Reports, per course: inferred discipline, lessons that resolve, hit rate.
 * A course is "Algi-ready" at >=80% lesson coverage, because the enrichment
 * gate is all-or-nothing and a single unresolved lesson blocks the package.
 *
 * Deliberately has no npm script: this is an analysis tool, and the repository
 * budget freezes the command surface.
 *
 *   npx vite-node scripts/genomeHitRate.mjs
 */
import fs from 'node:fs';
import { buildConceptIndex, resolveLessonConcepts } from '../src/lib/genome/conceptResolver.js';
import { inferCourseDisciplines } from '../src/lib/genome/libraryShardLoader.js';
import { buildNativeSkeletonUserPrompt } from '../src/lib/nativeSkeletonPrompts.js';
import { extractSourceFromPrompt, planSessionTopics } from '../src/lib/algiComposer.js';

const READY_THRESHOLD = 0.8;

function loadGenomeIndex() {
  const manifest = JSON.parse(fs.readFileSync('public/genome/manifest.json', 'utf8'));
  const kernels = [];
  for (const shard of manifest.shards) {
    kernels.push(...JSON.parse(fs.readFileSync(`public/genome/${shard.path}`, 'utf8')).kernels);
  }
  return buildConceptIndex(kernels);
}

async function loadCourses() {
  const courses = await import('../scripts/crucible/courses.mjs');
  const byId = new Map();
  for (const value of Object.values(courses)) {
    if (!Array.isArray(value)) continue;
    for (const course of value) if (course?.id && course?.prompt) byId.set(course.id, course);
  }
  return byId;
}

const index = loadGenomeIndex();
const courses = await loadCourses();
const rows = [];
let totalLessons = 0;
let resolvedLessons = 0;

for (const [id, course] of courses) {
  // Reproduce exactly what Algi sees: the skeleton prompt, then its own topics.
  const source = extractSourceFromPrompt(
    buildNativeSkeletonUserPrompt(course.prompt, { expectedLessons: course.lessonCount, confidence: 'high' }),
  );
  const topics = planSessionTopics(source, course.lessonCount);
  const disciplines = inferCourseDisciplines({
    courseName: course.title || id,
    lessons: topics.map((title) => ({ title })),
  });
  let resolved = 0;
  for (const topic of topics) {
    const hit = resolveLessonConcepts(
      { title: topic, sections: [{ topicSection: topic, learningObjectives: '' }] },
      index,
      { maxConcepts: 3 },
    );
    if ((hit.conceptRefs || []).length > 0) resolved += 1;
  }
  totalLessons += topics.length;
  resolvedLessons += resolved;
  rows.push({
    id,
    lessons: topics.length,
    discipline: disciplines[0] || '-',
    resolved,
    rate: resolved / topics.length,
  });
}

rows.sort((a, b) => b.rate - a.rate);
console.log('| Course | lessons | discipline | resolved | hit rate |');
console.log('| --- | ---: | --- | ---: | ---: |');
for (const row of rows) {
  console.log(
    `| ${row.id} | ${row.lessons} | ${row.discipline} | ${row.resolved}/${row.lessons} | ${(row.rate * 100).toFixed(0)}% |`,
  );
}
const ready = rows.filter((row) => row.rate >= READY_THRESHOLD).length;
console.log(
  `\nLessons resolved: ${resolvedLessons}/${totalLessons} = ${((resolvedLessons / totalLessons) * 100).toFixed(1)}%`,
);
console.log(
  `Algi-ready courses (>=${READY_THRESHOLD * 100}%): ${ready}/${rows.length} = ${((ready / rows.length) * 100).toFixed(0)}%`,
);
console.log(`Courses with no inferred discipline: ${rows.filter((row) => row.discipline === '-').length}`);
