import './studio.css';

export default function InfoPage({ page }: { page: string }) {
  const title =
    page === 'privacy'
      ? 'Privacy'
      : page === 'terms'
        ? 'Terms of use'
        : page === 'legacy'
          ? 'Previous workspace'
          : 'Contact';
  return (
    <div className="studio">
      <header className="studio-header">
        <a className="studio-brand" href="#/">
          {' '}
          <span className="studio-mark">e.</span> edutool
        </a>
        <a href="#/">Back to Studio</a>
      </header>
      <main className="reading-page info-page">
        <div className="eyebrow">EDUTOOL · SEPTEMBER 5, 2026</div>
        <h1>{title}</h1>
        {page === 'privacy' ? (
          <>
            <h2>Your courses</h2>
            <p>
              Studio saves course files, source readings, generation receipts and edits in this browser’s IndexedDB.
              There is no Studio account or automatic cloud backup. Export a course file to keep a copy. Clearing
              browser storage can remove saved work.
            </p>
            <h2>Online generation</h2>
            <p>
              Online Scion sends your course brief, selected source passages and the context needed for each generation
              to Google’s free Gemma API through a Cloudflare Worker. Google may use inputs and outputs to improve its
              products, and human reviewers may process them. Do not submit sensitive, confidential or identifiable
              student information. Read <a href="https://ai.google.dev/gemini-api/terms">Google’s API terms</a>.
            </p>
            <p>
              The Worker stores short-lived usage counters, including a daily hash of the connecting IP address, to
              distribute the free allowance. Application code does not store or log prompts or responses on the Worker.
              Google and Cloudflare process operational data under their own policies.
            </p>
            <h2>Generation on your device</h2>
            <p>
              The optional local route downloads model files from Hugging Face and performs inference in the browser.
              Your teaching material is not sent to the online generation service on this route. Model downloads and
              website requests still reveal ordinary connection information to their hosts.
            </p>
            <h2>Google Drive exports</h2>
            <p>
              Google exports send the selected material to your own Google Drive after you sign in and grant the
              drive.file permission. This permission covers files you create or explicitly open with EduTool, not your
              entire Drive. The access token stays in memory for the current page session. Exports are snapshots; later
              edits in EduTool do not change a downloaded or Google Drive copy automatically.
            </p>
            <h2>Earlier workspaces</h2>
            <p>
              The previous workspace used separate browser storage and optional Firebase account sync. Studio does not
              delete or migrate that data. Its privacy information is retained with the earlier application source.
            </p>
          </>
        ) : page === 'terms' ? (
          <>
            <p>
              EduTool is provided by Tian Xing as a free tool for adult educators and learners preparing learning
              materials. By using it, you agree to these terms.
            </p>
            <h2>Generation and availability</h2>
            <p>
              Online generation uses a shared free provider allowance. It can be slow, unavailable or restricted by
              region. It has no uptime guarantee. Builds pause when the allowance is unavailable; you can save, edit and
              export completed work. EduTool does not automatically switch your work to a paid model.
            </p>
            <p>
              The online generation service is for users aged 18 or older in eligible regions, subject to{' '}
              <a href="https://ai.google.dev/gemini-api/terms">Google’s API terms</a>. It is not a student chatbot.
              Teachers can export reviewed learning materials for their students.
            </p>
            <h2>Review before teaching</h2>
            <p>
              Generated material may contain factual, interpretive or pedagogical errors. Automated checks cover
              specific properties, such as selected calculations and exact source passages; they do not establish that a
              course is effective. You are responsible for reviewing and adapting material before use.
            </p>
            <h2>Your material</h2>
            <p>
              Only submit content you have permission to use. Keep sensitive or confidential information out of online
              requests. Save your own backups. The service is provided as available, without a warranty of accuracy or
              fitness for a particular teaching context.
            </p>
          </>
        ) : page === 'legacy' ? (
          <>
            <p>
              Studio replaces the earlier course-map compiler with editable lessons, concrete student tasks and separate
              instructor answers. Earlier browser and Firebase data has not been erased.
            </p>
            <p>
              The previous application is retained in Git history for recovery and comparison. Its custom compiler and
              runtime are excluded from the Studio production build. The two project formats are different; Studio
              accepts files ending in .edutool.json.
            </p>
            <p>
              For help recovering earlier work, use the{' '}
              <a href="https://github.com/lovejzzz/CourseMapper/issues">project support page</a>. Do not attach private
              teaching material to a public issue.
            </p>
          </>
        ) : (
          <>
            <p>
              Designed and developed by Tian Xing. Report bugs, ask questions or suggest improvements on the{' '}
              <a href="https://github.com/lovejzzz/CourseMapper/issues">project’s GitHub issue tracker</a>.
            </p>
            <p>
              Include the steps that failed and the version shown in the website footer. Keep private course material
              and student records out of public reports.
            </p>
          </>
        )}
      </main>
    </div>
  );
}
