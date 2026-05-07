/**
 * partialFailureShape.test.js — pins the shape of the changeSummary message
 * produced by useToolInvoker when a batch edit partially fails.
 *
 * We don't render the React tree here; we replicate the exact shaping logic
 * (the `details[].success` fan-out, plus the originalInput capture) as a pure
 * function and assert it against representative tool-result fixtures. If the
 * runtime drifts, the test in useToolInvoker won't know — but anyone editing
 * the shape will have to update this test, which is the point.
 */

import { describe, it, expect } from 'vitest';

// ── Mirror of the shaping logic in useToolInvoker.js ────────────────────────
// Keep this in sync with the block starting at "If edit tool -> add
// changeSummary + trigger sync cascade" in useToolInvoker.js.
function buildChangeSummary({ toolName, toolArgs, result }) {
  const changes = [];
  const failedItems = [];
  const originalInputs = toolName === 'edit_course_map' ? toolArgs?.patches || [] : toolArgs?.actions || [];
  for (let i = 0; i < (result.details || []).length; i++) {
    const detail = result.details[i];
    if (detail.success) {
      const featureId = detail.featureId || 'courseMap';
      const actionType = detail.action === 'addItem' ? 'added' : detail.action === 'removeItem' ? 'removed' : 'edited';
      const key = `${actionType}:${featureId}`;
      const existing = changes.find((c) => `${c.type}:${c.featureId}` === key);
      if (existing) existing.count++;
      else changes.push({ type: actionType, featureId, count: 1 });
    } else {
      failedItems.push({
        index: i,
        action: detail.action || detail.patch || 'edit',
        featureId: detail.featureId || (toolName === 'edit_course_map' ? 'courseMap' : undefined),
        lessonIndex: detail.lessonIndex,
        message: detail.message || 'Unknown failure',
        originalInput: originalInputs[i] || null,
      });
    }
  }
  const applied = result.applied || 0;
  const failed = failedItems.length;
  if (changes.length === 0 && failed === 0) return null;
  const message =
    failed === 0
      ? `${applied} change${applied !== 1 ? 's' : ''} applied.`
      : applied > 0
        ? `${applied} applied · ${failed} failed`
        : `${failed} change${failed !== 1 ? 's' : ''} failed`;
  return { changes, applied, failed, failedItems, toolName, message };
}

describe('changeSummary shape for edit tools', () => {
  it('pure success — all details.success=true', () => {
    const summary = buildChangeSummary({
      toolName: 'edit_deliverables',
      toolArgs: {
        actions: [{ type: 'addItem', featureId: 'quizBank', lessonIndex: 0, item: { q: 'x', ty: 'multiple_choice' } }],
      },
      result: {
        applied: 1,
        failed: 0,
        details: [{ action: 'addItem', featureId: 'quizBank', lessonIndex: 0, success: true, message: 'ok' }],
      },
    });
    expect(summary).toEqual({
      changes: [{ type: 'added', featureId: 'quizBank', count: 1 }],
      applied: 1,
      failed: 0,
      failedItems: [],
      toolName: 'edit_deliverables',
      message: '1 change applied.',
    });
  });

  it('partial failure — captures successes AND failures with originalInput', () => {
    const args = {
      actions: [
        { type: 'addItem', featureId: 'quizBank', lessonIndex: 0, item: { q: 'good', ty: 'multiple_choice' } },
        { type: 'addItem', featureId: 'quizBank', lessonIndex: 9, item: { q: 'bad lesson', ty: 'multiple_choice' } },
      ],
    };
    const summary = buildChangeSummary({
      toolName: 'edit_deliverables',
      toolArgs: args,
      result: {
        applied: 1,
        failed: 1,
        details: [
          { action: 'addItem', featureId: 'quizBank', lessonIndex: 0, success: true, message: 'added' },
          {
            action: 'addItem',
            featureId: 'quizBank',
            lessonIndex: 9,
            success: false,
            message: 'Lesson index 9 out of range (0-2)',
          },
        ],
      },
    });
    expect(summary.applied).toBe(1);
    expect(summary.failed).toBe(1);
    expect(summary.changes).toEqual([{ type: 'added', featureId: 'quizBank', count: 1 }]);
    expect(summary.failedItems).toHaveLength(1);
    // Retry needs the exact args the agent sent — originalInput must carry them.
    expect(summary.failedItems[0]).toMatchObject({
      index: 1,
      action: 'addItem',
      featureId: 'quizBank',
      lessonIndex: 9,
      message: expect.stringMatching(/out of range/),
      originalInput: args.actions[1],
    });
    expect(summary.message).toBe('1 applied · 1 failed');
  });

  it('pure failure — applied=0, every detail failed', () => {
    const summary = buildChangeSummary({
      toolName: 'edit_course_map',
      toolArgs: { patches: [{ lessonIndex: 99, field: 'title', value: 'x' }] },
      result: {
        applied: 0,
        failed: 1,
        details: [{ patch: 'title', success: false, message: 'Invalid lessonIndex: 99' }],
      },
    });
    expect(summary).not.toBeNull();
    expect(summary.changes).toEqual([]);
    expect(summary.applied).toBe(0);
    expect(summary.failed).toBe(1);
    expect(summary.failedItems[0]).toMatchObject({
      action: 'title', // falls back to patch.field when action is missing
      featureId: 'courseMap',
      message: expect.stringMatching(/Invalid lessonIndex/),
    });
    expect(summary.message).toBe('1 change failed');
  });

  it('empty details — returns null so no card fires', () => {
    expect(
      buildChangeSummary({
        toolName: 'edit_deliverables',
        toolArgs: { actions: [] },
        result: { applied: 0, failed: 0, details: [] },
      }),
    ).toBeNull();
  });

  it('aggregates multiple successful actions of the same type into one line', () => {
    const summary = buildChangeSummary({
      toolName: 'edit_deliverables',
      toolArgs: {
        actions: [
          { type: 'addItem', featureId: 'quizBank', lessonIndex: 0 },
          { type: 'addItem', featureId: 'quizBank', lessonIndex: 1 },
          { type: 'addItem', featureId: 'quizBank', lessonIndex: 2 },
        ],
      },
      result: {
        applied: 3,
        failed: 0,
        details: [
          { action: 'addItem', featureId: 'quizBank', lessonIndex: 0, success: true },
          { action: 'addItem', featureId: 'quizBank', lessonIndex: 1, success: true },
          { action: 'addItem', featureId: 'quizBank', lessonIndex: 2, success: true },
        ],
      },
    });
    expect(summary.changes).toEqual([{ type: 'added', featureId: 'quizBank', count: 3 }]);
    expect(summary.message).toBe('3 changes applied.');
  });
});
