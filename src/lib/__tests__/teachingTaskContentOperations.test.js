import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { explicitEvidenceAnalysisTask } from '../teachingTaskEvidenceOperations.js';
import {
  buildCourseBlueprint,
  compileBlueprintDeliverables,
  BLUEPRINT_COMPILE_CONTEXT,
  reconcileCourseMapWithBlueprintSemanticAdmission,
} from '../courseBlueprintCompiler.js';
import { ACCEPTANCE_FEATURES, evaluateAcceptanceOutputs } from '../../../scripts/benchmarks/classroomAcceptance.mjs';

describe('evidence operations reject unsupported inferences', () => {
  it('does not claim that an unrelated narrated action refutes character speech', () => {
    expect(
      explicitEvidenceAnalysisTask(
        [
          'A character says: Nobody in this town ever helps a stranger.',
          'Another resident picks a flower in her own garden.',
          'There is no narrator statement endorsing the character.',
        ],
        'Compare the character statement with narrative evidence.',
      ),
    ).toBeNull();
  });
  it('does not misread the letters all in small as a universal seller claim', () => {
    expect(
      explicitEvidenceAnalysisTask(
        [
          'An advertisement offers a small filter for sale.',
          'The record describes its packaging but says it was not tested.',
        ],
        'Interpret the evidence and the seller claim.',
      ),
    ).toBeNull();
  });
  it('does not select a correct date from conflicting same-event reports', () => {
    const result = explicitEvidenceAnalysisTask(
      [
        'Record A dates the first public opening to 1921.',
        'Record B dates the same event to 1923; neither record is corroborated.',
      ],
      'Compare the dates and justify the source conclusion.',
    );
    expect(result.answer).toContain('Neither account is established as correct');
    expect(result.answer).toContain('proposed research');
  });
});

// Development packets are exposed regression data. Held-out packets are never
// loaded by the normal test command and are evaluated after a recorded freeze.
const entries = JSON.parse(fs.readFileSync('benchmarks/classroom/v2/manifest.json', 'utf8')).cases.filter(
  (entry) => entry.split === 'development',
);
describe('production projection acceptance across the development packets', () => {
  it.each(entries)('$id has aligned actual materials, keys, sources and clocks', (entry) => {
    const fixture = JSON.parse(fs.readFileSync(`benchmarks/classroom/v2/cases/${entry.id}.json`, 'utf8'));
    const map = {
      courseName: fixture.request,
      lessons: [
        {
          title: fixture.request,
          sections: [
            {
              topicSection: fixture.request,
              learningObjectives: fixture.request,
              weeklyAssessments:
                fixture.language === 'zh'
                  ? '根据所给材料完成具体任务，提交推理过程。'
                  : 'A reasoned response using the supplied record.',
            },
          ],
        },
      ],
    };
    const blueprint = buildCourseBlueprint(map, {
      sourceBrief: `${fixture.request}\n${fixture.sessionMinutes} minutes.\nSource facts:\n${fixture.sources.map((source, index) => `${index + 1}. ${source}`).join('\n')}`,
      sessionMinutes: fixture.sessionMinutes,
      instructorProvidedFacts: fixture.sources,
    });
    const compiled = compileBlueprintDeliverables(
      blueprint,
      ACCEPTANCE_FEATURES.filter((feature) => feature !== 'courseMap'),
    );
    const context = compiled[BLUEPRINT_COMPILE_CONTEXT];
    const outputs = { courseMap: reconcileCourseMapWithBlueprintSemanticAdmission(map, context), ...compiled };
    const report = evaluateAcceptanceOutputs(
      fixture,
      outputs,
      context.lessons.map((lesson) => lesson.teachingTask).filter(Boolean),
    );
    expect(report.failures).toEqual([]);
  });
});
