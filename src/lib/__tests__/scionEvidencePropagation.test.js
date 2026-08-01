import { describe, expect, it } from 'vitest';

import { buildCourseBlueprint, compileBlueprintDeliverables } from '../courseBlueprintCompiler';
import { measurePackageGroundedFraction } from '../quality/groundedFraction';

function accessibilityBlueprint() {
  const blueprint = buildCourseBlueprint({
    courseName: 'Digital Accessibility for Product Teams',
    semester: 'Fall 2026',
    lessons: [
      {
        title: 'Lesson 1: Accessible Forms',
        sections: [
          {
            topicSection: 'Accessible forms; explicit labels; validation',
            learningGoals: 'Explain how accessible form structure changes a product decision.',
            learningObjectives: 'Evaluate a form and justify one evidence-based remediation.',
            weeklyAssessments: 'Accessible forms remediation brief',
            asyncActivities: 'Inspect an accessible form tutorial and annotate two implementation claims.',
            syncActivities: 'Compare two form implementations and defend the stronger one.',
            supportingResources: 'W3C Accessible Forms tutorial and Labels tutorial',
            evaluateDesign: 'Score source accuracy, remediation logic, and stated evidence limits.',
          },
        ],
      },
    ],
  });
  blueprint.lessons[0].enrichment = {
    enrichmentSource: 'algi-researched',
    conceptProvenance: {
      source: 'algi-researched',
      fullyAnchored: true,
      citations: [
        {
          displayTitle: 'W3C Accessible Forms Tutorial',
          sourceUrl: 'https://www.w3.org/WAI/tutorials/forms/',
          license: 'W3C permissive license',
        },
        {
          displayTitle: 'W3C Labels Tutorial',
          sourceUrl: 'https://www.w3.org/WAI/tutorials/forms/labels/',
          license: 'W3C permissive license',
        },
      ],
    },
    kernel: {
      facts: [
        'Explicit labels are better supported by assistive technology.',
        'People with cognitive disabilities can better understand a form when instructions and feedback are clear.',
        'Data still needs to be validated on the server side.',
        'Labels should describe the purpose of their form control.',
      ],
      scenario: {
        materials: 'the source-backed case example, related claim, and claim-boundary note',
      },
    },
    keyTerms: [
      {
        term: 'Accessible forms',
        definition: 'Accessible forms are easier to use for everyone, including people with disabilities.',
        example: 'Clear instructions and feedback help people understand how to complete a form.',
        misconception: 'A visible placeholder is always an adequate label.',
        correction: 'A persistent programmatic label identifies the control when placeholder text disappears.',
      },
    ],
    studyGuide: {
      summary:
        'Accessible forms are easier to use for everyone, including people with disabilities. Accessible forms are easier to use for everyone, including people with disabilities. Connect Accessible forms to the source-backed case example, related claim, and claim-boundary note.',
      reviewStrategy:
        'Rehearse Accessible forms, then test the explanation against the source-backed case example, related claim, and claim-boundary note.',
    },
  };
  return blueprint;
}

describe('Scion canonical evidence propagation', () => {
  it('routes one admitted evidence packet into every weak professor-facing surface', () => {
    const compiled = compileBlueprintDeliverables(accessibilityBlueprint(), [
      'syllabus',
      'lessonPlans',
      'rubrics',
      'studyGuides',
    ]);
    const plan = compiled.lessonPlans.lessonPlans[0];
    const rubric = compiled.rubrics.rubrics[0];
    const guide = compiled.studyGuides.studyGuides[0];

    expect(plan.sourceEvidenceBrief).toEqual(rubric.sourceEvidenceBrief);
    expect(rubric.sourceEvidenceBrief).toEqual(guide.sourceEvidenceBrief);
    expect(guide.sourceEvidenceBrief.claims).toHaveLength(4);
    expect(guide.sourceEvidenceBrief.sources).toEqual([
      expect.objectContaining({
        title: 'W3C Accessible Forms Tutorial',
        url: 'https://www.w3.org/WAI/tutorials/forms/',
      }),
      expect.objectContaining({
        title: 'W3C Labels Tutorial',
        url: 'https://www.w3.org/WAI/tutorials/forms/labels/',
      }),
    ]);
    expect(compiled.syllabus.syllabus.courseDescription).toContain(
      'Explicit labels are better supported by assistive technology',
    );
  });

  it('deduplicates summaries and replaces generic evidence placeholders with distinct admitted claims', () => {
    const compiled = compileBlueprintDeliverables(accessibilityBlueprint(), ['studyGuides']);
    const guide = compiled.studyGuides.studyGuides[0];
    const summary = guide.summary.toLowerCase();
    const repeatedClaim = 'accessible forms are easier to use for everyone, including people with disabilities';

    expect(summary.split(repeatedClaim)).toHaveLength(2);
    expect(summary).toContain('explicit labels are better supported by assistive technology');
    expect(guide.sourceEvidenceBrief.claims).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Explicit labels'),
        expect.stringContaining('People with cognitive disabilities'),
      ]),
    );
    expect(guide.reviewQuestions[0].question).toContain('Compare Source Claim 1 and Source Claim 2');
    expect(guide.practiceActivities[0]).toContain('Source Claim 1 and Source Claim 2');
    expect(JSON.stringify(guide)).not.toMatch(
      /\bsource-backed case example\b|\brelated claim\b|\bclaim-boundary note\b/i,
    );
  });

  it('raises measured grounding only through the admitted evidence subtree', () => {
    const compiled = compileBlueprintDeliverables(accessibilityBlueprint(), ['lessonPlans', 'rubrics', 'studyGuides']);
    const metrics = measurePackageGroundedFraction(compiled);

    expect(metrics.perFeature.lessonPlans.groundedBytes).toBeGreaterThan(300);
    expect(metrics.perFeature.rubrics.groundedBytes).toBeGreaterThan(300);
    expect(metrics.perFeature.studyGuides.groundedBytes).toBeGreaterThan(300);
    expect(metrics.perFeature.lessonPlans.fraction).toBeGreaterThan(0.01);
    expect(metrics.perFeature.rubrics.fraction).toBeGreaterThan(0.01);
    expect(metrics.perFeature.studyGuides.fraction).toBeGreaterThan(0.01);
    expect(metrics.overall.groundedBytes).toBeLessThan(metrics.overall.totalBytes);
  });
});
