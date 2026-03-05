import { getCustomDeliverable } from '../../lib/customDeliverableLibrary';

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

// ── Chat opener — context-aware starters ────────────────────────────────────

export function getChatOpener(courseMap, isAgentMode, activeTab) {
  // Tier 3: Agent mode — deliverables generated, show action starters
  if (isAgentMode) {
    const tabLabel = activeTab && FEATURE_LABELS[activeTab]
      ? FEATURE_LABELS[activeTab]
      : null;
    return {
      greeting: 'I can edit your course materials directly. Try asking me to:',
      starters: [
        {
          text: 'Add a homework assignment to Lesson 2',
          icon: 'plus',
        },
        {
          text: tabLabel ? `Review my ${tabLabel} for gaps` : 'Review my deliverables for gaps',
          icon: 'search',
        },
        {
          text: 'Add a quiz question about ethics',
          icon: 'plus',
        },
        {
          text: 'What can you help me with?',
          icon: 'chat',
        },
      ],
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
