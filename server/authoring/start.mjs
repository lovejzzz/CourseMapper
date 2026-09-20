import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { createFirestoreStore } from './firestoreStore.mjs';
import { createTokenVerifier } from './auth.mjs';
import { createExchangeApp } from './app.mjs';
import { hash } from '../../src/lib/authoringCore/core.js';
import { createIdentityLinkStore, createIdentityLinkService } from './identityLinks.mjs';
import { readServerConfig } from './config.mjs';
const { resource, issuer, jwksUrl, websiteOrigin, port, host, databaseId, remoteWritesEnabled, applyEnabled } =
  readServerConfig(process.env);
initializeApp({ credential: applicationDefault() });
const db = getFirestore(databaseId);
const verifyToken = createTokenVerifier({
  issuer,
  audience: resource,
  jwksUrl,
  resolveIdentity: async ({ issuer, subject }) => {
    const key = await hash([issuer, subject]);
    const record = await db.collection('authoringExchangeV2').doc('_identities').collection('bindings').doc(key).get();
    return record.exists ? record.data() : null;
  },
});
const app = createExchangeApp({
  store: createFirestoreStore(db),
  remoteWritesEnabled,
  applyEnabled,
  verifyToken,
  identityLinks: process.env.AUTHORING_LINK_CLIENT_ID
    ? createIdentityLinkService({
        store: createIdentityLinkStore(db),
        issuer,
        jwksUrl,
        clientId: process.env.AUTHORING_LINK_CLIENT_ID,
        websiteOrigin,
      })
    : null,
  verifyWebsiteToken: (token) => getAuth().verifyIdToken(token, true),
  resource,
  issuer,
  websiteOrigin,
});
app.listen(port, host, () =>
  console.log('Authoring exchange listening; model inference is not installed in this service.'),
);
