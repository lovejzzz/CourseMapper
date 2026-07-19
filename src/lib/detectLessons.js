import { supportsCustomTemperature } from './agentProviders';
import { getGoogleModelBaseUrl } from './googleProvider';
import { buildOpenAIResponsesBody, extractOpenAIResponsesText, prefersOpenAIResponsesApi } from './openaiProvider';

const SMALL_COUNT_WORDS = Object.freeze({
  single: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
});

const SMALL_COUNT_TOKEN = `(?:\\d{1,2}|${Object.keys(SMALL_COUNT_WORDS).join('|')})`;

function parseSmallCount(value) {
  const normalized = String(value || '').toLowerCase();
  return SMALL_COUNT_WORDS[normalized] || Number.parseInt(normalized, 10) || 0;
}

/**
 * Detect the expected number of lessons/weeks from syllabus text.
 * Scans for common patterns like "Week 1-15", "Module 12", schedule tables, etc.
 * Returns { expected: number|null, confidence: 'high'|'medium'|'low', source: string }
 */
export function detectExpectedLessons(text) {
  if (!text) return { expected: null, confidence: 'low', source: '' };

  const t = text.toLowerCase();
  let maxWeek = 0;
  let source = '';

  // Pattern 1a: "X-week <anything>" — hyphenated adjective form, e.g. "12-week graduate seminar"
  const weekAdjPat = /(\d{1,2})-week\b/i;
  const m1a = text.match(weekAdjPat);
  if (m1a) {
    const n = parseInt(m1a[1], 10);
    if (n >= 4 && n <= 52) return { expected: n, confidence: 'high', source: `"${m1a[0]}"` };
  }

  // Pattern 1a.2: "X-lesson/module/session <anything>" — hyphenated adjective form,
  // e.g. "8-lesson Spanish course" or "6-module training".
  const unitAdjPat = new RegExp(`(${SMALL_COUNT_TOKEN})-(lesson|module|session)\\b`, 'i');
  const m1unit = text.match(unitAdjPat);
  if (m1unit) {
    const n = parseSmallCount(m1unit[1]);
    if (n >= 1 && n <= 52) return { expected: n, confidence: 'high', source: `"${m1unit[0]}"` };
  }

  // Pattern 1b: "X week course/semester/seminar/program/class/workshop"
  const weekCoursePat =
    /(\d{1,2})\s*week\s*(?:course|semester|seminar|program|class|workshop|curriculum|sequence|series|training|bootcamp)/i;
  const m1 = text.match(weekCoursePat);
  if (m1) {
    const n = parseInt(m1[1], 10);
    if (n >= 4 && n <= 52) return { expected: n, confidence: 'high', source: `"${m1[0]}"` };
  }

  // Pattern 1b.2: "X lesson/module/session course/sequence/training"
  const unitCoursePat = new RegExp(
    `(${SMALL_COUNT_TOKEN})\\s*(?:lesson|module|session)s?\\s*(?:course|semester|seminar|program|class|workshop|curriculum|sequence|series|training|bootcamp)`,
    'i',
  );
  const m1unitCourse = text.match(unitCoursePat);
  if (m1unitCourse) {
    const n = parseSmallCount(m1unitCourse[1]);
    if (n >= 1 && n <= 52) return { expected: n, confidence: 'high', source: `"${m1unitCourse[0]}"` };
  }

  // Pattern 1b.3: An explicit compact unit count does not need a trailing
  // "course" noun. Users commonly write briefs such as "one lesson: Pinyin
  // and Tones" or "two modules — onboarding and practice". Treat those as
  // exact scope instead of asking the model to infer a larger course.
  const compactUnitCountPat = new RegExp(`\\b(${SMALL_COUNT_TOKEN})\\s+(lesson|module|session)s?\\b`, 'i');
  const compactUnitCount = text.match(compactUnitCountPat);
  if (compactUnitCount && SMALL_COUNT_WORDS[String(compactUnitCount[1]).toLowerCase()]) {
    const n = parseSmallCount(compactUnitCount[1]);
    if (n >= 1 && n <= 52) {
      return { expected: n, confidence: 'high', source: `"${compactUnitCount[0]}"` };
    }
  }

  // Pattern 2: Explicit "Weeks 1-15" or "Weeks 1 through 15"
  const rangePatterns = [
    /weeks?\s+(\d{1,2})\s*[-–—to]+\s*(\d{1,2})/gi,
    /weeks?\s+(\d{1,2})\s+through\s+(\d{1,2})/gi,
    /modules?\s+(\d{1,2})\s*[-–—to]+\s*(\d{1,2})/gi,
    /lessons?\s+(\d{1,2})\s*[-–—to]+\s*(\d{1,2})/gi,
    /sessions?\s+(\d{1,2})\s*[-–—to]+\s*(\d{1,2})/gi,
  ];

  for (const pat of rangePatterns) {
    let match;
    while ((match = pat.exec(text)) !== null) {
      const end = parseInt(match[2], 10);
      if (end > maxWeek && end <= 52) {
        maxWeek = end;
        source = `"${match[0]}"`;
      }
    }
  }

  if (maxWeek >= 4) return { expected: maxWeek, confidence: 'high', source };

  // Pattern 3: Count distinct "Week N" / "Module N" / "Lesson N" / "Session N" headers
  // Track week-like (week, session, class, lesson) vs module-like (module, unit) separately
  // so we can distinguish courses organized by modules from courses organized by weeks.
  const weekLikePatterns = [
    /(?:^|\n)\s*(?:week|wk\.?)\s*(\d{1,2})\b/gi,
    /(?:^|\n)\s*session\s*(\d{1,2})\b/gi,
    /(?:^|\n)\s*class\s*(\d{1,2})\b/gi,
    /(?:^|\n)\s*lesson\s*(\d{1,2})\b/gi,
  ];
  const moduleLikePatterns = [/(?:^|\n)\s*module\s*(\d{1,2})\b/gi, /(?:^|\n)\s*unit\s*(\d{1,2})\b/gi];

  const weekLikeNums = new Set();
  const moduleLikeNums = new Set();
  for (const pat of weekLikePatterns) {
    let match;
    while ((match = pat.exec(text)) !== null) {
      const n = parseInt(match[1], 10);
      if (n >= 1 && n <= 52) weekLikeNums.add(n);
    }
  }
  for (const pat of moduleLikePatterns) {
    let match;
    while ((match = pat.exec(text)) !== null) {
      const n = parseInt(match[1], 10);
      if (n >= 1 && n <= 52) moduleLikeNums.add(n);
    }
  }

  const weekNumbers = new Set([...weekLikeNums, ...moduleLikeNums]);

  if (weekNumbers.size >= 3) {
    const highest = Math.max(...weekNumbers);
    if (highest >= 4 && highest <= 52) {
      // Module/unit-only detection: cap confidence at 'medium' because modules
      // may not map 1:1 to weekly sessions (e.g. 7 modules spanning 15 weeks).
      const isModuleOnly = moduleLikeNums.size > 0 && weekLikeNums.size === 0;
      return {
        expected: highest,
        confidence: isModuleOnly ? 'medium' : weekNumbers.size >= highest * 0.6 ? 'high' : 'medium',
        source: isModuleOnly
          ? `Found ${moduleLikeNums.size} module/unit headers (may not match weekly sessions)`
          : `Found ${weekNumbers.size} distinct week/lesson headers (up to ${highest})`,
      };
    }
  }

  // Pattern 4: Date-based schedule — count distinct dates that look like weekly entries
  const dateLines = text.match(/(?:^|\n).*?\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\.?\s+\d{1,2}/gi);
  if (dateLines && dateLines.length >= 4) {
    return {
      expected: dateLines.length,
      confidence: 'medium',
      source: `Found ${dateLines.length} dated schedule entries`,
    };
  }

  // Pattern 5: Look for total count mentions like "15 lessons" or "12 modules"
  const totalPat = /(\d{1,2})\s+(weeks?|lessons?|modules?|sessions?|classes?|units?)\b/gi;
  let match;
  while ((match = totalPat.exec(text)) !== null) {
    const n = parseInt(match[1], 10);
    if (n >= 4 && n <= 52 && n > maxWeek) {
      maxWeek = n;
      source = `"${match[0]}"`;
    }
  }

  if (maxWeek >= 4) return { expected: maxWeek, confidence: 'medium', source };

  return { expected: null, confidence: 'low', source: 'Could not detect lesson count' };
}

/**
 * Ask the configured AI model how many lessons/weeks this course has.
 * Makes a single lightweight non-streaming call.
 * Returns a number (lesson count) or null if it can't determine.
 *
 * @param {string} text - Combined prompt text + parsed file text
 * @param {{ provider, apiKey, modelId }} modelConfig
 * @returns {Promise<number|null>}
 */
export async function detectLessonsWithAI(text, { provider, apiKey, modelId }) {
  if (!text?.trim() || !modelId) return null;

  const effectiveProvider = provider;
  const tempSetting = supportsCustomTemperature(modelId) ? { temperature: 0 } : {};

  const systemPrompt = 'You are a helpful assistant. Respond only with valid JSON — no markdown, no explanation.';
  const userPrompt = `Based on the course description below, determine:
1. How many WEEKS does this course run? (e.g. 15 for a typical semester, 10 for a quarter)
2. How many class sessions/lessons happen per week? (default 1 if unclear)
3. Total lessons = weeks × sessionsPerWeek

IMPORTANT: Distinguish between organizational units (modules, units, parts, themes) and actual weekly class sessions. A course may have 7 modules but span 15 weeks — count the WEEKS, not the modules. Look for:
- Explicit week counts ("15-week semester")
- Date-based schedules showing weekly meetings
- Academic calendar references (Fall/Spring semester = typically 14-16 weeks)
If only modules/units are listed without week counts, infer the total weeks from the academic term.

Respond with exactly this JSON: {"weeks": <integer>, "sessionsPerWeek": <integer>, "totalLessons": <integer>}

Course description:
${text.slice(0, 8000)}`;

  try {
    let responseText = '';

    if (effectiveProvider === 'webllm') {
      const { completeLocal } = await import('./webllm');
      const response = await completeLocal(
        modelId,
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        { temperature: 0, max_tokens: 64 },
      );
      responseText = response.choices?.[0]?.message?.content || '';
    } else if (effectiveProvider === 'anthropic') {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'content-type': 'application/json',
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: modelId,
          max_tokens: 64,
          ...tempSetting,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
        }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      responseText = data.content?.[0]?.text || '';
    } else if (effectiveProvider === 'openai') {
      const useResponses = prefersOpenAIResponsesApi(modelId);
      const res = await fetch(
        useResponses ? 'https://api.openai.com/v1/responses' : 'https://api.openai.com/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(
            useResponses
              ? buildOpenAIResponsesBody({
                  model: modelId,
                  systemPrompt,
                  userPrompt,
                  maxOutputTokens: 64,
                  temperature: tempSetting.temperature,
                  responseFormat: { type: 'json_object' },
                  stream: false,
                })
              : {
                  model: modelId,
                  messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt },
                  ],
                  response_format: { type: 'json_object' },
                  max_completion_tokens: 64,
                  ...tempSetting,
                  stream: false,
                },
          ),
        },
      );
      if (!res.ok) return null;
      const data = await res.json();
      responseText = useResponses ? extractOpenAIResponsesText(data) : data.choices?.[0]?.message?.content || '';
    } else if (effectiveProvider === 'google') {
      const baseUrl = getGoogleModelBaseUrl(apiKey, modelId);
      const res = await fetch(`${baseUrl}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
          systemInstruction: { parts: [{ text: systemPrompt }] },
          generationConfig: { ...tempSetting, maxOutputTokens: 64, responseMimeType: 'application/json' },
        }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    } else if (effectiveProvider === 'local') {
      const { getLocalEndpoint } = await import('./localProvider');
      const res = await fetch(`${getLocalEndpoint()}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: modelId,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          stream: false,
        }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      responseText = data.choices?.[0]?.message?.content || '';
    } else if (effectiveProvider === 'deepseek') {
      const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: modelId,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          max_tokens: 64,
          ...tempSetting,
          stream: false,
        }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      responseText = data.choices?.[0]?.message?.content || '';
    } else if (effectiveProvider === 'openrouter') {
      if (!apiKey) return null;
      const url = 'https://openrouter.ai/api/v1/chat/completions';
      const headers = {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': window.location.origin,
      };
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: modelId,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          max_tokens: 64,
          ...tempSetting,
          stream: false,
        }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      responseText = data.choices?.[0]?.message?.content || '';
    }

    // Parse the JSON response
    const cleaned = responseText.replace(/```[\s\S]*?```/g, '').trim();
    const start = cleaned.indexOf('{');
    if (start === -1) return null;
    const parsed = JSON.parse(cleaned.slice(start));

    // Prefer totalLessons; fall back to weeks*sessionsPerWeek; fall back to lessonCount
    let n = parseInt(parsed.totalLessons, 10);
    if (!Number.isFinite(n) || n < 1) {
      const weeks = parseInt(parsed.weeks, 10);
      const spw = parseInt(parsed.sessionsPerWeek, 10);
      if (Number.isFinite(weeks) && Number.isFinite(spw)) n = weeks * spw;
    }
    if (!Number.isFinite(n) || n < 1) n = parseInt(parsed.lessonCount, 10);
    if (Number.isFinite(n) && n >= 1 && n <= 104) return n;
    return null;
  } catch {
    return null;
  }
}
