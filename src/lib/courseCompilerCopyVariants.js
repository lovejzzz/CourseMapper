import { cleanText, escapeRegexLiteral, sentenceCase, stripTerminalPunctuation, unique } from './compilerText';

function variantIndex(lessonNumber, length) {
  const ordinal = Number.isFinite(Number(lessonNumber)) ? Math.trunc(Number(lessonNumber)) : 1;
  return (Math.max(1, ordinal) - 1) % length;
}

export function selectVariant(lessonNumber, variants) {
  return variants[variantIndex(lessonNumber, variants.length)];
}

export function courseCopySurfaceWords(value) {
  return cleanText(value)
    .replace(/^(?:lesson|week)\s*\d+\s*[:.\-–—]\s*/i, '')
    .replace(/[’']s\b/gi, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word && !['and', 'for', 'from', 'lesson', 'selected', 'the', 'using', 'with'].includes(word));
}

export function compactCourseCopyFocus(focus) {
  const cleanFocus = cleanText(focus);
  const literalWordCount = (cleanFocus.match(/[A-Za-z0-9][A-Za-z0-9'-]*/g) || []).length;
  if (courseCopySurfaceWords(cleanFocus).length < 4 && literalWordCount < 5) return cleanFocus;
  const subjectPrefix = stripTerminalPunctuation(cleanFocus.split(/\s+and\s+/i)[0]);
  if (courseCopySurfaceWords(subjectPrefix).length >= 2) return subjectPrefix;
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

function compactRepeatedLessonFocus(value, fullFocus, state) {
  if (typeof value === 'string') {
    const focus = cleanText(fullFocus);
    if (!focus) return value;
    return value.replace(new RegExp(escapeRegexLiteral(focus), 'gi'), (match, offset, source) => {
      state.count += 1;
      // Keep a few explicit identity anchors near the beginning of the brief;
      // after that, use grammatical local references instead of stamping the
      // full lesson title through every instruction, criterion, and milestone.
      if (state.count <= state.limit) return match;
      const before = source.slice(Math.max(0, offset - 24), offset);
      const after = source.slice(offset + match.length, offset + match.length + 28);
      const topic = state.topicKeyword || 'lesson';
      const determinerAlreadyPresent = /\b(?:a|an|the|this|that)\s*$/i.test(before);
      if (/^\s+course materials\b/i.test(after)) return `${topic} lesson's`;
      if (/^\s+(?:materials?|notes?|resources?|readings?|packet)\b/i.test(after)) return topic;
      if (
        /^\s+(?:evidence|reasoning|analysis|claim|decision|concept|detail|source|response|criteria|task|work)\b/i.test(
          after,
        )
      ) {
        return `${topic}${topic.includes(' ') ? '–' : '-'}specific`;
      }
      if (/(?:\bfor|\bin|\bfrom|\babout|\bon|\bof|\bto|\bwith|\busing|\baround)\s*$/i.test(before)) {
        return `${determinerAlreadyPresent ? '' : 'the '}${topic} work`;
      }
      return `${determinerAlreadyPresent ? '' : 'the '}${topic} focus`;
    });
  }
  if (Array.isArray(value)) return value.map((item) => compactRepeatedLessonFocus(item, fullFocus, state));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [key, compactRepeatedLessonFocus(child, fullFocus, state)]),
  );
}

export function compactRepeatedCourseFocusReferences(value, fullFocus, { limit = 6 } = {}) {
  const focus = cleanText(fullFocus);
  const wordCount = (focus.match(/[A-Za-z0-9][A-Za-z0-9'-]*/g) || []).length;
  // Short labels such as "Usability testing" or "Policy Topic 1" are useful
  // vocabulary, not the long mail-merge strings this reducer targets.
  if (focus.length < 24 && wordCount < 5) return value;
  const originalWords = focus.replace(/[’']s\b/gi, '').match(/[A-Za-z0-9][A-Za-z0-9'-]*/g) || [];
  const possessiveOwner = cleanText(focus.match(/^([A-Za-z][A-Za-z'-]*)[’']s\b/i)?.[1]).toLowerCase();
  const isTopicSurface = (word) =>
    word !== possessiveOwner &&
    !/^(?:\d+|advanced|analy[sz]e|apply|basics?|blocks?|compare|cumulative|evaluate|explain|explore|foundations?|fundamentals?|in|introduc\w*|lessons?|methods?|modeling|modern|of|on|overview|principles?|process|projects?|review|sessions?|study|techniques?|theory|to|understand|units?|use|using|weeks?)$/.test(
      word,
    );
  const firstThreeTopicSurfaces = courseCopySurfaceWords(compactCourseCopyFocus(focus))
    .filter(isTopicSurface)
    .slice(0, 3);
  // Never let the local reference equal a three-or-more-word lesson title.
  // Otherwise a replacement such as "<full title>–specific" still counts
  // as the exact mail-merge phrase in the exported DOCX. Preserve a useful
  // three-word phrase when stop-word removal already makes it distinct;
  // otherwise use two topic words.
  const threeSurfaceCandidate = firstThreeTopicSurfaces.join(' ');
  // Leading articles are removed by courseCopySurfaceWords. Without this
  // containment check, "The Medieval Journey Narrative" compacted to "the
  // Medieval Journey Narrative focus" — visually different, but still the
  // exact full title repeated in every sentence. Test the grammatical local
  // reference we are about to emit, not only the bare candidate.
  const preservesFullFocus =
    threeSurfaceCandidate && new RegExp(escapeRegexLiteral(focus), 'i').test(`the ${threeSurfaceCandidate} focus`);
  const topicSurfaces = preservesFullFocus ? firstThreeTopicSurfaces.slice(0, 2) : firstThreeTopicSurfaces;
  const topicKeyword =
    topicSurfaces
      .map((surface) => originalWords.find((word) => word.toLowerCase() === surface.toLowerCase()) || surface)
      .join(' ') || 'lesson';
  return compactRepeatedLessonFocus(value, focus, {
    count: 0,
    limit: Math.max(0, Number.isFinite(Number(limit)) ? Number(limit) : 6),
    topicKeyword,
  });
}

function compactArtifactHeadReference(value, lessonNumber = 0) {
  const label = stripTerminalPunctuation(cleanText(value).split(/\s*[:;–—]\s*/)[0]).replace(/^week\s+\d+\s*/i, '');
  // Prefer the actual submission genre over a generic trailing noun. A long
  // title such as "Warm-up performance recording with vocal evidence" must
  // compact to "Week 1 recording", not "Week 1 evidence"; the latter erases
  // the performing-arts modality that the brief is supposed to preserve.
  const recordedPerformanceHead = label.match(/\brecording\b/i)?.[0];
  const head = recordedPerformanceHead?.toLowerCase() || label.match(/[A-Za-z][A-Za-z'-]*$/)?.[0]?.toLowerCase() || '';
  if (!head || /^(?:week|lesson|artifact|task|item|work)$/.test(head)) return '';
  return `${lessonNumber > 0 ? `Week ${lessonNumber}` : 'weekly'} ${head}`;
}

export function compactAssignmentBriefBodyReferences({ brief = {}, lesson = {}, fullFocus, fallbackArtifact }) {
  const compacted = { ...brief };
  const protectedReadingTitles = (Array.isArray(lesson?.instructorNamedReadings) ? lesson.instructorNamedReadings : [])
    .map((title) => cleanText(title))
    .filter(Boolean);
  const transformProtectedReadings = (value, transform) => {
    if (typeof value === 'string') return transform(value);
    if (Array.isArray(value)) return value.map((item) => transformProtectedReadings(item, transform));
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, transformProtectedReadings(child, transform)]),
    );
  };
  const readingMasks = protectedReadingTitles.map((title, index) => ({
    title,
    token: `__SCION_NAMED_READING_${index}__`,
  }));
  const maskProtectedReadings = (value) =>
    transformProtectedReadings(value, (text) =>
      readingMasks.reduce(
        (masked, { title, token }) => masked.replace(new RegExp(escapeRegexLiteral(title), 'gi'), token),
        text,
      ),
    );
  const restoreProtectedReadings = (value) =>
    transformProtectedReadings(value, (text) =>
      readingMasks.reduce((restored, { title, token }) => restored.replaceAll(token, title), text),
    );
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
  const canonicalLead = stripTerminalPunctuation(canonicalTitle.split(/\s*[:;–—]\s*/)[0]);
  const genre = stripTerminalPunctuation(
    cleanText(lesson?.artifactGenre?.label || lesson?.artifactGenre?.genre || brief?.assignmentType || 'assignment'),
  );
  const weekNumber =
    Number(lesson?.lessonNumber) ||
    Number(cleanText(brief?.dueWeek).match(/\bweek\s+(\d+)\b/i)?.[1]) ||
    Number(cleanText(shortArtifact).match(/^week\s+(\d+)\b/i)?.[1]) ||
    0;
  const artifactWithoutWeek = stripTerminalPunctuation(shortArtifact.replace(/^week\s+\d+\s*/i, ''));
  const artifactRepeatsCanonicalLead =
    cleanText(artifactWithoutWeek).toLowerCase() === cleanText(canonicalLead).toLowerCase();
  const genericAssessmentAlias =
    artifactRepeatsCanonicalLead &&
    /\b(?:application check|evidence check|transfer task|exit note|course decision|visible product)\b/i.test(
      artifactWithoutWeek,
    );
  const compactKindReference = compactArtifactHeadReference(artifactWithoutWeek, weekNumber);
  const artifactLabel =
    // Five- and six-word aliases become eight-word rendered shingles once a
    // week label and possessive tokenization are added (for example,
    // "Week 3 Homer's Epic Structure evidence memo"). Repeating that phrase
    // through every brief field reads like mail merge and trips the Office
    // export audit. Keep compact, distinctive artifact names; otherwise use
    // the already discipline-aware genre label.
    artifactWithoutWeek && courseCopySurfaceWords(artifactWithoutWeek).length <= 4 && !genericAssessmentAlias
      ? artifactWithoutWeek
      : compactKindReference || genre || 'assignment';
  const week = weekNumber > 0 ? `Week ${weekNumber}` : '';
  const shortReference =
    week && !new RegExp(`^${escapeRegexLiteral(week)}\\b`, 'i').test(artifactLabel)
      ? `${week} ${artifactLabel.charAt(0).toLowerCase()}${artifactLabel.slice(1)}`
      : artifactLabel;
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
      const dealiased = compactAssignmentBriefBodyValue(maskProtectedReadings(compacted[field]), fullFocus, aliases);
      compacted[field] = dealiased;
    }
  }
  const compactedBody = Object.fromEntries(
    ASSIGNMENT_BRIEF_BODY_FIELDS.filter((field) => compacted[field] !== undefined).map((field) => [
      field,
      compacted[field],
    ]),
  );
  // The heading and Related Lessons line already preserve exact identity for
  // every brief. A lesson may carry three legitimate briefs, so even one extra
  // full-title mention per body crosses the rendered mail-merge threshold.
  // Body prose therefore uses grammatical local references while named
  // readings remain protected and exact.
  const reducedBody = compactRepeatedCourseFocusReferences(compactedBody, fullFocus, { limit: 0 });
  return { ...compacted, ...restoreProtectedReadings(reducedBody) };
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
    `The phrase “${concept}” is treated as covering every idea in ${lessonFocus}, so evidence never changes how it should be applied.`,
  ({ concept, sourceCue }) =>
    `The first example in ${sourceCue} is treated as determining the meaning of ${concept}, even when later evidence contradicts it.`,
  ({ concept, lessonFocus }) =>
    `Once the phrase “${concept}” appears in ${lessonFocus}, its meaning is carried into any context without checking limits.`,
  ({ concept, lessonFocus }) =>
    `Using the phrase “${concept}” requires no distinction among claims in ${lessonFocus}; every example supports it equally.`,
  ({ concept, lessonFocus }) =>
    `Any mention of ${lessonFocus} demonstrates ${concept}, even when the source offers no relevant evidence.`,
  ({ concept, sourceCue }) =>
    `An interpretation of ${concept} stays correct whenever the same wording appears in ${sourceCue}, regardless of the claim being tested.`,
  ({ concept, lessonFocus }) =>
    `Treating ${concept} as a label is sufficient for ${lessonFocus}; no relationship needs to be explained.`,
  ({ concept, sourceCue }) =>
    `${sentenceCase(sourceCue)} makes every ${concept} interpretation equally defensible, even when the interpretations conflict.`,
  ({ concept, lessonFocus }) =>
    `A claim about ${lessonFocus} counts as evidence for ${concept} merely because it uses the course vocabulary.`,
  ({ concept, sourceCue }) =>
    `${sentenceCase(concept)} can be applied before examining ${sourceCue}; source details cannot alter the conclusion.`,
  ({ concept, lessonFocus }) =>
    `The broadest statement about ${lessonFocus} is always the strongest use of ${concept}.`,
  ({ concept, lessonFocus }) =>
    `A familiar ${lessonFocus} example is treated as enough to apply ${concept}, without a reason connecting it to the question.`,
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
    `Which claim about ${lessonFocus} can you defend from ${sourceCue}, and which evidence makes it credible for ${week}?`,
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
