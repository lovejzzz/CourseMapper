import { cleanText, escapeRegexLiteral, sentenceCase, stripTerminalPunctuation, unique } from './compilerText';

function variantIndex(lessonNumber, length) {
  const ordinal = Number.isFinite(Number(lessonNumber)) ? Math.trunc(Number(lessonNumber)) : 1;
  return (Math.max(1, ordinal) - 1) % length;
}

function selectVariant(lessonNumber, variants) {
  return variants[variantIndex(lessonNumber, variants.length)];
}

export function courseCopySurfaceWords(value) {
  return cleanText(value)
    .replace(/^(?:lesson|week)\s*\d+\s*[:.\-–—]\s*/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word && !['and', 'for', 'from', 'lesson', 'selected', 'the', 'using', 'with'].includes(word));
}

export function compactCourseCopyFocus(focus) {
  const cleanFocus = cleanText(focus);
  const literalWordCount = (cleanFocus.match(/[A-Za-z0-9][A-Za-z0-9'-]*/g) || []).length;
  if (courseCopySurfaceWords(cleanFocus).length < 4 && literalWordCount < 5) return cleanFocus;
  const methodPrefix = stripTerminalPunctuation(cleanFocus.split(/\s+using\s+/i)[0]);
  return methodPrefix && courseCopySurfaceWords(methodPrefix).length <= 4 ? methodPrefix : cleanFocus;
}

export function compactCourseCopyEmbeddedReference(value, fullFocus) {
  const text = cleanText(value);
  const cleanFocus = cleanText(fullFocus);
  const compactFocus = compactCourseCopyFocus(cleanFocus);
  if (!text || !cleanFocus || cleanFocus === compactFocus) return text;
  return text.replace(new RegExp(escapeRegexLiteral(cleanFocus), 'gi'), compactFocus);
}

const ASSIGNMENT_BRIEF_BODY_FIELDS = [
  'overview',
  'description',
  'speakingPrompts',
  'objectives',
  'instructions',
  'formatRequirements',
  'deliverables',
  'submissionFormat',
  'gradingCriteria',
  'progressTracking',
  'accessibilityAndUDL',
  'selfAssessmentRubric',
  'feedbackLoop',
  'scaffoldingMilestones',
  'supportResources',
  'academicIntegrityStatement',
];

function compactAssignmentBriefBodyValue(value, fullFocus, aliases) {
  if (typeof value === 'string') {
    const dealiased = aliases.reduce((text, [source, replacement]) => {
      if (!source || !replacement || source === replacement) return text;
      return text.replace(new RegExp(escapeRegexLiteral(source), 'gi'), replacement);
    }, value);
    return compactCourseCopyEmbeddedReference(dealiased, fullFocus);
  }
  if (Array.isArray(value)) return value.map((item) => compactAssignmentBriefBodyValue(item, fullFocus, aliases));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [key, compactAssignmentBriefBodyValue(child, fullFocus, aliases)]),
  );
}

export function compactAssignmentBriefBodyReferences({ brief = {}, lesson = {}, fullFocus, fallbackArtifact }) {
  const compacted = { ...brief };
  const canonicalTitle = stripTerminalPunctuation(cleanText(brief?.title));
  const titleRemainder = stripTerminalPunctuation(
    canonicalTitle.replace(new RegExp(`^${escapeRegexLiteral(fullFocus)}(?:\\s*[:–—-]\\s*|\\s+)`, 'i'), ''),
  );
  const rawArtifact =
    titleRemainder &&
    titleRemainder.toLowerCase() !== canonicalTitle.toLowerCase() &&
    courseCopySurfaceWords(titleRemainder).length >= 2
      ? titleRemainder
      : fallbackArtifact;
  const shortArtifact = stripTerminalPunctuation(rawArtifact.split(/\s*[:;–—]\s*/)[0]);
  const genre = stripTerminalPunctuation(
    cleanText(lesson?.artifactGenre?.label || lesson?.artifactGenre?.genre || brief?.assignmentType || 'assignment'),
  );
  const artifactLabel =
    shortArtifact && courseCopySurfaceWords(shortArtifact).length <= 6 ? shortArtifact : genre || 'assignment';
  const week = Number.isFinite(Number(lesson?.lessonNumber)) ? `Week ${lesson.lessonNumber}` : '';
  const shortReference =
    week && !new RegExp(`^${escapeRegexLiteral(week)}\\b`, 'i').test(artifactLabel)
      ? `${week} ${artifactLabel.charAt(0).toLowerCase()}${artifactLabel.slice(1)}`
      : artifactLabel;
  const canonicalLead = stripTerminalPunctuation(canonicalTitle.split(/\s*[:;–—]\s*/)[0]);
  const aliases = unique(
    [
      week && canonicalTitle ? `${week} ${canonicalTitle}` : '',
      brief?.title,
      week && canonicalLead ? `${week} ${canonicalLead}` : '',
      canonicalLead,
      lesson?.studentArtifact,
      lesson?.assessmentAnchor?.title,
      lesson?.assessmentAnchor?.artifact,
    ]
      .map((value) => stripTerminalPunctuation(cleanText(value)))
      .filter((value) => value && courseCopySurfaceWords(value).length >= 5)
      .sort((left, right) => right.length - left.length),
    8,
  ).map((source) => [source, shortReference]);
  for (const field of ASSIGNMENT_BRIEF_BODY_FIELDS) {
    if (compacted[field] !== undefined) {
      compacted[field] = compactAssignmentBriefBodyValue(compacted[field], fullFocus, aliases);
    }
  }
  return compacted;
}

const EXAM_UNDERSTAND_CORRECT_TEMPLATES = [
  ({ concept, lessonFocus }) =>
    `${sentenceCase(concept)} explains a specific ${lessonFocus} decision and names the evidence that supports it.`,
  ({ concept, lessonFocus }) =>
    `The response uses ${concept} to justify one concrete ${lessonFocus} decision, citing the evidence behind it.`,
  ({ concept, lessonFocus }) =>
    `A specific ${lessonFocus} decision is explained through ${concept}, with the supporting evidence named.`,
  ({ concept, lessonFocus }) =>
    `The answer connects one ${lessonFocus} decision to ${concept} and points out its supporting evidence.`,
  ({ concept, lessonFocus }) =>
    `Applying ${concept} accounts for a particular ${lessonFocus} decision and the evidence used to make it.`,
];

export function examUnderstandCorrectText({ concept, lessonFocus, variant = 0 }) {
  return EXAM_UNDERSTAND_CORRECT_TEMPLATES[variant % EXAM_UNDERSTAND_CORRECT_TEMPLATES.length]({
    concept,
    lessonFocus,
  });
}

const EXAM_ATOM_PADDING_TEMPLATES = [
  ({ concept, lessonFocus }) =>
    `${sentenceCase(concept)} covers every idea in ${lessonFocus}, so evidence never changes how it should be applied.`,
  ({ concept, sourceCue }) =>
    `${sentenceCase(concept)} is determined by the first example in ${sourceCue}, even when later evidence contradicts it.`,
  ({ concept, lessonFocus }) =>
    `Once ${concept} is named in ${lessonFocus}, its meaning can be carried into any context without checking limits.`,
  ({ concept, lessonFocus }) =>
    `${sentenceCase(concept)} requires no distinction among claims in ${lessonFocus}; every example supports it equally.`,
  ({ concept, lessonFocus }) =>
    `Any mention of ${lessonFocus} demonstrates ${concept}, even when the source offers no relevant evidence.`,
  ({ concept, sourceCue }) =>
    `${sentenceCase(concept)} stays correct whenever the same wording appears in ${sourceCue}, regardless of the claim being tested.`,
  ({ concept, lessonFocus }) =>
    `Treating ${concept} as a label is sufficient for ${lessonFocus}; no relationship needs to be explained.`,
  ({ concept, sourceCue }) =>
    `${sentenceCase(sourceCue)} makes every ${concept} interpretation equally defensible, even when the interpretations conflict.`,
  ({ concept, lessonFocus }) =>
    `A claim about ${lessonFocus} counts as ${concept} evidence merely because it uses the course vocabulary.`,
  ({ concept, sourceCue }) =>
    `${sentenceCase(concept)} can be applied before examining ${sourceCue}; source details cannot alter the conclusion.`,
  ({ concept, lessonFocus }) =>
    `The broadest statement about ${lessonFocus} is always the strongest use of ${concept}.`,
  ({ concept, lessonFocus }) =>
    `${sentenceCase(concept)} needs only a familiar ${lessonFocus} example, not a reason connecting it to the question.`,
];

export function examAtomPaddingOptions({ concept, lessonFocus, sourceCue, lessonNumber, questionIndex }) {
  const lessonOrdinal = Number.isFinite(Number(lessonNumber)) ? Math.max(1, Math.trunc(Number(lessonNumber))) : 1;
  const questionOrdinal = Number.isFinite(Number(questionIndex)) ? Math.max(0, Math.trunc(Number(questionIndex))) : 0;
  const start = Math.abs(lessonOrdinal + questionOrdinal - 2) % EXAM_ATOM_PADDING_TEMPLATES.length;
  return Array.from({ length: 3 }, (_, offset) =>
    EXAM_ATOM_PADDING_TEMPLATES[(start + offset) % EXAM_ATOM_PADDING_TEMPLATES.length]({
      concept,
      lessonFocus,
      sourceCue,
    }),
  );
}

export function examFactCopy({ lessonNumber, assessmentTitle, lessonFocus, answer }) {
  return {
    intendedUse: selectVariant(lessonNumber, [
      `Summative accuracy item on ${assessmentTitle}; students separate the authored ${lessonFocus} fact from documented misconceptions.`,
      `Use in ${assessmentTitle} to distinguish the supported ${lessonFocus} claim from familiar but incorrect alternatives.`,
      `${assessmentTitle} accuracy check: identify which ${lessonFocus} statement the course evidence actually supports.`,
      `Summative ${lessonFocus} check for ${assessmentTitle}; students rule out documented misconceptions with course evidence.`,
      `Use this ${assessmentTitle} item to test whether students can recognize an evidence-backed ${lessonFocus} claim.`,
      `${assessmentTitle} concept check: separate the admitted ${lessonFocus} fact from unsupported interpretations.`,
    ]),
    question: selectVariant(lessonNumber, [
      `Which statement about ${lessonFocus} is accurate, according to the course materials?`,
      `Which option matches the course's supported account of ${lessonFocus}?`,
      `Based on the course evidence, which claim about ${lessonFocus} is defensible?`,
      `Which claim correctly represents ${lessonFocus} in this course?`,
      `Select the statement about ${lessonFocus} that the assigned materials support.`,
      `Which description of ${lessonFocus} aligns with the evidence used in class?`,
    ]),
    distractorRationale: selectVariant(lessonNumber, [
      `The wrong options preserve documented misconceptions from covered lessons; only one option states the admitted ${lessonFocus} fact.`,
      `Each distractor is a recorded misconception or a claim about a different lesson, while the key matches the ${lessonFocus} evidence.`,
      `Incorrect choices sound course-relevant but conflict with the admitted ${lessonFocus} fact or apply another lesson's idea.`,
      `The distractors test whether students can reject familiar ${lessonFocus} errors instead of choosing by vocabulary alone.`,
      `Wrong answers reuse documented misunderstandings; the keyed statement is the one supported by the ${lessonFocus} source atom.`,
      `Only the key survives comparison with the admitted ${lessonFocus} evidence; the alternatives preserve known misconceptions.`,
    ]),
    explanation: selectVariant(lessonNumber, [
      `${answer} gives the admitted ${lessonFocus} fact; the remaining choices conflict with the course evidence.`,
      `The course materials support ${answer} for ${lessonFocus}, while the alternatives reproduce misconceptions or unrelated claims.`,
      `${answer} matches the evidence-backed account of ${lessonFocus}; each other option fails that source check.`,
      `Choose ${answer} because it represents ${lessonFocus} as taught; the distractors preserve documented errors.`,
      `The admitted ${lessonFocus} evidence uniquely supports ${answer}, not the competing interpretations.`,
      `${answer} is consistent with the course's ${lessonFocus} fact set; the other statements are unsupported here.`,
    ]),
  };
}

export function titleSlideOpening({ lessonNumber, displayTitle, concepts, artifact }) {
  return selectVariant(lessonNumber, [
    `Frame ${displayTitle} as a working session on ${concepts}, with ${artifact} as the visible product.`,
    `Open ${displayTitle} around ${concepts} and name ${artifact} as the work students will visibly improve.`,
    `Position ${displayTitle} as an evidence workshop: students use ${concepts} to move ${artifact} forward.`,
    `Begin ${displayTitle} with the ${concepts} decision that students must make visible in ${artifact}.`,
    `Make the destination concrete at the start of ${displayTitle}: ${concepts} should change ${artifact}.`,
    `Launch ${displayTitle} by showing where ${concepts} will appear in the finished ${artifact}.`,
  ]);
}

export function titleSlideNote({ lessonNumber, displayTitle, safeAnchor, concept, artifactReference }) {
  return selectVariant(lessonNumber, [
    `Start the ${displayTitle} working session by connecting ${safeAnchor} to ${artifactReference}. Students should be able to name the ${concept} decision the product will capture.`,
    `Use ${safeAnchor} to open ${displayTitle}, then ask students where ${concept} should become visible in ${artifactReference}.`,
    `Introduce ${displayTitle} through ${safeAnchor}; before moving on, students point to the ${concept} evidence that will guide ${artifactReference}.`,
    `Lead into ${displayTitle} with ${safeAnchor} and have students state which ${concept} choice ${artifactReference} will test.`,
    `Make ${safeAnchor} the entry point for ${displayTitle}; students identify the ${concept} decision they will defend in ${artifactReference}.`,
    `Launch ${displayTitle} from ${safeAnchor}, asking students to predict how ${concept} should change ${artifactReference}.`,
  ]);
}

export function kernelFactInstructorNote({ lessonNumber, kernelFactLedger }) {
  return selectVariant(lessonNumber, [
    `Teach from the admitted source-grounded fact set: ${kernelFactLedger} Keep the claims visible during the model; students identify the fact behind each practice decision.`,
    `Build the model from these admitted facts: ${kernelFactLedger} After each reasoning move, ask which numbered fact makes it defensible.`,
    `Use this source-grounded fact ledger for the demonstration: ${kernelFactLedger} Students annotate where each fact changes the worked decision.`,
    `Keep the admitted evidence in view while modeling: ${kernelFactLedger} Pause so students can connect every practice choice to its supporting fact.`,
    `Model with only these admitted course claims: ${kernelFactLedger} Have students name the evidence used at each decision point.`,
    `Anchor the worked explanation in this fact set: ${kernelFactLedger} Before transfer, students match each reasoning step to the claim that supports it.`,
  ]);
}

export function studyGuideArtifactConnection({ lessonNumber, lessonTitle, studyArtifact }) {
  return selectVariant(lessonNumber, [
    `Use ${studyArtifact} to show what ${lessonTitle} changed in your evidence choice.`,
    `${studyArtifact} should carry the strongest insight from ${lessonTitle} into assessed work.`,
    `Before drafting ${studyArtifact}, identify the ${lessonTitle} idea that the evidence supports.`,
    `Let ${lessonTitle} shape one visible decision in ${studyArtifact}.`,
    `The assessment transfer from ${lessonTitle} becomes visible in ${studyArtifact}.`,
    `Apply the defensible ${lessonTitle} claim when revising ${studyArtifact}.`,
  ]);
}

export function studyGuideCoreQuestion({ lessonNumber, lessonFocus, week, evidenceNoun, sourceCue }) {
  return selectVariant(lessonNumber, [
    `How would you explain the central idea of ${lessonFocus} for ${week} using ${evidenceNoun} from ${sourceCue}?`,
    `Which claim about ${lessonFocus} can you defend from ${sourceCue}, and what ${evidenceNoun} makes it credible for ${week}?`,
    `Using ${sourceCue}, trace the ${evidenceNoun} that changes your interpretation of ${lessonFocus} in ${week}.`,
    `What does ${sourceCue} establish about ${lessonFocus}? Explain the reasoning and one limit of that ${week} claim.`,
    `For ${week}, compare two details in ${sourceCue} and decide which better explains ${lessonFocus}.`,
    `Build a concise ${lessonFocus} explanation for ${week}: name the decisive ${evidenceNoun} in ${sourceCue} and qualify the conclusion.`,
  ]);
}

export function slideObjectiveEvidence({ lessonNumber, concept, displayTitle, evidenceNoun, artifact }) {
  return selectVariant(lessonNumber, [
    `Tie each ${concept} objective in ${displayTitle} to the evidence move students need for ${artifact}.`,
    `For every ${displayTitle} objective, identify the ${evidenceNoun} students must use and where it belongs in ${artifact}.`,
    `Turn the ${concept} objectives into evidence checkpoints that students can demonstrate inside ${artifact}.`,
    `Ask which ${displayTitle} target is visible in ${artifact}, then name the ${evidenceNoun} that proves it.`,
    `Connect each ${concept} performance target to one inspectable change students make in ${artifact}.`,
    `Use ${artifact} to test the objectives: students point to the ${evidenceNoun} behind each ${concept} decision.`,
  ]);
}

export function slideAgendaOpening({ lessonNumber, concept, displayTitle }) {
  return selectVariant(lessonNumber, [
    `Walk through the lesson flow so students can see where ${concept}, practice, and feedback each appear in ${displayTitle}.`,
    `Preview ${displayTitle} as a sequence: encounter ${concept}, test it in practice, then use feedback to revise.`,
    `Map the ${displayTitle} work blocks and identify when students first explain, apply, and reconsider ${concept}.`,
    `Show how ${displayTitle} moves from a ${concept} question to evidence work and a visible revision.`,
    `Give students the ${displayTitle} route: examine ${concept}, make a choice, compare evidence, and improve the artifact.`,
    `Orient ${displayTitle} around the decision students will make with ${concept} before and after feedback.`,
  ]);
}

export function titleSlideExpectation({ lessonNumber, displayTitle, concept, artifact }) {
  return selectVariant(lessonNumber, [
    `Set the expectation that ${displayTitle} ends with one concrete ${concept} move students can use in ${artifact}.`,
    `Students should leave ${displayTitle} able to apply ${concept} in one visible ${artifact} decision.`,
    `Give ${displayTitle} a concrete destination: the class can show where ${concept} changes ${artifact}.`,
    `By the end of ${displayTitle}, students should defend one ${concept} choice inside ${artifact}.`,
    `Frame success for ${displayTitle} as an evidence-backed ${concept} revision to ${artifact}.`,
    `Make the ${displayTitle} outcome inspectable: students point to the ${concept} move they added to ${artifact}.`,
  ]);
}

export function slideFeedbackFallbackCopy({ lessonNumber, focus, hasDeterminer }) {
  return selectVariant(lessonNumber, [
    hasDeterminer
      ? `Name one source detail about ${focus}, one limitation, and the revision it supports.`
      : `Name one ${focus} source detail, one limitation, and the revision it supports.`,
    `Identify a source detail about ${focus}, explain one limit on what it establishes, and make the corresponding revision.`,
    `Point to evidence concerning ${focus}; qualify the claim, then revise the work accordingly.`,
    `Choose one inspectable detail for ${focus}, state what it cannot prove, and use that boundary to improve the artifact.`,
    `Connect one source cue about ${focus} to one bounded conclusion and one concrete revision.`,
    `Use evidence about ${focus} to justify a revision while naming the claim's limitation.`,
  ]);
}

export function slideTransitionCopy({ type, lessonNumber, nextCue, concept, evidenceNoun, decisionNoun, artifact }) {
  const variants = {
    agenda: [
      `Before “${nextCue},” confirm students can name the ${concept} evidence they will use for ${artifact}.`,
      `Move from the agenda into “${nextCue}” by asking which ${evidenceNoun} students need first for ${artifact}.`,
      `At “${nextCue},” have students predict where ${concept} should change their work on ${artifact}.`,
      `Use “${nextCue}” to convert the schedule into action: students identify the first ${concept} choice for ${artifact}.`,
      `Bridge to “${nextCue}” with one readiness check about the ${evidenceNoun} required in ${artifact}.`,
      `Open “${nextCue}” by naming the ${concept} question that the next artifact decision must answer.`,
    ],
    objectives: [
      `Transition to “${nextCue}” by choosing one ${concept} objective to watch during practice.`,
      `Carry one observable ${concept} target into “${nextCue}” and ask students how they will demonstrate it.`,
      `Use “${nextCue}” to test the first objective against the ${evidenceNoun} students can actually inspect.`,
      `Move into “${nextCue}” with students naming what successful ${concept} performance should look like.`,
      `Select one ${concept} objective as the lens for “${nextCue},” then identify the evidence it requires.`,
      `Before “${nextCue},” turn the objective into a concrete action students can show in ${artifact}.`,
    ],
    bridge: [
      `Use that ${concept} carry-forward point to launch “${nextCue}” without restarting the lesson from scratch.`,
      `Let the prior ${concept} insight become the opening evidence for “${nextCue}.”`,
      `Enter “${nextCue}” by testing whether the earlier ${concept} decision still holds.`,
      `Carry the unresolved ${concept} question directly into “${nextCue}” as the new problem.`,
      `Open “${nextCue}” with the earlier evidence students must keep, revise, or reject.`,
      `Make “${nextCue}” extend the previous ${concept} work instead of beginning a separate topic.`,
    ],
    keyTerm: [
      `Move to “${nextCue}” by asking students where ${concept} would show up in ${artifact}.`,
      `Test the ${concept} definition inside “${nextCue}” by locating one visible instance in ${artifact}.`,
      `Carry ${concept} into “${nextCue}” and ask which ${evidenceNoun} makes the term useful.`,
      `Use “${nextCue}” to move ${concept} from vocabulary into an artifact decision.`,
      `Before “${nextCue},” have students predict what ${artifact} would look like without ${concept}.`,
      `Open “${nextCue}” by applying ${concept} to one concrete detail in ${artifact}.`,
    ],
    content: [
      `Move next to “${nextCue}” by naming how ${concept} changes the ${decisionNoun} for ${artifact}.`,
      `Carry the strongest ${concept} explanation into “${nextCue}” and test it against ${artifact}.`,
      `Use “${nextCue}” to decide which ${evidenceNoun} from the explanation should alter ${artifact}.`,
      `Before “${nextCue},” ask students to state the ${concept} inference their artifact must make visible.`,
      `Let “${nextCue}” challenge the current ${concept} account with one competing piece of evidence.`,
      `Enter “${nextCue}” by turning the ${concept} explanation into a defensible ${artifact} choice.`,
    ],
    example: [
      `Carry the strongest ${concept} detail into “${nextCue}” as the next piece of evidence for ${artifact}.`,
      `Use the example to open “${nextCue}”: students identify the detail that should revise ${artifact}.`,
      `Move into “${nextCue}” by separating what the ${concept} example proves from what it leaves uncertain.`,
      `At “${nextCue},” have students transfer one evidence-backed move from the example to ${artifact}.`,
      `Bridge from the example to “${nextCue}” with the ${concept} choice students can now defend.`,
      `Make “${nextCue}” test whether the example's ${evidenceNoun} still applies in ${artifact}.`,
    ],
    activity: [
      `Use one ${artifact} revision as the bridge into “${nextCue}.”`,
      `Open “${nextCue}” with the activity output students most need to explain or revise.`,
      `Carry one visible ${concept} decision from the activity into “${nextCue}.”`,
      `Before “${nextCue},” have pairs select the ${artifact} change their evidence best supports.`,
      `Use “${nextCue}” to compare two activity results and decide which should shape ${artifact}.`,
      `Transition through the activity's unresolved question, making it the first task in “${nextCue}.”`,
    ],
    discussion: [
      `Close the exchange by selecting the ${concept} claim that should guide “${nextCue}.”`,
      `Carry the most defensible discussion claim into “${nextCue}” and name its supporting ${evidenceNoun}.`,
      `Use “${nextCue}” to test the point of disagreement that remains about ${concept}.`,
      `Before “${nextCue},” ask the group which ${concept} interpretation should change ${artifact} and why.`,
      `Let the discussion's strongest counterpoint become the opening challenge in “${nextCue}.”`,
      `Move to “${nextCue}” with one qualified ${concept} conclusion students can now defend.`,
    ],
    summary: [
      `Use the ${concept} self-check result to decide what needs reinforcement in “${nextCue}.”`,
      `Open “${nextCue}” with the ${concept} point students were least ready to explain.`,
      `Carry the summary's strongest evidence into “${nextCue}” and revisit the weakest inference.`,
      `Let the exit response determine which ${concept} question starts “${nextCue}.”`,
      `Use “${nextCue}” to address the gap students named in their ${artifact} self-check.`,
      `Move forward with the ${concept} conclusion students can support and the boundary they still need to test.`,
    ],
    closing: [
      `Point students to “${nextCue}” as the next place their ${artifact} revision decision will matter.`,
      `Connect the final ${concept} choice to the first artifact move students will make in “${nextCue}.”`,
      `Use “${nextCue}” as the transfer test for today's strongest ${evidenceNoun}.`,
      `Close by naming what students should carry into “${nextCue}” and what they should leave unresolved.`,
      `Have students enter “${nextCue}” with one ${artifact} revision and the evidence that justified it.`,
      `Frame “${nextCue}” as the next chance to apply, qualify, or replace today's ${concept} conclusion.`,
    ],
  };
  return selectVariant(
    lessonNumber,
    variants[type] || [`Move next to “${nextCue}” by naming how it changes the ${decisionNoun}.`],
  );
}
