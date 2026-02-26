// src/lib/firebase.js — Firebase initialization (lazy-loaded)
import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
};

// Only initialise Firebase when config is present (graceful no-op otherwise)
const hasConfig = firebaseConfig.apiKey && firebaseConfig.projectId;

const app  = hasConfig ? initializeApp(firebaseConfig) : null;
const auth = hasConfig ? getAuth(app) : null;
const db   = hasConfig ? getFirestore(app) : null;
const googleProvider = hasConfig ? new GoogleAuthProvider() : null;

// Request drive.file scope so Firebase sign-in also grants Google Drive access.
// This unifies the sign-in popup — users don't need a separate OAuth consent for exports.
if (googleProvider) {
  googleProvider.addScope('https://www.googleapis.com/auth/drive.file');
}

export { app, auth, db, googleProvider, hasConfig };
