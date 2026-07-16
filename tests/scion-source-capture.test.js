import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  SOURCE_ATOM_SCHEMA,
  SOURCE_RECOVERY_SCHEMA,
  assessSourceAtomResponse,
  buildSourceCaptureProject,
  buildSourceRecoveryPrompt,
  compileSourceAtomResponse,
  materializeSourceCaptureCampaign,
  sourceCaptureSha256,
  sourceTextIssues,
  summarizeSourceCaptureBurden,
  verifySourceCaptureProject,
} from '../scripts/lib/scionSourceCapture.mjs';
import { scionCourseInputSha256 } from '../scripts/lib/scionCourseGroup.mjs';

const repoRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));

function fileSha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function validResponse() {
  return {
    mcItems: [
      {
        q: 'After x is assigned 3 and y is assigned x + 2, x changes to 100. What value remains in y?',
        op: ['The value 5', 'The value 100', 'The value 102', 'The value 3'],
        ai: 0,
        ex: 'Assignment stores the value computed at that moment, so changing x later does not recompute y.',
        sourceFactIndexes: [0, 1],
      },
      {
        q: 'When the same variable name appears on both sides of an assignment, which operation happens first?',
        op: [
          'The right side is evaluated first',
          'Both sides are compared for equality',
          'The name becomes a fixed constant',
          'The statement repeats until equal',
        ],
        ai: 0,
        ex: 'Python evaluates the right side before binding its result to the name on the left; it is not an equality claim.',
        sourceFactIndexes: [0, 2],
      },
    ],
    keyTerms: [
      {
        tr: 'Assignment statement',
        df: 'Python first evaluates an expression and then binds the resulting value to the name written on the left side.',
        eg: 'Running total = subtotal + tax computes the sum before storing it under total.',
        mi: 'A learner may treat the equals sign as proof that both sides are permanently identical.',
        cx: 'Read the statement as an ordered instruction: compute the right side, then store that result on the left.',
        sourceFactIndexes: [0, 1],
      },
      {
        tr: 'Variable binding',
        df: 'A program name refers to the value produced by its most recently executed assignment rather than preserving an unevaluated formula.',
        eg: 'If rate is 4 when cost = rate * 2 runs, cost keeps 8 after rate later changes.',
        mi: 'A learner may expect every dependent variable to update automatically whenever an earlier name changes.',
        cx: 'Re-run the assignment when a new value is needed; prior assignments do not behave like spreadsheet formulas.',
        sourceFactIndexes: [0, 1],
      },
    ],
  };
}

describe('Scion source-grounded atom capture', () => {
  it('materializes eight distinct, hash-bound groups across four domains', async () => {
    const campaign = await materializeSourceCaptureCampaign();
    expect(campaign.summary.groups).toBe(8);
    expect(campaign.summary.prompts).toBe(24);
    expect(campaign.summary.expectedCandidates).toBe(96);
    expect(new Set(campaign.groups.map((group) => group.courseGroupSha256)).size).toBe(8);
    expect(Object.values(campaign.summary.domainGroupCounts)).toEqual([2, 2, 2, 2]);
    for (const group of campaign.groups) {
      expect(group.courseInputSha256).toBe(
        scionCourseInputSha256({
          promptText: group.courseBrief,
          fileNames: group.fileNames,
          sourcePacketSha256: group.sourcePacketSha256,
        }),
      );
    }
  });

  it('materializes the additive v0.16.17 campaign without rewriting the retained campaign', async () => {
    const retained = await materializeSourceCaptureCampaign({ cwd: repoRoot });
    const expansion = await materializeSourceCaptureCampaign({
      cwd: repoRoot,
      manifestPath: 'evaluation/scion-source-capture-expansion-v0.16.17.json',
    });
    expect(expansion.summary).toMatchObject({
      groups: 4,
      prompts: 24,
      expectedCandidates: 96,
      domainGroupCounts: {
        'computer-science': 1,
        geology: 1,
        'music-theory': 1,
        'user-experience-design': 1,
      },
    });
    expect(new Set(expansion.groups.map((group) => group.courseGroupSha256)).size).toBe(4);
    expect(expansion.manifestSha256).not.toBe(retained.manifestSha256);
    expect(expansion.promptSetSha256).not.toBe(retained.promptSetSha256);
    expect(retained.summary).toMatchObject({ groups: 8, prompts: 24, expectedCandidates: 96 });
  });

  it('rejects contextless and truncated source fragments before model calls', () => {
    expect(sourceTextIssues('See: additive rhythm and divisive rhythm.')).toContain('fact-contextless-fragment');
    expect(sourceTextIssues('This source ends without punctuation')).toContain('fact-missing-terminal-punctuation');
    expect(sourceTextIssues('A complete factual statement explains a stable relationship.')).toEqual([]);
  });

  it('keeps constrained decoding inside the exact downstream admission bands', () => {
    const mc = SOURCE_ATOM_SCHEMA.properties.mcItems.items.properties;
    const term = SOURCE_ATOM_SCHEMA.properties.keyTerms.items.properties;
    expect(mc.q).toMatchObject({ minLength: 25, maxLength: 300 });
    expect(mc.op.items).toMatchObject({ minLength: 5, maxLength: 95 });
    expect(mc.ex).toMatchObject({ minLength: 20, maxLength: 300 });
    expect(term.tr).toMatchObject({ minLength: 3, maxLength: 60 });
    expect(term.df).toMatchObject({ minLength: 45, maxLength: 380 });
    for (const field of ['eg', 'mi', 'cx']) expect(term[field]).toMatchObject({ minLength: 12, maxLength: 300 });
    expect(SOURCE_RECOVERY_SCHEMA.properties.mcItems).toMatchObject({ minItems: 1, maxItems: 1 });
    expect(SOURCE_RECOVERY_SCHEMA.properties.keyTerms).toMatchObject({ minItems: 1, maxItems: 1 });
  });

  it('admits clean atoms individually without hiding rejected siblings', () => {
    const response = validResponse();
    response.mcItems[1].op = ['Same option', 'Same option', 'Third option', 'Fourth option'];
    response.keyTerms[1].df =
      'Variable binding is a variable binding definition that repeats its term at the beginning.';
    const assessment = assessSourceAtomResponse(response, { sourceClaimCount: 5 });
    expect(assessment).toMatchObject({
      eligible: true,
      counts: { admittedMcItems: 1, admittedKeyTerms: 1 },
      issues: expect.arrayContaining(['mc-1-duplicate-options', 'key-term-1-circular-definition']),
    });
    expect(assessment.admittedResponse.mcItems).toHaveLength(1);
    expect(assessment.admittedResponse.keyTerms).toHaveLength(1);
  });

  it('rejects a source fact mislabeled as a misconception only when exact source claims are supplied', () => {
    const response = validResponse();
    response.keyTerms[0].mi = 'Thinking structure is the same as musical form.';
    const sourceClaims = [
      'In music, form refers to the structure of a musical composition or performance.',
      'Musical form unfolds over time through the expansion and development of ideas.',
      'Binary form has two sections that are about equal in length.',
      'Lowercase letters can mark subdivisions of a large musical unit.',
      'Structural elements include sound, harmony, melody, and rhythm.',
    ];

    const sourceAware = assessSourceAtomResponse(response, {
      sourceClaimCount: sourceClaims.length,
      sourceClaims,
    });
    expect(sourceAware).toMatchObject({ counts: { admittedKeyTerms: 1 } });
    expect(sourceAware.issues).toContain('key-term-0-misconception-repeats-known-fact');

    const contextFree = assessSourceAtomResponse(response, { sourceClaimCount: sourceClaims.length });
    expect(contextFree.counts.admittedKeyTerms).toBe(2);
  });

  it('replays conservative compiler repairs without mutating retained response bytes', () => {
    const response = validResponse();
    response.mcItems[1].ai = 3;
    response.mcItems[1].ex =
      'Option A is correct because Python evaluates the right side first. Option B confuses assignment with equality.';
    const retained = structuredClone(response);
    const historical = assessSourceAtomResponse(response, { sourceClaimCount: 5 });
    expect(historical).toMatchObject({ counts: { admittedMcItems: 1 } });

    const replayed = compileSourceAtomResponse(response, {
      sourceClaimCount: 5,
      lessonId: 'source-replay-test',
    });
    expect(response).toEqual(retained);
    expect(replayed).toMatchObject({
      eligible: true,
      counts: { admittedMcItems: 2, admittedKeyTerms: 2 },
      repairCounts: { total: 1, explanationKeyAlignment: 1, incompleteExplanationTail: 0 },
    });
    expect(replayed.compiledResponse.mcItems[1]).toMatchObject({ ai: 0, sourceFactIndexes: [0, 2] });
    expect(replayed.repairs[0]).toMatchObject({
      pass: 'explanationKeyAlignment',
      action: 'realigned',
      sourceFactIndexes: [0, 2],
    });
  });

  it('caps over-generation and measures missing or discarded atoms as compiler burden', () => {
    const response = validResponse();
    response.mcItems.push({
      ...response.mcItems[0],
      q: 'A third unrequested question must not enter the compiled project even when it is otherwise valid.',
    });
    const assessment = assessSourceAtomResponse(response, { sourceClaimCount: 5 });
    expect(assessment.counts).toMatchObject({ generatedMcItems: 3, admittedMcItems: 2 });
    expect(assessment.admittedResponse.mcItems).toHaveLength(2);
    expect(assessment.issues).toContain('mc-count');

    const burden = summarizeSourceCaptureBurden({
      expectedCalls: 2,
      expectedAtoms: 8,
      calls: [
        { assessment: { eligible: true, issues: [], counts: assessment.counts } },
        {
          assessment: {
            eligible: false,
            issues: ['model-call-failed'],
            counts: { generatedMcItems: 0, admittedMcItems: 0, generatedKeyTerms: 0, admittedKeyTerms: 0 },
          },
        },
      ],
    });
    expect(burden).toMatchObject({
      capturedCalls: 2,
      eligibleCalls: 1,
      expectedAtoms: 8,
      generatedAtoms: 5,
      admittedAtoms: 4,
      discardedGeneratedAtoms: 1,
      missingExpectedAtoms: 3,
      burdenAtoms: 4,
      burdenRate: 0.5,
    });
  });

  it('verifies every prompt, response, source packet, and group digest', async () => {
    const campaign = await materializeSourceCaptureCampaign();
    const group = campaign.groups[0];
    const calls = group.prompts.map((prompt) => {
      const response = validResponse();
      const assessment = assessSourceAtomResponse(response, { sourceClaimCount: prompt.sourceClaims.length });
      expect(assessment.issues).toEqual([]);
      return {
        promptId: prompt.id,
        kernelId: prompt.kernelId,
        promptSha256: sourceCaptureSha256({ system: prompt.system, user: prompt.user }),
        response,
        responseSha256: sourceCaptureSha256(response),
        admittedResponse: assessment.admittedResponse,
        admittedResponseSha256: sourceCaptureSha256(assessment.admittedResponse),
        assessment: { eligible: true, issues: [], counts: assessment.counts },
      };
    });
    const project = buildSourceCaptureProject({
      campaign,
      group,
      arm: 'local',
      model: { provider: 'local', id: 'exact-base', name: 'Exact base' },
      calls,
      generatedAt: '2026-07-13T00:00:00.000Z',
    });
    const model = { provider: 'local', id: 'exact-base', name: 'Exact base' };
    expect(verifySourceCaptureProject(project, { campaign, group, arm: 'local', model })).toEqual({
      valid: true,
      issues: [],
    });

    const partialCalls = structuredClone(calls);
    partialCalls[2] = {
      promptId: group.prompts[2].id,
      kernelId: group.prompts[2].kernelId,
      promptSha256: sourceCaptureSha256({
        system: group.prompts[2].system,
        user: group.prompts[2].user,
      }),
      assessment: {
        eligible: false,
        issues: ['model-call-failed'],
        counts: { generatedMcItems: 0, admittedMcItems: 0, generatedKeyTerms: 0, admittedKeyTerms: 0 },
      },
      error: 'diagnostic failure',
    };
    const partialProject = buildSourceCaptureProject({
      campaign,
      group,
      arm: 'local',
      model: { provider: 'local', id: 'exact-base', name: 'Exact base' },
      calls: partialCalls,
      generatedAt: '2026-07-13T00:00:00.000Z',
    });
    expect(JSON.parse(partialProject.courseGraphJson).sessions).toHaveLength(2);
    expect(partialProject.scionSourceCapture.rejectedPromptIds).toEqual([group.prompts[2].id]);
    expect(verifySourceCaptureProject(partialProject, { campaign, group, arm: 'local', model })).toEqual({
      valid: true,
      issues: [],
    });

    const recoveryPrompt = buildSourceRecoveryPrompt(group.prompts[2], partialCalls[2]);
    const recoveryResponse = validResponse();
    recoveryResponse.mcItems = recoveryResponse.mcItems.slice(0, 1);
    recoveryResponse.keyTerms = recoveryResponse.keyTerms.slice(0, 1);
    const recoveryAssessment = assessSourceAtomResponse(recoveryResponse, {
      sourceClaimCount: group.prompts[2].sourceClaims.length,
    });
    const recoveryCall = {
      promptId: group.prompts[2].id,
      kernelId: group.prompts[2].kernelId,
      promptSha256: sourceCaptureSha256({ system: group.prompts[2].system, user: group.prompts[2].user }),
      generationPromptSha256: sourceCaptureSha256({
        system: recoveryPrompt.system,
        user: recoveryPrompt.user,
      }),
      rawCallSha256: sourceCaptureSha256(partialCalls[2]),
      response: recoveryResponse,
      responseSha256: sourceCaptureSha256(recoveryResponse),
      admittedResponse: recoveryAssessment.admittedResponse,
      admittedResponseSha256: sourceCaptureSha256(recoveryAssessment.admittedResponse),
      assessment: {
        eligible: recoveryAssessment.eligible,
        issues: recoveryAssessment.issues,
        counts: recoveryAssessment.counts,
      },
    };
    const recoveredProject = buildSourceCaptureProject({
      campaign,
      group,
      arm: 'local',
      model,
      calls: [calls[0], calls[1], recoveryCall],
      rawCalls: partialCalls,
      recoveryCalls: [recoveryCall],
      generatedAt: '2026-07-13T00:00:00.000Z',
    });
    expect(verifySourceCaptureProject(recoveredProject, { campaign, group, arm: 'local', model })).toEqual({
      valid: true,
      issues: [],
    });
    recoveredProject.scionSourceCapture.compilerRecovery.recoveryCalls[0].rawCallSha256 = '0'.repeat(64);
    expect(verifySourceCaptureProject(recoveredProject, { campaign, group, arm: 'local', model })).toMatchObject({
      valid: false,
      issues: expect.arrayContaining([`recovery-raw-call-digest-mismatch:${group.prompts[2].id}`]),
    });

    const graphTamper = structuredClone(project);
    const graph = JSON.parse(graphTamper.courseGraphJson);
    graph.enrichmentOverlay.lessonContent['lesson-1'].quizItems[0].q = 'A silently substituted review question';
    graphTamper.courseGraphJson = JSON.stringify(graph);
    expect(verifySourceCaptureProject(graphTamper, { campaign, group, arm: 'local', model })).toMatchObject({
      valid: false,
      issues: expect.arrayContaining(['project-graph-content-mismatch']),
    });

    const burdenTamper = structuredClone(project);
    burdenTamper.scionSourceCapture.calls[0].assessment.counts.admittedMcItems = 0;
    expect(verifySourceCaptureProject(burdenTamper, { campaign, group, arm: 'local', model })).toMatchObject({
      valid: false,
      issues: expect.arrayContaining([`assessment-content-mismatch:${group.prompts[0].id}`]),
    });

    const modelTamper = structuredClone(project);
    modelTamper.scionSourceCapture.model.name = 'Unverified replacement';
    modelTamper.scionSourceCapture.modelSha256 = sourceCaptureSha256(modelTamper.scionSourceCapture.model);
    modelTamper.modelName = modelTamper.scionSourceCapture.model.name;
    expect(verifySourceCaptureProject(modelTamper, { campaign, group, arm: 'local', model })).toMatchObject({
      valid: false,
      issues: expect.arrayContaining(['model-identity-mismatch']),
    });

    project.scionSourceCapture.sourcePacket.kernels[0].definition = 'tampered';
    expect(verifySourceCaptureProject(project, { campaign, group, arm: 'local', model })).toMatchObject({
      valid: false,
      issues: expect.arrayContaining(['source-packet-content-mismatch']),
    });
  });

  it('binds the historical v0.16.11 receipt to its retained source-capture projects', async () => {
    const campaign = await materializeSourceCaptureCampaign({ cwd: repoRoot });
    const receipt = JSON.parse(
      fs.readFileSync(path.join(repoRoot, 'evaluation/scion-adapters/evidence/review-campaign-v0.16.11.json'), 'utf8'),
    );
    const projects = { local: [], reference: [] };
    const artifactRows = [];

    for (const group of campaign.groups) {
      for (const arm of ['local', 'reference']) {
        const relativePath = `evaluation/scion-source-capture-evidence/${group.id}-${arm}.json`;
        const raw = fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
        const project = JSON.parse(raw);
        const model = project.scionSourceCapture.model;
        expect(verifySourceCaptureProject(project, { campaign, group, arm, model, admissionMode: 'captured' })).toEqual(
          {
            valid: true,
            issues: [],
          },
        );
        projects[arm].push(project);
        artifactRows.push({ path: relativePath, sha256: fileSha256(raw) });
      }
    }

    artifactRows.sort((left, right) => left.path.localeCompare(right.path));
    expect(receipt.sourceCapture).toMatchObject({
      protocol: campaign.protocol,
      manifestPath: campaign.manifestPath,
      manifestSha256: campaign.manifestSha256,
      promptSetSha256: campaign.promptSetSha256,
      artifactSetSha256: sourceCaptureSha256(artifactRows),
      groups: 8,
      promptsPerArm: 24,
      expectedAtomsPerArm: 96,
      validProjects: 16,
      totalProjects: 16,
    });

    const burdenFor = (arm, calls) =>
      summarizeSourceCaptureBurden({
        calls: projects[arm].flatMap((project) =>
          calls === 'raw' ? project.scionSourceCapture.compilerRecovery.rawCalls : project.scionSourceCapture.calls,
        ),
        expectedCalls: campaign.summary.prompts,
        expectedAtoms: campaign.summary.expectedCandidates,
      });
    const localRaw = burdenFor('local', 'raw');
    const localCompiled = burdenFor('local', 'compiled');
    const referenceRaw = burdenFor('reference', 'raw');
    const recoveryCalls = projects.local.reduce(
      (sum, project) => sum + project.scionSourceCapture.compilerRecovery.recoveryCalls.length,
      0,
    );

    expect(receipt.sourceCapture.local).toMatchObject({
      rawGeneratedAtoms: localRaw.generatedAtoms,
      rawAdmittedAtoms: localRaw.admittedAtoms,
      rawBurdenAtoms: localRaw.burdenAtoms,
      rawBurdenRate: localRaw.burdenRate,
      recoveryCalls,
      compiledGeneratedAtoms: localCompiled.generatedAtoms,
      compiledAdmittedAtoms: localCompiled.admittedAtoms,
      compiledBurdenAtoms: localCompiled.burdenAtoms,
      compiledBurdenRate: localCompiled.burdenRate,
    });
    expect(receipt.sourceCapture.reference).toMatchObject({
      rawGeneratedAtoms: referenceRaw.generatedAtoms,
      rawAdmittedAtoms: referenceRaw.admittedAtoms,
      rawBurdenAtoms: referenceRaw.burdenAtoms,
      rawBurdenRate: referenceRaw.burdenRate,
      recoveryCalls: 0,
    });
    expect(projects.local[0].scionSourceCapture.model).toMatchObject(receipt.sourceCapture.local.model);
    expect(projects.reference[0].scionSourceCapture.model).toMatchObject(receipt.sourceCapture.reference.model);

    expect(receipt).toMatchObject({
      status: 'ready-for-research-review',
      completedIndependentReviews: 0,
      approvedTrainingPairs: 0,
      groupCoverageStatus: 'ready',
      researchCoverageStatus: 'ready',
      coverageStatus: 'needs-more-domains',
    });
  });

  it('preserves the v0.16.17 receipt while auditing the stronger current source-first ledger separately', async () => {
    const campaign = await materializeSourceCaptureCampaign({
      cwd: repoRoot,
      manifestPath: 'evaluation/scion-source-capture-expansion-v0.16.17.json',
    });
    const receipt = JSON.parse(
      fs.readFileSync(path.join(repoRoot, 'evaluation/scion-adapters/evidence/review-campaign-v0.16.17.json'), 'utf8'),
    );
    const campaignReceipt = receipt.sourceCaptureCampaigns.find((entry) => entry.role === 'additive-v0.16.17');
    const projects = { local: [], reference: [] };
    const artifactRows = [];

    for (const group of campaign.groups) {
      for (const arm of ['local', 'reference']) {
        const relativePath = `evaluation/scion-source-capture-expansion-evidence/${group.id}-${arm}.json`;
        const raw = fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
        const project = JSON.parse(raw);
        expect(
          verifySourceCaptureProject(project, {
            campaign,
            group,
            arm,
            model: project.scionSourceCapture.model,
            admissionMode: 'captured',
          }),
        ).toEqual({ valid: true, issues: [] });
        projects[arm].push(project);
        artifactRows.push({ path: relativePath, sha256: fileSha256(raw) });
      }
    }

    artifactRows.sort((left, right) => left.path.localeCompare(right.path));
    expect(campaignReceipt).toMatchObject({
      protocol: campaign.protocol,
      manifestPath: campaign.manifestPath,
      manifestSha256: campaign.manifestSha256,
      promptSetSha256: campaign.promptSetSha256,
      artifactSetSha256: sourceCaptureSha256(artifactRows),
      groups: 4,
      promptsPerArm: 24,
      expectedAtomsPerArm: 96,
      validProjects: 8,
      totalProjects: 8,
    });

    const burdenFor = (arm) =>
      summarizeSourceCaptureBurden({
        calls: projects[arm].flatMap((project) => project.scionSourceCapture.calls),
        expectedCalls: campaign.summary.prompts,
        expectedAtoms: campaign.summary.expectedCandidates,
      });
    const local = burdenFor('local');
    const reference = burdenFor('reference');
    expect(campaignReceipt.local).toMatchObject({
      rawGeneratedAtoms: local.generatedAtoms,
      rawAdmittedAtoms: local.admittedAtoms,
      rawBurdenAtoms: local.burdenAtoms,
      rawBurdenRate: local.burdenRate,
      recoveryCalls: 0,
    });
    expect(campaignReceipt.reference).toMatchObject({
      rawGeneratedAtoms: reference.generatedAtoms,
      rawAdmittedAtoms: reference.admittedAtoms,
      rawBurdenAtoms: reference.burdenAtoms,
      rawBurdenRate: reference.burdenRate,
      recoveryCalls: 0,
    });

    const candidateRaw = fs.readFileSync(path.join(repoRoot, 'evaluation/scion-review-candidates.jsonl'), 'utf8');
    const candidates = candidateRaw
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    expect(receipt.sourceFiles[0]).toMatchObject({
      source: 'evaluation/scion-review-candidates.jsonl',
      sha256: '59f313090292d03332e59b16b1cd91da64ebd2b02baf2f66b86c16c06391bc7b',
    });
    expect(fileSha256(candidateRaw)).not.toBe(receipt.sourceFiles[0].sha256);
    expect(candidates).toHaveLength(446);
    expect(new Set(candidates.map((row) => row.courseGroupSha256)).size).toBe(16);
    expect(candidates.filter((row) => row.sourceContext)).toHaveLength(138);
    expect(receipt).toMatchObject({
      status: 'ready-for-model-judge-research',
      selectedCases: 160,
      availableCandidates: 437,
      selectedSourceContextCases: 128,
      excludedMissingSourceContext: 32,
      requiredModelJudgePasses: 256,
      completedModelJudgePasses: 0,
      approvedTrainingPairs: 0,
      courseGroupCount: 16,
      groupCoverageStatus: 'ready',
      researchCoverageStatus: 'ready',
      coverageStatus: 'needs-more-domains',
    });
  });
});
