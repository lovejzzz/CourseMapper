import { describe, expect, it } from 'vitest';

import { buildProfessorAdoptionDecision } from '../professor-adoption/decision.mjs';
import { buildProfessorAdoptionLedger } from '../professor-adoption/reportWriter.mjs';
import { scoreProfessorAdoptionCase } from '../professor-adoption/scorer.mjs';
import {
  PROFESSOR_ADOPTION_MANIFESTS,
  PROFESSOR_ADOPTION_SMOKE_CASE_IDS,
  getProfessorAdoptionManifest,
  selectProfessorAdoptionManifests,
  validateProfessorAdoptionManifest,
} from '../professor-adoption/sourceManifests.mjs';

describe('professor adoption audit contracts', () => {
  it('keeps the public-source manifest pack valid and selects the smoke profile deterministically', () => {
    expect(PROFESSOR_ADOPTION_MANIFESTS).toHaveLength(30);
    for (const manifest of PROFESSOR_ADOPTION_MANIFESTS) {
      expect(validateProfessorAdoptionManifest(manifest)).toMatchObject({ valid: true, blockers: [] });
      expect(manifest.sourceUrl).toMatch(/^https?:\/\//);
      expect(manifest.publicInstructorNames.length).toBeGreaterThan(0);
      expect(manifest.primaryStudentWorkProducts.length).toBeGreaterThan(0);
      expect(manifest.requiredSignalGroups.length).toBeGreaterThan(0);
    }

    expect(selectProfessorAdoptionManifests({ profile: 'smoke' }).map((manifest) => manifest.id)).toEqual(
      PROFESSOR_ADOPTION_SMOKE_CASE_IDS,
    );
    expect(selectProfessorAdoptionManifests({ profile: 'full' })).toHaveLength(30);
  });

  it('treats professor approval language as a hard blocker, not a benchmark pass', () => {
    const manifest = getProfessorAdoptionManifest('mit-1806-linear-algebra');
    const result = scoreProfessorAdoptionCase({
      manifest,
      compiledFeatures: ['syllabus'],
      compiled: {
        syllabus: {
          syllabus: {
            courseTitle: 'Linear Algebra',
            courseDescription:
              'Professors approved this package. Students solve matrix, vector, eigenvalue, exam, proof, and problem set tasks.',
            assessmentPlan: 'Assessment includes problem sets, exams, feedback, and support.',
            officeHours: 'Office hours and communication support are visible.',
          },
        },
      },
    });

    expect(result.status).toBe('blocked');
    expect(result.hardBlockerCount).toBeGreaterThan(0);
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          failureClass: 'unsupported-approval-claim',
          hardBlocker: true,
          severity: 'P0',
        }),
      ]),
    );
  });

  it('builds autonomous repair actions without human interpretation of the ledger', () => {
    const finding = {
      dimension: 'packageCraft',
      severity: 'P2',
      scoreImpact: 3,
      artifact: 'compiled package',
      sourceExpectation: 'Repeated template phrases should not dominate professor-facing artifacts.',
      observedOutput: '46 repeats of a stock phrase.',
      failureClass: 'generic-template-leak',
      suspectedOwner: 'src/lib/courseBlueprintCompiler.js',
      requiredRepairAction: 'repair-repetitive-template-phrasing',
      acceptanceCriteria: ['Repeated eight-word template phrases stay below 35 occurrences per benchmark case.'],
      proofCommands: ['npm run audit:professor-adoption:smoke -- --case fake-case'],
      message: 'fake-case contains repeated templated phrasing.',
      evidence: 'stock phrase',
    };
    const results = [
      {
        caseId: 'fake-case',
        status: 'repair-required',
        score: 97,
        sourceUrl: 'https://example.edu/course',
        findings: [finding],
      },
    ];
    const decision = buildProfessorAdoptionDecision({
      profile: 'smoke',
      summary: { caseCount: 1, status: 'repair-required' },
      results,
    });
    const [ledgerRow] = buildProfessorAdoptionLedger({ results });

    expect(decision.requiresHumanInterpretation).toBe(false);
    expect(decision.nextAction).toBe('repair-code');
    expect(decision.actions.required[0]).toMatchObject({
      id: 'repair-repetitive-template-phrasing',
      targetArea: 'src/lib/courseBlueprintCompiler.js',
      status: 'required',
    });
    expect(decision.actions.required[0].acceptanceCriteria).toContain(
      'Repeated eight-word template phrases stay below 35 occurrences per benchmark case.',
    );
    expect(decision.actions.required[0].commands).toContain(
      'npm run audit:professor-adoption:smoke -- --case fake-case',
    );
    expect(ledgerRow).toMatchObject({
      caseId: 'fake-case',
      suspectedOwner: 'src/lib/courseBlueprintCompiler.js',
      requiredRepairAction: 'repair-repetitive-template-phrasing',
    });
    expect(ledgerRow.acceptanceCriteria).toHaveLength(1);
    expect(ledgerRow.proofCommands).toHaveLength(1);
  });
});
