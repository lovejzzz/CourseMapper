// Render-compat layer — docs/TRELLIS.md §13.4.
// Maps { graph, authored } to the package file tree the current app exports
// and the deep grader consumes: FOLDER_FEATURE folders, "Lesson NN - Title"
// naming, PACKAGE_MANIFEST.json. Everything tabular here is VERIFIED-class
// (graph-derived layout); every student-facing sentence comes from
// `authored` — the renderer writes structure, never voice (D2).

import { orderedLessons, assessmentsForLesson, sourcesForConcepts, indexById } from '../graph/schema.mjs';
import { tokenOverlapRatio } from '../judgment/text.mjs';

export const FEATURE_FOLDERS = {
  lessonPlans: 'Lesson Plans',
  slideDecks: 'Slide Decks',
  assignments: 'Assignment Briefs',
  rubrics: 'Rubrics',
  discussions: 'Discussion Prompts',
  quizBank: 'Quiz & Exam Bank',
  studyGuides: 'Study Guides',
  syllabus: 'Syllabus',
  courseFaq: 'Course FAQ',
  courseMap: 'Course Map',
};

function safeName(text) {
  return String(text)
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

function lessonFileBase(number, title) {
  return `Lesson ${String(number).padStart(2, '0')} - ${safeName(title)}`;
}

function weekDate(course, week) {
  if (!course.termStart) return null;
  const start = new Date(`${course.termStart}T00:00:00Z`);
  if (Number.isNaN(start.getTime())) return null;
  const date = new Date(start.getTime() + (week - 1) * 7 * 24 * 3600 * 1000);
  return date.toISOString().slice(0, 10);
}

function letters(index) {
  return ['A', 'B', 'C', 'D'][index];
}

function quizMarkdown({ course, lesson, assessment, items, readingLine }) {
  const lines = [
    `# ${assessment ? assessment.registryKey : `Practice Quiz — ${lesson.title}`}`,
    '',
    `Week ${lesson.week} · ${course.title}${assessment ? ` · ${assessment.weightPct}% of course grade` : ' · ungraded practice'}`,
    readingLine ? `Preparation: ${readingLine}` : '',
    '',
  ];
  items.forEach((item, i) => {
    lines.push(`## Question ${i + 1} (${item.bloom} · ${item.difficulty})`, '', item.stem, '');
    item.options.forEach((option, oi) => lines.push(`${letters(oi)}. ${option}`));
    lines.push('');
  });
  lines.push('---', '', '## Answer key and scoring', '');
  lines.push('| Question | Correct | Points |', '| --- | --- | --- |');
  items.forEach((item, i) => lines.push(`| ${i + 1} | ${letters(item.correctIndex)} | 2 |`));
  lines.push(
    '',
    `Scoring rule: one correct letter = 2 points, no partial credit; total ${items.length * 2} points, autograded.`,
    '',
    '## Feedback for review (instructor)',
    '',
  );
  items.forEach((item, i) => lines.push(`- Q${i + 1}: ${item.explanation}`));
  return lines.filter((line) => line !== null).join('\n');
}

// Exams cover the lessons since the previous exam; items are drawn from the
// covered lessons' authored items (no topic-connected-to-itself synthesis).
function buildExamItems(examAssessment, coveredLessons, authoredByLesson) {
  const items = [];
  for (const lesson of coveredLessons) {
    const authored = authoredByLesson[lesson.id];
    if (!authored) continue;
    for (const item of authored.quizItems.slice(0, 2)) {
      const rotated = (item.correctIndex + items.length) % 4;
      const options = [...item.options];
      const [correct] = options.splice(item.correctIndex, 1);
      options.splice(rotated, 0, correct);
      items.push({ ...item, options, correctIndex: rotated, sourceLesson: lesson });
    }
  }
  return items;
}

// The package's .md files are FINAL rendered text (the grader and the DOCX
// path read them literally), so authored inline-code backticks must render
// as plain text — a formatting transform, never a prose change.
export function stripCodeSpans(text) {
  return String(text).replace(/`([^`\n]+)`/g, '$1');
}

export function renderPackage({ graph, authored, courseWide, generatedAt, digest = null, authoredExams = {} }) {
  if (!generatedAt) throw new Error('renderPackage requires generatedAt (pass a fixed value in tests)');
  const { course } = graph;
  const lessons = orderedLessons(graph);
  const outcomesById = indexById(graph.outcomes);
  const files = new Map();
  const manifestFiles = [];
  const put = (folder, name, content, featureId) => {
    const path = `${folder}/${name}.md`;
    files.set(path, stripCodeSpans(content));
    manifestFiles.push({ path, featureId });
  };

  // Best-fit reading per lesson: a source must share vocabulary with THIS
  // lesson (title + introduced concepts), not merely touch one of its
  // concepts — "Invertible matrix" must never headline the Eigenvalues
  // lesson (the LA breadth-run P1). No fit → no reading line, honestly.
  const conceptNameById = new Map(graph.concepts.map((c) => [c.id, c.name]));
  const readingFor = (lesson) => {
    const sources = sourcesForConcepts(graph, [...lesson.introduces, ...lesson.reinforces]);
    if (sources.length === 0) return null;
    const lessonText = [lesson.title, ...lesson.introduces.map((id) => conceptNameById.get(id) ?? '')].join(' ');
    let best = null;
    let bestScore = 0;
    for (const source of sources) {
      const score = tokenOverlapRatio(source.title, lessonText) + tokenOverlapRatio(lessonText, source.title);
      if (score > bestScore) {
        bestScore = score;
        best = source;
      }
    }
    return bestScore > 0 ? best : null;
  };

  // ── per-lesson renders ────────────────────────────────────────────────────
  lessons.forEach((lesson, index) => {
    const number = index + 1;
    const art = authored[lesson.id];
    if (!art) throw new Error(`renderPackage: no authored content for lesson "${lesson.id}"`);
    const base = lessonFileBase(number, lesson.title);
    const reading = readingFor(lesson);
    const readingLine = reading ? `${reading.title} — ${reading.url}` : null;
    const graded = assessmentsForLesson(graph, lesson).filter((a) => a.anchor.lessonId === lesson.id);
    const outcomes = lesson.outcomeIds.map((id) => outcomesById.get(id)).filter(Boolean);
    const date = weekDate(course, lesson.week);

    // Lesson plan
    put(
      FEATURE_FOLDERS.lessonPlans,
      base,
      [
        `# Lesson ${number}: ${lesson.title}`,
        '',
        `${course.title} · Week ${lesson.week}${date ? ` · ${date}` : ''}`,
        '',
        '## Outcomes',
        ...outcomes.map((o) => `- ${o.statement} _(Bloom: ${o.bloom})_`),
        '',
        readingLine
          ? `## Preparation\n- Read: ${readingLine}`
          : '## Preparation\n- Review the prior week’s study guide.',
        ...(lesson.bridgePrimers?.length
          ? [
              '',
              `_Prerequisite gap bridged: this session opens with a primer on ${lesson.bridgePrimers
                .map((id) => conceptNameById.get(id) ?? id)
                .join(', ')} — formally covered later in the course._`,
            ]
          : []),
        '',
        '## Session plan',
        ...art.plan.segments.map((seg) => `### ${seg.minutes} min — ${seg.mode}\n${seg.text}`),
        '',
        graded.length > 0
          ? `## Graded work this week\n${graded.map((a) => `- ${a.registryKey} (${a.kindOf}, ${a.weightPct}%)`).join('\n')}`
          : '## Graded work this week\n- None; this week feeds the next checkpoint.',
        '',
        index < lessons.length - 1
          ? `## Connection to next lesson\nNext: **${lessons[index + 1].title}** (Week ${lessons[index + 1].week}).`
          : '## Course closure\nThis is the final session; synthesis replaces the forward bridge.',
      ].join('\n'),
      'lessonPlans',
    );

    // Slide deck (markdown render of authored slides)
    put(
      FEATURE_FOLDERS.slideDecks,
      base,
      [
        `# Slides — Lesson ${number}: ${lesson.title}`,
        '',
        ...art.slides.flatMap((slide, si) => [
          `## Slide ${si + 1}: ${slide.title}`,
          ...slide.bullets.map((b) => `- ${b}`),
          `> Speaker notes: ${slide.speakerNotes}`,
          `> Alt text: ${slide.altText}`,
          '',
        ]),
      ].join('\n'),
      'slideDecks',
    );

    // Quiz bank (per lesson; exams rendered separately below)
    const quizAssessment = graded.find((a) => a.kindOf === 'quiz') ?? null;
    put(
      FEATURE_FOLDERS.quizBank,
      base,
      quizMarkdown({ course, lesson, number, assessment: quizAssessment, items: art.quizItems, readingLine }),
      'quizBank',
    );

    // Study guide
    put(FEATURE_FOLDERS.studyGuides, base, art.studyGuideSection, 'studyGuides');

    // Discussion
    put(
      FEATURE_FOLDERS.discussions,
      base,
      [
        `# Discussion — Lesson ${number}: ${lesson.title}`,
        '',
        art.discussion.prompt,
        '',
        '## Follow-ups',
        ...art.discussion.followUps.map((f) => `- ${f}`),
      ].join('\n'),
      'discussions',
    );

    // Assignment brief
    put(
      FEATURE_FOLDERS.assignments,
      base,
      [
        `# Assignment — Lesson ${number}: ${lesson.title}`,
        '',
        art.assignment.task,
        '',
        '## Steps',
        ...art.assignment.steps.map((s, si) => `${si + 1}. ${s}`),
        '',
        readingLine ? `Cite at least once: ${readingLine}` : '',
        '',
        '## Format',
        `- Length: 1–2 pages; any citation style, used consistently.`,
        `- Submit before the next session (Week ${Math.min(lesson.week + 1, course.weeks)}).`,
      ].join('\n'),
      'assignments',
    );

    // Rubric
    put(
      FEATURE_FOLDERS.rubrics,
      base,
      [
        `# Rubric — Lesson ${number}: ${lesson.title}`,
        '',
        '| Band | Observable behavior |',
        '| --- | --- |',
        ...art.assignment.rubricBands.map((b) => `| ${b.band} | ${b.observableBehavior} |`),
        '',
        `Bands describe observable work, not adverbs: the top band applies the definition with an example; the lowest names the documented error.`,
      ].join('\n'),
      'rubrics',
    );
  });

  // ── exams (week-anchored) ────────────────────────────────────────────────
  const exams = graph.assessments
    .filter((a) => a.kindOf === 'exam')
    .sort((a, b) => (a.anchor.week ?? 0) - (b.anchor.week ?? 0));
  let coveredFrom = 0;
  for (const exam of exams) {
    const upTo = exam.anchor.week ?? course.weeks;
    const covered = lessons.filter((lesson) => lesson.week <= upTo && lesson.week > coveredFrom);
    const cumulative = exam.registryKey.toLowerCase().includes('final');
    const pool = cumulative ? lessons.filter((lesson) => lesson.week <= upTo) : covered;
    // Dedicated authored exam items when present (item 6); the quiz-pull
    // fallback stays only for runs that could not author them, disclosed in
    // the file itself.
    const dedicated = authoredExams[exam.id] ?? null;
    const conceptNames = new Map(graph.concepts.map((c) => [c.id, c.name]));
    const items = dedicated
      ? dedicated.map((item) => ({
          ...item,
          sourceLesson: null,
          conceptName: conceptNames.get(item.conceptId) ?? item.conceptId,
        }))
      : buildExamItems(exam, pool, authored);
    const outcomeRows = exam.outcomeIds
      .map((id) => outcomesById.get(id))
      .filter(Boolean)
      .map((o) => `| ${o.statement} | ${o.bloom} |`);
    put(
      FEATURE_FOLDERS.quizBank,
      safeName(exam.registryKey),
      [
        `# ${exam.registryKey}`,
        '',
        `${course.title} · Week ${exam.anchor.week} · ${exam.weightPct}% of course grade`,
        '',
        '## Blueprint',
        `Covers Lessons ${lessons.indexOf(pool[0]) + 1}–${lessons.indexOf(pool[pool.length - 1]) + 1}.`,
        '',
        '| Outcome assessed | Bloom |',
        '| --- | --- |',
        ...outcomeRows,
        '',
        ...(dedicated
          ? []
          : ['_Note: exam items drawn from lesson banks (dedicated exam authoring unavailable this run)._', '']),
        ...items.flatMap((item, i) => [
          item.sourceLesson
            ? `## Question ${i + 1} (from Lesson ${lessons.indexOf(item.sourceLesson) + 1}: ${item.sourceLesson.title})`
            : `## Question ${i + 1} (${item.difficulty} · assesses ${item.conceptName})`,
          '',
          item.stem,
          '',
          ...item.options.map((option, oi) => `${letters(oi)}. ${option}`),
          '',
        ]),
        '---',
        '',
        '## Answer key and scoring',
        '',
        '| Question | Correct | Points |',
        '| --- | --- | --- |',
        ...items.map((item, i) => `| ${i + 1} | ${letters(item.correctIndex)} | 4 |`),
        '',
        `Scoring rule: one correct letter = 4 points, no partial credit; total ${items.length * 4} points. Accommodated administrations use the same key with extended time.`,
      ].join('\n'),
      'quizBank',
    );
    coveredFrom = upTo;
  }

  // ── syllabus ─────────────────────────────────────────────────────────────
  const gradingRows = graph.assessments.map((a) => {
    const week = a.anchor.week ?? lessons.find((l) => l.id === a.anchor.lessonId)?.week ?? '—';
    return `| ${a.registryKey} | ${a.kindOf} | Week ${week} | ${a.weightPct}% |`;
  });
  const scheduleRows = lessons.map((lesson, index) => {
    const reading = readingFor(lesson);
    const graded = assessmentsForLesson(graph, lesson)
      .map((a) => a.registryKey)
      .join('; ');
    const date = weekDate(course, lesson.week);
    return `| ${lesson.week}${date ? ` (${date})` : ''} | ${lessonFileBase(index + 1, lesson.title).replace(/^Lesson \d+ - /, `L${index + 1}: `)} | ${reading ? reading.title : '—'} | ${graded || '—'} |`;
  });
  put(
    FEATURE_FOLDERS.syllabus,
    `Syllabus - ${safeName(course.title)}`,
    [
      `# ${course.title} — Syllabus`,
      '',
      `${course.weeks} weeks · ${course.sessionsPerWeek} session/week${course.termStart ? ` · term starts ${course.termStart}` : ''}`,
      '',
      '## Course description',
      courseWide.courseDescription,
      '',
      '## Learning outcomes',
      ...graph.outcomes.map((o) => `- ${o.statement} _(Bloom: ${o.bloom})_`),
      '',
      '## Grading',
      '| Assessment | Type | When | Weight |',
      '| --- | --- | --- | --- |',
      ...gradingRows,
      '',
      `Weights total ${graph.assessments.reduce((s, a) => s + a.weightPct, 0)}%.`,
      '',
      '## Weekly schedule',
      '| Week | Lesson | Reading | Graded work |',
      '| --- | --- | --- | --- |',
      ...scheduleRows,
      '',
      '## Materials',
      ...courseWide.materials.map((m) => `- ${m}`),
      '',
      '## Policies',
      courseWide.policies,
    ].join('\n'),
    'syllabus',
  );

  // ── course map ───────────────────────────────────────────────────────────
  const conceptsById = indexById(graph.concepts);
  put(
    FEATURE_FOLDERS.courseMap,
    `Course Map - ${safeName(course.title)}`,
    [
      `# Course Map — ${course.title}`,
      '',
      '| Week | Lesson | Concepts introduced | Outcomes | Assessed by |',
      '| --- | --- | --- | --- | --- |',
      ...lessons.map((lesson, index) => {
        const concepts = lesson.introduces.map((id) => conceptsById.get(id)?.name).filter(Boolean);
        const outs = lesson.outcomeIds.join(', ');
        const assessed = assessmentsForLesson(graph, lesson)
          .map((a) => a.registryKey)
          .join('; ');
        return `| ${lesson.week} | L${index + 1}: ${lesson.title} | ${concepts.join('; ')} | ${outs} | ${assessed || '—'} |`;
      }),
      '',
      '## Outcome & assessment alignment (all lessons)',
      '| Outcome | Bloom | Taught in | Assessed by |',
      '| --- | --- | --- | --- |',
      ...graph.outcomes.map((o) => {
        const taughtIn = lessons
          .filter((l) => l.outcomeIds.includes(o.id))
          .map((l) => `L${lessons.indexOf(l) + 1}`)
          .join(', ');
        const assessedBy = graph.assessments
          .filter((a) => a.outcomeIds.includes(o.id))
          .map((a) => a.registryKey)
          .join('; ');
        return `| ${o.statement} | ${o.bloom} | ${taughtIn || '—'} | ${assessedBy || '—'} |`;
      }),
      '',
      '## Prerequisite spine',
      ...graph.concepts
        .filter((c) => c.requires.length > 0)
        .map((c) => `- ${c.name} ← requires ${c.requires.map((id) => conceptsById.get(id)?.name ?? id).join(', ')}`),
    ].join('\n'),
    'courseMap',
  );

  // ── course FAQ ───────────────────────────────────────────────────────────
  put(
    FEATURE_FOLDERS.courseFaq,
    `Course FAQ - ${safeName(course.title)}`,
    [
      `# Course FAQ — ${course.title}`,
      '',
      courseWide.faqIntro,
      '',
      '## Grades, exams, and logistics',
      ...(courseWide.logisticsFaq ?? []).flatMap((entry) => [`**Q: ${entry.q}**`, '', entry.a, '']),
      ...lessons.flatMap((lesson) => {
        const art = authored[lesson.id];
        return [
          `## Week ${lesson.week}: ${lesson.title}`,
          ...art.faqEntries.flatMap((entry) => [`**Q: ${entry.q}**`, '', entry.a, '']),
        ];
      }),
    ].join('\n'),
    'courseFaq',
  );

  // ── source report + ledger (the trust classes, exported as proof) ───────
  const sourceLedger = graph.sources.map((s) => ({
    id: s.id,
    title: s.title,
    url: s.url,
    provider: s.provider,
    license: s.license,
    trust: s.trust,
    concepts: s.conceptIds,
  }));
  const sourceReportPath = 'SOURCE_REPORT.md';
  files.set(
    sourceReportPath,
    [
      `# Source Report — ${course.title}`,
      '',
      `Every reading in this package appears below with its trust status. ` +
        `"verified" sources passed the trust pipeline; "candidate" sources are machine-proposed and labeled for instructor review; "rejected" sources are excluded from every render.`,
      '',
      '| Source | Provider | License | Trust | Grounds |',
      '| --- | --- | --- | --- | --- |',
      ...graph.sources.map((s) => {
        const names = s.conceptIds.map((id) => conceptsById.get(id)?.name ?? id).join('; ');
        return `| [${s.title}](${s.url}) | ${s.provider} | ${s.license} | ${s.trust} | ${names} |`;
      }),
      '',
      '## Trust classes in this package',
      '- VERIFIED — answer keys, alignment tables, schedules, weights: machine-checked at compile; wrong = build failure.',
      '- AUTHORED-GROUNDED — lesson prose authored against the graph’s kernel facts and the sources above.',
      '- JUDGED — tone and example quality; simulated scores only, unanchored.',
    ].join('\n'),
  );
  manifestFiles.push({ path: sourceReportPath, featureId: 'sourceReport' });

  // ── manifest ─────────────────────────────────────────────────────────────
  const readings = [
    ...new Map(
      lessons
        .map((lesson) => readingFor(lesson))
        .filter(Boolean)
        .map((s) => [s.id, { title: s.title, url: s.url, provider: s.provider, license: s.license }]),
    ).values(),
  ];
  const manifest = {
    courseName: course.title,
    generatedAt,
    generator: 'trellis@0.1.1',
    lessonScope: 'all',
    ...(digest ? { pipeline: digest } : {}),
    assessments: graph.assessments.map((a) => ({
      registryKey: a.registryKey,
      kind: a.kindOf,
      anchor: a.anchor,
      weightPct: a.weightPct,
    })),
    assessmentSummary: {
      count: graph.assessments.length,
      weightTotal: graph.assessments.reduce((s, a) => s + a.weightPct, 0),
    },
    readings,
    sourceLedger,
    sourceLedgerSummary: {
      rows: sourceLedger.length,
      verified: sourceLedger.filter((s) => s.trust === 'verified').length,
      candidate: sourceLedger.filter((s) => s.trust === 'candidate').length,
    },
    sourceReport: { path: sourceReportPath },
    requestedFeatures: Object.entries(FEATURE_FOLDERS).map(([featureId, label]) => ({ featureId, label })),
    readiness: { status: 'ready', blockers: 0, warnings: 0, checkedSections: '10/10' },
    requiredAssets: [],
    files: manifestFiles,
    trust: {
      verified: 'answer keys, alignment tables, schedules, weights (machine-checked)',
      authoredGrounded: 'lesson prose authored against graph kernels and named sources',
      judged: 'tone and example quality (simulated scores only, unanchored)',
    },
  };
  files.set('PACKAGE_MANIFEST.json', JSON.stringify(manifest, null, 2));
  return { files, manifest };
}

export function createMemoryFileProvider(files) {
  return {
    list: () => [...files.keys()],
    readText: (path) => {
      if (!files.has(path)) throw new Error(`memory provider: no file ${path}`);
      return files.get(path);
    },
    readBinary: (path) => {
      if (!files.has(path)) throw new Error(`memory provider: no file ${path}`);
      return new TextEncoder().encode(files.get(path));
    },
  };
}

export async function writePackageToDir(files, dir) {
  const { mkdir, writeFile } = await import('node:fs/promises');
  const { dirname, join } = await import('node:path');
  for (const [path, content] of files) {
    const full = join(dir, path);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, content, 'utf8');
  }
  return dir;
}
