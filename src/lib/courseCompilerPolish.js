import { cleanText } from './compilerText';
import { selectVariant } from './courseCompilerCopyVariants';

export function examFactCopy({ lessonNumber, questionIndex = 0, assessmentTitle, lessonFocus, answer }) {
  const seed = Number(lessonNumber || 1) + Number(questionIndex || 0);
  return {
    intendedUse: selectVariant(seed, [
      `Summative accuracy item on ${assessmentTitle}; students separate the authored ${lessonFocus} fact from documented misconceptions.`,
      `Use in ${assessmentTitle} to distinguish the supported ${lessonFocus} claim from familiar but incorrect alternatives.`,
      `${assessmentTitle} accuracy check: identify which ${lessonFocus} statement the course evidence actually supports.`,
      `Summative ${lessonFocus} check for ${assessmentTitle}; students rule out documented misconceptions with course evidence.`,
      `Use this ${assessmentTitle} item to test whether students can recognize an evidence-backed ${lessonFocus} fact.`,
      `${assessmentTitle} concept check: separate the admitted ${lessonFocus} fact from unsupported interpretations.`,
    ]),
    question: selectVariant(seed, [
      `A lab team compares four claims about ${lessonFocus} with its course evidence. Which claim is defensible?`,
      `Which option matches the course's supported account of ${lessonFocus}?`,
      `Based on the course evidence, which claim about ${lessonFocus} is defensible?`,
      `Which claim correctly represents ${lessonFocus} in this course?`,
      `Select the statement about ${lessonFocus} that the assigned materials support.`,
      `Which description of ${lessonFocus} aligns with the evidence used in class?`,
    ]),
    distractorRationale: selectVariant(seed, [
      `The wrong options preserve documented misconceptions from covered lessons; only one option states the admitted ${lessonFocus} fact.`,
      `Each distractor is a recorded misconception or a claim about a different lesson, while the key matches the ${lessonFocus} evidence.`,
      `Incorrect choices sound course-relevant but conflict with the admitted ${lessonFocus} fact or apply another lesson's idea.`,
      `The distractors test whether students can reject familiar ${lessonFocus} errors instead of choosing by vocabulary alone.`,
      `Wrong answers reuse documented misunderstandings; the keyed statement is the one supported by the ${lessonFocus} source atom.`,
      `Only the key survives comparison with the admitted ${lessonFocus} evidence; the alternatives preserve known misconceptions.`,
    ]),
    explanation: selectVariant(seed, [
      `${answer} gives the admitted ${lessonFocus} fact; the remaining choices conflict with the course evidence.`,
      `The course materials support ${answer} for ${lessonFocus}, while the alternatives reproduce misconceptions or unrelated claims.`,
      `${answer} matches the evidence-backed account of ${lessonFocus}; each other option fails that source check.`,
      `Choose ${answer} because it represents ${lessonFocus} as taught; the distractors preserve documented errors.`,
      `The admitted ${lessonFocus} evidence uniquely supports ${answer}, not the competing interpretations.`,
      `${answer} is consistent with the course's ${lessonFocus} fact set; the other statements are unsupported here.`,
    ]),
  };
}

export function readinessExtensionMove({ lessonNumber, concept, artifact }) {
  return selectVariant(lessonNumber, [
    `If students are ready, ask them to compare two possible evidence choices and justify which one makes ${artifact} more defensible.`,
    `For an extension, students compare two ${concept} evidence choices, select the stronger one for ${artifact}, and explain the tradeoff.`,
    `Challenge ready students to test competing evidence for ${concept} and defend the choice that most strengthens ${artifact}.`,
    `Have ready students rank two source details for ${concept}, then explain which detail should change ${artifact} and why.`,
  ]);
}

export function finalMilestoneFeedback({ lessonNumber, assessmentTitle, feedbackUse }) {
  return selectVariant(lessonNumber, [
    `Final feedback on ${assessmentTitle} should identify one criterion strength, one revision priority, and the next use of the submitted evidence. ${feedbackUse}`,
    `When scoring ${assessmentTitle}, name the strongest criterion evidence, the revision that matters most, and where students will reuse the improved work. ${feedbackUse}`,
    `Return ${assessmentTitle} with a specific strength, one high-leverage revision, and a clear transfer target for the evidence. ${feedbackUse}`,
    `Close the ${assessmentTitle} feedback cycle by marking what already works, what students should revise next, and how that change carries forward. ${feedbackUse}`,
  ]);
}

export function slideDecisionMove({ lessonNumber, concept, decision, artifact }) {
  return selectVariant(lessonNumber, [
    `choose how ${concept} evidence should shape the ${decision} for ${artifact}`,
    `defend the ${decision} that ${concept} supports in ${artifact}`,
    `identify which ${concept} finding changes the ${decision} for ${artifact} next`,
    `use ${concept} to set the next ${decision} in ${artifact}`,
  ]);
}

export function dedupeCompilerMaterials(materials = []) {
  const seen = new Set();
  return materials.filter((material) => {
    const identity = cleanText(material)
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((token) => token && !['a', 'an', 'and', 'the'].includes(token))
      .join(' ');
    if (!identity || seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

const ENVIRONMENTAL_CHEMISTRY_RE =
  /\b(environmental chemistry|atmospheric chemistry|water chemistry|soil chemistry|green chemistry|analytical chemistry|organic chemistry|inorganic chemistry|chemistry|chemical reactions?|aqueous chemistry|contaminants?|toxicology)\b/;

export function environmentalChemistryLens(text = '') {
  if (!ENVIRONMENTAL_CHEMISTRY_RE.test(text)) return null;
  return {
    domain: 'environmental and laboratory chemistry',
    evidenceNoun: 'chemical measurements and source evidence',
    decisionNoun: 'chemical interpretation or risk decision',
    learnerRole: 'chemistry analyst',
    exampleNoun: 'sampling, reaction, or contaminant case',
  };
}

export function environmentalChemistryThroughline(text, courseName, makeProfile) {
  if (!ENVIRONMENTAL_CHEMISTRY_RE.test(text)) return null;
  return makeProfile(
    courseName,
    'Lab Notebook',
    'an instructor-provided chemical measurement, reaction, sampling, or contaminant context',
  );
}

export function examDayDiscussionExtras(coveredSpan) {
  return {
    followUpProbes: [
      `Which ${coveredSpan} concept needs debrief, and why?`,
      'Which study move helped?',
      'What will you change next time?',
    ],
    ifStalls: 'Use silent prompts, then collect anonymous responses.',
    evaluationCriteria: [`Names one ${coveredSpan} topic.`, 'Names a study change without discussing answers.'],
  };
}

export function polishedCourseThroughline(context, firstTitle, lastTitle, fallback) {
  if (!context) return fallback;
  const arc = `as the course moves from ${firstTitle} toward ${lastTitle} through repeated evidence, practice, feedback, and revision cycles.`;
  if (/^(?:the\s+)?(?:lesson|course)\s+materials$/i.test(cleanText(context.projectName))) {
    return `Students revisit the lesson materials ${arc}`;
  }
  if (/^(?:the\s+)?course audience$/i.test(cleanText(context.clientName))) {
    return `Students return to ${context.projectName} ${arc}`;
  }
  return `Students return to ${context.projectName} for ${context.clientName} ${arc}`;
}

export function assessmentRevisionCriterion({ title, concept, artifact }) {
  const variants = [
    `Feedback-informed ${concept} revision evidence for ${artifact}`,
    `${concept} revision rationale and feedback uptake in ${artifact}`,
    `Documented feedback response that improves the ${concept} reasoning in ${artifact}`,
    `Revision note showing how feedback changed the ${concept} decision in ${artifact}`,
  ];
  const seed = Array.from(cleanText(`${title} ${concept} ${artifact}`)).reduce(
    (sum, char) => sum + char.charCodeAt(0),
    0,
  );
  return variants[seed % variants.length];
}
