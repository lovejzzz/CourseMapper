import React, { useState, useEffect } from 'react';

/**
 * DarkModeToggle — Compact sun/moon toggle for dark mode.
 * Persists to localStorage, respects system preference on first visit.
 */
export default function DarkModeToggle() {
  // Initialize from localStorage / system preference in one place to avoid race
  const [dark, setDark] = useState(() => {
    const saved = localStorage.getItem('coursemapper-theme');
    if (saved === 'dark') return true;
    if (saved === 'light') return false;
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  // Sync DOM class + localStorage whenever dark changes
  useEffect(() => {
    if (dark) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('coursemapper-theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('coursemapper-theme', 'light');
    }
  }, [dark]);

  const toggleTheme = () => {
    const root = document.documentElement;
    root.classList.add('theme-switching');
    setDark((current) => !current);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => root.classList.remove('theme-switching'));
    });
  };

  return (
    <button
      onClick={toggleTheme}
      className="tactile rounded-xl border border-slate-200/70 bg-white/75 p-2 text-slate-500 shadow-sm transition-all duration-200 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-300 dark:hover:border-blue-400/40 dark:hover:bg-blue-400/10 dark:hover:text-blue-200"
      title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {dark ? (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
          />
        </svg>
      ) : (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
          />
        </svg>
      )}
    </button>
  );
}
