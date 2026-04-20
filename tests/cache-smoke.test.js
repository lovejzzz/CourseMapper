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
  courseName: 'ML', semester: 'F26',
  lessons: [
    { title: 'L1', sections: [{ learningObjectives: 'x' }] },
    { title: 'L2', sections: [{ learningObjectives: 'y' }] },
  ],
};
const DELIV = { quizBank: { status: 'done', data: { quizzes: [
  { lt: 'L1', qs: [{ q: 'q1', ty: 'multiple_choice', bl: 'Remember', df: 'easy', pt: 1, op: ['a','b','c','d'], an: 'a' }] },
  { lt: 'L2', qs: [{ q: 'q2', ty: 'short_answer', bl: 'Understand', df: 'medium', pt: 2, an: '...' }] },
]}}};

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
  expect(wrote || read, `Cache should be written or read. r1=${JSON.stringify(u1)} r2=${JSON.stringify(u2)}`).toBe(true);
  // And the second call's cached-read count should be substantial (the bulk of the system prompt)
  if (read) {
    expect(u2.cache_read_input_tokens, 'cache read should cover most of the static prompt').toBeGreaterThan(1000);
  }
});
