import React from 'react';
import Header from '../components/Header';

const CONTACT_EMAIL = 'xingpicture@gmail.com';

export default function Contact() {
  return (
    <div className="min-h-screen mesh-bg noise-overlay">
      <Header compact />

      <main className="max-w-3xl mx-auto px-8 pb-16">
        <div className="mb-6">
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-800">
            Contact <span className="text-gradient">Tian Xing</span>
          </h1>
          <p className="text-slate-600 text-xs font-medium mt-1">Course Mapper contact</p>
        </div>

        <div className="glass panel-glow rounded-squircle shadow-glass p-8 space-y-5 text-sm text-slate-700 leading-relaxed">
          <p>
            Course Mapper is designed and developed by <strong>Tian Xing</strong>. For questions, feedback, bug reports,
            or collaboration, reach out by email.
          </p>
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="inline-flex items-center gap-2 rounded-pill border border-indigo-200/60 bg-indigo-50/70 px-4 py-2 text-sm font-semibold text-indigo-600 hover:border-indigo-300 dark:hover:border-indigo-500/40 hover:bg-indigo-100/70 transition-colors"
          >
            {CONTACT_EMAIL}
          </a>

          <div className="border-t border-slate-200/70 pt-5">
            <p className="text-xs font-semibold text-slate-500">Acknowledgements</p>
            <p className="mt-2">
              Special thanks to <strong>Professor Henry S. Samelson</strong>, NYU Silver School of Social Work, for his
              guidance and support.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
