/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SETUP_RECOVERY_KEY, clearSetupRecovery, readSetupRecovery, stageSetupRecovery } from '../setupRecovery';

describe('setup recovery across stale app bundles', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-17T20:00:00Z'));
  });

  afterEach(() => {
    clearSetupRecovery();
    vi.useRealTimers();
  });

  it('restores the course brief and safe startup action after a reload', () => {
    stageSetupRecovery({
      promptText: 'Build a two-lesson calculus course.',
      action: { type: 'continue', ignored: 'not persisted' },
    });

    expect(readSetupRecovery()).toMatchObject({
      promptText: 'Build a two-lesson calculus course.',
      action: { type: 'continue' },
      hadAttachments: false,
      attachmentNames: [],
    });
  });

  it('records attachment names without attempting to serialize private file contents', () => {
    stageSetupRecovery({
      promptText: 'Use the attached syllabus.',
      files: [
        { name: 'calculus-syllabus.pdf', size: 1234, privateBytes: 'do-not-store' },
        { name: 'weekly-plan.docx', size: 5678 },
      ],
      action: { type: 'quickStart' },
    });

    const recovery = readSetupRecovery();
    expect(recovery).toMatchObject({
      hadAttachments: true,
      attachmentNames: ['calculus-syllabus.pdf', 'weekly-plan.docx'],
      action: { type: 'quickStart' },
    });
    expect(sessionStorage.getItem(SETUP_RECOVERY_KEY)).not.toContain('do-not-store');
  });

  it('rejects stale, corrupt, and unsupported recovery records', () => {
    stageSetupRecovery({ promptText: 'Old brief', action: { type: 'continue' } });
    vi.advanceTimersByTime(31 * 60 * 1000);
    expect(readSetupRecovery()).toBeNull();

    sessionStorage.setItem(SETUP_RECOVERY_KEY, '{bad json');
    expect(readSetupRecovery()).toBeNull();

    expect(stageSetupRecovery({ promptText: 'Unsafe', action: { type: 'deleteProject' } })).toBeNull();
  });
});
