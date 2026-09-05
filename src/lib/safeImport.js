/**
 * Wraps dynamic import() to handle stale chunk 404s after a new deployment.
 * If the import fails due to a missing chunk, prompts a page reload.
 */
export async function safeImport(importFn) {
  try {
    return await importFn();
  } catch (err) {
    if (
      err.message &&
      (err.message.includes('Failed to fetch dynamically imported module') ||
        err.message.includes('Loading chunk') ||
        err.message.includes('Loading CSS chunk'))
    ) {
      // Check if we already tried reloading to avoid infinite loops
      const key = 'coursemapper-chunk-reload';
      const last = sessionStorage.getItem(key);
      const now = Date.now();
      if (!last || now - Number(last) > 10000) {
        sessionStorage.setItem(key, String(now));
        window.location.reload();
        // Return a never-resolving promise while the page reloads
        return new Promise(() => {});
      }
      throw new Error('A new version of Course Mapper is available. Please refresh the page to continue.');
    }
    throw err;
  }
}
