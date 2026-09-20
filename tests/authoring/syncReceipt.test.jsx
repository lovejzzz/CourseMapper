import { expect, it } from 'vitest';
import { buildSyncReceipt } from '../../src/components/chat/ChatPanel.jsx';

it.each(['failed', 'partialFail', 'skipped', undefined])('does not claim successful sync for %s', (status) => {
  const { receipt } = buildSyncReceipt('Assignments', 'Sync', { status });
  expect(receipt.status).toBe('review');
  expect(receipt.badge).not.toBe('Synced');
  expect(receipt.changed.join(' ')).not.toContain('Synced Assignments');
});
it('explains the authoring boundary and the next action', () => {
  const { receipt } = buildSyncReceipt('Assignments', 'Sync', {
    status: 'failed',
    syncSummary: { resultDetails: [{ reason: 'authoring_preview_required' }] },
  });
  expect(receipt.status).toBe('review');
  expect(receipt.title).toBe('Authoring review required');
  expect(receipt.changed).toEqual(['Accepted materials kept unchanged']);
  expect(receipt.next).toContain('AI authoring');
});
it('retains successful sync receipts', () => {
  expect(buildSyncReceipt('Assignments', 'Sync', { status: 'done' }).receipt).toMatchObject({
    status: 'done',
    badge: 'Synced',
  });
});
