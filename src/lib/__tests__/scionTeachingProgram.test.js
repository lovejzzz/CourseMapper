import { describe, expect, it } from 'vitest';
import { compileTeachingProgram } from '../compilerTeachingProgram.js';
import { buildCourseBlueprint, compileBlueprintDeliverables } from '../courseBlueprintCompiler.js';

describe('compiler teaching programs', () => {
  const claims = [
    'The sample proportion is 16/20 = 0.80 = 80%.',
    'Night-shift workers could not attend.',
    'These data alone do not establish a population rate.',
  ];
  it('generates exact complementary arithmetic without inventing another sample', () => {
    const p = compileTeachingProgram({ admitted: true, sourceEvidenceBrief: { claims } });
    const item = p.units.find((unit) => unit.kind === 'derived-calculation');
    expect(item.answer).toContain('4/20 = 0.20 = 20%');
    expect(item.answer).not.toContain('0.19999');
    expect(item.sourceClaims).toEqual([claims[0]]);
    expect(p.units.find((unit) => unit.kind === 'source-boundary').answer).toContain('Night-shift workers');
    expect(compileTeachingProgram({ admitted: false, sourceEvidenceBrief: { claims } })).toBeNull();
  });
  it('keeps a stronger authored task when the evidence also contains an incidental proportion', () => {
    const p = compileTeachingProgram({
      admitted: true,
      sourceEvidenceBrief: { claims },
      workedExample: {
        problem: 'Evaluate how volunteering affects the population claim.',
        steps: ['Identify who chose to join.', 'Compare that group with the target population.'],
        result: 'The observed rate alone does not establish the population rate.',
      },
    });
    expect(p.units.some((unit) => unit.kind === 'derived-calculation')).toBe(false);
    expect(p.units[0].question).toContain('Evaluate how volunteering');
    expect(p.units[0].answer).toContain('does not establish the population rate');
  });
  it('changes question identity and its answer together when source numbers change', () => {
    const a = compileTeachingProgram({ admitted: true, sourceEvidenceBrief: { claims } });
    const b = compileTeachingProgram({
      admitted: true,
      sourceEvidenceBrief: { claims: ['The proportion is 3/8 = 0.375 = 37.5%.'] },
    });
    expect(a.units[0].id).not.toBe(b.units[0].id);
    expect(b.units.find((unit) => unit.kind === 'derived-calculation').answer).toContain('5/8 = 0.625 = 62.5%');
    expect(JSON.stringify(b)).not.toContain('16/20');
  });
  it('works with admitted conceptual knowledge outside arithmetic and refuses empty knowledge', () => {
    const p = compileTeachingProgram({
      admitted: true,
      keyTerms: [{ term: 'Corroboration', definition: 'Checking an account against independent evidence.' }],
    });
    expect(p.units[0].answer).toBe('Checking an account against independent evidence.');
    expect(compileTeachingProgram({ admitted: true, keyTerms: [{ term: 'History' }] })).toBeNull();
  });
  it('uses facts for evidence practice without treating projected fact labels as definitions', () => {
    const p = compileTeachingProgram({
      admitted: true,
      sourceEvidenceBrief: { claims },
      keyTerms: [
        { term: 'Worked calculation: 16/20', definition: claims[0], source: 'fact-ledger-projection' },
        { term: 'sample completion proportion', definition: claims[0], source: 'fact-subject-projection' },
        { term: 'Proportion', definition: 'The ratio of a part to its whole.', source: 'instructor-supplied' },
      ],
    });
    expect(p.units.filter((unit) => unit.kind === 'concept-retrieval').map((unit) => unit.answer)).toEqual([
      'The ratio of a part to its whole.',
    ]);
    expect(p.units.find((unit) => unit.kind === 'calculation').sourceClaims).toEqual([claims[0]]);
  });
  it('reads the admitted correction field and keeps source limits when practice reaches its cap', () => {
    const keyTerms = ['Proportion', 'Sample', 'Population'].map((term) => ({
      term,
      definition: `The supplied definition of ${term}.`,
      misconception: `A misleading claim about ${term}.`,
      correction: `The supplied correction for ${term}.`,
    }));
    const p = compileTeachingProgram({ admitted: true, sourceEvidenceBrief: { claims }, keyTerms });
    expect(p.units).toHaveLength(8);
    expect(p.units.some((u) => u.answer === keyTerms[0].correction)).toBe(true);
    expect(p.units.at(-1).kind).toBe('source-boundary');
    expect(p.units.at(-1).answer).toContain('do not establish a population rate');
  });
  it('compiles the same complete practice unit into student and teacher materials', () => {
    const map = {
      courseName: 'Sample proportions',
      lessons: [
        {
          title: 'Sample proportion calculation',
          sections: [
            { topicSection: 'Sample proportion', learningObjectives: 'Calculate the observed sample proportion.' },
          ],
        },
      ],
    };
    const blueprint = buildCourseBlueprint(map, { sessionMinutes: 45, instructorProvidedFacts: claims });
    blueprint.lessons[0].enrichment = {
      studyGuide: { summary: claims[0] },
      assignmentCore: { taskDescription: 'Compare two solution paths from the problem record.' },
      surfaceFallbacks: ['assignmentCore', 'studyGuide'],
      keyTerms: [
        { term: 'Worked calculation: 16/20', definition: claims[0], source: 'fact-ledger-projection', tier: 1 },
        { term: 'sample proportion', definition: claims[0], source: 'fact-subject-projection', tier: 1 },
      ],
      kernel: {
        facts: claims,
        provenance: {
          source: 'compiler-owned-exact-source-ledger',
          authority: 'instructor-supplied',
          copiedFactsVerbatim: true,
          factCount: claims.length,
        },
      },
    };
    const result = compileBlueprintDeliverables(blueprint, ['studyGuides', 'lessonPlans'], {
      skipPrepareBlueprint: true,
      skipCompilerContractCheck: true,
    });
    const guide = result.studyGuides.studyGuides[0];
    const teacher = result.lessonPlans.lessonPlans[0];
    const question = guide.reviewQuestions.find((q) => q.practiceId === teacher.formativeCheck.practiceId);
    expect(question).toBeDefined();
    expect(question.answer).toBe(teacher.formativeCheck.expectedAnswer);
    expect(question.question).toBe(teacher.formativeCheck.prompt);
    expect(guide.reviewQuestions.every((q) => q.answer && q.successCriteria.length)).toBe(true);
    expect(guide.reviewQuestions.filter((q) => q.practiceKind !== 'independent-transfer')).toHaveLength(6);
    expect(guide.reviewQuestions.filter((q) => q.practiceKind === 'independent-transfer')).toHaveLength(1);
    expect(guide.teachingProgram.units.some((unit) => unit.kind === 'concept-retrieval')).toBe(false);
    expect(guide.objectivePractice.join(' ')).not.toContain('two solution paths');
    expect(guide.keyTerms).toEqual([]);
    expect(guide.summary).toContain('0.80');
    expect(guide.summary).toContain('same proportion');
    expect(teacher.duration).toBe('45 minutes');
  });
});
