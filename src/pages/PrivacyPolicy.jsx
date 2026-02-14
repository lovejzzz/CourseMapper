import React from 'react';

const LAST_UPDATED = 'February 14, 2026';

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen mesh-bg noise-overlay">
      <header className="relative pt-8 pb-6 px-8 max-w-3xl mx-auto w-full">
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-indigo-400/60 to-transparent" />
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <a href="#/" className="relative group">
              <div className="absolute -inset-1 bg-gradient-to-br from-indigo-500/20 to-violet-500/20 rounded-2xl blur-lg opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <div className="relative w-10 h-10 rounded-[12px] bg-gradient-to-br from-indigo-500 via-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
                <svg className="w-5 h-5 text-white/95" viewBox="0 0 24 24" fill="none">
                  <path d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5z" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round"/>
                  <path d="M4 12a1 1 0 011-1h8a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1v-2z" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round"/>
                  <path d="M4 19a1 1 0 011-1h5a1 1 0 011 1v1a1 1 0 01-1 1H5a1 1 0 01-1-1v-1z" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round"/>
                  <path d="M19 14l-2 2 2 2" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"/>
                  <circle cx="18" cy="18" r="1" fill="currentColor" opacity="0.6"/>
                </svg>
              </div>
            </a>
            <div>
              <h1 className="text-lg font-extrabold tracking-tight text-slate-800">
                Privacy <span className="text-gradient">Policy</span>
              </h1>
              <p className="text-slate-400 text-[12px] font-medium mt-0.5">
                Last updated: {LAST_UPDATED}
              </p>
            </div>
          </div>
          <a
            href="#/"
            className="tactile group flex items-center gap-2 px-4 py-2 rounded-pill text-[11px] font-semibold text-slate-500 bg-white/50 border border-slate-200/40 hover:bg-white/70 hover:text-slate-700 shadow-glass hover:shadow-glass-lg transition-all duration-300"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to App
          </a>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-8 pb-16">
        <div className="glass panel-glow rounded-squircle shadow-glass p-8 space-y-6 text-sm text-slate-600 leading-relaxed">

          <Section title="Overview">
            <p>
              Course Mapper is a free, browser-based tool developed by the Educational Technology team
              at NYU Silver School of Social Work. It uses AI to transform course syllabi into structured
              Course Map spreadsheets. This privacy policy explains how your data is handled when you use
              Course Mapper.
            </p>
          </Section>

          <Section title="No Backend Server">
            <p>
              Course Mapper runs entirely in your web browser. There is no backend server, no database,
              and no server-side storage. All processing happens locally on your device. When you close
              the browser tab, no data remains on any server operated by Course Mapper.
            </p>
          </Section>

          <Section title="Data You Provide">
            <ul className="list-disc list-inside space-y-1.5 ml-1">
              <li><strong>Syllabus files</strong> — uploaded files are read locally in your browser and never sent to Course Mapper servers (there are none). File contents are sent to your chosen AI provider for processing.</li>
              <li><strong>API keys</strong> — if you use a paid AI provider, your API key is stored in your browser's local storage and sent directly to the provider's API. Course Mapper never sees, transmits, or stores your key on any server.</li>
              <li><strong>Course map data</strong> — generated course maps are stored in your browser's local storage for auto-save. They are not transmitted anywhere except when you explicitly export.</li>
            </ul>
          </Section>

          <Section title="Third-Party AI Providers">
            <p>
              When you generate or revise a course map, your syllabus content and instructions are sent
              directly from your browser to one of the following AI providers:
            </p>
            <ul className="list-disc list-inside space-y-1.5 ml-1 mt-2">
              <li><strong>OpenAI</strong> — governed by <a href="https://openai.com/policies/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-indigo-500 hover:text-indigo-700 underline">OpenAI's Privacy Policy</a></li>
              <li><strong>Anthropic</strong> — governed by <a href="https://www.anthropic.com/privacy" target="_blank" rel="noopener noreferrer" className="text-indigo-500 hover:text-indigo-700 underline">Anthropic's Privacy Policy</a></li>
              <li><strong>Google (Gemini)</strong> — governed by <a href="https://ai.google.dev/terms" target="_blank" rel="noopener noreferrer" className="text-indigo-500 hover:text-indigo-700 underline">Google AI Terms</a></li>
              <li><strong>OpenRouter</strong> — used for free-tier models, governed by <a href="https://openrouter.ai/privacy" target="_blank" rel="noopener noreferrer" className="text-indigo-500 hover:text-indigo-700 underline">OpenRouter's Privacy Policy</a></li>
            </ul>
            <p className="mt-2">
              If you use the free tier, your prompts and responses may be used by model providers to
              improve their AI services. For sensitive course materials, we recommend using your own API
              key with a paid provider.
            </p>
          </Section>

          <Section title="Google Drive Integration">
            <p>
              Course Mapper offers optional export to Google Sheets and Google Docs. When you use this feature:
            </p>
            <ul className="list-disc list-inside space-y-1.5 ml-1 mt-2">
              <li>You sign in with your own Google account via a popup window.</li>
              <li>Course Mapper requests the <code className="px-1 py-0.5 rounded bg-slate-100 text-[12px] font-mono text-indigo-600">drive.file</code> permission, which only allows access to files created by Course Mapper — not your other Drive files.</li>
              <li>The exported file is uploaded directly from your browser to your Google Drive.</li>
              <li>Course Mapper does not store your Google account information, access token, or any Drive data.</li>
              <li>You can revoke access at any time in your <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer" className="text-indigo-500 hover:text-indigo-700 underline">Google Account permissions</a>.</li>
            </ul>
          </Section>

          <Section title="Local Storage">
            <p>
              Course Mapper uses your browser's local storage to save your work automatically. This includes
              your course map, chat history, version history, column configuration, and selected AI provider.
              This data stays on your device and is never transmitted to any server. You can clear it at any
              time by clicking "New Project" or clearing your browser data.
            </p>
          </Section>

          <Section title="Analytics & Tracking">
            <p>
              Course Mapper does not use any analytics, tracking, or advertising services. No cookies are
              set. No user behavior is monitored or recorded. There are no third-party scripts for tracking
              purposes.
            </p>
          </Section>

          <Section title="Children's Privacy">
            <p>
              Course Mapper is intended for use by educators and instructional designers. It is not directed
              at children under the age of 13 and does not knowingly collect personal information from children.
            </p>
          </Section>

          <Section title="Data Security">
            <p>
              Because Course Mapper has no backend server and stores no data remotely, the primary security
              boundary is your web browser. We recommend:
            </p>
            <ul className="list-disc list-inside space-y-1.5 ml-1 mt-2">
              <li>Using a modern, up-to-date browser.</li>
              <li>Not sharing your device with untrusted users if you have API keys stored in local storage.</li>
              <li>Using your own API key (rather than the free tier) for sensitive course materials.</li>
              <li>Exporting your finished course map and clearing local storage when done.</li>
            </ul>
          </Section>

          <Section title="Changes to This Policy">
            <p>
              We may update this privacy policy from time to time. Changes will be reflected on this page
              with an updated date. Continued use of Course Mapper after changes constitutes acceptance
              of the updated policy.
            </p>
          </Section>

          <Section title="Contact">
            <p>
              Course Mapper is developed by the Educational Technology team at NYU Silver School of Social Work.
              For privacy questions or concerns, contact us at{' '}
              <a href="mailto:edtech@nyu.edu" className="text-indigo-500 hover:text-indigo-700 underline">
                edtech@nyu.edu
              </a>.
            </p>
          </Section>

        </div>
      </main>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div>
      <h2 className="text-[15px] font-bold text-slate-800 mb-2 flex items-center gap-2">
        <div className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
        {title}
      </h2>
      {children}
    </div>
  );
}
