import { describe, expect, it } from 'vitest';
import { deriveCourseGraphFromCourseMap } from '../courseGraph/deriveFromCourseMap.js';
import { renderCourseMapFromGraph } from '../courseGraph/renderCourseMap.js';
import { matchEntityIds, preserveSourceProof } from '../nativeGraphAuthoring.js';

function sourceBackedMap() {
  return {
    courseName: 'AI Governance',
    lessons: [
      {
        title: 'Lesson 1: Model documentation',
        sections: [
          {
            topicSection: '1.1: Model cards',
            learningObjectives: 'Explain model documentation evidence.',
            weeklyAssessments: 'Exit ticket using model documentation.',
            supportingResources: 'Instructor placeholder',
          },
        ],
      },
    ],
  };
}

describe('nativeGraphAuthoring matchEntityIds', () => {
  it('preserves verified resource metadata when the display map is re-derived', () => {
    const oldGraph = deriveCourseGraphFromCourseMap(sourceBackedMap());
    const session = oldGraph.sessions[0];
    const section = session.sections[0];
    const citation =
      'Mitchell et al. (2019). Model Cards for Model Reporting. OpenAlex: https://openalex.org/W123 (open access)';
    oldGraph.resources.push({
      id: 'kr1',
      citation,
      kind: 'peer-reviewed reading',
      sessionRefs: [session.id],
      origin: 'openalex',
      url: 'https://openalex.org/W123',
      license: 'open access',
      attribution: 'OpenAlex (CC0 metadata)',
    });
    section.resourceRefs = ['kr1'];
    oldGraph.authoredBy = 'native';

    const rederived = deriveCourseGraphFromCourseMap(
      renderCourseMapFromGraph(oldGraph, { assessmentReferences: true }),
    );
    const matched = matchEntityIds(oldGraph, rederived);

    expect(matched.resources).toHaveLength(1);
    expect(matched.resources.find((resource) => resource.id === 'kr1')).toMatchObject({
      origin: 'openalex',
      url: 'https://openalex.org/W123',
      license: 'open access',
    });
    expect(matched.sessions[0].sections[0].resourceRefs).toContain('kr1');
  });

  it('preserves unmatched source-backed resources when a later map repair drops the rendered citation', () => {
    const oldGraph = deriveCourseGraphFromCourseMap(sourceBackedMap());
    const session = oldGraph.sessions[0];
    const section = session.sections[0];
    oldGraph.resources.push({
      id: 'sf1',
      citation: 'OpenAlex (2024). Governance of genetics data. OpenAlex: https://openalex.org/W999 (open access)',
      kind: 'source',
      sessionRefs: [session.id],
      origin: 'source-finder',
      provider: 'openalex',
      url: 'https://openalex.org/W999',
      license: 'open access',
      attribution: 'OpenAlex (CC0 metadata)',
    });
    section.resourceRefs = ['sf1'];
    oldGraph.authoredBy = 'native';

    const repairedMap = renderCourseMapFromGraph(oldGraph, { assessmentReferences: true });
    repairedMap.lessons[0].sections[0].supportingResources = 'Instructor worksheet for model documentation.';
    const rederived = deriveCourseGraphFromCourseMap(repairedMap);
    const matched = matchEntityIds(oldGraph, rederived);

    expect(matched.resources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'sf1',
          origin: 'source-finder',
          provider: 'openalex',
          url: 'https://openalex.org/W999',
        }),
      ]),
    );
    expect(matched.resources).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ citation: 'Instructor placeholder' })]),
    );
    expect(matched.sessions[0].sections[0].resourceRefs).toContain('sf1');
  });

  it('preserves source-finder proof for prose graph re-derivations after map repairs', () => {
    const oldGraph = deriveCourseGraphFromCourseMap(sourceBackedMap());
    const session = oldGraph.sessions[0];
    const section = session.sections[0];
    oldGraph.sourceFinderMiniShard = {
      version: 'source-finder-v2',
      topics: [
        {
          sessionId: session.id,
          lessonNumber: 1,
          topic: 'Model documentation',
          conceptRefs: ['c1'],
          sources: [
            {
              id: 'https://openalex.org/W999',
              provider: 'openalex',
              title: 'Governance of model documentation',
              url: 'https://openalex.org/W999',
              license: 'cc-by',
            },
          ],
        },
      ],
    };
    oldGraph.resources.push({
      id: 'sf1',
      citation: 'OpenAlex (2024). Governance of model documentation. OpenAlex: https://openalex.org/W999 (cc-by)',
      kind: 'source',
      sessionRefs: [session.id],
      origin: 'source-finder',
      provider: 'openalex',
      url: 'https://openalex.org/W999',
      license: 'cc-by',
      attribution: 'OpenAlex (CC0 metadata)',
    });
    section.resourceRefs = ['sf1'];

    const repairedMap = renderCourseMapFromGraph(oldGraph, { assessmentReferences: true });
    repairedMap.lessons[0].sections[0].supportingResources = 'Instructor worksheet for model documentation.';
    const rederived = deriveCourseGraphFromCourseMap(repairedMap);
    const preserved = preserveSourceProof(oldGraph, rederived);

    expect(preserved.resources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'sf1',
          origin: 'source-finder',
          provider: 'openalex',
          url: 'https://openalex.org/W999',
          license: 'cc-by',
        }),
      ]),
    );
    expect(preserved.sourceFinderMiniShard).toEqual(oldGraph.sourceFinderMiniShard);
    expect(preserved.sessions[0].sections[0].resourceRefs).toContain('sf1');
  });
});
