import { it, expect } from 'vitest';
import { indexedDB } from 'fake-indexeddb';
import { setup, completeDraft } from './helpers.js';
import { createExchangeApp } from '../../server/authoring/app.mjs';
import { createIndexedDbStore } from '../../src/lib/authoring/indexedDbStore.js';
import { prepareRemoteApplication, confirmRemoteReservation } from '../../src/lib/authoring/remoteApplication.js';
import { recoverRemoteApplication, readRemoteApplication } from '../../src/lib/authoring/remoteRecovery.js';
import { previewApplication } from '../../src/lib/authoring/application.js';
import { id } from '../../src/lib/authoringCore/primitives.js';

it('preserves a durable application across a lost HTTP receipt and blocks a second device after timeout', async () => {
  const ctx = await setup(indexedDB);
  const { record } = await completeDraft(ctx);
  const previous = record.storageVersion++;
  record.remoteAllowed = true;
  await ctx.store.cas(record.id, previous, record);
  let clock = Date.now();
  const app = createExchangeApp({
    store: ctx.store,
    verifyToken: async () => {
      throw new Error('Remote OAuth is outside this local fault test');
    },
    verifyWebsiteToken: async (token) => {
      if (token !== 'fault-test') throw new Error('Invalid fixture credential');
      return { uid: 'local' };
    },
    resource: 'https://exchange.test',
    issuer: 'https://identity.test',
    websiteOrigin: 'https://website.test',
    now: () => clock,
  });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const post = async (path, body) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/authoring/${path}`, {
      method: 'POST',
      headers: {
        Origin: 'https://website.test',
        'Content-Type': 'application/json',
        Authorization: 'Bearer fault-test',
      },
      body: JSON.stringify(body),
    });
    const result = await response.json();
    if (!result.ok) throw Object.assign(new Error(result.error.message), { code: result.error.code });
    return result.data;
  };
  try {
    const database = `device-one-${id()}`;
    const firstStore = createIndexedDbStore({ indexedDB, name: database });
    const secondStore = createIndexedDbStore({ indexedDB, name: `device-two-${id()}` });
    const preview = await previewApplication(record, ctx.draftId, null);
    const args = { uid: 'local', requestId: record.id, draftId: ctx.draftId, preview, current: null };
    const intent = await prepareRemoteApplication({ ...args, store: firstStore });
    const saved = await confirmRemoteReservation({
      store: firstStore,
      application: intent,
      api: post,
      getCurrent: () => null,
    });
    expect(saved.phase).toBe('locally-saved');
    // No receipt reaches the server during the disconnected interval.
    expect((await ctx.store.get(record.id)).drafts[ctx.draftId].application).toBeUndefined();
    const second = await prepareRemoteApplication({ ...args, store: secondStore });
    clock += 24 * 60 * 60 * 1000;
    await expect(
      confirmRemoteReservation({ store: secondStore, application: second, api: post, getCurrent: () => null }),
    ).rejects.toMatchObject({ code: 'APPLICATION_LOCKED' });
    expect((await readRemoteApplication(firstStore, 'local')).reportPending).toBe(true);
    const receipt = {
      requestId: record.id,
      draftId: ctx.draftId,
      applicationId: saved.id,
      contentHash: saved.appliedHash,
    };
    // The server commits the receipt, but the caller loses the response.
    const lostResponse = async () => {
      await post('receipt', receipt);
      throw new Error('Injected connection loss after receipt commit');
    };
    await expect(lostResponse()).rejects.toThrow('Injected connection loss');
    const restartedStore = createIndexedDbStore({ indexedDB, name: database });
    const pending = await readRemoteApplication(restartedStore, 'local');
    expect(pending.reportPending).toBe(true);
    expect(pending.id).toBe(saved.id);
    const recovered = await recoverRemoteApplication({ store: restartedStore, uid: 'local', getCurrent: () => null });
    expect(recovered.snapshot).toEqual(saved.snapshot);
    await expect(
      confirmRemoteReservation({ store: secondStore, application: second, api: post, getCurrent: () => null }),
    ).rejects.toMatchObject({ code: 'APPLICATION_LOCKED' });
    expect((await readRemoteApplication(secondStore, 'local')).phase).toBe('prepared');
    const serverBefore = await ctx.store.get(record.id);
    await post('receipt', receipt);
    expect(await ctx.store.get(record.id)).toEqual(serverBefore);
    expect((await readRemoteApplication(restartedStore, 'local')).snapshot).toEqual(saved.snapshot);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
