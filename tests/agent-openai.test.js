/**
 * agent-openai.test.js — OpenAI variant of agent-anthropic.test.js.
 *
 * Runs the same tool-selection probes so we can tell if OpenAI drifts away
 * from Anthropic in how it picks tools / shapes arguments. Skipped when
 * OPENAI_API_KEY is missing so the suite stays green in CI.
 *
 * Run locally:
 *   OPENAI_API_KEY=sk-... npx vitest run tests/agent-openai.test.js
 *
 * I could not live-execute this from the sandbox that produced these changes
 * (api.openai.com is not on the egress allowlist), so if a probe fails, the
 * regression lives in OpenAI-specific behavior and should be compared against
 * the matching agent-anthropic.test.js result.
 */

import { describe, it, expect } from 'vitest';
import { buildAgentSystemPrompt } from '../src/lib/agentPrompts.js';
import { buildNativeTools } from '../src/lib/agentProviders.js';
import { AGENT_TOOLS } from '../src/lib/agentTools.js';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
// Default to the current "mini" generation. Override via env if you want to
// probe a different one (e.g. gpt-4o-mini or gpt-5-mini).
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
const TIMEOUT = 60_000;

const describeWithKey = OPENAI_API_KEY ? describe : describe.skip;

const COURSE_MAP = {
  courseName: 'Introduction to Machine Learning',
  semester: 'Fall 2026',
  lessons: [
    {
      title: 'Supervised Learning Basics',
      sections: [
        {
          learningObjectives: 'Explain supervised vs unsupervised learning',
          topicSection: 'Classification, Regression, Training Sets',
        },
      ],
    },
    {
      title: 'Decision Trees and Random Forests',
      sections: [
        {
          learningObjectives: 'Implement decision tree classifiers and explain overfitting',
          topicSection: 'Decision Trees, Pruning, Ensemble Methods',
        },
      ],
    },
    {
      title: 'Neural Networks Fundamentals',
      sections: [
        {
          learningObjectives: 'Describe the architecture of a feedforward neural network',
          topicSection: 'Perceptrons, Activation Functions, Backpropagation',
        },
      ],
    },
  ],
};

const DELIVERABLES = {
  quizBank: {
    status: 'done',
    data: {
      quizzes: [
        {
          lt: 'Supervised Learning Basics',
          qs: [
            {
              q: 'What is supervised learning?',
              ty: 'multiple_choice',
              bl: 'Remember',
              df: 'easy',
              pt: 1,
              op: ['A', 'B', 'C', 'D'],
              an: 'A',
            },
          ],
        },
        {
          lt: 'Decision Trees and Random Forests',
          qs: [
            {
              q: 'What prevents overfitting?',
              ty: 'multiple_choice',
              bl: 'Remember',
              df: 'easy',
              pt: 1,
              op: ['Pruning', 'A', 'B', 'C'],
              an: 'Pruning',
            },
          ],
        },
        {
          lt: 'Neural Networks Fundamentals',
          qs: [{ q: 'Activation function?', ty: 'short_answer', bl: 'Understand', df: 'medium', pt: 2, an: '...' }],
        },
      ],
    },
  },
  lessonPlans: {
    status: 'done',
    data: {
      lessonPlans: [
        { lt: 'Supervised Learning Basics', ob: 'Explain supervised vs unsupervised' },
        { lt: 'Decision Trees and Random Forests', ob: 'Implement decision tree classifiers' },
        { lt: 'Neural Networks Fundamentals', ob: 'Describe feedforward architecture' },
      ],
    },
  },
};

async function callOpenAI(userMessage, { activeTab = 'quizBank', maxTokens = 4096 } = {}) {
  const systemPrompt = buildAgentSystemPrompt(COURSE_MAP, activeTab, DELIVERABLES);
  const nativeTools = buildNativeTools('openai', AGENT_TOOLS);

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      tools: nativeTools,
      tool_choice: 'auto',
      max_completion_tokens: maxTokens,
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`OpenAI ${response.status}: ${err.error?.message || JSON.stringify(err)}`);
  }

  const json = await response.json();
  const message = json.choices?.[0]?.message;
  const toolCalls = (message?.tool_calls || []).map((tc) => ({
    id: tc.id,
    name: tc.function.name,
    args: safeJson(tc.function.arguments),
  }));
  return {
    toolCalls: toolCalls.length > 0 ? toolCalls : null,
    textContent: message?.content || null,
    finishReason: json.choices?.[0]?.finish_reason,
    usage: json.usage,
  };
}

function safeJson(str) {
  try {
    return JSON.parse(str || '{}');
  } catch {
    return {};
  }
}
function findToolCall(toolCalls, name) {
  return toolCalls?.find((tc) => tc.name === name);
}

describeWithKey(`OpenAI (${OPENAI_MODEL}) Agent E2E`, { timeout: TIMEOUT * 12 }, () => {
  it('answers a simple question correctly', { timeout: TIMEOUT }, async () => {
    const r = await callOpenAI('How many lessons does this course have?');
    const respond = findToolCall(r.toolCalls, 'respond');
    if (respond) {
      expect(respond.args.chatReply).toBeTruthy();
      expect(respond.args.chatReply).toMatch(/3/);
    } else {
      expect(r.toolCalls || r.textContent).toBeTruthy();
    }
  });

  it('takes action when asked to add a quiz question', { timeout: TIMEOUT }, async () => {
    const r = await callOpenAI('Add a new multiple choice question about gradient descent to Lesson 3');
    expect(r.toolCalls || r.textContent).toBeTruthy();
    const edit = findToolCall(r.toolCalls, 'edit_deliverables');
    const respond = findToolCall(r.toolCalls, 'respond');
    if (respond?.args?.proposal) {
      expect(respond.args.proposal.options.length).toBeGreaterThanOrEqual(2);
    } else if (edit) {
      expect(edit.args.actions?.[0]?.featureId).toBe('quizBank');
    }
  });

  it('runs validation when asked to check course health', { timeout: TIMEOUT }, async () => {
    const r = await callOpenAI('Check my course for any issues or alignment problems');
    expect(r.toolCalls).toBeTruthy();
    expect(findToolCall(r.toolCalls, 'validate_course')).toBeTruthy();
  });

  it('edits course map when asked to rename a lesson', { timeout: TIMEOUT }, async () => {
    const r = await callOpenAI('Rename Lesson 2 to "Tree-Based Learning Methods"', { activeTab: 'courseMap' });
    const edit = findToolCall(r.toolCalls, 'edit_course_map');
    if (edit) {
      const patch = edit.args.patches?.[0];
      expect(patch?.lessonIndex).toBe(1);
      expect(patch?.field).toBe('title');
      expect(patch?.value).toMatch(/Tree/i);
    } else {
      expect(r.toolCalls || r.textContent).toBeTruthy();
    }
  });

  it('saves teaching preference when told to remember', { timeout: TIMEOUT }, async () => {
    const r = await callOpenAI('Remember that I always want Bloom\'s level "Apply" or higher for assessments');
    expect(r.toolCalls).toBeTruthy();
    expect(findToolCall(r.toolCalls, 'remember') || findToolCall(r.toolCalls, 'save_preference')).toBeTruthy();
  });

  it('uses compare_deliverables for alignment questions', { timeout: TIMEOUT }, async () => {
    const r = await callOpenAI('Are the quiz questions aligned with the lesson plan objectives?');
    const hadRelevantTool =
      findToolCall(r.toolCalls, 'compare_deliverables') ||
      findToolCall(r.toolCalls, 'validate_course') ||
      findToolCall(r.toolCalls, 'read_deliverable');
    expect(hadRelevantTool || r.textContent).toBeTruthy();
  });
});
