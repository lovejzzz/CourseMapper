import { describe, expect, it } from 'vitest';

import { buildCourseBlueprint, compileBlueprintDeliverables } from '../src/lib/courseBlueprintCompiler.js';
import { repairCourseMapReadiness } from '../src/lib/deliverableReadiness.js';
import { computeTexture } from '../src/lib/quality/textureMetric.js';

const UX_TOPICS = [
  'Critique sessions',
  'Design journals',
  'Usability testing',
  'Accessibility review',
  'Wireframes',
  'Prototypes',
  'Design rationale',
  'Peer critique',
  'Final UX case study portfolio',
  'Critique sessions',
  'Design journals',
  'Final UX case study portfolio',
];

function uxStudioCourseMap() {
  return {
    courseName: 'User Experience Design Studio',
    lessons: UX_TOPICS.map((topic, index) => ({
      title: `Lesson ${index + 1}: ${topic}`,
      sections: [
        {
          topicSection: `${index + 1}.1: ${topic.toLowerCase()}`,
          learningGoals: `Use ${topic.toLowerCase()} to make a design choice traceable to user evidence.`,
          learningObjectives: `Apply ${topic.toLowerCase()} to a UX artifact and explain the decision it changes.`,
          weeklyAssessments: '',
          asyncActivities: `Review assigned ${topic.toLowerCase()} materials and prepare critique notes.`,
          syncActivities: `Discuss ${topic.toLowerCase()} evidence and revise a design rationale.`,
          supportingResources: `${topic} reading; studio critique notes`,
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

function featureDocs(feature, values) {
  return values.map((value, index) => ({
    id: `${feature}-${index + 1}`,
    feature,
    text: textValues(value).join(' '),
  }));
}

describe('v0.15.141 UX texture regression', () => {
  it('does not restamp the v0.15.140 UX assessment, slide, or rubric shingles', () => {
    const blueprint = buildCourseBlueprint(uxStudioCourseMap());
    const compiled = compileBlueprintDeliverables(blueprint, ['assignments', 'rubrics', 'slideDecks'], {
      configMap: { slideDecks: { slideCount: 8 } },
    });
    const docs = [
      ...featureDocs('assignments', compiled.assignments.assignments),
      ...featureDocs('rubrics', compiled.rubrics.rubrics),
      ...featureDocs('slideDecks', compiled.slideDecks.decks),
    ];
    const text = docs.map((doc) => doc.text).join('\n');
    const texture = computeTexture(docs, { slotValues: UX_TOPICS });
    const evidence = texture.evidence.map((item) => item.shingle).join('\n');

    expect(text).not.toMatch(/critique memo naming one user-evidence signal and one design revision/i);
    expect(text).not.toMatch(/artifact annotation linking a research detail to a design choice/i);
    expect(evidence).not.toMatch(
      /the discussion to compare competing interpretations before students lock in their next/i,
    );
    expect(evidence).not.toMatch(/students should know how the listen practice compare and revise sequence changes/i);
    expect(evidence).not.toMatch(
      /not writing polish confidence accent format preference or prior assumptions about the/i,
    );
  });

  it('repairs sparse UX course-map assessment cells with shorter non-leaky labels', () => {
    const courseMap = uxStudioCourseMap();
    courseMap.lessons.forEach((lesson) => {
      lesson.sections[0].weeklyAssessments = 'To be determined';
    });

    const repaired = repairCourseMapReadiness({
      courseMap,
      columns: [{ key: 'weeklyAssessments', label: 'Weekly Assessments', enabled: true }],
    }).courseMap;
    const text = textValues(repaired).join('\n');

    expect(text).toContain('evidence memo: user signal and revision choice');
    expect(text).toContain('studio defense: prototype move and evidence');
    expect(text).not.toMatch(/critique memo naming one user-evidence signal/i);
    expect(text).not.toMatch(/defend one prototype or case-study move with evidence/i);
  });
});
