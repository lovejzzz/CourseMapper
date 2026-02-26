// src/contexts/AuthContext.jsx — Firebase Auth state + React context
import React, { createContext, useContext, useState, useEffect } from 'react';
import { auth, googleProvider, hasConfig } from '../lib/firebase';
import {
  signInWithRedirect,
  getRedirectResult,
  onAuthStateChanged,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import { clearTokenCache } from '../lib/googleDrive';

const AuthContext = createContext({
  user: null,
  loading: true,
  error: null,
  signInWithGoogle: () => {},
  signOut: () => {},
});

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(!!hasConfig); // only "loading" if Firebase is configured
  const [error, setError]     = useState(null);

  /* ---- listen for auth state changes ---- */
  useEffect(() => {
    if (!auth) { setLoading(false); return; }
    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);
    }, (err) => {
      console.error('[Auth] state listener error', err);
      setError(err);
      setLoading(false);
    });
    return unsub;
  }, []);

  /* ---- Handle redirect result (runs once after returning from Google) ---- */
  useEffect(() => {
    if (!auth) return;
    getRedirectResult(auth).catch((err) => {
      // Ignore cancelled / no-redirect cases
      if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') return;
      console.error('[Auth] redirect result error', err);
      setError(err);
    });
  }, []);

  /* ---- Google sign-in (redirect — no popup window) ---- */
  const handleSignIn = async () => {
    if (!auth || !googleProvider) {
      setError(new Error('Firebase is not configured'));
      return;
    }
    try {
      setError(null);
      // Redirect to Google — user picks account, then returns to this page.
      // onAuthStateChanged fires automatically when the page reloads.
      await signInWithRedirect(auth, googleProvider);
    } catch (err) {
      console.error('[Auth] sign-in error', err);
      setError(err);
    }
  };

  /* ---- Sign out ---- */
  const handleSignOut = async () => {
    if (!auth) return;
    try {
      setError(null);
      clearTokenCache(); // clear cached Google Drive access token
      await firebaseSignOut(auth);
    } catch (err) {
      console.error('[Auth] sign-out error', err);
      setError(err);
    }
  };

  return (
    <AuthContext.Provider value={{
      user,
      loading,
      error,
      signInWithGoogle: handleSignIn,
      signOut: handleSignOut,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
