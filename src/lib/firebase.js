// src/lib/firebase.js — Firebase initialization (lazy-loaded)
import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Firebase config is public by design — security comes from Firestore rules,
// not from hiding these values. Env vars can override for local dev if needed.
const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY            || 'AIzaSyDaVgYRIAmwP1lkoToc4SEToEq_DLG4ly8',
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN        || 'coursemapper-a92c4.firebaseapp.com',
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID         || 'coursemapper-a92c4',
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET     || 'coursemapper-a92c4.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '70767622598',
  appId:             import.meta.env.VITE_FIREBASE_APP_ID             || '1:70767622598:web:83f4e29324e1213c9d9ac7',
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
