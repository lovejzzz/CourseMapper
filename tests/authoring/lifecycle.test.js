import { it, expect } from 'vitest';
import { indexedDB } from 'fake-indexeddb';
import { setup, completeDraft } from './helpers.js';
import { deleteOwnedRequest } from '../../src/lib/authoringCore/lifecycle.js';

it('deletes private drafts with CAS and leaves a content-free tombstone that prevents resurrection', async () => {
  const ctx = await setup(indexedDB);
  const { record } = await completeDraft(ctx);
  await expect(deleteOwnedRequest(ctx.store, record.id, record.storageVersion, 'other')).rejects.toThrow(
    'not available',
  );
  await expect(deleteOwnedRequest(ctx.store, record.id, record.storageVersion - 1, 'local')).rejects.toThrow('changed');
  await ctx.store.saveRemoteApplication({ id: 'formal-course', snapshot: { text: 'Keep my applied course' } });
  await deleteOwnedRequest(ctx.store, record.id, record.storageVersion, 'local');
  const deleted = await ctx.store.get(record.id);
  expect(Object.keys(deleted).sort()).toEqual(['deleted', 'id', 'owner', 'revoked', 'storageVersion']);
  expect((await ctx.call('get_context', { requestId: record.id })).error.code).toBe('NOT_FOUND');
  expect(await ctx.store.list('local')).toEqual([]);
  expect((await ctx.store.get('remoteApplication:formal-course')).snapshot.text).toBe('Keep my applied course');
  await expect(ctx.store.cas(record.id, record.storageVersion, record)).rejects.toThrow('changed');
  expect(await deleteOwnedRequest(ctx.store, record.id, record.storageVersion, 'local')).toEqual({ deleted: true });
});
