/**
 * Measure section sizes in STATIC_AGENT_PROMPT so we can target the largest
 * low-ROI blocks for trimming. Not a real test — just instrumentation.
 */
import { test } from 'vitest';
import { buildAgentSystemPromptParts } from '../src/lib/agentPrompts.js';

test('measure prompt section sizes', () => {
  const { staticPart, dynamicPart } = buildAgentSystemPromptParts(
    { courseName: 'X', lessons: [{ title: 'L', sections: [{ learningObjectives: 'y' }] }] },
    'quizBank',
    {
      quizBank: {
        status: 'done',
        data: {
          quizzes: [
            {
              lt: 'L',
              qs: [
                { q: 'a', ty: 'multiple_choice', bl: 'Remember', df: 'easy', pt: 1, op: ['a', 'b', 'c', 'd'], an: 'a' },
              ],
            },
          ],
        },
      },
    },
  );

  const sections = staticPart.split(/\n(?=##? )/);
  console.log(`\n=== STATIC PART ===`);
  console.log(`Total: ${staticPart.length} chars (~${Math.round(staticPart.length / 4)} tokens)`);
  for (const s of sections) {
    const header = s.split('\n')[0].slice(0, 60);
    console.log(`  ${s.length.toString().padStart(5)} chars — ${header}`);
  }
  console.log(`\n=== DYNAMIC PART ===`);
  console.log(`Total: ${dynamicPart.length} chars (~${Math.round(dynamicPart.length / 4)} tokens)`);
});
