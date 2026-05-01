// src/components/UserMenu.jsx — Sign-in button + avatar dropdown
import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

export default function UserMenu({
  onOpenProjects,
  developerMode = false,
  onDeveloperModeChange,
  onOpenDeveloperPanel,
}) {
  const { user, loading, error, signInWithGoogle, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const menuRef = useRef(null);

  /* close dropdown on outside click */
  useEffect(() => {
    if (!open) return;
    const onClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  /* Reset signing-in state when user appears or error occurs */
  useEffect(() => {
    if (user || error) setSigningIn(false);
  }, [user, error]);

  async function handleSignIn() {
    setSigningIn(true);
    try {
      await signInWithGoogle();
    } catch {
      // Error is already set in AuthContext
    } finally {
      setSigningIn(false);
    }
  }

  /* ---- Signed-out: show sign-in button ---- */
  if (!user) {
    const isLoading = loading || signingIn;
    return (
      <div className="flex items-center gap-2">
        {/* Auth error tooltip */}
        {error && !isLoading && (
          <span className="text-[10px] text-red-500 max-w-[160px] truncate" title={error.message}>
            Sign-in failed
          </span>
        )}
        <button
          onClick={handleSignIn}
          disabled={isLoading}
          className="tactile group flex items-center gap-2 px-4 py-2 rounded-pill text-[11px] font-semibold text-slate-500 bg-white/50 border border-slate-200/40 hover:bg-indigo-50/70 hover:text-indigo-600 hover:border-indigo-200/50 shadow-glass hover:shadow-glow-indigo transition-all duration-300 disabled:opacity-60"
        >
          {isLoading ? (
            <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            /* Google "G" icon */
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
          )}
          {isLoading ? 'Signing in...' : 'Sign in'}
        </button>
      </div>
    );
  }

  /* ---- Signed-in: avatar + dropdown ---- */
  const initial = (user.displayName || user.email || '?')[0].toUpperCase();
  const avatarUrl = user.photoURL;

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="tactile flex items-center gap-2 rounded-pill pl-1 pr-3 py-1 text-[11px] font-semibold text-slate-600 bg-white/50 border border-slate-200/40 hover:bg-indigo-50/70 hover:border-indigo-200/50 shadow-glass transition-all duration-300"
        aria-label="User menu"
        aria-expanded={open}
      >
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt=""
            referrerPolicy="no-referrer"
            className="w-6 h-6 rounded-full ring-1 ring-white/60"
          />
        ) : (
          <span className="w-6 h-6 rounded-full bg-indigo-500 text-white flex items-center justify-center text-[10px] font-bold ring-1 ring-white/60">
            {initial}
          </span>
        )}
        <span className="hidden sm:inline max-w-[100px] truncate">
          {user.displayName || user.email}
        </span>
        <svg className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-64 bg-white/95 backdrop-blur-lg rounded-xl shadow-xl border border-slate-200/60 py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
          {/* User info */}
          <div className="px-4 py-2 border-b border-slate-100">
            <p className="text-[12px] font-semibold text-slate-700 truncate">{user.displayName}</p>
            <p className="text-[10px] text-slate-400 truncate">{user.email}</p>
          </div>

          {/* My Projects */}
          {onOpenProjects && (
            <button
              onClick={() => { setOpen(false); onOpenProjects(); }}
              className="w-full text-left px-4 py-2 text-[11px] text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 transition-colors flex items-center gap-2"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
              My Projects
            </button>
          )}

          {/* Developer mode */}
          {onDeveloperModeChange && (
            <div className="px-4 py-2 border-t border-slate-100">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold text-slate-700">Mode</p>
                  <p className="text-[10px] text-slate-400">Show project code tools</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={developerMode}
                  onClick={() => onDeveloperModeChange(!developerMode)}
                  className={`relative flex h-7 w-[104px] items-center rounded-full border p-0.5 text-[10px] font-bold transition-all ${
                    developerMode
                      ? 'bg-indigo-500 border-indigo-400 text-white'
                      : 'bg-slate-100 border-slate-200 text-slate-500'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-6 w-[50px] rounded-full bg-white shadow-sm transition-transform ${
                      developerMode ? 'translate-x-[50px]' : 'translate-x-0'
                    }`}
                  />
                  <span className={`relative z-10 flex-1 text-center ${developerMode ? 'text-indigo-100' : 'text-slate-700'}`}>User</span>
                  <span className={`relative z-10 flex-1 text-center ${developerMode ? 'text-indigo-700' : 'text-slate-400'}`}>Dev</span>
                </button>
              </div>
            </div>
          )}

          {developerMode && onOpenDeveloperPanel && (
            <button
              onClick={() => { setOpen(false); onOpenDeveloperPanel(); }}
              className="w-full text-left px-4 py-2 text-[11px] text-indigo-600 hover:bg-indigo-50 hover:text-indigo-700 transition-colors flex items-center gap-2"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l-3 3 3 3m8-6l3 3-3 3M13 5l-2 14" />
              </svg>
              Open Developer IDE
            </button>
          )}

          {/* Sign Out */}
          <button
            onClick={() => { setOpen(false); signOut(); }}
            className="w-full text-left px-4 py-2 text-[11px] text-slate-600 hover:bg-red-50 hover:text-red-600 transition-colors flex items-center gap-2"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
