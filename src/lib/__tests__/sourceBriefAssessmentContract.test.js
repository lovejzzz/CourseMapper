import { describe, expect, it } from 'vitest';

import {
  extractSourceBriefAssessmentContract,
  requiredAssessmentComponents,
} from '../sourceBriefAssessmentContract.js';

const lessons = [
  'Logic Models and Evaluation Questions',
  'Stakeholder Mapping and Ethical Practice',
  'Process Indicators and Implementation Fidelity',
  'Outcome Indicators and Measurement Validity',
  'Mixed-Method Analysis and Triangulation',
  'Communicating Findings and Improvement Recommendations',
].map((title, index) => ({ title: `Lesson ${index + 1}: ${title}`, sections: [{ topicSection: title }] }));

describe('source brief assessment contract', () => {
  it('binds named artifacts to the matching lesson and keeps final portfolio components together', () => {
    const brief =
      'Include a lesson-specific applied exercise every week, a stakeholder memo, an indicator matrix, and a final evaluation portfolio with an executive brief, logic model, analysis plan, and recommendations. Ensure each assessment has explicit requirements and a usable rubric.';

    const contract = extractSourceBriefAssessmentContract(brief, lessons);

    expect(contract.assessments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ lessonNumber: 2, title: 'Stakeholder memo' }),
        expect.objectContaining({ lessonNumber: 3, title: 'Indicator matrix' }),
        expect.objectContaining({
          lessonNumber: 6,
          title: 'Final evaluation portfolio',
          requiredComponents: ['Executive brief', 'Logic model', 'Analysis plan', 'Recommendations'],
        }),
      ]),
    );
    const final = contract.assessments.find((assessment) => assessment.lessonNumber === 6);
    expect(final.displayTitle).toMatch(
      /required components: executive brief, logic model, analysis plan, and recommendations/i,
    );
    expect(requiredAssessmentComponents(final.displayTitle)).toEqual([
      'Executive brief',
      'Logic model',
      'Analysis plan',
      'Recommendations',
    ]);
  });

  it('does not reinterpret generic exercises and readings as assessment artifacts', () => {
    const contract = extractSourceBriefAssessmentContract(
      'Include a lesson-specific applied exercise every week and short evidence-based readings where appropriate.',
      lessons,
    );
    expect(contract).toBeNull();
  });
});
