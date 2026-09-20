import { initializeApp, applicationDefault, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createFirestoreStore } from './firestoreStore.mjs';
import { readDatabaseId } from './config.mjs';
const apply = process.argv.includes('--apply');
if (process.argv.slice(2).some((arg) => arg !== '--apply'))
  throw new Error('Usage: node server/authoring/cleanup.mjs [--apply]');
const app = initializeApp({ credential: applicationDefault() });
try {
  const db = getFirestore(app, readDatabaseId(process.env));
  const store = createFirestoreStore(db);
  const owners = await db.collection('authoringExchangeV2').listDocuments();
  const totals = { applied: apply, owners: 0, expiredRequests: 0, unreferencedBlocks: 0 };
  for (const owner of owners) {
    if (owner.id === '_identities') continue;
    const result = await store.cleanupOwner(owner.id, { apply });
    totals.owners++;
    totals.expiredRequests += result.expiredRequests;
    totals.unreferencedBlocks += result.unreferencedBlocks;
  }
  console.log(JSON.stringify(totals)); // Counts only: no account IDs, content, or credentials.
} catch {
  // Keep dependency diagnostics, account IDs and document paths out of job logs.
  console.error(JSON.stringify({ ok: false, error: 'RETENTION_FAILED' }));
  process.exitCode = 1;
} finally {
  await deleteApp(app);
}
