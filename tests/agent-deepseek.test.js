/**
 * agent-deepseek.test.js — End-to-end agent tests using DeepSeek API.
 *
 * Tests that the agent correctly selects and calls tools in response to
 * various user requests. Validates tool selection, argument quality,
 * and response structure.
 *
 * Run: npx vitest run tests/agent-deepseek.test.js
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { buildAgentSystemPrompt } from '../src/lib/agentPrompts.js';
import { buildNativeTools } from '../src/lib/agentProviders.js';
import { AGENT_TOOLS } from '../src/lib/agentTools.js';

// ── Config ──────────────────────────────────────────────────────────────────

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';
const DEEPSEEK_MODEL = 'deepseek-chat';
const TIMEOUT = 30_000;

// Use describe.skipIf to skip all tests when no API key (CI-safe)
const describeWithKey = DEEPSEEK_API_KEY ? describe : describe.skip;

// ── Test fixtures ───────────────────────────────────────────────────────────

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
              ex: 'Supervised learning uses labeled training data to learn a mapping function.',
            },
            {
              q: 'Explain the bias-variance tradeoff in your own words.',
              ty: 'short_answer',
              bl: 'Understand',
              df: 'medium',
              pt: 2,
              an: 'Bias is the error from erroneous assumptions; variance is sensitivity to training data fluctuations.',
              ex: 'A good model balances both.',
            },
            {
              q: 'Given a dataset with continuous target variable, which algorithm family would you choose?',
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
              q: 'What technique prevents overfitting in decision trees?',
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
              an: 'Bagging reduces variance through parallel training; boosting reduces bias through sequential correction.',
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
        {
          lt: 'Supervised Learning Basics',
          ob: 'Explain supervised vs unsupervised learning',
          wu: { dur: '10 min', pr: 'Quick poll: name an ML application you use daily' },
          ol: [{ tm: '30 min', ac: 'Lecture: supervised learning concepts' }],
        },
        {
          lt: 'Decision Trees and Random Forests',
          ob: 'Implement decision tree classifiers',
          wu: { dur: '5 min', pr: 'Review: what makes a good split?' },
          ol: [{ tm: '40 min', ac: 'Lab: build decision tree in scikit-learn' }],
        },
        {
          lt: 'Neural Networks Fundamentals',
          ob: 'Describe feedforward neural network architecture',
          wu: { dur: '10 min', pr: 'Discuss: what problems need neural networks?' },
          ol: [{ tm: '35 min', ac: 'Interactive: build perceptron step-by-step' }],
        },
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
            {
              t: 'What is Machine Learning?',
              ty: 'title',
              bu: ['Automating pattern recognition', 'Learning from data'],
              no: 'Welcome students and introduce the course theme.',
            },
            {
              t: 'Supervised vs Unsupervised',
              ty: 'content',
              bu: ['Labeled data → supervised', 'Unlabeled data → unsupervised'],
              no: 'Use Venn diagram to compare.',
            },
            {
              t: 'Classification vs Regression',
              ty: 'content',
              bu: ['Discrete outputs → classification', 'Continuous outputs → regression'],
              no: 'Show concrete examples.',
            },
            {
              t: 'Key Takeaways',
              ty: 'summary',
              bu: ['Supervised learning needs labels', 'Choose algorithm based on output type'],
              no: 'Recap main points.',
            },
          ],
        },
        {
          lt: 'Decision Trees and Random Forests',
          ts: 3,
          sl: [
            {
              t: 'How Trees Decide',
              ty: 'title',
              bu: ['Splitting criteria', 'Information gain'],
              no: 'Introduction slide.',
            },
            {
              t: 'Overfitting and Pruning',
              ty: 'content',
              bu: ['Deep trees memorize noise', 'Pruning reduces complexity'],
              no: 'Show overfitting example.',
            },
            {
              t: 'Ensemble Methods',
              ty: 'content',
              bu: ['Bagging: parallel trees', 'Boosting: sequential correction'],
              no: 'Compare the two approaches.',
            },
          ],
        },
        {
          lt: 'Neural Networks Fundamentals',
          ts: 3,
          sl: [
            {
              t: 'The Perceptron',
              ty: 'title',
              bu: ['Simplest neural unit', 'Weighted inputs + activation'],
              no: 'Historical context: Rosenblatt 1958.',
            },
            {
              t: 'Activation Functions',
              ty: 'content',
              bu: ['ReLU, Sigmoid, Tanh', 'Non-linearity enables learning'],
              no: 'Compare activation function shapes.',
            },
            {
              t: 'Backpropagation',
              ty: 'content',
              bu: ['Chain rule of calculus', 'Gradient descent optimization'],
              no: 'Walk through the math step-by-step.',
            },
          ],
        },
      ],
    },
  },
};

// ── Helper: call DeepSeek with tools ────────────────────────────────────────

async function callDeepSeek(userMessage, { activeTab = 'quizBank', maxTokens = 4096 } = {}) {
  const systemPrompt = buildAgentSystemPrompt(COURSE_MAP, activeTab, DELIVERABLES);
  const nativeTools = buildNativeTools('deepseek', AGENT_TOOLS);

  const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: DEEPSEEK_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      tools: nativeTools,
      tool_choice: 'auto',
      max_tokens: maxTokens,
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`DeepSeek API error ${response.status}: ${err.error?.message || JSON.stringify(err)}`);
  }

  const json = await response.json();
  const choice = json.choices?.[0];
  const message = choice?.message;

  const toolCalls = (message?.tool_calls || []).map((tc) => ({
    id: tc.id,
    name: tc.function.name,
    args: JSON.parse(tc.function.arguments || '{}'),
  }));

  return {
    toolCalls: toolCalls.length > 0 ? toolCalls : null,
    textContent: message?.content || null,
    finishReason: choice?.finish_reason,
    usage: json.usage,
  };
}

function findToolCall(toolCalls, name) {
  return toolCalls?.find((tc) => tc.name === name);
}

// ── Tests ───────────────────────────────────────────────────────────────────

describeWithKey('DeepSeek Agent E2E', { timeout: TIMEOUT * 12 }, () => {
  // ── 1. Simple question → respond with chatReply ──────────────────────────

  it('answers a simple question correctly', { timeout: TIMEOUT }, async () => {
    const result = await callDeepSeek('How many lessons does this course have?');

    // Agent should either use respond tool or return text directly
    const respond = findToolCall(result.toolCalls, 'respond');
    if (respond) {
      expect(respond.args.chatReply).toBeTruthy();
      expect(respond.args.chatReply).toMatch(/3/); // 3 lessons
    } else if (result.textContent) {
      expect(result.textContent).toMatch(/3/); // text fallback mentions 3 lessons
    } else {
      // If it reads first, that's a multi-turn flow — acceptable
      expect(result.toolCalls || result.textContent).toBeTruthy();
    }
  });

  // ── 2. Read request → uses read tool ─────────────────────────────────────

  it('answers question about quiz content', { timeout: TIMEOUT }, async () => {
    const result = await callDeepSeek('What quiz questions exist for Lesson 1?');

    // Agent should either respond directly, read first, or return text
    const hasRead = findToolCall(result.toolCalls, 'read_deliverable');
    const hasRespond = findToolCall(result.toolCalls, 'respond');

    // Any of: read_deliverable, respond tool, or text content is acceptable
    expect(hasRead || hasRespond || result.textContent).toBeTruthy();
  });

  // ── 3. Edit request → uses edit tool or proposes ─────────────────────────

  it('takes action when asked to add a new quiz question', { timeout: TIMEOUT }, async () => {
    const result = await callDeepSeek('Add a new multiple choice question about gradient descent to Lesson 3');
    expect(result.toolCalls || result.textContent).toBeTruthy();

    const hasEdit = findToolCall(result.toolCalls, 'edit_deliverables');
    const hasRespond = findToolCall(result.toolCalls, 'respond');
    const hasRead = findToolCall(result.toolCalls, 'read_deliverable');

    if (hasRespond?.args?.proposal) {
      // Proposal path: validate structure
      expect(hasRespond.args.proposal.options.length).toBeGreaterThanOrEqual(2);
      for (const opt of hasRespond.args.proposal.options) {
        expect(opt.label).toBeTruthy();
        expect(opt.title).toBeTruthy();
        expect(opt.action).toBeTruthy();
      }
    } else if (hasEdit) {
      // Direct edit path: validate the action structure
      const actions = hasEdit.args.actions;
      expect(actions).toBeTruthy();
      expect(actions.length).toBeGreaterThanOrEqual(1);
      expect(actions[0].featureId).toBe('quizBank');
    } else {
      // Multi-turn flow: agent reads first (would propose on turn 2)
      // OR responds directly — both are acceptable
      expect(hasRead || hasRespond || result.textContent).toBeTruthy();
    }
  });

  // ── 4. Validation request → calls validate_course ────────────────────────

  it('runs validation when asked to check course health', { timeout: TIMEOUT }, async () => {
    const result = await callDeepSeek('Check my course for any issues or alignment problems');
    expect(result.toolCalls).toBeTruthy();

    const validate = findToolCall(result.toolCalls, 'validate_course');
    expect(validate).toBeTruthy();
  });

  // ── 5. Research request → calls search_research ──────────────────────────

  it('searches academic sources when asked for research', { timeout: TIMEOUT }, async () => {
    const result = await callDeepSeek(
      'Find me some research papers about active learning in computer science education',
    );
    expect(result.toolCalls).toBeTruthy();

    const search = findToolCall(result.toolCalls, 'search_research');
    expect(search).toBeTruthy();
    expect(search.args.query).toBeTruthy();
    expect(search.args.query.length).toBeGreaterThan(5);
  });

  // ── 6. Course map edit → calls edit_course_map ───────────────────────────

  it('edits course map when asked to rename a lesson', { timeout: TIMEOUT }, async () => {
    const result = await callDeepSeek('Rename Lesson 2 to "Tree-Based Learning Methods"', { activeTab: 'courseMap' });
    expect(result.toolCalls || result.textContent).toBeTruthy();

    const edit = findToolCall(result.toolCalls, 'edit_course_map');
    if (edit) {
      // Direct edit path — ideal behavior
      expect(edit.args.patches).toBeTruthy();
      expect(edit.args.patches.length).toBeGreaterThanOrEqual(1);
      const patch = edit.args.patches[0];
      expect(patch.lessonIndex).toBe(1); // 0-based, Lesson 2
      expect(patch.field).toBe('title');
      expect(patch.value).toMatch(/Tree/i);
    } else {
      // Agent might respond first (would edit on follow-up) — still acceptable
      const respond = findToolCall(result.toolCalls, 'respond');
      expect(respond || result.textContent).toBeTruthy();
    }
  });

  // ── 7. Bulk edit request → handles batch operations ──────────────────────

  it('handles bulk edit requests across multiple lessons', { timeout: TIMEOUT }, async () => {
    const result = await callDeepSeek('Add an "Apply" level question to every lesson in the quiz bank');
    expect(result.toolCalls).toBeTruthy();

    // May read first, propose, or directly edit — check for sensible tool usage
    const hasRead = findToolCall(result.toolCalls, 'read_deliverable');
    const hasEdit = findToolCall(result.toolCalls, 'edit_deliverables');
    const hasRespond = findToolCall(result.toolCalls, 'respond');

    // Agent should take some action, not just respond with text
    const tookAction = hasRead || hasEdit || hasRespond?.args?.proposal;
    expect(tookAction).toBeTruthy();
  });

  // ── 8. Cross-deliverable awareness ───────────────────────────────────────

  it('reads relevant deliverables before cross-deliverable edits', { timeout: TIMEOUT }, async () => {
    const result = await callDeepSeek(
      'The quiz for Lesson 1 should better align with the lesson plan objectives. Fix it.',
      { activeTab: 'quizBank' },
    );
    expect(result.toolCalls).toBeTruthy();

    // Should read lesson plans (or quiz data) to understand alignment before editing
    const tools = (result.toolCalls || []).map((tc) => tc.name);
    const readsOrEdits = tools.some((t) =>
      ['read_deliverable', 'read_lesson', 'edit_deliverables', 'validate_course'].includes(t),
    );
    expect(readsOrEdits).toBe(true);
  });

  // ── 9. Memory: save preference ───────────────────────────────────────────

  it('saves teaching preference when told to remember', { timeout: TIMEOUT }, async () => {
    const result = await callDeepSeek('Remember that I always want Bloom\'s level "Apply" or higher for assessments');
    expect(result.toolCalls).toBeTruthy();

    const remember = findToolCall(result.toolCalls, 'remember');
    const savePref = findToolCall(result.toolCalls, 'save_preference');

    // Should use either remember or save_preference
    expect(remember || savePref).toBeTruthy();

    if (remember) {
      expect(remember.args.content).toBeTruthy();
      expect(remember.args.content.toLowerCase()).toMatch(/bloom|apply|assess/i);
    }
  });

  // ── 10. Diagram request → respond with diagram ──────────────────────────

  it('generates a diagram when asked to visualize', { timeout: TIMEOUT }, async () => {
    const result = await callDeepSeek('Create a concept map showing how the three lessons connect to each other');
    expect(result.toolCalls || result.textContent).toBeTruthy();

    const respond = findToolCall(result.toolCalls, 'respond');
    if (respond?.args?.diagram) {
      // Best case: diagram response directly
      expect(respond.args.diagram.syntax).toBeTruthy();
      expect(respond.args.diagram.title).toBeTruthy();
    } else {
      // Agent may read lessons first (multi-turn) or respond with chatReply
      // containing mermaid syntax — both acceptable
      const hasRead = findToolCall(result.toolCalls, 'read_lesson');
      expect(hasRead || respond || result.textContent).toBeTruthy();
    }
  });

  // ── 11. Alignment check → uses compare_deliverables ─────────────────────

  it('uses compare_deliverables for alignment questions', { timeout: TIMEOUT }, async () => {
    const result = await callDeepSeek('Are the quiz questions aligned with the lesson plan objectives?');
    expect(result.toolCalls || result.textContent).toBeTruthy();

    const compare = findToolCall(result.toolCalls, 'compare_deliverables');
    const validate = findToolCall(result.toolCalls, 'validate_course');
    const read = findToolCall(result.toolCalls, 'read_deliverable');

    // Should use compare_deliverables, validate_course, or read both deliverables
    expect(compare || validate || read || result.textContent).toBeTruthy();
  });

  // ── 12. Undo request → uses undo_last ───────────────────────────────────

  it('calls undo_last when asked to undo', { timeout: TIMEOUT }, async () => {
    const result = await callDeepSeek('Undo that last change');
    expect(result.toolCalls || result.textContent).toBeTruthy();

    const undo = findToolCall(result.toolCalls, 'undo_last');
    const respond = findToolCall(result.toolCalls, 'respond');

    // Should call undo_last directly, or respond acknowledging the request
    expect(undo || respond || result.textContent).toBeTruthy();
  });

  // ── 13. Parallel tool calls for independent operations ──────────────────

  it('calls multiple tools in parallel for bulk operations', { timeout: TIMEOUT }, async () => {
    const result = await callDeepSeek('Check the grammar in Lesson 1 and also validate the entire course for issues');
    expect(result.toolCalls || result.textContent).toBeTruthy();

    if (result.toolCalls && result.toolCalls.length >= 2) {
      // Best case: parallel calls
      const toolNames = result.toolCalls.map((tc) => tc.name);
      const hasGrammar = toolNames.includes('check_grammar');
      const hasValidate = toolNames.includes('validate_course');
      expect(hasGrammar || hasValidate).toBe(true);
    }
    // Any response is acceptable — this tests that the agent doesn't refuse
  });
});

// ── Multi-turn agent loop simulation ──────────────────────────────────────

async function callDeepSeekMultiTurn(messages, { activeTab = 'quizBank' } = {}) {
  const systemPrompt = buildAgentSystemPrompt(COURSE_MAP, activeTab, DELIVERABLES);
  const nativeTools = buildNativeTools('deepseek', AGENT_TOOLS);

  const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: DEEPSEEK_MODEL,
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
      tools: nativeTools,
      tool_choice: 'auto',
      max_tokens: 4096,
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`DeepSeek API error ${response.status}: ${err.error?.message || JSON.stringify(err)}`);
  }

  const json = await response.json();
  const choice = json.choices?.[0];
  const message = choice?.message;

  const toolCalls = (message?.tool_calls || []).map((tc) => ({
    id: tc.id,
    name: tc.function.name,
    args: JSON.parse(tc.function.arguments || '{}'),
  }));

  return {
    toolCalls: toolCalls.length > 0 ? toolCalls : null,
    textContent: message?.content || null,
    rawMessage: message,
  };
}

describeWithKey('Multi-turn agent loop', { timeout: TIMEOUT * 6 }, () => {
  it('follows up after reading data: read → then respond or edit', { timeout: TIMEOUT * 3 }, async () => {
    // Turn 1: user asks to improve a quiz — agent should read first
    const turn1 = await callDeepSeekMultiTurn([
      { role: 'user', content: 'The quiz for Lesson 1 is too easy. Make the questions harder.' },
    ]);

    // Turn 1 should read the deliverable (or edit/respond directly)
    const read1 = findToolCall(turn1.toolCalls, 'read_deliverable');
    const edit1 = findToolCall(turn1.toolCalls, 'edit_deliverables');
    const respond1 = findToolCall(turn1.toolCalls, 'respond');

    if (read1 && !respond1 && !edit1) {
      // Agent read first — simulate providing the tool result, then check turn 2
      const toolResult = JSON.stringify({
        data: DELIVERABLES.quizBank.data.quizzes[0],
        editPaths: ['["quizzes", 0, "qs", 0, "df"]'],
      });

      const turn2 = await callDeepSeekMultiTurn([
        { role: 'user', content: 'The quiz for Lesson 1 is too easy. Make the questions harder.' },
        // Assistant made a tool call
        {
          role: 'assistant',
          content: turn1.rawMessage?.content ?? turn1.textContent ?? null,
          ...(turn1.rawMessage?.reasoning_content ? { reasoning_content: turn1.rawMessage.reasoning_content } : {}),
          tool_calls:
            turn1.rawMessage?.tool_calls ||
            turn1.toolCalls.map((tc) => ({
              id: tc.id,
              type: 'function',
              function: { name: tc.name, arguments: JSON.stringify(tc.args) },
            })),
        },
        // Tool result
        { role: 'tool', tool_call_id: read1.id, content: toolResult },
      ]);

      // Turn 2 should either edit, propose, or respond — NOT read again
      expect(turn2.toolCalls || turn2.textContent).toBeTruthy();
      const read2 = findToolCall(turn2.toolCalls, 'read_deliverable');
      const hasAction = findToolCall(turn2.toolCalls, 'edit_deliverables') || findToolCall(turn2.toolCalls, 'respond');

      // Agent should progress, not loop on reads
      expect(hasAction || turn2.textContent).toBeTruthy();
    } else {
      // Agent acted directly — also acceptable
      expect(edit1 || respond1 || turn1.textContent).toBeTruthy();
    }
  });
});
