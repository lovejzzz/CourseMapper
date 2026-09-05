import React from 'react';
import Header from '../components/Header';

const LAST_UPDATED = 'September 5, 2026';

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen mesh-bg noise-overlay">
      <Header compact />

      <main className="mx-auto max-w-3xl px-4 pb-16 sm:px-8">
        <div className="mb-6">
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-800">
            Privacy <span className="text-gradient">Policy</span>
          </h1>
          <p className="text-slate-600 text-xs font-medium mt-1">Last updated: {LAST_UPDATED}</p>
        </div>

        <div className="glass panel-glow space-y-6 rounded-squircle p-5 text-sm leading-relaxed text-slate-700 shadow-glass sm:p-8">
          <Section title="Overview">
            <p>
              Course Mapper is a free, browser-based tool built by Tian Xing. It uses AI to turn a course brief or
              syllabus into an aligned workspace with a course map, instructor materials, and student resources. This
              privacy policy explains how your data is handled when you use Course Mapper.
            </p>
          </Section>

          <Section title="Static App and Optional Cloud Sync">
            <p>
              Course Mapper is a static browser app with an optional Cloudflare relay for online Scion. Editing,
              exports, and local Scion inference run in your browser. Your work is saved in browser storage by default,
              and if you sign in, selected project and profile data can sync to Firebase services for your account.
              Google Drive exports upload directly from your browser to your Google Drive.
            </p>
          </Section>

          <Section title="Data You Provide">
            <ul className="list-disc list-inside space-y-1.5 ml-1">
              <li>
                <strong>Syllabus files</strong> — uploaded files are read locally in your browser. Local Scion keeps
                inference on your device. Online Scion sends relevant extracted text through the EduTool Cloudflare
                relay to Google after you enable that mode and its data-sharing permission. Other selected AI providers
                receive relevant file contents directly from your browser.
              </li>
              <li>
                <strong>API keys</strong> — if you use a paid AI provider, your API key is kept only in this browser tab
                and sent directly to the provider's API. It survives a reload but is cleared when the tab closes.
                EduTool never receives or stores your key on its own servers.
              </li>
              <li>
                <strong>Course workspace data</strong> — the course map, generated materials, and workspace history are
                stored in your browser's local storage for auto-save. If you sign in, project data and profile settings
                may also sync to Firebase for your account. Relevant workspace content is also sent to your chosen
                online AI provider when you request generation, revision, or chat, and to export services you select.
              </li>
              <li>
                <strong>Institution profile defaults</strong> — optional instructor, classroom logistics, and reusable
                policy text are stored in your browser and may sync to Firebase if you sign in.
              </li>
            </ul>
          </Section>

          <Section title="AI Processing and Third-Party Providers">
            <p>
              Processing depends on the provider you select. Paid-provider requests are sent directly from your browser
              to that provider. Scion offers local inference and an optional shared free online mode.
            </p>
            <ul className="list-disc list-inside space-y-1.5 ml-1 mt-2">
              <li>
                <strong>OpenAI</strong> — governed by{' '}
                <a
                  href="https://openai.com/policies/privacy-policy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-indigo-500 hover:text-indigo-700 underline"
                >
                  OpenAI's Privacy Policy
                </a>
              </li>
              <li>
                <strong>Anthropic</strong> — governed by{' '}
                <a
                  href="https://www.anthropic.com/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-indigo-500 hover:text-indigo-700 underline"
                >
                  Anthropic's Privacy Policy
                </a>
              </li>
              <li>
                <strong>Google (Gemini)</strong> — governed by{' '}
                <a
                  href="https://ai.google.dev/gemini-api/terms"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-indigo-500 hover:text-indigo-700 underline"
                >
                  Google AI Terms
                </a>
              </li>
              <li>
                <strong>DeepSeek</strong> — governed by{' '}
                <a
                  href="https://cdn.deepseek.com/policies/en-US/deepseek-terms-of-use.html"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-indigo-500 hover:text-indigo-700 underline"
                >
                  DeepSeek Terms of Use
                </a>
              </li>
              <li>
                <strong>Local Scion</strong> — runs a pinned public Gemma 4 model locally in your browser. Your
                syllabus, instructions, and generated text are not sent to a model API. On first use, your browser
                downloads the model weights directly from Hugging Face and stores them in browser-managed local storage.
              </li>
              <li>
                <strong>Online Scion</strong> — sends prompts, relevant course and conversation content, and extracted
                source text through our Cloudflare Worker to Google's free Gemma 4 API. Under Google's free-service
                terms, these inputs and outputs may be used to improve Google's products and may be reviewed by humans.
                Do not submit confidential information, personal data, or student records. This mode is for educators
                and instructional designers aged 18 or older using it professionally, subject to Google's regional
                restrictions and shared free quotas. It requires explicit browser permission, which you can withdraw in
                AI settings. Withdrawing permission stops further requests; it cannot recall data already sent.
              </li>
            </ul>
            <p className="mt-2">
              For key-based providers, you provide your own API key to connect directly to your chosen provider. Course
              Mapper never sends that key to a Course Mapper-operated server. Neither Scion mode requires your own API
              key. The online relay uses a site credential stored as a Cloudflare secret.
            </p>
          </Section>

          <Section title="Google Drive Integration">
            <p>Course Mapper offers optional export to Google Sheets and Google Docs. When you use this feature:</p>
            <ul className="list-disc list-inside space-y-1.5 ml-1 mt-2">
              <li>You sign in with your own Google account via a popup window.</li>
              <li>
                Course Mapper requests the{' '}
                <code className="px-1 py-0.5 rounded bg-slate-100 text-[12px] font-mono text-indigo-600">
                  drive.file
                </code>{' '}
                permission, which only allows access to files created by Course Mapper — not your other Drive files.
              </li>
              <li>The exported file is uploaded directly from your browser to your Google Drive.</li>
              <li>Course Mapper does not store your Google account information, access token, or any Drive data.</li>
              <li>
                You can revoke access at any time in your{' '}
                <a
                  href="https://myaccount.google.com/permissions"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-indigo-500 hover:text-indigo-700 underline"
                >
                  Google Account permissions
                </a>
                .
              </li>
            </ul>
          </Section>

          <Section title="Local Storage">
            <p>
              Course Mapper uses your browser's local storage to save your work automatically. This includes your course
              workspace, generated materials, chat history, version history, configuration, institution profile
              defaults, selected AI provider, and online Scion permission. Relevant data leaves your device when you use
              an online AI provider, sign-in cloud sync, or an online export. You can clear local project data by
              starting a new project, or remove all locally stored data through your browser settings.
            </p>
          </Section>

          <Section title="Analytics & Tracking">
            <p>
              Course Mapper does not include advertising or behavioral analytics scripts. The online Scion relay stores
              request and token counters, including a daily hash derived from your IP address, to enforce free quotas.
              Expired daily counters are removed automatically. The relay does not store prompts, source readings, or
              generated answers in its quota database or application logs. Hosting and AI providers process connection
              information under their own policies.
            </p>
          </Section>

          <Section title="Children's Privacy">
            <p>
              Course Mapper is intended for professional educators and instructional designers. Online Scion is
              restricted to adults aged 18 or older and is not offered for direct student use by minors. Do not provide
              children's personal information to online AI services.
            </p>
          </Section>

          <Section title="Data Security">
            <p>
              Because Course Mapper is a static browser app, the primary security boundary is your browser and any
              third-party services you choose to connect. We recommend:
            </p>
            <ul className="list-disc list-inside space-y-1.5 ml-1 mt-2">
              <li>Using a modern, up-to-date browser.</li>
              <li>
                Closing the EduTool tab when you finish using a paid provider so its session-only API key is cleared.
              </li>
              <li>Using your own API key only with providers you trust for sensitive course materials.</li>
              <li>Exporting your finished course map and clearing local storage when done.</li>
            </ul>
          </Section>

          <Section title="Changes to This Policy">
            <p>
              We may update this privacy policy from time to time. Changes will be reflected on this page with an
              updated date. Continued use of Course Mapper after changes constitutes acceptance of the updated policy.
            </p>
          </Section>

          <Section title="Contact">
            <p>
              Course Mapper is built by Tian Xing. For non-confidential privacy questions, use the{' '}
              <a
                href="https://github.com/lovejzzz/CourseMapper/issues/new/choose"
                target="_blank"
                rel="noopener noreferrer"
                className="text-indigo-500 hover:text-indigo-700 underline"
              >
                Course Mapper support channel
              </a>
              . Do not include personal or confidential information in a public issue.
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
        <div className="w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-slate-500" />
        {title}
      </h2>
      {children}
    </div>
  );
}
