/** Remove response-envelope syntax that a constrained local decode may echo. */
export function stripInternalAgentMarkers(value = '') {
  return String(value || '')
    // A local decode can lose the braces/quotes around the shared response
    // envelope while retaining its field label: `chatReply:, Useful prose`.
    .replace(/^[\s[{("']*(?:chatReply|chat_reply)["']?\s*:\s*[,;:]?\s*/i, '')
    .replace(/^[\s)\]},;:]+/, '')
    .replace(/\s*\(?\btool(?:Index|_index)\s*=\s*\d+\)?/gi, '')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
