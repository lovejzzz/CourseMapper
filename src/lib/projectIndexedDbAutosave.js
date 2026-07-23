export const PROJECT_AUTOSAVE_DATABASE_NAME = 'coursemapper-project-autosave-v1';
export const PROJECT_AUTOSAVE_DATABASE_VERSION = 1;
export const PROJECT_AUTOSAVE_STORE_NAME = 'projects';
export const PROJECT_AUTOSAVE_RECORD_ID = 'current';

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB request failed.'));
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('IndexedDB transaction failed.'));
    transaction.onabort = () => reject(transaction.error || new Error('IndexedDB transaction aborted.'));
  });
}

export function createProjectIndexedDbAutosaveStore({
  indexedDb = globalThis.indexedDB,
  databaseName = PROJECT_AUTOSAVE_DATABASE_NAME,
} = {}) {
  if (!indexedDb?.open) throw new Error('IndexedDB is unavailable for project autosave.');

  let databasePromise = null;
  const openDatabase = () => {
    if (databasePromise) return databasePromise;
    databasePromise = new Promise((resolve, reject) => {
      const request = indexedDb.open(databaseName, PROJECT_AUTOSAVE_DATABASE_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(PROJECT_AUTOSAVE_STORE_NAME)) {
          database.createObjectStore(PROJECT_AUTOSAVE_STORE_NAME, { keyPath: 'id' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Unable to open the project autosave database.'));
      request.onblocked = () => reject(new Error('Project autosave database upgrade was blocked.'));
    }).catch((error) => {
      databasePromise = null;
      throw error;
    });
    return databasePromise;
  };

  return {
    async save(payload) {
      if (typeof payload !== 'string' || payload.length === 0) {
        throw new Error('Project autosave payload must be a non-empty JSON string.');
      }
      const database = await openDatabase();
      const transaction = database.transaction(PROJECT_AUTOSAVE_STORE_NAME, 'readwrite');
      transaction.objectStore(PROJECT_AUTOSAVE_STORE_NAME).put({
        id: PROJECT_AUTOSAVE_RECORD_ID,
        payload,
        savedAt: Date.now(),
      });
      await transactionDone(transaction);
    },

    async load() {
      const database = await openDatabase();
      const transaction = database.transaction(PROJECT_AUTOSAVE_STORE_NAME, 'readonly');
      const done = transactionDone(transaction);
      const record = await requestResult(
        transaction.objectStore(PROJECT_AUTOSAVE_STORE_NAME).get(PROJECT_AUTOSAVE_RECORD_ID),
      );
      await done;
      return typeof record?.payload === 'string' ? record.payload : '';
    },

    async remove() {
      const database = await openDatabase();
      const transaction = database.transaction(PROJECT_AUTOSAVE_STORE_NAME, 'readwrite');
      transaction.objectStore(PROJECT_AUTOSAVE_STORE_NAME).delete(PROJECT_AUTOSAVE_RECORD_ID);
      await transactionDone(transaction);
    },
  };
}

let sharedStore = null;

function getSharedStore() {
  if (!sharedStore) sharedStore = createProjectIndexedDbAutosaveStore();
  return sharedStore;
}

export function saveProjectIndexedDbAutosave(payload) {
  return getSharedStore().save(payload);
}

export function loadProjectIndexedDbAutosave() {
  return getSharedStore().load();
}

export function removeProjectIndexedDbAutosave() {
  if (!globalThis.indexedDB?.open) return Promise.resolve();
  return getSharedStore().remove();
}

export function resetProjectIndexedDbAutosaveForTests() {
  sharedStore = null;
}
