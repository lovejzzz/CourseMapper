import { describe, expect, it } from 'vitest';
import { createAgentActionEnvelope, resolveAgentActionEnvelope } from '../agentActionEnvelope.js';

describe('Agent action envelope', () => {
  it('makes a meaning-changing action previewable, bounded, and undoable', () => {
    const envelope = createAgentActionEnvelope({
      actionId: 'agent-action-test',
      now: Date.parse('2026-08-17T12:00:00.000Z'),
      title: 'Strengthen the evidence checkpoint',
      actions: [{ type: 'editCell', lessonIndex: 1, sectionIndex: 0, field: 'weeklyAssessments', value: 'Memo' }],
      previews: [{ oldValue: 'Quiz' }],
      planReceiptSha256: 'a'.repeat(64),
    });

    expect(envelope).toMatchObject({
      protocol: 'coursemapper-agent-action-envelope-v1',
      safetyMode: 'needs-approval',
      status: 'preview',
      targets: ['courseMap/lesson:2/weeklyAssessments'],
      affectedDeliverables: ['courseMap'],
      execution: { status: 'pending', appliedCount: 0 },
      verification: { status: 'prevalidated' },
      undo: { available: true },
    });
    expect(envelope.lineage.planReceiptSha256).toBe('a'.repeat(64));
  });

  it('distinguishes executor confirmation from semantic package verification', () => {
    const envelope = createAgentActionEnvelope({
      actionId: 'agent-action-test',
      actions: [{ type: 'editTitle', lessonIndex: 0, newTitle: 'Auditing evidence' }],
    });
    const resolved = resolveAgentActionEnvelope(envelope, {
      status: 'applied',
      message: 'Renamed Lesson 1',
      appliedCount: 1,
    });

    expect(resolved).toMatchObject({
      status: 'applied',
      execution: { status: 'confirmed', appliedCount: 1 },
      verification: { status: 'execution-confirmed', semanticPackageCheck: 'recommended' },
    });
  });
});
