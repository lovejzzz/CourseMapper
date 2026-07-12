import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  assessScionKernelLesson,
  assessScionMcItem,
  assessScionPreferencePair,
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
    expect(packet.meta).toMatchObject({ selectedCases: 1, blind: true, coverageStatus: 'needs-more-domains' });
    const caseRow = packet.cases[0];
    const domainDir = path.join(outputDir, 'reviewer', 'by-domain', 'interaction-design');
    const html = await fs.readFile(path.join(domainDir, 'review.html'), 'utf8');
    const blankForm = JSON.parse(await fs.readFile(path.join(domainDir, 'review-form-1.json'), 'utf8'));
    expect(html).toContain('Blind atom review');
    expect(html).toContain('Download completed review JSON');
    expect(html).toContain(caseRow.pairId);
    expect(html).not.toMatch(/"mapping"|"sourceRow"|candidateModel|referenceModel|source\.jsonl/);
    expect(blankForm[0]).toMatchObject({
      pairId: caseRow.pairId,
      reviewPacketId: packet.meta.packetId,
      independent: false,
      conflictOfInterest: null,
      reviewedAt: '',
    });
    const makeReview = (reviewerId) => ({
      pairId: caseRow.pairId,
      domain: 'interaction-design',
      reviewPacketId: packet.meta.packetId,
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
    const report = await ingestScionBlindReviews({
      outputDir,
      reviewFiles: [reviewA, reviewB],
      approvedOutput,
    });
    expect(report).toMatchObject({ reviewedCases: 1, approved: 1, quarantined: 0 });
    expect(assessCorpusRow(JSON.parse((await fs.readFile(approvedOutput, 'utf8')).trim())).eligible).toBe(true);
  });

  it('derives neutral review candidates from matched real-project shapes without declaring a winner', () => {
    const project = (question, termExample) => ({
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
    expect(result.summary).toMatchObject({ pairs: 1, candidates: 2, domainCount: 1 });
    expect(result.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'mc-item', left: expect.any(String), right: expect.any(String) }),
        expect.objectContaining({ kind: 'key-term', left: expect.any(String), right: expect.any(String) }),
      ]),
    );
    expect(result.rows.every((row) => !('chosen' in row) && !('rejected' in row))).toBe(true);
  });
});
