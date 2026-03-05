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

// ── Suggested questions for empty chat state ────────────────────────────────
export function getSuggestedQuestions(courseMap) {
  if (courseMap) {
    return [
      'Review my course map for any gaps',
      'Suggest an activity for Lesson 3',
      'How do I export to Google Docs?',
      'What deliverables should I generate?',
    ];
  }
  return [
    'How do I get started?',
    'What deliverables can I generate?',
    'How do I get an API key?',
    'Is my data private and secure?',
  ];
}
