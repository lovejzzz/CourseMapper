import { buildDocxBlob } from './docxGenerator';

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
