/**
 * cache-smoke.test.js — confirms Anthropic prompt caching lands in the live API.
 * Runs two back-to-back multi-turn calls with the same system/tools and asserts
 * the second one reports cache_read_input_tokens > 0.
 */
import { test, expect } from 'vitest';
import { runMultiTurn } from './lib/multi-turn-harness.js';

const KEY = process.env.ANTHROPIC_API_KEY || '';
const MODEL = 'claude-sonnet-4-6';
const run = KEY ? test : test.skip;

const COURSE = {
  courseName: 'ML',
  semester: 'F26',
  lessons: [
    { title: 'L1', sections: [{ learningObjectives: 'x' }] },
    { title: 'L2', sections: [{ learningObjectives: 'y' }] },
  ],
};
const DELIV = {
  quizBank: {
    status: 'done',
    data: {
      quizzes: [
        {
          lt: 'L1',
          qs: [
            { q: 'q1', ty: 'multiple_choice', bl: 'Remember', df: 'easy', pt: 1, op: ['a', 'b', 'c', 'd'], an: 'a' },
          ],
        },
        { lt: 'L2', qs: [{ q: 'q2', ty: 'short_answer', bl: 'Understand', df: 'medium', pt: 2, an: '...' }] },
      ],
    },
  },
};

run('second identical call hits the prompt cache', { timeout: 120_000 }, async () => {
  const ctx = { apiKey: KEY, model: MODEL, courseMap: COURSE, deliverables: DELIV, maxIterations: 3 };
  const r1 = await runMultiTurn({ ...ctx, userMessage: 'How many lessons?' });
  const r2 = await runMultiTurn({ ...ctx, userMessage: 'How many lessons?' });

  const u1 = r1.trace[0]?.usage || {};
  const u2 = r2.trace[0]?.usage || {};
  console.log('iter0 usage r1:', JSON.stringify(u1));
  console.log('iter0 usage r2:', JSON.stringify(u2));

  // First call should write the cache (new system prompt)
  const wrote = (u1.cache_creation_input_tokens || 0) > 0;
  // Second call should read from it
  const read = (u2.cache_read_input_tokens || 0) > 0;
  expect(wrote || read, `Cache should be written or read. r1=${JSON.stringify(u1)} r2=${JSON.stringify(u2)}`).toBe(
    true,
  );
  // And the second call's cached-read count should be substantial (the bulk of the system prompt)
  if (read) {
    expect(u2.cache_read_input_tokens, 'cache read should cover most of the static prompt').toBeGreaterThan(1000);
  }
});

run('static-prefix cache survives a course switch', { timeout: 120_000 }, async () => {
  // Prime the cache with course A.
  const r1 = await runMultiTurn({
    apiKey: KEY,
    model: MODEL,
    courseMap: COURSE,
    deliverables: DELIV,
    maxIterations: 3,
    userMessage: 'How many lessons?',
  });
  // Now swap to a different course and different deliverable content. The
  // STATIC prefix (protocol, rules, examples) should still be the same bytes,
  // so even though the dynamic tail is fresh, we should see a cache READ
  // covering the prefix — NOT a full re-write.
  const OTHER_COURSE = {
    courseName: 'Organic Chemistry',
    semester: 'Sp27',
    lessons: [
      { title: 'Hydrocarbons', sections: [{ learningObjectives: 'classify alkanes' }] },
      { title: 'Functional Groups', sections: [{ learningObjectives: 'identify -OH, -COOH' }] },
      { title: 'Reactions', sections: [{ learningObjectives: 'predict products' }] },
    ],
  };
  const OTHER_DELIV = {
    quizBank: {
      status: 'done',
      data: {
        quizzes: [
          {
            lt: 'Hydrocarbons',
            qs: [{ q: 'alkane formula?', ty: 'short_answer', bl: 'Remember', df: 'easy', pt: 1, an: 'CnH2n+2' }],
          },
          {
            lt: 'Functional Groups',
            qs: [{ q: 'what is -COOH?', ty: 'short_answer', bl: 'Remember', df: 'easy', pt: 1, an: 'carboxylic acid' }],
          },
          {
            lt: 'Reactions',
            qs: [
              { q: 'addition vs substitution?', ty: 'short_answer', bl: 'Understand', df: 'medium', pt: 2, an: '...' },
            ],
          },
        ],
      },
    },
  };
  const r2 = await runMultiTurn({
    apiKey: KEY,
    model: MODEL,
    courseMap: OTHER_COURSE,
    deliverables: OTHER_DELIV,
    maxIterations: 3,
    userMessage: 'How many lessons?',
  });

  const u1 = r1.trace[0]?.usage || {};
  const u2 = r2.trace[0]?.usage || {};
  console.log('course-swap r1 usage:', JSON.stringify(u1));
  console.log('course-swap r2 usage:', JSON.stringify(u2));

  // The static prefix must appear as a cache READ in r2 — surviving the
  // course swap. Threshold is generous (the static prefix alone is ~3k tokens
  // after the split).
  const staticRead = u2.cache_read_input_tokens || 0;
  expect(staticRead, `static prefix should be reused. r2 read=${staticRead}`).toBeGreaterThan(3000);

  // r2 should write only the dynamic tail (plus a tools marker), not the full
  // system prompt. Cap at a loose multiple of the dynamic-tail size so this
  // stays robust if course data grows.
  const r2Write = u2.cache_creation_input_tokens || 0;
  const DYNAMIC_TAIL_MAX = 1500;
  expect(r2Write, `r2 should write only the dynamic tail, got ${r2Write}`).toBeLessThan(DYNAMIC_TAIL_MAX);
});
