import { describe, expect, it } from 'vitest';

import {
  collectRejectedLearnerSourceEvidence,
  containsRejectedLearnerSourceEvidence,
  quarantineRejectedLearnerContent,
} from '../sourceEvidenceAdmission.js';

function fixture() {
  const citation = {
    displayTitle: 'PyGMT: Bridging Python and the Generic Mapping Tools for Geospatial Visualization and Analysis',
    sourceUrl: 'https://doi.org/10.1029/2026GC013105',
    evidence: 'PyGMT is a Python interface to the Generic Mapping Tools for Earth, ocean, and planetary visualization.',
    provider: 'doaj',
    conceptLinks: [{ label: 'geospatial visualization' }],
  };
  const courseGraph = {
    course: { name: 'Python for Public Policy Analysis' },
    sessions: [{ title: 'Lesson 1: Python Data Types and Expressions' }],
    enrichmentOverlay: {
      lessonContent: {
        'lesson-1': {
          enrichmentSource: 'scion-source-researched',
          conceptProvenance: { citations: [citation] },
        },
      },
    },
  };
  const courseMap = {
    courseName: 'Python for Public Policy Analysis',
    lessons: [
      {
        title: 'Lesson 1: Python Data Types and Expressions',
        sections: [
          {
            learningObjectives: 'Explain Python data types with a policy dataset.',
            syncActivities: 'Compare integer and float values. Audit one PyGMT visualization.',
          },
        ],
      },
    ],
  };
  return { citation, courseGraph, courseMap };
}

describe('learner source-evidence admission boundary', () => {
  it('fails closed on a coarse lesson overlay when one citation is course-aware weak', () => {
    const { courseGraph, courseMap } = fixture();
    const quarantine = collectRejectedLearnerSourceEvidence({ courseMap, courseGraph });
    expect([...quarantine.rejectedLessonScopes]).toEqual(['lesson-1']);
    expect([...quarantine.markers]).toContain('pygmt');
    expect(containsRejectedLearnerSourceEvidence('Use PyGMT to draw the policy result.', quarantine)).toBe(true);
    expect(containsRejectedLearnerSourceEvidence('https://doi. org/10.1029/2026GC013105', quarantine)).toBe(true);
  });

  it('removes a malformed source-list tail by rejected URL identity even when the title is gone', () => {
    const { courseGraph, courseMap } = fixture();
    const quarantine = collectRejectedLearnerSourceEvidence({ courseMap, courseGraph });
    const learnerSourceList = {
      entries: [
        {
          citation: '0 (DOAJ article metadata)',
          url: 'https://doi. org/10.1029/2026GC013105',
        },
      ],
    };

    const repaired = quarantineRejectedLearnerContent(learnerSourceList, quarantine);
    expect(repaired.changed).toBe(true);
    expect(repaired.data.entries).toEqual([]);
  });

  it('removes the rejected projection from learner authority without mutating the source audit graph', () => {
    const { citation, courseGraph, courseMap } = fixture();
    const quarantine = collectRejectedLearnerSourceEvidence({ courseMap, courseGraph });
    const repaired = quarantineRejectedLearnerContent(courseMap, quarantine);
    expect(repaired.changed).toBe(true);
    expect(repaired.data.lessons[0].sections[0].syncActivities).toBe('Compare integer and float values.');
    expect(courseGraph.enrichmentOverlay.lessonContent['lesson-1'].conceptProvenance.citations[0]).toBe(citation);
    expect(
      courseGraph.enrichmentOverlay.lessonContent['lesson-1'].conceptProvenance.citations[0].displayTitle,
    ).toContain('PyGMT');
  });
});
