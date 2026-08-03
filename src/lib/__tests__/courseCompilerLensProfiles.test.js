import { describe, expect, it } from 'vitest';

import { buildCourseBlueprint, compileBlueprintDeliverables } from '../courseBlueprintCompiler.js';
import { resolvePreciseDisciplineLens } from '../courseCompilerLensProfiles.js';
import { buildDeliverableDocxBlob } from '../exporters/bulkDocxExporter.js';
import { extractPackage } from '../quality/deepQualityGrader.js';
import { createMemoryFileProvider } from '../quality/fileProviders.js';

const PRECISE_CASES = [
  ['Community Oral History Methods', 'oral-history fieldwork and interpretation'],
  ['Marine Biology Field Methods', 'marine field ecology'],
  ['Corporate Tax Strategy', 'corporate taxation and transaction planning'],
  ['Baroque Counterpoint and Analysis', 'counterpoint and score analysis'],
  ['Applied Epidemiology', 'applied epidemiology'],
  ['Civil Procedure', 'civil procedure and litigation analysis'],
  ['Materials Science Laboratory', 'materials science laboratory'],
  ['Second-Language Pedagogy', 'second-language teaching practice'],
  ['Urban Planning Studio', 'urban planning studio'],
  ['Clinical and Medical Ethics', 'clinical ethics deliberation'],
  ['Database Systems', 'database design and implementation'],
  ['Modern Art History', 'modern art-historical interpretation'],
  ['Exercise and Sports Physiology', 'exercise physiology and performance analysis'],
];

function courseMap(sections) {
  return {
    courseName: 'Corporate Tax Strategy',
    semester: 'Fall 2026',
    lessons: [
      {
        title: 'Week 1: Corporate Taxable Income',
        sections,
      },
    ],
  };
}

describe('precise discipline lenses', () => {
  it.each(PRECISE_CASES)('maps %s to %s', (courseName, domain) => {
    expect(resolvePreciseDisciplineLens(courseName)).toMatchObject({ domain });
  });

  it('uses the discipline-aware reasoning frame only for a sparse source map', () => {
    const sparse = compileBlueprintDeliverables(buildCourseBlueprint(courseMap([{}])), [
      'lessonPlans',
      'slideDecks',
      'quizBank',
    ]);
    const sparseText = JSON.stringify(sparse);

    expect(sparseText).toContain('statutory, transaction, and tax-calculation evidence');
    expect(sparseText).toContain('tax-position decision');
    expect(sparseText).not.toContain('professional decision');
  });

  it('preserves the established content-slide frame when the instructor supplied a rich lesson row', () => {
    const rich = compileBlueprintDeliverables(
      buildCourseBlueprint(
        courseMap([
          {
            learningGoals: 'Connect taxable income rules to a defensible transaction recommendation.',
            topicSection: 'Taxable income, exclusions, deductions, basis, and book-tax differences',
            learningObjectives: 'Calculate corporate taxable income and explain one book-tax adjustment.',
            weeklyAssessments: 'Taxable income workpaper with adjustment notes and recommendation.',
            asyncActivities: 'Annotate a sample return and identify three book-tax differences.',
            syncActivities: 'Workpaper clinic using a transaction packet and calculation check.',
            supportingResources: 'Corporate tax code excerpts; sample return; workpaper template',
          },
        ]),
      ),
      ['slideDecks'],
    );
    const contentSlide = rich.slideDecks.decks[0].slides.find((slide) =>
      slide.title.startsWith('Evidence that can actually support'),
    );

    expect(contentSlide.bullets[0]).toContain('focuses attention on evidence quality');
  });

  it('bounds full lesson-focus repetition throughout a compiled lesson plan', async () => {
    const focus = 'Watershed Governance and Public Accountability';
    const blueprint = buildCourseBlueprint({
      courseName: 'Civic Watershed Studio',
      semester: 'Spring 2027',
      lessons: [
        {
          title: `Lesson 1: ${focus}`,
          sections: [
            {
              topicSection: focus,
              learningObjectives: `Evaluate ${focus} evidence and revise a public recommendation.`,
              weeklyAssessments: 'Public watershed evidence brief',
              asyncActivities: `Annotate one ${focus} source and identify its limit.`,
              syncActivities: `Compare two ${focus} claims and revise the brief.`,
              supportingResources: `${focus} source packet`,
            },
          ],
        },
      ],
    });

    const plan = compileBlueprintDeliverables(blueprint, ['lessonPlans']).lessonPlans.lessonPlans[0];
    const blob = await buildDeliverableDocxBlob('lessonPlans', { lessonPlans: [plan] }, 'Civic Watershed Studio');
    const rendered = await extractPackage(
      createMemoryFileProvider({ 'Lesson Plans/Lesson 01 - Watershed Governance.docx': blob }),
    );
    const text = rendered.files[0].text;

    expect((text.match(new RegExp(focus, 'gi')) || []).length).toBeLessThan(12);
  });
});
