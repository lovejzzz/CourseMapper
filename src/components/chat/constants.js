import { getCustomDeliverable } from '../../lib/customDeliverableLibrary';
import { generateCourseHealthReport } from '../../lib/pedagogicalValidator';
import { getArrayKey } from '../../lib/syncDependencies';

// ── Feature labels ──────────────────────────────────────────────────────────
export const FEATURE_LABELS = {
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

function buildAdaptiveStarters(courseMap, activeTab, deliverables) {
  const starters = [];
  const lessons = courseMap?.lessons || [];
  const tabLabel = FEATURE_LABELS[activeTab] || activeTab;

  // 1. Active-tab-specific starter — prioritize what the user is currently viewing
  if (activeTab && activeTab !== 'courseMap' && deliverables?.[activeTab]?.status === 'done') {
    const lesson = lessons[0];
    const lessonTitle = lesson?.title || 'Lesson 1';
    if (activeTab === 'quizBank') {
      starters.push({ text: `Add more quiz questions for ${lessonTitle}`, icon: 'plus' });
    } else if (activeTab === 'discussions') {
      starters.push({ text: `Improve discussion prompts for Bloom's alignment`, icon: 'edit' });
    } else if (activeTab === 'slideDecks') {
      starters.push({ text: `Add speaker notes to ${lessonTitle} slides`, icon: 'edit' });
    } else if (activeTab === 'assignments') {
      starters.push({ text: `Review assignment rubric alignment`, icon: 'search' });
    } else if (activeTab === 'lessonPlans') {
      starters.push({ text: `Check lesson plans cover all objectives`, icon: 'search' });
    } else if (activeTab === 'studyGuides') {
      starters.push({ text: `Add key terms to ${lessonTitle} study guide`, icon: 'plus' });
    } else if (activeTab === 'rubrics') {
      starters.push({ text: `Review rubric criteria for ${lessonTitle}`, icon: 'search' });
    } else {
      starters.push({ text: `Review ${tabLabel} for completeness`, icon: 'search' });
    }
  } else if (activeTab === 'courseMap') {
    // On course map tab — suggest course-level actions
    if (lessons.length > 0) {
      const weakLesson = lessons.reduce((best, l, i) => {
        const objCount = (l?.sections || []).reduce((s, sec) => s + (sec.learningObjectives?.length || 0), 0);
        return objCount < best.count ? { idx: i, count: objCount } : best;
      }, { idx: 0, count: Infinity });
      const title = lessons[weakLesson.idx]?.title || `Lesson ${weakLesson.idx + 1}`;
      starters.push({ text: `Review ${title} for gaps`, icon: 'search' });
    }
  }

  // 2. Health-based or gap-based — pick the most relevant one
  if (starters.length < 2 && deliverables && courseMap) {
    try {
      const report = generateCourseHealthReport(courseMap, deliverables);
      if (report?.findings?.length > 0) {
        const finding = report.findings.find(f => f.suggestedPrompt);
        if (finding) starters.push({ text: finding.suggestedPrompt, icon: 'search' });
      }
    } catch { /* fall through */ }
  }

  // 3. Fallback — generic but useful
  if (starters.length < 2) {
    if (lessons.length > 0) {
      const topic = lessons[Math.floor(lessons.length / 2)]?.title || courseMap?.courseName || 'your course';
      starters.push({ text: `Find research on ${topic}`, icon: 'search' });
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
      const objLen = (lessons[i]?.sections || [])
        .reduce((sum, s) => sum + (s.learningObjectives?.length || 0), 0);
      const curLen = (targetLesson?.sections || [])
        .reduce((sum, s) => sum + (s.learningObjectives?.length || 0), 0);
      if (objLen < curLen && objLen > 0) { targetLesson = lessons[i]; targetIdx = i; }
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

export function getChatOpener(courseMap, isAgentMode, activeTab, deliverables = null, isGenerating = false, isDelivGenerating = false) {
  // Generation in progress — don't show premature lesson count or onboarding message
  if (isGenerating) {
    return {
      greeting: 'Generating your course map — hang tight!',
      starters: [],
    };
  }

  // Deliverables still generating — show progress message, not the agent greeting
  if (isDelivGenerating) {
    return {
      greeting: 'Generating your deliverables — almost there!',
      starters: [],
    };
  }

  // Tier 3: Agent mode — all deliverables generated, show adaptive starters
  if (isAgentMode) {
    const starters = buildAdaptiveStarters(courseMap, activeTab, deliverables);
    return {
      greeting: 'I can edit your course materials directly. Try asking me to:',
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
    greeting: 'I\'m your teaching assistant. Upload a syllabus or describe your course to get started.',
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
