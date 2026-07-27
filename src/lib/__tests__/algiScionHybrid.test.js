import { describe, expect, it } from 'vitest';
import {
  assessAlgiScionHybridCandidate,
  bindAlgiEvidenceToScionPrompt,
  buildAlgiScionEvidencePacket,
  planAlgiScionHybridRoute,
} from '../algiScionHybrid.js';

function kernel(index, { researched = false } = {}) {
  const sourceId = researched ? `doaj:source-${index}` : `openstax:test#${index}`;
  const definition = `Concept ${index} is an anchored mechanism that explains one observable course decision.`;
  const fact = `Concept ${index} requires evidence before a learner can justify the resulting decision.`;
  return {
    id: `test/concept-${index}`,
    term: `Concept ${index}`,
    definition: { text: definition, anchor: { src: sourceId, loc: `Section ${index}`, quote: definition } },
    facts: [{ text: fact, anchor: { src: sourceId, loc: `Section ${index}`, quote: fact } }],
    license: researched ? 'CC0 1.0' : 'CC BY 4.0',
    attribution: [`Source ${index}`],
    provenance: researched
      ? {
          origin: 'algi-research',
          providerId: 'doaj',
          sourceUrl: `https://example.org/${index}`,
          entailment: { status: 'passed', checkedClaims: 2, minimumScore: 1, method: 'deterministic-lexical-v1' },
        }
      : { origin: 'openstax-foundry', sourceUrl: `https://openstax.org/${index}` },
  };
}

describe('Algi → Scion grounded-authoring seam', () => {
  it('builds an immutable source ledger from admitted local and researched kernels', () => {
    const packet = buildAlgiScionEvidencePacket({
      courseName: 'Test Course',
      lesson: { lessonId: 'lesson-1', title: 'Evidence' },
      kernels: [kernel(1), kernel(2, { researched: true }), kernel(3)],
    });
    expect(packet).toMatchObject({
      admitted: true,
      sourceFactPolicy: 'numbered-source-ledger-v1',
      lessonId: 'lesson-1',
    });
    expect(packet.sourceFacts).toHaveLength(5);
    expect(packet.citations).toHaveLength(3);
    expect(packet.citations[1].supportReceipt.status).toBe('passed');
  });

  it('binds evidence before the Scion call and blocks lessons without evidence', () => {
    const lesson = { lessonId: 'lesson-1', title: 'Evidence' };
    const packet = buildAlgiScionEvidencePacket({ lesson, kernels: [kernel(1), kernel(2)] });
    const prompt = bindAlgiEvidenceToScionPrompt({ lessons: [lesson, { lessonId: 'lesson-2' }] }, [packet]);
    expect(prompt.lessons[0].sourceFactPolicy).toBe('numbered-source-ledger-v1');
    expect(prompt.lessons[0].algiEvidenceReceipts).toHaveLength(2);
    expect(prompt.lessons[1].sourceFacts).toBeUndefined();

    const plan = planAlgiScionHybridRoute({
      lessons: [lesson, { lessonId: 'lesson-2' }],
      packets: [packet],
      modelAvailable: true,
    });
    expect(plan.maximumModelCalls).toBe(1);
    expect(plan.routes.map((route) => route.route)).toEqual(['scion-grounded-authoring', 'blocked']);
  });

  it('rejects any model mutation of the admitted fact ledger', () => {
    const packet = buildAlgiScionEvidencePacket({
      lesson: { lessonId: 'lesson-1', title: 'Evidence' },
      kernels: [kernel(1), kernel(2)],
    });
    expect(assessAlgiScionHybridCandidate({ facts: packet.sourceFacts }, packet).accepted).toBe(true);
    const mutated = [...packet.sourceFacts];
    mutated[0] = `${mutated[0]} It never needs evidence.`;
    expect(assessAlgiScionHybridCandidate({ facts: mutated }, packet)).toMatchObject({
      accepted: false,
      reason: 'source-fact-mutated',
    });
  });

  it('does not pass a researched kernel without an entailment receipt', () => {
    const unsafe = kernel(1, { researched: true });
    delete unsafe.provenance.entailment;
    const packet = buildAlgiScionEvidencePacket({
      lesson: { lessonId: 'lesson-1', title: 'Evidence' },
      kernels: [unsafe],
    });
    expect(packet).toMatchObject({ admitted: false, reason: 'insufficient-entailed-evidence' });
  });
});
