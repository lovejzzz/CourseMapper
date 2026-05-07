import React from 'react';
import UserMenu from './UserMenu';
import DarkModeToggle from './DarkModeToggle';

export default function Header({
  onOpenProjects,
  onOpenHelp,
  compact,
  developerMode = false,
  onDeveloperModeChange,
  onOpenDeveloperPanel,
}) {
  return (
    <>
      <header className={`relative ${compact ? 'pt-3 pb-2 px-6' : 'pt-4 pb-2 px-8'} max-w-7xl mx-auto`}>
        {/* Decorative top accent — thinner, more refined */}
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-indigo-400/40 to-transparent" />

        <div className="flex items-center justify-between w-full">
          <a href="#/" className="flex items-center" aria-label="Course Mapper home">
            {/* Crop the subtitle from the bottom of the logo image */}
            <div className={`overflow-hidden ${compact ? 'h-8' : 'h-16 sm:h-20 md:h-24'}`}>
              <img
                src={`${import.meta.env.BASE_URL}CMlogo.png`}
                alt="Course Mapper"
                className={`${compact ? 'h-12' : 'h-24 sm:h-28 md:h-36'} w-auto object-contain object-top`}
              />
            </div>
          </a>

          <div className="flex items-center gap-2">
            <DarkModeToggle />
            {developerMode && onOpenDeveloperPanel && (
              <button
                onClick={onOpenDeveloperPanel}
                className="tactile hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-pill text-[11px] font-semibold text-indigo-600 bg-indigo-50/80 border border-indigo-200/50 hover:bg-indigo-100/80 hover:border-indigo-300/60 shadow-glass transition-all duration-300"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 9l-3 3 3 3m8-6l3 3-3 3M13 5l-2 14"
                  />
                </svg>
                IDE
              </button>
            )}
            {onOpenProjects && (
              <UserMenu
                onOpenProjects={onOpenProjects}
                developerMode={developerMode}
                onDeveloperModeChange={onDeveloperModeChange}
                onOpenDeveloperPanel={onOpenDeveloperPanel}
              />
            )}
            {onOpenHelp && (
              <button
                onClick={onOpenHelp}
                className="tactile group flex items-center gap-2 px-4 py-2 rounded-pill text-[11px] font-semibold text-slate-500 bg-white/50 border border-slate-200/40 hover:bg-indigo-50/70 hover:text-indigo-600 hover:border-indigo-200/50 shadow-glass hover:shadow-glow-indigo transition-all duration-300"
              >
                <svg
                  className="w-3.5 h-3.5 group-hover:scale-110 transition-transform duration-300"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                Help
              </button>
            )}
          </div>
        </div>
      </header>
    </>
  );
}
