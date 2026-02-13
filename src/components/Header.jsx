import React from 'react';

export default function Header() {
  return (
    <header className="relative pt-4 pb-2 px-8 max-w-7xl mx-auto">
      {/* Decorative top accent — thinner, more refined */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-indigo-400/40 to-transparent" />

      <div className="flex items-center justify-between w-full">
        <div className="flex items-center">
          <img
            src={`${import.meta.env.BASE_URL}CMlogo.png`}
            alt="Course Mapper"
            className="h-24 sm:h-32 md:h-40 w-auto object-contain"
          />
        </div>

        <div className="flex items-center gap-2">
          <a
            href="#/changelog"
            className="tactile group flex items-center gap-2 px-4 py-2 rounded-pill text-[11px] font-semibold text-slate-500 bg-white/50 border border-slate-200/40 hover:bg-violet-50/70 hover:text-violet-600 hover:border-violet-200/50 shadow-glass hover:shadow-glow-indigo transition-all duration-300"
          >
            <svg className="w-3.5 h-3.5 group-hover:scale-110 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            v0.1
          </a>
          <a
            href="#/faq"
            className="tactile group flex items-center gap-2 px-4 py-2 rounded-pill text-[11px] font-semibold text-slate-500 bg-white/50 border border-slate-200/40 hover:bg-indigo-50/70 hover:text-indigo-600 hover:border-indigo-200/50 shadow-glass hover:shadow-glow-indigo transition-all duration-300"
          >
            <svg className="w-3.5 h-3.5 group-hover:scale-110 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Help
          </a>
        </div>
      </div>
    </header>
  );
}
