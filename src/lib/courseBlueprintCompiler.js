import { COLUMN_EXTRACTORS } from './prompts/promptUtils';
import { getChunkCount } from './parallelGenerator';

export const BLUEPRINT_COMPILED_FEATURES = new Set(['syllabus', 'rubrics', 'assignments', 'studyGuides', 'courseFaq']);

const BLOOMS_LEVELS = ['Apply', 'Analyze', 'Evaluate', 'Create'];
const FAQ_CATEGORIES = [
  'Course Logistics',
  'Assignment Clarification',
  'Concept Explanation',
  'Technical Help',
  'Assessment Prep',
];

function asArray(value) {
  return Array.isArray(value) ? value : value === undefined || value === null || value === '' ? [] : [value];
}

function cleanText(value, fallback = '') {
  return String(value ?? fallback)
    .replace(/\s+/g, ' ')
    .trim();
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

function objectiveForLesson(title, concepts) {
  const concept = concepts[0] || stripLessonPrefix(title) || 'the weekly topic';
  return `Analyze ${concept} using course evidence and explain how it informs an instructional or professional decision.`;
}

function successCriteriaForLesson(title, concepts) {
  const concept = concepts[0] || stripLessonPrefix(title) || 'the topic';
  return [
    `Names the relevant ${concept} concept accurately.`,
    'Uses specific evidence from the lesson materials or activity.',
    'Explains a decision, implication, or next step instead of only summarizing.',
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
  const objectives = unique(
    splitList(extractColumn(lesson, 'learningObjectives')).concat(splitList(extractColumn(lesson, 'learningGoals'))),
    5,
  );
  const topics = unique(
    splitList(extractColumn(lesson, 'topicSection')).concat(splitList(extractColumn(lesson, 'learningGoals'))),
    8,
  );
  const resources = unique(splitList(extractColumn(lesson, 'supportingResources')), 6);
  const asyncActivities = splitList(extractColumn(lesson, 'asyncActivities'));
  const syncActivities = splitList(extractColumn(lesson, 'syncActivities'));
  const assessmentText = firstNonEmpty(
    extractColumn(lesson, 'weeklyAssessments'),
    extractColumn(lesson, 'evaluateDesign'),
  );
  const concepts = unique([...topics, ...wordsFromConcepts([...topics, ...objectives, title], 5)], 8);
  const outcomes = objectives.length > 0 ? objectives : [objectiveForLesson(title, concepts)];
  const assessmentLink = hasMeaningfulAssessment(assessmentText)
    ? assessmentText
    : `Applied lesson evidence check for ${stripLessonPrefix(title)}`;

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
    studentArtifact: hasMeaningfulAssessment(assessmentText)
      ? assessmentText
      : `${stripLessonPrefix(title)} applied reflection`,
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

function buildAssessmentAnchors(lessons) {
  const assessed = lessons.filter((lesson) => lesson.hasAssessment);
  const source = assessed.length > 0 ? assessed : lessons;
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
    criteria: [
      'Concept accuracy and evidence use',
      'Analysis and decision logic',
      'Professional communication and organization',
      'Revision use and learner reflection',
    ],
    successCriteria: lesson.successCriteria,
    feedbackUse: lesson.feedbackMoment,
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

  return {
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
}

export function isBlueprintCompiledFeature(featureId) {
  return BLUEPRINT_COMPILED_FEATURES.has(featureId);
}

export function getBlueprintCompiledFeatures(featureIds = [], options = {}) {
  if (options.enabled === false) return [];
  return [...new Set(featureIds)].filter((featureId) => BLUEPRINT_COMPILED_FEATURES.has(featureId));
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
      expectedSubmissionFormat:
        'Submit through the official course site using the format named in the weekly instructions.',
      highValueSuccessCriteria: assessment.successCriteria,
      instructorFeedbackPriority: assessment.feedbackUse,
      performanceBands: {
        excellent: 'Specific evidence, clear analysis, polished communication, and explicit revision use.',
        proficient: 'Accurate evidence and understandable analysis with minor gaps in depth or polish.',
        revisionNeeded: 'Limited evidence, unclear reasoning, or missing connection to course criteria.',
      },
      overview: `${assessment.artifact} asks students to turn lesson concepts into a concrete course artifact. The task is designed to show how students use evidence, make decisions, and prepare for later work.`,
      objectives: assessment.objectives,
      instructions: [
        `Review the materials for ${assessment.relatedLessons.join(', ')} and identify the central problem or decision.`,
        'Select specific evidence from course readings, activities, or discussion notes.',
        'Draft the artifact so each section addresses one rubric criterion.',
        'Use feedback or self-review to revise the final submission before posting it.',
      ],
      formatRequirements: {
        length: 'Enough detail to address every criterion; follow instructor length guidance when provided.',
        format: 'Organized document, slide, or course-site post with headings matching the rubric criteria.',
        citationStyle: 'Use the citation style specified in the course or assignment prompt.',
        submissionPlatform: 'Official course site',
        latePolicy: 'Follow the course late work policy and contact the instructor before the deadline when needed.',
      },
      deliverables: [
        'Completed artifact with clear headings.',
        'Evidence or citation notes tied to course materials.',
        'Brief reflection naming one revision decision.',
      ],
      scaffoldingMilestones: [
        {
          milestone: 'Evidence checkpoint',
          dueDate: `Before Week ${assessment.lessonNumbers[0]} submission`,
          description: 'Identify the concept, evidence, and decision the artifact will address.',
          feedback: 'Use instructor, peer, or self-review feedback to focus the artifact.',
          points: 10,
          uploadChecklist: ['Concept named', 'Evidence selected', 'criterion checked'],
        },
        {
          milestone: 'Final submission',
          dueDate: `Week ${assessment.lessonNumbers[0]}`,
          description: 'Submit the complete artifact with all rubric criteria addressed.',
          feedback: assessment.feedbackUse,
          points: 90,
          uploadChecklist: ['Artifact complete', 'criteria addressed', 'reflection included'],
        },
      ],
      gradingCriteria: assessment.criteria,
      supportResources: [
        'Course notes and assigned readings',
        'Rubric criteria for this artifact',
        'Office hours or course communication channel',
      ],
      progressTracking: 'Use the milestone checklist and rubric criteria to monitor readiness before submission.',
      academicIntegrityStatement: blueprint.policies.academicIntegrity,
      accessibilityAndUDL:
        'Use accessible document structure, descriptive headings, readable contrast, and captions or alt text for media.',
      selfAssessmentRubric: assessment.criteria.map((criterion) => `Before submitting, confirm: ${criterion}.`),
      feedbackLoop: assessment.feedbackUse,
      tags: unique(['assignment', assessment.title, ...assessment.relatedLessons, ...assessment.criteria], 10),
    })),
  };
}

function compileRubrics(blueprint) {
  return {
    rubrics: blueprint.assessments.map((assessment) => {
      const criteria = assessment.criteria.map((criterion, index) => {
        const weight = index === assessment.criteria.length - 1 ? 25 : 25;
        return {
          criterion,
          objectiveAligned: assessment.objectives[index % assessment.objectives.length],
          weight,
          points: Math.round((weight / 100) * assessment.points),
          exemplary: `Exceeds expectations by applying course evidence precisely, explaining decisions clearly, and connecting the work to ${assessment.relatedLessons.join(', ')}.`,
          proficient:
            'Meets expectations with accurate evidence, clear organization, and a complete response to the criterion.',
          developing:
            'Partially meets expectations but needs stronger evidence, clearer reasoning, or more complete communication.',
          beginning:
            'Shows limited evidence of the criterion and needs substantial revision before it is ready for assessment.',
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
        instructorFacilitationNote:
          'Share the rubric before students draft, then use criterion-level feedback for revision guidance.',
        accessibilityAndUDL:
          'Allow equivalent accessible formats when the artifact demonstrates the same evidence, reasoning, and communication criteria.',
        anchorExamples: {
          exemplary: 'Names relevant course evidence, explains the decision, and reflects on revision use.',
          proficient: 'Uses relevant evidence and answers the prompt with clear organization.',
          developing: 'Mentions course ideas but needs clearer evidence or stronger decision logic.',
          beginning: 'Provides general description with little evidence or criterion alignment.',
        },
        gradePolicyConnection: `${assessment.weight} of the course grade when the syllabus weighting is used.`,
        teacherNotes: assessment.feedbackUse,
        tags: unique(['rubric', assessment.title, ...assessment.relatedLessons, ...assessment.criteria], 10),
      };
    }),
  };
}

function compileStudyGuides(blueprint) {
  return {
    studyGuides: blueprint.lessons.map((lesson) => ({
      lessonTitle: lesson.title,
      examScope: `Use this guide to prepare for Week ${lesson.lessonNumber} checks and later assessments.`,
      summary: `${lesson.title} focuses on ${lesson.keyConcepts.slice(0, 3).join(', ')}. Students should connect those ideas to the weekly activity pattern, use evidence from course materials, and explain how the concept affects a decision or artifact.`,
      keyTerms: lesson.keyConcepts.slice(0, 8).map((term) => ({
        term,
        definition: `${term} as used in ${lesson.title}, with attention to evidence, context, and application.`,
        example: `In ${lesson.title}, students use ${term} to explain a concrete course decision.`,
      })),
      conceptConnections: [
        `${lesson.title} connects to the assessment artifact: ${lesson.studentArtifact}.`,
        `The lesson prepares students to meet this success criterion: ${lesson.successCriteria[0]}`,
      ],
      commonMisconceptions: [
        {
          misconception: 'Summarizing the topic is enough for strong work.',
          correction: 'Strong work applies the concept to evidence and explains the decision or implication.',
        },
        {
          misconception: 'A single example proves the whole claim.',
          correction: 'Use enough evidence to show the pattern and name the limits of the example.',
        },
      ],
      reviewQuestions: [
        {
          question: `How would you explain the central idea of ${stripLessonPrefix(lesson.title)} using course evidence?`,
          bloomsLevel: 'Analyze',
          hint: 'Name the concept, cite evidence, and explain why it matters.',
        },
        {
          question: `What would strong work on ${lesson.studentArtifact} need to show?`,
          bloomsLevel: 'Evaluate',
          hint: lesson.successCriteria.join(' '),
        },
        {
          question: `How does feedback from this lesson improve a later artifact?`,
          bloomsLevel: 'Apply',
          hint: lesson.feedbackMoment,
        },
      ],
      practiceActivities: [
        `Create a three-column note with concept, evidence, and decision for ${stripLessonPrefix(lesson.title)}.`,
        `Self-check a draft against this criterion: ${lesson.successCriteria[0]}`,
      ],
      examPrep: {
        keyTopicsToKnow: lesson.keyConcepts.slice(0, 5),
        timeline: `Review notes after Week ${lesson.lessonNumber}, then revisit before the next assessment.`,
        commonErrors: 'Avoid unsupported claims, vague definitions, and responses that omit the course artifact.',
        reviewStrategy: 'Practice explaining one concept, one evidence source, and one implication out loud.',
      },
      studentResources:
        'Use assigned readings, instructor notes, office hours, peer discussion, and the rubric criteria for this lesson.',
      tags: unique(['study guide', lesson.title, ...lesson.keyConcepts], 10),
    })),
  };
}

function compileCourseFaq(blueprint, config = {}) {
  const target = Math.max(3, Math.min(8, Number(config.questionsPerLesson) || 5));
  const builders = [
    (lesson) => ({
      q: `What should I focus on for ${lesson.title}?`,
      an: `Focus on ${lesson.keyConcepts.slice(0, 3).join(', ')}, then connect those ideas to ${lesson.studentArtifact}. Strong work uses course evidence and explains a decision or implication.`,
      ca: 'Concept Explanation',
      rc: lesson.keyConcepts.slice(0, 4),
      df: 'Basic',
    }),
    (lesson) => ({
      q: `How does this lesson connect to graded work?`,
      an: `${lesson.title} prepares you for ${lesson.studentArtifact}. Use the success criteria as a checklist before submitting or discussing your work.`,
      ca: 'Assignment Clarification',
      rc: lesson.successCriteria,
      df: 'Intermediate',
    }),
    (lesson) => ({
      q: 'What does strong work look like this week?',
      an: `Strong work ${lesson.successCriteria.join(' ')} It should be specific enough that another reader can see how evidence supports the decision.`,
      ca: 'Assessment Prep',
      rc: lesson.successCriteria,
      df: 'Intermediate',
    }),
    (lesson) => ({
      q: 'Where should I ask questions or get help?',
      an: 'Use the official course communication channel, office hours, peer discussion spaces, and assigned support resources. Bring a specific concept, evidence point, or draft section when asking for help.',
      ca: 'Course Logistics',
      rc: ['support', 'office hours', 'course communication'],
      df: 'Basic',
    }),
    (lesson) => ({
      q: 'What is a common mistake to avoid?',
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
      q: 'What materials should I review first?',
      an: `Start with ${lesson.readings.slice(0, 2).join(' and ')}. Then compare your notes against the weekly success criteria.`,
      ca: 'Technical Help',
      rc: lesson.readings.slice(0, 3),
      df: 'Basic',
    }),
    (lesson) => ({
      q: 'How can I check whether I am ready before class or submission?',
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

export function compileBlueprintDeliverable(featureId, blueprint, options = {}) {
  switch (featureId) {
    case 'syllabus':
      return compileSyllabus(blueprint, options);
    case 'assignments':
      return compileAssignments(blueprint, options);
    case 'rubrics':
      return compileRubrics(blueprint, options);
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
