import { describe, expect, it } from 'vitest';

import { buildCourseBlueprint, compileBlueprintDeliverables } from '../src/lib/courseBlueprintCompiler.js';
import { computeTexture } from '../src/lib/quality/textureMetric.js';

const UX_TOPICS = [
  'Design research',
  'User needs',
  'Synthesis',
  'Personas',
  'Journey maps',
  'Information architecture',
  'Wireframes',
  'Prototyping',
  'Usability testing',
  'Accessibility',
  'Portfolio review',
  'UX case study',
];

function uxStudioCourseMap() {
  return {
    courseName: 'User Experience Design Studio',
    lessons: UX_TOPICS.map((topic, index) => ({
      title: `Lesson ${index + 1}: ${topic}`,
      sections: [
        {
          topicSection: `${index + 1}.1: ${topic.toLowerCase()}`,
          learningGoals: `Use ${topic.toLowerCase()} to make a stronger design decision.`,
          learningObjectives: `Apply ${topic.toLowerCase()} to a user-evidence artifact.`,
          weeklyAssessments: `${topic} critique checkpoint`,
          asyncActivities: `Review assigned ${topic.toLowerCase()} materials and prepare critique notes.`,
          syncActivities: `Discuss ${topic.toLowerCase()} evidence and revise a design rationale.`,
          supportingResources: `${topic} reading; studio critique notes`,
          evaluateDesign: `Score ${topic.toLowerCase()} evidence, reasoning, and revision quality.`,
        },
      ],
    })),
  };
}

function textValues(value) {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(textValues);
  if (value && typeof value === 'object') return Object.values(value).flatMap(textValues);
  return [];
}

describe('v0.15.135 Course FAQ feedback texture', () => {
  it('varies feedback transfer answers instead of repeating the old source-based artifact shingle', () => {
    const blueprint = buildCourseBlueprint(uxStudioCourseMap());
    const compiled = compileBlueprintDeliverables(blueprint, ['courseFaq'], {
      configMap: { courseFaq: { questionsPerLesson: 6 } },
    });
    const feedbackItems = compiled.courseFaq.faqs.map((faq) =>
      faq.qs.find((item) => Array.isArray(item.rc) && item.rc.includes('feedback') && item.rc.includes('revision')),
    );
    const feedbackQuestions = feedbackItems.map((item) => item?.q || '');
    const feedbackAnswers = feedbackItems.map((item) => item?.an || '');
    const faqDocs = compiled.courseFaq.faqs.map((faq, index) => ({
      id: `faq-${index + 1}`,
      feature: 'courseFaq',
      text: textValues(faq).join(' '),
    }));
    const faqText = faqDocs.map((doc) => doc.text).join('\n');
    const texture = computeTexture(faqDocs, { slotValues: UX_TOPICS });
    const evidence = texture.evidence.map((item) => item.shingle).join('\n');

    expect(feedbackAnswers).toHaveLength(UX_TOPICS.length);
    expect(feedbackAnswers.every(Boolean)).toBe(true);
    expect(feedbackQuestions.every(Boolean)).toBe(true);
    expect(new Set(feedbackQuestions).size).toBeGreaterThan(UX_TOPICS.length / 2);
    expect(feedbackQuestions).not.toContain('How should I use feedback from this lesson?');
    expect(new Set(feedbackAnswers).size).toBeGreaterThan(UX_TOPICS.length / 2);
    expect(faqText).not.toMatch(
      /Carry the revised .* evidence move into the next source-based artifact, discussion, or synthesis task/i,
    );
    expect(faqText).not.toMatch(/next source-based artifact/i);
    expect(evidence).not.toMatch(/evidence move into the next source-based artifact discussion or synthesis task/i);
  });
});
