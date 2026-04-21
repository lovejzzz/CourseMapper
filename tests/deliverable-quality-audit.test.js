/**
 * deliverable-quality-audit.test.js — live generation + content-quality audit.
 *
 * Drives the REAL production prompts (src/lib/prompts/*) through Anthropic
 * against a fixed ML course fixture, then scores each output on three axes:
 *
 *   1. Schema fidelity     — required fields present, types correct, conditional
 *                            fields respected (MC has options, essay has rh/sa)
 *   2. Rule adherence      — constraints the prompts themselves specify (Bloom's
 *                            distribution, slide sequence, speaker-notes format,
 *                            no placeholders, etc.)
 *   3. Content specificity — output references real subject vocabulary vs generic
 *                            filler ("framework / methodology / concept"), and
 *                            items within a deck/quiz are actually distinct.
 *
 * Expensive (multiple long Anthropic calls) — skipped without ANTHROPIC_API_KEY
 * and gated behind a long per-test timeout. Each failure's `expect` message
 * names the exact rule violated so the output feeds directly back into a fix
 * list.
 *
 * Run:  ANTHROPIC_API_KEY=sk-ant-... npx vitest run tests/deliverable-quality-audit.test.js
 */

import { describe, it, expect } from 'vitest';
import quizBankPrompt from '../src/lib/prompts/quizBank.js';
import slideDecksPrompt from '../src/lib/prompts/slideDecks.js';
import lessonPlansPrompt from '../src/lib/prompts/lessonPlans.js';
import rubricsPrompt from '../src/lib/prompts/rubrics.js';
import assignmentsPrompt from '../src/lib/prompts/assignments.js';
// Import the production budget table so the audit exercises what prod actually
// allocates — previously this test hardcoded budget values and drifted from
// the real FEATURE_OUTPUT_BUDGETS. A fix in parallelGenerator.js had no
// observable effect here until callers read the same function.
import { getFeatureOutputBudget } from '../src/lib/parallelGenerator.js';

// Effective budget for live calls — mirrors useDeliverables.js:261 which
// passes Math.min(featureBudget, userGlobalMax). Using a generous global
// (matches what a Sonnet-4.6 user would have after auto-adjust in
// ModelConfig.jsx) so only the per-feature cap bites.
const PROD_BUDGET = (featureId) => getFeatureOutputBudget(featureId, 64000);

const KEY = process.env.ANTHROPIC_API_KEY || '';
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
const describeWithKey = KEY ? describe : describe.skip;

// Fixed fixture — same ML course used by the agent suites. Subject-grounded
// so we can check specificity: outputs for an ML course should mention real
// ML concepts (gradients, overfitting, ensembles, perceptron…), not "framework",
// "methodology", or "concept".
const COURSE = {
  courseName: 'Introduction to Machine Learning',
  semester: 'Fall 2026',
  lessons: [
    { title: 'Supervised Learning Basics', sections: [{
      learningObjectives: 'Explain the difference between supervised and unsupervised learning; describe the bias-variance tradeoff.',
      topicSection: 'Classification, Regression, Training/Test Split, Bias-Variance Tradeoff',
      weeklyAssessments: 'In-class MCQ + short-answer quiz on supervised learning fundamentals',
      asyncActivities: 'Read ISLR Ch. 1-2',
      syncActivities: 'Hands-on scikit-learn notebook',
    }]},
    { title: 'Decision Trees and Random Forests', sections: [{
      learningObjectives: 'Implement decision tree classifiers; explain overfitting and pruning; compare bagging vs boosting.',
      topicSection: 'Decision Trees, Pruning, Gini/Entropy, Bagging, Boosting, Random Forests',
      weeklyAssessments: 'Coding assignment: build a random forest classifier on a real dataset',
      asyncActivities: 'Watch CS229 decision tree lecture',
      syncActivities: 'Lab comparing tree models on Kaggle data',
    }]},
    { title: 'Neural Networks Fundamentals', sections: [{
      learningObjectives: 'Describe the architecture of a feedforward neural network; derive backpropagation; explain activation functions.',
      topicSection: 'Perceptrons, Activation Functions, Backpropagation, Gradient Descent',
      weeklyAssessments: 'Written analysis comparing neural networks to tree-based methods',
      asyncActivities: 'Complete 3Blue1Brown neural network series',
      syncActivities: 'Build a perceptron from scratch in NumPy',
    }]},
  ],
};

// Vocabulary that should show up in authentic ML content. Not exhaustive —
// just enough to distinguish "real ML" from "generic framework filler".
const ML_VOCAB = /gradient|loss|overfit|underfit|variance|bias|regulariz|ensemble|bagging|boosting|entropy|gini|prune|perceptron|activation|backprop|backpropagation|sigmoid|relu|softmax|classifier|regression|supervised|unsupervised|feature|training|test\s+set|cross[- ]valid|learning\s+rate|weight|neuron|layer/i;

// Red-flag placeholder/filler strings that should never appear in output.
const PLACEHOLDER_RE = /\btbd\b|\bto\s+be\s+determined\b|\[insert[^\]]*\]|\[your\s+[^\]]+\]|lorem\s+ipsum|placeholder\s+(text|content)|example\s+(text|content|goes\s+here)|\.{3}\s*\.{3}/i;

async function callClaude(prompt, { maxTokens = 8192 } = {}) {
  const userText = prompt.user(COURSE, null, null, null);
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': KEY, 'content-type': 'application/json', 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      temperature: 0.3,
      system: prompt.system,
      messages: [{ role: 'user', content: userText }],
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${json.error?.message || JSON.stringify(json)}`);
  const text = (json.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  // Strip markdown fences the model sometimes emits despite instructions.
  const stripped = text.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
  let parsed;
  try { parsed = JSON.parse(stripped); }
  catch (e) { throw new Error(`JSON parse failed: ${e.message}\n---\n${stripped.slice(0, 300)}`); }
  return { data: parsed, raw: text, usage: json.usage };
}

// ──────────────────────────────────────────────────────────────────────────
// QUIZ BANK
// ──────────────────────────────────────────────────────────────────────────

describeWithKey(`Deliverable quality — quizBank (${MODEL})`, { timeout: 300_000 }, () => {
  let data;
  it('generates and returns structurally valid JSON', async () => {
    const r = await callClaude(quizBankPrompt, { maxTokens: PROD_BUDGET('quizBank') });
    data = r.data;
    expect(Array.isArray(data.quizzes), 'quizzes array must exist').toBe(true);
    expect(data.quizzes.length, `expected 3 quizzes (one per lesson), got ${data.quizzes.length}`).toBe(3);
  });

  it('every quiz has 5–7 questions spanning ≥3 Bloom\'s levels', () => {
    for (const quiz of data.quizzes || []) {
      const qs = quiz.qs || [];
      expect(qs.length, `"${quiz.lt}" has ${qs.length} questions; prompt requires 5–7`).toBeGreaterThanOrEqual(5);
      expect(qs.length).toBeLessThanOrEqual(7);
      const blooms = new Set(qs.map(q => q.bl).filter(Boolean));
      expect(blooms.size, `"${quiz.lt}" covers only ${[...blooms].join(', ')}; prompt requires ≥3 Bloom's levels`).toBeGreaterThanOrEqual(3);
    }
  });

  it('every quiz includes at least one Evaluate or Create question (balance rule)', () => {
    for (const quiz of data.quizzes || []) {
      const highLevel = (quiz.qs || []).filter(q => q.bl === 'Evaluate' || q.bl === 'Create');
      expect(highLevel.length, `"${quiz.lt}" has ZERO Evaluate/Create questions (prompt marks this CRITICAL)`).toBeGreaterThanOrEqual(1);
    }
  });

  it('every MC question has exactly 4 options, non-null answer, explanation, distractorRationale', () => {
    for (const quiz of data.quizzes || []) {
      for (const q of quiz.qs || []) {
        if (q.ty !== 'multiple_choice') continue;
        expect(Array.isArray(q.op), `MC question "${(q.q || '').slice(0, 60)}..." missing op[]`).toBe(true);
        expect(q.op.length, `MC question has ${q.op.length} options; prompt requires exactly 4`).toBe(4);
        expect(q.an, 'MC answer must be non-null').toBeTruthy();
        expect(q.ex, `MC question missing explanation: "${(q.q || '').slice(0, 60)}..."`).toBeTruthy();
        expect(q.dr, `MC question missing distractorRationale: "${(q.q || '').slice(0, 60)}..."`).toBeTruthy();
      }
    }
  });

  it('short_answer and essay questions have the correct type-specific fields', () => {
    for (const quiz of data.quizzes || []) {
      for (const q of quiz.qs || []) {
        if (q.ty === 'short_answer') {
          expect(q.sa || q.an, `short_answer "${(q.q||'').slice(0,50)}..." missing model answer (sa or an)`).toBeTruthy();
        }
        if (q.ty === 'essay') {
          expect(q.rh, `essay "${(q.q||'').slice(0,50)}..." missing rubricHints (rh)`).toBeTruthy();
          expect(q.sa, `essay "${(q.q||'').slice(0,50)}..." missing sampleAnswer (sa)`).toBeTruthy();
          // Prompt says essay stem must include task verb + scope + constraints.
          expect(q.q.toLowerCase()).toMatch(/analyze|evaluate|argue|compare|critique|design|propose|explain/);
        }
      }
    }
  });

  it('no placeholder text (TBD, [insert], "example text") anywhere in quiz items', () => {
    for (const quiz of data.quizzes || []) {
      const blob = JSON.stringify(quiz);
      expect(blob.match(PLACEHOLDER_RE), `"${quiz.lt}" contains placeholder text: ${blob.match(PLACEHOLDER_RE)?.[0]}`).toBeNull();
    }
  });

  it('content references real ML vocabulary, not generic filler', () => {
    const blob = JSON.stringify(data.quizzes);
    const vocabMatches = blob.match(new RegExp(ML_VOCAB, 'gi')) || [];
    expect(vocabMatches.length, `quizBank output mentions ML vocabulary only ${vocabMatches.length}x across 3 lessons — expected substantial domain grounding`).toBeGreaterThan(8);
  });

  it('question stems across a single quiz are actually distinct (no near-duplicates)', () => {
    for (const quiz of data.quizzes || []) {
      const stems = (quiz.qs || []).map(q => (q.q || '').toLowerCase().slice(0, 60).trim());
      const unique = new Set(stems);
      expect(unique.size, `"${quiz.lt}" has duplicate/near-duplicate stems: ${stems.join(' // ')}`).toBe(stems.length);
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────
// SLIDE DECKS
// ──────────────────────────────────────────────────────────────────────────

describeWithKey(`Deliverable quality — slideDecks (${MODEL})`, { timeout: 600_000 }, () => {
  let data;
  // slideDecks is the heaviest generation in the suite: 3 decks × 12-16 slides
  // × full assertion-evidence titles + 4-sentence speaker notes. Budget raised
  // to 18K; generation takes 260-290s at steady state, so we give the wrap
  // call 8 min of slack before counting it as a hang.
  it('generates and returns 12–16 slides per deck', { timeout: 480_000 }, async () => {
    const r = await callClaude(slideDecksPrompt, { maxTokens: PROD_BUDGET('slideDecks') });
    data = r.data;
    expect(Array.isArray(data.decks), 'decks array must exist').toBe(true);
    expect(data.decks.length).toBe(3);
    for (const d of data.decks) {
      expect(d.sl?.length, `"${d.lt}" has ${d.sl?.length} slides — prompt requires 12–16`).toBeGreaterThanOrEqual(12);
      expect(d.sl.length).toBeLessThanOrEqual(16);
    }
  });

  it('every deck follows the required slide sequence (title → agenda → objectives → [bridge*] → … → summary → closing)', () => {
    // Bridge is only meaningful for lessons 2+ — there's no previous lesson
    // for lesson 1 to bridge from. The prompt frames it as required, but the
    // model rightly skips it for the opening lesson. Rather than police this,
    // we allow any body-type at slide 4 for the first deck and require
    // bridge at slide 4 for later decks.
    const decks = data.decks || [];
    for (let i = 0; i < decks.length; i++) {
      const d = decks[i];
      const types = (d.sl || []).map(s => s.ty);
      expect(types[0], `"${d.lt}" first slide is "${types[0]}", expected "title"`).toBe('title');
      expect(types[1], `"${d.lt}" second slide is "${types[1]}", expected "agenda"`).toBe('agenda');
      expect(types[2], `"${d.lt}" third slide is "${types[2]}", expected "objectives"`).toBe('objectives');
      if (i > 0) {
        // Deck for a later lesson — bridge expected at slide 4.
        expect(types[3], `"${d.lt}" fourth slide is "${types[3]}", expected "bridge" (bridge is required for lessons 2+)`).toBe('bridge');
      }
      expect(types[types.length - 2], `"${d.lt}" second-to-last slide is "${types[types.length-2]}", expected "summary"`).toBe('summary');
      expect(types[types.length - 1], `"${d.lt}" last slide is "${types[types.length-1]}", expected "closing"`).toBe('closing');
    }
  });

  it('content slide titles are full declarative sentences (assertion-evidence model)', () => {
    // Rule: content / bridge / example slide titles must be assertions,
    // not topic phrases. Detecting "is this a full sentence vs a noun phrase"
    // via hard-coded verb lists fails on subject-specific action verbs
    // (illustrates, prevents, governs, partitions, constrains…). Instead use
    // a structural heuristic: assertion sentences have (a) ≥5 words AND
    // (b) a verb-shaped token — any word ending in -s, -ed, -ing, -es, or a
    // known copula — appearing AFTER a subject noun. Topic phrases like
    // "Decision Trees" or "Neural Network Architecture" fail (a) OR lack the
    // verb-shape marker in the right position.
    // keyTerm slides are exempted: for those, the title IS the term itself
    // ("Gini Impurity", "Activation Function") and the definition lives in
    // the first bullet. This matches the prompt's per-type rule and real
    // classroom deck UX.
    const ASSERTION_TYPES = new Set(['content', 'bridge', 'example']);
    const COPULA_AUX = /^(is|are|was|were|be|been|being|has|have|had|can|must|should|will|shall|may|might|does|do|did)$/i;
    // A word is "verb-shaped" if it ends in a common verb suffix OR matches a copula/aux.
    const isVerbShape = (w) => COPULA_AUX.test(w) || /(?:s|es|ed|ing)$/.test(w);
    const violations = [];
    for (const d of data.decks || []) {
      for (const s of d.sl || []) {
        if (!ASSERTION_TYPES.has(s.ty)) continue;
        const t = (s.t || '').trim();
        const words = t.split(/\s+/).filter(Boolean);
        if (words.length < 5) {
          violations.push(`[${d.lt} / ${s.ty}] "${t}" (too short)`);
          continue;
        }
        // Look for verb-shaped word AFTER position 1 (subject typically first).
        const hasVerb = words.slice(1).some(w => isVerbShape(w.replace(/[.,;:()]/g, '')));
        if (!hasVerb) violations.push(`[${d.lt} / ${s.ty}] "${t}"`);
      }
    }
    expect(violations.length, `titles that aren't full assertions:\n  ${violations.slice(0, 6).join('\n  ')}`).toBeLessThanOrEqual(1);
  });

  it('every speaker-notes block ends with a TRANSITION: cue (except the closing slide)', () => {
    const missing = [];
    for (const d of data.decks || []) {
      const slides = d.sl || [];
      for (let i = 0; i < slides.length - 1; i++) {
        const note = slides[i].no || '';
        if (!/transition:/i.test(note)) {
          missing.push(`[${d.lt} / slide ${i + 1} / ${slides[i].ty}]`);
        }
      }
    }
    expect(missing.length, `slides missing TRANSITION: cue:\n  ${missing.slice(0, 6).join('\n  ')}`).toBe(0);
  });

  it('speaker notes hit the 4-sentence minimum across the deck', () => {
    const shortNotes = [];
    for (const d of data.decks || []) {
      for (const s of d.sl || []) {
        if (s.ty === 'title' || s.ty === 'agenda') continue; // short header notes are fine
        const sentenceCount = (s.no || '').split(/(?<=[.!?])\s+/).filter(x => x.trim().length > 3).length;
        if (sentenceCount < 4) shortNotes.push(`[${d.lt} / ${s.ty} "${(s.t||'').slice(0,40)}"] ${sentenceCount} sentences`);
      }
    }
    expect(shortNotes.length, `notes shorter than 4 sentences:\n  ${shortNotes.slice(0, 6).join('\n  ')}`).toBeLessThanOrEqual(2);
  });

  it('bullets respect the "max 4 per content slide" cognitive-load rule', () => {
    const overflowing = [];
    for (const d of data.decks || []) {
      for (const s of d.sl || []) {
        if (s.ty !== 'content') continue;
        if ((s.bu || []).length > 4) overflowing.push(`[${d.lt} / "${(s.t||'').slice(0,40)}"] ${s.bu.length} bullets`);
      }
    }
    expect(overflowing.length, `content slides with >4 bullets:\n  ${overflowing.join('\n  ')}`).toBe(0);
  });

  it('every deck includes at least one example, one activity-or-discussion, and one keyTerm slide', () => {
    for (const d of data.decks || []) {
      const types = new Set((d.sl || []).map(s => s.ty));
      expect(types.has('example'), `"${d.lt}" has no example slide`).toBe(true);
      expect(types.has('activity') || types.has('discussion'), `"${d.lt}" has no activity/discussion slide`).toBe(true);
      expect(types.has('keyTerm'), `"${d.lt}" has no keyTerm slide`).toBe(true);
    }
  });

  it('no 3+ consecutive content slides anywhere (variety rule)', () => {
    for (const d of data.decks || []) {
      let run = 0;
      for (const s of d.sl || []) {
        run = s.ty === 'content' ? run + 1 : 0;
        expect(run, `"${d.lt}" has 3+ consecutive content slides`).toBeLessThan(3);
      }
    }
  });

  it('content references real ML vocabulary (subject grounding)', () => {
    const blob = JSON.stringify(data.decks);
    const matches = blob.match(new RegExp(ML_VOCAB, 'gi')) || [];
    expect(matches.length, `slideDecks mentions ML vocab only ${matches.length}x`).toBeGreaterThan(20);
  });

  it('every content / example / keyTerm slide specifies a visual', () => {
    // New rule — content/example/keyTerm slides must have vi.k != 'none'
    // with a non-empty description + alt text. title/agenda/objectives/
    // closing may set k='none'. Catches regressions where the prompt emits
    // visually-flat decks.
    const NEEDS_VISUAL = new Set(['content', 'example', 'keyTerm']);
    const missing = [];
    for (const d of data.decks || []) {
      for (const s of d.sl || d.slides || []) {
        const ty = s.ty || s.type;
        if (!NEEDS_VISUAL.has(ty)) continue;
        const vis = s.vi || s.visual;
        const kind = vis?.k || vis?.kind;
        if (!vis || !kind || kind === 'none') {
          missing.push(`[${d.lt || d.lessonTitle} / ${ty}] "${(s.t || s.title || '').slice(0, 40)}"`);
          continue;
        }
        const desc = vis.d || vis.description || '';
        const alt = vis.at || vis.altText || '';
        if (desc.length < 10 || alt.length < 20) {
          missing.push(`[${d.lt || d.lessonTitle} / ${ty}] thin visual (desc=${desc.length} altText=${alt.length})`);
        }
      }
    }
    expect(missing.length, `slides missing a proper visual:\n  ${missing.slice(0, 8).join('\n  ')}`).toBeLessThanOrEqual(1);
  });

  it('every slide has a time estimate that sums to roughly the session length', () => {
    const missing = [];
    for (const d of data.decks || []) {
      for (const s of d.sl || d.slides || []) {
        const t = s.ti || s.timeEstimate || s.timer;
        if (!t) missing.push(`[${d.lt || d.lessonTitle} / ${s.ty || s.type}] "${(s.t || s.title || '').slice(0, 40)}"`);
      }
    }
    expect(missing.length, `slides missing timeEstimate:\n  ${missing.slice(0, 6).join('\n  ')}`).toBeLessThanOrEqual(1);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// LESSON PLANS
// ──────────────────────────────────────────────────────────────────────────

describeWithKey(`Deliverable quality — lessonPlans (${MODEL})`, { timeout: 300_000 }, () => {
  let data;
  it('generates one plan per lesson', async () => {
    const r = await callClaude(lessonPlansPrompt, { maxTokens: PROD_BUDGET('lessonPlans') });
    data = r.data;
    const plans = data.plans || data.lessonPlans || [];
    expect(plans.length, `expected 3 plans, got ${plans.length}`).toBe(3);
    data.plans = plans;
  });

  it('each plan has non-trivial session outline with realistic timings', () => {
    for (const p of data.plans || []) {
      const outline = p.sessionOutline || p.outline || p.ol || [];
      expect(outline.length, `"${p.lessonTitle || p.lt}" has only ${outline.length} outline segments`).toBeGreaterThanOrEqual(4);
      // Every segment should have both a duration and an activity label
      for (const seg of outline) {
        const dur = seg.duration || seg.dur || seg.tm;
        const act = seg.activity || seg.section || seg.ac;
        expect(dur, `outline segment missing duration: ${JSON.stringify(seg)}`).toBeTruthy();
        expect(act, `outline segment missing activity label: ${JSON.stringify(seg)}`).toBeTruthy();
      }
    }
  });

  it('content references real ML vocabulary', () => {
    const blob = JSON.stringify(data.plans);
    const matches = blob.match(new RegExp(ML_VOCAB, 'gi')) || [];
    expect(matches.length, `lessonPlans mentions ML vocab only ${matches.length}x`).toBeGreaterThan(10);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// RUBRICS  (single call — rubric structure is more forgiving)
// ──────────────────────────────────────────────────────────────────────────

describeWithKey(`Deliverable quality — rubrics (${MODEL})`, { timeout: 300_000 }, () => {
  let data;
  it('generates rubrics with criteria arrays', async () => {
    const r = await callClaude(rubricsPrompt, { maxTokens: PROD_BUDGET('rubrics') });
    data = r.data;
    const rubrics = data.rubrics || [];
    expect(rubrics.length, `expected at least 1 rubric, got ${rubrics.length}`).toBeGreaterThanOrEqual(1);
    for (const rub of rubrics) {
      const criteria = rub.criteria || rub.cr || [];
      expect(criteria.length, `rubric "${rub.assignmentTitle || rub.lt}" has no criteria`).toBeGreaterThan(0);
    }
  });

  it('every criterion has a full 4-level scale with descriptions', () => {
    for (const rub of data.rubrics || []) {
      for (const c of (rub.criteria || rub.cr || [])) {
        const levels = c.levels || [];
        const hasFlatLevels = ['ex', 'pr', 'dv', 'bg'].every(k => typeof c[k] === 'string' && c[k].length > 10);
        if (!hasFlatLevels && levels.length < 3) {
          throw new Error(`criterion "${c.name || c.cn}" missing full scale. Got levels=${JSON.stringify(levels)}`);
        }
      }
    }
  });

  it('every level description includes a concrete "e.g.," evidence example', () => {
    // New rule — rubrics used to read like grading matrices; this turns each
    // cell into a teaching artifact by requiring a concrete example of what
    // student work at that level looks like. Detect via the "e.g." marker
    // the prompt requires at the end of every level description.
    const missing = [];
    for (const rub of data.rubrics || []) {
      for (const c of (rub.criteria || rub.cr || [])) {
        // Flat {ex, pr, dv, bg} shape first
        for (const key of ['ex', 'pr', 'dv', 'bg']) {
          const txt = c[key];
          if (typeof txt === 'string' && txt.length > 10 && !/\be\.\s*g\./i.test(txt)) {
            missing.push(`[${c.name || c.cn} · ${key}]`);
          }
        }
        // Nested levels[] shape
        for (const l of (c.levels || [])) {
          const txt = l.description || '';
          if (txt.length > 10 && !/\be\.\s*g\./i.test(txt)) {
            missing.push(`[${c.name || c.cn} · ${l.label || l.level}]`);
          }
        }
      }
    }
    expect(missing.length, `rubric cells missing "e.g." evidence example:\n  ${missing.slice(0, 8).join('\n  ')}`).toBeLessThanOrEqual(2);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// ASSIGNMENTS
// ──────────────────────────────────────────────────────────────────────────

describeWithKey(`Deliverable quality — assignments (${MODEL})`, { timeout: 300_000 }, () => {
  let data;
  it('generates at least 1 assignment with title + description + components', async () => {
    const r = await callClaude(assignmentsPrompt, { maxTokens: PROD_BUDGET('assignments') });
    data = r.data;
    const asgns = data.assignments || [];
    expect(asgns.length).toBeGreaterThanOrEqual(1);
    for (const a of asgns) {
      expect(a.title || a.t, 'assignment missing title').toBeTruthy();
      expect(a.description || a.ov || a.de, 'assignment missing description').toBeTruthy();
    }
  });

  it('references real ML vocabulary', () => {
    const blob = JSON.stringify(data.assignments);
    const matches = blob.match(new RegExp(ML_VOCAB, 'gi')) || [];
    expect(matches.length, `assignments mentions ML vocab only ${matches.length}x`).toBeGreaterThan(3);
  });

  it('scaffolding milestones include feedback channel + point value', () => {
    // New rule — scaffolding was previously (milestone, dueDate, description).
    // Now every milestone must specify a feedback channel (fb/feedback) so
    // the scaffolding reads as a coaching timeline, not just a list of due
    // dates. Point value (pt/points) can be 0 for formative-only.
    const bad = [];
    for (const a of (data.assignments || [])) {
      const ms = a.scaffoldingMilestones || a.sm || [];
      if (ms.length === 0) continue;
      for (const m of ms) {
        const fb = m.feedback || m.fb;
        const pt = m.points ?? m.pt;
        if (!fb) bad.push(`[${a.title || a.t} → ${m.milestone || m.ms}] missing feedback channel`);
        if (typeof pt !== 'number') bad.push(`[${a.title || a.t} → ${m.milestone || m.ms}] missing point value`);
      }
    }
    expect(bad.length, `milestones missing feedback/points:\n  ${bad.slice(0, 6).join('\n  ')}`).toBeLessThanOrEqual(2);
  });
});
