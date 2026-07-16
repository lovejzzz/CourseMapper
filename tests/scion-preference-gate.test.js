import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  assessScionKernelLesson,
  assessScionMcItem,
  assessScionPreferencePair,
  deriveDeterministicContractEvidence,
  findScionExplanationKeyConflict,
} from '../src/lib/scionPreferenceGate';
import { attachEnrichmentToGraph } from '../src/lib/courseGraph/blueprintFromGraph.js';
import {
  assessCorpusRow,
  buildCorpusSummary,
  runScionPreferenceCorpusAudit,
} from '../scripts/scionPreferenceCorpusAudit.mjs';
import {
  buildScionBlindReviewPacket,
  ingestScionBlindReviews,
  validateScionBlindReview,
  validateScionFounderReview,
} from '../scripts/scionBlindReviewPacket.mjs';
import { buildMatchedReviewCandidates } from '../scripts/scionMatchedReviewCandidates.mjs';

function goodMc(overrides = {}) {
  return {
    q: 'Which evidence most directly supports revising the prototype navigation?',
    op: [
      'Three participants fail the same labeled task',
      'One participant says the colors look pleasant',
      'The designer prefers the original navigation',
      'A stakeholder requests a larger project logo',
    ],
    ai: 0,
    ex: 'Repeated task failure is direct behavioral evidence, whereas the other options do not demonstrate a navigation breakdown.',
    ...overrides,
  };
}

function goodLesson() {
  return {
    lessonId: 'lesson-1',
    facts: Array.from(
      { length: 5 },
      (_, index) => `A concrete disciplinary fact number ${index + 1} anchors the lesson analysis.`,
    ),
    keyTerms: Array.from({ length: 3 }, (_, index) => ({
      tr: `Term ${index + 1}`,
      df: 'A sufficiently detailed disciplinary definition that distinguishes the construct from nearby ideas.',
      eg: 'A concrete example demonstrates the construct in a realistic decision.',
      mi: 'A learner may incorrectly treat correlation as a complete causal explanation.',
      cx: 'The accurate correction separates observed association from a supported causal claim.',
    })),
    scenario: {
      su: 'A design team must decide whether to revise navigation or onboarding after three participants fail the same labeled task while two complete it successfully.',
      ma: 'Five task transcripts, completion-time records, and the current navigation prototype',
    },
    discussionPrompt: {
      pr: 'Which design change is best supported by the available evidence?',
      tn: 'The records support competing interpretations of navigation and onboarding problems.',
      po: ['Revise navigation first', 'Test onboarding first'],
    },
    assignmentCore: {
      td: 'Analyze the five task records and recommend one bounded prototype revision supported by specific observations.',
      pa: ['Use two transcript excerpts', 'Name one limitation'],
    },
    studyGuide: {
      sm: 'Evidence-based design decisions connect repeated observed behavior to a bounded interface change without inventing user motives or unsupported causes.',
      rs: 'Rehearse how task observations, competing explanations, and evidence limitations change a prototype recommendation.',
    },
    mc: Array.from({ length: 4 }, () => goodMc()),
  };
}

describe('Scion preference admission gate', () => {
  it('rejects superficially structured items with truncated or process-like explanations', () => {
    expect(
      assessScionMcItem(goodMc({ ex: 'Key elements include repeated task failure and several activities include' })),
    ).toMatchObject({ eligible: false });
  });

  it('rejects answer choices that differ only by labels, articles, or punctuation', () => {
    const result = assessScionMcItem(
      goodMc({
        op: [
          'A. The ratio between two sonic frequencies.',
          'B. A difference in pitch between two sounds.',
          'C. The ratio between notes in a scale.',
          'D. The difference in pitch between two sounds.',
        ],
        ai: 1,
        ex: 'Pitch difference is the music-theory definition, while a frequency ratio is a physical description.',
      }),
    );
    expect(result).toMatchObject({ eligible: false });
    expect(result.issues).toContain('duplicate-options');
  });

  it('preserves structural delimiters when code options contain the same values', () => {
    const result = assessScionMcItem(
      goodMc({
        q: 'Which notation constructs a Python list containing three quiz scores?',
        op: ['[12, 15, 18]', '(12, 15, 18)', '{12, 15, 18}', '12, 15, 18'],
        ai: 0,
        ex: 'Square brackets construct the list; parentheses and braces represent different container forms.',
      }),
    );
    expect(result.issues).not.toContain('duplicate-options');
    expect(result.eligible).toBe(true);
  });

  it('rejects feedback that only repeats the keyed answer', () => {
    const result = assessScionMcItem(
      goodMc({
        op: [
          'The first scale degree alone.',
          'The width of one scale step.',
          'The characteristic interval pattern and the first degree.',
          'The numerical scale-degree labels.',
        ],
        ai: 2,
        ex: 'The characteristic interval pattern and the first degree.',
      }),
    );
    expect(result).toMatchObject({ eligible: false });
    expect(result.issues).toContain('explanation-repeats-answer');
  });

  it('detects a declared key that contradicts the option supported by its explanation', () => {
    const conflicted = goodMc({
      ai: 0,
      ex: 'Adding a distinct navigation category directly resolves the split grouping, while another study only repeats it.',
      op: [
        'Conduct another study with a larger participant sample',
        'Add a distinct navigation category for outdoor products',
        'Remove all winter products from the catalog',
        'Keep the current navigation without any revision',
      ],
    });
    expect(findScionExplanationKeyConflict(conflicted)).toMatchObject({ declaredIndex: 0, supportedIndex: 1 });
    expect(assessScionMcItem(conflicted).issues).toContain('explanation-key-conflict');
  });

  it('repairs a contradicted key again at the persisted CourseGraph boundary', () => {
    const conflicted = goodMc({
      ai: undefined,
      answerIndex: 0,
      ex: undefined,
      explanation:
        'Adding a distinct navigation category directly resolves the split grouping, while another study only repeats it.',
      op: undefined,
      options: [
        'Conduct another study with a larger participant sample',
        'Add a distinct navigation category for outdoor products',
        'Remove all winter products from the catalog',
        'Keep the current navigation without any revision',
      ],
    });
    const graph = {
      sessions: [{ id: 's1', number: 1 }],
      concepts: [{ id: 'c1' }],
      edges: { teaches: [{ from: 's1', to: 'c1' }], genomeLink: [] },
    };
    attachEnrichmentToGraph(graph, {
      lessonContent: {
        'lesson-1': {
          quizItems: [{ ...conflicted, type: 'multiple_choice' }],
        },
      },
    });

    expect(graph.enrichmentOverlay.lessonContent['lesson-1'].quizItems[0].answerIndex).toBe(1);
    expect(graph.concepts[0].kernel.quizItems[0].answerIndex).toBe(1);
    expect(graph.enrichmentOverlay.semanticRepairs).toHaveLength(1);
    const trainingAssessment = assessCorpusRow(graph.enrichmentOverlay.semanticRepairs[0]);
    expect(trainingAssessment.eligible).toBe(false);
    expect(trainingAssessment.issues).toContain('unsupported-preference-evidence-kind');
  });

  it('requires the complete kernel contract including study-guide strategy', () => {
    const lesson = goodLesson();
    expect(assessScionKernelLesson(lesson).eligible).toBe(true);
    lesson.studyGuide.rs = '';
    expect(assessScionKernelLesson(lesson)).toMatchObject({ eligible: false });
  });

  it('does not infer pair preference from a teacher model name or clean structure alone', () => {
    const pair = assessScionPreferencePair({ kind: 'mc-item', chosen: goodMc(), rejected: goodMc() });
    expect(pair.eligible).toBe(false);
    expect(pair.issues).toContain('missing-pair-level-evidence');
  });

  it('rejects unknown evidence kinds even when the chosen side fixes a structural defect', () => {
    const pair = assessScionPreferencePair({
      kind: 'mc-item',
      chosen: goodMc(),
      rejected: goodMc({ op: ['A', 'A', 'B', 'C'] }),
      preferenceEvidence: {
        kind: 'topic-and-key-repair',
        verified: true,
        chosenAnswers: [2, 2],
      },
    });
    expect(pair.eligible).toBe(false);
    expect(pair.issues).toContain('unsupported-preference-evidence-kind');
  });

  it('derives auditable training evidence only for a non-semantic contract margin', () => {
    const chosen = goodMc();
    const rejected = goodMc({ op: ['A', 'A', 'B', 'C'] });
    const preferenceEvidence = deriveDeterministicContractEvidence({ kind: 'mc-item', chosen, rejected });

    expect(preferenceEvidence).toMatchObject({
      kind: 'deterministic-contract-margin',
      verified: true,
      validator: 'scion-preference-gate',
      scope: 'non-semantic-contract-only',
      rejectedIssues: expect.arrayContaining(['duplicate-options', 'option-length']),
    });
    expect(assessScionPreferencePair({ kind: 'mc-item', chosen, rejected, preferenceEvidence })).toMatchObject({
      eligible: true,
    });
  });

  it('rejects semantic index placeholders before a quiz item can ship or enter training', () => {
    const rejected = goodMc({ op: ['index: 0', 'index: 1', 'index: 2', 'index: 3'] });
    expect(assessScionMcItem(rejected)).toMatchObject({
      eligible: false,
      issues: expect.arrayContaining(['placeholder-options']),
    });
    expect(deriveDeterministicContractEvidence({ kind: 'mc-item', chosen: goodMc(), rejected })).toMatchObject({
      kind: 'deterministic-contract-margin',
      rejectedIssues: expect.arrayContaining(['placeholder-options']),
    });
  });

  it('rejects forged deterministic evidence and semantic answer-key repairs', () => {
    const chosen = goodMc();
    const structuralRejected = goodMc({ op: ['A', 'A', 'B', 'C'] });
    const forged = {
      ...deriveDeterministicContractEvidence({ kind: 'mc-item', chosen, rejected: structuralRejected }),
      rejectedIssues: ['duplicate-options'],
    };
    expect(
      assessScionPreferencePair({ kind: 'mc-item', chosen, rejected: structuralRejected, preferenceEvidence: forged })
        .issues,
    ).toContain('invalid-deterministic-contract-evidence');

    const semanticRejected = goodMc({
      ai: 1,
      ex: 'Repeated task failure is direct behavioral evidence, whereas the other options do not demonstrate a navigation breakdown.',
    });
    expect(deriveDeterministicContractEvidence({ kind: 'mc-item', chosen, rejected: semanticRejected })).toBeNull();
  });

  it('admits a verified repair only when the chosen side passes and the rejected side has a real defect', () => {
    const pair = assessScionPreferencePair({
      kind: 'mc-item',
      chosen: goodMc(),
      rejected: goodMc({ op: ['A', 'A', 'B', 'C'] }),
      preferenceEvidence: {
        kind: 'double-blind-key-repair',
        verified: true,
        verifierIds: ['solver-a', 'solver-b'],
      },
    });
    expect(pair.eligible).toBe(true);
  });

  it('admits a structurally tied pair only after two blind working-instructor reviews agree', () => {
    const pair = assessScionPreferencePair({
      kind: 'mc-item',
      chosen: goodMc(),
      rejected: goodMc({
        q: 'Which observation most directly supports changing the prototype navigation?',
      }),
      preferenceEvidence: {
        kind: 'blind-instructor-preference',
        verified: true,
        preferred: 'chosen',
        unanimous: true,
        reviewerIds: ['instructor-a', 'instructor-b'],
        reviewerRoles: ['working-instructor', 'working-instructor'],
        reviewHashes: ['review-a', 'review-b'],
      },
    });
    expect(pair.eligible).toBe(true);
  });

  it('rejects blind review evidence without independent working instructors', () => {
    const pair = assessScionPreferencePair({
      kind: 'mc-item',
      chosen: goodMc(),
      rejected: goodMc(),
      preferenceEvidence: {
        kind: 'blind-instructor-preference',
        verified: true,
        preferred: 'chosen',
        unanimous: true,
        reviewerIds: ['same-person', 'same-person'],
        reviewerRoles: ['working-instructor', 'working-instructor'],
        reviewHashes: ['review-a', 'review-b'],
      },
    });
    expect(pair.eligible).toBe(false);
    expect(pair.issues).toContain('invalid-blind-instructor-evidence');
  });

  it('quarantines experimental rows that changed a generated key after weak-model cold solving', () => {
    const pair = assessScionPreferencePair({
      kind: 'mc-item',
      chosen: goodMc(),
      rejected: goodMc({ op: ['A', 'A', 'B', 'C'] }),
      preferenceEvidence: {
        kind: 'admission-and-key-repair',
        verified: true,
        chosenAnswers: [2, 2],
        declaredAnswer: 0,
      },
    });
    expect(pair.eligible).toBe(false);
    expect(pair.issues).toContain('post-hoc-key-realignment-not-trainable');
  });

  it('admits an applied-depth pair when the chosen stem passes the evidence contract and the rejected stem does not', () => {
    const options = ['Thematic coding', 'Random sampling', 'A/B testing', 'Linear regression'];
    const explanation =
      'Thematic coding organizes recurring ideas in interview transcripts, whereas the alternatives answer different research questions.';
    const rejected = goodMc({
      q: 'Which method is used to organize interview responses?',
      op: options,
      ex: explanation,
    });
    const chosen = goodMc({
      q: 'A researcher observes three participants failing the same navigation task in recorded sessions. Which response is best supported by this evidence?',
      op: options,
      ex: explanation,
    });
    expect(
      assessScionPreferencePair({
        kind: 'mc-item',
        chosen,
        rejected,
        preferenceEvidence: {
          kind: 'applied-depth-and-key-repair',
          verified: true,
          rejectedApplied: false,
          chosenApplied: true,
          chosenAnswers: [0, 0],
          groundingTokens: ['researcher', 'navigation'],
          reviewStatus: 'approved',
        },
      }),
    ).toMatchObject({ eligible: true });
    expect(
      assessCorpusRow({
        kind: 'mc-item',
        pass: 'appliedDepth',
        prompt: 'Rewrite the stem around the admitted scenario evidence without changing its key.',
        chosen,
        rejected,
        preferenceEvidence: {
          kind: 'applied-depth-and-key-repair',
          verified: true,
          rejectedApplied: false,
          chosenApplied: true,
          chosenAnswers: [0, 0],
          groundingTokens: ['researcher', 'navigation'],
          reviewStatus: 'approved',
        },
      }),
    ).toMatchObject({ eligible: true });
  });

  it('rejects applied-depth evidence that only asserts grounding or names tokens absent from the chosen stem', () => {
    const rejected = goodMc({ q: 'Which method organizes interview responses?' });
    const chosen = goodMc({
      q: 'A researcher observes recorded sessions. Which response is best supported by this evidence?',
    });
    const base = {
      kind: 'mc-item',
      chosen,
      rejected,
      preferenceEvidence: {
        kind: 'applied-depth-and-key-repair',
        verified: true,
        rejectedApplied: false,
        chosenApplied: true,
        chosenAnswers: [2, 2],
        reviewStatus: 'approved',
      },
    };
    expect(
      assessScionPreferencePair({
        ...base,
        preferenceEvidence: { ...base.preferenceEvidence, groundingTokens: ['researcher'] },
      }).eligible,
    ).toBe(false);
    expect(
      assessScionPreferencePair({
        ...base,
        preferenceEvidence: { ...base.preferenceEvidence, groundingTokens: ['researcher', 'navigation'] },
      }).eligible,
    ).toBe(false);
  });

  it('quarantines legacy flywheel rows that lack the exact training prompt and proof', () => {
    const legacy = assessCorpusRow({ pass: 'mcVerify', chosen: goodMc(), rejected: goodMc() }, 'legacy.jsonl');
    expect(legacy).toMatchObject({ eligible: false, kind: 'mc-item' });
    expect(legacy.issues).toContain('missing-training-prompt');
    expect(buildCorpusSummary([legacy])).toMatchObject({ eligible: 0, quarantined: 1 });
  });

  it('quarantines deterministic key realignment embedded in a real project graph', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'scion-project-pair-'));
    const projectPath = path.join(root, 'project.json');
    const output = path.join(root, 'curated.jsonl');
    const reportDir = path.join(root, 'report');
    const rejected = goodMc({
      ai: 0,
      op: [
        'Conduct another study with a larger participant sample',
        'Add a distinct navigation category for outdoor products',
        'Remove all winter products from the catalog',
        'Keep the current navigation without any revision',
      ],
      ex: 'Adding a distinct navigation category directly resolves the split grouping, while another study only repeats it.',
    });
    const repair = {
      kind: 'mc-item',
      pass: 'explanationKeyAlignment',
      prompt: 'Choose the answer index supported by the affirmative explanation for this multiple-choice item.',
      rejected,
      chosen: { ...rejected, ai: 1 },
      trainingEligible: true,
      preferenceEvidence: { kind: 'deterministic-explanation-key-conflict', verified: true },
    };
    await fs.writeFile(
      projectPath,
      JSON.stringify({ courseGraphJson: JSON.stringify({ enrichmentOverlay: { semanticRepairs: [repair] } }) }),
    );

    const report = await runScionPreferenceCorpusAudit({
      sources: [],
      projects: [projectPath],
      output,
      reportDir,
    });

    expect(report.summary).toMatchObject({ eligible: 0, quarantined: 1 });
    expect(await fs.readFile(output, 'utf8')).toBe('');
    expect(report.quarantine[0].issues).toContain('unsupported-preference-evidence-kind');
  });

  it('builds a blind packet and admits only unanimous high-quality instructor reviews', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'scion-blind-review-'));
    const source = path.join(root, 'source.jsonl');
    const outputDir = path.join(root, 'packet');
    const approvedOutput = path.join(root, 'approved.jsonl');
    await fs.writeFile(
      source,
      `${JSON.stringify({
        kind: 'mc-item',
        prompt: 'Write one evidence-bearing navigation question.',
        left: JSON.stringify(goodMc()),
        right: JSON.stringify(
          goodMc({ q: 'Which observation supports changing the prototype navigation most directly?' }),
        ),
        courseId: 'interaction-design',
        lessonId: 'lesson-1',
      })}\n`,
    );
    const packet = await buildScionBlindReviewPacket({ sources: [source], outputDir, limit: 1 });
    expect(packet.meta).toMatchObject({
      selectedCases: 1,
      blind: true,
      coverageStatus: 'needs-more-domains-and-course-groups',
      groupCoverageStatus: 'needs-more-course-groups',
      researchCampaignReady: false,
      domainGroupCounts: { 'interaction-design': 1 },
    });
    const caseRow = packet.cases[0];
    const domainDir = path.join(outputDir, 'reviewer', 'by-domain', 'interaction-design');
    const html = await fs.readFile(path.join(domainDir, 'review.html'), 'utf8');
    const blankForm = JSON.parse(await fs.readFile(path.join(domainDir, 'review-form-1.json'), 'utf8'));
    const founderHtml = await fs.readFile(path.join(domainDir, 'founder-review.html'), 'utf8');
    const founderForm = JSON.parse(await fs.readFile(path.join(domainDir, 'founder-review-form.json'), 'utf8'));
    expect(html).toContain('Blind atom review');
    expect(html).toContain('Download completed review JSON');
    expect(html).toContain(caseRow.pairId);
    expect(html).not.toMatch(/"mapping"|"sourceRow"|candidateModel|referenceModel|source\.jsonl/);
    expect(founderHtml).toContain('Blind founder review');
    expect(founderHtml).toContain('cannot promote an adapter');
    expect(founderHtml).not.toMatch(/"mapping"|"sourceRow"|candidateModel|referenceModel|source\.jsonl/);
    expect(blankForm[0]).toMatchObject({
      pairId: caseRow.pairId,
      caseDigest: caseRow.caseDigest,
      courseGroupSha256: caseRow.courseGroupSha256,
      reviewPacketId: packet.meta.packetId,
      reviewPacketDigest: packet.meta.packetDigest,
      reviewProtocol: 'scion-blind-instructor-review-v3',
      evidenceClass: 'qualified-human',
      independent: false,
      conflictOfInterest: null,
      reviewedAt: '',
    });
    expect(founderForm[0]).toMatchObject({
      pairId: caseRow.pairId,
      evidenceClass: 'founder-review',
      reviewerRole: 'product-founder',
      disciplineFamiliarity: 'self-declared',
      independent: false,
      conflictOfInterest: true,
      claimEligible: false,
      reviewedAt: '',
    });
    const makeReview = (reviewerId) => ({
      pairId: caseRow.pairId,
      caseDigest: caseRow.caseDigest,
      courseGroupSha256: caseRow.courseGroupSha256,
      domain: 'interaction-design',
      reviewPacketId: packet.meta.packetId,
      reviewPacketDigest: packet.meta.packetDigest,
      reviewProtocol: 'scion-blind-instructor-review-v3',
      evidenceClass: 'qualified-human',
      reviewerId,
      reviewerRole: 'working-instructor',
      reviewerDomain: 'interaction-design',
      disciplineFamiliarity: 'teaches-domain',
      independent: true,
      conflictOfInterest: false,
      reviewedAt: '2026-07-12T15:00:00.000Z',
      choice: 'A',
      factualCorrectnessA: 5,
      factualCorrectnessB: 4,
      teachabilityA: 5,
      teachabilityB: 4,
      rationale: 'Package A asks for the more direct and instructionally useful evidence judgment.',
      attestation: true,
    });
    expect(validateScionBlindReview(makeReview('instructor-valid'))).toEqual([]);
    const founderReview = {
      ...founderForm[0],
      reviewerId: 'founder-valid',
      reviewerDomain: 'interaction-design',
      reviewedAt: '2026-07-12T15:00:00.000Z',
      choice: 'B',
      factualCorrectnessA: 4,
      factualCorrectnessB: 5,
      teachabilityA: 4,
      teachabilityB: 5,
      rationale: 'Package B gives the more bounded and teachable evidence judgment for this founder research pass.',
      attestation: true,
    };
    expect(validateScionFounderReview(founderReview)).toEqual([]);
    expect(validateScionBlindReview(founderReview)).toEqual(
      expect.arrayContaining([
        'reviewer-not-working-instructor',
        'reviewer-not-domain-teaching',
        'review-not-independent',
        'reviewer-conflict-not-cleared',
      ]),
    );
    const reviewA = path.join(root, 'review-a.json');
    const reviewB = path.join(root, 'review-b.json');
    await fs.writeFile(reviewA, JSON.stringify([makeReview('instructor-a')]));
    await fs.writeFile(reviewB, JSON.stringify([makeReview('instructor-b')]));
    const wrongDomainReview = path.join(root, 'review-wrong-domain.json');
    await fs.writeFile(
      wrongDomainReview,
      JSON.stringify([{ ...makeReview('instructor-wrong-domain'), reviewerDomain: 'geology' }]),
    );
    const rejectedDomain = await ingestScionBlindReviews({
      outputDir,
      reviewFiles: [wrongDomainReview, reviewB],
      approvedOutput,
    });
    expect(rejectedDomain.invalidReviews[0].issues).toContain('reviewer-domain-mismatch');
    const wrongPacketReview = path.join(root, 'review-wrong-packet.json');
    await fs.writeFile(
      wrongPacketReview,
      JSON.stringify([{ ...makeReview('instructor-wrong-packet'), reviewPacketId: 'another-packet' }]),
    );
    const rejectedPacket = await ingestScionBlindReviews({
      outputDir,
      reviewFiles: [wrongPacketReview, reviewB],
      approvedOutput,
    });
    expect(rejectedPacket.invalidReviews[0].issues).toContain('review-packet-id-mismatch');
    const wrongCaseReview = path.join(root, 'review-wrong-case.json');
    await fs.writeFile(
      wrongCaseReview,
      JSON.stringify([{ ...makeReview('instructor-wrong-case'), caseDigest: '0'.repeat(64) }]),
    );
    const rejectedCase = await ingestScionBlindReviews({
      outputDir,
      reviewFiles: [wrongCaseReview, reviewB],
      approvedOutput,
    });
    expect(rejectedCase.invalidReviews[0].issues).toContain('review-case-digest-mismatch');
    const wrongGroupReview = path.join(root, 'review-wrong-group.json');
    await fs.writeFile(
      wrongGroupReview,
      JSON.stringify([{ ...makeReview('instructor-wrong-group'), courseGroupSha256: '0'.repeat(64) }]),
    );
    const rejectedGroup = await ingestScionBlindReviews({
      outputDir,
      reviewFiles: [wrongGroupReview, reviewB],
      approvedOutput,
    });
    expect(rejectedGroup.invalidReviews[0].issues).toContain('review-course-group-mismatch');
    const report = await ingestScionBlindReviews({
      outputDir,
      reviewFiles: [reviewA, reviewB],
      approvedOutput,
    });
    expect(report).toMatchObject({ reviewedCases: 1, approved: 1, quarantined: 0 });
    const approvedRow = JSON.parse((await fs.readFile(approvedOutput, 'utf8')).trim());
    expect(assessCorpusRow(approvedRow).eligible).toBe(true);
    expect(approvedRow).toMatchObject({
      courseId: 'interaction-design',
      courseGroupId: 'interaction-design',
      courseGroupSha256: caseRow.courseGroupSha256,
      preferenceEvidence: { courseGroupSha256: caseRow.courseGroupSha256 },
    });
    const repeated = await ingestScionBlindReviews({
      outputDir,
      reviewFiles: [reviewA, reviewB],
      approvedOutput,
    });
    expect(repeated).toMatchObject({ approved: 1, approvedExisting: 1, approvedTotal: 1 });
    expect((await fs.readFile(approvedOutput, 'utf8')).trim().split('\n')).toHaveLength(1);
    const organizerPath = path.join(outputDir, 'organizer', 'key.json');
    const organizer = JSON.parse(await fs.readFile(organizerPath, 'utf8'));
    const tamperedCase = structuredClone(organizer);
    tamperedCase.keys[0].case.prompt = 'Tampered review prompt';
    await fs.writeFile(organizerPath, JSON.stringify(tamperedCase));
    await expect(
      ingestScionBlindReviews({ outputDir, reviewFiles: [reviewA, reviewB], approvedOutput }),
    ).rejects.toThrow('integrity verification');
    const tamperedSource = structuredClone(organizer);
    tamperedSource.keys[0].sourceRow.left = JSON.stringify(goodMc({ q: 'A substituted training question.' }));
    await fs.writeFile(organizerPath, JSON.stringify(tamperedSource));
    await expect(
      ingestScionBlindReviews({ outputDir, reviewFiles: [reviewA, reviewB], approvedOutput }),
    ).rejects.toThrow('integrity verification');
    const tamperedMapping = structuredClone(organizer);
    tamperedMapping.keys[0].mapping = { A: 'right', B: 'left' };
    await fs.writeFile(organizerPath, JSON.stringify(tamperedMapping));
    await expect(
      ingestScionBlindReviews({ outputDir, reviewFiles: [reviewA, reviewB], approvedOutput }),
    ).rejects.toThrow('integrity verification');
  });

  it('balances packet selection across input-bound course groups and rejects forged group hashes', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'scion-group-balance-'));
    const source = path.join(root, 'source.jsonl');
    const outputDir = path.join(root, 'packet');
    const rows = [
      ['interaction-a', '1'.repeat(64), 'Which repeated task failure most directly supports revising navigation?'],
      ['interaction-a', '1'.repeat(64), 'Which repeated search failure most directly supports revising navigation?'],
      ['interaction-a', '1'.repeat(64), 'Which repeated labeling failure most directly supports revising navigation?'],
      [
        'interaction-b',
        '2'.repeat(64),
        'Which repeated wayfinding failure most directly supports revising navigation?',
      ],
    ].map(([courseGroupId, courseInputSha256, question], index) => ({
      kind: 'mc-item',
      prompt: `Write evidence-bearing navigation question ${index + 1}.`,
      left: JSON.stringify(goodMc({ q: question })),
      right: JSON.stringify(goodMc({ q: `${question} Choose the strongest observation.` })),
      domain: 'interaction-design',
      courseGroupId,
      pairSource: { courseInputSha256 },
      lessonId: `lesson-${index + 1}`,
    }));
    await fs.writeFile(source, `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`);

    const packet = await buildScionBlindReviewPacket({ sources: [source], outputDir, limit: 2 });
    expect(packet.cases).toHaveLength(2);
    expect(new Set(packet.cases.map((row) => row.courseGroupSha256)).size).toBe(2);
    expect(packet.meta).toMatchObject({
      courseGroupCount: 2,
      domainGroupCounts: { 'interaction-design': 2 },
      groupCoverageStatus: 'needs-more-course-groups',
    });

    const forgedSource = path.join(root, 'forged.jsonl');
    await fs.writeFile(forgedSource, `${JSON.stringify({ ...rows[0], courseGroupSha256: '0'.repeat(64) })}\n`);
    const forgedPacket = await buildScionBlindReviewPacket({
      sources: [forgedSource],
      outputDir: path.join(root, 'forged-packet'),
      limit: 1,
    });
    expect(forgedPacket.meta).toMatchObject({ selectedCases: 0, availableCandidates: 0 });
    expect(forgedPacket.meta.excludedInvalidCourseGroups).toHaveLength(1);
  });

  it('selects source-backed cases before ungrounded fill cases', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'scion-source-first-review-'));
    const source = path.join(root, 'source.jsonl');
    const rows = [
      { courseGroupId: 'ungrounded-a', digest: '1'.repeat(64), sourceContext: null },
      {
        courseGroupId: 'source-backed',
        digest: '2'.repeat(64),
        sourceContext: {
          kernelId: 'ux/task-evidence',
          term: 'Task evidence',
          claims: ['Repeated task failure is stronger navigation evidence than a single preference.'],
          attribution: ['Public usability guidance'],
          license: 'public-guidance',
        },
      },
      { courseGroupId: 'ungrounded-b', digest: '3'.repeat(64), sourceContext: null },
    ].map(({ courseGroupId, digest, sourceContext }, index) => ({
      kind: 'mc-item',
      prompt: `Write evidence-bearing navigation item ${index + 1}.`,
      left: JSON.stringify(goodMc({ q: `Which observation supports navigation decision ${index + 1} most directly?` })),
      right: JSON.stringify(
        goodMc({ q: `Which repeated observation supports navigation decision ${index + 1} most directly?` }),
      ),
      domain: 'interaction-design',
      courseGroupId,
      pairSource: { courseInputSha256: digest },
      lessonId: 'lesson-1',
      ...(sourceContext ? { sourceContext } : {}),
    }));
    await fs.writeFile(source, `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`);

    const packet = await buildScionBlindReviewPacket({
      sources: [source],
      outputDir: path.join(root, 'packet'),
      limit: 1,
    });
    expect(packet.cases).toHaveLength(1);
    expect(packet.cases[0].sourceContext).toMatchObject({ kernelId: 'ux/task-evidence' });
    expect(packet.meta).toMatchObject({
      availableCandidates: 3,
      availableSourceContextCandidates: 1,
      selectedSourceContextCases: 1,
      sourceContextDomainCounts: { 'interaction-design': 1 },
      sourceContextKindCounts: { 'mc-item': 1, 'key-term': 0 },
    });
  });

  it('separates four-domain research coverage from the stricter five-domain production target', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'scion-research-coverage-'));
    const source = path.join(root, 'source.jsonl');
    const domains = ['computer-science', 'geology', 'music-theory', 'user-experience-design'];
    const rows = domains.flatMap((domain, domainIndex) =>
      [1, 2, 3].map((groupIndex) => ({
        kind: 'mc-item',
        prompt: `Write one evidence-bearing item for ${domain} course ${groupIndex}.`,
        left: JSON.stringify(goodMc({ q: `Which evidence best supports ${domain} decision ${groupIndex}?` })),
        right: JSON.stringify(
          goodMc({ q: `Which observation most directly supports ${domain} decision ${groupIndex}?` }),
        ),
        domain,
        courseGroupId: `${domain}-course-${groupIndex}`,
        pairSource: { courseInputSha256: String(domainIndex * 3 + groupIndex).padStart(64, '0') },
        lessonId: 'lesson-1',
      })),
    );
    await fs.writeFile(source, `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`);
    const packet = await buildScionBlindReviewPacket({
      sources: [source],
      outputDir: path.join(root, 'packet'),
      limit: rows.length,
    });
    expect(packet.meta).toMatchObject({
      domainCount: 4,
      courseGroupCount: 12,
      groupCoverageStatus: 'ready',
      researchCoverageStatus: 'ready',
      researchCampaignReady: true,
      coverageStatus: 'needs-more-domains',
      campaignReady: false,
    });
    expect(Object.values(packet.meta.domainGroupCounts)).toEqual([3, 3, 3, 3]);
  });

  it('derives neutral review candidates from matched real-project shapes without declaring a winner', () => {
    const project = (question, termExample) => ({
      promptText: 'Interaction Design, a one-lesson course about evidence-based navigation decisions.',
      fileNames: [],
      courseGraphJson: JSON.stringify({
        sessions: [{ number: 1, title: 'Lesson 1: Evidence-Based Navigation Design' }],
        enrichmentOverlay: {
          lessonContent: {
            'lesson-1': {
              quizItems: [{ ...goodMc({ q: question }), type: 'multiple_choice' }],
              keyTerms: [
                {
                  term: 'Behavioral evidence',
                  definition:
                    'Observed user actions that support or challenge a specific interpretation of an interface problem.',
                  example: termExample,
                  misconception: 'A stakeholder preference is equivalent to observed user behavior.',
                  correction: 'Preference and behavior are different evidence types and support different conclusions.',
                },
              ],
            },
          },
        },
      }),
    });
    const result = buildMatchedReviewCandidates([
      {
        id: 'design-pair',
        domain: 'interaction-design',
        courseGroupId: 'interaction-design-evidence',
        candidateRoute: 'scion-test',
        candidateModel: 'Scion',
        referenceModel: 'Reference',
        candidateProject: project(
          'Which evidence most directly supports revising the prototype navigation?',
          'Three participants fail the same labeled navigation task during a recorded session.',
        ),
        referenceProject: project(
          'Which observation most directly supports changing the prototype navigation?',
          'Repeated search failures reveal that the navigation label does not match participant expectations.',
        ),
      },
    ]);
    expect(result.summary).toMatchObject({
      pairs: 1,
      candidates: 2,
      domainCount: 1,
      courseGroupCount: 1,
      domainGroupCounts: { 'interaction-design': 1 },
      groupCoverageStatus: 'needs-more-course-groups',
    });
    expect(result.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'mc-item', left: expect.any(String), right: expect.any(String) }),
        expect.objectContaining({ kind: 'key-term', left: expect.any(String), right: expect.any(String) }),
      ]),
    );
    expect(result.rows.every((row) => !('chosen' in row) && !('rejected' in row))).toBe(true);
    expect(result.rows.every((row) => row.pairSource.courseInputSha256?.length === 64)).toBe(true);
    expect(result.rows.every((row) => row.courseGroupId === 'interaction-design-evidence')).toBe(true);
    expect(result.rows.every((row) => row.courseGroupSha256?.length === 64)).toBe(true);
    expect(result.rows.every((row) => row.pairSource.courseGroupSha256 === row.courseGroupSha256)).toBe(true);
  });

  it('excludes mismatched course inputs and permits numbered fallback only for repeated generic titles', () => {
    const project = ({ promptText, titles, questions }) => ({
      promptText,
      fileNames: [],
      courseGraphJson: JSON.stringify({
        sessions: titles.map((title, index) => ({ number: index + 1, title })),
        enrichmentOverlay: {
          lessonContent: Object.fromEntries(
            questions.map((question, index) => [
              `lesson-${index + 1}`,
              { quizItems: [{ ...goodMc({ q: question }), type: 'multiple_choice' }], keyTerms: [] },
            ]),
          ),
        },
      }),
    });
    const samePrompt = 'Music Theory, two lessons covering notation followed by harmony.';
    const included = {
      id: 'music-pair',
      domain: 'music-theory',
      candidateRoute: 'scion-test',
      candidateModel: 'Scion',
      referenceModel: 'Reference',
      candidateProject: project({
        promptText: samePrompt,
        titles: ['Lesson 1: Staff and Notation', 'Lesson 2: Chords and Harmony'],
        questions: [
          'Which symbol most directly identifies the pitch assigned to a staff line?',
          'Which observation most directly identifies a stable harmonic resolution?',
        ],
      }),
      referenceProject: project({
        promptText: samePrompt,
        titles: ['Lesson 1: Music Theory Fundamentals', 'Lesson 2: Music Theory Fundamentals'],
        questions: [
          'Which notation feature most directly identifies a pitch on the staff?',
          'Which cadence most directly creates a stable harmonic resolution?',
        ],
      }),
    };
    const mismatched = {
      ...included,
      id: 'mismatched-pair',
      domain: 'world-literature',
      referenceProject: { ...included.referenceProject, promptText: 'A different course input.' },
    };
    const result = buildMatchedReviewCandidates([included, mismatched]);
    expect(result.summary).toMatchObject({ pairs: 2, eligiblePairs: 1, excludedPairs: 1, candidates: 2 });
    expect(result.summary.pairReports.find((pair) => pair.id === 'mismatched-pair')).toMatchObject({
      status: 'excluded',
      issues: ['course-input-mismatch'],
    });
    expect(result.rows.every((row) => row.pairSource.matchMethod === 'lesson-number-generic-title-fallback')).toBe(
      true,
    );
  });

  it('requires source-backed project artifacts and their pair manifest to bind the same packet digest', () => {
    const leftDigest = 'a'.repeat(64);
    const rightDigest = 'b'.repeat(64);
    const project = (sourcePacketSha256, question) => ({
      promptText: 'A source-backed interaction design course.',
      fileNames: [`source-packet-${sourcePacketSha256}.json`],
      sourcePacketSha256,
      courseGraphJson: JSON.stringify({
        sessions: [{ number: 1, title: 'Lesson 1: Navigation Evidence' }],
        enrichmentOverlay: {
          lessonContent: {
            'lesson-1': { quizItems: [{ ...goodMc({ q: question }), type: 'multiple_choice' }], keyTerms: [] },
          },
        },
      }),
    });
    const result = buildMatchedReviewCandidates([
      {
        id: 'source-packet-mismatch',
        domain: 'interaction-design',
        courseGroupId: 'source-bound-navigation',
        sourcePacketSha256: leftDigest,
        candidateRoute: 'scion-test',
        candidateModel: 'Scion',
        referenceModel: 'Reference',
        candidateProject: project(leftDigest, 'Which observation best supports revising the navigation label?'),
        referenceProject: project(rightDigest, 'Which evidence best supports revising the navigation label?'),
      },
    ]);
    expect(result.summary).toMatchObject({ eligiblePairs: 0, excludedPairs: 1, candidates: 0 });
    expect(result.summary.pairReports[0].issues).toEqual(
      expect.arrayContaining(['course-input-mismatch', 'source-packet-digest-mismatch']),
    );
  });

  it('carries the shared neutral source claims into every source-backed review candidate', () => {
    const sourcePacketSha256 = 'c'.repeat(64);
    const sourcePacket = {
      kernels: [
        {
          id: 'ux/navigation-evidence',
          term: 'Navigation evidence',
          definition: 'Observed task performance provides direct evidence about whether a navigation label works.',
          facts: [{ text: 'Repeated failure on the same labeled task supports revisiting that navigation label.' }],
          attribution: ['Public teaching source'],
          license: 'CC BY 4.0',
        },
      ],
    };
    const project = (question) => ({
      promptText: 'A source-backed interaction design course.',
      fileNames: [`source-packet-${sourcePacketSha256}.json`],
      sourcePacketSha256,
      scionSourceCapture: {
        courseGroupId: 'source-bound-navigation',
        sourcePacketSha256,
        sourcePacket,
        admittedPromptIds: ['source-bound-navigation:ux/navigation-evidence'],
      },
      courseGraphJson: JSON.stringify({
        sessions: [{ number: 1, title: 'Lesson 1: Navigation Evidence' }],
        enrichmentOverlay: {
          lessonContent: {
            'lesson-1': { quizItems: [{ ...goodMc({ q: question }), type: 'multiple_choice' }], keyTerms: [] },
          },
        },
      }),
    });
    const result = buildMatchedReviewCandidates([
      {
        id: 'source-context-pair',
        domain: 'interaction-design',
        courseGroupId: 'source-bound-navigation',
        sourcePacketSha256,
        candidateRoute: 'scion-test',
        candidateModel: 'Scion',
        referenceModel: 'Reference',
        candidateProject: project('Which observation best supports revising the navigation label?'),
        referenceProject: project('Which evidence best supports revising the navigation label?'),
      },
    ]);
    expect(result.summary).toMatchObject({ eligiblePairs: 1, excludedPairs: 0, candidates: 1 });
    expect(result.rows[0]).toMatchObject({
      sourceContext: {
        sourcePacketSha256,
        kernelId: 'ux/navigation-evidence',
        claims: expect.arrayContaining([
          'Observed task performance provides direct evidence about whether a navigation label works.',
        ]),
      },
      pairSource: { sourcePacketSha256, sourceKernelId: 'ux/navigation-evidence' },
    });
  });

  it('excludes every pair when one explicit course-group label hides different course inputs', () => {
    const project = (promptText, question) => ({
      promptText,
      fileNames: [],
      courseGraphJson: JSON.stringify({
        sessions: [{ number: 1, title: 'Lesson 1: Evidence-Based Navigation Design' }],
        enrichmentOverlay: {
          lessonContent: {
            'lesson-1': { quizItems: [{ ...goodMc({ q: question }), type: 'multiple_choice' }], keyTerms: [] },
          },
        },
      }),
    });
    const makePair = (id, promptText) => ({
      id,
      domain: 'interaction-design',
      courseGroupId: 'reused-group-label',
      candidateRoute: 'scion-test',
      candidateModel: 'Scion',
      referenceModel: 'Reference',
      candidateProject: project(promptText, `Which observation best supports navigation decision ${id}?`),
      referenceProject: project(promptText, `Which evidence best supports navigation decision ${id}?`),
    });
    const result = buildMatchedReviewCandidates([
      makePair('pair-a', 'Course A about navigation labels.'),
      makePair('pair-b', 'Course B about navigation hierarchy.'),
    ]);
    expect(result.summary).toMatchObject({
      pairs: 2,
      eligiblePairs: 0,
      excludedPairs: 2,
      candidates: 0,
      groupIntegrityStatus: 'blocked-course-group-id-collision',
    });
    expect(result.summary.courseGroupIdCollisions).toHaveLength(1);
    expect(result.summary.pairReports.every((pair) => pair.issues.includes('course-group-id-input-mismatch'))).toBe(
      true,
    );
  });
});
