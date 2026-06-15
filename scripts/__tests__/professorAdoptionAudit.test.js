import { describe, expect, it } from 'vitest';

import { buildProfessorAdoptionDecision } from '../professor-adoption/decision.mjs';
import { buildProfessorAdoptionCoverage } from '../professor-adoption/coverage.mjs';
import { buildProfessorAdoptionLedger } from '../professor-adoption/reportWriter.mjs';
import { scoreProfessorAdoptionCase } from '../professor-adoption/scorer.mjs';
import { verifyProfessorAdoptionSource } from '../professor-adoption/sourceVerifier.mjs';
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

  it('builds a coverage dashboard for the 30-case gate', () => {
    const coverage = buildProfessorAdoptionCoverage(PROFESSOR_ADOPTION_MANIFESTS);

    expect(coverage.caseCount).toBe(30);
    expect(coverage.strategy.nextStableGateSize).toBe(30);
    expect(coverage.strategy.nextExtendedPoolTarget).toBe(60);
    expect(coverage.sourceHosts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'ocw.mit.edu' }),
        expect.objectContaining({ id: 'oyc.yale.edu' }),
      ]),
    );
    expect(coverage.strategy.recommendation).toMatch(/source verification/i);
  });

  it('verifies MIT OCW source provenance from official data.json metadata', async () => {
    const manifest = getProfessorAdoptionManifest('mit-1401-microeconomics');
    const fetchedUrls = [];
    const result = await verifyProfessorAdoptionSource(manifest, {
      fetchText: async (url) => {
        fetchedUrls.push(url);
        if (url === manifest.sourceUrl) {
          return '<main><h1>Principles of Microeconomics</h1><p>Lecture notes, problem sets, exams, supply, demand, externalities.</p></main>';
        }
        expect(url).toBe('https://ocw.mit.edu/courses/14-01-principles-of-microeconomics-fall-2023/data.json');
        return JSON.stringify({
          course_title: 'Principles of Microeconomics',
          primary_course_number: '14.01',
          course_description:
            'Supply and demand, market equilibrium, consumer theory, production and firms, monopoly, public goods, and externalities.',
          instructors: [{ title: 'Prof. Jonathan Gruber' }],
          learning_resource_types: [
            'Lecture Notes',
            'Lecture Videos',
            'Instructor Insights',
            'Problem Sets',
            'Problem Set Solutions',
            'Exams',
            'Exam Solutions',
          ],
          topics: [['Social Science', 'Economics', 'Microeconomics']],
        });
      },
    });

    expect(result.status).toBe('pass');
    expect(result.score).toBe(100);
    expect(fetchedUrls).toEqual([
      'https://ocw.mit.edu/courses/14-01-principles-of-microeconomics-fall-2023/data.json',
      manifest.sourceUrl,
    ]);
    expect(result.checkedUrl).toContain('data.json');
    expect(result.checkedUrl).toContain(manifest.sourceUrl);
    expect(result.verification.instructorMatches).toEqual(
      expect.arrayContaining([expect.objectContaining({ value: 'Jonathan Gruber', matched: true })]),
    );
  });

  it('combines explicit evidence URLs for multi-page public course sites', async () => {
    const manifest = getProfessorAdoptionManifest('berkeley-data8-fa25');
    const fetchedUrls = [];
    const result = await verifyProfessorAdoptionSource(manifest, {
      fetchText: async (url) => {
        fetchedUrls.push(url);
        if (url.endsWith('/staff/')) {
          return '<main><h1>Staff</h1><h2>Instructors</h2><h3>Jeremy Sanchez</h3></main>';
        }
        if (url.endsWith('/syllabus/')) {
          return '<main><h1>Syllabus</h1><p>Homework, exams, notebooks, datasets, and Python labs.</p></main>';
        }
        if (url.endsWith('/schedule/')) {
          return '<main><h1>Weekly Calendar & OH</h1><p>Office hours, projects, and deadlines.</p></main>';
        }
        return '<main><h1>UC Berkeley Data 8 Fall 2025</h1><nav>Staff Resources FAQ Textbook</nav></main>';
      },
    });

    expect(result.status).toBe('pass');
    expect(fetchedUrls).toEqual([manifest.sourceUrl, ...manifest.sourceEvidenceUrls]);
    expect(result.checkedUrl).toContain('/staff/');
    expect(result.verification.instructorMatches).toEqual([
      expect.objectContaining({ value: 'Jeremy Sanchez', matched: true }),
    ]);
  });

  it('turns unsupported source provenance into autonomous manifest repair evidence', async () => {
    const manifest = {
      ...getProfessorAdoptionManifest('mit-1401-microeconomics'),
      publicInstructorNames: ['Imaginary Teacher'],
    };
    const result = await verifyProfessorAdoptionSource(manifest, {
      fetchText: async () =>
        JSON.stringify({
          course_title: 'Principles of Microeconomics',
          course_description:
            'Supply and demand, market equilibrium, consumer theory, firms, monopoly, externalities, problem sets, exams.',
          instructors: [{ title: 'Prof. Jonathan Gruber' }],
          learning_resource_types: ['Lecture Notes', 'Problem Sets', 'Exams'],
        }),
    });

    expect(result.status).toBe('repair-required');
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          failureClass: 'source-instructor-mismatch',
          suspectedOwner: 'scripts/professor-adoption/sourceManifests.mjs',
          requiredRepairAction: 'repair-source-instructor-provenance',
        }),
      ]),
    );
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
