import { lintItemAdmission } from '../itemAdmissionLint.js';

const APPLIED_MCQ_P1_FLOOR = 0.15;
const APPLIED_MCQ_P2_FLOOR = 0.35;
const UNSUPPORTED_INFERENCE_P1_COUNT = 4;
const CONSTRUCTED_RESPONSE_TARGET = 0.5;

/**
 * Small, browser-safe heuristics for detecting whether a multiple-choice stem
 * asks students to reason from a concrete case or evidence. This intentionally
 * does not judge correctness; it catches quiz banks that label recall items as
 * Apply/Analyze/Evaluate without putting anything in the stem to reason about.
 */

const ACTOR_RE =
  /\b(?:user|participant|researcher|team|designer|patient|student|customer|developer|colleague|manager|stakeholder|employee|shopper|reader|learner|client)s?\b/i;
const ACTION_RE =
  /\b(?:says?|asks?|observes?|shows?|notes?|notices?|uses?|finds?|cannot|discovers?|receives?|recruits?|rejects?|fails?|changes?|spends?|adds?|builds?|misunderstands?|struggles?|pauses?|dismisses?|glances?|reports?|argues?|claims?|records?|proposes?|describes?|selects?|places?|offers?|copies?|prioritizes?|prepar(?:e|es|ed|ing)|draft(?:s|ed|ing)?|submit(?:s|ted|ting)?)\b/i;
const EVIDENCE_RE =
  /\b(?:field ?notes?|data|results?|recordings?|quotes?|observations?|tests?|diagrams?|passages?|equations?|tables?|logs?|outputs?|responses?|transcripts?|samples?|stud(?:y|ies)|surveys?|screens?|forms?|interfaces?|prototypes?|wireframes?|behavio(?:u)?rs?|patterns?|cases?|scenarios?|sites?|artifacts?|drafts?|materials?)\b/i;
const REASONING_RE =
  /\b(?:what should|which (?:(?:next|best|first)\s+)?(?:response|interpretation|conclusion|action|step|change|claim|finding|inference|method|evidence|approach|choice|use|move)|how should|what does this|best (?:reflects|explains|supports|addresses)|what (?:problem|issue)|most (?:useful|relevant|clearly|evident)|reveals?|supports?|indicates?|suggests?)\b/i;

function normalizeStem(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractMultipleChoiceQuizStems(paragraphs = []) {
  return extractMultipleChoiceQuizItems(paragraphs).map((item) => item.question);
}

export function extractMultipleChoiceQuizItems(paragraphs = []) {
  const lines = Array.isArray(paragraphs) ? paragraphs : String(paragraphs || '').split(/\r?\n/);
  const items = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = normalizeStem(lines[index]);
    if (/^Answer Key\b/i.test(line)) break;
    const match = /^Q\d+\s*\(\s*Multiple choice\b[^)]*\)\s*:\s*(.+)$/i.exec(line);
    if (!match) continue;
    const options = [];
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const candidate = normalizeStem(lines[cursor]);
      if (/^(?:Q\d+\s*\(|Answer Key\b)/i.test(candidate)) break;
      const option = /^[A-D][.)]\s*(.+)$/i.exec(candidate)?.[1];
      if (option) options.push(normalizeStem(option));
    }
    items.push({ question: normalizeStem(match[1]), options });
  }
  return items;
}

export function extractShortAnswerQuizItems(paragraphs = []) {
  const lines = Array.isArray(paragraphs) ? paragraphs : String(paragraphs || '').split(/\r?\n/);
  const items = [];
  for (const value of lines) {
    const line = normalizeStem(value);
    if (/^Answer Key\b/i.test(line)) break;
    const match = /^Q\d+\s*\(\s*Short answer\b[^)]*\)\s*:\s*(.+)$/i.exec(line);
    if (match) items.push({ question: normalizeStem(match[1]) });
  }
  return items;
}

/**
 * Detect the old deterministic projection frame. Naming a concept can be
 * valid in a focused application task, but this exact frame also generated a
 * model answer whose main move was simply identifying that named concept.
 */
export function isConceptCuedCompilerShortAnswer(stem) {
  const text = normalizeStem(stem);
  return /\b(?:using|use|apply|connect)\s+[A-Z][A-Za-z0-9 &'’/-]{1,60}(?:,|\s+to)\s+(?:analy[sz]e|interpret|state|explain|make|the scenario)\b/i.test(
    text,
  );
}

export function isClaimEvidenceBoundaryShortAnswer(stem) {
  const text = normalizeStem(stem);
  const selectsConcept =
    /\b(?:identify|select|choose|name)\b.{0,80}\b(?:concept|method|framework|principle|rule|lens)\b/i.test(text);
  const usesEvidence =
    /\b(?:cite|use|reference|point to|draw on)\b.{0,80}\b(?:evidence|detail|observation|result|quote|case)\b/i.test(
      text,
    );
  const boundsClaim =
    /\b(?:limit(?:ation)?|boundary|alternative|next piece of evidence|additional evidence|does not prove)\b/i.test(
      text,
    );
  return selectsConcept && usesEvidence && boundsClaim;
}

export function summarizeConstructedResponseDepth(files = []) {
  const items = files.flatMap((file) =>
    extractShortAnswerQuizItems(Array.isArray(file) ? file : file?.paragraphs || file?.text || []),
  );
  const conceptCuedItems = items.filter((item) => isConceptCuedCompilerShortAnswer(item.question));
  const claimEvidenceBoundaryItems = items.filter((item) => isClaimEvidenceBoundaryShortAnswer(item.question));
  return {
    items,
    conceptCuedItems,
    claimEvidenceBoundaryItems,
    total: items.length,
    conceptCued: conceptCuedItems.length,
    claimEvidenceBoundary: claimEvidenceBoundaryItems.length,
    claimEvidenceBoundaryShare: items.length > 0 ? claimEvidenceBoundaryItems.length / items.length : 0,
  };
}

export function isAppliedQuizStem(stem) {
  const text = normalizeStem(stem);
  const wordCount = text.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g)?.length || 0;
  if (wordCount < 12 || !REASONING_RE.test(text)) return false;
  return (ACTOR_RE.test(text) && ACTION_RE.test(text)) || EVIDENCE_RE.test(text);
}

export function summarizeAppliedQuizDepth(files = []) {
  const stems = files.flatMap((file) =>
    extractMultipleChoiceQuizStems(Array.isArray(file) ? file : file?.paragraphs || file?.text || []),
  );
  const appliedStems = stems.filter(isAppliedQuizStem);
  return {
    stems,
    appliedStems,
    total: stems.length,
    applied: appliedStems.length,
    share: stems.length > 0 ? appliedStems.length / stems.length : 0,
  };
}

export function summarizeUnsupportedQuizInferences(files = []) {
  const items = files.flatMap((file) =>
    extractMultipleChoiceQuizItems(Array.isArray(file) ? file : file?.paragraphs || file?.text || []),
  );
  const riskyItems = items.filter((item) => lintItemAdmission(item).some((issue) => issue.startsWith('unsupported-')));
  return {
    items,
    riskyItems,
    total: items.length,
    risky: riskyItems.length,
    share: items.length > 0 ? riskyItems.length / items.length : 0,
  };
}

export function buildQuizDepthFindings(files = []) {
  const findings = [];
  const depth = summarizeAppliedQuizDepth(files);
  const sample = String(depth.stems[0] || '').slice(0, 180);
  if (depth.total >= 12 && depth.share < APPLIED_MCQ_P1_FLOOR) {
    findings.push({
      severity: 'P1',
      dimension: 'substance',
      file: 'quizBank',
      detail: `only ${(depth.share * 100).toFixed(0)}% of multiple-choice stems require reasoning from a concrete case or evidence (<${(APPLIED_MCQ_P1_FLOOR * 100).toFixed(0)}% major-review floor)`,
      evidence: `${depth.applied}/${depth.total} applied stems; sample: ${sample}`,
    });
  } else if (depth.total >= 12 && depth.share < APPLIED_MCQ_P2_FLOOR) {
    findings.push({
      severity: 'P2',
      dimension: 'substance',
      file: 'quizBank',
      detail: `only ${(depth.share * 100).toFixed(0)}% of multiple-choice stems require reasoning from a concrete case or evidence (<${(APPLIED_MCQ_P2_FLOOR * 100).toFixed(0)}% target)`,
      evidence: `${depth.applied}/${depth.total} applied stems; sample: ${sample}`,
    });
  }

  const inference = summarizeUnsupportedQuizInferences(files);
  if (inference.total >= 12 && inference.risky > 0) {
    const major = inference.risky >= UNSUPPORTED_INFERENCE_P1_COUNT;
    findings.push({
      severity: major ? 'P1' : 'P2',
      dimension: 'substance',
      file: 'quizBank',
      detail: `${inference.risky} multiple-choice stem${inference.risky === 1 ? '' : 's'} ask${inference.risky === 1 ? 's' : ''} for an inference that the supplied evidence cannot uniquely support`,
      evidence: String(inference.riskyItems[0]?.question || '').slice(0, 180),
    });
  }

  const constructed = summarizeConstructedResponseDepth(files);
  if (
    constructed.total >= 12 &&
    (constructed.conceptCued >= Math.ceil(constructed.total / 2) ||
      constructed.claimEvidenceBoundaryShare < CONSTRUCTED_RESPONSE_TARGET)
  ) {
    findings.push({
      severity: 'P2',
      dimension: 'substance',
      file: 'quizBank',
      detail:
        'short-answer bank does not consistently require independent concept selection plus claim-evidence-boundary reasoning',
      evidence: `${constructed.conceptCued}/${constructed.total} concept-cued compiler frames; ${constructed.claimEvidenceBoundary}/${constructed.total} explicit claim-evidence-boundary tasks`,
    });
  }
  return findings;
}

export function buildPackageQuizDepthFindings(files = []) {
  return buildQuizDepthFindings(files.filter((file) => file?.featureId === 'quizBank'));
}

export function addPackageQuizDepthFindings(findings, files = []) {
  for (const finding of buildPackageQuizDepthFindings(files)) findings.add(finding);
}
