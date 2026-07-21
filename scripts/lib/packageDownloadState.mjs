export const DOWNLOAD_ZIP_ACTION_PATTERN = /Download(?: draft)? ZIP/i;

/**
 * Publish readiness and archive exportability are separate promises. A
 * verified draft can carry blocking review notes and still be downloadable,
 * so automation must recognize the explicit draft action instead of requiring
 * a green readiness card.
 */
export function isDownloadablePackageState(status, zipLabel) {
  const label = String(zipLabel || '');
  if (!DOWNLOAD_ZIP_ACTION_PATTERN.test(label)) return false;
  if (/Download draft ZIP/i.test(label)) return true;

  const normalizedStatus = String(status || '');
  return (
    /\bReady to download\b/i.test(normalizedStatus) ||
    /\bReview before download\b/i.test(normalizedStatus) ||
    /\bReady with notes\b/i.test(normalizedStatus) ||
    /\bReview recommended\b/i.test(normalizedStatus) ||
    /^\s*Ready\s*$/i.test(normalizedStatus)
  );
}
