import { describe, expect, it } from 'vitest';

import { buildCourseBlueprint, compileBlueprintDeliverables } from '../src/lib/courseBlueprintCompiler.js';
import { computeTexture } from '../src/lib/quality/textureMetric.js';

const MUSIC_TOPICS = [
  'Pitch Notation',
  'Rhythm and Meter',
  'Intervals',
  'Major Scales',
  'Minor Scales',
  'Triads',
  'Pentatonic Scales',
];

function musicTheoryCourseMap() {
  return {
    courseName: 'Music Theory Fundamentals',
    lessons: MUSIC_TOPICS.map((topic, index) => ({
      title: `Lesson ${index + 1}: ${topic}`,
      sections: [
        {
          topicSection: `${index + 1}.1: ${topic}`,
          learningGoals: `Use ${topic.toLowerCase()} to analyze a score excerpt.`,
          learningObjectives: `Apply ${topic.toLowerCase()} to a listening and notation decision.`,
          weeklyAssessments: `${topic} analysis note`,
          asyncActivities: `Read and listen for ${topic.toLowerCase()} examples.`,
          syncActivities: `Discuss ${topic.toLowerCase()} evidence and revise notation choices.`,
          supportingResources: `${topic} reading; score excerpts`,
        },
      ],
    })),
  };
}

function authoredMusicBlueprint() {
  const blueprint = buildCourseBlueprint(musicTheoryCourseMap());
  blueprint.lessons.forEach((lesson, index) => {
    const topic = MUSIC_TOPICS[index];
    lesson.enrichment = {
      ...(lesson.enrichment || {}),
      discussionPrompt: {
        prompt: `Should ${topic.toLowerCase()} be defended from notation first or from listening evidence first?`,
        positions: [`${topic} is mainly a notation decision`, `${topic} is mainly a listening decision`],
        tension: `${topic} notation evidence versus listening evidence`,
      },
      kernel: {
        scenario: {
          materials: `${topic} score excerpt and listening clip`,
        },
        facts: [
          `${topic} can be identified by comparing staff evidence with heard patterns`,
          `${topic} changes how performers justify the phrase and revise the notation choice`,
        ],
      },
    };
  });
  return blueprint;
}

function textValues(value) {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(textValues);
  if (value && typeof value === 'object') return Object.values(value).flatMap(textValues);
  return [];
}

function countMatches(text, pattern) {
  return (text.match(pattern) || []).length;
}

function featureDocs(feature, values) {
  return values.map((value, index) => ({
    id: `${feature}-${index + 1}`,
    feature,
    text: textValues(value).join(' '),
  }));
}

describe('v0.16.1 Scion texture rotation', () => {
  it('varies authored debate follow-ups and kernel study-guide practice across music lessons', () => {
    const compiled = compileBlueprintDeliverables(authoredMusicBlueprint(), [
      'lessonPlans',
      'discussions',
      'studyGuides',
    ]);
    const docs = [
      ...featureDocs('lessonPlans', compiled.lessonPlans.lessonPlans),
      ...featureDocs('discussions', compiled.discussions.discussions),
      ...featureDocs('studyGuides', compiled.studyGuides.studyGuides),
    ];
    const text = docs.map((doc) => doc.text).join('\n');
    const texture = computeTexture(docs, { slotValues: MUSIC_TOPICS });
    const evidence = texture.evidence.map((item) => item.shingle).join('\n');

    expect(countMatches(text, /what evidence would you need to answer them[\s\S]*or to concede/gi)).toBeLessThan(3);
    expect(countMatches(text, /if the .* evidence changed, what part of .* would you revise first/gi)).toBeLessThan(3);
    expect(countMatches(text, /which side does your evidence actually support/gi)).toBeLessThan(3);
    expect(countMatches(text, /mark the detail that best supports .* the detail that complicates it/gi)).toBeLessThan(
      3,
    );
    expect(countMatches(text, /before the model begins[\s\S]*today's task cold/gi)).toBeLessThan(3);
    expect(countMatches(text, /evidence source seems strongest for .* then name the protocol/gi)).toBeLessThan(3);
    expect(evidence).not.toMatch(/answer them or to concede before revising/i);
    expect(evidence).not.toMatch(/evidence changed what part of .* would you revise/i);
    expect(evidence).not.toMatch(/which side does your evidence actually support/i);
    expect(evidence).not.toMatch(/mark the detail that best supports .* detail that complicates/i);
    expect(evidence).not.toMatch(/before the model begins.*today's task cold/i);
    expect(evidence).not.toMatch(/evidence source seems strongest .* then name the/i);
  });
});
