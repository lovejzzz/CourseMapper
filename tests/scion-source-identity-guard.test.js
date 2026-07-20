import { describe, expect, it } from 'vitest';
import { buildBlueprintFromGraph } from '../src/lib/courseGraph/blueprintFromGraph.js';
import { deriveCourseGraphFromCourseMap } from '../src/lib/courseGraph/deriveFromCourseMap.js';
import { sanitizeLessonTitleEchoEnrichment } from '../src/lib/lessonSemanticRelevance.js';

describe('Scion automatic-source language identity guard', () => {
  it('removes a long lesson-title pseudo-term and its cached projected atoms while preserving authored MC', () => {
    const title = 'Tang Poetry using Li Bai and Du Fu';
    const enrichment = {
      enrichmentSource: 'own-kernel-cache',
      keyTerms: [
        { term: title, definition: 'A schedule label mistakenly treated as a reusable term.' },
        { term: 'Poetic analysis', definition: 'Analysis connects formal evidence to an interpretation.' },
      ],
      kernel: {
        facts: ['Li Bai and Du Fu position the speaker differently through imagery.'],
        scenario: {
          setup: `${title} is repeated in a derived case about ${title}.`,
          materials: `the ${title} case example`,
          source: 'derived-kernel-fallback',
        },
      },
      quizItems: [
        {
          index: 0,
          type: 'multiple_choice',
          question: `Which comparison is best supported in ${title}?`,
          distractorRationales: [`${title} is only a schedule label.`, 'A valid poetic-analysis misconception.'],
        },
        { index: 3, type: 'short_answer', question: `${title} ${title} derived scenario.` },
        { index: 5, type: 'essay', question: `Evaluate ${title} as a concept.` },
      ],
    };

    const result = sanitizeLessonTitleEchoEnrichment({ title: `Lesson 5: ${title}` }, enrichment);

    expect(result.receipt).toMatchObject({
      changed: true,
      rejectedTitleTerms: [title],
      removedQuizItems: 2,
      removedScenario: true,
    });
    expect(result.enrichment.keyTerms.map((term) => term.term)).toEqual(['Poetic analysis']);
    expect(result.enrichment.quizItems).toHaveLength(1);
    expect(result.enrichment.quizItems[0].question).toContain(title);
    expect(result.enrichment.quizItems[0].distractorRationales).toEqual(['A valid poetic-analysis misconception.']);
    expect(result.enrichment.kernel.facts).toHaveLength(1);
    expect(result.enrichment.kernel.scenario).toBeNull();
  });

  it('keeps a legitimate disciplinary clause embedded in a longer lesson title', () => {
    const term = 'The six classes of nutrients';
    const enrichment = {
      keyTerms: [
        {
          term,
          definition: 'Carbohydrates, lipids, proteins, water, vitamins, and minerals are nutrient classes.',
        },
      ],
      kernel: { facts: ['The six nutrient classes support distinct body functions.'] },
    };

    const result = sanitizeLessonTitleEchoEnrichment(
      {
        title: 'Lesson 1: six classes of nutrients and the difference between macronutrients and micronutrients',
      },
      enrichment,
    );

    expect(result.receipt.changed).toBe(false);
    expect(result.enrichment.keyTerms.map((entry) => entry.term)).toEqual([term]);
  });

  it('drops a persisted Japanese false friend without mutating the saved graph', () => {
    const graph = deriveCourseGraphFromCourseMap({
      courseName: 'Elementary Mandarin Chinese I',
      lessons: [
        {
          title: 'Lesson 1: Basic Characters and Reading',
          sections: [
            {
              topicSection: '1.1: Basic Characters',
              learningObjectives: 'Recognize basic Mandarin characters in short readings.',
              supportingResources: '',
            },
          ],
        },
      ],
    });
    const section = graph.sessions[0].sections[0];
    graph.resources.push(
      {
        id: 'sf-japanese',
        origin: 'source-finder',
        title: 'Kanji',
        citation: 'Kanji. Japanese writing with hiragana and katakana.',
        snippet: 'Kanji are characters used in the Japanese writing system with hiragana and katakana.',
      },
      {
        id: 'sf-mandarin',
        origin: 'source-finder',
        title: 'Basic Chinese characters for Mandarin reading',
        citation: 'Basic Chinese characters for Mandarin reading. CC BY 4.0.',
        snippet: 'A Mandarin reading guide for recognizing basic Chinese characters.',
      },
    );
    section.resourceRefs = ['sf-japanese', 'sf-mandarin'];

    const blueprint = buildBlueprintFromGraph(graph);
    const compiledInput = JSON.stringify(blueprint);
    expect(compiledInput).not.toMatch(/Kanji|hiragana|katakana/);
    expect(compiledInput).toContain('Basic Chinese characters for Mandarin reading');
    expect(graph.resources.map((resource) => resource.id)).toEqual(['sf-japanese', 'sf-mandarin']);
    expect(section.resourceRefs).toEqual(['sf-japanese', 'sf-mandarin']);
  });

  it('keeps explicitly comparative Mandarin-Japanese course sources', () => {
    const graph = deriveCourseGraphFromCourseMap({
      courseName: 'Comparative Mandarin and Japanese Writing Systems',
      lessons: [
        {
          title: 'Lesson 1: Hanzi and Kanji',
          sections: [{ topicSection: '1.1: Hanzi and Kanji', learningObjectives: 'Compare both systems.' }],
        },
      ],
    });
    graph.resources.push({
      id: 'sf-comparative',
      origin: 'source-finder',
      title: 'Hanzi and Kanji',
      citation: 'A comparison of Mandarin hanzi and Japanese kanji with hiragana.',
    });
    graph.sessions[0].sections[0].resourceRefs = ['sf-comparative'];

    expect(JSON.stringify(buildBlueprintFromGraph(graph))).toContain('Hanzi and Kanji');
  });

  it('does not let a rejected genome concept keep its own off-topic source attached', () => {
    const graph = deriveCourseGraphFromCourseMap({
      courseName: 'World Literature',
      lessons: [
        {
          title: 'Lesson 1: Oral Epic Tradition',
          sections: [
            {
              topicSection: 'Oral transmission in Gilgamesh',
              learningObjectives: 'Analyze how oral transmission shapes an epic.',
              readings: ['Gilgamesh'],
            },
          ],
        },
      ],
    });
    graph.resources.push(
      {
        id: 'genome-close-reading',
        origin: 'genome',
        citation: 'Close Reading in Literary Study §1',
        conceptLinks: [{ id: 'lit/close-reading', label: 'Close reading' }],
      },
      {
        id: 'epic-poetry-source',
        origin: 'source-finder',
        citation: 'Epic poetry and oral transmission in Gilgamesh',
      },
    );
    graph.sessions[0].sections[0].resourceRefs = ['genome-close-reading', 'epic-poetry-source'];
    graph.enrichmentOverlay = {
      lessonContent: {
        'lesson-1': {
          enrichmentSource: 'genome-linked',
          keyTerms: [{ term: 'Close reading', source: 'Close Reading in Literary Study §1' }],
          conceptProvenance: {
            source: 'genome-linked',
            conceptIds: ['lit/close-reading'],
            competencies: [{ term: 'Close reading', bloom: 'Analyze', standards: [] }],
          },
        },
      },
    };

    const compiled = JSON.stringify(buildBlueprintFromGraph(graph));
    expect(compiled).not.toContain('Close Reading in Literary Study');
    expect(compiled).toContain('Epic poetry and oral transmission in Gilgamesh');
    expect(graph.sessions[0].sections[0].resourceRefs).toEqual(['genome-close-reading', 'epic-poetry-source']);
  });
});
