#!/usr/bin/env node
// Export parity, first slice — roadmap 4.1. Maps Trellis authored
// structures into the shapes the app's REAL exporters consume and builds
// actual .docx files via buildDeliverableDocxBlob (the façade's blob
// builder — never a duplicate builder, per the export design system).
// Covered in this slice: Lesson Plans and Quiz & Exam Bank (the artifacts
// professors print). Remaining features stay markdown-only and the digest
// says so — partial parity is disclosed, not implied away.
//
//   npx vite-node trellis/appExportAdapter.mjs <runDir>

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

function orderedLessons(graph) {
  return [...graph.lessons].sort((a, b) => a.week - b.week || a.session - b.session);
}

export function mapLessonPlansData(graph, authored) {
  const outcomesById = new Map(graph.outcomes.map((o) => [o.id, o]));
  const plans = orderedLessons(graph).map((lesson, index) => {
    const art = authored[lesson.id];
    const outcomes = lesson.outcomeIds.map((id) => outcomesById.get(id)).filter(Boolean);
    const graded = graph.assessments.filter((a) => a.anchor.lessonId === lesson.id);
    return {
      lessonTitle: `Lesson ${index + 1}: ${lesson.title}`,
      weekNumber: `Week ${lesson.week}`,
      duration: `${art.plan.segments.reduce((sum, seg) => sum + seg.minutes, 0)} min`,
      bloomsLevels: [...new Set(outcomes.map((o) => o.bloom))],
      objectives: outcomes.map((o) => o.statement),
      assessmentBlock: graded.map((a) => ({ title: a.registryKey, weight: `${a.weightPct}%` })),
      outline: art.plan.segments.map((seg) => ({
        time: `${seg.minutes} min`,
        activity: seg.mode,
        description: seg.text,
        ...(seg.mode === 'reteach' ? { catchUpPlan: 'In-class path for students who missed the reading.' } : {}),
      })),
    };
  });
  return { plans };
}

export function mapQuizBankData(graph, authored, authoredExams = {}) {
  const lessons = orderedLessons(graph);
  const quizzes = lessons.map((lesson, index) => {
    const art = authored[lesson.id];
    return {
      lessonTitle: `Lesson ${index + 1}: ${lesson.title} — Quiz`,
      gradingSpec: `1 correct letter = 2 points, no partial credit; total ${art.quizItems.length * 2} points, autograded.`,
      bloomsCoverage: [...new Set(art.quizItems.map((item) => item.bloom))],
      questions: art.quizItems.map((item) => ({
        type: 'multiple_choice',
        question: item.stem,
        options: item.options,
        answer: 'ABCD'.charAt(item.correctIndex),
        explanation: item.explanation,
        points: 2,
      })),
    };
  });
  const conceptNames = new Map(graph.concepts.map((c) => [c.id, c.name]));
  for (const exam of graph.assessments.filter((a) => a.kindOf === 'exam')) {
    const items = authoredExams[exam.id] ?? [];
    if (items.length === 0) continue;
    quizzes.push({
      lessonTitle: exam.registryKey,
      examScope: `Covers lessons through week ${exam.anchor.week}.`,
      gradingSpec: `1 correct letter = 4 points, no partial credit; total ${items.length * 4} points. Accommodated administrations use the same key with extended time.`,
      questions: items.map((item) => ({
        type: 'multiple_choice',
        question: `${item.stem} (assesses: ${conceptNames.get(item.conceptId) ?? item.conceptId})`,
        options: item.options,
        answer: 'ABCD'.charAt(item.correctIndex),
        explanation: item.explanation,
        points: 4,
      })),
    });
  }
  return { quizzes };
}

export async function writeDocxExports(runDir) {
  const graph = JSON.parse(await readFile(join(runDir, 'graph.json'), 'utf8'));
  const authored = JSON.parse(await readFile(join(runDir, 'authored.json'), 'utf8'));
  let authoredExams = {};
  try {
    authoredExams = JSON.parse(await readFile(join(runDir, 'authoredExams.json'), 'utf8'));
  } catch {
    /* pre-exam runs */
  }
  const { buildDeliverableDocxBlob } = await import('../src/lib/exporters/bulkDocxExporter.js');
  const outDir = join(runDir, 'package-docx');
  const written = [];
  const features = [
    ['lessonPlans', 'Lesson Plans', mapLessonPlansData(graph, authored)],
    ['quizBank', 'Quiz & Exam Bank', mapQuizBankData(graph, authored, authoredExams)],
  ];
  for (const [featureId, folder, data] of features) {
    const blob = await buildDeliverableDocxBlob(featureId, data, graph.course.title);
    const dir = join(outDir, folder);
    await mkdir(dir, { recursive: true });
    const file = join(dir, `${folder}.docx`);
    await writeFile(file, Buffer.from(await blob.arrayBuffer()));
    written.push(file);
  }
  return { outDir, written };
}

const runDir = process.argv[2];
if (runDir) {
  const { written } = await writeDocxExports(runDir);
  // Round-trip verification through the grader's own docx parser: if the
  // grader can extract non-trivial text, Word can open it.
  const { extractPackage } = await import('../src/lib/quality/deepQualityGrader.js');
  const { createFsFileProvider } = await import('../src/lib/quality/fsFileProvider.node.js');
  const pkg = await extractPackage(createFsFileProvider(join(runDir, 'package-docx')));
  for (const file of pkg.files) {
    console.log(`${file.path}: kind=${file.kind}, extracted ${file.text.length} chars`);
  }
  console.log(
    `${written.length} docx file(s) written; round-trip ${pkg.files.every((f) => f.text.length > 500) ? 'OK' : 'THIN'}`,
  );
}
