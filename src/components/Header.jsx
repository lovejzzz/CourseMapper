import React from 'react';

export default function Header() {
  return (
    <header className="sticky top-0 z-50 glass-dark shadow-glass-lg">
      <div className="max-w-7xl mx-auto px-8 py-4 flex items-center gap-4">
        <div className="w-10 h-10 rounded-squircle-xs bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-btn">
          <svg
            className="w-5 h-5 text-white"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2"
            />
          </svg>
        </div>
        <div>
          <h1 className="text-lg font-bold tracking-tight text-white">Course Mapper</h1>
          <p className="text-white/50 text-xs font-medium tracking-wide">
            AI-powered syllabus to course map
          </p>
        </div>
      </div>
    </header>
  );
}
