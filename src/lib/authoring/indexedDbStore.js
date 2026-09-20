import { assert, clone } from '../authoringCore/primitives.js';
export function createIndexedDbStore({ indexedDB = globalThis.indexedDB, name = 'coursemapper-authoring-v2' } = {}) {
  let opening;
  function open() {
    if (!opening)
      opening = new Promise((resolve, reject) => {
        if (!indexedDB) return reject(new Error('Durable browser storage is unavailable.'));
        const r = indexedDB.open(name, 1);
        r.onupgradeneeded = () => {
          r.result.createObjectStore('records');
        };
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
    return opening;
  }
  async function transaction(mode, run) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('records', mode, mode === 'readwrite' ? { durability: 'strict' } : undefined);
      let result, failure;
      tx.oncomplete = () => resolve(clone(result));
      tx.onabort = () => reject(failure || tx.error || new Error('Storage transaction aborted.'));
      tx.onerror = () => {};
      run(
        tx.objectStore('records'),
        (v) => {
          result = v;
        },
        (e) => {
          failure = e;
          tx.abort();
        },
      );
    });
  }
  return {
    async get(key) {
      return transaction('readonly', (store, done) => {
        const r = store.get(key);
        r.onsuccess = () => done(r.result || null);
      });
    },
    async list(uid) {
      return transaction('readonly', (store, done) => {
        const r = store.getAll();
        r.onsuccess = () => done(r.result.filter((x) => x.owner === uid && x.request));
      });
    },
    async cas(key, expected, value, _uid, { beforeCommit } = {}) {
      return transaction('readwrite', (store, done, fail) => {
        const r = store.get(key);
        r.onsuccess = () => {
          try {
            beforeCommit?.();
            assert(
              (r.result?.storageVersion ?? null) === expected,
              'REVISION_CONFLICT',
              'Another tab changed this draft. Refresh before continuing.',
            );
            store.put(clone(value), key);
            done(value);
          } catch (e) {
            fail(e);
          }
        };
      });
    },
    async saveRemoteApplication(application) {
      return transaction('readwrite', (store, done, fail) => {
        const key = `remoteApplication:${application.id}`;
        const r = store.get(key);
        r.onsuccess = () => {
          if (r.result) return fail(new Error('Application already saved. Recover it instead.'));
          const save = () => {
            store.put(clone(application), key);
            store.put(clone(application), 'pendingRemoteApplication');
            if (application.owner)
              store.put(
                { id: application.id, owner: application.owner },
                `pendingRemoteApplication:${application.owner}`,
              );
            done(application);
          };
          const pointer = store.get(`pendingRemoteApplication:${application.owner}`);
          pointer.onsuccess = () => {
            if (!pointer.result) return save();
            const previous = store.get(`remoteApplication:${pointer.result.id}`);
            previous.onsuccess = () => {
              if (previous.result?.phase === 'prepared')
                return fail(new Error('Recover the interrupted application before starting another.'));
              save();
            };
          };
        };
      });
    },
    // Request state and formal workspace receipt commit together. UI cannot see
    // an applied draft without its durable project and undo record.
    async apply(requestId, expected, request, application) {
      return transaction('readwrite', (store, done, fail) => {
        const r = store.get(requestId);
        r.onsuccess = () => {
          try {
            assert(r.result?.storageVersion === expected, 'REVISION_CONFLICT', 'Draft changed before application.');
            store.put(clone(request), requestId);
            store.put(clone(application), `application:${application.id}`);
            store.put(clone(application), 'latestApplication');
            done(application);
          } catch (e) {
            fail(e);
          }
        };
      });
    },
  };
}
