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
  const courseTopic = courseMap?.courseName || 'your course topic';

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

  // 2. Gap-based starters — find first lesson missing quiz/discussion
  if (deliverables && starters.length < 3) {
    for (const [featureId, subKey] of [['quizBank', 'qs'], ['discussions', null]]) {
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
          : !lesson || Object.keys(lesson).length <= 2; // lt + maybe one field
        if (isEmpty) {
          const lessonTitle = lessons[i]?.title || `Lesson ${i + 1}`;
          const label = featureId === 'quizBank' ? 'a quiz question' : 'a discussion prompt';
          starters.push({ text: `Add ${label} to ${lessonTitle}`, icon: 'plus' });
          break;
        }
      }
    }
  }

  // 3. Always include a research starter
  if (starters.length < 4) {
    starters.push({ text: `Find research on ${courseTopic}`, icon: 'search' });
  }

  // 4. Fill remaining with course-health review
  if (starters.length < 4) {
    starters.push({ text: 'Review my course for educational gaps', icon: 'search' });
  }

  // Cap at 4
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
    return {
      greeting: 'Your course map is ready! I can help you refine it or generate deliverables.',
      starters: [
        {
          text: 'Review my course map for any gaps',
          icon: 'search',
        },
        {
          text: 'Make the learning objectives more specific',
          icon: 'edit',
        },
        {
          text: 'What deliverables should I generate?',
          icon: 'chat',
        },
        {
          text: 'How do I export to Google Docs?',
          icon: 'chat',
        },
      ],
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
