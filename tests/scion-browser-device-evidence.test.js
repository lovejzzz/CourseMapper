import { describe, expect, it } from 'vitest';

import { auditScionDeviceConsoleEntries } from '../scripts/scionBrowserDeviceEvidenceAudit.mjs';

const recoveredGpuRestart = {
  method: 'browser-gpu-process-restart',
  observedCompletionFailure: true,
  completed: true,
  baseUsableAfterRecovery: true,
};

describe('Scion browser device console evidence', () => {
  it('classifies the three known GPU-restart errors as expected fault injection', () => {
    const report = auditScionDeviceConsoleEntries(
      [
        { level: 'error', text: 'RuntimeError: unreachable\n    at wllama.wasm' },
        { level: 'error', text: 'Cannot find waiting task with callbackId = 10' },
        { level: 'pageerror', text: 'A valid external Instance reference no longer exists.' },
      ],
      recoveredGpuRestart,
    );

    expect(report).toEqual({
      status: 'pass',
      errorEntryCount: 3,
      expectedFaultInjectionErrorCount: 3,
      unexpectedErrorCount: 0,
      issues: [],
    });
  });

  it('rejects unrecognized console errors even when GPU recovery succeeds', () => {
    const report = auditScionDeviceConsoleEntries(
      [
        { level: 'error', text: 'RuntimeError: unreachable' },
        { level: 'error', text: 'Cannot find waiting task with callbackId = 10' },
        { level: 'pageerror', text: 'A valid external Instance reference no longer exists.' },
        { level: 'error', text: 'Adapter hash mismatch' },
      ],
      recoveredGpuRestart,
    );

    expect(report.status).toBe('blocked');
    expect(report.unexpectedErrorCount).toBe(1);
    expect(report.issues).toEqual(['unexpected-console-error']);
  });

  it('does not excuse GPU-like errors without a completed matching recovery', () => {
    const report = auditScionDeviceConsoleEntries([{ level: 'error', text: 'RuntimeError: unreachable' }], {
      ...recoveredGpuRestart,
      baseUsableAfterRecovery: false,
    });

    expect(report.status).toBe('blocked');
    expect(report.unexpectedErrorCount).toBe(1);
  });
});
