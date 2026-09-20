import React from 'react';
import Header from '../components/Header';

const LAST_UPDATED = 'September 20, 2026';

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
              Course Mapper is a static browser app. The shared free online Scion relay is temporarily paused. Editing,
              exports, and local Scion inference run in your browser. Your work is saved in browser storage by default,
              and if you sign in, selected project and profile data can sync to Firebase services for your account.
              Google Drive exports upload directly from your browser to your Google Drive. Optional external AI
              authoring uses the separate server-side exchange described below.
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
              to that provider. Scion currently uses local inference; its shared free online mode is temporarily paused.
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
                <strong>Online Scion (temporarily paused)</strong> — when previously enabled, sent prompts, relevant
                course and conversation content, and extracted source text through our Cloudflare Worker to Google's
                free Gemma 4 API. Under Google's free-service terms, these inputs and outputs may be used to improve
                Google's products and may be reviewed by humans. Do not submit confidential information, personal data,
                or student records. This mode is for educators and instructional designers aged 18 or older using it
                professionally, subject to Google's regional restrictions and shared free quotas. It requires explicit
                browser permission, which you can withdraw in AI settings. Withdrawing permission stops further
                requests; it cannot recall data already sent.
              </li>
            </ul>
            <p className="mt-2">
              For key-based providers, you provide your own API key to connect directly to your chosen provider. Course
              Mapper never sends that key to a Course Mapper-operated server. Local Scion requires no API key. The
              paused online relay's site credential remains stored as a Cloudflare secret; new generation requests are
              disabled.
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

          <Section title="External AI Authoring and Shared Sources">
            <p>
              External AI authoring is optional. When you explicitly share a request, Course Mapper sends its teaching
              requirements, selected source-text snapshots, and selected course baseline to an account-protected
              exchange hosted on Google Cloud. File text is extracted in your browser; original file bytes are not
              uploaded by this sharing flow. You can review stored source text and replace or remove it in AI authoring.
            </p>
            <p>
              Firebase and Auth0 handle sign-in and link your website account to the identity used by your connected AI
              app. The exchange stores that identity binding and checks it on remote calls. Your connected AI app can
              read explicitly shared requests and sources and save drafts within their allowed scope. It cannot apply a
              draft to your course; you review and apply it on the website. Course Mapper does not receive your ChatGPT
              password or convert your ChatGPT subscription into website API access.
            </p>
            <p>
              Revoke remote access stops further AI access to the selected request. Disconnect AI identity stops remote
              access through that connection. These actions do not erase already applied courses or copies held by your
              AI provider. Delete shared request and drafts removes the exchange request and draft content; unreferenced
              stored content is removed by scheduled cleanup. Browser copies, project backups and cloud-saved courses
              are separate and remain until removed through their respective controls.
            </p>
            <p>
              Request access expires 30 days after creation. A daily cleanup job removes expired exchange content and
              unreferenced content blocks. Minimal deletion markers and identity/revocation records are retained to
              prevent deleted requests or revoked connections from being restored accidentally. Application logs are
              retained for 30 days; required Google Cloud audit logs are retained for 400 days. Copies in AI
              conversations follow that provider's retention and deletion controls, which Course Mapper cannot operate
              for you.
            </p>
          </Section>

          <Section title="Local Storage">
            <p>
              Course Mapper uses your browser's local storage and IndexedDB to save your work automatically. This
              includes your course workspace, generated materials, chat history, version history, configuration,
              institution profile defaults, selected AI provider, and online Scion permission. Relevant data leaves your
              device when you use an online AI provider, explicit external-authoring sharing, sign-in cloud sync, or an
              online export. Starting a new project does not erase all saved drafts, backups or browser records. Remove
              all locally stored data through your browser settings only when you intend to discard those local copies.
            </p>
          </Section>

          <Section title="Analytics & Tracking">
            <p>
              Course Mapper does not include advertising or behavioral analytics scripts. When active, the online Scion
              relay stores request and token counters, including a daily hash derived from your IP address, to enforce
              free quotas. Expired daily counters are removed automatically. The relay does not store prompts, source
              readings, or generated answers in its quota database or application logs. Hosting and AI providers process
              connection information under their own policies.
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
              Local work relies on your browser storage. Optional cloud sync and external authoring also rely on
              authenticated server-side access controls and the third-party services you choose to connect. We
              recommend:
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
