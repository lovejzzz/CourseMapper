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

  // 1. Health-based starters (top 2 findings by severity)
  if (deliverables && courseMap) {
    try {
      const report = generateCourseHealthReport(courseMap, deliverables);
      if (report && report.findings.length > 0) {
        const actionable = report.findings
          .filter(f => f.suggestedPrompt)
          .slice(0, 2);
        for (const finding of actionable) {
          starters.push({ text: finding.suggestedPrompt, icon: 'search' });
        }
      }
    } catch { /* validator may fail on edge cases — fall through to defaults */ }
  }

  // 2. Gap-based starters — find first lesson missing content in any deliverable
  if (deliverables && starters.length < 3) {
    const gapTargets = [
      ['quizBank', 'qs', 'quiz questions'],
      ['discussions', null, 'a discussion prompt'],
      ['slideDecks', 'sl', 'slides'],
      ['rubrics', 'cr', 'rubric criteria'],
      ['studyGuides', null, 'study guide content'],
    ];
    for (const [featureId, subKey, label] of gapTargets) {
      if (starters.length >= 3) break;
      const entry = deliverables[featureId];
      if (!entry?.data) continue;
      const arrKey = getArrayKey(featureId, entry.data);
      const arr = arrKey && entry.data[arrKey];
      if (!Array.isArray(arr)) continue;
      for (let i = 0; i < arr.length && i < lessons.length; i++) {
        const lesson = arr[i];
        const isEmpty = subKey
          ? !lesson[subKey] || lesson[subKey].length === 0
          : !lesson || Object.keys(lesson).length <= 2;
        if (isEmpty) {
          const lessonTitle = lessons[i]?.title || `Lesson ${i + 1}`;
          starters.push({ text: `Add ${label} to ${lessonTitle}`, icon: 'plus' });
          break;
        }
      }
    }
  }

  // 3. Active-tab-specific starter — suggest action relevant to what user is viewing
  if (starters.length < 4 && activeTab && activeTab !== 'courseMap' && deliverables?.[activeTab]?.status === 'done') {
    const lesson = lessons[0];
    const lessonTitle = lesson?.title || 'Lesson 1';
    if (activeTab === 'quizBank') {
      starters.push({ text: `Add quiz questions or assignments for ${lessonTitle} that align to the learning objectives`, icon: 'search' });
    } else if (activeTab === 'discussions') {
      starters.push({ text: `Review discussion prompts for Bloom's taxonomy alignment`, icon: 'search' });
    } else if (activeTab === 'slideDecks') {
      starters.push({ text: `Add speaker notes to the ${lessonTitle} slides`, icon: 'edit' });
    } else if (activeTab === 'assignments') {
      starters.push({ text: `Review assignment rubric alignment across all lessons`, icon: 'search' });
    } else if (activeTab === 'lessonPlans') {
      starters.push({ text: `Check if lesson plans cover all learning objectives`, icon: 'search' });
    } else {
      starters.push({ text: `Review ${tabLabel} for completeness`, icon: 'search' });
    }
  }

  // 4. Course-specific research starter
  if (starters.length < 4 && lessons.length > 0) {
    // Pick a specific lesson topic for the research starter
    const midLesson = lessons[Math.floor(lessons.length / 2)];
    const topic = midLesson?.title || courseMap?.courseName || 'your course topic';
    starters.push({ text: `Find research on ${topic}`, icon: 'search' });
  }

  // Cap at 4
  return starters.slice(0, 4);
}

// ── Course-specific starters for Tier 2 (course map ready, no deliverables) ──

function buildCourseMapStarters(courseMap) {
  const lessons = courseMap?.lessons || [];
  const courseName = courseMap?.courseName || 'my course';
  const starters = [];

  // 1. Review a specific lesson that might have gaps (pick lesson with fewest objectives)
  if (lessons.length > 0) {
    // Find the lesson with the shortest objectives text — likely needs the most help
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
    starters.push({ text: `Review ${title} for any gaps`, icon: 'search' });
  }

  // 2. Objective specificity — reference the actual course
  starters.push({
    text: `Make the learning objectives in ${courseName} more measurable`,
    icon: 'edit',
  });

  // 3. Difficulty/flow question about the actual lessons
  if (lessons.length >= 3) {
    starters.push({
      text: `How does the difficulty progress across my ${lessons.length} lessons?`,
      icon: 'chat',
    });
  } else {
    starters.push({
      text: 'What deliverables should I generate next?',
      icon: 'chat',
    });
  }

  // 4. Add content suggestion for a specific lesson
  if (lessons.length > 1) {
    const lastLesson = lessons[lessons.length - 1];
    const lastTitle = lastLesson?.title || `Lesson ${lessons.length}`;
    starters.push({ text: `Add an activity idea for ${lastTitle}`, icon: 'plus' });
  } else {
    starters.push({ text: 'How do I export to Google Docs?', icon: 'chat' });
  }

  return starters.slice(0, 4);
}

// ── Chat opener — context-aware starters ────────────────────────────────────

export function getChatOpener(courseMap, isAgentMode, activeTab, deliverables = null) {
  // Tier 3: Agent mode — deliverables generated, show adaptive starters
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
