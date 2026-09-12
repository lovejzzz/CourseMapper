import { CODING_PRACTICE } from './codingPracticeCatalog.js';

const CHECK_LABELS = {
  'dom-list': ['Blank input', 'Form submission', 'Literal text'],
  'validated-api': ['Publication filter', 'Payload validation', 'Empty and failed responses'],
  'full-stack-health': ['Initial page', 'API success', 'Failure visibility'],
  'semantic-page': ['Document structure', 'Accessible label', 'Responsive layout'],
  'responsive-grid': ['Narrow layout', 'Wide layout', 'Breakpoint boundary'],
  'dom-counter': ['Initial state', 'Click updates', 'Keyboard activation'],
  'fetch-status': ['Successful JSON', 'HTTP failure', 'Network and empty result'],
  'http-router': ['Health route', 'Route rejection', 'Response completion'],
  'sql-filter': ['Ordered projection', 'Completion filter', 'Empty result'],
  'session-guard': ['Valid session', 'Expiration boundary', 'Unknown token'],
  'react-counter': ['State updates', 'Instance isolation', 'State setter'],
  'release-check': ['Expected revision', 'Stale revision', 'Request failure'],
};

const ERROR_CRITERION = {
  'dom-list': 3,
  'validated-api': 2,
  'full-stack-health': 3,
  'semantic-page': 2,
  'responsive-grid': 1,
  'dom-counter': 2,
  'fetch-status': 2,
  'http-router': 2,
  'sql-filter': 1,
  'session-guard': 3,
  'react-counter': 3,
  'release-check': 2,
};

const SUBMISSIONS = {
  'semantic-page':
    'index.html with the two project articles, a keyboard-access check for the search field, and layout observations at 390px and 900px.',
  'responsive-grid':
    'index.html with the repaired grid and a width/column-count table for 390px, 699px, 700px and 900px; explain which media query changes the layout.',
  'dom-counter':
    'index.html and an event trace showing the initial value, three clicks and keyboard activation; identify where the displayed count changes.',
  'dom-list':
    'index.html and a form-input trace for blank text, surrounding whitespace and HTML-like text; record the resulting list items.',
  'fetch-status':
    'exercise.mjs plus test.mjs covering successful JSON, a non-success HTTP status, a rejected request and an empty array; include the returned values or errors.',
  'validated-api':
    'exercise.mjs plus payload tests for published and unpublished entries, malformed data and an empty response; record which titles reach the output.',
  'http-router':
    'exercise.mjs, a test harness for its handler, and a request/response table for GET /health, an unknown route and a non-GET request, including status codes and response bodies.',
  'sql-filter':
    'The SQL query and its result rows on the supplied task table, followed by an all-completed fixture result; explain filtering before ordering.',
  'session-guard':
    'exercise.mjs and session tests showing a valid token, the exact expiration boundary, an unknown token and logout; explain why the client cannot choose the user identity.',
  'react-counter':
    'Counter.jsx and a two-instance interaction trace; demonstrate that clicking one counter leaves the other unchanged.',
  'release-check':
    'exercise.mjs and smoke-test results for matching and stale revisions, an HTTP failure and an offline request; identify which result blocks the release.',
  'full-stack-health':
    'server.mjs with the browser page and API route, plus browser observations before and after stopping the server; record the unknown-route response separately.',
};

const marker = (example) =>
  `CourseMapper authored coding practice v1: ${example.id}. Bounded exercise; instructor review required for course fit.`;
const runInstructions = (example) =>
  example.runtime === 'node-server'
    ? 'Save server.mjs, run node server.mjs with Node.js 22 or later, and open http://127.0.0.1:3000. Stop the process with Ctrl+C after testing.'
    : example.runtime === 'browser'
      ? `Save the starter as ${example.file}, open it in a browser, edit it, and reload. Inspect the console and test with keyboard input.`
      : example.runtime === 'sqlite'
        ? 'Use SQLite in a fresh in-memory database: sqlite3 :memory:. Paste the CREATE/INSERT fixture, then run your SELECT. Recreate the fixture before each independent test.'
        : example.runtime === 'react'
          ? 'In an existing React project, save Counter.jsx and render <Counter /> from App.jsx. Import Counter from "./Counter.jsx". Use the project dev server; JSX is not a standalone HTML script.'
          : `Save ${example.file}. In Node.js 22 or later, import its exports from a test.mjs file and run node test.mjs. Use the supplied fixtures; no API keys or network service are needed.`;

export function codingPracticeInputs(example) {
  return [
    marker(example),
    runInstructions(example),
    `Starter — ${example.file}:\n${example.starter}`,
    `Acceptance checks:\n${example.checks.map((check, i) => `${i + 1}. ${check}`).join('\n')}`,
    `API reference: ${example.reference}\nSupports this API principle: ${example.principle}\nThe exercise and expected results are original local fixtures, not findings reported by this reference.`,
  ].map((text) => text.trim());
}

// Only a web/programming course with a matching concrete lesson gets this
// fallback. Never manufacture evidence or overwrite a named instructor task.
export function selectCodingPracticeInputs(blueprint, lesson) {
  if (
    !/\b(?:web development|web programming|full[- ]stack|javascript|front[- ]end|back[- ]end)\b/i.test(
      blueprint.courseName || '',
    )
  )
    return [];
  const example = CODING_PRACTICE.find((entry) => entry.match.test(lesson.title || ''));
  return example ? codingPracticeInputs(example) : [];
}

export function explicitCodingPracticeTask(claims) {
  const example = CODING_PRACTICE.find((entry) => claims[0] === marker(entry));
  if (!example || JSON.stringify(claims) !== JSON.stringify(codingPracticeInputs(example))) return null;
  const criteria = example.checks.map((check, index) => ({
    id: `behavior-${index + 1}`,
    label: CHECK_LABELS[example.id][index],
    weight: index === 0 ? 40 : 30,
    feedback: `Reproduce this check and inspect the first mismatch: ${check}`,
    levels: {
      exemplary: `${check} Supplies working code and a reproducible test or observation.`,
      proficient: 'Behavior passes; reproduction steps are incomplete.',
      developing: 'Attempted; at least one required case fails.',
      beginning: 'Missing or nonfunctional implementation.',
    },
  }));
  return {
    kind: `coding-practice:${example.id}`,
    codingPractice: true,
    sourceClaims: claims,
    objective: example.goal,
    title: example.title,
    summary: example.principle,
    question: example.goal,
    directions: [example.goal, ...example.checks],
    studentChecks: example.checks,
    product: SUBMISSIONS[example.id],
    answer: `Reference implementation — ${example.file}:\n${example.solution}\nExpected checks:\n${example.checks.join('\n')}\n${example.reasoning.join('\n')}`,
    reasoning: example.reasoning,
    criteria,
    errors: [
      {
        criterionId: `behavior-${ERROR_CRITERION[example.id]}`,
        response: example.error,
        correction: example.correction,
        feedback: example.correction,
      },
    ],
    checkpoint: { question: example.transfer, answer: example.transferAnswer },
    scaffoldQuestions: [
      {
        title: 'Predict the acceptance results',
        question: `Before coding, state the expected result of each supplied check for ${example.title}.`,
        answer: example.checks.join('\n'),
      },
      {
        title: 'Explain the implementation',
        question: `Explain the implementation steps for ${example.title}.`,
        answer: example.reasoning.join('\n'),
      },
    ],
    assessmentExtensions: [
      { question: example.transfer, answer: example.transferAnswer, criteria: [example.transferAnswer] },
      ...example.checks.map((check, index) => ({
        question: `Design a reproducible test for ${CHECK_LABELS[example.id][index].toLowerCase()} in ${example.title}. State the input or interaction, the expected result, and the observation that would reveal a defect.`,
        answer: `Required behavior: ${check} The test must isolate this behavior and compare the observed result with the stated expectation.`,
        criteria: [check, 'Supplies a reproducible input or interaction and an explicit pass/fail observation.'],
      })),
    ],
    codingReference: {
      url: example.reference,
      supports: example.principle,
      reviewedAt: '2026-09-11',
      scope: 'API principle only; original exercise fixtures are checked separately',
    },
    validation: {
      method: 'authored-coding-fixture',
      scope:
        'Reference solution checked against bounded fixtures in regression tests; not external source verification or instructor approval.',
    },
  };
}
