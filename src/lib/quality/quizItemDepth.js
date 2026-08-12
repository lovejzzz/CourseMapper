import { lintItemAdmission } from '../itemAdmissionLint.js';

const APPLIED_MCQ_P1_FLOOR = 0.15;
const APPLIED_MCQ_P2_FLOOR = 0.35;
const UNSUPPORTED_INFERENCE_P1_COUNT = 4;
const CONSTRUCTED_RESPONSE_TARGET = 0.5;
const SOURCE_BOUND_RECOVERY_RE =
  /This recovery item assesses source use without fabricating a disciplinary answer key after the local knowledge kernel failed admission\./gi;

/**
 * Small, browser-safe heuristics for detecting whether a multiple-choice stem
 * asks students to reason from a concrete case or evidence. This intentionally
 * does not judge correctness; it catches quiz banks that label recall items as
 * Apply/Analyze/Evaluate without putting anything in the stem to reason about.
 */

const ACTOR_RE =
  /\b(?:you|user|participant|researcher|team|designer|patient|student|customer|developer|colleague|manager|stakeholder|employee|shopper|reader|learner|client|musician|composer|engineer|analyst|historian|clinician|instructor|teacher|trainer|parent|child|infant|person|worker|executive|chief executive|ceo|board member|board|employer|applicant|nurse|consumer|owner|dog|puppy|animal|company|corporation|organization|firm|factory|manufacturer|supplier|vendor|non-governmental organization|ngo|regulator|agency|hospital|plant)s?\b/i;
const ACTION_RE =
  /\b(?:says?|asks?|requests?|observes?|observed|shows?|notes?|notices?|uses?|takes?|removes?|rewards?|sits?|salivates?|stops?|searches?|pours?|memorizes?|recalls?|learns?|pairs?|rings?|triggers?|finds?|cannot|creates?|discovers?|receives?|recruits?|rejects?|fails?|changes?|spends?|adds?|builds?|misunderstands?|struggles?|pauses?|dismisses?|glances?|reports?|argues?|claims?|records?|proposes?|describes?|selects?|places?|offers?|copies?|prioritizes?|examines?|examined|analy[sz](?:e|es|ed|ing)|evaluat(?:e|es|ed|ing)|compares?|compared|reads?|measures?|measured|interprets?|interpreted|prepar(?:e|es|ed|ing)|draft(?:s|ed|ing)?|submit(?:s|ted|ting)?|decides?|chooses?|cuts?|reduces?|ignores?|owns?|buys?|purchases?|signs?|hires?|fires?|sues?|advertises?|refuses?|launches?|violates?|operates?|discloses?|donates?|causes?|harms?|increases?|decreases?|implements?|adheres?|focuses?|covers?|adjusts?|switches?|employs?|requires?|threatens?|protests?|injures?)\b/i;
const EVIDENCE_RE =
  /\b(?:evidence|field ?notes?|data|results?|reports?|recordings?|quotes?|observations?|tests?|diagrams?|passages?|excerpts?|scores?|charts?|maps?|images?|specimens?|documents?|sources?|worksheets?|ledger lines?|equations?|tables?|logs?|outputs?|responses?|transcripts?|samples?|stud(?:y|ies)|surveys?|screens?|forms?|interfaces?|prototypes?|wireframes?|behavio(?:u)?rs?|patterns?|cases?|scenarios?|sites?|artifacts?|drafts?|materials?)\b/i;
const REASONING_RE =
  /\b(?:based on (?:this|these|the) evidence|evaluate(?: the claim)?|why is (?:this|the\s+\w+)|what should|what concept (?:best )?(?:justifies|explains|applies)|what (?:ethical )?concept does (?:this|the)|what is (?:the )?(?:\w+\s+){0,4}(?:outcome|impact|risk|benefit|cause|response|purpose|flaw|issue|concern|way|violation|interpretation|course of action|regulatory action|immediate action)|which (?:(?:ethical|usability|accessibility|research|design|legal|economic)\s+)?(?:principle|heuristic|framework|theory|model|concept|virtue|classification|view|approach)(?:\s+(?:is|best|would|does|prioritizes?|applies?|supports?|justifies?|explains?|opposes?|describes?))?|which (?:(?:next|best|first|primary|most likely|likely|most appropriate|correct)\s+)?(?:response|interpretation|conclusion|action|step|change|claim|finding|inference|method|evidence|approach|choice|use|move|outcome|impact|risk|benefit|cause|principle|heuristic|purpose|course of action|legal theory|regulatory action)|aligns? with which|characterized as|exemplifies? which|under which|according to .{0,80}\b(?:is|would|should)\b|how should|what does this|best (?:reflects|explains|supports|addresses|describes|characterized|labeled|classified)|(?:is|are|was|were) (?:(?:an? )?example of|called)|acts? as|what (?:problem|issue|risk|impact)|what(?:\s+\w+){0,4}\s+(?:pitch|value|classification|category|diagnosis|pattern)|is (?:this|the) (?:claim|action|decision|conduct|conflict of interest)|who is (?:primarily )?liable|what is the severity|analy[sz]e the following|most (?:useful|relevant|clearly|evident)|reveals?|supports?|indicates?|suggests?)\b/i;
const CLASSIFICATION_COMPLETION_RE =
  /\b(?:best (?:labeled|classified|described) (?:as\s+)?(?:the|a|an)?|(?:is|are|was|were) (?:an? )?example of(?: which)?|acts? as|(?:is|are|was|were) called)\s*$/i;
const MUSICAL_INTERVAL_CASE_RE =
  /\b(?:[A-G](?:[#♭♯b])?\d?\s*(?:[–—-]|to)\s*[A-G](?:[#♭♯b])?\d?|compound (?:ninth|tenth|eleventh|twelfth|thirteenth)|(?:major|minor|perfect|augmented|diminished) (?:unison|second|third|fourth|fifth|sixth|seventh|octave))\b/i;
const MUSICAL_INTERVAL_REASONING_RE =
  /\b(?:analy[sz]e|apply|classify|determine|distinguish|identify|invert|reduce|verify|which interval|which label|why)\b/i;

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
    /\b(?:identify|select|choose|name)\b.{0,80}\b(?:concepts?|methods?|frameworks?|principles?|rules?|lens(?:es)?)\b/i.test(
      text,
    );
  const usesEvidence =
    /\b(?:cite|use|reference|point to|draw on|support)\b.{0,80}\b(?:evidence|detail|observation|result|quote|case|claim(?:-card)?|card)s?\b/i.test(
      text,
    );
  const boundsClaim =
    /\b(?:limit(?:ation)?|boundary|alternative|next piece of evidence|additional evidence|cannot support|remains? unproven|does not permit|where (?:that|the) account stops|does not (?:prove|establish)|do not (?:prove|establish))\b/i.test(
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
  const completePrompt = /[.?!:]['’”")\]]?\s*$/.test(text) || CLASSIFICATION_COMPLETION_RE.test(text);
  if (wordCount < 12 || !completePrompt) return false;
  if (MUSICAL_INTERVAL_CASE_RE.test(text) && MUSICAL_INTERVAL_REASONING_RE.test(text)) return true;
  if (!REASONING_RE.test(text)) return false;
  // “In the study of world literature” names an academic field; it does not
  // supply a research study or any evidence for the learner to inspect.
  // Removing that narrow phrase prevents conceptual-definition questions
  // from receiving applied credit merely because EVIDENCE_RE includes study.
  const evidenceSurface = text.replace(/\bin (?:the )?study of\b/gi, 'in the discipline of');
  return (ACTOR_RE.test(text) && ACTION_RE.test(text)) || EVIDENCE_RE.test(evidenceSurface);
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
  const sourceBoundRecoveryCount = files.reduce(
    (count, file) =>
      count + (String(file?.text || file?.paragraphs?.join('\n') || '').match(SOURCE_BOUND_RECOVERY_RE)?.length || 0),
    0,
  );
  if (sourceBoundRecoveryCount > 0) {
    findings.push({
      severity: 'P1',
      dimension: 'substance',
      file: 'quizBank',
      detail: `${sourceBoundRecoveryCount} quiz item${sourceBoundRecoveryCount === 1 ? '' : 's'} use source-bound recovery because the lesson knowledge kernel did not clear admission`,
      evidence:
        'Attach or verify the assigned subject source and regenerate before publishing; the recovery prompts intentionally do not invent a disciplinary answer key.',
    });
  }
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
