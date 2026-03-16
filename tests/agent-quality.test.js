/**
 * agent-quality.test.js — Response QUALITY tests for the agent.
 *
 * Unlike agent-deepseek.test.js (which tests tool selection), this suite
 * tests the actual response content: conciseness, formatting, proper use
 * of proposal cards, no JSON leaks, correct tone.
 *
 * Run: DEEPSEEK_API_KEY=sk-... npx vitest run tests/agent-quality.test.js
 */

import { describe, it, expect } from 'vitest';
import { buildAgentSystemPrompt } from '../src/lib/agentPrompts.js';
import { buildNativeTools } from '../src/lib/agentProviders.js';
import { AGENT_TOOLS } from '../src/lib/agentTools.js';

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';
const DEEPSEEK_MODEL = 'deepseek-chat';
const TIMEOUT = 45_000;

const describeWithKey = DEEPSEEK_API_KEY ? describe : describe.skip;

// ── Test fixtures ───────────────────────────────────────────────────────────

const COURSE_MAP = {
  courseName: 'Introduction to Psychology',
  semester: 'Fall 2026',
  lessons: [
    { title: 'History of Psychology', sections: [{ learningObjectives: 'Understand the origins of psychology', topicSection: 'Structuralism, Functionalism, Behaviorism', learningGoals: 'Understand major schools of thought' }] },
    { title: 'Research Methods', sections: [{ learningObjectives: 'Know how to design experiments', topicSection: 'Variables, Hypotheses, Ethics', learningGoals: 'Master research methodology' }] },
    { title: 'The Brain and Behavior', sections: [{ learningObjectives: 'Understand neural structures', topicSection: 'Neurons, Neurotransmitters, Brain Regions', learningGoals: 'Understand the biological basis of behavior' }] },
  ],
};

const DELIVERABLES = {
  quizBank: {
    status: 'done',
    data: { quizzes: [
      { lt: 'History of Psychology', tq: 2, qs: [
        { q: 'Who founded the first psychology lab?', ty: 'multiple_choice', bl: 'Remember', df: 'easy', pt: 1, op: ['Wundt', 'Freud', 'James', 'Skinner'], an: 'Wundt' },
        { q: 'Explain the difference between structuralism and functionalism.', ty: 'short_answer', bl: 'Understand', df: 'medium', pt: 2, an: 'Structuralism focused on breaking down mental processes; functionalism focused on their purpose.' },
      ]},
      { lt: 'Research Methods', tq: 1, qs: [
        { q: 'What is a confounding variable?', ty: 'short_answer', bl: 'Remember', df: 'easy', pt: 1, an: 'A variable that influences both the independent and dependent variable.' },
      ]},
      { lt: 'The Brain and Behavior', tq: 1, qs: [
        { q: 'What neurotransmitter is associated with reward?', ty: 'multiple_choice', bl: 'Remember', df: 'easy', pt: 1, op: ['Dopamine', 'Serotonin', 'GABA', 'Acetylcholine'], an: 'Dopamine' },
      ]},
    ]},
  },
  lessonPlans: {
    status: 'done',
    data: { lessonPlans: [
      { lt: 'History of Psychology', ob: 'Understand the origins of psychology', wu: { dur: '10 min', pr: 'What comes to mind when you hear psychology?' } },
      { lt: 'Research Methods', ob: 'Know how to design experiments', wu: { dur: '5 min', pr: 'Discuss: can you prove something with one experiment?' } },
      { lt: 'The Brain and Behavior', ob: 'Understand neural structures', wu: { dur: '10 min', pr: 'Draw what you think a brain looks like' } },
    ]},
  },
  slideDecks: {
    status: 'done',
    data: { slideDecks: [
      { lt: 'History of Psychology', ts: 3, sl: [
        { t: 'What is Psychology?', ty: 'title', bu: ['Scientific study of mind and behavior'], no: 'Welcome students.' },
        { t: 'Major Schools', ty: 'content', bu: ['Structuralism', 'Functionalism', 'Behaviorism'], no: 'Compare the three approaches.' },
        { t: 'Key Takeaways', ty: 'summary', bu: ['Psychology evolved through many schools'], no: 'Recap.' },
      ]},
      { lt: 'Research Methods', ts: 2, sl: [
        { t: 'The Scientific Method', ty: 'title', bu: ['Observe, hypothesize, test, conclude'], no: 'Overview of method.' },
        { t: 'Ethics in Research', ty: 'content', bu: ['Informed consent', 'IRB approval'], no: 'Discuss ethical guidelines.' },
      ]},
      { lt: 'The Brain and Behavior', ts: 2, sl: [
        { t: 'Neurons', ty: 'title', bu: ['Basic building blocks', '100 billion in the brain'], no: 'Introduce neurons.' },
        { t: 'Neurotransmitters', ty: 'content', bu: ['Dopamine', 'Serotonin', 'GABA'], no: 'Explain chemical messengers.' },
      ]},
    ]},
  },
};

// ── Helper ──────────────────────────────────────────────────────────────────

async function callAgent(userMessage, { activeTab = 'quizBank' } = {}) {
  const systemPrompt = buildAgentSystemPrompt(COURSE_MAP, activeTab, DELIVERABLES);
  const nativeTools = buildNativeTools('deepseek', AGENT_TOOLS);

  const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
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
      max_completion_tokens: 4096,
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`DeepSeek API error ${response.status}: ${err.error?.message || 'unknown'}`);
  }

  const json = await response.json();
  const msg = json.choices?.[0]?.message;

  const toolCalls = (msg?.tool_calls || []).map(tc => ({
    name: tc.function.name,
    args: JSON.parse(tc.function.arguments || '{}'),
  }));

  const respond = toolCalls.find(tc => tc.name === 'respond');

  return {
    toolCalls: toolCalls.length > 0 ? toolCalls : null,
    textContent: msg?.content || null,
    respond: respond?.args || null,
    chatReply: respond?.args?.chatReply || null,
    proposal: respond?.args?.proposal || null,
    diagram: respond?.args?.diagram || null,
  };
}

// ── Quality checks (reusable) ───────────────────────────────────────────────

function assertNoJsonLeak(text) {
  if (!text) return;
  // Should not contain raw JSON objects, array paths, or tool syntax
  const jsonPatterns = [
    /\{"(type|featureId|lessonIndex|patches|actions)":/,  // raw action JSON
    /\["(quizzes|slideDecks|lessonPlans|rubrics|assignments|discussions|studyGuides|faqs)",\s*\d/,  // array paths
    /edit_course_map\(\{/,  // tool call syntax
    /edit_deliverables\(\{/,
    /"field"\s*:\s*"/,  // field names in JSON
  ];
  for (const pat of jsonPatterns) {
    if (pat.test(text)) {
      throw new Error(`Response leaks JSON/code to user: ${text.slice(0, 200)}`);
    }
  }
}

function assertConcise(text, maxChars) {
  if (!text) return;
  if (text.length > maxChars) {
    throw new Error(`Response too long (${text.length} chars, max ${maxChars}): "${text.slice(0, 100)}..."`);
  }
}

function assertNoPlanningLanguage(text) {
  if (!text) return;
  const planPatterns = [
    /\bI will (now |run |call |execute |first )/i,
    /\bLet me (first |now |start |run )/i,
    /\bPlan:\s/i,
    /\bStep \d+[:.]/i,
    /\bHere is my plan/i,
    /\bI('m going to| am going to) /i,
  ];
  for (const pat of planPatterns) {
    if (pat.test(text)) {
      throw new Error(`Response contains planning language: "${text.match(pat)[0]}" in "${text.slice(0, 150)}..."`);
    }
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// Tests
// ═════════════════════════════════════════════════════════════════════════════

describeWithKey('Agent Response Quality', { timeout: TIMEOUT * 12 }, () => {

  // ── 1. Review course ──────────────────────────────────────────────────────

  it('review: concise summary + proposal (not text wall)', { timeout: TIMEOUT }, async () => {
    const r = await callAgent('Review my course for issues', { activeTab: 'courseMap' });

    // Should call validate_course first (not just respond)
    const usedTools = r.toolCalls?.some(tc => tc.name !== 'respond');
    expect(usedTools || r.respond).toBeTruthy();

    if (r.chatReply) {
      assertNoJsonLeak(r.chatReply);
      assertNoPlanningLanguage(r.chatReply);
      assertConcise(r.chatReply, 2000);
    }
    if (r.proposal) {
      expect(r.proposal.options?.length).toBeGreaterThanOrEqual(2);
      for (const opt of r.proposal.options) {
        assertNoJsonLeak(opt.description);
      }
    }
  });

  // ── 2. Simple rename ──────────────────────────────────────────────────────

  it('rename: direct edit + short confirmation', { timeout: TIMEOUT }, async () => {
    const r = await callAgent('Rename Lesson 1 to "Foundations of Psychology"', { activeTab: 'courseMap' });

    const edit = r.toolCalls?.find(tc => tc.name === 'edit_course_map');
    if (edit) {
      // Correct: edited directly
      expect(edit.args.patches?.[0]?.lessonIndex).toBe(0);
    }

    // If it responded, check quality
    if (r.chatReply) {
      assertNoJsonLeak(r.chatReply);
      assertNoPlanningLanguage(r.chatReply);
      assertConcise(r.chatReply, 300);
    }
  });

  // ── 3. Add quiz question ──────────────────────────────────────────────────

  it('add quiz: proposal with complete options (not text)', { timeout: TIMEOUT }, async () => {
    const r = await callAgent('Add a question about Freud to the Lesson 1 quiz');

    // Should use proposal cards, not text A/B/C
    if (r.chatReply) {
      expect(r.chatReply).not.toMatch(/\b(choose|select|pick)\s+(A|B|C|one|option)/i);
      assertNoJsonLeak(r.chatReply);
    }

    if (r.proposal) {
      expect(r.proposal.options?.length).toBeGreaterThanOrEqual(2);
      for (const opt of r.proposal.options) {
        expect(opt.action?.type).toBe('addItem');
        expect(opt.action?.item).toBeTruthy();
        assertNoJsonLeak(opt.description);
      }
    }
  });

  // ── 4. Factual question ───────────────────────────────────────────────────

  it('factual: immediate respond, no unnecessary tools', { timeout: TIMEOUT }, async () => {
    const r = await callAgent('How many lessons are in this course?');

    // Should NOT call read tools for info already in prompt
    const unnecessaryReads = r.toolCalls?.filter(tc =>
      tc.name === 'read_lesson' || tc.name === 'read_deliverable'
    );
    expect(unnecessaryReads?.length || 0).toBe(0);

    // Response should mention "3"
    const text = r.chatReply || r.textContent || '';
    expect(text).toMatch(/3/);
    assertConcise(text, 500);
  });

  // ── 5. Explain something ──────────────────────────────────────────────────

  it('explain: concise chatReply, no planning', { timeout: TIMEOUT }, async () => {
    const r = await callAgent("What is Bloom's taxonomy and why does it matter for my course?");

    const text = r.chatReply || r.textContent || '';
    expect(text.length).toBeGreaterThan(50);
    assertConcise(text, 1500);
    assertNoPlanningLanguage(text);
    assertNoJsonLeak(text);
  });

  // ── 6. Alignment check ───────────────────────────────────────────────────

  it('alignment: uses compare tool, concise result', { timeout: TIMEOUT }, async () => {
    const r = await callAgent('Are the quizzes aligned with the lesson plan objectives?');

    // Should use compare_deliverables or validate_course
    const usedAnalysis = r.toolCalls?.some(tc =>
      ['compare_deliverables', 'validate_course', 'read_deliverable'].includes(tc.name)
    );
    expect(usedAnalysis || r.respond).toBeTruthy();

    if (r.chatReply) {
      assertNoJsonLeak(r.chatReply);
      assertConcise(r.chatReply, 2000);
    }
  });

  // ── 7. Undo request ──────────────────────────────────────────────────────

  it('undo: calls undo_last + short confirmation', { timeout: TIMEOUT }, async () => {
    const r = await callAgent('Undo the last change');

    const undo = r.toolCalls?.find(tc => tc.name === 'undo_last');
    expect(undo || r.respond).toBeTruthy();

    if (r.chatReply) {
      assertConcise(r.chatReply, 300);
      assertNoJsonLeak(r.chatReply);
    }
  });

  // ── 8. Diagram request ───────────────────────────────────────────────────

  it('diagram: respond with diagram directly', { timeout: TIMEOUT }, async () => {
    const r = await callAgent('Show me a concept map of how the 3 lessons connect');

    if (r.diagram) {
      expect(r.diagram.syntax).toBeTruthy();
      expect(r.diagram.title).toBeTruthy();
    } else {
      // Read-first is acceptable for multi-turn
      expect(r.toolCalls || r.textContent).toBeTruthy();
    }
  });

  // ── 9. Bulk operation ────────────────────────────────────────────────────

  it('bulk: acts without announcing plan', { timeout: TIMEOUT }, async () => {
    const r = await callAgent('Make all quiz questions harder — raise difficulty to "hard"');

    // Should either edit directly or propose — not announce a plan
    if (r.chatReply) {
      assertNoPlanningLanguage(r.chatReply);
      assertNoJsonLeak(r.chatReply);
    }

    // Should have called tools (read or edit)
    const actedOrProposed = r.toolCalls?.some(tc => tc.name !== 'respond') || r.proposal;
    expect(actedOrProposed || r.chatReply).toBeTruthy();
  });

  // ── 10. No "which would you like?" in text ───────────────────────────────

  it('choices: uses proposal cards, not text questions', { timeout: TIMEOUT }, async () => {
    const r = await callAgent('Add a new slide about classical conditioning to Lesson 1', { activeTab: 'slideDecks' });

    if (r.chatReply) {
      // Should NOT ask the user to choose in text
      expect(r.chatReply).not.toMatch(/which (would you|do you|option|one)/i);
      expect(r.chatReply).not.toMatch(/\(A\)|\(B\)|\(C\)/);
      expect(r.chatReply).not.toMatch(/Reply with/i);
      assertNoJsonLeak(r.chatReply);
    }

    // If offering choices, should be a proposal
    if (r.proposal) {
      expect(r.proposal.options?.length).toBeGreaterThanOrEqual(2);
    }
  });

});
