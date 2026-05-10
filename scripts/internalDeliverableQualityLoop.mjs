#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import assignments from '../src/lib/prompts/assignments.js';
import courseFaq from '../src/lib/prompts/courseFaq.js';
import discussions from '../src/lib/prompts/discussions.js';
import lessonPlans from '../src/lib/prompts/lessonPlans.js';
import quizBank from '../src/lib/prompts/quizBank.js';
import rubrics from '../src/lib/prompts/rubrics.js';
import slideDecks from '../src/lib/prompts/slideDecks.js';
import studyGuides from '../src/lib/prompts/studyGuides.js';
import syllabus from '../src/lib/prompts/syllabus.js';
import { computeAvgScore, scoreHeuristic } from '../src/lib/deliverableQualityScorer.js';
import { findPublishabilityPlaceholders } from '../src/lib/publishabilityPlaceholders.js';

const ROOT = process.cwd();
const OUTPUT_DIR = path.join(ROOT, 'verification-output', 'internal-quality-loop');
const DEFAULT_SCOPES = [5, 8, 12, 15];
const DEFAULT_FEATURES = [
  'syllabus',
  'lessonPlans',
  'slideDecks',
  'assignments',
  'rubrics',
  'discussions',
  'quizBank',
  'studyGuides',
  'courseFaq',
];

const FEATURE_ARRAY_KEYS = {
  lessonPlans: ['plans', 'lessonPlans'],
  slideDecks: ['decks', 'slideDecks'],
  assignments: ['assignments'],
  rubrics: ['rubrics'],
  discussions: ['discussions'],
  quizBank: ['quizzes', 'quizBank'],
  studyGuides: ['guides', 'studyGuides'],
  courseFaq: ['faqs', 'courseFaq'],
};

const DEFAULT_COLUMNS = [
  { key: 'learningGoals', label: 'Learning Goals', enabled: true },
  { key: 'topicSection', label: 'Topic/Section', enabled: true },
  { key: 'learningObjectives', label: 'Learning Objectives', enabled: true },
  { key: 'weeklyAssessments', label: 'Weekly Assessments', enabled: true },
  { key: 'asyncActivities', label: 'Asynchronous Activities', enabled: true },
  { key: 'syncActivities', label: 'Synchronous Activities', enabled: true },
  { key: 'technologyNeeded', label: 'Technology Needed', enabled: true },
  { key: 'presentationFormat', label: 'Presentation Format', enabled: true },
  { key: 'supportingResources', label: 'Supporting Resources', enabled: true },
];

const DEFAULT_CONFIGS = {
  courseFaq: { questionsPerLesson: 5 },
};

const PROMPTS = {
  assignments,
  courseFaq,
  discussions,
  lessonPlans,
  quizBank,
  rubrics,
  slideDecks,
  studyGuides,
  syllabus,
};

const LESSON_BLUEPRINTS = [
  {
    title: 'Asking Researchable Social Science Questions',
    goals:
      'Students distinguish broad social problems from empirical questions and connect questions to social work practice contexts.',
    topics: 'Research questions, constructs, variables, feasibility, and scope',
    objectives:
      'Analyze a broad social issue and formulate a focused empirical research question with a population, concept, and feasible scope.',
    assessments:
      'Question-quality memo: revise one broad topic into two researchable questions and justify the stronger option.',
    async:
      'Annotated examples of weak and strong research questions; short readiness quiz on variables and populations.',
    sync: 'Question clinic in pairs; whole-class critique using feasibility and ethics criteria.',
    resources: 'Question formulation checklist, empirical article examples, library search guide',
  },
  {
    title: 'Reviewing Literature and Building a Conceptual Frame',
    goals: 'Students use scholarly literature to locate a research gap and justify a conceptual frame.',
    topics: 'Library search strategy, annotated sources, synthesis, and gap statements',
    objectives:
      'Synthesize empirical articles into a concise rationale that explains what is known, what remains uncertain, and why the proposed study matters.',
    assessments: 'Mini literature matrix with three sources and a one-paragraph gap statement.',
    async: 'Library database walkthrough; source-quality checklist; annotated bibliography model.',
    sync: 'Search lab and synthesis workshop using two articles about a shared social issue.',
    resources: 'Library database guide, synthesis matrix template, source evaluation checklist',
  },
  {
    title: 'Designing Ethical Sampling and Recruitment Plans',
    goals: 'Students compare sampling strategies and identify ethical recruitment concerns for vulnerable populations.',
    topics: 'Probability and non-probability sampling, recruitment, consent, and representation',
    objectives: 'Evaluate the fit between a research question, population, sampling strategy, and recruitment plan.',
    assessments: 'Sampling critique: diagnose bias risks in a recruitment plan and recommend improvements.',
    async: 'Mini-lecture on sampling frames; reading notes on ethics and representation.',
    sync: 'Case analysis lab comparing convenience, purposive, stratified, and snowball sampling.',
    resources: 'Sampling decision tree, IRB recruitment examples, bias checklist',
  },
  {
    title: 'Collecting Survey and Interview Data',
    goals: 'Students design data collection instruments that align with constructs and reduce measurement error.',
    topics: 'Survey items, interview protocols, reliability, validity, and pilot testing',
    objectives:
      'Design survey or interview questions that operationalize a construct and minimize leading or double-barreled wording.',
    assessments: 'Instrument revision lab: improve flawed survey and interview questions using validity criteria.',
    async: 'Reading on measurement validity; practice identifying biased question wording.',
    sync: 'Small-group item-writing workshop and peer review.',
    resources: 'Question-wording checklist, interview protocol template, validity examples',
  },
  {
    title: 'Using Observation and Field Notes Responsibly',
    goals:
      'Students plan structured observations while accounting for positionality, context, and participant dignity.',
    topics: 'Observation protocols, field notes, reflexivity, and researcher positionality',
    objectives: 'Create an observation protocol that captures behavior, context, and reflexive notes separately.',
    assessments: 'Field-note coding exercise using a short observation scenario.',
    async: 'Example field notes; short video observation practice.',
    sync: 'Protocol design workshop and debrief on observer effects.',
    resources: 'Observation template, reflexivity prompts, field-note excerpt',
  },
  {
    title: 'Preparing Data for Analysis',
    goals: 'Students clean and organize small datasets while preserving transparent research decisions.',
    topics: 'Data dictionaries, missing data, coding decisions, and documentation',
    objectives: 'Apply a transparent cleaning protocol to a small dataset and document each decision.',
    assessments: 'Data-cleaning log with before/after variable notes.',
    async: 'Spreadsheet walkthrough; practice identifying inconsistent codes.',
    sync: 'Data lab focused on missing values and coding rules.',
    resources: 'Data dictionary template, cleaning log, sample dataset',
  },
  {
    title: 'Interpreting Descriptive Statistics',
    goals: 'Students use descriptive statistics to summarize patterns without overstating claims.',
    topics: 'Frequencies, means, medians, variation, tables, and charts',
    objectives:
      'Interpret descriptive statistics in plain language and identify what the summary can and cannot support.',
    assessments: 'Short interpretation memo using one table and one chart.',
    async: 'Practice reading frequency tables and distribution charts.',
    sync: 'Spreadsheet lab and peer critique of interpretation claims.',
    resources: 'Plain-language statistics guide, chart checklist, sample table',
  },
  {
    title: 'Testing Associations and Group Differences',
    goals: 'Students select simple inferential tests that match variables and research questions.',
    topics: 'Cross-tabs, correlation, t-tests, chi-square, assumptions, and practical significance',
    objectives: 'Compare possible tests and justify the most appropriate option for a research question.',
    assessments: 'Test-selection worksheet with interpretation of a provided result.',
    async: 'Short examples of variable types and test choices.',
    sync: 'Decision-tree lab using social service outcome scenarios.',
    resources: 'Test-selection decision tree, interpretation examples, assumptions checklist',
  },
  {
    title: 'Coding Qualitative Data',
    goals: 'Students code qualitative excerpts and connect themes to evidence.',
    topics: 'Open coding, codebooks, analytic memos, credibility, and theme development',
    objectives: 'Apply initial codes to interview excerpts and justify one emerging theme with evidence.',
    assessments: 'Codebook draft and analytic memo excerpt.',
    async: 'Qualitative coding demonstration; reading on credibility strategies.',
    sync: 'Collaborative coding comparison and theme-naming workshop.',
    resources: 'Codebook template, memo model, interview excerpt',
  },
  {
    title: 'Mixed Methods Integration',
    goals: 'Students explain when mixed methods strengthens a study and how strands can be integrated.',
    topics: 'Convergent, explanatory, and exploratory mixed methods designs',
    objectives:
      'Design a mixed methods integration plan that explains how quantitative and qualitative evidence answer the research question together.',
    assessments: 'Mixed methods design sketch with integration rationale.',
    async: 'Comparison of mixed methods diagrams and short design quiz.',
    sync: 'Design studio matching questions to mixed methods structures.',
    resources: 'Mixed methods design chart, integration prompt bank, sample diagrams',
  },
  {
    title: 'Research Ethics and IRB Preparation',
    goals: 'Students identify ethical risks and prepare participant-facing protections.',
    topics: 'Informed consent, confidentiality, mandated reporting, risk minimization, and IRB review',
    objectives: 'Critique a consent process for clarity, participant autonomy, and risk mitigation.',
    assessments: 'Consent-language revision with ethical justification.',
    async: 'Ethics case reading and IRB terminology review.',
    sync: 'Consent form workshop and scenario-based ethics discussion.',
    resources: 'Consent checklist, ethics case set, IRB preparation guide',
  },
  {
    title: 'Evaluating Program and Policy Evidence',
    goals: 'Students assess evidence quality for programs and policies that affect communities.',
    topics: 'Evaluation questions, logic models, outcomes, indicators, and evidence strength',
    objectives: 'Evaluate whether program evidence supports a specific practice or policy recommendation.',
    assessments: 'Evidence-quality brief using a logic model and outcome indicators.',
    async: 'Logic model tutorial; example evaluation summary.',
    sync: 'Program evidence critique in small groups.',
    resources: 'Logic model template, evidence rubric, outcome indicator examples',
  },
  {
    title: 'Communicating Findings to Practitioner Audiences',
    goals: 'Students translate findings into responsible recommendations for non-research audiences.',
    topics: 'Plain-language summaries, data visualization, limitations, and audience adaptation',
    objectives:
      'Create a practitioner-facing findings summary that connects evidence, limitations, and recommendations.',
    assessments: 'One-page evidence brief with visual and limitation statement.',
    async: 'Examples of findings summaries; practice interpreting a simple table.',
    sync: 'Peer review of evidence claims and visualization choices.',
    resources: 'Evidence-claim-limitation template, plain-language checklist, sample chart',
  },
  {
    title: 'Building a Complete Research Proposal',
    goals: 'Students integrate question, literature, design, ethics, and analysis into a coherent proposal.',
    topics: 'Proposal structure, alignment, feasibility, and revision',
    objectives: 'Integrate major proposal sections into a coherent design with explicit alignment across components.',
    assessments: 'Full proposal draft or structured proposal outline.',
    async: 'Proposal exemplar annotation; alignment self-check.',
    sync: 'Proposal conference and targeted revision workshop.',
    resources: 'Proposal template, alignment checklist, revision plan guide',
  },
  {
    title: 'Presenting and Defending Research Decisions',
    goals: 'Students justify research decisions and respond constructively to critique.',
    topics: 'Research presentation, peer review, defense of methods, and next-step planning',
    objectives: 'Defend research design choices using evidence, ethical reasoning, and feasibility constraints.',
    assessments: 'Final presentation with peer questions and reflective revision memo.',
    async: 'Presentation planning worksheet and peer question preparation.',
    sync: 'Presentation roundtable with structured critique.',
    resources: 'Presentation rubric, peer feedback form, revision memo prompts',
  },
];

function parseCsvNumbers(value, fallback) {
  if (!value) return fallback;
  const parsed = String(value)
    .split(',')
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item) && item > 0);
  return parsed.length ? parsed : fallback;
}

function parseArgs(argv) {
  const args = {
    dryRun: false,
    iterations: 1,
    target: 93,
    features: null,
    scopes: parseCsvNumbers(process.env.COURSEMAPPER_QUALITY_SCOPES, DEFAULT_SCOPES),
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--iterations') args.iterations = Number(argv[++i]) || 1;
    else if (arg === '--target') args.target = Number(argv[++i]) || 93;
    else if (arg === '--scopes') args.scopes = parseCsvNumbers(argv[++i], args.scopes);
    else if (arg === '--features') {
      args.features = argv[++i]
        ?.split(',')
        .map((value) => value.trim())
        .filter(Boolean);
    }
  }
  return args;
}

function buildCourseMap(lessonCount) {
  const lessons = LESSON_BLUEPRINTS.slice(0, lessonCount).map((lesson, index) => ({
    title: `Lesson ${index + 1}: ${lesson.title}`,
    sections: [
      {
        learningGoals: lesson.goals,
        topicSection: lesson.topics,
        learningObjectives: lesson.objectives,
        weeklyAssessments: lesson.assessments,
        asyncActivities: lesson.async,
        syncActivities: lesson.sync,
        technologyNeeded: 'Course site, shared document, spreadsheet, and library database access',
        presentationFormat: 'Short lecture, guided lab, structured peer review, and applied case discussion',
        supportingResources: lesson.resources,
      },
    ],
  }));

  return {
    courseName: 'Research Methods in Social Sciences',
    semester: 'Term to be confirmed',
    audience: 'Undergraduate social work and social science students',
    format: 'Mixed lecture/lab',
    lessons,
  };
}

async function loadDotEnv(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
      const [key, ...rest] = trimmed.split('=');
      if (!process.env[key]) {
        process.env[key] = rest.join('=').replace(/^["']|["']$/g, '');
      }
    }
  } catch {
    // .env is optional.
  }
}

function resolveProvider() {
  const requested = process.env.COURSEMAPPER_QUALITY_PROVIDER;
  if (requested === 'openai' || requested === 'deepseek') {
    const key = requested === 'openai' ? process.env.OPENAI_API_KEY : process.env.DEEPSEEK_API_KEY;
    return { provider: requested, key };
  }
  if (process.env.OPENAI_API_KEY) return { provider: 'openai', key: process.env.OPENAI_API_KEY };
  if (process.env.COURSEMAPPER_TEST_OPENAI_API_KEY) {
    return { provider: 'openai', key: process.env.COURSEMAPPER_TEST_OPENAI_API_KEY };
  }
  if (process.env.DEEPSEEK_API_KEY) return { provider: 'deepseek', key: process.env.DEEPSEEK_API_KEY };
  return { provider: requested || 'openai', key: '' };
}

function modelFor(provider) {
  if (process.env.COURSEMAPPER_QUALITY_MODEL) return process.env.COURSEMAPPER_QUALITY_MODEL;
  return provider === 'deepseek' ? 'deepseek-chat' : 'gpt-5.4-mini';
}

function stripJsonFences(text) {
  return String(text || '')
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim();
}

function parseJson(text) {
  const cleaned = stripJsonFences(text);
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw new Error('Provider response did not contain parseable JSON.');
  }
}

function appendQualityGuard(userPrompt) {
  return `${userPrompt}

INTERNAL QUALITY LOOP OVERRIDE:
- Target an A-level, publishable artifact for a real educator.
- Use the app's current JSON format, key names, prompt intent, and default configuration.
- Do not emit bracketed placeholders, TODO, TBD, verification notes, authoring instructions, or template guidance.
- Unknown local facts should use neutral student-facing language such as "to be confirmed" or be omitted.
- Make every lesson specific to research methods in social sciences for undergraduate social work/social science students.
- Prefer concrete instructions, examples, timing, criteria, and alignment evidence over generic prose.
- Return ONLY valid JSON.`;
}

function buildFeaturePrompt(featureId, courseMap, currentData = null, findings = []) {
  const template = PROMPTS[featureId];
  if (!template) throw new Error(`Unsupported feature: ${featureId}`);

  if (!currentData) {
    return {
      system: template.system,
      user: appendQualityGuard(template.user(courseMap, null, null, DEFAULT_COLUMNS, DEFAULT_CONFIGS[featureId] || {})),
    };
  }

  return {
    system:
      'You are a senior instructional designer repairing generated course deliverables. Return ONLY the full corrected JSON object, no markdown.',
    user: appendQualityGuard(`Improve this ${featureId} JSON so it reaches A-level quality while preserving the exact app schema.

Course context:
${JSON.stringify(courseMap, null, 2)}

Current JSON:
${JSON.stringify(currentData, null, 2)}

Audit findings to fix:
${findings.map((finding) => `- ${finding}`).join('\n') || '- Raise specificity, alignment, and publishability.'}`),
  };
}

async function callProvider({ provider, key, model, system, user }) {
  const isOpenAI = provider === 'openai';
  const url = isOpenAI ? 'https://api.openai.com/v1/chat/completions' : 'https://api.deepseek.com/v1/chat/completions';
  const body = {
    model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    response_format: { type: 'json_object' },
    ...(isOpenAI ? { max_completion_tokens: 12000 } : { max_tokens: 12000 }),
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const json = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`${provider} ${response.status}: ${json?.error?.message || response.statusText}`);
  }
  return parseJson(json?.choices?.[0]?.message?.content || '');
}

function featureItems(featureId, data) {
  if (featureId === 'syllabus') return data?.syllabus?.weeklySchedule || data?.weeklySchedule || [];
  for (const key of FEATURE_ARRAY_KEYS[featureId] || []) {
    if (Array.isArray(data?.[key])) return data[key];
  }
  return [];
}

function countWords(value) {
  return (JSON.stringify(value || '').match(/[A-Za-z][A-Za-z'-]*/g) || []).length;
}

function metricsFor(featureId, data, courseMap) {
  const placeholders = findPublishabilityPlaceholders(data, { limit: 50 });
  const items = featureItems(featureId, data);
  const raw = JSON.stringify(data || '');
  return {
    score: null,
    placeholders: placeholders.length,
    items: items.length,
    expectedItems: courseMap.lessons.length,
    words: countWords(data),
    chars: raw.length,
    topLevelKeys: data && typeof data === 'object' ? Object.keys(data).sort() : [],
  };
}

function courseSpecificityScore(data) {
  const raw = JSON.stringify(data || '').toLowerCase();
  const terms = [
    'research',
    'social science',
    'social work',
    'sampling',
    'survey',
    'interview',
    'evidence',
    'ethics',
    'validity',
    'practitioner',
  ];
  const hits = terms.filter((term) => raw.includes(term)).length;
  return Math.min(15, Math.round((hits / 8) * 15));
}

function scoreFeature(featureId, data, courseMap) {
  const findings = [];
  const placeholders = findPublishabilityPlaceholders(data, { limit: 20 });
  const publishability = Math.max(0, 20 - placeholders.length * 4);
  if (placeholders.length) findings.push(`Remove unresolved placeholders: ${placeholders.join(', ')}`);

  const expected = courseMap.lessons.length;
  const items = featureItems(featureId, data);
  const coverage = Math.round(Math.min(1, items.length / expected) * 15);
  if (coverage < 15) findings.push(`Increase lesson coverage: found ${items.length}, expected ${expected}.`);

  const specificity = courseSpecificityScore(data);
  if (specificity < 12) findings.push('Add more course-specific social science research methods detail.');

  const words = countWords(data);
  const depth = Math.min(10, Math.round(words / (featureId === 'syllabus' ? 180 : 120)));
  if (depth < 8) findings.push('Increase content depth and reduce thin/generic sections.');

  const heuristic = scoreHeuristic(featureId, data);
  const avg = computeAvgScore(heuristic) || 0;
  const pedagogical = Math.min(15, Math.round((avg / 10) * 15));
  const alignment = Math.min(15, Math.round((heuristic.bloomsAlignment / 10) * 15));
  const polish = placeholders.length ? 5 : 10;
  const score = publishability + coverage + specificity + pedagogical + alignment + depth + polish;

  return {
    score,
    findings,
    dimensions: { publishability, coverage, specificity, pedagogical, alignment, depth, polish },
  };
}

function diffSummary(before, after) {
  if (!before) return 'Initial generation baseline.';
  const deltas = [];
  deltas.push(
    `score ${before.score}->${after.score} (${after.score - before.score >= 0 ? '+' : ''}${after.score - before.score})`,
  );
  deltas.push(`placeholders ${before.placeholders}->${after.placeholders}`);
  deltas.push(`items ${before.items}->${after.items}`);
  deltas.push(`words ${before.words}->${after.words}`);
  const beforeKeys = new Set(before.topLevelKeys);
  const afterKeys = new Set(after.topLevelKeys);
  const addedKeys = [...afterKeys].filter((key) => !beforeKeys.has(key));
  const removedKeys = [...beforeKeys].filter((key) => !afterKeys.has(key));
  if (addedKeys.length) deltas.push(`added keys: ${addedKeys.join(', ')}`);
  if (removedKeys.length) deltas.push(`removed keys: ${removedKeys.join(', ')}`);
  return deltas.join('; ');
}

function letter(score) {
  if (score >= 93) return 'A';
  if (score >= 90) return 'A-';
  if (score >= 87) return 'B+';
  if (score >= 83) return 'B';
  if (score >= 80) return 'B-';
  if (score >= 77) return 'C+';
  if (score >= 73) return 'C';
  return 'below C';
}

async function writeOutputs(results, meta) {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const report = [
    '# CourseMapper Internal Deliverable Quality Loop',
    '',
    `Generated: ${new Date().toISOString()}`,
    `Provider: ${meta.provider}`,
    `Model: ${meta.model}`,
    `Scopes: ${meta.scopes.join(', ')}`,
    `Target: ${meta.target}`,
    '',
    'This process is artifact-only. It writes gitignored score reports and generated JSON samples, and it never commits or pushes.',
    '',
    '| Scope | Feature | Score | Letter | Iterations | Latest Diff | Findings |',
    '| ---: | --- | ---: | --- | ---: | --- | --- |',
    ...results.map(
      (result) =>
        `| ${result.scope} | ${result.featureId} | ${result.score} | ${letter(result.score)} | ${result.iterations.length} | ${
          result.iterations.at(-1)?.diff || ''
        } | ${result.findings.join('<br>') || 'None'} |`,
    ),
    '',
    '## Iteration Log',
    '',
    '| Scope | Feature | Iteration | Score | Diff | Findings |',
    '| ---: | --- | ---: | ---: | --- | --- |',
    ...results.flatMap((result) =>
      result.iterations.map(
        (iteration) =>
          `| ${result.scope} | ${result.featureId} | ${iteration.iteration} | ${iteration.score} | ${iteration.diff} | ${
            iteration.findings.join('<br>') || 'None'
          } |`,
      ),
    ),
    '',
    'Port prompt changes into `src/lib/prompts/*` only after repeated A-level runs show stable improvements across scopes.',
  ].join('\n');

  await fs.writeFile(path.join(OUTPUT_DIR, 'latest.md'), report);
  await fs.writeFile(path.join(OUTPUT_DIR, 'latest.json'), JSON.stringify({ meta, results }, null, 2));
  for (const result of results) {
    const scopeDir = path.join(OUTPUT_DIR, `scope-${result.scope}`);
    await fs.mkdir(scopeDir, { recursive: true });
    await fs.writeFile(path.join(scopeDir, `${result.featureId}.json`), JSON.stringify(result.data, null, 2));
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await loadDotEnv(path.join(ROOT, '.env'));
  const features =
    args.features || process.env.COURSEMAPPER_QUALITY_FEATURES?.split(',').filter(Boolean) || DEFAULT_FEATURES;
  const { provider, key } = resolveProvider();
  const model = modelFor(provider);

  if (args.dryRun) {
    for (const scope of args.scopes) {
      const courseMap = buildCourseMap(scope);
      for (const featureId of features) {
        const prompt = buildFeaturePrompt(featureId, courseMap);
        console.log(`${scope}w ${featureId}: system=${prompt.system.length} chars user=${prompt.user.length} chars`);
      }
    }
    return;
  }

  if (!key) {
    throw new Error(
      'No usable API key found. Set OPENAI_API_KEY, COURSEMAPPER_TEST_OPENAI_API_KEY, or DEEPSEEK_API_KEY in the environment or gitignored .env.',
    );
  }

  const results = [];
  console.log(
    `Running internal quality loop with provider=${provider}, model=${model}, scopes=${args.scopes.join(
      ',',
    )}, features=${features.join(',')}`,
  );

  for (const scope of args.scopes) {
    const courseMap = buildCourseMap(scope);
    for (const featureId of features) {
      let data = null;
      let score = 0;
      let findings = [];
      let previousMetrics = null;
      const iterations = [];

      for (let iteration = 1; iteration <= args.iterations; iteration++) {
        const prompt = buildFeaturePrompt(featureId, courseMap, data, findings);
        data = await callProvider({ provider, key, model, ...prompt });
        const scored = scoreFeature(featureId, data, courseMap);
        score = scored.score;
        findings = scored.findings;
        const metrics = { ...metricsFor(featureId, data, courseMap), score };
        const diff = diffSummary(previousMetrics, metrics);
        iterations.push({
          iteration,
          score,
          letter: letter(score),
          findings,
          dimensions: scored.dimensions,
          diff,
        });
        previousMetrics = metrics;
        if (score >= args.target) break;
      }

      results.push({ scope, featureId, score, letter: letter(score), findings, iterations, data });
      console.log(
        `${scope}w ${featureId}: ${score}/100 (${letter(score)})${findings.length ? ` - ${findings[0]}` : ''}`,
      );
    }
  }

  await writeOutputs(results, {
    provider,
    model,
    target: args.target,
    iterations: args.iterations,
    scopes: args.scopes,
  });
  const allA = results.every((result) => result.score >= args.target);
  console.log(`Wrote ${path.relative(ROOT, OUTPUT_DIR)}/latest.md`);
  if (!allA) process.exitCode = 2;
}

main().catch((err) => {
  console.error(err.message || err);
  process.exitCode = 1;
});
