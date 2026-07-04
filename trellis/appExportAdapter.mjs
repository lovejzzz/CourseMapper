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

// ── v0.1.2 slice 2: the remaining printable features ────────────────────────

export function mapStudyGuidesData(graph, authored) {
  const guides = orderedLessons(graph).map((lesson, index) => ({
    lessonTitle: `Lesson ${index + 1}: ${lesson.title} — Study Guide`,
    summary: authored[lesson.id].studyGuideSection,
  }));
  return { guides };
}

export function mapDiscussionsData(graph, authored) {
  const discussions = orderedLessons(graph).map((lesson, index) => {
    const d = authored[lesson.id].discussion;
    return {
      lessonTitle: `Lesson ${index + 1}: ${lesson.title} — Discussion`,
      prompt: d.prompt,
      context: d.tension,
      followUpProbes: d.followUps,
    };
  });
  return { discussions };
}

export function mapAssignmentsData(graph, authored) {
  const outcomesById = new Map(graph.outcomes.map((o) => [o.id, o]));
  const assignments = orderedLessons(graph).map((lesson, index) => {
    const a = authored[lesson.id].assignment;
    return {
      title: `Lesson ${index + 1}: ${lesson.title} — Assignment`,
      overview: a.task,
      instructions: a.steps,
      objectives: lesson.outcomeIds.map((id) => outcomesById.get(id)?.statement).filter(Boolean),
    };
  });
  return { assignments };
}

export function mapSyllabusData(graph, courseWide) {
  return {
    syllabus: {
      courseDescription: courseWide?.courseDescription ?? `${graph.course.title} (${graph.course.subject}).`,
      meetingPattern: `${graph.course.sessionsPerWeek} session(s)/week × ${graph.course.weeks} weeks`,
      learningOutcomes: graph.outcomes.map((o) => o.statement),
      courseRequirements: graph.assessments.map((a) => ({
        component: a.registryKey,
        weight: `${a.weightPct}%`,
      })),
    },
  };
}

export function mapCourseFaqData(graph, authored, courseWide) {
  const faqs = orderedLessons(graph)
    .map((lesson, index) => ({
      lessonTitle: `Lesson ${index + 1}: ${lesson.title}`,
      questions: (authored[lesson.id].faqEntries ?? []).map((entry) => ({ question: entry.q, answer: entry.a })),
    }))
    .filter((lesson) => lesson.questions.length > 0);
  if (courseWide?.logisticsFaq?.length) {
    faqs.unshift({
      lessonTitle: 'Course Logistics',
      questions: courseWide.logisticsFaq.map((entry) => ({ question: entry.q, answer: entry.a })),
    });
  }
  return { faqs };
}

export function mapSlideDecksData(graph, authored) {
  const decks = orderedLessons(graph).map((lesson, index) => ({
    lessonTitle: `Lesson ${index + 1}: ${lesson.title}`,
    slides: authored[lesson.id].slides.map((slide) => ({
      title: slide.title,
      bullets: slide.bullets,
      speakerNotes: slide.speakerNotes,
      altText: slide.altText,
    })),
  }));
  return { decks };
}

async function loadRun(runDir) {
  const graph = JSON.parse(await readFile(join(runDir, 'graph.json'), 'utf8'));
  const authored = JSON.parse(await readFile(join(runDir, 'authored.json'), 'utf8'));
  let authoredExams = {};
  let courseWide = null;
  try {
    authoredExams = JSON.parse(await readFile(join(runDir, 'authoredExams.json'), 'utf8'));
  } catch {
    /* pre-exam runs */
  }
  try {
    courseWide = JSON.parse(await readFile(join(runDir, 'courseWide.json'), 'utf8'));
  } catch {
    /* pre-course-wide runs */
  }
  return { graph, authored, authoredExams, courseWide };
}

export async function writeDocxExports(runDir) {
  const { graph, authored, authoredExams, courseWide } = await loadRun(runDir);
  const { buildDeliverableDocxBlob } = await import('../src/lib/exporters/bulkDocxExporter.js');
  const outDir = join(runDir, 'package-docx');
  const written = [];
  const features = [
    ['lessonPlans', 'Lesson Plans', mapLessonPlansData(graph, authored)],
    ['quizBank', 'Quiz & Exam Bank', mapQuizBankData(graph, authored, authoredExams)],
    ['studyGuides', 'Study Guides', mapStudyGuidesData(graph, authored)],
    ['discussions', 'Discussion Questions', mapDiscussionsData(graph, authored)],
    ['assignments', 'Assignments', mapAssignmentsData(graph, authored)],
    ['syllabus', 'Syllabus', mapSyllabusData(graph, courseWide)],
    ['courseFaq', 'Course FAQ', mapCourseFaqData(graph, authored, courseWide)],
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

// Real PPTX per lesson deck through the app's own builder (heuristic
// text-fit tier is headless-safe — the v0.15.1 lesson).
export async function writePptxExports(runDir) {
  const { graph, authored } = await loadRun(runDir);
  const { buildSingleDeckPptxBlob } = await import('../src/lib/exporters/pptxExporter.js');
  const { decks } = mapSlideDecksData(graph, authored);
  const dir = join(runDir, 'package-docx', 'Slide Decks');
  await mkdir(dir, { recursive: true });
  const written = [];
  for (const [index, deck] of decks.entries()) {
    const blob = await buildSingleDeckPptxBlob(deck, index, graph.course.title, 0);
    const file = join(dir, `${deck.lessonTitle.replace(/[:/\\]/g, ' -')}.pptx`);
    await writeFile(file, Buffer.from(await blob.arrayBuffer()));
    written.push(file);
  }
  return { written };
}

// CLI — guarded so importing this module never runs it (the profBridge
// lesson). vite-node STRIPS the script path from argv, so URL-matching
// cannot detect direct execution; the guard is content-based instead:
// argv[2] must be a real run directory (the pipeline's own import passes
// 'generate' here, which fails this test — that bug class stays dead).
import { existsSync } from 'node:fs';
const candidate = process.argv[2];
const runDir = candidate && existsSync(join(candidate, 'graph.json')) ? candidate : null;
if (runDir) {
  const { written } = await writeDocxExports(runDir);
  const pptx = await writePptxExports(runDir);
  // Round-trip verification through the grader's own docx/pptx parsers: if
  // the grader can extract non-trivial text, Office can open it.
  const { extractPackage } = await import('../src/lib/quality/deepQualityGrader.js');
  const { createFsFileProvider } = await import('../src/lib/quality/fsFileProvider.node.js');
  const pkg = await extractPackage(createFsFileProvider(join(runDir, 'package-docx')));
  for (const file of pkg.files) {
    console.log(`${file.path}: kind=${file.kind}, extracted ${file.text.length} chars`);
  }
  const office = written.length + pptx.written.length;
  console.log(
    `${office} Office file(s) written (${written.length} docx + ${pptx.written.length} pptx); round-trip ${pkg.files.every((f) => f.text.length > 300) ? 'OK' : 'THIN'}`,
  );
}
