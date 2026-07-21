/**
 * Crossref's REST API no longer returns an Access-Control-Allow-Origin
 * header consistently. A browser fetch therefore fails before JavaScript can
 * inspect the response and still leaves a loud CORS error in DevTools. Keep
 * the parser available to Node/build-time callers, but fail closed in the
 * backend-free browser runtime so complementary public providers can take
 * over without a guaranteed console error.
 */
export function canFetchCrossrefDirectly(scope = globalThis) {
  return !(scope?.window && scope.window.document);
}
