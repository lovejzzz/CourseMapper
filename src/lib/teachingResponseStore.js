import { validateResponseReview, responseReviewRevision } from './teachingResponseReview.js';

// Deliberately separate from project/cloud autosave. Each response has its own
// record; concurrent tabs cannot overwrite a whole notebook with stale state.
export function createTeachingResponseStore(
  indexedDb = globalThis.indexedDB,
  databaseName = 'coursemapper-private-response-reviews-v1',
) {
  let connection;
  async function database() {
    if (!indexedDb?.open) throw new Error('Local response storage is unavailable.');
    if (!connection)
      connection = new Promise((resolve, reject) => {
        const request = indexedDb.open(databaseName, 1);
        request.onupgradeneeded = () => request.result.createObjectStore('reviews', { keyPath: 'id' });
        request.onsuccess = () => {
          const db = request.result;
          db.onversionchange = () => {
            db.close();
            connection = null;
          };
          resolve(db);
        };
        request.onerror = () => reject(request.error || new Error('Cannot open local response storage.'));
        request.onblocked = () => reject(new Error('Close other EduTool tabs and retry local storage.'));
      }).catch((error) => {
        connection = null;
        throw error;
      });
    return connection;
  }
  async function transact(mode, operation) {
    const db = await database();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('reviews', mode);
      let result;
      tx.oncomplete = () => resolve(result);
      tx.onerror = tx.onabort = () => reject(tx.error || new Error('Local response storage failed.'));
      const request = operation(tx.objectStore('reviews'));
      request.onsuccess = () => {
        result = request.result;
      };
    });
  }
  return {
    async list() {
      const rows = await transact('readonly', (store) => store.getAll());
      const valid = [],
        unreadable = [];
      for (const row of rows) {
        try {
          valid.push(validateResponseReview(row));
        } catch {
          unreadable.push({ id: row.id });
        }
      }
      return { records: valid.sort((a, b) => b.createdAt.localeCompare(a.createdAt)), unreadable };
    },
    async save(record, expectedRevision = null) {
      validateResponseReview(record);
      const db = await database();
      await new Promise((resolve, reject) => {
        const tx = db.transaction('reviews', 'readwrite');
        let conflict;
        tx.oncomplete = () => resolve();
        tx.onerror = tx.onabort = () => reject(conflict || tx.error || new Error('Local response storage failed.'));
        const store = tx.objectStore('reviews');
        const request = store.get(record.id);
        request.onsuccess = () => {
          const actual = request.result ? responseReviewRevision(request.result) : null;
          if (actual !== expectedRevision) {
            conflict = new Error('This review changed in another tab. Reopen it before saving.');
            tx.abort();
          } else store.put(record);
        };
      });
    },
    async remove(id) {
      await transact('readwrite', (store) => store.delete(id));
    },
    async clear() {
      await transact('readwrite', (store) => store.clear());
    },
  };
}
