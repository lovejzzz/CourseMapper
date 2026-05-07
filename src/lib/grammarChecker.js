/**
 * grammarChecker.js — LanguageTool API wrapper for grammar/style checking.
 * Free: 20 req/min, 75K chars/min. No API key required for basic checks.
 */

const LANGUAGETOOL_URL = 'https://api.languagetool.org/v2/check';

const GRAMMAR_TIMEOUT_MS = 15000;

export async function checkGrammar(text, language = 'en-US', signal) {
  if (!text || text.length < 20) return { matches: [] };

  // Truncate to avoid rate limits (max 10K chars per request)
  const truncated = text.slice(0, 10000);

  // Create a timeout-aware abort signal (merges with caller's signal)
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), GRAMMAR_TIMEOUT_MS);

  // If the caller's signal fires, also abort our controller
  if (signal) signal.addEventListener('abort', () => timeoutController.abort(), { once: true });

  try {
    const res = await fetch(LANGUAGETOOL_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        text: truncated,
        language,
        disabledRules: 'WHITESPACE_RULE,COMMA_PARENTHESIS_WHITESPACE',
      }),
      signal: timeoutController.signal,
    });

    if (!res.ok) throw new Error(`LanguageTool: ${res.status}`);
    const json = await res.json();

    return {
      matches: (json.matches || []).map((m) => ({
        message: m.message,
        shortMessage: m.shortMessage || m.message,
        offset: m.offset,
        length: m.length,
        context: m.context?.text || '',
        replacements: (m.replacements || []).slice(0, 3).map((r) => r.value),
        rule: m.rule?.id || '',
        category: m.rule?.category?.name || 'Grammar',
      })),
    };
  } catch (err) {
    // Re-throw only if the *caller's* signal was the one that aborted
    if (err.name === 'AbortError' && signal?.aborted) throw err;
    // Timeout or network error — return graceful fallback
    if (err.name === 'AbortError') {
      console.warn('[CM] LanguageTool check timed out after', GRAMMAR_TIMEOUT_MS, 'ms');
      return { matches: [], error: 'Grammar check timed out. The service may be slow — try again later.' };
    }
    console.warn('[CM] LanguageTool check failed:', err.message);
    return { matches: [], error: err.message };
  } finally {
    clearTimeout(timeoutId);
  }
}
