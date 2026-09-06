import React from 'react';
import Header from '../components/Header';
import { CURRENT_RELEASE } from '../lib/currentRelease.js';
import { CURRENT_RELEASE_CHANGELOG } from '../lib/releaseManifest.js';

export default function ChangelogSummary() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <Header compact />
      <main className="mx-auto max-w-3xl px-5 pb-24 pt-10 sm:px-8">
        <div className="border-b border-slate-200 pb-8 dark:border-slate-800">
          <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-300">Product updates</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">Changelog</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">
            The changes that affect how instructors create, edit, and export their course materials.
          </p>
        </div>

        <article className="py-10">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-indigo-600 dark:text-indigo-300">
                Version {CURRENT_RELEASE.version}
              </p>
              <h2 className="mt-1 text-2xl font-bold tracking-tight">{CURRENT_RELEASE.title}</h2>
            </div>
            <time className="text-sm text-slate-500 dark:text-slate-400">{CURRENT_RELEASE.date}</time>
          </div>
          <ul className="mt-6 space-y-3">
            {CURRENT_RELEASE.highlights.map((item) => (
              <li key={item} className="flex gap-3 text-sm leading-6 text-slate-700 dark:text-slate-200">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-500" aria-hidden="true" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </article>

        <section
          aria-labelledby="recent-improvements"
          className="border-t border-slate-200 pt-10 dark:border-slate-800"
        >
          <h2 id="recent-improvements" className="text-xl font-bold tracking-tight">
            Recent improvements
          </h2>
          <div className="mt-6 divide-y divide-slate-200 border-y border-slate-200 dark:divide-slate-800 dark:border-slate-800">
            {CURRENT_RELEASE_CHANGELOG.sections.map((item) => (
              <article key={item.label} className="py-5">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{item.label}</h3>
                <ul className="mt-2 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-600 dark:text-slate-300">
                  {item.items.map((detail) => (
                    <li key={detail}>{detail}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
