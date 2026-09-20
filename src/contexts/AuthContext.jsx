// src/contexts/AuthContext.jsx — Firebase Auth state + React context
import React, { createContext, useContext, useState, useEffect } from 'react';

import { setAccountStorageUser } from '../lib/accountStorage';

const AuthContext = createContext({
  user: null,
  loading: true,
  error: null,
  signInWithGoogle: () => {},
  signOut: () => {},
  signInWithEmail: async () => false,
  reauthenticateWithEmail: async () => false,
});

let firebaseAuthPromise = null;

function loadFirebaseAuth() {
  if (!firebaseAuthPromise) {
    firebaseAuthPromise = Promise.all([import('../lib/firebase'), import('firebase/auth')]).then(
      ([firebaseModule, authModule]) => ({
        auth: firebaseModule.auth,
        googleProvider: firebaseModule.googleProvider,
        hasConfig: firebaseModule.hasConfig,
        onAuthStateChanged: authModule.onAuthStateChanged,
        signInWithPopup: authModule.signInWithPopup,
        signInWithEmailAndPassword: authModule.signInWithEmailAndPassword,
        reauthenticateWithCredential: authModule.reauthenticateWithCredential,
        EmailAuthProvider: authModule.EmailAuthProvider,
        firebaseSignOut: authModule.signOut,
      }),
    );
  }
  return firebaseAuthPromise;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  /* ---- listen for auth state changes ---- */
  useEffect(() => {
    let cancelled = false;
    let unsub = null;

    loadFirebaseAuth()
      .then(({ auth, hasConfig, onAuthStateChanged }) => {
        if (cancelled) return;
        if (!hasConfig || !auth) {
          setLoading(false);
          return;
        }
        unsub = onAuthStateChanged(
          auth,
          (firebaseUser) => {
            if (cancelled) return;
            setAccountStorageUser(firebaseUser?.uid);
            setUser(firebaseUser);
            setLoading(false);
          },
          (err) => {
            if (cancelled) return;
            console.error('[Auth] state listener error', err);
            setError(err);
            setLoading(false);
          },
        );
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('[Auth] Firebase load error', err);
        setError(err);
        setLoading(false);
      });

    return () => {
      cancelled = true;
      if (typeof unsub === 'function') unsub();
    };
  }, []);

  /* ---- Google sign-in (popup — single window, no third-party cookie issues) ---- */
  const handleSignIn = async () => {
    try {
      setError(null);
      const { auth, googleProvider, hasConfig, signInWithPopup } = await loadFirebaseAuth();
      if (!hasConfig || !auth || !googleProvider) {
        setError(new Error('Firebase is not configured'));
        return;
      }
      const result = await signInWithPopup(auth, googleProvider);
      // Firebase does not emit an auth-state change when the UID is unchanged.
      // Keep the fresh User/refresh token so connection management sees the new auth_time.
      setAccountStorageUser(result.user?.uid);
      setUser(result.user);
    } catch (err) {
      // Ignore if user closed the popup
      if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') return;
      console.error('[Auth] sign-in error', err);
      setError(err);
    }
  };

  // Keep passwords inside the Firebase call; never log or persist credential objects.
  const handleEmailSignIn = async (email, password, reauthenticate = false) => {
    setError(null);
    try {
      const api = await loadFirebaseAuth();
      if (!api.hasConfig || !api.auth) throw new Error('Unavailable');
      let result;
      if (reauthenticate) {
        const current = api.auth.currentUser;
        if (!current?.email || current.uid !== user?.uid) throw new Error('Account changed');
        result = await api.reauthenticateWithCredential(
          current,
          api.EmailAuthProvider.credential(current.email, password),
        );
        if (api.auth.currentUser?.uid !== current.uid) throw new Error('Account changed');
      } else {
        result = await api.signInWithEmailAndPassword(api.auth, email.trim(), password);
      }
      setAccountStorageUser(result.user?.uid);
      setUser(result.user);
      return true;
    } catch {
      setError(new Error('Email sign-in failed. Check your credentials and try again.'));
      return false;
    }
  };

  /* ---- Sign out ---- */
  const handleSignOut = async () => {
    try {
      setError(null);
      const [{ clearTokenCache }, { auth, firebaseSignOut }] = await Promise.all([
        import('../lib/googleTokenCache'),
        loadFirebaseAuth(),
      ]);
      if (!auth) return;
      clearTokenCache(); // clear cached Google Drive access token
      await firebaseSignOut(auth);
    } catch (err) {
      console.error('[Auth] sign-out error', err);
      setError(err);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        error,
        signInWithGoogle: handleSignIn,
        signInWithEmail: (email, password) => handleEmailSignIn(email, password),
        reauthenticateWithEmail: (password) => handleEmailSignIn(null, password, true),
        signOut: handleSignOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
