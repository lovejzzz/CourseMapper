import { extractBriefQualityContract } from './briefQualityContract.js';
import { extractOrderedLessonContract } from './explicitLessonSequence.js';
import { extractChapterScheduleTopics, planSessionTopics } from './algiComposer.js';
import { operationEvidenceDemandForLesson } from './operationEvidenceContract.js';
import {
  createStatisticalArtifactDetailsForOperation,
  createStatisticalInstructionalIntentForOperation,
} from './statisticalOperationArtifactDetails.js';

const statisticalArtifactDetailsForOperation = createStatisticalArtifactDetailsForOperation({
  operationEvidenceDemandForLesson,
});
const statisticalInstructionalIntentForOperation = createStatisticalInstructionalIntentForOperation({
  operationEvidenceDemandForLesson,
});

function cleanText(value, max = 240) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function displayTopic(value) {
  const topic = cleanText(value, 160);
  if (!topic) return '';
  return `${topic.charAt(0).toUpperCase()}${topic.slice(1)}`;
}

function topicWithDefiniteArticle(value) {
  const topic = cleanText(value, 160);
  if (!topic) return 'the lesson focus';
  if (/^the\b/i.test(topic)) return topic.replace(/^The\b/, 'the');
  if (/^(?:a|an)\b/i.test(topic)) return topic.replace(/^(A|An)\b/, (article) => article.toLowerCase());
  return `the ${topic}`;
}

const REQUESTED_PREFIX_COUNT_WORDS = new Map(
  [
    'one',
    'two',
    'three',
    'four',
    'five',
    'six',
    'seven',
    'eight',
    'nine',
    'ten',
    'eleven',
    'twelve',
    'thirteen',
    'fourteen',
    'fifteen',
    'sixteen',
    'seventeen',
    'eighteen',
    'nineteen',
    'twenty',
  ].map((word, index) => [word, index + 1]),
);

function requestedContinuousSourcePrefixCount(sourceBrief = '') {
  const match = String(sourceBrief || '').match(
    /\bfirst\s+(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|\d{1,2})\s+(?:continuous\s+|consecutive\s+|ordered\s+)?(?:instructional\s+|teaching\s+|course\s+)?(?:topic\s+)?(?:units?|topics?|chapters?|lessons?|sessions?|modules?)\b/i,
  );
  if (!match) return null;
  const token = match[1].toLowerCase();
  const count = /^\d+$/.test(token) ? Number(token) : REQUESTED_PREFIX_COUNT_WORDS.get(token);
  return Number.isInteger(count) && count >= 2 && count <= 52 ? count : null;
}

/**
 * Recover an instructor-requested prefix of an explicit governing schedule.
 * This is intentionally narrower than generic topic inference: both a
 * "first N" boundary and a source-authored chapter sequence must be present.
 * The model never gets authority to skip an intervening scheduled unit.
 */
export function extractRequestedSourceScheduleContract(sourceBrief = '', expectedCount = null) {
  const requestedCount = requestedContinuousSourcePrefixCount(sourceBrief);
  if (!requestedCount || (Number.isInteger(expectedCount) && requestedCount !== expectedCount)) return null;
  const scheduledTopics = extractChapterScheduleTopics(sourceBrief);
  if (scheduledTopics.length < requestedCount) return null;
  return {
    mode: 'governing-source-schedule-prefix',
    declaredCount: requestedCount,
    availableSourceTopicCount: scheduledTopics.length,
    topics: scheduledTopics.slice(0, requestedCount),
    continuity: 'source-prefix-without-omissions',
  };
}

export function isGenericInstructionalPlanTopic(value) {
  const topic = cleanText(value, 180)
    .replace(/^lesson\s+\d{1,3}\s*[:.\-–—]?\s*/i, '')
    .replace(/^\d+(?:\.\d+)*\s*[:.\-–—]?\s*/i, '')
    .trim();
  return (
    !topic ||
    /^(?:(?:session|lesson|topic|week|module|unit)\s*\d{0,3}(?:\s+topic)?|topic\s+(?:session|lesson|week|module|unit)?\s*\d{0,3})$/i.test(
      topic,
    )
  );
}

export function assessInstructionalPlanIdentity(courseMap = {}) {
  const lessons = Array.isArray(courseMap?.lessons) ? courseMap.lessons : [];
  if (lessons.length === 0) {
    return { status: 'blocked', weakLessonNumbers: [], distinctIdentityCount: 0, lessonCount: 0 };
  }
  const identities = lessons.map((lesson) =>
    cleanText(lesson?.title, 180)
      .replace(/^lesson\s+\d{1,3}\s*[:.\-–—]?\s*/i, '')
      .toLowerCase(),
  );
  const weakLessonNumbers = lessons
    .map((lesson, index) => {
      const identityFields = [
        lesson?.title,
        ...(Array.isArray(lesson?.sections)
          ? lesson.sections.map((section) => section?.topicSection || section?.topic)
          : []),
      ].filter(Boolean);
      return identityFields.length === 0 || identityFields.every(isGenericInstructionalPlanTopic) ? index + 1 : null;
    })
    .filter(Boolean);
  const distinctIdentityCount = new Set(identities.filter(Boolean)).size;
  const minimumDistinct = lessons.length;
  const lensSuffixRe = /:\s*(?:in practice|evidence and methods|comparisons|limitations|applications)\s*$/i;
  const baseIdentities = identities.map((identity) => identity.replace(lensSuffixRe, '').trim());
  const operationSignatures = lessons.map(
    (lesson) =>
      [
        ...(Array.isArray(lesson?.sections) ? lesson.sections : []).flatMap((section) => [
          section?.learningObjectives,
          section?.asyncActivities,
          section?.syncActivities,
          section?.weeklyAssessments,
        ]),
      ]
        .map((value) => cleanText(value, 400))
        .join(' ')
        .toLowerCase()
        .match(
          /\b(?:analy[sz]e|annotate|apply|audit|build|calculate|classify|compare|construct|derive|evaluate|interpret|model|perform|produce|qualify|revise|test|trace)\b/g,
        )
        ?.join('|') || '',
  );
  const duplicateOperationLessonNumbers = [];
  for (const baseIdentity of new Set(baseIdentities)) {
    const indices = baseIdentities
      .map((identity, index) => (identity === baseIdentity ? index : null))
      .filter((index) => index !== null);
    if (indices.length < 2) continue;
    const signatures = new Set(indices.map((index) => operationSignatures[index]).filter(Boolean));
    if (signatures.size < indices.length) duplicateOperationLessonNumbers.push(...indices.map((index) => index + 1));
  }
  return {
    status:
      weakLessonNumbers.length === 0 &&
      distinctIdentityCount >= minimumDistinct &&
      duplicateOperationLessonNumbers.length === 0
        ? 'approved'
        : 'blocked',
    weakLessonNumbers,
    duplicateOperationLessonNumbers: [...new Set(duplicateOperationLessonNumbers)],
    distinctIdentityCount,
    minimumDistinct,
    lessonCount: lessons.length,
  };
}

function visualEvidenceObjectives(topic, lessonNumber) {
  const article = /^[aeiou]/i.test(cleanText(topic)) ? 'an' : 'a';
  const objectiveSets = [
    `Distinguish observable features from inference in ${topic}.\nCite the deciding visual detail.\nName what the visible evidence cannot establish.`,
    `Separate observable ${topic} evidence from inference.\nPoint to the visual feature that decides between readings.\nIdentify a plausible alternative the observed features cannot rule out.`,
    `Classify a ${topic} statement as observation or inference.\nCite the exact mark or relation supporting the conclusion.\nExplain which missing observation would weaken it.`,
    `Trace a ${topic} interpretation back to observable evidence.\nIdentify the decisive framing or feature.\nQualify the inference by naming an excluded view or condition.`,
    `Audit ${article} ${topic} claim by separating what is visible from what is inferred.\nReference the visual detail that warrants it.\nState the boundary beyond which the evidence does not support the claim.`,
  ];
  return objectiveSets[(Math.max(1, Number(lessonNumber) || 1) - 1) % objectiveSets.length];
}

function exactPlanSection(topic, lessonNumber, briefQualityContract) {
  const visual = briefQualityContract?.functionalVisual?.required === true;
  if (visual) {
    return {
      topicSection: `${lessonNumber}.1: ${topic}`,
      learningGoals: `Analyze concrete visual evidence about ${topic} and justify one bounded interpretation.`,
      learningObjectives: visualEvidenceObjectives(topic, lessonNumber),
      weeklyAssessments: `Evidence-based visual annotation or comparison: ${topic}`,
      asyncActivities: `Analyze one concrete visual for ${topic}; annotate the exact visible evidence for one claim and one limitation.`,
      syncActivities: `Compare two concrete visuals through ${topic}; defend the stronger interpretation with observable evidence.`,
      technologyNeeded: 'Course site, accessible visual materials, and a response workspace.',
      presentationFormat: 'Brief instructor framing, guided visual analysis, and student synthesis.',
      supportingResources: `Lesson-specific visual specimen and attribution record for ${topic}; asset admission required before drafting.`,
      evaluateDesign: `Check that ${topicWithDefiniteArticle(topic)} visual, activity, and assessment use the same visible evidence and require an annotation or comparison.`,
    };
  }
  const statisticalLesson = {
    title: `Lesson ${lessonNumber}: ${topic}`,
    sections: [{ topicSection: `${lessonNumber}.1: ${topic}` }],
  };
  const statisticalIntent = statisticalInstructionalIntentForOperation(statisticalLesson);
  if (statisticalIntent) {
    const details = statisticalArtifactDetailsForOperation(statisticalLesson);
    return {
      topicSection: `${lessonNumber}.1: ${topic}`,
      learningGoals: statisticalIntent.objective,
      learningObjectives: statisticalIntent.objective,
      weeklyAssessments: `${displayTopic(topic)}: ${details.primaryOutputFormat}.`,
      asyncActivities: `${statisticalIntent.learnerAction} Preserve the supplied inputs and a replayable calculation or design trace.`,
      syncActivities: `Recompute or audit a peer's ${topic} procedure, resolve one discrepant step from the shared inputs, and defend an interpretation no broader than the evidence.`,
      technologyNeeded: 'Course site, accessible supplied data, and a calculation or design workspace.',
      presentationFormat: 'Brief worked model, guided procedure audit, and evidence-bounded interpretation.',
      supportingResources: `Admitted ${topic} source record and verified CourseMapper operation specimen.`,
      evaluateDesign: `Verify ${topicWithDefiniteArticle(topic)} inputs, procedure, answer key, interpretation, and stated boundary against this operation: ${details.reviewProtocol}.`,
    };
  }
  const lensMatch = cleanText(topic).match(
    /^(.*?):\s*(in practice|evidence and methods|comparisons|limitations|applications)$/i,
  );
  if (lensMatch) {
    const baseTopic = cleanText(lensMatch[1]);
    const lens = lensMatch[2].toLowerCase();
    const variants = {
      'in practice': {
        goals: `Perform and revise one evidence-bounded use of ${baseTopic}.`,
        objectives: `Perform one ${baseTopic} analysis; test it against observable evidence; revise one unsupported step.`,
        assessment: `Practice-and-revision record: ${baseTopic}`,
        async: `Perform one bounded ${baseTopic} task, mark the evidence used at each step, and revise one weak decision.`,
        sync: `Compare initial and revised ${baseTopic} work; justify which revision made the evidence more inspectable.`,
      },
      'evidence and methods': {
        goals: `Compare methods for producing and checking evidence about ${baseTopic}.`,
        objectives: `Compare two methods for ${baseTopic}; audit their evidence requirements; justify which method fits one bounded case.`,
        assessment: `Method comparison: ${baseTopic}`,
        async: `Build a two-method comparison for ${baseTopic}; identify the evidence each method requires and one limitation.`,
        sync: `Audit two ${baseTopic} methods against the same record; defend the method with the stronger evidence fit.`,
      },
      comparisons: {
        goals: `Classify and compare contrasting cases of ${baseTopic}.`,
        objectives: `Classify two ${baseTopic} cases; compare the deciding evidence; explain one boundary on the comparison.`,
        assessment: `Case comparison: ${baseTopic}`,
        async: `Classify two ${baseTopic} cases and annotate the evidence that separates them.`,
        sync: `Compare classifications for ${baseTopic}; resolve one disagreement by tracing it to observable evidence.`,
      },
      limitations: {
        goals: `Evaluate the limits of evidence-based claims about ${baseTopic}.`,
        objectives: `Evaluate one ${baseTopic} claim; trace its evidence boundary; qualify the conclusion where support ends.`,
        assessment: `Limitation audit: ${baseTopic}`,
        async: `Audit one ${baseTopic} claim, mark the supported and unsupported parts, and write a qualified revision.`,
        sync: `Evaluate competing ${baseTopic} claims; defend the conclusion that stays closest to the available evidence.`,
      },
      applications: {
        goals: `Apply ${baseTopic} to a new bounded case and justify the transfer.`,
        objectives: `Apply ${baseTopic} to one new case; produce inspectable evidence; justify one transfer limitation.`,
        assessment: `Transfer application: ${baseTopic}`,
        async: `Apply ${baseTopic} to a new case, produce an evidence record, and name one condition that limits transfer.`,
        sync: `Compare two applications of ${baseTopic}; justify which transfer is better supported and why.`,
      },
    };
    const variant = variants[lens];
    return {
      topicSection: `${lessonNumber}.1: ${topic}`,
      learningGoals: variant.goals,
      learningObjectives: variant.objectives,
      weeklyAssessments: variant.assessment,
      asyncActivities: variant.async,
      syncActivities: variant.sync,
      technologyNeeded: 'Course site, accessible source materials, and a response workspace.',
      presentationFormat: 'Brief instructor model, guided evidence work, and learner revision.',
      supportingResources: `Admitted source packet for ${baseTopic}.`,
      evaluateDesign: `Verify that the ${baseTopic} method, task, evidence, and scoring criteria enact the ${lens} operation rather than repeating another lesson.`,
    };
  }
  return {
    topicSection: `${lessonNumber}.1: ${topic}`,
    learningGoals: `Use evidence to explain and analyze ${topic}.`,
    learningObjectives: `Analyze ${topic} using observable evidence.\nDistinguish evidence from inference.\nState one bounded conclusion.`,
    weeklyAssessments: `Evidence-based analysis: ${topic}`,
    asyncActivities: `Annotate the exact evidence supporting one ${topic} claim and identify one limitation.`,
    syncActivities: `Compare two interpretations or applications of ${topic}; defend the stronger conclusion with observable evidence.`,
    technologyNeeded: 'Course site, accessible source materials, and a response workspace.',
    presentationFormat: 'Brief instructor framing, guided evidence analysis, and student synthesis.',
    supportingResources: `Admitted source packet for ${topic}.`,
    evaluateDesign: `Check that the ${topic} source, activity, and assessment use the same observable evidence and require one bounded conclusion.`,
  };
}

/**
 * Turn an exact user-authored lesson sequence into the instructional plan that
 * research and drafting consume. The former pipeline extracted this contract
 * only at export time, after a model-compressed or invented lesson had already
 * steered evidence acquisition. Applying it here makes the brief authoritative
 * before any deliverable prose exists.
 */
export function enforceInstructionalPlanContract(courseMap = {}, sourceBrief = '') {
  const lessons = Array.isArray(courseMap?.lessons) ? courseMap.lessons : [];
  const orderedLessonContract =
    extractOrderedLessonContract(sourceBrief, {
      expectedCount: lessons.length || null,
    }) || extractRequestedSourceScheduleContract(sourceBrief, lessons.length || null);
  if (!orderedLessonContract || orderedLessonContract.topics.length !== lessons.length) {
    const semanticIdentity = assessInstructionalPlanIdentity(courseMap);
    if (semanticIdentity.status === 'approved') {
      return {
        courseMap,
        changed: false,
        receipt: null,
      };
    }

    const recoveredTopics = planSessionTopics(sourceBrief, lessons.length);
    const briefQualityContract = extractBriefQualityContract(sourceBrief, { lessonCount: lessons.length });
    const recoveredLessons = recoveredTopics.map((rawTopic, index) => {
      const topic = displayTopic(rawTopic);
      return {
        ...(lessons[index] || {}),
        title: `Lesson ${index + 1}: ${topic}`,
        sections: [exactPlanSection(topic, index + 1, briefQualityContract)],
      };
    });
    const recoveredIdentity = assessInstructionalPlanIdentity({ lessons: recoveredLessons });
    if (
      recoveredTopics.length !== lessons.length ||
      recoveredTopics.some(isGenericInstructionalPlanTopic) ||
      recoveredIdentity.status !== 'approved'
    ) {
      return {
        courseMap,
        changed: false,
        receipt: {
          protocol: 'coursemapper-instructional-plan-contract-v2',
          status: 'plan-blocked',
          appliedBeforeEvidenceAcquisition: true,
          appliedBeforeDeliverableDrafting: true,
          lessonCount: lessons.length,
          semanticIdentity,
          blocker: 'source-could-not-authorize-distinct-lesson-identities',
          claimBoundary:
            'The source and generated skeleton did not establish a distinct teachable identity for every lesson, so evidence acquisition and drafting remain unauthorized.',
        },
      };
    }

    const receipt = {
      protocol: 'coursemapper-instructional-plan-contract-v2',
      status: 'plan-authorized',
      appliedBeforeEvidenceAcquisition: true,
      appliedBeforeDeliverableDrafting: true,
      source: 'source-derived-semantic-recovery',
      recoveryMode: 'generic-plan-replaced-before-research',
      lessonCount: recoveredLessons.length,
      replacedSemanticIdentity: semanticIdentity,
      authorizedSemanticIdentity: recoveredIdentity,
      recoveredTopics,
      ...(briefQualityContract ? { briefQualityContract } : {}),
      claimBoundary:
        'This receipt proves that generic lesson identities were replaced from source-bounded coverage or schedule evidence before research; source relevance and artifact quality remain independently auditable.',
    };
    const nextCourseMap = {
      ...courseMap,
      instructionalPlanContract: receipt,
      lessons: recoveredLessons,
    };
    return {
      courseMap: nextCourseMap,
      changed: JSON.stringify(courseMap) !== JSON.stringify(nextCourseMap),
      receipt,
    };
  }

  const briefQualityContract = extractBriefQualityContract(sourceBrief, { lessonCount: lessons.length });
  const contractedLessons = orderedLessonContract.topics.map((rawTopic, index) => {
    const topic = displayTopic(rawTopic);
    return {
      ...(lessons[index] || {}),
      title: `Lesson ${index + 1}: ${topic}`,
      sections: [exactPlanSection(topic, index + 1, briefQualityContract)],
    };
  });
  const receipt = {
    protocol: 'coursemapper-instructional-plan-contract-v1',
    status: 'plan-authorized',
    appliedBeforeEvidenceAcquisition: true,
    appliedBeforeDeliverableDrafting: true,
    source:
      orderedLessonContract.mode === 'governing-source-schedule-prefix'
        ? 'governing-source-schedule-prefix'
        : 'user-authored-ordered-lesson-contract',
    orderedLessonContract,
    ...(briefQualityContract ? { briefQualityContract } : {}),
    lessonCount: contractedLessons.length,
    claimBoundary:
      orderedLessonContract.mode === 'governing-source-schedule-prefix'
        ? 'This receipt proves that the pre-draft plan follows the requested continuous prefix of the governing source schedule without omissions; evidence relevance and artifact quality remain independently auditable.'
        : 'This receipt proves that the pre-draft plan follows the exact source-authored lesson contract; evidence relevance and artifact quality remain independently auditable.',
  };
  const nextCourseMap = {
    ...courseMap,
    orderedLessonContract,
    instructionalPlanContract: receipt,
    lessons: contractedLessons,
  };
  return {
    courseMap: nextCourseMap,
    changed: JSON.stringify(courseMap) !== JSON.stringify(nextCourseMap),
    receipt,
  };
}
