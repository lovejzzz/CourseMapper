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

import { resolveDecisionScenario } from './scenarioContract';
import { EXACT_SOURCE_LEDGER_PROVENANCE } from './sourceLedgerProvenance';

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

function sentenceCase(text) {
  const cleaned = cleanText(text);
  return cleaned ? `${cleaned.charAt(0).toUpperCase()}${cleaned.slice(1)}` : '';
}

function projectionVariant(seed, variants = []) {
  if (!variants.length) return '';
  const index = Math.max(0, Number(seed) || 0);
  return variants[index % variants.length];
}

function projectionTextSeed(...parts) {
  let hash = 0;
  for (const part of parts) {
    const text = cleanText(part);
    for (let i = 0; i < text.length; i += 1) {
      hash = (hash * 31 + text.charCodeAt(i)) % 9973;
    }
  }
  return hash;
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

const CONTRASTIVE_EXPLANATION_RE =
  /\b(?:whereas|while|but|rather than|instead|unlike|other options?|closest (?:alternative|distractor)|fails?|does not|do not|by contrast)\b/i;

/**
 * Preserve a model-written contrast when it exists. Otherwise, use the
 * authored options to identify the nearest competing answer and add a
 * bounded comparison frame. The compiler contributes no new subject claim:
 * it only points back to the explanation's evidence or decision criterion.
 */
export function ensureContrastiveExplanation(item) {
  const explanation = cleanText(item?.explanation);
  if (!explanation || CONTRASTIVE_EXPLANATION_RE.test(explanation)) return explanation;
  const options = Array.isArray(item?.options) ? item.options.map(cleanText).filter(Boolean) : [];
  const answerIndex = Number(item?.answerIndex);
  const distractors = options
    .map((option, index) => ({ option, index, score: overlapScore(option, explanation) }))
    .filter(({ index }) => index !== answerIndex)
    .sort((left, right) => right.score - left.score || left.index - right.index);
  const closest = distractors[0]?.option;
  if (!closest) return explanation;
  return `${ensureSentence(explanation)} By contrast, “${stripTerminalPeriod(closest)}” does not address the same evidence or decision criterion.`;
}

function bestShortAnswerTerm(kernel) {
  const terms = Array.isArray(kernel?.keyTerms)
    ? kernel.keyTerms.filter((term) => cleanText(term?.term) && cleanText(term?.definition))
    : [];
  if (terms.length < 2) return terms[0] || null;
  const setup = cleanText(kernel?.scenario?.setup);
  const materials = cleanText(kernel?.scenario?.materials);
  if (!setup && !materials) return terms[0];

  const ranked = terms
    .map((term, index) => {
      const labelScore = overlapScore(term.term, setup) * 4 + overlapScore(term.term, materials) * 2;
      return {
        term,
        index,
        labelScore,
        score:
          labelScore +
          overlapScore(`${term.definition} ${term.example || ''}`, setup) +
          overlapScore(`${term.definition} ${term.example || ''}`, materials) * 0.5,
      };
    })
    .sort((a, b) => b.score - a.score || a.index - b.index);
  const best = ranked[0];
  const first = ranked.find((candidate) => candidate.index === 0);
  // The first term is the model's intended anchor. Override it only when a
  // different term's NAME appears in the evidence packet and its total fit is
  // stronger. Definition-only overlap can be a false friend (for example,
  // "reflects" selecting Albedo in a CO2 scenario that "reflects a signal").
  return best.index !== 0 && best.labelScore > 0 && best.score > first.score ? best.term : first.term;
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

// v0.15.187 (live crucible P1 class): a period-stripped bullet that happens
// to end on a preposition/auxiliary ("…can be iterated over") reads as a
// truncated line in the PPTX text audit. Bullets ending on a dangling
// function word keep their sentence punctuation instead.
const DANGLING_TAIL_RE =
  /\b(?:a|an|the|and|or|but|nor|so|yet|to|of|in|on|at|by|for|with|from|into|onto|over|under|between|through|during|before|after|about|against|toward|towards|per|via|as|than|that|this|these|those|is|are|was|were|be|been|being|can|could|should|would|may|might|must|will|shall|if|because|while|when|where|which|who|whom|whose|not|without|within)$/i;

function pickBullets(candidates, count) {
  const bullets = [];
  for (const candidate of candidates) {
    const text = stripTerminalPeriod(candidate);
    // Canonical fact admission accepts complete facts through 24 words (the
    // browser prompt asks for a tighter 8-20). The projector used to reject
    // 19-24 word facts here, so a valid ledger or cited genome kernel could
    // produce no slide, fail kernel usability, and buy two futile retries.
    // Keep the slide boundary identical to the model/admission boundary.
    if (!text || wordCount(text) > 24 || wordCount(text) < 3) continue;
    if (bullets.some((existing) => existing.toLowerCase() === text.toLowerCase())) continue;
    bullets.push(DANGLING_TAIL_RE.test(text) ? `${text}.` : text);
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
export function composeScenarioAnswer(scenario, term, fact, { position = '', counterpoint = '', seed = 0 } = {}) {
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
          projectionVariant(seed, [
            `A well-supported answer names the opposing view — ${lowercaseLead(counterClause)} — and then shows why the evidence favors the main claim`,
            `The opposing view — ${lowercaseLead(counterClause)} — deserves attention, but this answer shows why the lesson evidence points the other way`,
            `A complete response names the opposing view — ${lowercaseLead(counterClause)} — then weighs it against the stronger evidence`,
            `The opposing view matters — ${lowercaseLead(counterClause)} — so the answer should explain why it does not overturn the main claim`,
            `The answer should test the opposing view — ${lowercaseLead(counterClause)} — against the same evidence before reaching its conclusion`,
            `A strong response acknowledges the opposing view — ${lowercaseLead(counterClause)} — while explaining why the lesson evidence supports a different judgment`,
          ]),
        )
      : projectionVariant(seed, [
          'A strong answer also names one limitation or alternative reading of the evidence.',
          'A complete answer also marks what the evidence does not prove.',
          'Strong responses add one boundary, tradeoff, or competing interpretation.',
          'The strongest answer names a plausible limit so the claim stays honest.',
        ]),
  );
  return sentences
    .filter(Boolean)
    .join(' ')
    .replace(/\.{2,}/g, '.')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function scenarioEvidenceRequirement(setup, evidenceNoun = 'case') {
  const text = cleanText(setup);
  const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  const hasMultipleClauses = /[,;]\s*(?:and|but|then|while)\b|\b(?:but|while|whereas|then)\b/i.test(text);
  return sentences.length >= 2 || hasMultipleClauses
    ? `at least two ${evidenceNoun} details`
    : `the decisive ${evidenceNoun} detail`;
}

/**
 * A short-answer key for the evidence-selection task below. Unlike the essay
 * answer, this deliberately does not hand students a position. It models the
 * four moves the stem asks them to make: select the concept, bound the claim,
 * cite the case, and state what more evidence would be needed.
 */
function composeFactLedgerComparisonAnswer(term, facts, scenario, seed = 0) {
  const termName = cleanText(term?.term);
  const claims = Array.isArray(facts)
    ? facts
        .map((claim) => stripTerminalPeriod(claim))
        .filter(Boolean)
        .slice(0, 3)
    : [];
  if (cleanText(term?.source) !== 'fact-ledger-projection' || !termName || claims.length < 3) return '';

  if (isCompactFactLedgerScenario(term, scenario)) {
    return projectionVariant(seed, [
      `The relevant concept is ${termName}. Claim A provides its direct definition: ${claims[0]}. Claim B adds this related proposition: ${claims[1]}. The bounded conclusion is that Claim A supplies the definition while Claim B introduces a second claim to analyze alongside it. The cards do not establish that one follows from the other; that relationship requires an argument or evidence.`,
      `Use ${termName} to organize the response. The definition card is Claim A: ${claims[0]}. Claim B contributes a separate but related claim: ${claims[1]}. These statements can be compared, but neither card demonstrates how the second follows from the first. A defensible synthesis must remain provisional until an argument or evidence links them.`,
      `The course concept is ${termName}. Start with Claim A: ${claims[0]}. Then add Claim B: ${claims[1]}. Together, the cards identify two ideas for analysis. They do not prove a logical connection between them, so any stronger synthesis needs an argument or additional evidence.`,
    ]);
  }

  return [
    'A qualified answer is warranted until the supplied claims are tested.',
    ensureSentence(`Use ${termName} as the relevant lens`),
    ensureSentence(`Claim A states: ${claims[0]}`),
    ensureSentence(`Claim B states: ${claims[1]}`),
    'These are the decisive details. The cards state positions; they do not prove any position correct.',
    'Claim C must also test the conclusion.',
    'Resolving the issue requires evidence, not repetition.',
  ]
    .filter(Boolean)
    .join(' ')
    .replace(/\.{2,}/g, '.')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function isCompactFactLedgerScenario(term, scenario) {
  const setup = cleanText(scenario?.setup);
  return (
    cleanText(term?.source) === 'fact-ledger-projection' &&
    /\bClaim A:/i.test(setup) &&
    /\bClaim B:/i.test(setup) &&
    !/\bClaim C:/i.test(setup)
  );
}

const FACT_RELATION_VERB_RE =
  /^(.{1,100}?)\s+(?:means?|refers?\s+to|records?|states?|expresses?|marks?|identifies?|locates?|names?|indicates?|represents?|describes?|is|are)\b/i;

function compactSemanticText(value) {
  return cleanText(value)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, '');
}

function relationSubject(fact) {
  const match = stripTerminalPeriod(fact).match(FACT_RELATION_VERB_RE);
  if (!match?.[1]) return '';
  const subject = cleanText(match[1]).replace(/^["“”']+|["“”',:;]+$/g, '');
  const tokens = subject.match(/[\p{L}\p{M}\p{N}]+/gu) || [];
  return tokens.length >= 1 && tokens.length <= 10 ? subject : '';
}

function relationSubjectAppearsInAnchor(subject, anchor) {
  const compactSubject = compactSemanticText(subject);
  const compactAnchor = compactSemanticText(anchor);
  if (!compactSubject || !compactAnchor) return false;
  if (compactSubject.length >= 4 && compactAnchor.includes(compactSubject)) return true;

  const fragments = (
    cleanText(subject)
      .normalize('NFKC')
      .toLowerCase()
      .match(/[\p{L}\p{M}\p{N}]+/gu) || []
  ).filter((fragment) => fragment.length > 1 || /[^\x00-\x7f]/.test(fragment));
  if (fragments.length < 2) return false;
  const matched = fragments.filter((fragment) => compactAnchor.includes(compactSemanticText(fragment)));
  return matched.length >= 2 && matched.length / fragments.length >= 0.75;
}

/**
 * Find two independently stated relations that are visibly present inside a
 * broader anchor fact. This is deliberately narrower than semantic
 * similarity: if the exact subjects cannot be traced into the anchor, the
 * generic evidence-bounded projection remains in control.
 */
function factLedgerRelationContext(kernel) {
  const terms = Array.isArray(kernel?.keyTerms) ? kernel.keyTerms : [];
  const projectionTerm = terms.find((term) => cleanText(term?.source) === 'fact-ledger-projection');
  const facts = Array.isArray(kernel?.facts) ? kernel.facts.map(stripTerminalPeriod).filter(Boolean) : [];
  if (facts.length < 3) return null;
  const exactLedger =
    kernel?.provenance?.source === EXACT_SOURCE_LEDGER_PROVENANCE &&
    kernel?.provenance?.copiedFactsVerbatim === true &&
    Number(kernel?.provenance?.factCount) === facts.length;
  if (!projectionTerm && !exactLedger) return null;
  const termName = cleanText(projectionTerm?.term || kernel?.projectionLabel || terms[0]?.term);
  if (!termName) return null;

  for (let anchorIndex = 0; anchorIndex < facts.length; anchorIndex += 1) {
    const anchor = facts[anchorIndex];
    const supports = facts
      .map((fact, factIndex) => ({ fact, factIndex, subject: relationSubject(fact) }))
      .filter(
        ({ factIndex, subject }) =>
          factIndex !== anchorIndex && subject && relationSubjectAppearsInAnchor(subject, anchor),
      );
    for (let leftIndex = 0; leftIndex < supports.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < supports.length; rightIndex += 1) {
        const left = supports[leftIndex];
        const right = supports[rightIndex];
        if (compactSemanticText(left.subject) === compactSemanticText(right.subject)) continue;
        return { anchor, left, right, termName };
      }
    }
  }
  return null;
}

function buildFactLedgerRelationShortAnswer(kernel, index) {
  const relation = factLedgerRelationContext(kernel);
  if (!relation) return null;
  const { anchor, left, right } = relation;
  return {
    index,
    type: 'short_answer',
    projectionKind: 'fact-ledger-relation-analysis',
    question: `Use the exact course evidence to identify the role of each concept—${left.subject} and ${right.subject}—in “${anchor}.” Explain the different information each contributes, then state one limitation on what the combined statement establishes.`,
    options: [],
    answerIndex: 0,
    distractorRationales: [],
    answer: `For ${left.subject}, the ledger states: ${ensureSentence(left.fact)} For ${right.subject}, it states: ${ensureSentence(right.fact)} These are distinct parts of the complete statement: ${ensureSentence(anchor)} The ledger establishes only those stated contributions, not an unstated use or interpretation.`,
    explanation: '',
    scoringGuidance: `Full credit requires three visible moves: accurately explain ${left.subject} from its cited fact, accurately explain ${right.subject} from its cited fact, and connect both to the complete statement without swapping or expanding their roles.`,
  };
}

function buildFactLedgerRelationEssay(kernel, index) {
  const relation = factLedgerRelationContext(kernel);
  if (!relation) return null;
  const { anchor, left, right, termName } = relation;
  return {
    index,
    type: 'essay',
    projectionKind: 'fact-ledger-relation-synthesis',
    question: `Reconstruct ${termName} through “${anchor}” as an evidence chain. First explain ${left.subject}; then explain ${right.subject}; finally show how the two stated relations account for different parts of the complete statement. Use only the course fact ledger.`,
    options: [],
    answerIndex: 0,
    distractorRationales: [],
    answer: `The first link is ${ensureSentence(left.fact)} The second link is ${ensureSentence(right.fact)} Together, the links preserve two different contributions within the anchor statement: ${ensureSentence(anchor)}`,
    explanation: '',
    scoringGuidance: `A complete response keeps ${left.subject} and ${right.subject} distinct, cites both supporting facts accurately, and reconnects them to the anchor without adding an unstated disciplinary claim.`,
  };
}

function composeEvidenceBoundedShortAnswer(
  scenario,
  term,
  fact,
  seed = 0,
  facts = [],
  { compactFactLedgerAnswers = true } = {},
) {
  const factLedgerAnswer = compactFactLedgerAnswers
    ? composeFactLedgerComparisonAnswer(term, facts, scenario, seed)
    : '';
  if (factLedgerAnswer) return factLedgerAnswer;

  const sentences = [];
  const termName = cleanText(term?.term);
  const definition = definitionAsClause(term);
  // The question already presents the complete decision record. The model
  // answer should cite its decisive case detail, not paste the entire prompt
  // (including the learner directions) back into the answer key.
  const fullSetup = stripTerminalPeriod(cleanText(scenario?.setup));
  const setup = (compactFactLedgerAnswers ? firstSentenceOf(fullSetup) : fullSetup).replace(
    /^(?:consider|imagine|suppose(?:\s+that)?|picture|examine)\s+/i,
    '',
  );
  const materials = stripTerminalPeriod(cleanText(scenario?.materials));
  const factClause = stripTerminalPeriod(fact);
  const variantSeed = projectionTextSeed(seed, termName, definition, setup, materials, factClause);

  if (termName && definition) {
    sentences.push(
      ensureSentence(
        projectionVariant(variantSeed, [
          `The best-supported concept is ${termName}`,
          `${termName} is the strongest interpretive lens here`,
          `The evidence points first to ${termName}`,
          `Use ${termName} to frame the conclusion`,
          `The most defensible method is ${termName}`,
          `${termName} best fits the decision in this case`,
        ]),
      ),
    );
    sentences.push(ensureSentence(sentenceCase(definition)));
  } else if (termName) {
    sentences.push(ensureSentence(`The most relevant concept or method is ${termName}`));
  } else if (definition) {
    sentences.push(ensureSentence(definition));
  }

  if (setup) {
    sentences.push(
      ensureSentence(
        projectionVariant(variantSeed + 1, [
          `The decisive evidence comes from this case. ${sentenceCase(setup)}`,
          `The case establishes the relevant context. ${sentenceCase(setup)}`,
          `Start with this observable situation. ${sentenceCase(setup)}`,
          `This context defines the decision. ${sentenceCase(setup)}`,
          `The supplied case sets the boundary. ${sentenceCase(setup)}`,
          `This detail anchors the interpretation. ${sentenceCase(setup)}`,
        ]),
      ),
    );
  }
  if (factClause && factClause.toLowerCase() !== definition.toLowerCase()) {
    sentences.push(
      ensureSentence(
        projectionVariant(variantSeed + 2, [
          `The disciplinary anchor is that ${lowercaseLead(factClause)}`,
          `Course evidence adds that ${lowercaseLead(factClause)}`,
          `The key disciplinary principle is that ${lowercaseLead(factClause)}`,
          `This interpretation is grounded by the fact that ${lowercaseLead(factClause)}`,
          `The relevant course claim is that ${lowercaseLead(factClause)}`,
          `A second anchor comes from the lesson: ${lowercaseLead(factClause)}`,
        ]),
      ),
    );
  }

  sentences.push(
    materials
      ? ensureSentence(
          projectionVariant(variantSeed + 3, [
            `Use ${lowercaseLead(materials)} to test this interpretation. The supplied evidence supports a bounded next decision, not a broader causal claim without additional evidence`,
            `Check the conclusion against ${lowercaseLead(materials)}. Those materials justify the next decision but cannot establish a wider cause without more evidence`,
            `${sentenceCase(materials)} can support this limited recommendation. Those materials do not prove that the same explanation applies beyond the case`,
            `Test the claim with ${lowercaseLead(materials)}. Keep the boundary explicit. The evidence guides this decision. Broader generalization needs another source`,
            `The evidence check is ${lowercaseLead(materials)}. It supports a case-specific action, not an unrestricted causal conclusion`,
            `Ground the recommendation in ${lowercaseLead(materials)}. Name the remaining limitation before extending the claim`,
          ]),
        )
      : 'The supplied evidence supports a bounded interpretation and next decision, not a broader causal claim without additional evidence.',
  );

  return sentences
    .filter(Boolean)
    .join(' ')
    .replace(/\.{2,}/g, '.')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function buildShortAnswerItem(kernel, index, seed = 0, { compactFactLedgerAnswers = true } = {}) {
  const term = bestShortAnswerTerm(kernel);
  if (!term || !cleanText(term.term)) return null;
  const relationItem = buildFactLedgerRelationShortAnswer(kernel, index);
  if (relationItem) return relationItem;
  const setup = cleanText(kernel?.scenario?.setup);
  const fact = bestFactFor(term, kernel.facts) || kernel.facts?.[0] || '';
  // Genome-linked lessons often arrive without a course-layer scenario
  // (composeLessonFromConcepts leaves scenario null until the model authors
  // one). The term's own example or the anchor fact still grounds a real
  // item — the only alternative is the subject-free template frame.
  const exampleAnchor = cleanText(term.example) || cleanText(fact);
  if (!setup && !exampleAnchor) return null;
  const materials =
    stripTerminalPeriod(kernel?.scenario?.materials) || (setup ? 'the scenario evidence' : 'the lesson example');
  if (cleanText(kernel?.scenario?.source) === 'assigned-reading-projection') {
    return {
      index,
      type: 'short_answer',
      question: `Using ${materials}, state a defensible interpretation of ${cleanText(term.term)}. Identify one formal detail, explain its effect, test a counter-reading, and name what another passage could change.`,
      options: [],
      answerIndex: 0,
      distractorRationales: [],
      answer: `Answers will vary with the selected passage. A strong response identifies a locatable formal detail, explains how it warrants the interpretation of ${cleanText(term.term)}, tests one plausible counter-reading against the same passage, and keeps the conclusion open to revision by another passage.`,
      explanation: '',
      scoringGuidance: `Score four visible moves: locatable passage evidence, a named formal feature, an interpretive warrant, and a tested counter-reading or evidence boundary. Plot summary alone is incomplete.`,
    };
  }
  const compactFactLedgerScenario = isCompactFactLedgerScenario(term, kernel?.scenario);
  const evidenceRequirement = scenarioEvidenceRequirement(
    setup || exampleAnchor,
    compactFactLedgerScenario ? 'claim-card' : setup ? 'case' : 'example',
  );
  const variantSeed = projectionTextSeed(seed, term.term, setup, materials, evidenceRequirement, index);
  const scoringGuidance = projectionVariant(variantSeed, [
    `Full credit requires four visible moves. Name ${term.term} and state a bounded conclusion. Cite ${materials}, then identify one limitation or next piece of evidence. A definition alone is not enough.`,
    `Full credit requires ${term.term} and a case-bounded claim. The response must use ${materials} and state a limitation or additional evidence need. A definition alone is not enough.`,
    `Look for ${term.term}, a defensible conclusion, and explicit use of ${materials}. The response also needs one boundary or next evidence request. Missing any move keeps the answer incomplete.`,
    `Score four moves: a relevant method, a bounded conclusion, case evidence from ${materials}, and a limitation. Terminology recall alone is not analysis.`,
    `A complete response identifies ${term.term} and ties its conclusion to ${materials}. It limits the claim and names what evidence would change the decision.`,
    `Full-credit work shows this reasoning trace: ${term.term} → conclusion → evidence in ${materials}. It ends with a boundary or next evidence request.`,
  ]);
  const questionTail = compactFactLedgerScenario
    ? projectionVariant(variantSeed + 1, [
        'Use both cards in the answer and keep the conclusion bounded.',
        'Support the comparison with both cards and avoid claiming more than they establish.',
        'Cite both cards, then keep the synthesis within the evidence provided.',
      ])
    : setup
      ? projectionVariant(variantSeed + 1, [
          `Do not assume a hidden cause. Identify the most relevant course concept or method. State the best-supported conclusion. Cite ${evidenceRequirement}. Name one limitation or next piece of evidence.`,
          `Select the course concept or method that best fits. Give a bounded conclusion. Cite ${evidenceRequirement}. Identify one limitation or additional evidence need.`,
          `Name the most defensible course lens. Explain what the case supports. Point to ${evidenceRequirement}. State one boundary or next piece of evidence.`,
          `Choose the relevant concept or method without inferring hidden motives. Use ${evidenceRequirement} to justify the conclusion. Name one limitation.`,
          `Identify the course principle that should guide the decision. Cite ${evidenceRequirement}. Distinguish support from assumption. Request one next piece of evidence.`,
          `Identify the course method that best explains the evidence. State a case-bounded conclusion. Reference ${evidenceRequirement}. Name one alternative or limitation.`,
        ])
      : `Identify the most relevant course concept or method. Explain the best-supported conclusion. Cite ${evidenceRequirement}. Name one boundary or next piece of evidence.`;
  return {
    index,
    type: 'short_answer',
    question: `${ensureSentence(setup || exampleAnchor)} ${questionTail}`,
    options: [],
    answerIndex: 0,
    distractorRationales: [],
    // v0.14.1 (1.5): the model answer engages the scenario instead of gluing
    // anchor-fact + definition.
    answer: composeEvidenceBoundedShortAnswer(kernel?.scenario, term, fact, variantSeed, kernel?.facts, {
      compactFactLedgerAnswers,
    }),
    explanation: '',
    scoringGuidance,
  };
}

function buildEssayItem(kernel, index, seed = 0) {
  const discussion = kernel?.discussionPrompt;
  const terms = Array.isArray(kernel?.keyTerms) ? kernel.keyTerms : [];
  if (cleanText(kernel?.scenario?.source) === 'assigned-reading-projection' && terms.length > 0) {
    const term = terms[1] || terms[0];
    const materials = stripTerminalPeriod(kernel?.scenario?.materials) || 'the assigned text';
    return {
      index,
      type: 'essay',
      question: `Compare two plausible interpretations of ${cleanText(term.term)} using ${materials}. Defend the stronger reading through a formal feature, answer the best counter-reading, and limit the conclusion to what the selected passage supports.`,
      options: [],
      answerIndex: 0,
      distractorRationales: [],
      answer: `Answers will vary with the selected passage. Strong work makes the two interpretations genuinely distinct, shows how a formal feature favors one reading, treats the counter-reading fairly, and narrows the conclusion where the passage or its context remains inconclusive.`,
      explanation: '',
      scoringGuidance:
        'Look for a contestable claim, locatable passage evidence, analysis of form, a substantive counter-reading, and an evidence-bounded conclusion. Summary or unsupported preference does not earn full credit.',
    };
  }
  const relationItem = buildFactLedgerRelationEssay(kernel, index);
  if (relationItem) return relationItem;
  let prompt = cleanText(discussion?.prompt);
  let term = terms[1] || terms[0];
  let positions = Array.isArray(discussion?.positions) ? discussion.positions.map(cleanText).filter(Boolean) : [];
  if (!prompt) {
    // No course-layer debate (typical for genome-linked lessons): a term
    // carrying both a misconception and its correction is itself a real,
    // gradeable evaluative prompt — students must weigh the plausible-but-
    // wrong claim against the corrective evidence.
    const contested = terms.find(
      (candidate) => cleanText(candidate?.misconception) && cleanText(candidate?.correction),
    );
    if (!contested) return null;
    term = contested;
    prompt = `A common claim about ${cleanText(contested.term)} is: "${stripTerminalPeriod(
      cleanText(contested.misconception),
    )}." Evaluate this claim — what does the course evidence actually support?`;
    positions = [cleanText(contested.correction), cleanText(contested.misconception)];
  }
  const materials = stripTerminalPeriod(kernel?.scenario?.materials) || 'the assigned materials';
  const counterposition = positions[1] ? ` (for example: ${stripTerminalPeriod(positions[1]).toLowerCase()})` : '';
  const sampleFact = term ? bestFactFor(term, kernel.facts) : kernel.facts?.[0] || '';
  const variantSeed = projectionTextSeed(seed, prompt, term?.term, materials, positions[0], positions[1], index);
  const scoringGuidance = projectionVariant(variantSeed, [
    `Strong responses commit to a position, test the counterargument${counterposition}, and keep every claim tied to course evidence; weak responses summarize without deciding.`,
    `Full-credit essays make a claim, explain why a plausible alternative falls short${counterposition}, and ground each major point in the assigned materials.`,
    `Look for a clear position, at least one opposing view${counterposition}, and evidence for each major claim. Responses that restate the prompt without taking a stand need revision.`,
    `Score the essay by tracing claim, counterclaim, evidence, and conclusion; unsupported position statements should not receive full credit.`,
    `High-scoring essays identify the strongest opposing view${counterposition}, answer it with course evidence, and make the final judgment explicit.`,
    `Use the rubric to check position, counterposition, evidence quality, and conclusion; broad opinion without course evidence remains incomplete.`,
  ]);
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
      seed: projectionTextSeed(prompt, term?.term, sampleFact, positions[0], positions[1]),
    }),
    explanation: '',
    scoringGuidance,
  };
}

/**
 * Project a validated kernel into the v0.9.1 enrichment surface payload.
 * @param {object} kernel — lint-passed kernel atoms (full key names)
 * @param {object} options — { itemPlan } the compiler's 6-slot quiz plan
 * @returns {object} payload consumed by the existing overlay machinery
 */
export function projectKernelToSurfaces(
  kernel,
  { itemPlan = [], compactFactLedgerAnswers = true, compactFactLedgerScenarios = true } = {},
) {
  const resolvedScenario = resolveDecisionScenario(kernel, { compactFactLedgerScenarios });
  const resolvedKernel = { ...kernel, scenario: resolvedScenario };
  const mcSlots = itemPlan.filter((slot) => slot.type === 'multiple_choice');
  const shortAnswerSlot = itemPlan.find((slot) => slot.type === 'short_answer');
  const essaySlot = itemPlan.find((slot) => slot.type === 'essay');
  const keyTerms = Array.isArray(resolvedKernel?.keyTerms) ? resolvedKernel.keyTerms : [];

  const quizItems = [];
  const mcItems = Array.isArray(resolvedKernel?.mc) ? resolvedKernel.mc : [];
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
      explanation: ensureContrastiveExplanation(item),
      scoringGuidance: '',
    });
  });

  // v0.14.3 D1(b)+D3: the (already offset-deduped) pool often holds more
  // authored items than the plan has slots — content the lesson paid for but
  // never showed. Take a clean PREFIX of the unused tail (prefix semantics
  // keep the linker's course-level consumption cursor honest: consumed items
  // are always pool[0..n-1], so a repeated concept never re-draws one):
  //   - the first unused item becomes `mcWalkthrough` — recast downstream as
  //     a worked-example slide (stem = scenario, key = resolution,
  //     explanation = the why);
  //   - the next up-to-2 items become extension quiz items at the indices
  //     after the plan (slots 7-8 of the weekly quiz), flagged
  //     `extension: true` so the compiler appends them without minting frames.
  // An item that fails the validity screen ends the prefix; everything after
  // it stays in the bank for later lessons of the same concept.
  let mcWalkthrough = null;
  if (mcSlots.length > 0) {
    const usableReserve = [];
    for (const item of mcItems.slice(mcSlots.length)) {
      const options = (item?.options || []).map(cleanText).filter(Boolean);
      if (!cleanText(item?.question) || options.length !== 4 || !cleanText(item?.explanation)) break;
      usableReserve.push({ ...item, options });
      if (usableReserve.length >= 3) break;
    }
    const [walkthroughItem, ...extensionItems] = usableReserve;
    if (walkthroughItem) {
      mcWalkthrough = {
        question: cleanText(walkthroughItem.question),
        options: walkthroughItem.options,
        answerIndex: Number(walkthroughItem.answerIndex) || 0,
        explanation: ensureContrastiveExplanation(walkthroughItem),
      };
    }
    const extensionBase = itemPlan.reduce((max, slot) => Math.max(max, Number(slot?.index) || 0), -1) + 1;
    extensionItems.slice(0, 2).forEach((item, position) => {
      quizItems.push({
        index: extensionBase + position,
        type: 'multiple_choice',
        extension: true,
        question: cleanText(item.question),
        options: item.options,
        answerIndex: Number(item.answerIndex) || 0,
        distractorRationales: matchDistractorRationales(item, keyTerms),
        answer: '',
        explanation: ensureContrastiveExplanation(item),
        scoringGuidance: '',
      });
    });
  }
  if (shortAnswerSlot) {
    const lessonSeed = projectionTextSeed(
      resolvedKernel?.scenario?.setup,
      resolvedKernel?.scenario?.materials,
      resolvedKernel?.keyTerms?.[0]?.term,
      resolvedKernel?.discussionPrompt?.prompt,
    );
    const shortAnswer = buildShortAnswerItem(resolvedKernel, shortAnswerSlot.index, lessonSeed, {
      compactFactLedgerAnswers,
    });
    if (shortAnswer) quizItems.push(shortAnswer);
  }
  if (essaySlot) {
    const lessonSeed = projectionTextSeed(
      resolvedKernel?.scenario?.setup,
      resolvedKernel?.scenario?.materials,
      resolvedKernel?.keyTerms?.[0]?.term,
      resolvedKernel?.discussionPrompt?.prompt,
    );
    const essay = buildEssayItem(resolvedKernel, essaySlot.index, lessonSeed);
    if (essay) quizItems.push(essay);
  }
  quizItems.sort((a, b) => a.index - b.index);

  const slideContent = buildSlideContentFromKernel(resolvedKernel);
  const discussionPrompt = resolvedKernel?.discussionPrompt
    ? {
        prompt: cleanText(resolvedKernel.discussionPrompt.prompt),
        tension: cleanText(resolvedKernel.discussionPrompt.tension),
        positions: (resolvedKernel.discussionPrompt.positions || []).map(cleanText).filter(Boolean),
      }
    : null;
  const assignmentCore = resolvedKernel?.assignmentCore
    ? {
        taskDescription: cleanText(resolvedKernel.assignmentCore.taskDescription),
        parameters: (resolvedKernel.assignmentCore.parameters || []).map(cleanText).filter(Boolean),
      }
    : null;
  const experientialActivity =
    resolvedKernel?.experientialActivity && typeof resolvedKernel.experientialActivity === 'object'
      ? resolvedKernel.experientialActivity
      : null;

  // v0.13.3: optional quantitative worked example — projected into the
  // lesson-plan mini-lesson and the study guide.
  const workedExample =
    resolvedKernel?.workedExample && cleanText(resolvedKernel.workedExample.problem)
      ? {
          problem: cleanText(resolvedKernel.workedExample.problem),
          steps: (resolvedKernel.workedExample.steps || []).map(cleanText).filter(Boolean),
          result: cleanText(resolvedKernel.workedExample.result),
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
      // v0.14.1 round-2 (fix 4): optional romanization (language courses)
      // survives projection so study guides and slides can render
      // "term (romanization)".
      ...(cleanText(term.romanization) ? { romanization: cleanText(term.romanization) } : {}),
    })),
    ...(slideContent.length > 0 ? { slideContent } : {}),
    ...(discussionPrompt ? { discussionPrompt } : {}),
    ...(assignmentCore ? { assignmentCore } : {}),
    ...(experientialActivity ? { experientialActivity } : {}),
    ...(workedExample ? { workedExample } : {}),
    // v0.14.3 D1(b): one genuinely unused bank item for the deck's second
    // application slide — never the same item the quiz slots consumed.
    ...(mcWalkthrough ? { mcWalkthrough } : {}),
    kernel: {
      facts: Array.isArray(resolvedKernel?.facts) ? resolvedKernel.facts.map(cleanText).filter(Boolean) : [],
      scenario: resolvedKernel?.scenario
        ? {
            setup: cleanText(resolvedKernel.scenario.setup),
            materials: cleanText(resolvedKernel.scenario.materials),
            source: cleanText(resolvedKernel.scenario.source) || 'authored',
          }
        : null,
    },
  };
}
