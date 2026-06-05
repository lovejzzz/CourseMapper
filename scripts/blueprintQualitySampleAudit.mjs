#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { createServer } from 'vite';

import { REAL_COURSE_QUALITY_SCENARIOS } from '../tests/lib/realCourseQualityScenarios.js';

const ROOT = process.cwd();
const DEFAULT_OUTPUT_DIR = path.join(ROOT, 'verification-output', 'blueprint-quality-sample-audit');
const SAMPLE_NAMES = [
  'three lesson policy memo studio',
  'large data science lab',
  'online writing workshop',
  'business case method',
  'nursing simulation caution',
];
const SAMPLE_FEATURES = ['lessonPlans', 'assignments', 'rubrics', 'quizBank', 'slideDecks'];
const PASSING_SCORE = 75;

let runtimePromise = null;

async function loadRuntime() {
  if (runtimePromise) return runtimePromise;
  runtimePromise = (async () => {
    const server = await createServer({
      appType: 'custom',
      cacheDir: path.join(ROOT, 'node_modules', '.vite', `blueprint-quality-sample-${process.pid}`),
      logLevel: 'error',
      optimizeDeps: { entries: [], noDiscovery: true },
      server: { middlewareMode: true, hmr: false, ws: false },
    });
    await server.pluginContainer.buildStart({});
    try {
      const [compiler, postProcess, scorer] = await Promise.all([
        server.ssrLoadModule('/src/lib/courseBlueprintCompiler.js'),
        server.ssrLoadModule('/src/lib/deliverablePostProcess.js'),
        server.ssrLoadModule('/src/lib/deliverableQualityScorer.js'),
      ]);
      return { server, compiler, postProcess, scorer };
    } catch (err) {
      await server.close();
      throw err;
    }
  })();
  return runtimePromise;
}

function averageQuality(score) {
  return (score.bloomsAlignment + score.specificity + score.actionability + score.qmAlignment) / 4;
}

function stripLessonPrefix(title = '') {
  return String(title)
    .replace(/^Lesson\s+\d+\s*:\s*/i, '')
    .trim();
}

function jsonText(value) {
  return JSON.stringify(value || {});
}

function countPresentNeedles(text, needles) {
  const lower = text.toLowerCase();
  return needles.filter((needle) => lower.includes(String(needle || '').toLowerCase())).length;
}

function wordCount(value) {
  return (String(value || '').match(/[A-Za-z][A-Za-z'-]*/g) || []).length;
}

function sampleText(value, max = 220) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function collectHumanStyleIssues(featureId, compiled, lessons) {
  const data = compiled[featureId] || {};
  const text = jsonText(data);
  const issues = [];
  const lessonTitles = lessons.map((lesson) => stripLessonPrefix(lesson.title)).filter(Boolean);
  const matchedLessons = countPresentNeedles(text, lessonTitles.slice(0, 6));

  if (lessonTitles.length && matchedLessons === 0) {
    issues.push('does not visibly match sampled lesson titles');
  }
  if (/\b(generic filler|placeholder course|custom_\d+|lorem ipsum)\b/i.test(text)) {
    issues.push('contains placeholder or generic generator language');
  }

  if (featureId === 'assignments') {
    if (!/\b(criteria|rubric|evidence|feedback|revision)\b/i.test(text)) {
      issues.push('assignment lacks visible criteria, evidence, feedback, or revision language');
    }
    if (!/do not invent|approved source|local review|source details/i.test(text)) {
      issues.push('assignment lacks source-use boundary');
    }
  }

  if (featureId === 'rubrics') {
    const rubrics = data.rubrics || [];
    const invalid = rubrics.filter((rubric) => {
      const criteria = rubric.criteria || [];
      const total = criteria.reduce((sum, criterion) => sum + Number(criterion.weight || criterion.wt || 0), 0);
      return criteria.length < 3 || total < 95 || total > 105;
    });
    if (invalid.length) issues.push(`${invalid.length} rubric(s) lack usable criteria or balanced weights`);
  }

  if (featureId === 'quizBank') {
    const rationaleSignals = countPresentNeedles(text, [
      'rationale',
      'because',
      'misconception',
      'feedback',
      'explain',
    ]);
    if (rationaleSignals < 3) issues.push('quiz bank lacks enough rationale or misconception evidence');
  }

  if (featureId === 'slideDecks') {
    const decks = data.decks || [];
    const noteText = decks.flatMap((deck) => deck.slides || []).map((slide) => slide.speakerNotes || slide.notes || '');
    const lowNoteCount = noteText.filter((note) => wordCount(note) > 0 && wordCount(note) < 12).length;
    const titles = decks.map((deck) => deck.title || deck.lessonTitle || '').filter(Boolean);
    if (lowNoteCount > Math.max(1, Math.floor(noteText.length * 0.25))) {
      issues.push('many slide notes are too thin for instructor use');
    }
    if (titles.length > 2 && new Set(titles).size < Math.ceil(titles.length * 0.75)) {
      issues.push('slide deck titles look repetitive');
    }
  }

  if (featureId === 'lessonPlans') {
    const plans = data.lessonPlans || [];
    const unsupported = plans.filter((plan) => !plan.readyToTeachSupport && !(plan.outline || []).length).length;
    if (unsupported) issues.push(`${unsupported} lesson plan(s) lack ready-to-teach support`);
  }

  return {
    issues,
    matchedLessons,
    excerpt: sampleText(text),
  };
}

function scoreLessonPlans(compiled, lessons) {
  const plans = compiled.lessonPlans?.lessonPlans || [];
  const text = jsonText(compiled.lessonPlans);
  const matchedLessons = countPresentNeedles(
    text,
    lessons.map((lesson) => stripLessonPrefix(lesson.title)).slice(0, 6),
  );
  const readySupportCount = plans.filter((plan) => plan.readyToTeachSupport || plan.outline?.length >= 4).length;
  const uniqueOutlines = new Set(plans.map((plan) => jsonText(plan.outline || []).slice(0, 240))).size;
  const matchScore = lessons.length ? Math.min(30, Math.round((matchedLessons / Math.min(lessons.length, 6)) * 30)) : 0;
  const readinessScore = plans.length ? Math.min(25, Math.round((readySupportCount / plans.length) * 25)) : 0;
  const specificityScore = /\b(minutes|checklist|evidence|feedback|revision|assessment)\b/i.test(text) ? 25 : 10;
  const repetitionScore = plans.length <= 1 || uniqueOutlines >= Math.ceil(plans.length * 0.6) ? 20 : 8;
  return {
    score: matchScore + readinessScore + specificityScore + repetitionScore,
    details: `${matchedLessons} lesson titles matched, ${readySupportCount}/${plans.length} plans include ready-to-teach support, ${uniqueOutlines} outline patterns.`,
  };
}

function scoreAssignments(compiled, lessons) {
  const assignments = compiled.assignments?.assignments || [];
  const text = jsonText(compiled.assignments);
  const matchedLessons = countPresentNeedles(
    text,
    lessons.map((lesson) => stripLessonPrefix(lesson.title)).slice(0, 6),
  );
  const rubricSignals = countPresentNeedles(text, ['criteria', 'evidence', 'revision', 'feedback', 'source']);
  const hasNoInventedSourceBoundary = /do not invent|approved source|local review|source details/i.test(text);
  const matchScore = lessons.length ? Math.min(35, Math.round((matchedLessons / Math.min(lessons.length, 6)) * 35)) : 0;
  const criteriaScore = Math.min(35, rubricSignals * 7);
  const actionScore = assignments.length >= Math.min(lessons.length, 3) ? 15 : 5;
  const boundaryScore = hasNoInventedSourceBoundary ? 15 : 0;
  return {
    score: matchScore + criteriaScore + actionScore + boundaryScore,
    details: `${matchedLessons} lesson titles matched, ${rubricSignals} assignment usability signals, source boundary ${hasNoInventedSourceBoundary ? 'present' : 'missing'}.`,
  };
}

function scoreRubrics(compiled) {
  const rubrics = compiled.rubrics?.rubrics || [];
  const usable = rubrics.filter((rubric) => {
    const criteria = rubric.criteria || [];
    const total = criteria.reduce((sum, criterion) => sum + Number(criterion.weight || criterion.wt || 0), 0);
    return criteria.length >= 3 && total >= 95 && total <= 105;
  });
  const calibrationText = jsonText(compiled.rubrics);
  const calibrationSignals = countPresentNeedles(calibrationText, ['calibration', 'evidence', 'feedback', 'criterion']);
  return {
    score:
      (rubrics.length ? Math.round((usable.length / rubrics.length) * 70) : 0) + Math.min(30, calibrationSignals * 8),
    details: `${usable.length}/${rubrics.length} rubrics have usable criteria and balanced weights; ${calibrationSignals} calibration signals.`,
  };
}

function scoreQuizBank(compiled, lessons) {
  const quizzes = compiled.quizBank?.quizzes || [];
  const text = jsonText(compiled.quizBank);
  const rationaleSignals = countPresentNeedles(text, ['rationale', 'because', 'misconception', 'feedback', 'explain']);
  const matchedLessons = countPresentNeedles(
    text,
    lessons.map((lesson) => stripLessonPrefix(lesson.title)).slice(0, 6),
  );
  return {
    score:
      (quizzes.length ? Math.round((quizzes.length / Math.max(lessons.length, 1)) * 35) : 0) +
      Math.min(40, rationaleSignals * 8) +
      (lessons.length ? Math.min(25, Math.round((matchedLessons / Math.min(lessons.length, 6)) * 25)) : 0),
    details: `${quizzes.length}/${lessons.length} lesson quiz groups, ${rationaleSignals} rationale signals, ${matchedLessons} lesson titles matched.`,
  };
}

function scoreSlideDecks(compiled, lessons) {
  const decks = compiled.slideDecks?.decks || [];
  const text = jsonText(compiled.slideDecks);
  const notesSignals = countPresentNeedles(text, ['speaker', 'notes', 'activity', 'evidence', 'discussion', 'check']);
  const titles = decks.map((deck) => deck.title || deck.lessonTitle || '').filter(Boolean);
  const uniqueTitles = new Set(titles).size;
  return {
    score:
      (decks.length ? Math.round((decks.length / Math.max(lessons.length, 1)) * 35) : 0) +
      Math.min(40, notesSignals * 7) +
      (titles.length <= 1 || uniqueTitles >= Math.ceil(titles.length * 0.75) ? 25 : 8),
    details: `${decks.length}/${lessons.length} decks, ${notesSignals} teaching-note signals, ${uniqueTitles} unique titles.`,
  };
}

const FEATURE_AUDITORS = {
  lessonPlans: scoreLessonPlans,
  assignments: scoreAssignments,
  rubrics: scoreRubrics,
  quizBank: scoreQuizBank,
  slideDecks: scoreSlideDecks,
};

async function auditScenario(scenario, runtime) {
  const { compiler, postProcess, scorer } = runtime;
  const compilerOptions = {
    customDeliverables: scenario.customDeliverables,
    configMap: {
      courseFaq: { questionsPerLesson: 5 },
    },
  };
  const featureIds = SAMPLE_FEATURES.filter((featureId) => scenario.featureIds.includes(featureId));
  const storedBlueprint = JSON.parse(
    JSON.stringify(compiler.buildCourseBlueprint(scenario.courseMap, compilerOptions)),
  );
  const compiled = compiler.compileBlueprintDeliverables(storedBlueprint, featureIds, compilerOptions);
  const lessons = storedBlueprint.lessons || [];
  const featureRows = [];

  for (const featureId of featureIds) {
    const validation = postProcess.validateDeliverableGeneration(featureId, compiled[featureId], {
      expectedLessonCount: lessons.length,
      config: compilerOptions.configMap[featureId] || {},
    });
    const heuristic = scorer.scoreHeuristic(featureId, compiled[featureId]);
    const qualityAverage = averageQuality(heuristic);
    const audit = FEATURE_AUDITORS[featureId]?.(compiled, lessons) || {
      score: Math.round(qualityAverage * 10),
      details: 'Generic heuristic score only.',
    };
    const humanReview = collectHumanStyleIssues(featureId, compiled, lessons);
    const score = Math.max(
      0,
      Math.round(audit.score * 0.7 + qualityAverage * 10 * 0.3) - humanReview.issues.length * 10,
    );
    featureRows.push({
      featureId,
      score,
      valid: validation.valid,
      qualityAverage,
      details: audit.details,
      humanReview,
      blockers: validation.blockers || [],
    });
  }

  const scenarioScore = Math.round(
    featureRows.reduce((sum, row) => sum + row.score, 0) / Math.max(featureRows.length, 1),
  );
  return {
    name: scenario.name,
    lessonCount: lessons.length,
    status:
      scenarioScore >= PASSING_SCORE && featureRows.every((row) => row.valid && row.humanReview.issues.length === 0)
        ? 'pass'
        : 'fail',
    score: scenarioScore,
    featureRows,
  };
}

function buildReport(results) {
  const failures = results.flatMap((result) =>
    result.featureRows
      .filter((row) => !row.valid || row.score < PASSING_SCORE || row.humanReview.issues.length)
      .map(
        (row) =>
          `${result.name} / ${row.featureId}: score ${row.score}; ${[...row.blockers, ...row.humanReview.issues].join(
            '; ',
          )}`,
      ),
  );
  const average = Math.round(results.reduce((sum, result) => sum + result.score, 0) / Math.max(results.length, 1));
  const lines = [
    '# Blueprint Quality Sample Audit',
    '',
    `Generated: ${new Date().toISOString()}`,
    `Sample scenarios: ${results.length}`,
    `Average score: ${average}`,
    `Status: ${failures.length ? 'fail' : 'pass'}`,
    '',
    '## Scenario Scores',
    '',
    '| Scenario | Lessons | Score | Status |',
    '| --- | ---: | ---: | --- |',
    ...results.map((result) => `| ${result.name} | ${result.lessonCount} | ${result.score} | ${result.status} |`),
    '',
    '## Feature Evidence',
    '',
  ];

  for (const result of results) {
    lines.push(`### ${result.name}`, '');
    for (const row of result.featureRows) {
      lines.push(
        `- ${row.featureId}: score ${row.score}; structural validation ${row.valid ? 'passed' : 'failed'}; heuristic ${row.qualityAverage.toFixed(1)}. ${row.details} Human review: ${row.humanReview.issues.length ? row.humanReview.issues.join('; ') : 'no issues'}.`,
      );
      lines.push(`  Evidence excerpt: ${row.humanReview.excerpt}`);
      if (row.blockers.length) {
        lines.push(`  Blockers: ${row.blockers.join('; ')}`);
      }
    }
    lines.push('');
  }

  if (failures.length) {
    lines.push('## Failures', '', ...failures.map((failure) => `- ${failure}`), '');
  }

  return { markdown: `${lines.join('\n').trim()}\n`, failures, average };
}

async function main() {
  const runtime = await loadRuntime();
  try {
    const sample = REAL_COURSE_QUALITY_SCENARIOS.filter((scenario) => SAMPLE_NAMES.includes(scenario.name));
    const results = [];
    for (const scenario of sample) {
      results.push(await auditScenario(scenario, runtime));
    }

    const report = buildReport(results);
    await fs.mkdir(DEFAULT_OUTPUT_DIR, { recursive: true });
    await fs.writeFile(path.join(DEFAULT_OUTPUT_DIR, 'latest.md'), report.markdown);
    await fs.writeFile(path.join(DEFAULT_OUTPUT_DIR, 'latest.json'), JSON.stringify({ results }, null, 2));

    console.log(`Blueprint quality sample audit: ${report.failures.length ? 'fail' : 'pass'}`);
    console.log(`Average score: ${report.average}`);
    console.log(`Report: ${path.join(DEFAULT_OUTPUT_DIR, 'latest.md')}`);

    if (report.failures.length) {
      for (const failure of report.failures) console.error(`- ${failure}`);
      process.exitCode = 1;
    }
  } finally {
    await runtime.server.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
