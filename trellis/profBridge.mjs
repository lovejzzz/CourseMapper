#!/usr/bin/env node
// Prof bridge — item 5 of the quality plan.
// Builds the structured-course JSON that Prof's a2 zero-token classroom
// consumes, directly from a Trellis run's graph/authored artifacts — more
// faithful than parsing rendered markdown, because Trellis holds the
// structure natively. Field shapes mirror scripts/prof/buildStructuredPackages.mjs
// (the fixture builder for the current pipeline), so the same instrument
// reads both pipelines — never a Trellis-flattering variant.
//
//   npx vite-node trellis/profBridge.mjs <runDir>
// writes <runDir>/structured.json

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tokenOverlapRatio } from './judgment/text.mjs';

function slug(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export async function buildStructuredFromRun(runDir) {
  const graph = JSON.parse(await readFile(join(runDir, 'graph.json'), 'utf8'));
  const authored = JSON.parse(await readFile(join(runDir, 'authored.json'), 'utf8'));
  let authoredExams = {};
  try {
    authoredExams = JSON.parse(await readFile(join(runDir, 'authoredExams.json'), 'utf8'));
  } catch {
    // Pre-item-6 runs: exams fall back to weekly items only, disclosed below.
  }
  return buildStructured(graph, authored, authoredExams);
}

export function buildStructured(graph, authored, authoredExams = {}) {
  const ordered = [...graph.lessons].sort((a, b) => a.week - b.week || a.session - b.session);
  const conceptById = new Map(graph.concepts.map((c) => [c.id, c]));
  const misconceptionById = new Map(graph.misconceptions.map((m) => [m.id, m]));

  const lessons = ordered.map((lesson, index) => ({
    lesson: index + 1,
    concepts: [...lesson.introduces].slice(0, 6).map((conceptId) => ({
      id: `L${index + 1}:${slug(conceptById.get(conceptId)?.name ?? conceptId)}`,
      term: conceptById.get(conceptId)?.name ?? conceptId,
    })),
    hasStudyGuide: true,
    hasAssignment: true,
    hasLessonPlan: true,
    // Detected from the authored plan itself, never assumed (the same rule
    // the fixture builder applies to compiled plans).
    hasReteachSegment: (authored[lesson.id]?.plan?.segments ?? []).some((seg) => seg.mode === 'reteach'),
  }));

  const conceptIdForItem = (lessonIndex, lesson, item, art, itemIndex) => {
    const lessonConcepts = lessons[lessonIndex].concepts;
    // Prefer the authored item→concept mapping. `concept` is the DURABLE
    // mapping (never withheld); `ref` is the grounding citation (null in zero
    // mode). Reading `concept ?? ref` recovers the ~0.1 battery zero mode lost
    // when nulling `ref` also erased the mapping.
    const claim = (art.claims ?? []).find(
      (c) =>
        String(c.path).startsWith(`quizItems[${itemIndex}]`) &&
        (String(c.concept ?? '').startsWith('kernel:') || String(c.ref ?? '').startsWith('kernel:')),
    );
    if (claim) {
      const mapping = String(claim.concept ?? claim.ref);
      const graphConcept = conceptById.get(mapping.slice('kernel:'.length));
      const match = lessonConcepts.find((c) => c.term === graphConcept?.name);
      if (match) return match;
    }
    // Fall back to best stem-vocabulary overlap.
    let best = lessonConcepts[0] ?? { id: `L${lessonIndex + 1}:unknown`, term: 'unknown' };
    let bestScore = -1;
    for (const concept of lessonConcepts) {
      const score = tokenOverlapRatio(concept.term, item.stem);
      if (score > bestScore) {
        bestScore = score;
        best = concept;
      }
    }
    return best;
  };

  const misconceptionCorrectivesFor = (lesson) =>
    lesson.introduces
      .flatMap((cid) => conceptById.get(cid)?.misconceptionIds ?? [])
      .map((mid) => misconceptionById.get(mid))
      .filter(Boolean);

  const items = [];
  ordered.forEach((lesson, index) => {
    const art = authored[lesson.id];
    if (!art) return;
    const correctives = misconceptionCorrectivesFor(lesson);
    art.quizItems.forEach((item, itemIndex) => {
      const concept = conceptIdForItem(index, lesson, item, art, itemIndex);
      const grounded = correctives.some(
        (m) =>
          tokenOverlapRatio(m.corrective, item.explanation) >= 0.6 ||
          item.explanation.includes(m.corrective.slice(0, 40)),
      );
      items.push({
        itemId: `${lesson.id}-q${itemIndex}`,
        lesson: index + 1,
        conceptId: concept.id,
        conceptTerm: concept.term,
        optionCount: item.options.length,
        difficulty: item.difficulty === 'transfer' ? 'Hard' : item.difficulty === 'apply' ? 'Medium' : 'Easy',
        stem: item.stem,
        options: item.options.map(String),
        answerLetter: 'ABCD'.charAt(item.correctIndex),
        distractorTexts: item.options.filter((_, oi) => oi !== item.correctIndex).map(String),
        explanationText: item.explanation,
        // Grounded = the explanation actually confronts a documented
        // corrective (J3's bar) — the honest analogue of the fixture
        // builder's enrichmentSource flag.
        explanationGrounded: grounded,
        kind: 'weekly',
      });
    });
  });

  // Exams: dedicated authored exam items (item 6), keyed to the exam's week.
  const weekToLessonNumber = new Map(ordered.map((lesson, index) => [lesson.week, index + 1]));
  for (const exam of graph.assessments.filter((a) => a.kindOf === 'exam')) {
    const examItems = authoredExams[exam.id] ?? [];
    const lessonNumber = weekToLessonNumber.get(exam.anchor.week) ?? lessons.length;
    examItems.forEach((item, itemIndex) => {
      const graphConcept = conceptById.get(item.conceptId);
      const structuredConcept =
        lessons.flatMap((l) => l.concepts).find((c) => c.term === graphConcept?.name) ??
        lessons[lessonNumber - 1]?.concepts[0];
      const misconception = (graphConcept?.misconceptionIds ?? [])
        .map((mid) => misconceptionById.get(mid))
        .filter(Boolean)[0];
      const grounded = misconception
        ? tokenOverlapRatio(misconception.corrective, item.explanation) >= 0.6 ||
          item.explanation.includes(misconception.corrective.slice(0, 40))
        : false;
      items.push({
        itemId: `${exam.id}-q${itemIndex}`,
        lesson: lessonNumber,
        conceptId: structuredConcept?.id ?? `L${lessonNumber}:unknown`,
        conceptTerm: structuredConcept?.term ?? item.conceptId,
        optionCount: item.options.length,
        difficulty: item.difficulty === 'transfer' ? 'Hard' : 'Medium',
        stem: item.stem,
        options: item.options.map(String),
        answerLetter: 'ABCD'.charAt(item.correctIndex),
        distractorTexts: item.options.filter((_, oi) => oi !== item.correctIndex).map(String),
        explanationText: item.explanation,
        explanationGrounded: grounded,
        kind: 'exam',
      });
    });
  }

  return { id: 'trellis:in-memory', lessons, items };
}

// vite-node strips the script path from argv, so URL-matching cannot
// detect direct execution — the guard is content-based: argv[2] must be a
// real run directory (the pipeline's import passes 'generate', which fails).
import { existsSync } from 'node:fs';
const candidate = process.argv[2];
const runDir = candidate && existsSync(join(candidate, 'graph.json')) ? candidate : null;
if (runDir) {
  const structured = await buildStructuredFromRun(runDir);
  const out = join(runDir, 'structured.json');
  await writeFile(out, JSON.stringify(structured, null, 2));
  console.log(
    `${out}: ${structured.lessons.length} lessons, ${structured.items.length} items (${structured.items.filter((i) => i.kind === 'exam').length} exam), reteach ${structured.lessons.filter((l) => l.hasReteachSegment).length}/${structured.lessons.length}, grounded ${structured.items.filter((i) => i.explanationGrounded).length}/${structured.items.length}`,
  );
}
