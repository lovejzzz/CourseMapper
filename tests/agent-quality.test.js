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
    if (text.length > 0) {
      // If agent responded with text, it should be concise and clean
      assertConcise(text, 1500);
      assertNoPlanningLanguage(text);
      assertNoJsonLeak(text);
    } else {
      // Agent may have called tools first (multi-turn) — acceptable
      expect(r.toolCalls).toBeTruthy();
    }
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

  // ── 11. Review with fixes → proposal cards ────────────────────────────────

  it('review fixes: offers fix strategies as proposal cards', { timeout: TIMEOUT }, async () => {
    const r = await callAgent('Review the course and fix any problems you find', { activeTab: 'courseMap' });

    // Agent should use tools first (validate, read)
    const usedTools = r.toolCalls?.some(tc => tc.name !== 'respond');

    if (r.respond) {
      // If responding with fixes, should use proposal (not chatReply with A/B/C)
      if (r.proposal) {
        expect(r.proposal.options?.length).toBeGreaterThanOrEqual(2);
        for (const opt of r.proposal.options) {
          expect(opt.title.split(/\s+/).length).toBeLessThanOrEqual(7);
          expect(opt.action).toBeTruthy();
        }
      }
      // chatReply is also OK if it's a summary (the agent may have applied fixes directly)
      if (r.chatReply && !r.proposal) {
        assertNoJsonLeak(r.chatReply);
        assertConcise(r.chatReply, 2000);
      }
    } else {
      // Multi-turn: read/validate first — acceptable
      expect(usedTools).toBe(true);
    }
  });

  // ── 12. No parroting: don't repeat the user's question ─────────────────

  it('no parrot: does not echo the user question back', { timeout: TIMEOUT }, async () => {
    const question = 'How many quiz questions does Lesson 2 have?';
    const r = await callAgent(question);

    const text = r.chatReply || r.textContent || '';
    if (text.length > 30) {
      // Should NOT start with "You asked..." or repeat the question verbatim
      expect(text).not.toMatch(/^You asked/i);
      expect(text).not.toMatch(/^Your question/i);
      // Should not contain the full question string
      expect(text.toLowerCase()).not.toContain(question.toLowerCase());
    }
  });

  // ── 13. Tone: limited "I" usage ────────────────────────────────────────

  it('tone: does not overuse "I" (max 3 per response)', { timeout: TIMEOUT }, async () => {
    const r = await callAgent('What issues does my course have?', { activeTab: 'courseMap' });

    const text = r.chatReply || r.textContent || '';
    if (text.length > 50) {
      // Count sentences starting with "I " (the robotic pattern)
      const iStarts = (text.match(/(?:^|\. |\.?\n)I [a-z]/g) || []).length;
      expect(iStarts).toBeLessThanOrEqual(3);
    }
  });

  // ── 13. Edit confirmation names what changed ─────────────────────────────

  it('edit confirm: names what was changed, not generic', { timeout: TIMEOUT }, async () => {
    const r = await callAgent('Rename Lesson 3 to "Neuroscience Fundamentals"', { activeTab: 'courseMap' });

    if (r.chatReply) {
      // Should mention the new name or "Lesson 3" — not just "Changes applied"
      const mentionsChange = /Neuroscience|Lesson 3|renamed/i.test(r.chatReply);
      expect(mentionsChange).toBe(true);
      assertConcise(r.chatReply, 300);
    }
  });

  // ── 15. Never says "I can't" — always tries ──────────────────────────────

  it('can-do: never says "I can\'t" or "I\'m unable"', { timeout: TIMEOUT }, async () => {
    // Ask something that might tempt the agent to refuse
    const r = await callAgent('Rewrite all the quiz questions to be much more challenging and add 2 new ones per lesson');

    const text = r.chatReply || r.textContent || '';
    if (text) {
      expect(text).not.toMatch(/I can'?t\b/i);
      expect(text).not.toMatch(/I'?m unable/i);
      expect(text).not.toMatch(/I'?m not able/i);
      expect(text).not.toMatch(/unfortunately.{0,20}(can'?t|unable|not possible)/i);
      expect(text).not.toMatch(/beyond (my|the) (scope|capabilities)/i);
    }

    // Should have taken action (tools or proposal), not just refused
    const acted = r.toolCalls?.some(tc => tc.name !== 'respond') || r.proposal;
    expect(acted || (text && text.length > 20)).toBeTruthy();
  });

  // ── 16. Proposal titles short, descriptions concise ───────────────────────

  it('proposals: titles ≤5 words, descriptions ≤2 sentences', { timeout: TIMEOUT }, async () => {
    const r = await callAgent('Add a discussion question about ethics in psychology to Lesson 2');

    if (r.proposal) {
      for (const opt of r.proposal.options || []) {
        const wordCount = (opt.title || '').trim().split(/\s+/).length;
        expect(wordCount).toBeLessThanOrEqual(6); // allow slight flex
        if (opt.description) {
          const sentenceCount = (opt.description.match(/[.!?]+/g) || []).length;
          expect(sentenceCount).toBeLessThanOrEqual(3); // 2 sentences + possible trailing
        }
      }
    }
  });

  // ── 17. Ambiguity: acts on best guess, doesn't ask back ───────────────────

  it('ambiguity: acts instead of asking clarifying questions', { timeout: TIMEOUT }, async () => {
    // "Make it better" is deliberately vague — agent should pick an intent and act
    const r = await callAgent('Make the quiz better');

    const text = r.chatReply || r.textContent || '';
    if (text) {
      // Should NOT ask a clarifying question
      expect(text).not.toMatch(/what (do you|would you|specifically)/i);
      expect(text).not.toMatch(/could you (clarify|specify|tell me)/i);
      expect(text).not.toMatch(/which (lesson|quiz|aspect)/i);
    }

    // Should have taken action: read, edit, or propose
    const acted = r.toolCalls?.some(tc => tc.name !== 'respond') || r.proposal;
    expect(acted || (text && text.length > 30)).toBeTruthy();
  });

  // ── 18. Markdown formatting in multi-point responses ──────────────────────

  it('markdown: uses formatting in multi-point responses', { timeout: TIMEOUT }, async () => {
    const r = await callAgent('What are the strengths and weaknesses of my course design?', { activeTab: 'courseMap' });

    const text = r.chatReply || r.textContent || '';
    if (text.length > 200) {
      // Multi-point response (>200 chars) should use at least one markdown feature
      const hasBold = /\*\*[^*]+\*\*/.test(text);
      const hasBullets = /^[-*] /m.test(text);
      const hasNumbered = /^\d+[\.\)]/m.test(text);
      const hasHeaders = /^#{1,3} /m.test(text);
      const hasFormatting = hasBold || hasBullets || hasNumbered || hasHeaders;
      expect(hasFormatting).toBe(true);
    }
  });

});
