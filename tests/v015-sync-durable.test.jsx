/**
 * v0.15 — the sync suggestion's DURABLE source (in-browser sync-test finding).
 *
 * Live repro (June 12, 2026, Beginning Korean workspace): a course-map edit
 * produced the chat card ("9 Deliverables Need Syncing") but the header CTA
 * stayed at "Review 1" and the drawer's sync class was empty — ChatPanel
 * consumes smartSync.pendingSyncSuggestion into a chat message (role
 * 'syncSuggestion', status 'pending') and CLEARS the live hook state within
 * one render. Every consumer that read the live state (the B1 queue, the
 * drawer's Sync now) was starved from the moment the card appeared.
 *
 * The fix: AppFlow reads the durable chat message (the same pattern
 * reviewObservations uses for the digest message); the drawer's Sync now
 * approves through the router's ONE pathway via chatSendRef so the plan
 * executes AND the card flips to done.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildReviewQueue } from '../src/lib/reviewQueueModel.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

// The exact shape pushSyncSuggestion stores: the suggestion spread into a
// chat message with role + status.
const SYNC_MESSAGE = {
  role: 'syncSuggestion',
  status: 'pending',
  id: 'sync_1781287000000',
  editSource: 'courseMap',
  editSummary: { fields: ['topic/section'], lessonIndices: [2], sourceFeatureId: null },
  plan: [
    { featureId: 'lessonPlans', lessonIndices: [2], changes: [{ summary: 'Lesson plan: Lesson 3 updated' }] },
    { featureId: 'syllabus', lessonIndices: null, changes: [{ summary: 'Syllabus: schedule updated' }] },
  ],
  changedFieldsSummary: 'topic/section',
};

describe('the chat message is a valid queue source', () => {
  it('a pending syncSuggestion message produces sync items and lifts the headline', () => {
    const queue = buildReviewQueue({ syncSuggestion: SYNC_MESSAGE });
    expect(queue.counts.sync).toBe(2);
    expect(queue.counts.headline).toBe(2);
    expect(queue.classes.sync[0].syncPlanId).toBe('sync_1781287000000');
  });

  it('a done/skipped message must NOT re-enter the queue (the host filters by status)', () => {
    // The model itself is status-agnostic — the HOST selects only pending
    // messages. Pin the host-side filter below in the source scans.
    const done = { ...SYNC_MESSAGE, status: 'done' };
    expect(done.status).not.toBe('pending');
  });
});

describe('host wiring (source scans)', () => {
  it('the queue owner reads the durable message (live state || chat message)', () => {
    // v0.15.1 C1: the durable-source logic moved into useReviewQueueOwner.
    const owner = read('src/hooks/useReviewQueueOwner.js');
    expect(owner).toContain("message?.role === 'syncSuggestion'");
    expect(owner).toContain("message.status === 'pending' ? message : null");
    expect(owner).toContain('syncSuggestion: pendingSyncSuggestion || pendingSyncFromChat');
    // AppFlow feeds the live state in and consumes pendingSyncFromChat out.
    const appFlow = read('src/AppFlow.jsx');
    expect(appFlow).toContain('pendingSyncSuggestion: smartSync.pendingSyncSuggestion');
  });

  it('the drawer Sync now approves through the router pathway (execute + mark done)', () => {
    const appFlow = read('src/AppFlow.jsx');
    expect(appFlow).toContain('chatSendRef.current?.approveSyncSuggestion');
    const chatPanel = read('src/components/chat/ChatPanel.jsx');
    expect(chatPanel).toContain('chatSendRef.current.approveSyncSuggestion');
    expect(chatPanel).toContain('chat.handleApproveSyncSuggestion(suggestionId, selectedPlan)');
  });

  it('the header Sync all stale action resolves the durable Agent suggestion when one exists', () => {
    const appFlow = read('src/AppFlow.jsx');
    expect(appFlow).toContain('if (smartSync.pendingSyncSuggestion || pendingSyncFromChat)');
    expect(appFlow).toContain('handleExecuteSyncFromQueue();');
  });
});
