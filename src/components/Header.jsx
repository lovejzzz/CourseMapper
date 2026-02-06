import React from 'react';

export default function Header() {
  return (
    <header className="relative pt-12 pb-8 px-8 max-w-7xl mx-auto">
      {/* Decorative top accent */}
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-indigo-400/60 to-transparent" />

      <div className="flex items-center gap-5">
        {/* Logo mark */}
        <div className="relative group">
          <div className="absolute -inset-1 bg-gradient-to-br from-indigo-500/20 to-violet-500/20 rounded-2xl blur-lg opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <div className="relative w-12 h-12 rounded-[14px] bg-gradient-to-br from-indigo-500 via-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
            </svg>
          </div>
        </div>

        <div>
          <h1 className="text-[22px] font-extrabold tracking-tight text-slate-800">
            Course <span className="text-gradient">Mapper</span>
          </h1>
          <p className="text-slate-400 text-[13px] font-medium tracking-wide mt-0.5">
            Transform syllabi into structured course maps with AI
          </p>
        </div>
      </div>
    </header>
  );
}
