import { PREVIEW_EXAMPLES } from './previewExamples';

const clean = (value) =>
  String(value || '')
    .replace(/\s+/g, ' ')
    .trim();

export function derivePromptPreviewTitle(promptText) {
  const text = clean(promptText);
  if (!text) return 'Your course';

  // Straight apostrophes are word punctuation, not a safe title delimiter:
  // “Faraday's law … Maxwell's equations” otherwise looks like one quoted
  // course title while a streaming workspace is still mapping.
  const quoted = text.match(/["“]([^"”]{4,90})["”]/);
  if (quoted?.[1]) return quoted[1].trim();

  const namedCourse = text.match(
    /\b(?:course|class|seminar|workshop)\s+(?:called|titled|named|on|about)\s+([^,.;!?]{4,90})/i,
  );
  if (namedCourse?.[1]) {
    return namedCourse[1]
      .replace(/\s+(?:with|for|that|where|covering|including)\b.*$/i, '')
      .replace(/\s+in\s+\d+\s+(?:lessons?|weeks?|modules?|sessions?)\b.*$/i, '')
      .trim();
  }

  // A compact course identity is often followed by an em-dash and the
  // requested package shape ("Elementary Mandarin — one lesson: ...").
  // Treat that dash as a brief boundary only when the right-hand side starts
  // with an explicit lesson/week/module/session count; ordinary hyphenated
  // course titles remain untouched.
  const beforeDashedCourseShape = text.match(
    /^(.{4,72}?)\s+[—–-]\s+(?:one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+(?:lessons?|weeks?|modules?|sessions?)\b/i,
  );
  if (beforeDashedCourseShape?.[1]) return beforeDashedCourseShape[1].trim();

  const beforeCourseShape = text.match(
    /^([^,.;!?]{4,90}?)(?:,|\s+-\s+)\s*\d+(?:[-\s]+)(?:lessons?|weeks?|modules?|sessions?)/i,
  );
  if (beforeCourseShape?.[1]) return beforeCourseShape[1].trim();

  const cleaned = text
    .replace(/^(?:build|create|generate|design|make|draft|prepare)\s+(?:an?\s+)?/i, '')
    .replace(/^\d+(?:[-\s](?:lesson|week|module|session))?s?\s+/i, '')
    .replace(/^(?:an?|the)\s+/i, '')
    .replace(/^(?:course|class|seminar|workshop)\s+(?:on|about)\s+/i, '')
    .replace(/\s+(?:with|for|that|where|covering|including)\b.*$/i, '')
    .replace(/\s+(?:course|class|seminar|workshop)$/i, '')
    .replace(/[.?!:;]+$/g, '')
    .trim();

  if (!cleaned) return 'Your course';
  return cleaned.length > 72 ? `${cleaned.slice(0, 69).trim()}...` : cleaned;
}

export function resolveWorkspaceCourseTitle({ courseMapTitle, promptText, mappingInProgress } = {}) {
  const mappedTitle = clean(courseMapTitle);
  const promptTitle = clean(promptText) ? derivePromptPreviewTitle(promptText) : '';
  if (mappingInProgress && promptTitle) return promptTitle;
  return mappedTitle || promptTitle || 'Untitled course';
}

export function resolvePreviewLessonCount({ lessonScope, courseMap, lessonCount } = {}) {
  if (lessonScope?.type === 'specific') return Array.isArray(lessonScope.indices) ? lessonScope.indices.length : 0;
  return courseMap?.lessons?.length || Number(lessonCount) || 0;
}

export function scopePromptAwarePreviewItems(preview, lessonCount, lessonTitles = []) {
  if (!preview || !Array.isArray(preview.items)) return preview;
  const total = Math.max(1, Number(lessonCount) || Number(preview.total) || 1);
  const scopedItems = preview.items.slice(0, Math.min(total, preview.items.length));
  return {
    ...preview,
    total,
    items: scopedItems.map((item, index) => {
      const scopedTitle = clean(lessonTitles[index]);
      if (!scopedTitle || !item?.lessonTitle) return item;
      const suffix = String(item.lessonTitle).match(/\s+—\s+(?:Evidence Check|Discussion|Study Guide)$/)?.[0] || '';
      return { ...item, lessonTitle: `${scopedTitle}${suffix}` };
    }),
  };
}

function buildPreviewCellValue(column, courseTitle, lessonTheme, lessonNumber) {
  const key = `${column?.key || ''} ${column?.label || ''}`.toLowerCase();
  const lowerTitle = courseTitle === 'Your course' ? 'the course' : courseTitle;
  if (/topic|content|theme|unit/.test(key)) return `${lessonTheme} in ${lowerTitle}`;
  if (/objective|outcome|goal/.test(key)) return `Explain and apply the ${lessonTheme.toLowerCase()} focus`;
  if (/activit|practice|class|session/.test(key)) return 'Analyze an example, make a decision, and test a revision';
  if (/assessment|artifact|evidence|deliverable/.test(key)) return `Short evidence check for Lesson ${lessonNumber}`;
  if (/reading|material|source/.test(key)) return 'Course source, worked example, and response guide';
  return `Illustrative ${column?.label || 'course detail'} for Lesson ${lessonNumber}`;
}

function buildCourseMap({ courseTitle, total, columns }) {
  const fallbackColumns = PREVIEW_EXAMPLES.courseMap.cols;
  const enabledColumns = (columns || []).filter((column) => column.enabled !== false).slice(0, 3);
  const cols = enabledColumns.length > 0 ? enabledColumns : fallbackColumns;
  const lessonThemes = ['Foundations', 'Evidence in practice', 'Revision and transfer'];

  return {
    type: 'courseMap',
    isExample: true,
    courseTitle,
    total,
    lessons: Array.from({ length: Math.min(3, total) }, (_, index) => {
      const lessonNumber = index + 1;
      const lessonTheme = lessonThemes[index] || `Lesson ${lessonNumber} focus`;
      return {
        title: `Lesson ${lessonNumber}: ${lessonTheme}`,
        sections: [
          Object.fromEntries(
            cols.map((column) => [column.key, buildPreviewCellValue(column, courseTitle, lessonTheme, lessonNumber)]),
          ),
        ],
      };
    }),
    cols,
  };
}

const levels = (focus) => [
  { label: 'Exemplary', description: `Uses specific course evidence to justify and refine ${focus}.` },
  { label: 'Proficient', description: `Applies the course criteria to ${focus} with a clear rationale.` },
  { label: 'Developing', description: `Names a relevant idea, but the evidence-to-decision link is incomplete.` },
  { label: 'Beginning', description: `Presents ${focus} without course evidence or a usable rationale.` },
];

export function buildPromptAwarePreview(featureId, { promptText, lessonCount, columns } = {}) {
  const courseTitle = derivePromptPreviewTitle(promptText);
  const total = Math.max(1, Number(lessonCount) || PREVIEW_EXAMPLES.courseMap.total || 3);
  const lessonOne = `Lesson 1: ${courseTitle} Foundations`;
  const lessonTwo = `Lesson 2: ${courseTitle} in Practice`;

  switch (featureId) {
    case 'courseMap':
      return buildCourseMap({ courseTitle, total, columns });
    case 'lessonPlans':
      return {
        type: 'lessonPlans',
        isExample: true,
        courseTitle,
        total,
        items: [
          {
            lessonTitle: lessonOne,
            duration: '75 min',
            bloomsLevels: ['Understand', 'Apply'],
            sessionOutline: [
              {
                duration: '10 min',
                activity: 'Notice and name',
                description: `Annotate one concrete example connected to ${courseTitle} and name the decision it raises.`,
              },
              {
                duration: '20 min',
                activity: 'Concept and evidence',
                description: 'Connect a course source to a worked example; separate the observation from the claim.',
              },
              {
                duration: '30 min',
                activity: 'Guided application',
                description: 'Use the lesson criteria to make a choice, compare rationales, and revise after feedback.',
              },
              {
                duration: '15 min',
                activity: 'Evidence check',
                description: 'Submit the decision, the supporting detail, and one limitation or next test.',
              },
            ],
          },
          {
            lessonTitle: lessonTwo,
            duration: '75 min',
            bloomsLevels: ['Apply', 'Analyze'],
            sessionOutline: [
              {
                duration: '10 min',
                activity: 'Bridge from Lesson 1',
                description: 'Revisit the prior evidence and identify what the new case changes.',
              },
              {
                duration: '25 min',
                activity: 'Case comparison',
                description: 'Compare two plausible approaches using the same decision criteria.',
              },
              {
                duration: '30 min',
                activity: 'Practice and critique',
                description: 'Build a response, test it with a peer, and document one evidence-based revision.',
              },
            ],
          },
        ],
      };
    case 'slideDecks':
      return {
        type: 'slideDecks',
        isExample: true,
        courseTitle,
        total,
        items: [
          {
            lessonTitle: lessonOne,
            slides: [
              { title: lessonOne, type: 'title', timeEstimate: '1 min', bullets: [courseTitle] },
              {
                title: 'The lesson moves from evidence to a defensible decision',
                type: 'agenda',
                timeEstimate: '2 min',
                bullets: ['Notice', 'Interpret', 'Apply', 'Revise'],
              },
              {
                title: 'Learning objectives',
                type: 'objectives',
                timeEstimate: '2 min',
                bullets: ['Explain the lesson focus', 'Apply it to a case', 'Justify a revision with evidence'],
              },
              {
                title: 'A specific source detail changes the quality of the decision',
                type: 'content',
                timeEstimate: '6 min',
                bullets: ['Observation', 'Interpretation', 'Decision consequence'],
                visual: { kind: 'diagram', description: 'Evidence-to-decision chain' },
              },
              {
                title: 'Worked example: compare two plausible responses',
                type: 'example',
                timeEstimate: '8 min',
                bullets: ['Apply one shared criterion', 'Name the tradeoff', 'Choose and justify'],
                visual: { kind: 'table', description: 'Side-by-side evidence comparison' },
              },
              {
                title: 'Practice: make, test, and revise the choice',
                type: 'activity',
                timeEstimate: '20 min',
                bullets: ['Draft independently', 'Exchange evidence checks', 'Record one revision'],
              },
            ],
          },
        ],
      };
    case 'rubrics':
      return {
        type: 'rubrics',
        isExample: true,
        courseTitle,
        total: 1,
        items: [
          {
            assignmentTitle: `${courseTitle} Applied Artifact`,
            totalPoints: 100,
            bloomsLevel: 'Apply',
            criteria: [
              { name: 'Use of evidence', weight: '35%', points: 35, levels: levels('the evidence') },
              { name: 'Concept application', weight: '35%', points: 35, levels: levels('the course concept') },
              { name: 'Revision rationale', weight: '30%', points: 30, levels: levels('the final revision') },
            ],
          },
        ],
      };
    case 'quizBank':
      return {
        type: 'quizBank',
        isExample: true,
        courseTitle,
        total,
        items: [
          {
            lessonTitle: `${lessonOne} — Evidence Check`,
            bloomsCoverage: ['Understand', 'Apply', 'Analyze'],
            questions: [
              {
                type: 'multiple_choice',
                bloomsLevel: 'Understand',
                difficulty: 'Easy',
                points: 1,
                question: 'Which response best connects the lesson evidence to the decision in the case?',
                options: [
                  'A. The response that repeats the topic without evidence',
                  'B. The response that cites a specific detail and explains its consequence',
                  'C. The response that introduces an unrelated example',
                  'D. The response that states a preference without a rationale',
                ],
                answer: 'B',
              },
              {
                type: 'short_answer',
                bloomsLevel: 'Apply',
                difficulty: 'Medium',
                points: 2,
                question: `Apply one ${courseTitle} criterion to a new case and name the evidence you used.`,
              },
              {
                type: 'essay',
                bloomsLevel: 'Analyze',
                difficulty: 'Hard',
                points: 5,
                question:
                  'Compare two defensible responses, explain the tradeoff, and propose a test for the stronger one.',
              },
            ],
          },
        ],
      };
    case 'discussions':
      return {
        type: 'discussions',
        isExample: true,
        courseTitle,
        total,
        items: [
          {
            lessonTitle: `${lessonOne} — Discussion`,
            bloomsLevel: 'Apply',
            format: 'Case discussion',
            estimatedDuration: '25 min',
            prompt: `Choose one concrete ${courseTitle} example. What decision was made, what evidence supports it, and what remains uncertain?`,
            followUp: [
              'Which source detail most changed your interpretation?',
              'What evidence would make you revise the decision?',
            ],
          },
        ],
      };
    case 'assignments':
      return {
        type: 'assignments',
        isExample: true,
        courseTitle,
        total: 1,
        items: [
          {
            title: `${courseTitle} Evidence-to-Decision Project`,
            assignmentType: 'Applied project',
            bloomsLevel: 'Apply',
            estimatedTime: '4–6 hours',
            totalPoints: 100,
            description:
              'Analyze a course-relevant case, use specific evidence to justify a response, and document how feedback changed the final artifact.',
            components: [
              'Case and decision statement',
              'Evidence annotation linked to course criteria',
              'Draft, feedback record, and revision rationale',
            ],
            deliverables: ['Final artifact', 'Evidence note', 'Revision reflection'],
            scaffoldingMilestones: [
              { milestone: 'Case and evidence check', dueDate: 'Checkpoint 1', feedback: 'Instructor check' },
              { milestone: 'Peer-tested draft', dueDate: 'Checkpoint 2', feedback: 'Structured peer critique' },
            ],
          },
        ],
      };
    case 'studyGuides':
      return {
        type: 'studyGuides',
        isExample: true,
        courseTitle,
        total,
        items: [
          {
            lessonTitle: `${lessonOne} — Study Guide`,
            summary: `Review the lesson's concepts, evidence, and decision process for ${courseTitle}.`,
            keyTerms: [
              {
                term: 'Core concept',
                definition: 'The lesson idea learners must explain and use, not merely name.',
                example: 'A learner applies the idea to interpret a specific case detail.',
              },
              {
                term: 'Evidence-to-decision link',
                definition: 'The reasoning that explains why a source detail supports a particular choice.',
                example: 'A response cites the detail, states its consequence, and names the resulting decision.',
              },
              {
                term: 'Transfer check',
                definition: 'A new situation used to test whether the learner can apply the concept independently.',
                example: 'The same criterion is used on a contrasting case with a different constraint.',
              },
            ],
            reviewQuestions: [
              'What is the lesson claim, and which detail supports it?',
              'How would the decision change if one constraint changed?',
            ],
          },
        ],
      };
    case 'syllabus':
      return {
        type: 'syllabus',
        isExample: true,
        courseTitle,
        total: 5,
        sections: [
          {
            heading: 'Course Description',
            content: `${courseTitle} connects course concepts to evidence-based practice, feedback, and transfer.`,
          },
          {
            heading: 'Learning Outcomes',
            content:
              'Explain core ideas, apply them to authentic cases, justify decisions with evidence, and revise from feedback.',
          },
          {
            heading: 'Assessment Alignment',
            content: 'Every outcome is practiced in a lesson and assessed through a named artifact or evidence check.',
          },
          {
            heading: 'Course Materials',
            content: 'The generated syllabus will list the supplied files and confirmed sources.',
          },
        ],
        outcomeAlignmentMatrix: [
          {
            outcome: 'Apply a core course idea to an authentic case',
            assessedBy: ['Applied project', 'Lesson evidence checks'],
            practicedIn: [lessonOne],
          },
          {
            outcome: 'Justify a revision with specific evidence',
            assessedBy: ['Revision rationale'],
            practicedIn: [lessonTwo],
          },
        ],
      };
    case 'courseFaq':
      return {
        type: 'courseFaq',
        isExample: true,
        courseTitle,
        total,
        items: [
          {
            question: `How should I prepare for ${courseTitle}?`,
            answer:
              'Review the assigned source, bring one concrete example, and note one question you want to test in class.',
            category: 'Course Logistics',
          },
          {
            question: 'What makes a strong response to a course task?',
            answer:
              'Name the decision, cite a specific course detail, explain the connection, and acknowledge a limitation or next test.',
            category: 'Assignment Clarification',
          },
          {
            question: 'Where will feedback appear?',
            answer:
              'Feedback is tied to the relevant lesson, draft checkpoint, and rubric criterion so the next revision is actionable.',
            category: 'Technical Help',
          },
        ],
      };
    default:
      return null;
  }
}
