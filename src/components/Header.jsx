import React from 'react';
import UserMenu from './UserMenu';
import DarkModeToggle from './DarkModeToggle';
import AppLogo from './AppLogo';
import { Button } from './ui';

export default function Header({
  onOpenProjects,
  onOpenHelp,
  compact,
  developerMode = false,
  onDeveloperModeChange,
  onOpenDeveloperPanel,
  developerIdeDisabled = false,
  developerIdeDisabledReason = 'Developer IDE is locked while generation is running.',
}) {
  return (
    <>
      <header className={`relative ${compact ? 'pt-3 pb-2 px-6' : 'pt-4 pb-2 px-8'} max-w-7xl mx-auto`}>
        {/* Decorative top accent — thinner, more refined */}
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-indigo-400/40 to-transparent" />

        <div className="flex items-center justify-between w-full">
          <a href="#/" className="flex items-center" aria-label="Course Mapper home">
            <AppLogo className={`${compact ? 'h-10 sm:h-12' : 'h-14 sm:h-16 md:h-20'} w-auto object-contain`} />
          </a>

          <div className="flex items-center gap-2">
            <DarkModeToggle />
            {developerMode && onOpenDeveloperPanel && (
              <Button
                variant="accent"
                size="sm"
                onClick={onOpenDeveloperPanel}
                disabled={developerIdeDisabled}
                title={developerIdeDisabled ? developerIdeDisabledReason : 'Open Developer IDE'}
                className="tactile hidden sm:inline-flex rounded-pill font-semibold shadow-glass"
                icon={
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8 9l-3 3 3 3m8-6l3 3-3 3M13 5l-2 14"
                    />
                  </svg>
                }
              >
                IDE
              </Button>
            )}
            {onOpenProjects && (
              <UserMenu
                onOpenProjects={onOpenProjects}
                developerMode={developerMode}
                onDeveloperModeChange={onDeveloperModeChange}
                onOpenDeveloperPanel={onOpenDeveloperPanel}
                developerIdeDisabled={developerIdeDisabled}
                developerIdeDisabledReason={developerIdeDisabledReason}
              />
            )}
            {onOpenHelp && (
              <Button
                variant="secondary"
                size="sm"
                onClick={onOpenHelp}
                className="tactile group rounded-pill font-semibold shadow-glass hover:text-accent-text hover:bg-accent-soft hover:shadow-glow-indigo"
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
              </Button>
            )}
          </div>
        </div>
      </header>
    </>
  );
}
