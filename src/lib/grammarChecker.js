/**
 * grammarChecker.js — LanguageTool API wrapper for grammar/style checking.
 * Free: 20 req/min, 75K chars/min. No API key required for basic checks.
 */

const LANGUAGETOOL_URL = 'https://api.languagetool.org/v2/check';

export async function checkGrammar(text, language = 'en-US', signal) {
  if (!text || text.length < 20) return { matches: [] };

  // Truncate to avoid rate limits (max 10K chars per request)
  const truncated = text.slice(0, 10000);

  try {
    const res = await fetch(LANGUAGETOOL_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        text: truncated,
        language,
        disabledRules: 'WHITESPACE_RULE,COMMA_PARENTHESIS_WHITESPACE',
      }),
      signal,
    });

    if (!res.ok) throw new Error(`LanguageTool: ${res.status}`);
    const json = await res.json();

    return {
      matches: (json.matches || []).map(m => ({
        message: m.message,
        shortMessage: m.shortMessage || m.message,
        offset: m.offset,
        length: m.length,
        context: m.context?.text || '',
        replacements: (m.replacements || []).slice(0, 3).map(r => r.value),
        rule: m.rule?.id || '',
        category: m.rule?.category?.name || 'Grammar',
      })),
    };
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    console.warn('[CM] LanguageTool check failed:', err.message);
    return { matches: [], error: err.message };
  }
}
