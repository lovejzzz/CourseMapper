import { describe, expect, it } from 'vitest';

import { buildCourseBlueprint, compileBlueprintDeliverables } from '../src/lib/courseBlueprintCompiler.js';
import { repairCourseMapReadiness } from '../src/lib/deliverableReadiness.js';

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

function weakUxStudioCourseMap() {
  return {
    courseName: 'User Experience Design Studio',
    lessons: UX_TOPICS.map((topic, index) => ({
      title: `Lesson ${index + 1}: ${topic}`,
      sections: [
        {
          topicSection: `${index + 1}.1: ${topic.toLowerCase()}`,
          learningGoals: '',
          learningObjectives: '',
          weeklyAssessments: '',
          asyncActivities: '',
          syncActivities: '',
          technologyNeeded: '',
          presentationFormat: '',
          supportingResources: '',
          evaluateDesign: '',
        },
      ],
    })),
  };
}

function count(text, pattern) {
  return (text.match(pattern) || []).length;
}

function stringValues(value) {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(stringValues);
  if (value && typeof value === 'object') return Object.values(value).flatMap(stringValues);
  return [];
}

describe('v0.15.128 UX texture scaffold cleanup', () => {
  it('uses UX-specific Course Map fallback copy instead of generic course/lab boilerplate', () => {
    const result = repairCourseMapReadiness({ courseMap: weakUxStudioCourseMap() });
    const text = JSON.stringify(result.courseMap);

    expect(text).not.toMatch(/quick evidence check|course-relevant decision|new example/i);
    expect(text).not.toMatch(/observe, label, calculate, or decide/i);
    expect(text).not.toMatch(/lab materials|discipline-specific tools|same evidence of learning/i);
    expect(text).toMatch(/design choice|prototype|portfolio|critique|user evidence/i);
  });

  it('does not stamp repeated checklist, office-hours, or exit-ticket scaffolds through compiled UX deliverables', () => {
    const blueprint = buildCourseBlueprint(weakUxStudioCourseMap());
    const compiled = compileBlueprintDeliverables(blueprint, [
      'lessonPlans',
      'assignments',
      'studyGuides',
      'courseFaq',
    ]);
    const text = stringValues(compiled).join('\n');

    expect(text).not.toMatch(/quick evidence check|observe, label, calculate, or decide/i);
    expect(text).not.toMatch(/Instructor-approved readings, examples, or lab materials/i);
    expect(text).not.toMatch(/Debrief and exit ticket|Exit ticket:/i);
    expect(text).not.toMatch(/as a checklist|milestone checklist|success criteria checklist/i);
    expect(count(text, /office hours/gi)).toBeLessThan(2);
    expect(count(text, /checklist/gi)).toBeLessThan(UX_TOPICS.length);
    expect(count(text, /exit ticket/gi)).toBeLessThan(UX_TOPICS.length / 2);
  });
});
