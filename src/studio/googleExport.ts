const CLIENT_ID = '64961514263-r4lb3mg64v3j40csb3s764sgleo7ngbf.apps.googleusercontent.com';
const SCOPE = 'https://www.googleapis.com/auth/drive.file';
type TokenResponse = { access_token?: string; expires_in?: number; scope?: string; error?: string };
type GoogleIdentity = {
  accounts: {
    oauth2: {
      initTokenClient: (options: {
        client_id: string;
        scope: string;
        callback: (response: TokenResponse) => void;
        error_callback: (error: { type?: string }) => void;
      }) => { requestAccessToken: (options: { prompt: string }) => void };
      hasGrantedAllScopes: (response: TokenResponse, scope: string) => boolean;
    };
  };
};
let identityLoad: Promise<void> | undefined;
let sessionToken: { token: string; expires: number } | undefined;
const identity = () => (window as unknown as { google?: GoogleIdentity }).google;
export function loadGoogleIdentity(): Promise<void> {
  if (identity()) return Promise.resolve();
  if (identityLoad) return identityLoad;
  identityLoad = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    const timeout = setTimeout(() => {
      script.remove();
      reject(new Error('Google sign-in did not load. Try again or download an Office file.'));
    }, 20000);
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = () => {
      clearTimeout(timeout);
      if (identity()) resolve();
      else reject(new Error('Google sign-in is unavailable.'));
    };
    script.onerror = () => {
      clearTimeout(timeout);
      script.remove();
      reject(new Error('Google sign-in is blocked or unavailable.'));
    };
    document.head.appendChild(script);
  }).catch((error) => {
    identityLoad = undefined;
    throw error;
  });
  return identityLoad;
}
/** Called directly from the export button, after the identity library loads,
 * so account selection retains the browser's required user gesture. */
export function requestGoogleToken(): Promise<string> {
  if (sessionToken && sessionToken.expires > Date.now()) return Promise.resolve(sessionToken.token);
  const google = identity();
  if (!google) return Promise.reject(new Error('Google sign-in is still loading.'));
  return new Promise((resolve, reject) => {
    google.accounts.oauth2
      .initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPE,
        callback: (response) => {
          if (
            response.error ||
            !response.access_token ||
            !google.accounts.oauth2.hasGrantedAllScopes(response, SCOPE)
          ) {
            reject(new Error('Google did not grant permission to create this file.'));
            return;
          }
          sessionToken = {
            token: response.access_token,
            expires: Date.now() + Math.max(0, (response.expires_in ?? 0) - 60) * 1000,
          };
          resolve(response.access_token);
        },
        error_callback: () => reject(new Error('Google sign-in was closed or could not open. You can try again.')),
      })
      .requestAccessToken({ prompt: '' });
  });
}
export async function uploadGoogleFile(
  token: string,
  blob: Blob,
  name: string,
  target: 'gdocs' | 'gsheets' | 'gslides',
): Promise<string> {
  const mimeType = {
    gdocs: 'application/vnd.google-apps.document',
    gsheets: 'application/vnd.google-apps.spreadsheet',
    gslides: 'application/vnd.google-apps.presentation',
  }[target];
  const boundary = `edutool-${crypto.randomUUID()}`;
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name, mimeType })}\r\n--${boundary}\r\nContent-Type: ${blob.type}\r\n\r\n`,
    blob,
    `\r\n--${boundary}--\r\n`,
  ]);
  // No automatic POST retry: an uncertain response must not create duplicate files.
  const response = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,mimeType,webViewLink',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
      signal: AbortSignal.timeout(90000),
    },
  );
  if (!response.ok) {
    if (response.status === 401) sessionToken = undefined;
    throw new Error(
      `Google Drive could not create the file (${response.status}). Check Drive before retrying if the upload was interrupted.`,
    );
  }
  const file = await response.json();
  if (file.mimeType !== mimeType || !/^[A-Za-z0-9_-]+$/.test(file.id ?? ''))
    throw new Error('Google did not confirm the expected file conversion. Check your Drive.');
  return `https://docs.google.com/${target === 'gdocs' ? 'document' : target === 'gsheets' ? 'spreadsheets' : 'presentation'}/d/${file.id}/edit`;
}
