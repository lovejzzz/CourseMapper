import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  SOURCE_ATOM_SCHEMA,
  SOURCE_PARTIAL_RECOVERY_PROTOCOL,
  SOURCE_PROMPT_POLICY_V2,
  SOURCE_PROMPT_POLICY_V3,
  SOURCE_PROMPT_POLICY_V4,
  SOURCE_RECOVERY_SCHEMA,
  SOURCE_TARGETED_ASSESSMENT_CONTRACT,
  assessSourceAtomResponse,
  buildSourceAtomPrompt,
  buildSourceCaptureProject,
  buildSourcePartialRecoverySchema,
  buildSourceRecoveryPrompt,
  compileSourceAtomResponse,
  materializeSourceCaptureCampaign,
  mergeSourceRecoveryCall,
  sourceCaptureSha256,
  sourceRecoveryTarget,
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

  it('supports an explicit targeted-domain gap campaign without weakening the default four-domain policy', async () => {
    const targeted = await materializeSourceCaptureCampaign({
      cwd: repoRoot,
      manifestPath: 'evaluation/scion-source-capture-novel-kernels-v0.16.47.json',
    });
    expect(targeted.summary).toMatchObject({
      groups: 2,
      prompts: 8,
      expectedCandidates: 32,
      domains: ['music-theory', 'user-experience-design'],
      domainGroupCounts: { 'music-theory': 1, 'user-experience-design': 1 },
      coveragePolicy: {
        protocol: 'scion-source-capture-targeted-domain-gap-v1',
        domains: ['music-theory', 'user-experience-design'],
      },
    });
    expect(new Set(targeted.groups.flatMap((group) => group.prompts.map((prompt) => prompt.kernelId))).size).toBe(8);

    const retained = await materializeSourceCaptureCampaign({ cwd: repoRoot });
    expect(retained.summary.coveragePolicy).toEqual({
      protocol: 'scion-source-capture-four-domain-balance-v1',
      domains: 4,
    });
    expect(retained.summary.domains).toHaveLength(4);
  });

  it('materializes two v2 course groups per novel domain for controlled breadth', async () => {
    const campaign = await materializeSourceCaptureCampaign({
      cwd: repoRoot,
      manifestPath: 'evaluation/scion-source-capture-course-group-breadth-v0.16.47.json',
    });

    expect(campaign.summary).toMatchObject({
      groups: 6,
      prompts: 34,
      expectedCandidates: 136,
      promptPolicy: SOURCE_PROMPT_POLICY_V2,
      domainGroupCounts: { anatomy: 2, economics: 2, physics: 2 },
    });
    expect(
      campaign.groups.every((group) =>
        group.prompts.every((prompt) => prompt.promptPolicy === SOURCE_PROMPT_POLICY_V2),
      ),
    ).toBe(true);
    expect(new Set(campaign.groups.flatMap((group) => group.prompts.map((prompt) => prompt.kernelId))).size).toBe(34);
  });

  it('materializes a bounded economics and music readiness-gap campaign', async () => {
    const campaign = await materializeSourceCaptureCampaign({
      cwd: repoRoot,
      manifestPath: 'evaluation/scion-source-capture-readiness-gap-v0.16.47.json',
    });

    expect(campaign.summary).toMatchObject({
      groups: 2,
      prompts: 5,
      expectedCandidates: 20,
      promptPolicy: SOURCE_PROMPT_POLICY_V2,
      domainGroupCounts: { economics: 1, 'music-theory': 1 },
    });
    expect(new Set(campaign.groups.flatMap((group) => group.prompts.map((prompt) => prompt.kernelId))).size).toBe(5);
    expect(campaign.groups.flatMap((group) => group.prompts.map((prompt) => prompt.kernelId))).toContain(
      'music/rhythm-and-meter',
    );
  });

  it('materializes v3 and v4 on the exact v2 kernels and course groups', async () => {
    const [v2, v3, v4] = await Promise.all([
      materializeSourceCaptureCampaign({
        cwd: repoRoot,
        manifestPath: 'evaluation/scion-source-capture-course-group-breadth-v0.16.47.json',
      }),
      materializeSourceCaptureCampaign({
        cwd: repoRoot,
        manifestPath: 'evaluation/scion-source-capture-authoring-v3-v0.16.47.json',
      }),
      materializeSourceCaptureCampaign({
        cwd: repoRoot,
        manifestPath: 'evaluation/scion-source-capture-authoring-v4-v0.16.47.json',
      }),
    ]);

    expect(v3.summary).toMatchObject({
      groups: 6,
      prompts: 34,
      expectedCandidates: 136,
      promptPolicy: SOURCE_PROMPT_POLICY_V3,
      domainGroupCounts: { anatomy: 2, economics: 2, physics: 2 },
    });
    expect(v3.groups.map((group) => group.id)).toEqual(v2.groups.map((group) => group.id));
    expect(v3.groups.flatMap((group) => group.prompts.map((prompt) => prompt.kernelId))).toEqual(
      v2.groups.flatMap((group) => group.prompts.map((prompt) => prompt.kernelId)),
    );
    expect(v3.promptSetSha256).not.toBe(v2.promptSetSha256);
    expect(v4.summary).toMatchObject({
      groups: 6,
      prompts: 34,
      expectedCandidates: 136,
      promptPolicy: SOURCE_PROMPT_POLICY_V4,
      domainGroupCounts: { anatomy: 2, economics: 2, physics: 2 },
    });
    expect(v4.groups.map((group) => group.id)).toEqual(v2.groups.map((group) => group.id));
    expect(v4.groups.flatMap((group) => group.prompts.map((prompt) => prompt.kernelId))).toEqual(
      v2.groups.flatMap((group) => group.prompts.map((prompt) => prompt.kernelId)),
    );
    expect(v4.promptSetSha256).not.toBe(v2.promptSetSha256);
    expect(v4.promptSetSha256).not.toBe(v3.promptSetSha256);
  });

  it('versions stricter authoring instructions without changing retained v1 prompts', () => {
    const group = {
      id: 'test-group',
      courseBrief: 'A source-grounded test course.',
      qualityFocus: 'Separate close alternatives and keep every learner-facing field free of source metadata.',
      sourcePacketSha256: 'a'.repeat(64),
    };
    const kernel = {
      id: 'test/kernel',
      term: 'Test kernel',
      definition: 'A complete definition for the test kernel.',
      facts: [{ text: 'A complete supporting fact for the test kernel.' }],
      attribution: ['Test source'],
      license: 'CC-BY-4.0',
    };
    const retained = buildSourceAtomPrompt(group, kernel);
    const strict = buildSourceAtomPrompt(group, kernel, { promptPolicy: SOURCE_PROMPT_POLICY_V2 });
    const compact = buildSourceAtomPrompt(group, kernel, { promptPolicy: SOURCE_PROMPT_POLICY_V3 });
    const focused = buildSourceAtomPrompt(group, kernel, { promptPolicy: SOURCE_PROMPT_POLICY_V4 });
    const recovery = buildSourceRecoveryPrompt(
      strict,
      { assessment: { issues: ['claim-marker-residue'] } },
      { target: { mcItems: 1, keyTerms: 1 } },
    );

    expect(retained.promptPolicy).toBeUndefined();
    expect(retained.user).not.toContain('Never mention claim numbers');
    expect(strict.promptPolicy).toBe(SOURCE_PROMPT_POLICY_V2);
    expect(strict.user).toContain('Never mention claim numbers');
    expect(strict.user).toContain('genuinely false misconception');
    expect(recovery.user).toContain('Never expose claim numbers');
    expect(compact.promptPolicy).toBe(SOURCE_PROMPT_POLICY_V3);
    expect(compact.user).toContain('under 80 characters each');
    expect(compact.user).toContain('exactly two complete sentences under 180 characters total');
    expect(compact.user).toContain('an actor or object, an action, and an observable result');

    const compactRecovery = buildSourceRecoveryPrompt(
      compact,
      { assessment: { issues: ['truncated-option'] } },
      { target: { mcItems: 1, keyTerms: 0 } },
    );
    expect(compactRecovery.user).toContain('end it with a complete content phrase');
    expect(compactRecovery.user).toContain('directly refute it without copying df');

    expect(focused.promptPolicy).toBe(SOURCE_PROMPT_POLICY_V4);
    expect(focused.user).toContain('four parallel, cue-free op alternatives under 80 characters each');
    expect(focused.user).not.toContain('an actor or object, an action, and an observable result');

    const focusedMcRecovery = buildSourceRecoveryPrompt(
      focused,
      { assessment: { issues: ['truncated-option', 'key-term-example-not-concrete'] } },
      { target: { mcItems: 1, keyTerms: 0 } },
    );
    expect(focusedMcRecovery.user).toContain('MC rule:');
    expect(focusedMcRecovery.user).not.toContain('Key-term rule:');
    expect(focusedMcRecovery.user).not.toContain('key-term-example-not-concrete');

    const focusedKeyTermRecovery = buildSourceRecoveryPrompt(
      focused,
      { assessment: { issues: ['truncated-option', 'key-term-example-not-concrete'] } },
      { target: { mcItems: 0, keyTerms: 1 } },
    );
    expect(focusedKeyTermRecovery.user).toContain('Key-term rule:');
    expect(focusedKeyTermRecovery.user).not.toContain('MC rule:');
    expect(focusedKeyTermRecovery.user).not.toContain('truncated-option');
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

  it('removes only a redundant key-term definition lead without inventing replacement prose', () => {
    const response = validResponse();
    response.keyTerms[0].tr = 'Capital stock';
    response.keyTerms[0].df =
      'The capital stock is the total quantity of equipment, structures, and tools available for production.';
    response.keyTerms[0].sourceFactIndexes = [0];
    const retained = structuredClone(response);

    const replayed = compileSourceAtomResponse(response, {
      sourceClaimCount: 2,
      sourceClaims: [
        'The capital stock is the total quantity of equipment, structures, and tools available for production.',
        'Gross investment increases the capital stock while depreciation decreases it.',
      ],
      lessonId: 'capital-stock-replay',
    });

    expect(response).toEqual(retained);
    expect(replayed.compiledResponse.keyTerms[0].df).toBe(
      'The total quantity of equipment, structures, and tools available for production.',
    );
    expect(replayed.repairCounts.redundantDefinitionLead).toBe(1);
    expect(replayed.repairs).toContainEqual(
      expect.objectContaining({
        pass: 'redundantDefinitionLead',
        action: 'removed-leading-term-copula',
        proof: 'deletion-only-noun-phrase-remainder',
        termIndex: 0,
        sourceFactIndexes: [0],
      }),
    );
  });

  it('does not strip a circular definition when deletion would leave a predicate fragment', () => {
    const response = validResponse();
    response.keyTerms[0].tr = 'Epidermis';
    response.keyTerms[0].df = 'The epidermis is made of keratinized stratified squamous epithelium.';

    const replayed = compileSourceAtomResponse(response, {
      sourceClaimCount: 2,
      sourceClaims: [
        'The epidermis is made of keratinized stratified squamous epithelium.',
        'Skin has two major layers.',
      ],
      lessonId: 'epidermis-replay',
    });

    expect(replayed.compiledResponse.keyTerms[0].df).toBe(response.keyTerms[0].df);
    expect(replayed.repairCounts.redundantDefinitionLead).toBe(0);
    expect(replayed.issues).toContain('key-term-0-circular-definition');
  });

  it('realigns a wrong key only from the exact source facts cited by the item', () => {
    const response = validResponse();
    response.mcItems[0] = {
      q: 'What does absolute dating provide regarding mineral grains in a rock?',
      op: [
        'A numerical age in years',
        'A relative order of events',
        "The span of Earth's history",
        'The sequence of deposition',
      ],
      ai: 1,
      ex: 'The correct choice supplies a specific measured age for the mineral grains.',
      sourceFactIndexes: [1],
    };
    const sourceClaims = [
      'Relative dating orders events while absolute dating assigns numerical ages.',
      'Absolute numerical dating assigns specific ages in years to mineral grains within a rock.',
      'Superposition orders undisturbed layers from oldest to youngest.',
    ];

    const replayed = compileSourceAtomResponse(response, {
      sourceClaimCount: sourceClaims.length,
      sourceClaims,
      lessonId: 'source-key-test',
    });
    expect(replayed.compiledResponse.mcItems[0]).toMatchObject({ ai: 0, sourceFactIndexes: [1] });
    expect(replayed.repairCounts).toMatchObject({ total: 1, sourceAnswerAlignment: 1 });
    expect(replayed.repairs[0]).toMatchObject({
      pass: 'sourceAnswerAlignment',
      sourceFactIndexes: [1],
      preferenceEvidence: { supportedIndex: 0 },
    });

    const contextFree = compileSourceAtomResponse(response, {
      sourceClaimCount: sourceClaims.length,
      lessonId: 'source-key-test',
    });
    expect(contextFree.compiledResponse.mcItems[0].ai).toBe(1);
    expect(contextFree.repairCounts.sourceAnswerAlignment).toBe(0);
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

    const partialRawCall = structuredClone(calls[0]);
    partialRawCall.response.mcItems = partialRawCall.response.mcItems.slice(0, 1);
    const partialRawAssessment = assessSourceAtomResponse(partialRawCall.response, {
      sourceClaimCount: group.prompts[0].sourceClaims.length,
      sourceClaims: group.prompts[0].sourceClaims,
    });
    partialRawCall.responseSha256 = sourceCaptureSha256(partialRawCall.response);
    partialRawCall.admittedResponse = partialRawAssessment.admittedResponse;
    partialRawCall.admittedResponseSha256 = sourceCaptureSha256(partialRawAssessment.admittedResponse);
    partialRawCall.assessment = {
      eligible: partialRawAssessment.eligible,
      issues: partialRawAssessment.issues,
      counts: partialRawAssessment.counts,
    };
    const partialTarget = sourceRecoveryTarget(partialRawCall);
    expect(partialTarget).toEqual({ mcItems: 1, keyTerms: 0 });
    expect(
      sourceRecoveryTarget({ assessment: { counts: { admittedMcItems: Number.NaN, admittedKeyTerms: 99 } } }),
    ).toEqual({ mcItems: 2, keyTerms: 0 });
    expect(buildSourcePartialRecoverySchema(partialTarget).properties).toMatchObject({
      mcItems: { minItems: 1, maxItems: 1 },
      keyTerms: { minItems: 0, maxItems: 0 },
    });
    const partialPrompt = buildSourceRecoveryPrompt(group.prompts[0], partialRawCall, { target: partialTarget });
    const partialResponse = { mcItems: [validResponse().mcItems[1]], keyTerms: [] };
    const partialAssessment = assessSourceAtomResponse(partialResponse, {
      sourceClaimCount: group.prompts[0].sourceClaims.length,
      sourceClaims: group.prompts[0].sourceClaims,
      expectedCounts: partialTarget,
    });
    expect(partialAssessment).toMatchObject({
      eligible: true,
      issues: [],
      counts: { generatedMcItems: 1, admittedMcItems: 1, generatedKeyTerms: 0, admittedKeyTerms: 0 },
    });
    const partialRecoveryCall = {
      promptId: group.prompts[0].id,
      kernelId: group.prompts[0].kernelId,
      promptSha256: sourceCaptureSha256({ system: group.prompts[0].system, user: group.prompts[0].user }),
      generationPromptSha256: sourceCaptureSha256({ system: partialPrompt.system, user: partialPrompt.user }),
      rawCallSha256: sourceCaptureSha256(partialRawCall),
      assessmentContract: SOURCE_TARGETED_ASSESSMENT_CONTRACT,
      recoveryTarget: partialTarget,
      response: partialResponse,
      responseSha256: sourceCaptureSha256(partialResponse),
      admittedResponse: partialAssessment.admittedResponse,
      admittedResponseSha256: sourceCaptureSha256(partialAssessment.admittedResponse),
      assessment: {
        eligible: partialAssessment.eligible,
        issues: partialAssessment.issues,
        counts: partialAssessment.counts,
      },
    };
    const mergedPartialCall = mergeSourceRecoveryCall({
      rawCall: partialRawCall,
      recoveryCall: partialRecoveryCall,
      prompt: group.prompts[0],
    });
    expect(mergedPartialCall.assessment).toMatchObject({
      eligible: true,
      issues: [],
      counts: { admittedMcItems: 2, admittedKeyTerms: 2 },
    });
    const partialRecoveryProject = buildSourceCaptureProject({
      campaign,
      group,
      arm: 'local',
      model,
      calls: [mergedPartialCall, calls[1], calls[2]],
      rawCalls: [partialRawCall, calls[1], calls[2]],
      recoveryCalls: [partialRecoveryCall],
      recoveryProtocol: SOURCE_PARTIAL_RECOVERY_PROTOCOL,
      generatedAt: '2026-07-13T00:00:00.000Z',
    });
    expect(verifySourceCaptureProject(partialRecoveryProject, { campaign, group, arm: 'local', model })).toEqual({
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
    expect(candidates).toHaveLength(515);
    expect(new Set(candidates.map((row) => row.courseGroupSha256)).size).toBe(24);
    expect(candidates.filter((row) => row.sourceContext)).toHaveLength(219);
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
