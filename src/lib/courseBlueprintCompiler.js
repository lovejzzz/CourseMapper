import { COLUMN_EXTRACTORS } from './prompts/promptUtils';
import { getChunkCount } from './parallelGenerator';
import { getCustomDeliverable } from './customDeliverableLibrary';

export const BLUEPRINT_COMPILED_FEATURES = new Set([
  'syllabus',
  'lessonPlans',
  'slideDecks',
  'rubrics',
  'assignments',
  'discussions',
  'quizBank',
  'studyGuides',
  'courseFaq',
]);

const CUSTOM_REFLECTION_PATTERN = /\b(reflection|reflective|check[-\s]?in|journal|exit ticket|debrief)\b/i;
const CUSTOM_READING_RESPONSE_PATTERN =
  /\b(reading response|reading responses|reading reflection|reading journal|reading log|annotation response|annotated response|reading recap)\b/i;
const CUSTOM_TEMPLATE_EXCLUDE_PATTERN = /\b(quiz|exam|rubric|slide|syllabus|faq|assignment|discussion)\b/i;
const CUSTOM_PER_LESSON_PATTERN = /\b(lesson|week|per lesson|per week|each lesson|each week)\b/i;

const BLOOMS_LEVELS = ['Apply', 'Analyze', 'Evaluate', 'Create'];
const QUIZ_BLOOMS_SEQUENCE = ['Remember', 'Understand', 'Apply', 'Analyze', 'Evaluate', 'Create'];
const FAQ_CATEGORIES = [
  'Course Logistics',
  'Assignment Clarification',
  'Concept Explanation',
  'Technical Help',
  'Assessment Prep',
];
const SYNTHETIC_ASSESSMENT_PATTERNS = [
  { label: 'Evidence memo', verb: 'analyze', output: 'brief evidence memo' },
  { label: 'Concept check', verb: 'apply', output: 'short concept-check response' },
  { label: 'Case worksheet', verb: 'evaluate', output: 'case worksheet' },
  { label: 'Design note', verb: 'create', output: 'one-page design note' },
  { label: 'Reflection checkpoint', verb: 'connect', output: 'structured reflection' },
  { label: 'Peer critique', verb: 'critique', output: 'peer-review note' },
];
const SLIDE_VISUAL_KINDS = ['diagram', 'table', 'chart', 'image'];
const DISCUSSION_FORMAT_SEQUENCE = [
  'Socratic Seminar',
  'Think-Pair-Share',
  'Fishbowl',
  'Small Group then Share-Out',
  'Case-Based Discussion',
  'Asynchronous Online',
  'Debate / Structured Academic Controversy',
  'Whole-Class Discussion',
  'Jigsaw',
  'Gallery Walk',
  'Role Play / Simulation',
];

function asArray(value) {
  return Array.isArray(value) ? value : value === undefined || value === null || value === '' ? [] : [value];
}

function cleanText(value, fallback = '') {
  return String(value ?? fallback)
    .replace(/\s+/g, ' ')
    .trim();
}

function slugifyCustomArrayKey(value) {
  return (
    cleanText(value, 'items')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'items'
  );
}

function stripLessonPrefix(value) {
  return cleanText(value).replace(/^(?:lesson|week)\s*\d+\s*[:.-]\s*/i, '');
}

function lessonTitle(lesson, lessonNumber) {
  return `Lesson ${lessonNumber}: ${stripLessonPrefix(lesson?.title || lesson?.lessonTitle || lesson?.lt || '') || `Topic ${lessonNumber}`}`;
}

function splitList(value) {
  if (Array.isArray(value)) {
    return value.flatMap(splitList);
  }
  return String(value || '')
    .split(/\n|;|\||\u2022/)
    .map((item) => item.replace(/^\s*(?:[-*]|\d+[.)])\s*/, '').trim())
    .filter(Boolean);
}

function unique(values, limit = 12) {
  const seen = new Set();
  const result = [];
  for (const value of values.map((item) => cleanText(item)).filter(Boolean)) {
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
    if (result.length >= limit) break;
  }
  return result;
}

function extractColumn(lesson, key) {
  const sections = Array.isArray(lesson?.sections) ? lesson.sections : [];
  const extractor = COLUMN_EXTRACTORS[key];
  if (!extractor) return '';
  return extractor.extract(sections);
}

function wordsFromConcepts(values, limit = 8) {
  const stopWords = new Set([
    'and',
    'for',
    'the',
    'with',
    'from',
    'into',
    'about',
    'using',
    'students',
    'student',
    'course',
    'lesson',
    'week',
    'will',
    'able',
    'their',
    'this',
    'that',
    'through',
    'apply',
    'analyze',
    'evaluate',
    'create',
  ]);
  const candidates = values
    .join(' ')
    .replace(/[^A-Za-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length > 3 && !stopWords.has(word.toLowerCase()));
  return unique(candidates, limit);
}

function firstNonEmpty(...values) {
  return values.map((value) => cleanText(value)).find(Boolean) || '';
}

function sentenceCase(value) {
  const text = cleanText(value);
  if (!text) return '';
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function stripTerminalPunctuation(value) {
  return cleanText(value).replace(/[.!?]+$/g, '');
}

function compactList(values, fallback = 'course evidence', limit = 3) {
  const items = unique(values, limit);
  return items.length > 0 ? items.join(', ') : fallback;
}

function alternateLessonConcept(lesson, primary) {
  const generic = new Set(['clinical', 'community', 'health', 'studio', 'lesson', 'topic', 'block']);
  return (
    lesson.keyConcepts.find((concept) => {
      const normalized = cleanText(concept).toLowerCase();
      return normalized && normalized !== cleanText(primary).toLowerCase() && !generic.has(normalized);
    }) ||
    lesson.keyConcepts.find((concept) => cleanText(concept).toLowerCase() !== cleanText(primary).toLowerCase()) ||
    primary
  );
}

function inferDisciplineLens(courseName, concepts = []) {
  const text = `${courseName} ${concepts.join(' ')}`.toLowerCase();
  if (/\b(ai|prompt|automation|machine learning|analytics|model)\b/.test(text)) {
    return {
      domain: 'AI course design',
      evidenceNoun: 'design evidence',
      decisionNoun: 'implementation decision',
      learnerRole: 'course designer',
      exampleNoun: 'AI-supported teaching scenario',
    };
  }
  if (/\b(health|community|equity|program|stakeholder|policy)\b/.test(text)) {
    return {
      domain: 'community health evaluation',
      evidenceNoun: 'community evidence',
      decisionNoun: 'program decision',
      learnerRole: 'evaluation practitioner',
      exampleNoun: 'community implementation case',
    };
  }
  if (/\b(research|sampling|survey|interview|statistics|qualitative|quantitative|irb|ethics)\b/.test(text)) {
    return {
      domain: 'applied research methods',
      evidenceNoun: 'research evidence',
      decisionNoun: 'methodological decision',
      learnerRole: 'research practitioner',
      exampleNoun: 'study-design scenario',
    };
  }
  return {
    domain: 'applied course practice',
    evidenceNoun: 'course evidence',
    decisionNoun: 'professional decision',
    learnerRole: 'course practitioner',
    exampleNoun: 'applied case',
  };
}

function normalizeBlueprintEnrichment({ courseName, lessons, courseConcepts, provided = {} }) {
  const providedTerms = Array.isArray(provided.signatureTerms) ? provided.signatureTerms : [];
  const signatureTerms = unique([...providedTerms, ...courseConcepts], 12);
  const lens = {
    ...inferDisciplineLens(courseName, signatureTerms),
    ...(provided.lens && typeof provided.lens === 'object' ? provided.lens : {}),
  };
  const lessonPhrases = Object.fromEntries(
    lessons.map((lesson) => [
      lesson.id,
      {
        context: compactList(lesson.keyConcepts, stripLessonPrefix(lesson.title), 3),
        evidenceMove: `use ${lens.evidenceNoun} about ${lesson.keyConcepts[0] || stripLessonPrefix(lesson.title)}`,
        decisionMove: `explain the ${lens.decisionNoun} for ${stripLessonPrefix(lesson.title)}`,
      },
    ]),
  );

  return {
    source: provided.source || 'deterministic-blueprint-enrichment',
    lens,
    signatureTerms,
    lessonPhrases: {
      ...lessonPhrases,
      ...(provided.lessonPhrases && typeof provided.lessonPhrases === 'object' ? provided.lessonPhrases : {}),
    },
    styleNotes: unique(
      [
        ...(Array.isArray(provided.styleNotes) ? provided.styleNotes : []),
        `Prefer concrete ${lens.domain} nouns over generic course-language templates.`,
        `Name the ${lens.evidenceNoun}, student output, and feedback use in long-form guidance.`,
      ],
      6,
    ),
  };
}

export function mergeBlueprintEnrichment(blueprint, enrichment = {}) {
  if (!blueprint || typeof blueprint !== 'object') return blueprint;
  return {
    ...blueprint,
    enrichment: normalizeBlueprintEnrichment({
      courseName: blueprint.courseName,
      lessons: blueprint.lessons || [],
      courseConcepts: blueprint.courseConcepts || [],
      provided: enrichment,
    }),
  };
}

function lessonPhrase(blueprint, lesson) {
  return (
    blueprint?.enrichment?.lessonPhrases?.[lesson.id] || {
      context: compactList(lesson.keyConcepts, stripLessonPrefix(lesson.title), 3),
      evidenceMove: `use course evidence about ${lesson.keyConcepts[0] || stripLessonPrefix(lesson.title)}`,
      decisionMove: `explain the decision for ${stripLessonPrefix(lesson.title)}`,
    }
  );
}

function blueprintLens(blueprint) {
  return blueprint?.enrichment?.lens || inferDisciplineLens(blueprint?.courseName, blueprint?.courseConcepts || []);
}

function buildSyntheticAssessment({ title, concepts, outcomes, activities, originalIndex }) {
  const pattern = SYNTHETIC_ASSESSMENT_PATTERNS[originalIndex % SYNTHETIC_ASSESSMENT_PATTERNS.length];
  const concept = concepts[0] || stripLessonPrefix(title) || 'the lesson topic';
  const activity = activities[0] || `practice with ${concept}`;
  const objective = outcomes[0] || objectiveForLesson(title, concepts);
  return `${pattern.label}: ${pattern.verb} ${concept} through ${activity}; submit a ${pattern.output} that shows ${stripTerminalPunctuation(objective).toLowerCase()}.`;
}

function objectiveForLesson(title, concepts) {
  const concept = concepts[0] || stripLessonPrefix(title) || 'the weekly topic';
  return `Analyze ${concept} using course evidence and explain how it informs an instructional or professional decision.`;
}

function successCriteriaForLesson(title, concepts) {
  const concept = concepts[0] || stripLessonPrefix(title) || 'the topic';
  return [
    `Names the relevant ${concept} concept accurately.`,
    `Uses specific evidence from the ${concept} materials or activity.`,
    `Explains a ${concept} decision, implication, or next step instead of only summarizing.`,
  ];
}

function hasMeaningfulAssessment(value) {
  const text = cleanText(value).toLowerCase();
  if (!text) return false;
  return !/^(none|n\/a|no assessment|not assessed|tbd|to be determined)$/i.test(text);
}

function extractLessonBlueprint(lesson, originalIndex) {
  const lessonNumber = originalIndex + 1;
  const title = lessonTitle(lesson, lessonNumber);
  const objectiveEntries = splitList(extractColumn(lesson, 'learningObjectives'));
  const goalEntries = splitList(extractColumn(lesson, 'learningGoals'));
  const objectives = unique(objectiveEntries.length > 0 ? objectiveEntries : goalEntries, 5);
  const topicEntries = splitList(extractColumn(lesson, 'topicSection'));
  const topics = unique(topicEntries.length > 0 ? topicEntries : goalEntries, 8);
  const titleConcepts = unique([stripLessonPrefix(title)].concat(wordsFromConcepts([stripLessonPrefix(title)], 4)), 4);
  const resources = unique(splitList(extractColumn(lesson, 'supportingResources')), 6);
  const asyncActivities = splitList(extractColumn(lesson, 'asyncActivities'));
  const syncActivities = splitList(extractColumn(lesson, 'syncActivities'));
  const assessmentText = firstNonEmpty(
    extractColumn(lesson, 'weeklyAssessments'),
    extractColumn(lesson, 'evaluateDesign'),
  );
  const concepts = unique([...titleConcepts, ...topics, ...wordsFromConcepts([...topics, ...objectives, title], 5)], 8);
  const outcomes = objectives.length > 0 ? objectives : [objectiveForLesson(title, concepts)];
  const synthesizedAssessment = buildSyntheticAssessment({
    title,
    concepts,
    outcomes,
    activities: [...syncActivities, ...asyncActivities],
    originalIndex,
  });
  const assessmentLink = hasMeaningfulAssessment(assessmentText) ? assessmentText : synthesizedAssessment;

  return {
    id: `lesson-${lessonNumber}`,
    lessonIndex: originalIndex,
    lessonNumber,
    title,
    outcomes,
    keyConcepts: concepts.length > 0 ? concepts : [stripLessonPrefix(title)],
    readings: resources.length > 0 ? resources : ['Instructor-provided course materials and notes'],
    activityPattern: firstNonEmpty(
      [...syncActivities, ...asyncActivities].join('; '),
      `Concept model, applied practice, peer discussion, and individual reflection for ${stripLessonPrefix(title)}.`,
    ),
    assessmentLink,
    hasAssessment: hasMeaningfulAssessment(assessmentText),
    assessmentSource: hasMeaningfulAssessment(assessmentText) ? 'course-map' : 'sparse-fallback',
    studentArtifact: hasMeaningfulAssessment(assessmentText) ? assessmentText : synthesizedAssessment,
    successCriteria: successCriteriaForLesson(title, concepts),
    feedbackMoment: `Instructor or peer feedback helps students improve the next ${stripLessonPrefix(title)} artifact.`,
    slideNarrative: `Introduce ${stripLessonPrefix(title)}, model the core concept, apply it to a case, and close with a decision checkpoint.`,
    quizTargets: outcomes.slice(0, 3),
    faqNeeds: [`What should I focus on in ${title}?`, `How does ${stripLessonPrefix(title)} connect to graded work?`],
    bloomsLevel: BLOOMS_LEVELS[originalIndex % BLOOMS_LEVELS.length],
  };
}

function selectedLessonEntries(courseMap, scopeIndices = null) {
  const lessons = Array.isArray(courseMap?.lessons) ? courseMap.lessons : [];
  if (Array.isArray(scopeIndices) && scopeIndices.length > 0) {
    return scopeIndices
      .map((originalIndex, position) => ({
        lesson: lessons[originalIndex] || lessons[position],
        originalIndex: Number.isInteger(originalIndex) ? originalIndex : position,
      }))
      .filter(({ lesson }) => lesson);
  }
  return lessons.map((lesson, originalIndex) => ({ lesson, originalIndex }));
}

function distributePercent(count) {
  if (count <= 0) return [];
  const base = Math.floor(100 / count);
  return Array.from({ length: count }, (_, index) => (index === count - 1 ? 100 - base * (count - 1) : base));
}

function buildAssessmentCriteria(lesson) {
  const concept = lesson.keyConcepts[0] || stripLessonPrefix(lesson.title);
  const artifact = stripTerminalPunctuation(lesson.studentArtifact);
  return [
    `${concept} accuracy and evidence selection for ${artifact}`,
    `Analysis logic that connects ${concept} to the lesson decision`,
    `Professional communication organized around ${stripLessonPrefix(lesson.title)}`,
    `Feedback and revision use documented for ${artifact}`,
  ];
}

function buildAssessmentAnchors(lessons) {
  const source = lessons;
  const weights = distributePercent(source.length || 1);
  return source.map((lesson, index) => ({
    id: `assessment-${index + 1}`,
    title: cleanText(lesson.studentArtifact, `${stripLessonPrefix(lesson.title)} applied assessment`),
    artifact: cleanText(lesson.studentArtifact, 'Applied course artifact'),
    lessonNumbers: [lesson.lessonNumber],
    relatedLessons: [lesson.title],
    weight: `${weights[index] || 0}%`,
    points: 100,
    bloomsLevel: lesson.bloomsLevel,
    objectives: lesson.outcomes,
    criteria: buildAssessmentCriteria(lesson),
    successCriteria: lesson.successCriteria,
    feedbackUse: lesson.feedbackMoment,
    source: lesson.assessmentSource,
  }));
}

export function buildCourseBlueprint(courseMap, options = {}) {
  const lessons = selectedLessonEntries(courseMap, options.scopeIndices).map(({ lesson, originalIndex }) =>
    extractLessonBlueprint(lesson, originalIndex),
  );
  const assessments = buildAssessmentAnchors(lessons);
  const courseConcepts = unique(
    lessons.flatMap((lesson) => lesson.keyConcepts),
    16,
  );

  const blueprint = {
    version: 1,
    source: 'deterministic-course-map',
    courseName: cleanText(courseMap?.courseName, 'Untitled Course'),
    semester: cleanText(courseMap?.semester, 'Course term'),
    totalLessons: lessons.length,
    lessons,
    assessments,
    courseConcepts,
    policies: {
      lateWork:
        'Submit work by the listed due week. If you need an extension, contact the instructor before the deadline with a concrete completion plan.',
      communication:
        'Use the official course communication channel for questions. Expect professional, respectful communication and allow a standard academic response window.',
      accessibility:
        'Students who need accommodations should contact the institution accessibility office and the instructor early so course activities can be adjusted appropriately.',
      academicIntegrity:
        'All submitted work must represent the student or team effort and cite outside sources or approved tools. Course-specific AI use must be disclosed when it contributes to submitted work.',
    },
    designRules: {
      alignment: 'Every artifact must connect objectives, practice, assessment, feedback, and support.',
      support: 'Name concrete success criteria and feedback use instead of generic encouragement.',
    },
  };
  return mergeBlueprintEnrichment(blueprint, options.enrichment || {});
}

export function isBlueprintCompiledFeature(featureId, options = {}) {
  return BLUEPRINT_COMPILED_FEATURES.has(featureId) || isCompiledCustomDeliverable(featureId, options);
}

export function getBlueprintCompiledFeatures(featureIds = [], options = {}) {
  if (options.enabled === false) return [];
  return [...new Set(featureIds)].filter((featureId) => isBlueprintCompiledFeature(featureId, options));
}

export function estimateBlueprintCompilerSavings(
  featureIds = [],
  lessonCount = 0,
  generationPlan = null,
  scopeIndices = null,
) {
  return getBlueprintCompiledFeatures(featureIds).reduce(
    (sum, featureId) => sum + Math.max(1, getChunkCount(featureId, lessonCount, scopeIndices, generationPlan)),
    0,
  );
}

function getCustomDeliverableDefinition(featureId, options = {}) {
  if (!featureId?.startsWith('custom_')) return null;
  if (options.customDeliverables && typeof options.customDeliverables === 'object') {
    return options.customDeliverables[featureId] || null;
  }
  return getCustomDeliverable(featureId);
}

function getCompiledCustomTemplateKind(featureId, options = {}) {
  if (!featureId?.startsWith('custom_')) return null;
  const custom = getCustomDeliverableDefinition(featureId, options);
  if (!custom) return null;

  const combinedText = [
    custom.name,
    custom.description,
    custom.systemPrompt,
    custom.userPromptTemplate,
    custom.outputFormat,
  ]
    .map((value) => cleanText(value).toLowerCase())
    .join(' ');

  if (!CUSTOM_PER_LESSON_PATTERN.test(combinedText)) return null;

  const customName = cleanText(custom.name).toLowerCase();
  if (CUSTOM_TEMPLATE_EXCLUDE_PATTERN.test(customName)) return null;
  if (CUSTOM_READING_RESPONSE_PATTERN.test(combinedText)) return 'reading-response';
  if (CUSTOM_REFLECTION_PATTERN.test(combinedText)) return 'reflection-check-in';
  return null;
}

function isCompiledCustomDeliverable(featureId, options = {}) {
  return getCompiledCustomTemplateKind(featureId, options) !== null;
}

function compileCustomReflectionDeliverable(featureId, blueprint, options = {}) {
  const custom = getCustomDeliverableDefinition(featureId, options);
  if (!custom || getCompiledCustomTemplateKind(featureId, options) !== 'reflection-check-in') return null;

  const deliverableName = cleanText(custom.name, 'Weekly Reflection');
  const arrayKey = slugifyCustomArrayKey(deliverableName);
  const lens = blueprintLens(blueprint);
  const items = blueprint.lessons.map((lesson) => {
    const focus = lesson.keyConcepts[0] || stripLessonPrefix(lesson.title) || 'the lesson focus';
    const alternate = alternateLessonConcept(lesson, focus);
    const phrase = lessonPhrase(blueprint, lesson);

    return {
      lessonTitle: lesson.title,
      weekNumber: `Week ${lesson.lessonNumber}`,
      deliverableName,
      promptTitle: `${deliverableName} ${lesson.lessonNumber}`,
      reflectionPrompt: `Explain how ${focus} from ${lesson.title} changes your next ${lens.decisionNoun}. Reference ${phrase.context} and connect it to the lesson artifact: ${stripTerminalPunctuation(lesson.studentArtifact)}.`,
      checkInQuestion: `What is one move you can make this week to apply ${alternate} more deliberately in your ${lens.domain} practice?`,
      evidenceToReference: [
        `Use one detail from ${lesson.activityPattern.toLowerCase()}.`,
        `Name one success criterion from the lesson artifact expectations.`,
        `Describe one uncertainty, risk, or feedback target you still need to work on.`,
      ],
      responseStructure: [
        `Part 1: summarize the most important insight about ${focus} in 2-3 sentences.`,
        `Part 2: explain how that insight changes your approach to ${stripLessonPrefix(lesson.studentArtifact)}.`,
        `Part 3: name one next step you will take before the next class session.`,
      ],
      successCriteria: [
        `${deliverableName} names a concrete ${focus} takeaway from the lesson.`,
        `${deliverableName} uses course evidence instead of generic reflection filler.`,
        `${deliverableName} ends with a realistic next action tied to the next assignment or feedback cycle.`,
      ],
      instructorReviewFocus: `Look for whether the student can connect ${focus} to ${alternate}, cite lesson evidence, and identify a concrete next step before the next checkpoint.`,
    };
  });

  return {
    deliverableName,
    deliverableType: 'compiled-reflection-check-in',
    source: 'deterministic-course-blueprint',
    [arrayKey]: items,
  };
}

function compileCustomReadingResponseDeliverable(featureId, blueprint, options = {}) {
  const custom = getCustomDeliverableDefinition(featureId, options);
  if (!custom || getCompiledCustomTemplateKind(featureId, options) !== 'reading-response') return null;

  const deliverableName = cleanText(custom.name, 'Reading Response');
  const arrayKey = slugifyCustomArrayKey(deliverableName);
  const lens = blueprintLens(blueprint);
  const items = blueprint.lessons.map((lesson) => {
    const focus = lesson.keyConcepts[0] || stripLessonPrefix(lesson.title) || 'the lesson focus';
    const alternate = alternateLessonConcept(lesson, focus);
    const phrase = lessonPhrase(blueprint, lesson);
    const reading = lesson.readings[0] || 'Assigned lesson materials';

    return {
      lessonTitle: lesson.title,
      weekNumber: `Week ${lesson.lessonNumber}`,
      deliverableName,
      promptTitle: `${deliverableName} ${lesson.lessonNumber}`,
      focusReading: reading,
      responsePrompt: `Write a focused response explaining how ${focus} from ${reading} changes your approach to ${stripTerminalPunctuation(lesson.studentArtifact)} in ${lesson.title}. Reference ${phrase.context} and make one clear ${lens.decisionNoun}.`,
      quoteOrDetailRequirement: `Use one concrete detail, quote, or example from ${reading} and explain why it matters for ${alternate} in ${lesson.title}.`,
      connectionPrompt: `Connect the reading to this week's practice by naming how it should shape ${stripTerminalPunctuation(lesson.studentArtifact)} before the next class session.`,
      submissionChecklist: [
        `Name the reading focus for ${lesson.title}.`,
        `Use one specific piece of ${lens.evidenceNoun} from the reading or lesson materials.`,
        `Explain one decision, implication, or revision move for ${lesson.studentArtifact}.`,
      ],
      successCriteria: [
        `${deliverableName} uses an actual reading detail instead of generic summary.`,
        `${deliverableName} connects the reading to ${lesson.studentArtifact} or the weekly practice task.`,
        `${deliverableName} ends with a concrete implication, next step, or question for class discussion.`,
      ],
      instructorReviewFocus: `Look for whether the student cites ${reading}, connects ${focus} to ${lesson.studentArtifact}, and makes a usable ${lens.decisionNoun} for the next checkpoint.`,
    };
  });

  return {
    deliverableName,
    deliverableType: 'compiled-reading-response',
    source: 'deterministic-course-blueprint',
    [arrayKey]: items,
  };
}

function compileSyllabus(blueprint) {
  const requirements = blueprint.assessments.map((assessment) => ({
    name: assessment.title,
    weight: assessment.weight,
    description: `${assessment.artifact}. Strong work ${assessment.successCriteria.join(' ')} Feedback is used to improve later course artifacts.`,
  }));

  return {
    syllabus: {
      courseTitle: blueprint.courseName,
      semester: blueprint.semester,
      credits: '3 credits',
      meetingPattern: 'Weekly course sessions with applied practice and feedback checkpoints',
      location: 'Official course site and assigned class meeting space',
      deliveryMode: 'Course format listed by the program',
      prerequisites: 'No formal prerequisites listed; students should review program requirements.',
      instructor: 'Course instructor',
      instructorEmail: 'Use the contact method listed in the course site',
      officeHours: 'Office hours are available through the course communication channel',
      officeLocation: 'Office hours location or meeting link is available in the course site',
      instructorBio:
        'The instructor supports rigorous, applied learning and expects students to connect course ideas to professional decisions. Office hours and course messages are available for clarification, planning, and feedback on work in progress.',
      courseDescription: `In ${blueprint.courseName}, students work through ${blueprint.totalLessons} connected lessons that build from core concepts to applied decisions. The course emphasizes evidence use, structured practice, and feedback-informed improvement across the major assessments.`,
      gettingStarted:
        'Begin by reviewing the course site, syllabus, weekly schedule, and first lesson materials. Check the assessment calendar, confirm technology access, and post any Week 1 questions through the official course communication channel.',
      learnerIntroActivity:
        'Students introduce themselves in Week 1 by naming one course goal, one relevant experience, and one question they want the course to help answer.',
      learningOutcomes: unique(
        blueprint.lessons.flatMap((lesson) => lesson.outcomes),
        7,
      ),
      courseAtAGlance: blueprint.lessons.map((lesson) => ({
        week: `Week ${lesson.lessonNumber}`,
        topic: stripLessonPrefix(lesson.title),
        inClassFocus: lesson.activityPattern,
        studentOutput: lesson.studentArtifact,
        pointsOrWeight: blueprint.assessments.find((assessment) =>
          assessment.lessonNumbers.includes(lesson.lessonNumber),
        )?.weight,
        successCriteria: lesson.successCriteria[0],
        feedbackUse: lesson.feedbackMoment,
      })),
      outcomeAlignmentMatrix: unique(
        blueprint.lessons.flatMap((lesson) => lesson.outcomes),
        7,
      ).map((outcome, index) => ({
        outcome,
        bloomsLevel: BLOOMS_LEVELS[index % BLOOMS_LEVELS.length],
        assessedBy: blueprint.assessments
          .filter((assessment) =>
            assessment.objectives.some(
              (objective) => cleanText(objective).toLowerCase() === cleanText(outcome).toLowerCase(),
            ),
          )
          .map((assessment) => assessment.title)
          .slice(0, 3),
        practicedIn: blueprint.lessons
          .filter((lesson) => lesson.outcomes.includes(outcome))
          .map((lesson) => lesson.title)
          .slice(0, 4),
      })),
      requiredTexts: [
        {
          title: 'Instructor-provided course reading packet',
          author: 'Course instructor',
          edition: '',
          isbn: '',
          note: 'Required course materials are distributed through the official course site or assigned in class.',
        },
      ],
      courseRequirements: requirements,
      assessmentCalendar: blueprint.assessments.map((assessment) => ({
        week: `Week ${assessment.lessonNumbers[0]}`,
        assessmentOrMilestone: assessment.title,
        pointsOrWeight: assessment.weight,
        rubricCriteria: assessment.criteria,
        feedbackAndRevisionUse: assessment.feedbackUse,
      })),
      gradingScale: [
        { grade: 'A', range: '93-100' },
        { grade: 'A-', range: '90-92' },
        { grade: 'B+', range: '87-89' },
        { grade: 'B', range: '83-86' },
        { grade: 'B-', range: '80-82' },
        { grade: 'C+', range: '77-79' },
        { grade: 'C', range: '73-76' },
        { grade: 'C-', range: '70-72' },
        { grade: 'D+', range: '67-69' },
        { grade: 'D', range: '63-66' },
        { grade: 'F', range: 'Below 63' },
      ],
      latePolicy: blueprint.policies.lateWork,
      attendancePolicy:
        'Students are expected to participate in scheduled course activities and complete weekly work. If an absence affects participation or submission, contact the instructor promptly and follow the course communication process.',
      communicationPolicy: blueprint.policies.communication,
      technologyPolicy:
        'Students need reliable access to the course site, assigned readings, document submission tools, and any discipline-specific software named in weekly materials.',
      technicalSkills:
        'Students should be able to navigate the course site, submit files, participate in discussions, access readings, and use feedback to revise work.',
      aiPolicy: blueprint.policies.academicIntegrity,
      weeklySchedule: blueprint.lessons.map((lesson) => ({
        week: `Week ${lesson.lessonNumber}`,
        dates: `Week ${lesson.lessonNumber}`,
        topic: stripLessonPrefix(lesson.title),
        readings: lesson.readings.join('; '),
        assignments: `${lesson.studentArtifact}. Success criterion: ${lesson.successCriteria[0]}`,
      })),
      academicIntegrity: blueprint.policies.academicIntegrity,
      technicalSupport:
        'For technical issues, document the problem, try the recommended course-site troubleshooting steps, and contact institutional technical support or the instructor as appropriate.',
      accommodations: blueprint.policies.accessibility,
      mentalHealth:
        'Students are encouraged to use campus wellness and counseling resources when academic or personal challenges affect learning. Contact the instructor early if course planning support would help.',
      titleIX:
        'The course follows institutional non-discrimination and Title IX policies. Use official university reporting and support resources for concerns.',
      supportServices:
        'Students can use academic support, writing support, library research help, advising, and accessibility resources to strengthen course performance.',
      dataPrivacy:
        'Course technologies should be used according to institutional privacy expectations. Avoid sharing private student information outside approved course spaces.',
      importantDates: blueprint.assessments.map((assessment) => ({
        date: `Week ${assessment.lessonNumbers[0]}`,
        event: assessment.title,
      })),
      tags: unique([blueprint.courseName, ...blueprint.courseConcepts, 'assessment alignment', 'student support'], 12),
    },
  };
}

function compileAssignments(blueprint) {
  const lens = blueprintLens(blueprint);
  return {
    courseAssignmentMap: blueprint.assessments.map((assessment) => ({
      week: assessment.lessonNumbers[0],
      artifact: assessment.title,
      expectedFile: 'Document, presentation, or course-site submission as assigned',
      length: 'Course-appropriate length with enough evidence to address every criterion',
      nextPortfolioUse: assessment.feedbackUse,
    })),
    assignments: blueprint.assessments.map((assessment, index) => ({
      title: assessment.title,
      assignmentType: index % 3 === 0 ? 'Case Study' : index % 3 === 1 ? 'Reflection' : 'Applied Project',
      relatedLessons: assessment.relatedLessons,
      dueWeek: `Week ${assessment.lessonNumbers[0]}`,
      estimatedTime: '2-4 hours',
      totalPoints: assessment.points,
      percentOfGrade: assessment.weight,
      bloomsLevel: assessment.bloomsLevel,
      portfolioConnection: `This artifact documents how students apply ${assessment.relatedLessons.join(', ')} to a course-relevant decision.`,
      expectedSubmissionFormat: `Submit ${assessment.title} through the official course site using the weekly ${lens.domain} format for ${assessment.relatedLessons[0]}.`,
      highValueSuccessCriteria: assessment.successCriteria,
      instructorFeedbackPriority: assessment.feedbackUse,
      performanceBands: {
        excellent: `${assessment.title} uses precise ${lens.evidenceNoun}, clear analysis for ${assessment.relatedLessons[0]}, polished communication, and explicit revision use.`,
        proficient: `${assessment.title} includes accurate evidence and understandable analysis tied to ${assessment.relatedLessons[0]} with minor gaps in depth or polish.`,
        revisionNeeded: `${assessment.title} needs stronger evidence for ${assessment.relatedLessons[0]}, clearer reasoning, or a closer connection to the listed criteria.`,
      },
      overview: `${assessment.artifact} asks students to turn ${assessment.relatedLessons[0]} concepts into a concrete course artifact. The task is designed to show how students use evidence for ${assessment.title}, make decisions, and prepare for later work.`,
      objectives: assessment.objectives,
      instructions: [
        `Review the materials for ${assessment.relatedLessons.join(', ')} and identify the central problem or decision.`,
        `Select specific ${lens.evidenceNoun} from course readings, activities, or discussion notes for ${assessment.title}.`,
        `Draft ${assessment.title} so each section addresses one rubric criterion.`,
        `Use feedback or self-review to revise ${assessment.artifact} before posting it.`,
      ],
      formatRequirements: {
        length: `Enough detail to address every ${assessment.title} criterion; follow instructor length guidance when provided.`,
        format: `Organized ${lens.domain} document, slide, or course-site post for ${assessment.title} with headings matching the rubric criteria.`,
        citationStyle: `Use the citation style specified for ${assessment.title} or the course assignment prompt.`,
        submissionPlatform: 'Official course site',
        latePolicy: `For ${assessment.title}, follow the course late work policy and contact the instructor before the deadline when needed.`,
      },
      deliverables: [
        `Completed ${assessment.artifact} with clear headings.`,
        `${sentenceCase(lens.evidenceNoun)} or citation notes tied to ${assessment.relatedLessons[0]} course materials.`,
        `Brief reflection naming one revision decision for ${assessment.title}.`,
      ],
      scaffoldingMilestones: [
        {
          milestone: 'Evidence checkpoint',
          dueDate: `Before Week ${assessment.lessonNumbers[0]} submission`,
          description: `Identify the concept, ${lens.evidenceNoun}, and decision ${assessment.title} will address.`,
          feedback: `Use instructor, peer, or self-review feedback to focus ${assessment.artifact}.`,
          points: 10,
          uploadChecklist: [
            `${assessment.relatedLessons[0]} concept named`,
            `${lens.evidenceNoun} selected`,
            'criterion checked',
          ],
        },
        {
          milestone: 'Final submission',
          dueDate: `Week ${assessment.lessonNumbers[0]}`,
          description: `Submit the complete ${assessment.artifact} with all rubric criteria addressed.`,
          feedback: assessment.feedbackUse,
          points: 90,
          uploadChecklist: [`${assessment.title} complete`, 'criteria addressed', 'reflection included'],
        },
      ],
      gradingCriteria: assessment.criteria,
      supportResources: [
        `${assessment.relatedLessons[0]} notes and assigned readings`,
        `Rubric criteria for ${assessment.title}`,
        'Office hours or course communication channel',
      ],
      progressTracking: `Use the ${assessment.title} milestone checklist and rubric criteria to monitor readiness before submission for ${assessment.relatedLessons[0]}.`,
      academicIntegrityStatement: `For ${assessment.title}, submitted work must represent the student or team effort and cite outside sources or approved tools. Course-specific AI use in ${assessment.artifact} must be disclosed for ${assessment.title} when it contributes to submitted work.`,
      accessibilityAndUDL: `For ${assessment.title}, use accessible document structure, descriptive headings, readable contrast, and captions or alt text for media.`,
      selfAssessmentRubric: assessment.criteria.map((criterion) => `Before submitting, confirm: ${criterion}.`),
      feedbackLoop: assessment.feedbackUse,
      tags: unique(['assignment', assessment.title, ...assessment.relatedLessons, ...assessment.criteria], 10),
    })),
  };
}

function compileRubrics(blueprint) {
  const lens = blueprintLens(blueprint);
  return {
    rubrics: blueprint.assessments.map((assessment) => {
      const criteria = assessment.criteria.map((criterion, index) => {
        const weight = index === assessment.criteria.length - 1 ? 25 : 25;
        return {
          criterion,
          objectiveAligned: assessment.objectives[index % assessment.objectives.length],
          weight,
          points: Math.round((weight / 100) * assessment.points),
          exemplary: `Exceeds expectations on "${criterion}" by applying ${lens.evidenceNoun} precisely and connecting the work to ${assessment.relatedLessons.join(', ')}.`,
          proficient: `Meets "${criterion}" with accurate evidence, clear organization, and a complete ${assessment.title} response.`,
          developing: `Partially meets "${criterion}" but needs stronger ${lens.evidenceNoun}, clearer reasoning, or more complete communication.`,
          beginning: `Shows limited evidence for "${criterion}" and needs substantial revision before ${assessment.title} is ready for assessment.`,
        };
      });
      return {
        title: `${assessment.title} Rubric`,
        lessonTitle: assessment.relatedLessons.join(', '),
        gradedWork: assessment.artifact,
        assessmentType: 'Assignment',
        totalPoints: assessment.points,
        bloomsLevel: assessment.bloomsLevel,
        gradingScale: {
          exemplary: '90-100%',
          proficient: '80-89%',
          developing: '70-79%',
          beginning: 'Below 70%',
        },
        criteria,
        taskDirections: `Score the ${assessment.artifact} for ${assessment.relatedLessons.join(', ')} using the criteria below.`,
        instructorFacilitationNote: `Share the ${assessment.title} rubric before students draft, then use criterion-level feedback for ${assessment.artifact} revision guidance.`,
        accessibilityAndUDL: `For ${assessment.title}, allow equivalent accessible formats when students demonstrate the same ${lens.evidenceNoun}, reasoning, and communication criteria.`,
        anchorExamples: {
          exemplary: `Names relevant ${lens.evidenceNoun}, explains the ${lens.decisionNoun}, and reflects on revision use for ${assessment.title}.`,
          proficient: `Uses relevant evidence and answers the ${assessment.artifact} prompt with clear organization.`,
          developing: `Mentions ${assessment.relatedLessons[0]} ideas but needs clearer evidence or stronger decision logic.`,
          beginning: `Provides general description with little ${assessment.title} evidence or criterion alignment.`,
        },
        gradePolicyConnection: `${assessment.weight} of the course grade when the syllabus weighting is used.`,
        teacherNotes: assessment.feedbackUse,
        tags: unique(['rubric', assessment.title, ...assessment.relatedLessons, ...assessment.criteria], 10),
      };
    }),
  };
}

function compileStudyGuides(blueprint) {
  const lens = blueprintLens(blueprint);
  return {
    studyGuides: blueprint.lessons.map((lesson) => {
      const phrase = lessonPhrase(blueprint, lesson);
      return {
        lessonTitle: lesson.title,
        examScope: `Use this guide to prepare for Week ${lesson.lessonNumber} checks on ${phrase.context} and later assessments.`,
        summary: `${lesson.title} focuses on ${lesson.keyConcepts.slice(0, 3).join(', ')}. Students should connect those ideas to the weekly activity pattern, ${phrase.evidenceMove}, and ${phrase.decisionMove}.`,
        keyTerms: lesson.keyConcepts.slice(0, 8).map((term) => ({
          term,
          definition: `${term} as used in ${lesson.title}, with attention to ${lens.evidenceNoun}, context, and application.`,
          example: `In ${lesson.title}, students use ${term} to explain a concrete ${lens.decisionNoun}.`,
        })),
        conceptConnections: [
          `${lesson.title} connects to the assessment artifact: ${lesson.studentArtifact}.`,
          `The lesson prepares students to meet this success criterion: ${lesson.successCriteria[0]}`,
        ],
        commonMisconceptions: [
          {
            misconception: `For ${stripLessonPrefix(lesson.title)}, summarizing the topic is enough for strong work.`,
            correction: `Strong ${lesson.title} work applies ${phrase.context} to evidence and explains the decision or implication.`,
          },
          {
            misconception: `One ${lens.exampleNoun} proves the whole ${stripLessonPrefix(lesson.title)} claim.`,
            correction: `Use enough ${lens.evidenceNoun} in ${lesson.title} to show the pattern and name the limits of the example.`,
          },
        ],
        reviewQuestions: [
          {
            question: `How would you explain the central idea of ${stripLessonPrefix(lesson.title)} using ${lens.evidenceNoun}?`,
            bloomsLevel: 'Analyze',
            hint: `Name ${phrase.context}, cite evidence, and explain why it matters.`,
          },
          {
            question: `What would strong work on ${lesson.studentArtifact} need to show?`,
            bloomsLevel: 'Evaluate',
            hint: lesson.successCriteria.join(' '),
          },
          {
            question: `How does feedback from ${lesson.title} improve a later artifact?`,
            bloomsLevel: 'Apply',
            hint: lesson.feedbackMoment,
          },
        ],
        practiceActivities: [
          `Create a three-column note with concept, ${lens.evidenceNoun}, and decision for ${stripLessonPrefix(lesson.title)}.`,
          `Self-check a ${lesson.studentArtifact} draft against this criterion: ${lesson.successCriteria[0]}`,
        ],
        examPrep: {
          keyTopicsToKnow: lesson.keyConcepts.slice(0, 5),
          timeline: `Review ${lesson.title} notes after Week ${lesson.lessonNumber}, then revisit before the next assessment.`,
          commonErrors: `Avoid unsupported claims, vague ${phrase.context} definitions, and responses that omit ${lesson.studentArtifact}.`,
          reviewStrategy: `Practice explaining one ${lesson.keyConcepts[0] || 'concept'}, one ${lens.evidenceNoun} source, and one implication out loud.`,
        },
        studentResources: `Use ${lesson.title} readings, instructor notes, office hours, peer discussion, and the rubric criteria for this lesson.`,
        tags: unique(['study guide', lesson.title, ...lesson.keyConcepts], 10),
      };
    }),
  };
}

function quizQuestionId(lesson, index) {
  return `lesson-${lesson.lessonNumber}-q${index + 1}`;
}

function quizTags(lesson, type, bloom, use) {
  return unique(['quiz', lesson.title, ...lesson.keyConcepts.slice(0, 3), type, bloom, use], 8);
}

function buildMultipleChoiceQuestion({ lesson, index, bloom, difficulty, objective, concept, use, prompt, correct }) {
  const id = quizQuestionId(lesson, index);
  return {
    id,
    type: 'multiple_choice',
    bloomsLevel: bloom,
    difficulty,
    estimatedMinutes: difficulty === 'Hard' ? 3 : 2,
    points: 2,
    objectiveAligned: objective,
    intendedUse: `${use} for ${lesson.title}; review distractor choices before the next ${lesson.studentArtifact}.`,
    question: prompt,
    options: [
      `A. Treat ${concept} in ${lesson.title} as background information and move directly to a general summary.`,
      `B. ${correct}`,
      `C. Choose the quickest activity even if it weakens evidence for ${lesson.studentArtifact}.`,
      `D. Delay the ${lesson.title} decision until all possible ${concept} materials have been reviewed.`,
    ],
    answer: 'B',
    distractorRationale: `A: This skips the evidence-to-decision move in ${lesson.title}; C: Speed alone does not meet the objective for ${lesson.studentArtifact}; D: Waiting for perfect information prevents a usable course decision.`,
    explanation: `The correct answer is B because it connects ${concept} to ${lesson.studentArtifact}, uses lesson evidence, and supports the objective "${objective}".`,
    tags: quizTags(lesson, 'multiple_choice', bloom, use),
  };
}

function buildShortAnswerQuestion({ lesson, index, bloom, objective, concept, lens }) {
  return {
    id: quizQuestionId(lesson, index),
    type: 'short_answer',
    bloomsLevel: bloom,
    difficulty: 'Medium',
    estimatedMinutes: 5,
    points: 4,
    objectiveAligned: objective,
    intendedUse: `Formative written check after ${lesson.title}; use responses to identify review needs before ${lesson.studentArtifact}.`,
    question: `In 2-3 sentences, explain how ${concept} should shape ${lesson.studentArtifact} and name one ${lens.evidenceNoun} source from ${lesson.title} students should use.`,
    answer: `${concept} should guide the evidence students select and the decision they justify in ${lesson.studentArtifact}. A strong ${lesson.title} answer names a lesson source, explains why it fits, and states how the evidence changes the next step.`,
    sampleAnswer: `For ${lesson.title}, I would use ${concept} to choose evidence that directly supports ${lesson.studentArtifact}. I would cite a specific reading, activity result, or case example from ${lesson.title} and explain how it changes the ${lens.decisionNoun}.`,
    explanation: `A complete response links ${concept}, ${lesson.studentArtifact}, and a concrete ${lens.evidenceNoun} source instead of only defining the term.`,
    scoringGuidance: `Full credit for ${lesson.title} requires ${concept}, one concrete evidence source, and a decision implication. Partial credit is appropriate when the answer names ${concept} but omits evidence or the implication. Flag answers that summarize ${lesson.title} without applying it.`,
    tags: quizTags(lesson, 'short_answer', bloom, 'formative check'),
  };
}

function buildEssayQuestion({ lesson, index, objective, concept, lens }) {
  return {
    id: quizQuestionId(lesson, index),
    type: 'essay',
    bloomsLevel: 'Create',
    difficulty: 'Hard',
    estimatedMinutes: 12,
    points: 8,
    objectiveAligned: objective,
    intendedUse: `Summative or exam-prep synthesis for ${lesson.title}; score with the rubric hints before students revise related work.`,
    question: `Analyze ${lesson.studentArtifact} as a ${lens.exampleNoun}. In 2-3 organized paragraphs, create a defensible next step that uses ${concept}, cites lesson evidence, and explains one limitation.`,
    rubricHints: `Strong responses define ${concept}, use at least two pieces of ${lens.evidenceNoun}, justify a ${lens.decisionNoun}, and acknowledge a limitation or risk.`,
    sampleAnswer: `A strong response for ${lesson.title} would identify how ${concept} changes the artifact, cite evidence from the lesson activity or readings, and propose a next step that is feasible for ${lesson.studentArtifact}. It would also name a ${lesson.title} limitation so the recommendation is not overstated.`,
    explanation: `The essay is scored for synthesis: students must turn ${concept} and evidence into a defensible ${lens.decisionNoun}, not merely list lesson facts.`,
    scoringGuidance: `Full credit for ${lesson.title} requires concept accuracy, evidence use, a justified next step, and a limitation. Partial credit is appropriate when the response has ${concept} evidence but weak decision logic. Flag responses that ignore ${lesson.studentArtifact}.`,
    tags: quizTags(lesson, 'essay', 'Create', 'exam synthesis'),
  };
}

export function buildQuizAtomsForLesson(lesson, blueprint, options = {}) {
  const lens = blueprintLens(blueprint);
  const concept = lesson.keyConcepts[0] || stripLessonPrefix(lesson.title);
  const secondary = lesson.keyConcepts[1] || concept;
  const objective = lesson.outcomes[0] || objectiveForLesson(lesson.title, lesson.keyConcepts);
  const targetCount = Math.max(5, Math.min(7, Number(options.questionsPerLesson) || 6));
  const atoms = [
    buildMultipleChoiceQuestion({
      lesson,
      index: 0,
      bloom: QUIZ_BLOOMS_SEQUENCE[0],
      difficulty: 'Easy',
      objective,
      concept,
      use: 'diagnostic retrieval practice',
      prompt: `Which statement best explains why ${concept} matters for ${lesson.studentArtifact}?`,
      correct: `${sentenceCase(concept)} helps students choose relevant evidence and justify the decision in ${lesson.studentArtifact}.`,
    }),
    buildMultipleChoiceQuestion({
      lesson,
      index: 1,
      bloom: QUIZ_BLOOMS_SEQUENCE[2],
      difficulty: 'Medium',
      objective,
      concept,
      use: 'formative quiz',
      prompt: `A student is preparing ${lesson.studentArtifact}. Which action best applies ${concept} from ${lesson.title}?`,
      correct: `Use ${concept} to select a concrete example, connect it to the objective, and revise the artifact before submission.`,
    }),
    buildMultipleChoiceQuestion({
      lesson,
      index: 2,
      bloom: QUIZ_BLOOMS_SEQUENCE[3],
      difficulty: 'Medium',
      objective,
      concept: secondary,
      use: 'exam review',
      prompt: `Which instructor question would best reveal whether students can analyze ${secondary} in ${lesson.title}?`,
      correct: `Ask students to compare two pieces of evidence and explain which one better supports ${lesson.studentArtifact}.`,
    }),
    buildShortAnswerQuestion({
      lesson,
      index: 3,
      bloom: QUIZ_BLOOMS_SEQUENCE[3],
      objective,
      concept,
      lens,
    }),
    buildMultipleChoiceQuestion({
      lesson,
      index: 4,
      bloom: QUIZ_BLOOMS_SEQUENCE[4],
      difficulty: 'Hard',
      objective,
      concept,
      use: 'summative assessment',
      prompt: `Which feedback move best helps students evaluate the quality of ${lesson.studentArtifact}?`,
      correct: `Compare ${lesson.studentArtifact} against the ${concept} success criteria, identify the weakest evidence link, and choose one revision priority.`,
    }),
    buildEssayQuestion({ lesson, index: 5, objective, concept, lens }),
  ];
  return atoms.slice(0, targetCount).map((atom, index) => ({ ...atom, id: quizQuestionId(lesson, index) }));
}

function compileQuizBank(blueprint, config = {}) {
  const quizzes = blueprint.lessons.map((lesson) => {
    const questions = buildQuizAtomsForLesson(lesson, blueprint, config);
    const totalPoints = questions.reduce((sum, question) => sum + Number(question.points || 0), 0);
    const totalMinutes = questions.reduce((sum, question) => sum + Number(question.estimatedMinutes || 0), 0);
    return {
      lessonTitle: lesson.title,
      totalQuestions: questions.length,
      totalPoints,
      pointPlan: `${lesson.title} uses ${questions.filter((question) => question.type === 'multiple_choice').length} multiple-choice item(s) at 2 points, ${questions.filter((question) => question.type === 'short_answer').length} short-answer item(s) at 4 points, and ${questions.filter((question) => question.type === 'essay').length} essay item(s) at 8 points for ${totalPoints} total points.`,
      bloomsCoverage: unique(
        questions.map((question) => question.bloomsLevel),
        6,
      ),
      formativeFeedbackNote: `For ${lesson.title}, administer these questions after students practice ${compactList(lesson.keyConcepts, 'the lesson concepts', 3)}. Review missed items within one class session, allow screen-reader-friendly text formats or extended time as needed, and ask students to use results to revise ${lesson.studentArtifact}. Estimated completion time is ${totalMinutes} minutes.`,
      questions,
      assessmentBlueprint: `${lesson.title} covers ${lesson.outcomes.join('; ')} with ${lesson.title} lower-order retrieval, applied analysis, evaluation, and one synthesis prompt. Results indicate which parts of ${lesson.studentArtifact} need reteaching or feedback.`,
      tags: unique(['quiz bank', lesson.title, ...lesson.keyConcepts, lesson.studentArtifact], 8),
    };
  });

  return {
    quizzes,
    bankIndex: quizzes.flatMap((quiz) =>
      quiz.questions.map((question) => ({
        id: question.id,
        lessonTitle: quiz.lessonTitle,
        type: question.type,
        bloomsLevel: question.bloomsLevel,
        difficulty: question.difficulty,
        estimatedMinutes: question.estimatedMinutes,
        intendedUse: question.intendedUse,
        tags: question.tags,
      })),
    ),
  };
}

const SLIDE_STRUCTURAL_LABEL_RE =
  /^(?:clinical\s+block\s*\d*|block\s*\d+|studio\s+seminar|clinical\s+placement|field\s+application|course\s+goals)$/i;
const SLIDE_WEAK_PHRASE_RE = /^(?:tbd|to be determined|none|n\/a|lesson|week|topic|clinical|block|studio|seminar)$/i;

function normalizeSlidePhrase(value) {
  const raw = stripTerminalPunctuation(stripLessonPrefix(value))
    .replace(/\bTBD\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!raw) return '';

  const parts = raw
    .split(/\s*\/\s*/)
    .map((part) =>
      stripTerminalPunctuation(part)
        .replace(/^(?:clinical\s+block\s*\d+|block\s*\d+)\s*[:.-]?\s*/i, '')
        .trim(),
    )
    .filter(Boolean);

  const phrase =
    parts.length > 1
      ? parts.filter((part) => !SLIDE_STRUCTURAL_LABEL_RE.test(part)).join(' and ') || parts[parts.length - 1]
      : parts[0] || raw;

  return cleanText(
    phrase
      .replace(/^(?:studio\s+seminar|clinical\s+placement|field\s+application)\s*[:.-]?\s*/i, '')
      .replace(/\s+/g, ' '),
  );
}

function isWeakSlidePhrase(value) {
  const text = cleanText(value);
  if (!text) return true;
  if (SLIDE_WEAK_PHRASE_RE.test(text)) return true;
  return text.length > 95;
}

function slideConceptCandidates(lesson) {
  return unique(
    [
      ...asArray(lesson?.keyConcepts),
      lesson?.title,
      ...(lesson?.outcomes || []),
      ...(lesson?.readings || []),
      lesson?.activityPattern,
    ]
      .map(normalizeSlidePhrase)
      .filter((phrase) => !isWeakSlidePhrase(phrase)),
    6,
  );
}

function primarySlideConcept(lesson) {
  return slideConceptCandidates(lesson)[0] || `Week ${lesson?.lessonNumber || ''} focus`.trim();
}

function secondarySlideConcept(lesson, primary = primarySlideConcept(lesson)) {
  return (
    slideConceptCandidates(lesson).find(
      (candidate) => cleanText(candidate).toLowerCase() !== cleanText(primary).toLowerCase(),
    ) || primary
  );
}

function slideConceptList(lesson, fallback = primarySlideConcept(lesson)) {
  return compactList(slideConceptCandidates(lesson), fallback, 3);
}

function slideLessonTitle(lesson) {
  const title = normalizeSlidePhrase(lesson?.title);
  const display = isWeakSlidePhrase(title) ? primarySlideConcept(lesson) : title;
  return `Lesson ${lesson?.lessonNumber || ''}: ${sentenceCase(display)}`.replace(/\s+:/, ':').trim();
}

function slideArtifact(lesson) {
  const parts = cleanText(lesson?.studentArtifact)
    .split(/\s*;\s*/)
    .map(stripTerminalPunctuation)
    .filter((part) => part && !/\b(TBD|to be determined)\b/i.test(part));
  return parts[0] || `${primarySlideConcept(lesson)} artifact`;
}

function slideActivityCue(lesson) {
  return (
    cleanText(lesson?.activityPattern)
      .split(/\s*;\s*/)
      .map(stripTerminalPunctuation)
      .find((part) => part && !/\b(TBD|to be determined)\b/i.test(part)) ||
    `short applied practice with ${primarySlideConcept(lesson)}`
  );
}

function slideSourceCue(lesson) {
  return (
    asArray(lesson?.readings)
      .map(normalizeSlidePhrase)
      .find((part) => !isWeakSlidePhrase(part)) || `${primarySlideConcept(lesson)} course materials`
  );
}

function slideSuccessCriterion(lesson) {
  return (
    asArray(lesson?.successCriteria).find((criterion) => criterion && !/\b(TBD|to be determined)\b/i.test(criterion)) ||
    `Uses specific evidence about ${primarySlideConcept(lesson)} to improve ${slideArtifact(lesson)}.`
  );
}

function slideDeckPhrase(blueprint, lesson) {
  const lens = blueprintLens(blueprint);
  const concept = primarySlideConcept(lesson);
  const source = slideSourceCue(lesson);
  return {
    context: slideConceptList(lesson, concept),
    evidenceMove: `use ${lens.evidenceNoun} from ${source} to test ${concept}`,
    decisionMove: `choose the ${lens.decisionNoun} for ${slideArtifact(lesson)}`,
  };
}

function slideVisual(lesson, type, title, index) {
  if (['title', 'agenda', 'objectives', 'closing'].includes(type)) {
    return { kind: 'none', description: '', altText: '' };
  }
  const kind = SLIDE_VISUAL_KINDS[index % SLIDE_VISUAL_KINDS.length];
  const concepts = slideConceptCandidates(lesson);
  const concept = concepts[index % Math.max(1, concepts.length)] || primarySlideConcept(lesson);
  const artifact = slideArtifact(lesson);
  return {
    kind,
    description: `${sentenceCase(kind)} for ${concept}: connect the evidence source, student decision, and ${artifact}.`,
    altText: `A ${kind} connects ${concept} evidence to ${artifact} for the slide "${title}".`,
  };
}

function slideTypeFocus(type, lesson, lens) {
  const concept = primarySlideConcept(lesson);
  const secondary = secondarySlideConcept(lesson, concept);
  const displayTitle = slideLessonTitle(lesson);
  const artifact = slideArtifact(lesson);
  const source = slideSourceCue(lesson);
  const successCriterion = slideSuccessCriterion(lesson);
  switch (type) {
    case 'title':
      return {
        opening: `Frame ${displayTitle} as a working session on ${slideConceptList(lesson)}, with ${artifact} as the visible product.`,
        evidence: `Preview the ${lens.evidenceNoun} from ${source} that students will inspect before they revise ${artifact}.`,
        misconception: `Set the expectation that students will leave with one concrete move they can use in ${artifact}.`,
      };
    case 'agenda':
      return {
        opening: `Walk through the lesson flow so students can see where ${concept}, practice, and feedback each appear in ${displayTitle}.`,
        evidence: `Point to the work block where students test ${secondary} against live ${lens.evidenceNoun} for ${artifact}.`,
        misconception: `Clarify that preparation, practice, and debrief all support ${artifact} rather than disconnected tasks.`,
      };
    case 'objectives':
      return {
        opening: `Translate the objectives into actions students should demonstrate by the end of ${displayTitle}.`,
        evidence: `Tie each objective to the evidence move students need for ${artifact}.`,
        misconception: `If students treat the objectives as vocabulary only, restate them as decisions they must justify in ${artifact}.`,
      };
    case 'bridge':
      return {
        opening: `Connect the prior lesson to today's ${concept} decision so the course arc feels cumulative.`,
        evidence: `Name what prior ${lens.evidenceNoun} still matters for ${artifact} and what new evidence students need to add today.`,
        misconception: `Prevent compartmentalized thinking by showing how today's ${concept} revision changes the ongoing ${artifact} sequence.`,
      };
    case 'keyTerm':
      return {
        opening: `Define ${concept} with language students can reuse in notes, field observations, critique, or draft feedback.`,
        evidence: `Model one sentence that applies ${concept} to ${artifact} using course evidence.`,
        misconception: `Correct any tendency to use ${concept} as a label without showing what evidence makes it credible.`,
      };
    case 'example':
      return {
        opening: `Use the scenario to show how a practitioner notices ${concept} inside a realistic course situation.`,
        evidence: `Pause on the example long enough for students to identify which detail counts as usable ${lens.evidenceNoun} for ${artifact}.`,
        misconception: `If students jump to recommendations about ${artifact} too early, bring them back to what the ${concept} example actually shows.`,
      };
    case 'activity':
      return {
        opening: `Give students a short work window to revise ${artifact} with a partner before the debrief.`,
        evidence: `Circulate for whether pairs can point to one concrete ${lens.evidenceNoun} move and one ${concept} revision choice in ${artifact}.`,
        misconception: `When groups stay abstract, require them to annotate the exact sentence, note, or claim they would change in ${artifact}.`,
      };
    case 'discussion':
      return {
        opening: `Use the discussion to compare competing interpretations before students lock in their next ${artifact} move.`,
        evidence: `Push students to cite specific ${lens.evidenceNoun} instead of general impressions when they defend a ${concept} choice in ${artifact}.`,
        misconception: `If the conversation turns into opinion-sharing, redirect to ${artifact} and ask what ${concept} evidence would change the decision.`,
      };
    case 'summary':
      return {
        opening: `Treat the ${concept} self-check for ${artifact} as a quick readiness check, not as a formality before dismissal.`,
        evidence: `Ask students to name which ${lens.evidenceNoun} now feels strongest for ${artifact}.`,
        misconception: `If they can only repeat vocabulary, prompt for the specific ${artifact} revision or next step they can now justify.`,
      };
    case 'closing':
      return {
        opening: `End by naming the exact follow-through students should complete after ${displayTitle}.`,
        evidence: `Remind them which note, example, or feedback move should carry forward into ${artifact}.`,
        misconception: `Avoid vague homework language; specify that the next step is to improve ${artifact} with today's evidence and feedback.`,
      };
    default:
      return {
        opening: `Use this slide to keep ${displayTitle} tied to ${slideConceptList(lesson)}.`,
        evidence: `Connect the slide to one visible ${lens.evidenceNoun} move in ${artifact}.`,
        misconception: `Redirect abstract discussion back to the evidence and decision work students must complete in ${artifact}.`,
      };
  }
}

function slideNoteAnchor({ type, anchor, concept, artifact, displayTitle }) {
  switch (type) {
    case 'title':
      return `Open the working session by naming the product students are building: ${artifact}. Use "${anchor}" to connect the topic to the decisions they will make today.`;
    case 'agenda':
      return `Keep the pacing visible and point to the first ${concept} checkpoint: ${anchor}. Students should know when they will listen, practice, compare, and revise ${artifact}.`;
    case 'objectives':
      return `Turn "${anchor}" into an observable performance target; ask students what evidence would prove they can do it.`;
    case 'bridge':
      return `Use "${anchor}" as the continuity cue between prior work and today's ${concept} decision.`;
    case 'keyTerm':
      return `Put "${anchor}" into a sentence students could write in their own notes before showing a formal definition.`;
    case 'example':
      return `Treat "${anchor}" as the ${concept} detail to inspect, then ask what it reveals about ${artifact} and what it does not prove.`;
    case 'activity':
      return `Set up the activity with a visible output: each pair must leave a marked revision, not just a conversation about ${concept}.`;
    case 'discussion':
      return `Start the discussion from a concrete contrast in "${anchor}" so the exchange does not drift into general opinion.`;
    case 'summary':
      return `Use "${anchor}" as a quick oral or written check for ${concept} readiness before students leave ${displayTitle}.`;
    case 'closing':
      return `Close with the handoff: students should know exactly what to revise, prepare, or submit for ${artifact}.`;
    default:
      return `Use "${anchor}" as the claim students need to test with evidence, not as a heading to copy.`;
  }
}

function slideNoteCriterionCue(type, criterion) {
  const cues = {
    title: `Keep the success test visible from the start: ${criterion}`,
    agenda: `Use the agenda to show when students will practice this criterion: ${criterion}`,
    objectives: `Make the criterion measurable in student language: ${criterion}`,
    bridge: `Ask which prior move already supports the criterion and which part still needs work: ${criterion}`,
    keyTerm: `Check that students can use the term to meet this criterion: ${criterion}`,
    example: `Score the example against the criterion before moving on: ${criterion}`,
    activity: `During circulation, look for evidence that pairs are improving this criterion: ${criterion}`,
    discussion: `Use the criterion to decide which argument is strongest: ${criterion}`,
    summary: `Have students self-rate readiness against this criterion: ${criterion}`,
    closing: `Make the after-class task point directly back to this criterion: ${criterion}`,
  };
  return cues[type] || `Tie the explanation back to this criterion: ${criterion}`;
}

function slideNoteTransition({ type, nextCue, lens, concept, artifact }) {
  if (nextCue) {
    const transitions = {
      title: `Then move into "${nextCue}" by asking what students need to notice first about ${concept}.`,
      agenda: `Before "${nextCue}", confirm students can name the ${concept} evidence they will use for ${artifact}.`,
      objectives: `Transition to "${nextCue}" by choosing one ${concept} objective to watch during practice.`,
      bridge: `Use that ${concept} carry-forward point to launch "${nextCue}" without restarting the lesson from scratch.`,
      keyTerm: `Move to "${nextCue}" by asking students where ${concept} would show up in ${artifact}.`,
      content: `Move next to "${nextCue}" by naming how ${concept} changes the ${lens.decisionNoun} for ${artifact}.`,
      example: `Carry the strongest ${concept} detail into "${nextCue}" as the next piece of evidence for ${artifact}.`,
      activity: `Use one ${artifact} revision as the bridge into "${nextCue}".`,
      discussion: `Close the exchange by selecting the ${concept} claim that should guide "${nextCue}".`,
      summary: `Use the ${concept} self-check result to decide what needs reinforcement in "${nextCue}".`,
      closing: `Point students to "${nextCue}" as the next place their ${artifact} revision decision will matter.`,
    };
    return transitions[type] || `Move next to "${nextCue}" by naming how it changes the ${lens.decisionNoun}.`;
  }
  return `End by asking how this point changes the ${lens.decisionNoun} students will make for ${artifact}.`;
}

function slideNotes({ lesson, title, type, bullets, nextCue, lens }) {
  const anchor = bullets[0] || title;
  const focus = slideTypeFocus(type, lesson, lens);
  const concept = primarySlideConcept(lesson);
  const artifact = slideArtifact(lesson);
  const displayTitle = slideLessonTitle(lesson);
  const criterion = slideSuccessCriterion(lesson);
  return [
    `${focus.opening} ${slideNoteAnchor({ type, anchor, concept, artifact, displayTitle })}`,
    focus.evidence,
    `${focus.misconception} ${slideNoteCriterionCue(type, criterion)}`,
    slideNoteTransition({ type, nextCue, lens, concept, artifact }),
  ].join(' ');
}

function discussionFormatForLesson(index) {
  return DISCUSSION_FORMAT_SEQUENCE[index % DISCUSSION_FORMAT_SEQUENCE.length];
}

function discussionDurationForFormat(format) {
  if (format === 'Asynchronous Online') return 'Initial post by midweek; replies by week end';
  if (format === 'Gallery Walk') return '25 min';
  if (format === 'Debate / Structured Academic Controversy') return '30 min';
  return '20-25 min';
}

function buildDiscussionArtifactSet(lesson, phrase) {
  const concept = lesson.keyConcepts[0] || stripLessonPrefix(lesson.title);
  return [
    {
      title: `${stripLessonPrefix(lesson.title)} Reading Notes`,
      locator: lesson.readings.slice(0, 2).join('; '),
      use: `Pull one concrete claim or data point that clarifies ${concept} in the main prompt.`,
    },
    {
      title: `${stripLessonPrefix(lesson.title)} Assessment Brief`,
      locator: cleanText(lesson.studentArtifact, `${stripLessonPrefix(lesson.title)} weekly artifact`),
      use: `Use this artifact expectation to test whether the proposed decision would hold up in assessed work and ${phrase.decisionMove}.`,
    },
  ];
}

function buildDiscussionPrompt(lesson, phrase, lens) {
  const concept = lesson.keyConcepts[0] || stripLessonPrefix(lesson.title);
  const secondary = lesson.keyConcepts[1] || concept;
  return `Which ${concept} choice should students defend in ${lesson.studentArtifact}, and how does ${secondary} strengthen or complicate that decision?`;
}

function buildDiscussionFollowUps(lesson, phrase) {
  const concept = lesson.keyConcepts[0] || stripLessonPrefix(lesson.title);
  const artifact = stripTerminalPunctuation(lesson.studentArtifact);
  return [
    `What evidence from ${lesson.title} most strongly supports your position on ${concept}?`,
    `Which alternative reading of the same evidence about ${concept} would challenge your claim, and why might another student prefer it for ${artifact}?`,
    `If the evidence changed, what part of ${lesson.studentArtifact} would you revise first?`,
    `Where is the strongest limitation, risk, or ethical concern in your current reasoning about ${artifact}?`,
    `How does this discussion help students ${stripTerminalPunctuation(phrase.decisionMove).toLowerCase()}?`,
  ];
}

function buildDiscussionFacilitationTips(lesson, format) {
  const concept = lesson.keyConcepts[0] || stripLessonPrefix(lesson.title);
  const artifact = stripTerminalPunctuation(lesson.studentArtifact);
  return {
    opening: `Launch with two minutes of silent note-making on which ${concept} evidence source seems strongest for ${lesson.studentArtifact}, then ask for two contrasting claims before discussion opens.`,
    ifStalls: `Ask students to compare the strongest and weakest evidence choices for ${lesson.studentArtifact}, or switch to a quick pair exchange before reopening the ${format.toLowerCase()}.`,
    ifDominates: `Pause the ${format.toLowerCase()}, invite a new voice to paraphrase the current ${concept} claim, then require the next response to add evidence or a limitation that would sharpen ${artifact}.`,
    closure: `Close by naming one claim the class can defend with evidence, one unresolved limitation in ${concept}, and one revision students should make before completing ${lesson.studentArtifact}.`,
  };
}

function buildDiscussionResponseStems(lesson) {
  const concept = lesson.keyConcepts[0] || stripLessonPrefix(lesson.title);
  return [
    `The evidence I find most convincing for ${concept} is...`,
    `I agree with that conclusion about ${concept} only if the evidence also shows...`,
    `A limitation in this reasoning about ${lesson.studentArtifact} is...`,
    `If I were revising ${lesson.studentArtifact} after this ${concept} discussion, I would change...`,
  ];
}

function buildDiscussionCriteriaSet(lesson) {
  const concept = lesson.keyConcepts[0] || stripLessonPrefix(lesson.title);
  return [
    `Uses specific evidence from ${lesson.title} instead of unsupported opinion.`,
    `Explains the reasoning behind the claim and connects it to ${lesson.studentArtifact}.`,
    `Responds to a peer by extending, questioning, or refining the evidence used about ${concept}.`,
    `Names one limitation, ethical concern, or revision step that would improve ${lesson.studentArtifact}.`,
  ];
}

function buildDiscussionGuidelinesForFormat(lesson, format) {
  const concept = lesson.keyConcepts[0] || stripLessonPrefix(lesson.title);
  if (format === 'Asynchronous Online') {
    return `Post one evidence-based response by Wednesday 11:59 PM and two substantive replies by Sunday 11:59 PM. Your initial post should be about 175-225 words, cite at least one lesson source, and take a clear position on ${lesson.studentArtifact}. A substantive reply extends or challenges a peer's evidence, reasoning, or limitation statement about ${concept} rather than simply agreeing. Discussion credit depends on timeliness, evidence use, and the quality of peer engagement around ${lesson.title}.`;
  }

  return `Come prepared with one brief evidence note before class, speak or post at least twice during the ${format}, and respond directly to one peer by building on or challenging their evidence. Reference a course concept, case detail, or reading when you contribute, and connect at least one comment to ${lesson.studentArtifact}. If you need an alternative participation mode, use the instructor-approved written or chat response option during the same activity window for ${lesson.title}. Participation is judged by evidence use, reasoning, peer response quality, and whether you name a limitation or revision move tied to ${concept}.`;
}

function compileDiscussions(blueprint) {
  const lens = blueprintLens(blueprint);
  return {
    discussionDesign: {
      courseThroughline: `Each discussion moves students from naming ${lens.evidenceNoun} to defending a ${lens.decisionNoun} they will need in later course artifacts.`,
      sharedParticipationNorms:
        'Use evidence before opinion, listen for contrasting interpretations, paraphrase before rebutting, and leave space for written, spoken, or chat-based entry points.',
      scoringApproach:
        'Discussion quality is judged by evidence use, reasoning, peer response quality, and the ability to name a limitation or revision step.',
    },
    discussions: blueprint.lessons.map((lesson, index) => {
      const phrase = lessonPhrase(blueprint, lesson);
      const format = discussionFormatForLesson(index);
      return {
        lessonTitle: lesson.title,
        bloomsLevel: lesson.bloomsLevel,
        format,
        estimatedDuration: discussionDurationForFormat(format),
        context: `${lesson.title} asks students to work with ${phrase.context}. The discussion should test how students ${phrase.evidenceMove} and whether they can ${stripTerminalPunctuation(phrase.decisionMove).toLowerCase()} before they finalize ${lesson.studentArtifact}.`,
        prompt: buildDiscussionPrompt(lesson, phrase, lens),
        evidenceRequirement: `Use at least one ${lens.evidenceNoun} source from ${lesson.title} and one concrete detail from ${lesson.studentArtifact} or its success criteria.`,
        sourceArtifacts: buildDiscussionArtifactSet(lesson, phrase),
        followUpProbes: buildDiscussionFollowUps(lesson, phrase),
        facilitationTips: buildDiscussionFacilitationTips(lesson, format),
        responseStems: buildDiscussionResponseStems(lesson),
        evaluationCriteria: buildDiscussionCriteriaSet(lesson),
        equityConsiderations: `Begin with two minutes of individual think time on ${lesson.studentArtifact}, allow written or spoken entry, invite quieter voices before a second comment from the same student, and provide sentence frames so students can cite ${lesson.keyConcepts[0] || stripLessonPrefix(lesson.title)} evidence without rushing.`,
        guidelines: buildDiscussionGuidelinesForFormat(lesson, format),
        tags: unique(['discussion', format, lesson.bloomsLevel, ...lesson.keyConcepts.slice(0, 4)], 8),
      };
    }),
  };
}

function buildSlideDeckIrForLesson(blueprint, lesson, index) {
  const lens = blueprintLens(blueprint);
  const phrase = slideDeckPhrase(blueprint, lesson);
  const previous = blueprint.lessons[index - 1];
  const next = blueprint.lessons[index + 1];
  const displayTitle = slideLessonTitle(lesson);
  const concept = primarySlideConcept(lesson);
  const secondary = secondarySlideConcept(lesson, concept);
  const artifact = slideArtifact(lesson);
  const activityCue = slideActivityCue(lesson);
  const sourceCue = slideSourceCue(lesson);
  const successCriterion = slideSuccessCriterion(lesson);
  const sequenceArtifact = /\b(TBD|to be determined)\b/i.test(cleanText(lesson.studentArtifact))
    ? artifact
    : cleanText(lesson.studentArtifact, artifact);
  const sequenceCriterion = stripTerminalPunctuation(successCriterion);
  const objectiveOne =
    lesson.outcomes.find((outcome) => outcome && !/\b(TBD|to be determined)\b/i.test(outcome)) ||
    `Analyze ${concept} using course evidence and explain how it informs ${artifact}.`;
  const objectiveTwo =
    lesson.outcomes.find((outcome) => outcome !== objectiveOne && !/\b(TBD|to be determined)\b/i.test(outcome)) ||
    `Evaluate how ${secondary} evidence changes ${artifact}.`;
  const slides = [
    {
      type: 'title',
      title: displayTitle,
      bullets: [`${blueprint.courseName}: ${phrase.context}`, `Today students improve: ${artifact}`],
      minutes: 1,
      bloom: null,
      objective: null,
      activity: null,
    },
    {
      type: 'agenda',
      title: 'Session Plan',
      bullets: [
        `Frame ${concept} through ${sourceCue}.`,
        `Model the evidence decision for ${artifact}.`,
        `Practice with ${concept}: ${activityCue}.`,
        `Debrief against this criterion: ${successCriterion}`,
        next
          ? `Carry forward to ${primarySlideConcept(next)}.`
          : 'Carry forward to final synthesis and revision planning.',
      ],
      minutes: 2,
      bloom: null,
      objective: null,
      activity: null,
    },
    {
      type: 'objectives',
      title: 'Objectives',
      bullets: [objectiveOne, objectiveTwo, `Use feedback to improve ${lesson.studentArtifact}.`],
      minutes: 3,
      bloom: null,
      objective: objectiveOne,
      activity: null,
    },
    {
      type: 'bridge',
      title: `${sentenceCase(concept)} carries the evidence thread forward`,
      bullets: [
        previous
          ? `Last time: ${primarySlideConcept(previous)}`
          : `Last time: course goals and ${blueprint.courseName}`,
        `Today: ${phrase.decisionMove}`,
        next ? `Next: ${primarySlideConcept(next)}` : `Next: final synthesis and revision planning`,
      ],
      minutes: 4,
      bloom: 'Apply',
      objective: objectiveOne,
      activity: null,
    },
    {
      type: 'keyTerm',
      title: `What counts as ${concept}?`,
      bullets: [
        `${concept}: a decision tool for ${artifact}.`,
        `Evidence cue: ${phrase.evidenceMove}.`,
        `Decision cue: ${phrase.decisionMove}.`,
      ],
      minutes: 5,
      bloom: 'Understand',
      objective: objectiveOne,
      activity: null,
    },
    {
      type: 'content',
      title: `Evidence that can actually support ${artifact}`,
      bullets: [
        `${concept} focuses attention on evidence quality, not just topic coverage.`,
        `${secondary} helps students avoid unsupported claims in ${artifact}.`,
        successCriterion,
      ],
      minutes: 6,
      bloom: 'Analyze',
      objective: objectiveOne,
      activity: null,
    },
    {
      type: 'example',
      title: `${sentenceCase(concept)} in a ${lens.exampleNoun}`,
      bullets: [
        `Start with a short scenario from ${sourceCue}.`,
        `Identify the ${concept} evidence students can actually inspect in ${sourceCue}.`,
        `Key insight: the strongest answer explains why the evidence changes ${artifact}.`,
      ],
      minutes: 7,
      bloom: 'Analyze',
      objective: objectiveTwo,
      activity: null,
    },
    {
      type: 'activity',
      title: `Revise one evidence move for ${artifact}`,
      bullets: [
        `Pairs mark one strong and one weak ${concept} evidence move.`,
        `Each pair rewrites the weak move using ${concept}.`,
        `Debrief by naming the revision choice.`,
      ],
      minutes: 10,
      bloom: 'Apply',
      objective: objectiveOne,
      activity: 'Think-Pair-Share',
    },
    {
      type: 'content',
      title: `Use ${secondary} to keep claims honest`,
      bullets: [
        `${secondary} asks students to state limits.`,
        `Limit language protects the credibility of ${artifact}.`,
        `Feedback on ${artifact} should point to the ${secondary} evidence gap, not only grammar.`,
      ],
      minutes: 6,
      bloom: 'Evaluate',
      objective: objectiveTwo,
      activity: null,
    },
    {
      type: 'discussion',
      title: `Which evidence choice holds up?`,
      bullets: [
        `Compare two evidence choices for ${artifact}.`,
        `Vote on the stronger choice and explain why.`,
        `Capture one revision rule for future work.`,
      ],
      minutes: 8,
      bloom: 'Evaluate',
      objective: objectiveTwo,
      activity: 'Small Group Discussion',
    },
    {
      type: 'summary',
      title: `${sentenceCase(concept)} readiness check`,
      bullets: [
        `Can you now ${stripTerminalPunctuation(objectiveOne).toLowerCase()}?`,
        `Can you explain how ${concept} improves ${artifact}?`,
        `Can you name one ${artifact} feedback action before the next submission?`,
      ],
      minutes: 4,
      bloom: 'Evaluate',
      objective: objectiveOne,
      activity: null,
    },
    {
      type: 'closing',
      title: 'Carry Forward',
      bullets: [
        `Prepare or submit ${artifact}; timing is set by the instructor in the local LMS.`,
        next ? `Preview: ${primarySlideConcept(next)}.` : `Preview: portfolio synthesis and final reflection.`,
        `Use feedback from ${displayTitle} to strengthen the next artifact.`,
      ],
      minutes: 3,
      bloom: null,
      objective: null,
      activity: null,
    },
  ];

  return {
    id: lesson.id,
    lessonTitle: displayTitle,
    tags: unique(['slide deck', displayTitle, ...slideConceptCandidates(lesson), lens.domain], 8),
    sequenceGuide: {
      accessibilityStandards: `${displayTitle} should offer spoken, written, and visual entry points around ${phrase.context}; visuals include alt text, activity directions can be completed without color-only cues, and speaker notes identify how to support learners who need more processing time or text-first participation.`,
      cumulativeAssessmentMap: `${displayTitle} prepares students for ${sequenceArtifact}; the deck moves from ${phrase.evidenceMove} to ${stripTerminalPunctuation(phrase.decisionMove).toLowerCase()}, while practice slides reinforce ${sequenceCriterion} before feedback carries into the next artifact.`,
    },
    slides,
  };
}

export function buildSlideDeckIntermediateRepresentation(blueprint) {
  return {
    version: 1,
    source: 'course-blueprint-slide-ir',
    decks: blueprint.lessons.map((lesson, index) => buildSlideDeckIrForLesson(blueprint, lesson, index)),
  };
}

function compileSlideDecks(blueprint) {
  const ir = buildSlideDeckIntermediateRepresentation(blueprint);
  const lens = blueprintLens(blueprint);
  return {
    decks: ir.decks.map((deck) => {
      const lesson = blueprint.lessons.find((item) => item.id === deck.id) || blueprint.lessons[0];
      const slides = deck.slides.map((slide, index) => {
        const visual = slideVisual(lesson, slide.type, slide.title, index);
        return {
          title: slide.title,
          type: slide.type,
          bullets: slide.bullets,
          notes: slideNotes({
            lesson,
            title: slide.title,
            type: slide.type,
            bullets: slide.bullets,
            nextCue: deck.slides[index + 1]?.title,
            lens,
          }),
          visual,
          activityType: slide.activity,
          timer: `${slide.minutes} min`,
          bloomsLevel: slide.bloom,
          objectiveLink: slide.objective,
        };
      });
      return {
        lessonTitle: deck.lessonTitle,
        totalSlides: slides.length,
        learningObjectives: unique(slides.map((slide) => slide.objectiveLink).filter(Boolean), 5),
        slides,
        slideDeckSequenceGuide: deck.sequenceGuide,
        tags: deck.tags,
      };
    }),
  };
}

function compileCourseFaq(blueprint, config = {}) {
  const target = Math.max(3, Math.min(8, Number(config.questionsPerLesson) || 5));
  const lens = blueprintLens(blueprint);
  const builders = [
    (lesson) => ({
      q: `What should I focus on for ${lesson.title}?`,
      an: `Focus on ${lesson.keyConcepts.slice(0, 3).join(', ')}, then connect those ideas to ${lesson.studentArtifact}. Strong ${lesson.title} work uses ${lens.evidenceNoun} and explains a decision or implication.`,
      ca: 'Concept Explanation',
      rc: lesson.keyConcepts.slice(0, 4),
      df: 'Basic',
    }),
    (lesson) => ({
      q: `How does ${stripLessonPrefix(lesson.title)} connect to graded work?`,
      an: `${lesson.title} prepares you for ${lesson.studentArtifact}. Use the ${lesson.title} success criteria as a checklist before submitting or discussing your work.`,
      ca: 'Assignment Clarification',
      rc: lesson.successCriteria,
      df: 'Intermediate',
    }),
    (lesson) => ({
      q: `What does strong work on ${stripLessonPrefix(lesson.title)} look like?`,
      an: `Strong work on ${lesson.title} ${lesson.successCriteria.join(' ')} It should be specific enough that another reader can see how ${lesson.title} ${lens.evidenceNoun} supports the decision.`,
      ca: 'Assessment Prep',
      rc: lesson.successCriteria,
      df: 'Intermediate',
    }),
    (lesson) => ({
      q: `Where should I ask questions about ${stripLessonPrefix(lesson.title)}?`,
      an: `Use the official course communication channel, office hours, peer discussion spaces, and ${lesson.title} support resources. For ${lesson.title}, bring a specific concept, ${lens.evidenceNoun} point, or draft section when asking for help.`,
      ca: 'Course Logistics',
      rc: [`${lesson.title} support`, 'office hours', 'course communication'],
      df: 'Basic',
    }),
    (lesson) => ({
      q: `What common mistake should I avoid in ${stripLessonPrefix(lesson.title)}?`,
      an: `Do not stop at summary. For ${lesson.title}, explain how the concept works, what evidence supports it, and how it changes the artifact or decision.`,
      ca: 'Assessment Prep',
      rc: lesson.keyConcepts.slice(0, 4),
      df: 'Advanced',
    }),
    (lesson) => ({
      q: 'How should I use feedback from this lesson?',
      an: lesson.feedbackMoment,
      ca: 'Assignment Clarification',
      rc: ['feedback', 'revision', ...lesson.keyConcepts.slice(0, 2)],
      df: 'Intermediate',
    }),
    (lesson) => ({
      q: `What ${stripLessonPrefix(lesson.title)} materials should I review first?`,
      an: `Start with ${lesson.readings.slice(0, 2).join(' and ')}. Then compare your notes against the weekly success criteria.`,
      ca: 'Technical Help',
      rc: lesson.readings.slice(0, 3),
      df: 'Basic',
    }),
    (lesson) => ({
      q: `How can I check readiness for ${stripLessonPrefix(lesson.title)} before class or submission?`,
      an: `You are ready when you can define ${lesson.keyConcepts[0] || 'the main concept'}, cite lesson evidence, and explain one implication for ${lesson.studentArtifact}.`,
      ca: 'Assessment Prep',
      rc: lesson.keyConcepts.slice(0, 4),
      df: 'Intermediate',
    }),
  ];

  return {
    faqGuide: {
      purpose: 'Student-facing support FAQ compiled from the shared course blueprint.',
      reviewGuidance: 'Review local dates, platform names, and instructor-specific policy details before publishing.',
      categories: FAQ_CATEGORIES,
    },
    faqs: blueprint.lessons.map((lesson) => ({
      lt: lesson.title,
      tg: unique(['faq', lesson.title, ...lesson.keyConcepts], 10),
      qs: builders.slice(0, target).map((build) => build(lesson)),
    })),
  };
}

function buildLessonPlanDurations(sessionMinutes = 110) {
  const base = [10, 15, 20, 25, 25];
  const used = base.reduce((sum, value) => sum + value, 0);
  return [...base, Math.max(10, sessionMinutes - used)];
}

function formatDuration(minutes) {
  return `${minutes} minutes`;
}

function buildLessonPlanMaterials(lesson) {
  return unique(
    [
      ...lesson.readings,
      'Course site agenda and lesson handout',
      'Shared notes or collaboration document',
      'Submission template for the weekly artifact',
    ],
    6,
  );
}

function buildLessonPlanOutline(blueprint, lesson) {
  const lens = blueprintLens(blueprint);
  const phrase = lessonPhrase(blueprint, lesson);
  const [warmUp, context, guided, collaborative, independent, debrief] = buildLessonPlanDurations();
  const concept = lesson.keyConcepts[0] || stripLessonPrefix(lesson.title);
  const artifact = stripTerminalPunctuation(lesson.studentArtifact);

  return [
    {
      time: formatDuration(warmUp),
      activity: 'Warm-up retrieval and framing',
      type: 'Warm-up',
      description: `Students respond to a short prompt that asks them to ${phrase.decisionMove} using prior course evidence before the day’s lesson work begins.`,
      instructorNotes: `Collect two fast examples about ${concept}, name the evidence move worth imitating, and connect the prompt to ${lesson.outcomes[0]}.`,
      instructorRole: `Facilitate retrieval, surface misconceptions about ${concept}, and set the purpose for ${stripLessonPrefix(lesson.title)}.`,
      grouping: 'Whole class, then quick pair share',
      bloomsLevel: 'Apply',
    },
    {
      time: formatDuration(context),
      activity: 'Model the weekly concept',
      type: 'Mini-lesson',
      description: `Introduce ${concept} with a concise worked example that shows how ${lens.learnerRole}s ${phrase.evidenceMove}.`,
      instructorNotes: `Keep the model concrete and point to one line of reasoning students should reuse in ${artifact}.`,
      instructorRole: `Model thinking aloud and annotate the exemplar for ${concept}.`,
      grouping: 'Instructor model with guided notes',
      bloomsLevel: 'Understand',
    },
    {
      time: formatDuration(guided),
      activity: 'Guided analysis',
      type: 'Practice',
      description: `Students inspect a short ${lens.exampleNoun} and identify which evidence, assumptions, and constraints matter most for ${stripLessonPrefix(lesson.title)}.`,
      instructorNotes: `Prompt students to test one alternative interpretation of ${concept} so the room hears why some evidence is stronger than other evidence.`,
      instructorRole: `Coach evidence selection and press for specificity in ${artifact}.`,
      grouping: 'Pairs with instructor check-ins',
      bloomsLevel: 'Analyze',
    },
    {
      time: formatDuration(collaborative),
      activity: 'Collaborative application',
      type: 'Discussion',
      description: `Teams apply ${concept} to a new scenario, compare options, and explain the ${lens.decisionNoun} they would defend.`,
      instructorNotes: `Require each group to cite at least one reading, example, or class note about ${concept} before they report out.`,
      instructorRole: `Moderate the ${stripLessonPrefix(lesson.title)} tradeoff discussion and calibrate the quality criteria for ${artifact}.`,
      grouping: 'Small groups then share-out',
      bloomsLevel: 'Evaluate',
    },
    {
      time: formatDuration(independent),
      activity: 'Independent artifact sprint',
      type: 'Workshop',
      description: `Students draft ${artifact} while using the lesson success criteria, feedback prompts, and exemplar moves as a checklist.`,
      instructorNotes: `Conference with students who need support on ${artifact} and redirect them to the exact ${concept} criterion they have not yet met.`,
      instructorRole: `Provide targeted feedback on ${artifact} and confirm readiness for submission.`,
      grouping: 'Independent work with spot coaching',
      bloomsLevel: lesson.bloomsLevel,
    },
    {
      time: formatDuration(debrief),
      activity: 'Debrief and exit ticket',
      type: 'Closure',
      description: `Students share one revision they made to ${artifact}, one question they still have about ${concept}, and one way today’s work prepares them for the next artifact.`,
      instructorNotes: `Use exit-ticket responses to decide whether the next lesson should review ${concept} before extending it.`,
      instructorRole: `Synthesize patterns from ${stripLessonPrefix(lesson.title)} and set up the next lesson.`,
      grouping: 'Whole class plus individual exit ticket',
      bloomsLevel: 'Evaluate',
    },
  ];
}

function compileLessonPlans(blueprint) {
  const lens = blueprintLens(blueprint);
  return {
    lessonPlans: blueprint.lessons.map((lesson, index) => {
      const phrase = lessonPhrase(blueprint, lesson);
      const artifact = stripTerminalPunctuation(lesson.studentArtifact);
      const concept = lesson.keyConcepts[0] || stripLessonPrefix(lesson.title);
      const materials = buildLessonPlanMaterials(lesson);

      return {
        lessonTitle: lesson.title,
        weekNumber: `Week ${lesson.lessonNumber}`,
        duration: '110 minutes',
        studentFacingSummary: {
          beforeClass: `Review ${materials[0]} and arrive ready to ${phrase.evidenceMove}.`,
          duringClass: `Use class discussion and practice time to ${phrase.decisionMove} with peers before drafting your own response.`,
          afterClass: `Revise your work using the feedback notes and submit the final ${artifact}.`,
          submittedArtifact: artifact,
        },
        artifactLength: `One focused ${stripLessonPrefix(lesson.title)} artifact, usually 350-500 words or an equivalent applied format that demonstrates ${concept}.`,
        prerequisiteKnowledge: `Students should know the core terms from earlier course materials and be ready to connect them to ${stripLessonPrefix(lesson.title)}.`,
        commonMisconceptions: [
          `Treating ${concept} as summary work instead of a decision-making process.`,
          `Listing evidence without explaining why it matters for ${artifact}.`,
          `Using generic claims instead of course-specific examples or criteria for ${concept}.`,
        ],
        weeklySubmissionCriteria: `Submit ${artifact} with concrete evidence, a clear claim or recommendation, and one explicit revision move based on feedback.`,
        localCaseReplacementNote: `If the named case for ${stripLessonPrefix(lesson.title)} is not locally relevant, replace it with a comparable ${lens.exampleNoun} that still requires students to use evidence about ${concept} and defend the same decision moves.`,
        assessmentCriteria: lesson.successCriteria,
        calibrationCue: `Before collecting work, compare two sample responses and name what makes the stronger ${artifact} more defensible.`,
        bloomsLevels: unique(['Understand', 'Analyze', lesson.bloomsLevel, 'Evaluate'], 4),
        objectives: lesson.outcomes,
        materials,
        warmUp: {
          duration: '10 minutes',
          type: 'Retrieval and framing',
          prompt: `What evidence best helps you ${stripTerminalPunctuation(phrase.decisionMove)}?`,
          purpose: `Activate prior knowledge and focus students on the central ${concept} decision.`,
          facilitation: `Ask for one fast example, then name the quality cue students should carry into ${artifact}.`,
        },
        outline: buildLessonPlanOutline(blueprint, lesson),
        formativeCheck: {
          type: 'Exit ticket',
          prompt: `State one claim from ${stripLessonPrefix(lesson.title)} and cite the evidence that makes it credible.`,
          objectiveAligned: lesson.outcomes[0],
          instructorAction:
            `Sort ${stripLessonPrefix(lesson.title)} responses into ready, partial, and needs-support groups so the next lesson can reopen misconceptions before new content begins. ` +
            `Success criteria for ${stripLessonPrefix(lesson.title)}: accurate concept use, specific evidence, and clear reasoning with one concrete example.`,
        },
        udlNotes: {
          representation: `Provide the concept model in text, spoken explanation, and one visual organizer tied to ${concept}.`,
          engagement: `Offer a choice between speaking, annotating, or drafting in writing during the ${stripLessonPrefix(lesson.title)} collaborative application task.`,
          expression: `Allow students to show ${artifact} progress through a memo, slide, table, or annotated outline when the same criteria are met.`,
        },
        homework: {
          title: artifact,
          description: `Complete ${artifact}, use the lesson criteria as a checklist, and add one note explaining how feedback changed your draft.`,
          estimatedTime: '45-60 minutes',
          connectionToNext: `Bring your submitted work forward so the next lesson can build on today’s ${concept} reasoning.`,
        },
        closingActivity: `Close by having students name one strong evidence move from today and one revision they still need before ${artifact} is fully ready.`,
        tags: unique(['lesson-plan', lesson.title, concept, lens.domain, ...lesson.keyConcepts], 10),
        readyToTeachSupport: {
          workedExample: `Show a brief exemplar for ${artifact} and annotate where the evidence, reasoning, and revision move appear.`,
          methodSpecificMiniRubric: `Score ${artifact} for concept accuracy, evidence quality, reasoning strength, and feedback-informed revision.`,
          studentHandout: `One-page guide with the lesson objective, success criteria, outline, and submission checklist for ${stripLessonPrefix(lesson.title)}.`,
          instructorPrep: `Prepare the exemplar, one misconception check, and one targeted feedback prompt before teaching ${stripLessonPrefix(lesson.title)}.`,
          accessibilityAndUDL: `Keep the ${stripLessonPrefix(lesson.title)} directions chunked, provide plain-language criteria, and let students choose an equivalent response format that still demonstrates ${concept}.`,
        },
      };
    }),
  };
}

export function compileBlueprintDeliverable(featureId, blueprint, options = {}) {
  if (featureId?.startsWith('custom_')) {
    const templateKind = getCompiledCustomTemplateKind(featureId, options);
    if (templateKind === 'reflection-check-in') {
      return compileCustomReflectionDeliverable(featureId, blueprint, options);
    }
    if (templateKind === 'reading-response') {
      return compileCustomReadingResponseDeliverable(featureId, blueprint, options);
    }
    return null;
  }
  switch (featureId) {
    case 'syllabus':
      return compileSyllabus(blueprint, options);
    case 'lessonPlans':
      return compileLessonPlans(blueprint, options);
    case 'slideDecks':
      return compileSlideDecks(blueprint, options.configMap?.slideDecks || {});
    case 'assignments':
      return compileAssignments(blueprint, options);
    case 'rubrics':
      return compileRubrics(blueprint, options);
    case 'discussions':
      return compileDiscussions(blueprint, options);
    case 'quizBank':
      return compileQuizBank(blueprint, options.configMap?.quizBank || {});
    case 'studyGuides':
      return compileStudyGuides(blueprint, options);
    case 'courseFaq':
      return compileCourseFaq(blueprint, options.configMap?.courseFaq || {});
    default:
      return null;
  }
}

export function compileBlueprintDeliverables(blueprint, featureIds = [], options = {}) {
  const result = {};
  for (const featureId of getBlueprintCompiledFeatures(featureIds, options)) {
    const data = compileBlueprintDeliverable(featureId, blueprint, options);
    if (data) result[featureId] = data;
  }
  return result;
}
