/**
 * kernelProjection.js — v0.9.11 P4: deterministic projection of a per-lesson
 * knowledge kernel into the enrichment surface payload.
 *
 * The model writes knowledge atoms ONCE per lesson (facts, terms with
 * misconceptions, a scenario, a debatable tension, the assignment task, and
 * MC items — the irreplaceable authorship). This module projects those atoms
 * into the exact payload shape the v0.9.1 overlay machinery consumes
 * (quizItems/keyTerms/slideContent/discussionPrompt/assignmentCore), so the
 * compiler integration is unchanged:
 *   - distractor rationales  ← matched term misconceptions (bought once)
 *   - short answer / essay   ← compiled frames around scenario/tension/facts
 *   - slides                 ← assertion titles + evidence bullets from facts
 *   - study-guide misconceptions ← the same terms, not re-bought
 *
 * Quality line: the projection never invents disciplinary content — every
 * content-bearing phrase comes from a model-written kernel atom; only the
 * framing sentences are compiled.
 */

const STOP_WORDS = new Set([
  'about',
  'after',
  'because',
  'between',
  'could',
  'every',
  'from',
  'have',
  'into',
  'more',
  'most',
  'often',
  'only',
  'other',
  'over',
  'some',
  'than',
  'that',
  'their',
  'them',
  'there',
  'these',
  'they',
  'this',
  'through',
  'under',
  'were',
  'what',
  'when',
  'where',
  'which',
  'while',
  'with',
  'within',
  'would',
]);

function cleanText(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function wordCount(text) {
  return cleanText(text).split(/\s+/).filter(Boolean).length;
}

function ensureSentence(text, fallbackPunctuation = '.') {
  const cleaned = cleanText(text);
  if (!cleaned) return '';
  return /[.!?]$/.test(cleaned) ? cleaned : `${cleaned}${fallbackPunctuation}`;
}

function stripTerminalPeriod(text) {
  return cleanText(text).replace(/\.+$/, '');
}

function contentWords(text) {
  return cleanText(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 3 && !STOP_WORDS.has(word));
}

function overlapScore(textA, textB) {
  const wordsB = new Set(contentWords(textB));
  return contentWords(textA).filter((word) => wordsB.has(word)).length;
}

function bestFactFor(reference, facts = []) {
  let best = '';
  let bestScore = 0;
  for (const fact of facts) {
    const score = overlapScore(`${reference?.term || ''} ${reference?.definition || ''}`, fact);
    if (score > bestScore) {
      best = fact;
      bestScore = score;
    }
  }
  return best;
}

/**
 * Match each wrong option to a term misconception by content-word overlap.
 * All wrong options must match — a partially matched rationale set reads as
 * sloppier than none, so we return [] rather than misaligned feedback.
 */
export function matchDistractorRationales(item, keyTerms = []) {
  const options = Array.isArray(item?.options) ? item.options : [];
  const answerIndex = Number(item?.answerIndex) || 0;
  const wrongOptions = options.filter((_, index) => index !== answerIndex);
  if (wrongOptions.length === 0 || keyTerms.length === 0) return [];
  const used = new Set();
  const rationales = [];
  for (const option of wrongOptions) {
    let best = null;
    let bestScore = 0;
    for (const term of keyTerms) {
      if (!cleanText(term?.misconception)) continue;
      const score = overlapScore(option, `${term.term} ${term.misconception}`) + (used.has(term.term) ? 0 : 0.5);
      if (score > bestScore) {
        best = term;
        bestScore = score;
      }
    }
    if (!best || bestScore < 1) return [];
    used.add(best.term);
    rationales.push(ensureSentence(best.misconception));
  }
  return rationales;
}

function pickBullets(candidates, count) {
  const bullets = [];
  for (const candidate of candidates) {
    const text = stripTerminalPeriod(candidate);
    if (!text || wordCount(text) > 18 || wordCount(text) < 3) continue;
    if (bullets.some((existing) => existing.toLowerCase() === text.toLowerCase())) continue;
    bullets.push(text);
    if (bullets.length >= count) break;
  }
  return bullets;
}

export function buildSlideContentFromKernel(kernel) {
  const facts = Array.isArray(kernel?.facts) ? kernel.facts.map(cleanText).filter(Boolean) : [];
  const terms = Array.isArray(kernel?.keyTerms) ? kernel.keyTerms : [];
  const [termA, termB] = terms;
  const slides = [];

  if (facts.length >= 3) {
    const bullets = pickBullets(facts.slice(1), 3);
    if (bullets.length >= 2) {
      slides.push({
        title: stripTerminalPeriod(facts[0]),
        bullets,
        notes: `${ensureSentence(facts[0])} ${ensureSentence(termA?.definition || '')}`.trim(),
      });
    }
  }
  if (facts.length >= 5) {
    const anchor = facts[3];
    const bullets = pickBullets([facts[4], facts[5], termA?.example, termB?.example].filter(Boolean), 3);
    if (bullets.length >= 2) {
      slides.push({
        title: stripTerminalPeriod(anchor),
        bullets,
        notes: `${ensureSentence(anchor)} ${ensureSentence(termB?.definition || termA?.definition || '')}`.trim(),
      });
    }
  }
  if (termA && cleanText(termA.misconception)) {
    const bullets = pickBullets([termA.example, termB?.example, facts[facts.length - 1]].filter(Boolean), 3);
    if (bullets.length >= 2) {
      slides.push({
        title:
          facts.length >= 7
            ? stripTerminalPeriod(facts[6])
            : `${termA.term} is commonly misread — the evidence says otherwise`,
        bullets,
        notes: `Common misunderstanding: ${ensureSentence(termA.misconception)} Use ${
          cleanText(termA.example) || 'the worked example'
        } to correct it.`,
      });
    }
  }
  return slides.slice(0, 3);
}

function firstSentenceOf(text) {
  const cleaned = cleanText(text);
  if (!cleaned) return '';
  return cleaned.split(/(?<=[.!?])\s+/)[0] || cleaned;
}

function lowercaseLead(text) {
  const cleaned = cleanText(text);
  if (!cleaned) return '';
  const firstWord = cleaned.split(/\s+/)[0];
  // Leave acronym leads ("DNA", "GDP growth") intact.
  if (firstWord.length > 1 && firstWord === firstWord.toUpperCase()) return cleaned;
  return cleaned.charAt(0).toLowerCase() + cleaned.slice(1);
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Rewrite a term definition as a clause that can follow "this is a case of
 * <term>: …" — drops a leading "<term> is/are/refers to/means" so the term
 * name is never glued to itself.
 */
function definitionAsClause(term) {
  const clause = stripTerminalPeriod(term?.definition);
  if (!clause) return '';
  const name = cleanText(term?.term);
  if (!name) return clause;
  const lead = new RegExp(`^(?:the\\s+)?${escapeRegExp(name)}\\s+(?:is|are|refers to|describes|means)\\s+`, 'i');
  return clause.replace(lead, '');
}

/**
 * v0.14.1 (1.5): a sample answer a grader could actually use as a model —
 * built AROUND the scenario instead of gluing anchor-fact + definition
 * (which "answered" delta-core analysis questions with the bare definition
 * of weathering, twice). Used by both the short-answer and essay
 * projections. Every field is optional; the output stays grammatical with
 * no doubled periods for arbitrary inputs.
 */
export function composeScenarioAnswer(scenario, term, fact, { position = '', counterpoint = '' } = {}) {
  const sentences = [];
  const positionClause = stripTerminalPeriod(position);
  if (positionClause) sentences.push(ensureSentence(`A defensible position: ${positionClause}`));

  // The same source the stem uses: the scenario setup, trimmed to its first
  // sentence and any imperative lead ("Consider/Imagine/Suppose …").
  const setupClause = stripTerminalPeriod(firstSentenceOf(scenario?.setup)).replace(
    /^(?:consider|imagine|suppose(?:\s+that)?|picture|examine)\s+/i,
    '',
  );
  const termName = cleanText(term?.term);
  const definition = definitionAsClause(term);
  if (termName && definition) {
    sentences.push(
      setupClause
        ? ensureSentence(
            `In a scenario where ${lowercaseLead(setupClause)}, this is a case of ${termName}: ${lowercaseLead(definition)}`,
          )
        : ensureSentence(`This is a case of ${termName}: ${lowercaseLead(definition)}`),
    );
  } else if (definition) {
    sentences.push(ensureSentence(definition));
  } else if (setupClause && termName) {
    sentences.push(
      ensureSentence(`In a scenario where ${lowercaseLead(setupClause)}, the concept at work is ${termName}`),
    );
  }

  const factClause = stripTerminalPeriod(fact);
  if (factClause && factClause.toLowerCase() !== definition.toLowerCase()) {
    sentences.push(ensureSentence(`The key supporting evidence: ${lowercaseLead(factClause)}`));
  }

  const counterClause = stripTerminalPeriod(counterpoint);
  sentences.push(
    counterClause
      ? ensureSentence(
          `A strong answer also engages the opposing view — ${lowercaseLead(counterClause)} — and explains why the evidence weighs against it`,
        )
      : 'A strong answer also names one limitation or alternative reading of the evidence.',
  );
  return sentences
    .filter(Boolean)
    .join(' ')
    .replace(/\.{2,}/g, '.')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function buildShortAnswerItem(kernel, index) {
  const term = kernel?.keyTerms?.[0];
  const setup = cleanText(kernel?.scenario?.setup);
  if (!term || !setup) return null;
  const materials = cleanText(kernel?.scenario?.materials) || 'the scenario evidence';
  const fact = bestFactFor(term, kernel.facts) || kernel.facts?.[0] || '';
  return {
    index,
    type: 'short_answer',
    question: `${ensureSentence(setup)} Using ${term.term}, analyze what this evidence shows and justify your conclusion.`,
    options: [],
    answerIndex: 0,
    distractorRationales: [],
    // v0.14.1 (1.5): the model answer engages the scenario instead of gluing
    // anchor-fact + definition.
    answer: composeScenarioAnswer(kernel?.scenario, term, fact),
    explanation: '',
    scoringGuidance: `Full credit requires accurate use of ${term.term}, direct reference to ${materials}, and a defended conclusion; partial credit for correct concepts supported by thin evidence.`,
  };
}

function buildEssayItem(kernel, index) {
  const discussion = kernel?.discussionPrompt;
  const prompt = cleanText(discussion?.prompt);
  if (!prompt) return null;
  const terms = Array.isArray(kernel?.keyTerms) ? kernel.keyTerms : [];
  const term = terms[1] || terms[0];
  const materials = cleanText(kernel?.scenario?.materials) || 'the assigned materials';
  const positions = Array.isArray(discussion?.positions) ? discussion.positions.map(cleanText).filter(Boolean) : [];
  const counterposition = positions[1] ? ` (for example: ${stripTerminalPeriod(positions[1]).toLowerCase()})` : '';
  const sampleFact = term ? bestFactFor(term, kernel.facts) : kernel.facts?.[0] || '';
  return {
    index,
    type: 'essay',
    question: `${ensureSentence(prompt, '?')} Take a position and defend it${
      term ? `, drawing on ${term.term}` : ''
    } and evidence from ${materials}.`,
    options: [],
    answerIndex: 0,
    distractorRationales: [],
    // v0.14.1 (1.5): the model answer takes the position the stem demands and
    // engages the opposing view, instead of position-sentence + fact glue.
    answer: composeScenarioAnswer(kernel?.scenario, term, sampleFact, {
      position: positions[0] || '',
      counterpoint: positions[1] || '',
    }),
    explanation: '',
    scoringGuidance: `Strong responses state a clear position, engage at least one opposing view${counterposition}, and ground every claim in course evidence; weak responses restate the prompt without committing to a position.`,
  };
}

/**
 * Project a validated kernel into the v0.9.1 enrichment surface payload.
 * @param {object} kernel — lint-passed kernel atoms (full key names)
 * @param {object} options — { itemPlan } the compiler's 6-slot quiz plan
 * @returns {object} payload consumed by the existing overlay machinery
 */
export function projectKernelToSurfaces(kernel, { itemPlan = [] } = {}) {
  const mcSlots = itemPlan.filter((slot) => slot.type === 'multiple_choice');
  const shortAnswerSlot = itemPlan.find((slot) => slot.type === 'short_answer');
  const essaySlot = itemPlan.find((slot) => slot.type === 'essay');
  const keyTerms = Array.isArray(kernel?.keyTerms) ? kernel.keyTerms : [];

  const quizItems = [];
  const mcItems = Array.isArray(kernel?.mc) ? kernel.mc : [];
  // Cross-lesson quiz dedupe (v0.14.1 4.6) happens UPSTREAM of this slice: by
  // the time the pool reaches the projection, concept identity is gone
  // (composeLessonFromConcepts flattens per-kernel mcBanks into `kernel.mc`),
  // so the per-concept offsets apply there and this slice only narrows the
  // already-deduped pool to this lesson's MC slots.
  mcItems.slice(0, mcSlots.length).forEach((item, position) => {
    quizItems.push({
      index: mcSlots[position]?.index ?? position,
      type: 'multiple_choice',
      question: cleanText(item.question),
      options: (item.options || []).map(cleanText).filter(Boolean),
      answerIndex: Number(item.answerIndex) || 0,
      distractorRationales: matchDistractorRationales(item, keyTerms),
      answer: '',
      explanation: cleanText(item.explanation),
      scoringGuidance: '',
    });
  });
  if (shortAnswerSlot) {
    const shortAnswer = buildShortAnswerItem(kernel, shortAnswerSlot.index);
    if (shortAnswer) quizItems.push(shortAnswer);
  }
  if (essaySlot) {
    const essay = buildEssayItem(kernel, essaySlot.index);
    if (essay) quizItems.push(essay);
  }
  quizItems.sort((a, b) => a.index - b.index);

  const slideContent = buildSlideContentFromKernel(kernel);
  const discussionPrompt = kernel?.discussionPrompt
    ? {
        prompt: cleanText(kernel.discussionPrompt.prompt),
        tension: cleanText(kernel.discussionPrompt.tension),
        positions: (kernel.discussionPrompt.positions || []).map(cleanText).filter(Boolean),
      }
    : null;
  const assignmentCore = kernel?.assignmentCore
    ? {
        taskDescription: cleanText(kernel.assignmentCore.taskDescription),
        parameters: (kernel.assignmentCore.parameters || []).map(cleanText).filter(Boolean),
      }
    : null;

  // v0.13.3: optional quantitative worked example — projected into the
  // lesson-plan mini-lesson and the study guide.
  const workedExample =
    kernel?.workedExample && cleanText(kernel.workedExample.problem)
      ? {
          problem: cleanText(kernel.workedExample.problem),
          steps: (kernel.workedExample.steps || []).map(cleanText).filter(Boolean),
          result: cleanText(kernel.workedExample.result),
        }
      : null;

  return {
    quizItems,
    keyTerms: keyTerms.map((term) => ({
      term: cleanText(term.term),
      definition: cleanText(term.definition),
      example: cleanText(term.example),
      misconception: cleanText(term.misconception),
      // v0.13.3: the corrective statement rides with the term so study
      // guides pair each misconception with a real correction, not the
      // definition restated.
      correction: cleanText(term.correction),
    })),
    ...(slideContent.length > 0 ? { slideContent } : {}),
    ...(discussionPrompt ? { discussionPrompt } : {}),
    ...(assignmentCore ? { assignmentCore } : {}),
    ...(workedExample ? { workedExample } : {}),
    kernel: {
      facts: Array.isArray(kernel?.facts) ? kernel.facts.map(cleanText).filter(Boolean) : [],
      scenario: kernel?.scenario
        ? { setup: cleanText(kernel.scenario.setup), materials: cleanText(kernel.scenario.materials) }
        : null,
    },
  };
}
