import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  PIPELINE_FEATURES,
  closeHybridPipelineAuditRuntime,
  loadHybridPipelineAuditRuntime,
} from '../scripts/hybridPipelineAudit.mjs';
import { collectProfessorFacingStrings, scoreProfessorAdoptionCase } from '../scripts/professor-adoption/scorer.mjs';
import { getProfessorAdoptionManifest } from '../scripts/professor-adoption/sourceManifests.mjs';

let runtime;

async function compileProfessorCase(caseId) {
  const manifest = getProfessorAdoptionManifest(caseId);
  const blueprint = runtime.buildCourseBlueprint(manifest.courseMap, {});
  const compiledFeatures = runtime.getBlueprintCompiledFeatures(PIPELINE_FEATURES);
  const compiled = runtime.compileBlueprintDeliverables(blueprint, compiledFeatures, { configMap: {} });
  const professorFacingText = collectProfessorFacingStrings(compiled).join(' ');
  const score = scoreProfessorAdoptionCase({ manifest, compiled, compiledFeatures });
  return { manifest, compiled, compiledFeatures, professorFacingText, score };
}

describe('v0.15.8 professor adoption compiler smoke cases', () => {
  beforeAll(async () => {
    runtime = await loadHybridPipelineAuditRuntime();
  });

  afterAll(async () => {
    await closeHybridPipelineAuditRuntime(runtime);
  });

  it('keeps MIT 18.06 math output quantitative and source-specific', async () => {
    const { professorFacingText, score } = await compileProfessorCase('mit-1806-linear-algebra');

    expect(score.status).toBe('pass');
    expect(score.score).toBe(100);
    expect(professorFacingText).toMatch(/\b(problem[-\s]?set|worked solution|calculation|exam|proof)\b/i);
    expect(professorFacingText).toMatch(/\b(matrix|matrices|vector|vector space|eigenvalue|row reduction)\b/i);
    expect(professorFacingText).not.toMatch(/\b(course evidence|course artifact|generic evidence)\b/i);
  });

  it('keeps Berkeley Data 8 output in the data-course and large-course operations lane', async () => {
    const { professorFacingText, score } = await compileProfessorCase('berkeley-data8-fa25');

    expect(score.status).toBe('pass');
    expect(score.score).toBe(100);
    expect(professorFacingText).toMatch(/\b(notebook|dataset|Python|lab|homework|project|visualization)\b/i);
    expect(professorFacingText).toMatch(/\b(office hours|support|deadline|staff|submission|academic honesty)\b/i);
    expect(professorFacingText).not.toMatch(
      /\b(?:pipette|wet lab|lab coat|(?:physical|biological|tissue|rock|mineral) specimens?)\b/i,
    );
  });

  it('keeps Yale poetry output grounded in close reading and writing work products', async () => {
    const { professorFacingText, score } = await compileProfessorCase('yale-engl310-poetry');

    expect(score.status).toBe('pass');
    expect(score.score).toBe(100);
    expect(professorFacingText).toMatch(/\b(poem|poetry|passage|close reading|interpretive claim|paper|essay)\b/i);
    expect(professorFacingText).not.toMatch(/\b(course evidence|course artifact|generic evidence)\b/i);
  });
});
