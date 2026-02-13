// Lazy-loaded heavy dependency
let _docx;
async function getDocx() {
  if (!_docx) _docx = await import('docx');
  return _docx;
}

const CLIENT_ID = '64961514263-r4lb3mg64v3j40csb3s764sgleo7ngbf.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/drive.file';

let tokenClient = null;
let gisLoaded = false;

/**
 * Load the Google Identity Services script once.
 */
function loadGIS() {
  return new Promise((resolve, reject) => {
    if (gisLoaded) return resolve();
    if (document.getElementById('gis-script')) {
      // Script tag exists, wait for it to load
      const existing = document.getElementById('gis-script');
      existing.addEventListener('load', () => { gisLoaded = true; resolve(); });
      existing.addEventListener('error', () => reject(new Error('Failed to load Google Identity Services')));
      return;
    }
    const script = document.createElement('script');
    script.id = 'gis-script';
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => { gisLoaded = true; resolve(); };
    script.onerror = () => reject(new Error('Failed to load Google Identity Services'));
    document.head.appendChild(script);
  });
}

/**
 * Request an OAuth access token from the user via Google sign-in popup.
 * Returns the access token string.
 */
function getAccessToken() {
  return new Promise((resolve, reject) => {
    if (!window.google?.accounts?.oauth2) {
      return reject(new Error('Google Identity Services not loaded'));
    }

    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      callback: (response) => {
        if (response.error) {
          reject(new Error(response.error_description || response.error));
        } else {
          resolve(response.access_token);
        }
      },
      error_callback: (err) => {
        reject(new Error(err.message || 'Google sign-in was cancelled'));
      },
    });

    tokenClient.requestAccessToken({ prompt: 'consent' });
  });
}

/**
 * Column key → human-readable label (same as docxGenerator)
 */
const DEFAULT_LABELS = {
  learningGoals: 'Learning Goals',
  topicSection: 'Topic / Section',
  learningObjectives: 'Learning Objectives',
  weeklyAssessments: 'Assessments',
  asyncActivities: 'Asynchronous Activities',
  syncActivities: 'Synchronous Activities',
  technologyNeeded: 'Technology Needed',
  presentationFormat: 'Presentation Format',
  supportingResources: 'Supporting Resources',
  evaluateDesign: 'Evaluate Design',
};

/**
 * Build a professional APA-formatted .docx blob from course map data.
 * APA 7th edition: Times New Roman 12pt, double-spaced, 1-inch margins,
 * proper heading hierarchy, page numbers, and title page.
 */
async function buildDocxBlob(courseMap, customColumns) {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, PageBreak, Header, PageNumber, BorderStyle } = await getDocx();

  const FONT = 'Times New Roman';
  const BODY = 24;   // 12pt in half-points
  const DBL = 480;   // double spacing (240ths of a line)
  const INDENT = 720; // 0.5-inch first-line indent (twips)

  const colKeys = customColumns && customColumns.length > 0
    ? customColumns.map(c => c.key)
    : Object.keys(DEFAULT_LABELS);

  const colLabels = {};
  if (customColumns && customColumns.length > 0) {
    for (const col of customColumns) {
      colLabels[col.key] = col.label || DEFAULT_LABELS[col.key] || col.key;
    }
  } else {
    Object.assign(colLabels, DEFAULT_LABELS);
  }

  const courseName = courseMap.courseName || 'Course Map';
  const semester = courseMap.semester || '';

  // ── Title Page (APA-style centered block) ──
  const titleChildren = [];

  // Push title block toward vertical center
  for (let i = 0; i < 6; i++) {
    titleChildren.push(new Paragraph({ spacing: { line: DBL } }));
  }

  titleChildren.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { line: DBL, after: 0 },
      children: [new TextRun({ text: courseName, bold: true, size: BODY, font: FONT })],
    }),
  );

  if (semester) {
    titleChildren.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { line: DBL, after: 0 },
        children: [new TextRun({ text: semester, size: BODY, font: FONT })],
      }),
    );
  }

  titleChildren.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { line: DBL, after: 0 },
      children: [new TextRun({ text: 'Course Map', size: BODY, font: FONT })],
    }),
  );

  const generated = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  titleChildren.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { line: DBL, after: 0 },
      children: [new TextRun({ text: generated, size: BODY, font: FONT })],
    }),
  );

  // ── Body Pages ──
  const bodyChildren = [];

  for (let li = 0; li < courseMap.lessons.length; li++) {
    const lesson = courseMap.lessons[li];

    // APA Level 1: Centered, Bold
    bodyChildren.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        alignment: AlignmentType.CENTER,
        spacing: { line: DBL, before: li > 0 ? 240 : 0, after: 0 },
        children: [new TextRun({ text: lesson.title || `Lesson ${li + 1}`, bold: true, size: BODY, font: FONT })],
      }),
    );

    for (let si = 0; si < (lesson.sections || []).length; si++) {
      const section = lesson.sections[si];
      const topicText = section.topicSection || `Section ${si + 1}`;

      // APA Level 2: Left-Aligned, Bold
      bodyChildren.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          spacing: { line: DBL, before: 240, after: 0 },
          children: [new TextRun({ text: topicText, bold: true, size: BODY, font: FONT })],
        }),
      );

      for (const key of colKeys) {
        if (key === 'topicSection' || key === 'evaluateDesign') continue;
        const value = section[key];
        if (!value || (typeof value === 'string' && !value.trim())) continue;
        const label = colLabels[key] || key;

        // APA Level 3: Left-Aligned, Bold Italic, ending with period, text follows
        bodyChildren.push(
          new Paragraph({
            spacing: { line: DBL, after: 0 },
            indent: { firstLine: INDENT },
            children: [
              new TextRun({ text: `${label}. `, bold: true, italics: true, size: BODY, font: FONT }),
              new TextRun({ text: String(value), size: BODY, font: FONT }),
            ],
          }),
        );
      }
    }

    // Page break between lessons (except after the last one)
    if (li < courseMap.lessons.length - 1) {
      bodyChildren.push(new Paragraph({ children: [new PageBreak()] }));
    }
  }

  // ── Page header with right-aligned page number ──
  const pageHeader = new Header({
    children: [
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [new TextRun({ children: [PageNumber.CURRENT], size: BODY, font: FONT })],
      }),
    ],
  });

  const doc = new Document({
    styles: {
      default: {
        document: { run: { font: FONT, size: BODY } },
        heading1: { run: { font: FONT, size: BODY, bold: true, color: '000000' } },
        heading2: { run: { font: FONT, size: BODY, bold: true, color: '000000' } },
      },
    },
    sections: [
      // Title page (no header)
      {
        properties: {
          page: { margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } },
          titlePage: true,
        },
        children: titleChildren,
      },
      // Body pages with page numbers
      {
        properties: {
          page: { margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } },
        },
        headers: { default: pageHeader },
        children: bodyChildren,
      },
    ],
  });

  return await Packer.toBlob(doc);
}

/**
 * Upload a blob to Google Drive, converting to the specified Google format.
 * Returns the Drive file metadata including webViewLink.
 */
async function uploadToDrive(accessToken, blob, fileName, targetMimeType) {
  const metadata = {
    name: fileName.replace(/\.(docx|xlsx)$/, ''),
    mimeType: targetMimeType,
  };

  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', blob);

  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Upload failed (${res.status})`);
  }

  return await res.json();
}

/**
 * Build docx, sign in to Google, upload to Drive as Google Doc, open it.
 * @returns {Promise<string>} The URL of the created Google Doc.
 */
export async function saveToGoogleDocs(courseMap, customColumns) {
  const courseName = courseMap.courseName || 'Course Map';
  const semester = courseMap.semester || '';
  const fileName = `${courseName} Course Map (${semester || 'TBD'}).docx`;
  const blob = await buildDocxBlob(courseMap, customColumns);

  await loadGIS();
  const accessToken = await getAccessToken();
  const result = await uploadToDrive(accessToken, blob, fileName, 'application/vnd.google-apps.document');

  if (result.webViewLink) window.open(result.webViewLink, '_blank');
  return result.webViewLink || result.id;
}

/**
 * Build xlsx, sign in to Google, upload to Drive as Google Sheets, open it.
 * @param {function} buildXlsxBuffer - async function that returns an ArrayBuffer of the xlsx
 * @returns {Promise<string>} The URL of the created Google Sheet.
 */
export async function saveToGoogleSheets(xlsxBuffer, courseName, semester) {
  const fileName = `${courseName || 'Course'} Course Map (${semester || 'TBD'}).xlsx`;
  const blob = new Blob([xlsxBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

  await loadGIS();
  const accessToken = await getAccessToken();
  const result = await uploadToDrive(accessToken, blob, fileName, 'application/vnd.google-apps.spreadsheet');

  if (result.webViewLink) window.open(result.webViewLink, '_blank');
  return result.webViewLink || result.id;
}
