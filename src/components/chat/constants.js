import { getCustomDeliverable } from '../../lib/customDeliverableLibrary';
import { generateCourseHealthReport } from '../../lib/pedagogicalValidator';
import { getArrayKey } from '../../lib/syncDependencies';

// ── Feature labels ──────────────────────────────────────────────────────────
export const FEATURE_LABELS = {
  courseMap: 'Course Map',
  lessonPlans: 'Lesson Plans',
  slideDecks: 'Slide Decks',
  rubrics: 'Rubrics',
  quizBank: 'Quiz & Exam Bank',
  discussions: 'Discussion Prompts',
  assignments: 'Assignment Briefs',
  studyGuides: 'Study Guides',
  syllabus: 'Syllabus',
  courseFaq: 'Course FAQ',
};

/** Resolve any featureId (built-in or custom) to a human-readable label */
export function resolveLabel(id) {
  if (FEATURE_LABELS[id]) return FEATURE_LABELS[id];
  if (id?.startsWith('custom_')) {
    const custom = getCustomDeliverable(id);
    return custom?.name || 'Custom Deliverable';
  }
  return id;
}

// ── Generation steps ────────────────────────────────────────────────────────
export const STEPS = [
  { key: 'parsing', label: 'Parsing uploaded files' },
  { key: 'sending', label: 'Sending to AI model' },
  { key: 'generating', label: 'AI is generating course map' },
  { key: 'continuing', label: 'Auto-completing missing lessons' },
  { key: 'examining', label: 'Examining course map for completeness' },
  { key: 'done', label: 'Course map ready' },
];

// ── Adaptive starters from course health + deliverable gaps ─────────────────

const SUB_ARRAY_KEYS = { quizBank: 'qs', slideDecks: 'sl', courseFaq: 'qs', rubrics: 'cr' };

function buildActiveTabSecondaryStarter(activeTab, tabLabel) {
  const starters = {
    quizBank: { text: 'Check quiz timing and difficulty', icon: 'search' },
    discussions: { text: 'Improve discussion prompts', icon: 'edit' },
    slideDecks: { text: 'Improve slides', icon: 'edit' },
    assignments: { text: 'Strengthen assignment criteria', icon: 'edit' },
    lessonPlans: { text: 'Check lesson timing', icon: 'search' },
    studyGuides: { text: 'Improve study guides', icon: 'edit' },
    rubrics: { text: 'Make rubrics stricter', icon: 'edit' },
    courseFaq: { text: 'Improve student FAQ', icon: 'edit' },
    syllabus: { text: 'Check syllabus policies', icon: 'search' },
  };
  return starters[activeTab] || { text: `Review ${tabLabel} for completeness`, icon: 'search' };
}

function buildAdaptiveStarters(courseMap, activeTab, deliverables) {
  const starters = [];
  const lessons = courseMap?.lessons || [];
  const tabLabel = resolveLabel(activeTab);
  const doneFeatureCount = Object.values(deliverables || {}).filter(
    (entry) => entry?.status === 'done' && entry?.data,
  ).length;

  if (doneFeatureCount > 0) {
    starters.push({ text: 'Finish package', icon: 'search', action: 'finish-package' });
  }

  // 1. Active-tab-specific starter — prioritize what the user is currently viewing
  if (starters.length < 2 && activeTab && activeTab !== 'courseMap' && deliverables?.[activeTab]?.status === 'done') {
    starters.push(buildActiveTabSecondaryStarter(activeTab, tabLabel));
  } else if (starters.length < 2 && activeTab === 'courseMap') {
    // On course map tab — suggest course-level actions
    if (lessons.length > 0) {
      const weakLesson = lessons.reduce(
        (best, l, i) => {
          const objCount = (l?.sections || []).reduce((s, sec) => s + (sec.learningObjectives?.length || 0), 0);
          return objCount < best.count ? { idx: i, count: objCount } : best;
        },
        { idx: 0, count: Infinity },
      );
      const title = lessons[weakLesson.idx]?.title || `Lesson ${weakLesson.idx + 1}`;
      starters.push({ text: `Review ${title} for gaps`, icon: 'search' });
    }
  }

  // 2. Health-based or gap-based — pick the most relevant one
  if (starters.length < 2 && deliverables && courseMap && (!activeTab || activeTab === 'courseMap')) {
    try {
      const report = generateCourseHealthReport(courseMap, deliverables);
      if (report?.findings?.length > 0) {
        const finding = report.findings.find((f) => f.suggestedPrompt);
        if (finding) starters.push({ text: finding.suggestedPrompt, icon: 'search' });
      }
    } catch {
      /* fall through */
    }
  }

  // 3. Fallback — generic but useful
  if (starters.length < 2) {
    if (lessons.length > 0) {
      const topic = lessons[Math.floor(lessons.length / 2)]?.title || courseMap?.courseName || 'your course';
      starters.push({ text: `Check ${topic} for gaps`, icon: 'search' });
    } else {
      starters.push({ text: 'What should I work on next?', icon: 'chat' });
    }
  }

  return starters.slice(0, 2);
}

// ── Course-specific starters for Tier 2 (course map ready, no deliverables) ──

function buildCourseMapStarters(courseMap) {
  const lessons = courseMap?.lessons || [];
  const courseName = courseMap?.courseName || 'my course';
  const starters = [];

  // 1. Review the weakest lesson
  if (lessons.length > 0) {
    let targetLesson = lessons[0];
    let targetIdx = 0;
    for (let i = 1; i < lessons.length; i++) {
      const objLen = (lessons[i]?.sections || []).reduce((sum, s) => sum + (s.learningObjectives?.length || 0), 0);
      const curLen = (targetLesson?.sections || []).reduce((sum, s) => sum + (s.learningObjectives?.length || 0), 0);
      if (objLen < curLen && objLen > 0) {
        targetLesson = lessons[i];
        targetIdx = i;
      }
    }
    const title = targetLesson?.title || `Lesson ${targetIdx + 1}`;
    starters.push({ text: `Review ${title} for gaps`, icon: 'search' });
  }

  // 2. Actionable course-level suggestion
  starters.push({
    text: `Make learning objectives in ${courseName} more measurable`,
    icon: 'edit',
  });

  return starters.slice(0, 2);
}

// ── Chat opener — context-aware starters ────────────────────────────────────

function buildLandingAwareGenerationGreeting(landingContext, fallback, phase) {
  if (!landingContext?.hasContext) return fallback;

  const hasPrompt = Boolean(landingContext.hasPrompt);
  const fileCount = Number(landingContext.fileCount) || 0;
  const materialText =
    fileCount > 0 ? `${fileCount} uploaded material${fileCount === 1 ? '' : 's'}` : 'uploaded materials';

  if (phase === 'deliverables') {
    if (hasPrompt && fileCount > 0) {
      return `I am carrying your starting request and ${materialText} into the deliverables now.`;
    }
    if (hasPrompt) return 'I am carrying your starting request into the deliverables now.';
    return `I am carrying your ${materialText} into the deliverables now.`;
  }

  if (hasPrompt && fileCount > 0) {
    return `I am using your starting request and ${materialText} to generate the course map.`;
  }
  if (hasPrompt) return 'I am using your starting request to generate the course map.';
  return `I am reading your ${materialText} to generate the course map.`;
}

export function getChatOpener(
  courseMap,
  isAgentMode,
  activeTab,
  deliverables = null,
  isGenerating = false,
  isDelivGenerating = false,
  isAgentProviderReady = true,
  landingContext = null,
) {
  // Generation in progress — don't show premature lesson count or onboarding message
  if (isGenerating) {
    return {
      greeting: buildLandingAwareGenerationGreeting(
        landingContext,
        'Generating your course map — hang tight!',
        'courseMap',
      ),
      starters: [],
    };
  }

  // Deliverables still generating — show progress message, not the agent greeting
  if (isDelivGenerating) {
    return {
      greeting: buildLandingAwareGenerationGreeting(
        landingContext,
        'Generating your deliverables — almost there!',
        'deliverables',
      ),
      starters: [],
    };
  }

  // Tier 3: Agent mode — all deliverables generated, show adaptive starters
  if (isAgentMode) {
    if (!isAgentProviderReady) {
      return {
        greeting:
          'Your generated workspace is ready. I can still run local Audit and Plan. Configure AI for chat and model edits.',
        starters: [
          {
            text: 'Run local audit',
            icon: 'search',
            action: 'local-audit',
          },
          {
            text: 'Plan next step',
            icon: 'list',
            action: 'local-plan',
          },
          {
            text: 'Configure AI for chat and edits',
            icon: 'settings',
            action: 'configure-ai',
          },
        ],
      };
    }
    const starters = buildAdaptiveStarters(courseMap, activeTab, deliverables);
    return {
      greeting: landingContext?.hasContext
        ? 'I am still using your starting brief. I can finish, fix, and verify your course materials.'
        : 'I can finish, fix, and verify your course materials.',
      starters,
    };
  }

  // Tier 2: Course map exists, no deliverables yet
  if (courseMap) {
    const courseName = courseMap?.courseName || 'your course';
    const lessonCount = courseMap?.lessons?.length || 0;
    return {
      greeting: `Your ${courseName} course map is ready with ${lessonCount} lesson${lessonCount !== 1 ? 's' : ''}! I can help you refine it or generate deliverables.`,
      starters: buildCourseMapStarters(courseMap),
    };
  }

  // Tier 1: No course map — onboarding
  return {
    greeting: "I'm your teaching assistant. Upload a syllabus or describe your course to get started.",
    starters: [
      {
        text: 'How do I get started?',
        icon: 'chat',
      },
      {
        text: 'What deliverables can I generate?',
        icon: 'chat',
      },
      {
        text: 'How do I get an API key?',
        icon: 'chat',
      },
      {
        text: 'Is my data private and secure?',
        icon: 'chat',
      },
    ],
  };
}
