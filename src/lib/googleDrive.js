import { buildDocxBlob } from './docxGenerator';

const CLIENT_ID = '64961514263-r4lb3mg64v3j40csb3s764sgleo7ngbf.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/drive.file';

let tokenClient = null;
let gisLoaded = false;

// ── Token cache (in-memory only) ──
let cachedToken = null;
let tokenExpiry = 0;

function cacheToken(token) {
  cachedToken = token;
  tokenExpiry = Date.now() + 3600_000; // 1 hour
}

export function clearTokenCache() {
  cachedToken = null;
  tokenExpiry = 0;
}

export function hasValidToken() {
  return !!(cachedToken && Date.now() < tokenExpiry - 300_000);
}

/**
 * Inject an access token obtained from Firebase Google sign-in.
 * Called by AuthContext after sign-in so the Drive export flow can
 * reuse the same token without a second popup.
 */
export function setFirebaseAccessToken(token) {
  if (token) cacheToken(token);
}

// ── Folder cache (in-memory) ──
const folderCache = new Map();

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
 *
 * Strategy:
 *  1. Check in-memory / localStorage cache first (instant, no GIS overhead).
 *  2. First attempt with prompt:'' — silently reuses a cached session (no popup if already signed in).
 *  3. If that fails with an error that requires user interaction, fall back to prompt:'select_account'.
 *  4. Cache the resulting token for ~1 hour (with 5-min safety buffer).
 */
function getAccessToken() {
  // Return cached token if still valid (5 min buffer)
  if (cachedToken && Date.now() < tokenExpiry - 300_000) {
    return Promise.resolve(cachedToken);
  }

  return new Promise((resolve, reject) => {
    if (!window.google?.accounts?.oauth2) {
      return reject(new Error('Google Identity Services not loaded'));
    }

    let didRespond = false;

    const tryRequest = (prompt) => {
      didRespond = false;
      tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: (response) => {
          if (didRespond) return;
          didRespond = true;
          if (response.error) {
            // If silent attempt failed because user interaction is required, retry with account picker
            if (prompt === '' && (response.error === 'interaction_required' || response.error === 'consent_required' || response.error === 'login_required')) {
              tryRequest('select_account');
            } else {
              reject(new Error(response.error_description || response.error));
            }
          } else {
            cacheToken(response.access_token);
            resolve(response.access_token);
          }
        },
        error_callback: (err) => {
          if (didRespond) return;
          didRespond = true;
          // Popup closed without completing — if we tried silently, retry interactively
          if (prompt === '') {
            tryRequest('select_account');
          } else {
            reject(new Error(err.message || 'Google sign-in was cancelled'));
          }
        },
      });
      tokenClient.requestAccessToken({ prompt });
    };

    // Start with silent (no-prompt) attempt
    tryRequest('');
  });
}

// ── Date stamp helper ──
function dateStamp() {
  return new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── Folder management ──

/**
 * Find or create a folder in Google Drive for organizing exports.
 * Caches folder IDs in memory to avoid repeated API calls.
 */
async function getOrCreateFolder(accessToken, folderName) {
  if (folderCache.has(folderName)) return folderCache.get(folderName);

  // Search for existing folder
  const query = encodeURIComponent(`name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const searchRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)&pageSize=1`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (searchRes.ok) {
    const { files } = await searchRes.json();
    if (files && files.length > 0) {
      folderCache.set(folderName, files[0].id);
      return files[0].id;
    }
  }

  // Create new folder
  const createRes = await fetch('https://www.googleapis.com/drive/v3/files?fields=id', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
    }),
  });
  if (!createRes.ok) {
    // Non-fatal — just upload to root if folder creation fails
    console.warn('Could not create Drive folder:', await createRes.text().catch(() => ''));
    return null;
  }
  const { id } = await createRes.json();
  folderCache.set(folderName, id);
  return id;
}

/**
 * Upload a blob to Google Drive, converting to the specified Google format.
 * Returns the Drive file metadata including webViewLink.
 *
 * Uses proper multipart/related encoding (RFC 2387) which Google Drive API
 * requires for reliable file conversion.  The previous FormData approach
 * produced multipart/form-data — Google accepted it for Docs/Sheets but
 * silently produced empty content when converting PPTX → Google Slides.
 */
async function uploadToDrive(accessToken, blob, fileName, targetMimeType, parentFolderId = null) {
  const doUpload = async (folderId) => {
    const metadata = {
      name: fileName.replace(/\.(docx|xlsx|pptx)$/, ''),
      mimeType: targetMimeType,
    };
    if (folderId) metadata.parents = [folderId];

    const boundary = '===CourseMapper_Upload_Boundary===';
    const metadataJson = JSON.stringify(metadata);

    // Read the blob as an ArrayBuffer so we can build the raw multipart body
    const fileBuffer = await blob.arrayBuffer();
    const fileBytes = new Uint8Array(fileBuffer);

    // Build the multipart/related body manually
    const encoder = new TextEncoder();
    const CRLF = '\r\n';
    const preamble = encoder.encode(
      `--${boundary}${CRLF}` +
      `Content-Type: application/json; charset=UTF-8${CRLF}${CRLF}` +
      metadataJson + CRLF +
      `--${boundary}${CRLF}` +
      `Content-Type: ${blob.type || 'application/octet-stream'}${CRLF}` +
      `Content-Transfer-Encoding: binary${CRLF}${CRLF}`
    );
    const epilogue = encoder.encode(`${CRLF}--${boundary}--`);

    // Combine: preamble + file bytes + epilogue
    const body = new Uint8Array(preamble.length + fileBytes.length + epilogue.length);
    body.set(preamble, 0);
    body.set(fileBytes, preamble.length);
    body.set(epilogue, preamble.length + fileBytes.length);

    const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: body,
    });

    return res;
  };

  let res = await doUpload(parentFolderId);

  // If upload failed with 404 and we used a cached parent folder, the folder
  // was likely trashed/deleted. Invalidate the cache and retry without a parent.
  if (res.status === 404 && parentFolderId) {
    // Remove the stale folder ID from cache
    for (const [key, val] of folderCache) {
      if (val === parentFolderId) { folderCache.delete(key); break; }
    }
    console.warn('Drive folder not found (possibly trashed) — retrying upload to root');
    res = await doUpload(null);
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    // If auth expired, clear cache so next attempt re-authenticates
    if (res.status === 401) clearTokenCache();
    throw new Error(err.error?.message || `Upload failed (${res.status})`);
  }

  return await res.json();
}

/**
 * Open a blank tab synchronously (before any await), then redirect it to the
 * final URL once it's known. This defeats the browser popup-blocker which
 * only allows window.open() in direct response to a user gesture — not inside
 * async callbacks.
 *
 * IMPORTANT: Call this at the very start of the user-gesture handler (onClick),
 * BEFORE any await. Pass the returned tab reference to the Google export function
 * so it doesn't have to open its own tab (which would be too late).
 */
export function openTabNow() {
  const tab = window.open('about:blank', '_blank');
  // Write a loading page so the user doesn't see a blank white tab
  // while waiting for Google sign-in + upload to complete.
  try {
    tab.document.write(`<!DOCTYPE html><html><head><title>Exporting…</title>
<style>
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
       font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
       background:#f8fafc;color:#475569}
  .box{text-align:center}
  .spinner{width:36px;height:36px;margin:0 auto 16px;border:3px solid #e2e8f0;
           border-top-color:#3b82f6;border-radius:50%;animation:spin .8s linear infinite}
  @keyframes spin{to{transform:rotate(360deg)}}
  p#status{font-size:15px;margin:0}
  small#detail{font-size:12px;color:#94a3b8;margin-top:6px;display:block}
  .steps{margin-top:20px;text-align:left;display:inline-block}
  .step{font-size:12px;color:#94a3b8;padding:3px 0;transition:color .3s}
  .step.active{color:#3b82f6;font-weight:600}
  .step.done{color:#10b981}
  .step::before{content:'○ ';font-size:10px}
  .step.active::before{content:'◉ '}
  .step.done::before{content:'✓ '}
</style></head><body>
<div class="box"><div class="spinner"></div>
<p id="status">Preparing your export…</p>
<small id="detail">Starting up</small>
<div class="steps">
  <div class="step${hasValidToken() ? ' done' : ''}" id="step-auth">Sign in to Google</div>
  <div class="step" id="step-build">Build file</div>
  <div class="step" id="step-folder">Organize in Drive folder</div>
  <div class="step" id="step-upload">Upload to Google Drive</div>
  <div class="step" id="step-open">Open file</div>
</div>
</div></body></html>`);
    tab.document.close();
  } catch { /* cross-origin or closed — ignore */ }
  return tab;
}

/**
 * Update the pre-opened tab's status display with step-by-step progress.
 */
export function updateTabStatus(tab, stepId, status = 'active') {
  if (!tab || tab.closed) return;
  try {
    // Mark the step
    const stepEl = tab.document.getElementById(`step-${stepId}`);
    if (stepEl) {
      // Mark all previous steps as done
      const allSteps = tab.document.querySelectorAll('.step');
      let found = false;
      for (const s of allSteps) {
        if (s === stepEl) { found = true; break; }
        s.className = 'step done';
      }
      stepEl.className = `step ${status}`;
    }
    // Update main status text
    const statusEl = tab.document.getElementById('status');
    const labels = { auth: 'Signing in to Google…', build: 'Building file…', folder: 'Creating Drive folder…', upload: 'Uploading to Google Drive…', open: 'Opening file…' };
    if (statusEl && labels[stepId]) statusEl.textContent = labels[stepId];
  } catch { /* cross-origin or closed — ignore */ }
}

function redirectTab(tab, url) {
  if (!tab) {
    // Fallback if the tab reference was somehow lost
    window.open(url, '_blank');
    return;
  }
  try {
    tab.location.href = url;
  } catch (e) {
    // Cross-origin guard (shouldn't happen here) — fall back to a new tab
    window.open(url, '_blank');
  }
}

/**
 * Build docx, sign in to Google, upload to Drive as Google Doc, open it.
 *
 * @param {Window|null} preOpenedTab  — tab opened by the caller BEFORE any await
 *                                      (pass null to let this function open its own)
 * @returns {Promise<string>} The URL of the created Google Doc.
 */
export async function saveToGoogleDocs(courseMap, customColumns, preOpenedTab = null) {
  const tab = preOpenedTab ?? openTabNow();
  try {
    const courseName = courseMap.courseName || 'Course Map';
    const semester = courseMap.semester || '';
    const fileName = `${courseName} Course Map (${semester || 'TBD'}) – ${dateStamp()}.docx`;

    updateTabStatus(tab, 'build');
    const blob = await buildDocxBlob(courseMap, customColumns);

    if (hasValidToken()) {
      updateTabStatus(tab, 'auth', 'done');
    } else {
      updateTabStatus(tab, 'auth');
      await loadGIS();
    }
    const accessToken = await getAccessToken();

    updateTabStatus(tab, 'folder');
    const folderId = await getOrCreateFolder(accessToken, `CourseMapper – ${courseName}`);

    updateTabStatus(tab, 'upload');
    const result = await uploadToDrive(accessToken, blob, fileName, 'application/vnd.google-apps.document', folderId);

    updateTabStatus(tab, 'open', 'done');
    if (result.webViewLink) redirectTab(tab, result.webViewLink);
    return result.webViewLink || result.id;
  } catch (err) {
    if (!preOpenedTab) tab?.close();
    throw err;
  }
}

/**
 * Upload a pre-built DOCX blob to Google Drive as a Google Doc.
 *
 * @param {Window|null} preOpenedTab  — tab opened by the caller BEFORE any await
 */
export async function saveToGoogleDocsBlob(blob, fileName, courseName, preOpenedTab = null) {
  const tab = preOpenedTab ?? openTabNow();
  try {
    if (hasValidToken()) {
      updateTabStatus(tab, 'auth', 'done');
    } else {
      updateTabStatus(tab, 'auth');
      await loadGIS();
    }
    const accessToken = await getAccessToken();

    updateTabStatus(tab, 'folder');
    const folderId = courseName ? await getOrCreateFolder(accessToken, `CourseMapper – ${courseName}`) : null;

    updateTabStatus(tab, 'upload');
    const result = await uploadToDrive(accessToken, blob, `${fileName}.docx`, 'application/vnd.google-apps.document', folderId);

    updateTabStatus(tab, 'open', 'done');
    if (result.webViewLink) redirectTab(tab, result.webViewLink);
    return result.webViewLink || result.id;
  } catch (err) {
    if (!preOpenedTab) tab?.close();
    throw err;
  }
}

/**
 * Build xlsx, sign in to Google, upload to Drive as Google Sheets, open it.
 *
 * @param {Window|null} preOpenedTab  — tab opened by the caller BEFORE any await
 * @returns {Promise<string>} The URL of the created Google Sheet.
 */
export async function saveToGoogleSheets(xlsxBuffer, fileName, courseName, preOpenedTab = null) {
  const tab = preOpenedTab ?? openTabNow();
  try {
    const blob = new Blob([xlsxBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    if (hasValidToken()) {
      updateTabStatus(tab, 'auth', 'done');
    } else {
      updateTabStatus(tab, 'auth');
      await loadGIS();
    }
    const accessToken = await getAccessToken();

    updateTabStatus(tab, 'folder');
    const folderId = courseName ? await getOrCreateFolder(accessToken, `CourseMapper – ${courseName}`) : null;

    updateTabStatus(tab, 'upload');
    const result = await uploadToDrive(accessToken, blob, fileName, 'application/vnd.google-apps.spreadsheet', folderId);

    updateTabStatus(tab, 'open', 'done');
    if (result.webViewLink) redirectTab(tab, result.webViewLink);
    return result.webViewLink || result.id;
  } catch (err) {
    if (!preOpenedTab) tab?.close();
    throw err;
  }
}

/**
 * Upload a PPTX blob to Google Drive as Google Slides, then open it.
 *
 * @param {Window|null} preOpenedTab  — tab opened by the caller BEFORE any await
 */
export async function saveToGoogleSlides(pptxBlob, fileName, courseName, preOpenedTab = null) {
  const tab = preOpenedTab ?? openTabNow();
  try {
    if (hasValidToken()) {
      updateTabStatus(tab, 'auth', 'done');
    } else {
      updateTabStatus(tab, 'auth');
      await loadGIS();
    }
    const accessToken = await getAccessToken();

    // Always wrap with the correct MIME type — pptxgenjs via JSZip produces
    // a Blob with an empty type (""), which causes Google Drive to reject or
    // misinterpret the upload.  Re-wrapping ensures the multipart file part
    // has the right Content-Type header.
    const pptxMime = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    const blob = new Blob([pptxBlob], { type: pptxMime });

    updateTabStatus(tab, 'folder');
    const folderId = courseName ? await getOrCreateFolder(accessToken, `CourseMapper – ${courseName}`) : null;

    updateTabStatus(tab, 'upload');
    const result = await uploadToDrive(accessToken, blob, `${fileName}.pptx`, 'application/vnd.google-apps.presentation', folderId);

    updateTabStatus(tab, 'open', 'done');
    if (result.webViewLink) redirectTab(tab, result.webViewLink);
    return result.webViewLink || result.id;
  } catch (err) {
    if (!preOpenedTab) tab?.close();
    throw err;
  }
}
