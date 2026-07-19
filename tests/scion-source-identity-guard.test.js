import { describe, expect, it } from 'vitest';
import { buildBlueprintFromGraph } from '../src/lib/courseGraph/blueprintFromGraph.js';
import { deriveCourseGraphFromCourseMap } from '../src/lib/courseGraph/deriveFromCourseMap.js';

describe('Scion automatic-source language identity guard', () => {
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
});
