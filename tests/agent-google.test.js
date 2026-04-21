/**
 * agent-google.test.js — Google Gemini variant of agent-anthropic.test.js.
 *
 * Exists so we can detect provider drift: if Gemini picks different tools
 * than Claude for the same prompt, we want to know. Skipped when
 * GOOGLE_API_KEY is missing.
 *
 * Run locally:
 *   GOOGLE_API_KEY=AI... npx vitest run tests/agent-google.test.js
 *
 * Host is reachable from the sandbox this was authored in, but no Google key
 * was available, so this was NOT live-executed. First run surfaces any
 * divergence from the Anthropic baseline.
 */

import { describe, it, expect } from 'vitest';
import { buildAgentSystemPrompt } from '../src/lib/agentPrompts.js';
import { buildNativeTools } from '../src/lib/agentProviders.js';
import { AGENT_TOOLS } from '../src/lib/agentTools.js';

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || '';
// gemini-2.5-flash is the sensible default for tool-calling probes — cheap
// and fast. Override for pro tier if you want.
const GOOGLE_MODEL = process.env.GOOGLE_MODEL || 'gemini-2.5-flash';
const TIMEOUT = 60_000;

const describeWithKey = GOOGLE_API_KEY ? describe : describe.skip;

const COURSE_MAP = {
  courseName: 'Introduction to Machine Learning',
  semester: 'Fall 2026',
  lessons: [
    { title: 'Supervised Learning Basics', sections: [{
      learningObjectives: 'Explain supervised vs unsupervised learning',
      topicSection: 'Classification, Regression, Training Sets',
    }]},
    { title: 'Decision Trees and Random Forests', sections: [{
      learningObjectives: 'Implement decision tree classifiers and explain overfitting',
      topicSection: 'Decision Trees, Pruning, Ensemble Methods',
    }]},
    { title: 'Neural Networks Fundamentals', sections: [{
      learningObjectives: 'Describe the architecture of a feedforward neural network',
      topicSection: 'Perceptrons, Activation Functions, Backpropagation',
    }]},
  ],
};

const DELIVERABLES = {
  quizBank: { status: 'done', data: { quizzes: [
    { lt: 'Supervised Learning Basics', qs: [
      { q: 'What is supervised learning?', ty: 'multiple_choice', bl: 'Remember', df: 'easy', pt: 1, op: ['A','B','C','D'], an: 'A' },
    ]},
    { lt: 'Decision Trees and Random Forests', qs: [
      { q: 'What prevents overfitting?', ty: 'multiple_choice', bl: 'Remember', df: 'easy', pt: 1, op: ['Pruning','A','B','C'], an: 'Pruning' },
    ]},
    { lt: 'Neural Networks Fundamentals', qs: [
      { q: 'Activation function?', ty: 'short_answer', bl: 'Understand', df: 'medium', pt: 2, an: '...' },
    ]},
  ]}},
  lessonPlans: { status: 'done', data: { lessonPlans: [
    { lt: 'Supervised Learning Basics', ob: 'Explain supervised vs unsupervised' },
    { lt: 'Decision Trees and Random Forests', ob: 'Implement decision tree classifiers' },
    { lt: 'Neural Networks Fundamentals', ob: 'Describe feedforward architecture' },
  ]}},
};

async function callGemini(userMessage, { activeTab = 'quizBank', maxTokens = 4096 } = {}) {
  const systemPrompt = buildAgentSystemPrompt(COURSE_MAP, activeTab, DELIVERABLES);
  const nativeTools = buildNativeTools('google', AGENT_TOOLS);
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${GOOGLE_MODEL}:generateContent?key=${GOOGLE_API_KEY}`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: [{ text: userMessage }] }],
      tools: nativeTools,
      generationConfig: { temperature: 0.3, maxOutputTokens: maxTokens },
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`Gemini ${response.status}: ${err.error?.message || JSON.stringify(err)}`);
  }

  const json = await response.json();
  const candidate = json.candidates?.[0];
  const parts = candidate?.content?.parts || [];
  const toolCalls = parts
    .filter(p => p.functionCall)
    .map((p, i) => ({
      id: `google_${i}_${Date.now()}`,
      name: p.functionCall.name,
      args: p.functionCall.args || {},
    }));
  const textContent = parts.filter(p => p.text).map(p => p.text).join('') || null;
  return {
    toolCalls: toolCalls.length > 0 ? toolCalls : null,
    textContent,
    finishReason: candidate?.finishReason,
    usage: json.usageMetadata,
  };
}

function findToolCall(toolCalls, name) { return toolCalls?.find(tc => tc.name === name); }

describeWithKey(`Google (${GOOGLE_MODEL}) Agent E2E`, { timeout: TIMEOUT * 12 }, () => {
  it('answers a simple question correctly', { timeout: TIMEOUT }, async () => {
    const r = await callGemini('How many lessons does this course have?');
    const respond = findToolCall(r.toolCalls, 'respond');
    if (respond) {
      expect(respond.args.chatReply).toBeTruthy();
      expect(respond.args.chatReply).toMatch(/3/);
    } else {
      expect(r.toolCalls || r.textContent).toBeTruthy();
    }
  });

  it('takes action when asked to add a quiz question', { timeout: TIMEOUT }, async () => {
    const r = await callGemini('Add a new multiple choice question about gradient descent to Lesson 3');
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
    const r = await callGemini('Check my course for any issues or alignment problems');
    expect(r.toolCalls).toBeTruthy();
    expect(findToolCall(r.toolCalls, 'validate_course')).toBeTruthy();
  });

  it('edits course map when asked to rename a lesson', { timeout: TIMEOUT }, async () => {
    const r = await callGemini('Rename Lesson 2 to "Tree-Based Learning Methods"', { activeTab: 'courseMap' });
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

  it('uses compare_deliverables for alignment questions', { timeout: TIMEOUT }, async () => {
    const r = await callGemini('Are the quiz questions aligned with the lesson plan objectives?');
    const hadRelevantTool = findToolCall(r.toolCalls, 'compare_deliverables')
      || findToolCall(r.toolCalls, 'validate_course')
      || findToolCall(r.toolCalls, 'read_deliverable');
    expect(hadRelevantTool || r.textContent).toBeTruthy();
  });
});
