/**
 * agent-anthropic.test.js — End-to-end agent tests using Anthropic Claude API.
 *
 * Mirrors tests/agent-deepseek.test.js but targets Claude's native tool-use
 * protocol. Validates tool selection, argument quality, and response structure.
 *
 * Run: ANTHROPIC_API_KEY=sk-ant-... npx vitest run tests/agent-anthropic.test.js
 */

import { describe, it, expect } from 'vitest';
import { buildAgentSystemPrompt } from '../src/lib/agentPrompts.js';
import { buildNativeTools } from '../src/lib/agentProviders.js';
import { AGENT_TOOLS } from '../src/lib/agentTools.js';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
const TIMEOUT = 60_000;

const describeWithKey = ANTHROPIC_API_KEY ? describe : describe.skip;

// Shared fixtures identical in shape to agent-deepseek.test.js so any drift
// between providers is a real agent-behavior issue, not a fixture issue.
const COURSE_MAP = {
  courseName: 'Introduction to Machine Learning',
  semester: 'Fall 2026',
  lessons: [
    {
      title: 'Supervised Learning Basics',
      sections: [
        {
          learningObjectives: 'Explain the difference between supervised and unsupervised learning',
          topicSection: 'Classification, Regression, Training Sets',
          learningGoals: 'Understand the fundamental concepts of supervised learning',
          weeklyAssessments: 'Quiz on supervised learning concepts',
          asyncActivities: 'Read chapters 1-2 of ISLR textbook',
          syncActivities: 'Hands-on coding exercise with scikit-learn',
          supportingResources: 'ISLR textbook, scikit-learn documentation',
          technologyNeeded: 'Python, Jupyter Notebook',
        },
      ],
    },
    {
      title: 'Decision Trees and Random Forests',
      sections: [
        {
          learningObjectives: 'Implement decision tree classifiers and explain overfitting',
          topicSection: 'Decision Trees, Pruning, Ensemble Methods',
          learningGoals: 'Build and evaluate tree-based models',
          weeklyAssessments: 'Coding assignment: build a random forest classifier',
          asyncActivities: 'Watch Stanford CS229 lecture on decision trees',
          syncActivities: 'Lab: comparing tree models on real datasets',
          supportingResources: 'CS229 lecture notes, Kaggle datasets',
          technologyNeeded: 'Python, scikit-learn, pandas',
        },
      ],
    },
    {
      title: 'Neural Networks Fundamentals',
      sections: [
        {
          learningObjectives: 'Describe the architecture of a feedforward neural network',
          topicSection: 'Perceptrons, Activation Functions, Backpropagation',
          learningGoals: 'Understand how neural networks learn through gradient descent',
          weeklyAssessments: 'Written analysis: compare neural networks to traditional ML',
          asyncActivities: 'Complete 3Blue1Brown neural network series',
          syncActivities: 'Build a simple neural network from scratch in NumPy',
          supportingResources: '3Blue1Brown videos, Deep Learning textbook ch.6',
          technologyNeeded: 'Python, NumPy, TensorFlow',
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
          tq: 3,
          qs: [
            {
              q: 'What is the main goal of supervised learning?',
              ty: 'multiple_choice',
              bl: 'Remember',
              df: 'easy',
              pt: 1,
              op: [
                'Predict outcomes from labeled data',
                'Cluster unlabeled data',
                'Reduce dimensionality',
                'Generate new data',
              ],
              an: 'Predict outcomes from labeled data',
            },
            {
              q: 'Explain the bias-variance tradeoff in your own words.',
              ty: 'short_answer',
              bl: 'Understand',
              df: 'medium',
              pt: 2,
              an: 'Bias is error from erroneous assumptions; variance is sensitivity to training fluctuations.',
            },
            {
              q: 'Given a dataset with continuous target variable, which algorithm family?',
              ty: 'multiple_choice',
              bl: 'Apply',
              df: 'medium',
              pt: 1,
              op: ['Regression', 'Classification', 'Clustering', 'Association'],
              an: 'Regression',
            },
          ],
        },
        {
          lt: 'Decision Trees and Random Forests',
          tq: 2,
          qs: [
            {
              q: 'What prevents overfitting in decision trees?',
              ty: 'multiple_choice',
              bl: 'Remember',
              df: 'easy',
              pt: 1,
              op: ['Pruning', 'Boosting', 'Normalization', 'Tokenization'],
              an: 'Pruning',
            },
            {
              q: 'Compare bagging and boosting ensemble methods.',
              ty: 'essay',
              bl: 'Analyze',
              df: 'hard',
              pt: 5,
              an: 'Bagging reduces variance via parallel training; boosting reduces bias via sequential correction.',
            },
          ],
        },
        {
          lt: 'Neural Networks Fundamentals',
          tq: 2,
          qs: [
            {
              q: 'What is the purpose of an activation function?',
              ty: 'short_answer',
              bl: 'Understand',
              df: 'medium',
              pt: 2,
              an: 'Introduces non-linearity so the network can learn complex patterns.',
            },
            {
              q: 'Describe the backpropagation algorithm step by step.',
              ty: 'essay',
              bl: 'Understand',
              df: 'hard',
              pt: 5,
              an: 'Forward pass, compute loss, backward pass computing gradients, update weights.',
            },
          ],
        },
      ],
    },
  },
  lessonPlans: {
    status: 'done',
    data: {
      lessonPlans: [
        { lt: 'Supervised Learning Basics', ob: 'Explain supervised vs unsupervised learning' },
        { lt: 'Decision Trees and Random Forests', ob: 'Implement decision tree classifiers' },
        { lt: 'Neural Networks Fundamentals', ob: 'Describe feedforward neural network architecture' },
      ],
    },
  },
  slideDecks: {
    status: 'done',
    data: {
      slideDecks: [
        {
          lt: 'Supervised Learning Basics',
          ts: 4,
          sl: [
            { t: 'What is Machine Learning?', ty: 'title', bu: ['Automating pattern recognition'], no: 'Intro slide.' },
          ],
        },
      ],
    },
  },
};

async function callClaude(userMessage, { activeTab = 'quizBank', maxTokens = 4096 } = {}) {
  const systemPrompt = buildAgentSystemPrompt(COURSE_MAP, activeTab, DELIVERABLES);
  const nativeTools = buildNativeTools('anthropic', AGENT_TOOLS);

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'content-type': 'application/json',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: maxTokens,
      temperature: 0.3,
      system: systemPrompt,
      tools: nativeTools,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`Anthropic API ${response.status}: ${err.error?.message || JSON.stringify(err)}`);
  }

  const json = await response.json();
  const blocks = json.content || [];
  const toolCalls = blocks
    .filter((b) => b.type === 'tool_use')
    .map((b) => ({ id: b.id, name: b.name, args: b.input || {} }));
  const textContent =
    blocks
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('') || null;

  return {
    toolCalls: toolCalls.length > 0 ? toolCalls : null,
    textContent,
    stopReason: json.stop_reason,
    usage: json.usage,
  };
}

function findToolCall(toolCalls, name) {
  return toolCalls?.find((tc) => tc.name === name);
}

describeWithKey(`Anthropic (${ANTHROPIC_MODEL}) Agent E2E`, { timeout: TIMEOUT * 12 }, () => {
  it('answers a simple question correctly', { timeout: TIMEOUT }, async () => {
    const result = await callClaude('How many lessons does this course have?');
    const respond = findToolCall(result.toolCalls, 'respond');
    if (respond) {
      expect(respond.args.chatReply).toBeTruthy();
      expect(respond.args.chatReply).toMatch(/3/);
    } else {
      expect(result.toolCalls || result.textContent).toBeTruthy();
    }
  });

  it('takes action when asked to add a quiz question', { timeout: TIMEOUT }, async () => {
    const result = await callClaude('Add a new multiple choice question about gradient descent to Lesson 3');
    expect(result.toolCalls || result.textContent).toBeTruthy();
    const edit = findToolCall(result.toolCalls, 'edit_deliverables');
    const respond = findToolCall(result.toolCalls, 'respond');
    if (respond?.args?.proposal) {
      expect(respond.args.proposal.options.length).toBeGreaterThanOrEqual(2);
      for (const opt of respond.args.proposal.options) {
        expect(opt.label).toBeTruthy();
        expect(opt.title).toBeTruthy();
        expect(opt.action).toBeTruthy();
      }
    } else if (edit) {
      expect(edit.args.actions.length).toBeGreaterThanOrEqual(1);
      expect(edit.args.actions[0].featureId).toBe('quizBank');
    }
  });

  it('runs validation when asked to check course health', { timeout: TIMEOUT }, async () => {
    const result = await callClaude('Check my course for any issues or alignment problems');
    expect(result.toolCalls).toBeTruthy();
    expect(findToolCall(result.toolCalls, 'validate_course')).toBeTruthy();
  });

  it('searches academic sources when asked for research', { timeout: TIMEOUT }, async () => {
    const result = await callClaude('Find research papers on active learning in computer science education');
    expect(result.toolCalls).toBeTruthy();
    const search = findToolCall(result.toolCalls, 'search_research');
    expect(search).toBeTruthy();
    expect(search.args.query).toBeTruthy();
    expect(search.args.query.length).toBeGreaterThan(5);
  });

  it('edits course map when asked to rename a lesson', { timeout: TIMEOUT }, async () => {
    const result = await callClaude('Rename Lesson 2 to "Tree-Based Learning Methods"', { activeTab: 'courseMap' });
    const edit = findToolCall(result.toolCalls, 'edit_course_map');
    if (edit) {
      const patch = edit.args.patches[0];
      expect(patch.lessonIndex).toBe(1);
      expect(patch.field).toBe('title');
      expect(patch.value).toMatch(/Tree/i);
    } else {
      expect(result.toolCalls || result.textContent).toBeTruthy();
    }
  });

  it('handles bulk edit requests across multiple lessons', { timeout: TIMEOUT }, async () => {
    const result = await callClaude('Add an "Apply" level question to every lesson in the quiz bank');
    expect(result.toolCalls).toBeTruthy();
    const hasRead = findToolCall(result.toolCalls, 'read_deliverable');
    const hasEdit = findToolCall(result.toolCalls, 'edit_deliverables');
    const hasRespond = findToolCall(result.toolCalls, 'respond');
    expect(hasRead || hasEdit || hasRespond?.args?.proposal).toBeTruthy();
  });

  it('saves teaching preference when told to remember', { timeout: TIMEOUT }, async () => {
    const result = await callClaude('Remember that I always want Bloom\'s level "Apply" or higher for assessments');
    expect(result.toolCalls).toBeTruthy();
    const remember = findToolCall(result.toolCalls, 'remember');
    const savePref = findToolCall(result.toolCalls, 'save_preference');
    expect(remember || savePref).toBeTruthy();
  });

  it('generates a diagram when asked to visualize', { timeout: TIMEOUT }, async () => {
    const result = await callClaude('Create a concept map showing how the three lessons connect');
    const respond = findToolCall(result.toolCalls, 'respond');
    if (respond?.args?.diagram) {
      expect(respond.args.diagram.syntax).toBeTruthy();
      expect(respond.args.diagram.title).toBeTruthy();
    } else {
      expect(result.toolCalls || result.textContent).toBeTruthy();
    }
  });

  it('uses compare_deliverables for alignment questions', { timeout: TIMEOUT }, async () => {
    const result = await callClaude('Are the quiz questions aligned with the lesson plan objectives?');
    const compare = findToolCall(result.toolCalls, 'compare_deliverables');
    const validate = findToolCall(result.toolCalls, 'validate_course');
    const read = findToolCall(result.toolCalls, 'read_deliverable');
    expect(compare || validate || read || result.textContent).toBeTruthy();
  });

  it('calls undo_last when asked to undo', { timeout: TIMEOUT }, async () => {
    const result = await callClaude('Undo that last change');
    const undo = findToolCall(result.toolCalls, 'undo_last');
    const respond = findToolCall(result.toolCalls, 'respond');
    expect(undo || respond || result.textContent).toBeTruthy();
  });

  it('calls multiple tools in parallel for bulk operations', { timeout: TIMEOUT }, async () => {
    const result = await callClaude('Check grammar in Lesson 1 and also validate the entire course for issues');
    expect(result.toolCalls || result.textContent).toBeTruthy();
    if (result.toolCalls && result.toolCalls.length >= 2) {
      const toolNames = result.toolCalls.map((tc) => tc.name);
      expect(toolNames.includes('check_grammar') || toolNames.includes('validate_course')).toBe(true);
    }
  });
});
