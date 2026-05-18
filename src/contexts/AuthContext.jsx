// src/contexts/AuthContext.jsx — Firebase Auth state + React context
import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext({
  user: null,
  loading: true,
  error: null,
  signInWithGoogle: () => {},
  signOut: () => {},
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
      await signInWithPopup(auth, googleProvider);
      // onAuthStateChanged fires automatically after successful sign-in
    } catch (err) {
      // Ignore if user closed the popup
      if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') return;
      console.error('[Auth] sign-in error', err);
      setError(err);
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
