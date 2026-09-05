import { describe, expect, it } from 'vitest';
import {
  AGENT_RUN_CHECKPOINT_KEY,
  createAgentRunLedger,
  finalizeAgentRunLedger,
  findAgentNoProgressLoop,
  findRecoverableAgentRun,
  recordAgentProviderCall,
  recordAgentToolBatch,
  saveAgentRunCheckpoint,
} from '../agentRunLedger.js';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

function recordRead(ledger, result, iteration) {
  return recordAgentToolBatch(ledger, {
    iteration,
    now: 1100 + iteration,
    toolCalls: [{ name: 'read_lesson', args: { lessonIndex: 0 } }],
    toolResults: [{ toolName: 'read_lesson', result }],
  });
}

describe('agent run ledger', () => {
  it('tracks provider calls and stops only after repeated identical no-progress outcomes', () => {
    let ledger = createAgentRunLedger({
      runId: 'run-loop',
      request: 'Inspect lesson one',
      modelId: 'gpt-test',
      now: 1000,
    });
    ledger = recordAgentProviderCall(ledger, { iteration: 0, now: 1001 });
    ledger = recordRead(ledger, { title: 'Foundations', totalItems: 1 }, 0);
    expect(findAgentNoProgressLoop(ledger)).toBeNull();

    ledger = recordRead(ledger, { title: 'Foundations', totalItems: 1 }, 1);
    expect(findAgentNoProgressLoop(ledger)).toBeNull();

    ledger = recordRead(ledger, { title: 'Foundations', totalItems: 1 }, 2);
    expect(findAgentNoProgressLoop(ledger)).toMatchObject({ tool: 'read_lesson', repeats: 3 });
    expect(ledger.providerCallCount).toBe(1);
    expect(ledger.progressRevision).toBe(1);
  });

  it('treats changed evidence and applied mutations as progress', () => {
    let ledger = createAgentRunLedger({ runId: 'run-progress', request: 'Update lesson', now: 1000 });
    ledger = recordRead(ledger, { title: 'Before', totalItems: 1 }, 0);
    ledger = recordRead(ledger, { title: 'After', totalItems: 1 }, 1);
    ledger = recordRead(ledger, { title: 'After', totalItems: 1 }, 2);
    expect(findAgentNoProgressLoop(ledger)).toBeNull();

    ledger = recordAgentToolBatch(ledger, {
      iteration: 3,
      toolCalls: [{ name: 'edit_course_map', args: { patches: [{ lessonIndex: 0, field: 'title' }] } }],
      toolResults: [{ toolName: 'edit_course_map', result: { applied: 1, failed: 0 } }],
    });
    expect(ledger.events.at(-1)).toMatchObject({ tool: 'edit_course_map', madeProgress: true });
  });

  it('persists a bounded, argument-free checkpoint and detects same-request recovery', () => {
    const storage = memoryStorage();
    let ledger = createAgentRunLedger({ runId: 'run-private', request: 'Secret request text', now: 1000 });
    ledger = recordAgentToolBatch(ledger, {
      iteration: 0,
      now: 1100,
      toolCalls: [{ name: 'edit_course_map', args: { apiKey: 'sk-private', value: 'secret value' } }],
      toolResults: [{ toolName: 'edit_course_map', result: { applied: 1, raw: 'sensitive output' } }],
    });

    expect(saveAgentRunCheckpoint(ledger, storage)).toBe(true);
    const raw = storage.getItem(AGENT_RUN_CHECKPOINT_KEY);
    expect(raw).not.toContain('Secret request text');
    expect(raw).not.toContain('sk-private');
    expect(raw).not.toContain('secret value');
    expect(raw).not.toContain('sensitive output');
    expect(findRecoverableAgentRun('Secret request text', { storage, now: 1200 })).toMatchObject({
      runId: 'run-private',
      status: 'running',
    });
    expect(findRecoverableAgentRun('Different request', { storage, now: 1200 })).toBeNull();
  });

  it('records terminal lifecycle state', () => {
    const ledger = finalizeAgentRunLedger(createAgentRunLedger({ runId: 'run-done', request: 'Finish', now: 1000 }), {
      status: 'completed',
      stopReason: 'respond',
      now: 1400,
    });
    expect(ledger).toMatchObject({ status: 'completed', stopReason: 'respond', endedAt: 1400 });
    expect(ledger.events.at(-1)).toMatchObject({ type: 'turn.completed', status: 'completed' });
  });
});
