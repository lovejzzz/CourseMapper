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

  // Pattern 1b: "X week course/semester/seminar/program/class/workshop"
  const weekCoursePat = /(\d{1,2})\s*week\s*(?:course|semester|seminar|program|class|workshop|curriculum|sequence|series|training|bootcamp)/i;
  const m1 = text.match(weekCoursePat);
  if (m1) {
    const n = parseInt(m1[1], 10);
    if (n >= 4 && n <= 52) return { expected: n, confidence: 'high', source: `"${m1[0]}"` };
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
  const headerPatterns = [
    /(?:^|\n)\s*(?:week|wk\.?)\s*(\d{1,2})\b/gi,
    /(?:^|\n)\s*module\s*(\d{1,2})\b/gi,
    /(?:^|\n)\s*lesson\s*(\d{1,2})\b/gi,
    /(?:^|\n)\s*session\s*(\d{1,2})\b/gi,
    /(?:^|\n)\s*unit\s*(\d{1,2})\b/gi,
    /(?:^|\n)\s*class\s*(\d{1,2})\b/gi,
  ];

  const weekNumbers = new Set();
  for (const pat of headerPatterns) {
    let match;
    while ((match = pat.exec(text)) !== null) {
      const n = parseInt(match[1], 10);
      if (n >= 1 && n <= 52) weekNumbers.add(n);
    }
  }

  if (weekNumbers.size >= 3) {
    const highest = Math.max(...weekNumbers);
    // If we found headers 1,2,3...N and N is reasonable, use it
    if (highest >= 4 && highest <= 52) {
      return {
        expected: highest,
        confidence: weekNumbers.size >= highest * 0.6 ? 'high' : 'medium',
        source: `Found ${weekNumbers.size} distinct week/module headers (up to ${highest})`,
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

  // Resolve effective provider (same logic as useStreamReader)
  let effectiveProvider = provider;
  if (provider === 'free') {
    effectiveProvider = (modelId.includes('/') && !modelId.startsWith('gemini')) ? 'openrouter' : 'google';
  }

  const systemPrompt = 'You are a helpful assistant. Respond only with valid JSON — no markdown, no explanation.';
  const userPrompt = `Based on the course description below, determine:
1. How many weeks does this course run? (e.g. 15 for a typical semester, 10 for a quarter)
2. How many class sessions/lessons happen per week? (e.g. 1 for once-a-week, 2 for twice-a-week like MWF→3, TTh→2)
3. Total lessons = weeks × sessionsPerWeek

If values are not explicitly stated, make reasonable inferences (a "seminar" or "graduate" course is typically once a week; "lecture" courses are often 2-3x/week; default sessionsPerWeek=1 if unclear).

Respond with exactly this JSON: {"weeks": <integer>, "sessionsPerWeek": <integer>, "totalLessons": <integer>}

Course description:
${text.slice(0, 4000)}`;

  try {
    let responseText = '';

    if (effectiveProvider === 'anthropic') {
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
          temperature: 0,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
        }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      responseText = data.content?.[0]?.text || '';

    } else if (effectiveProvider === 'openai') {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: modelId,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          response_format: { type: 'json_object' },
          max_completion_tokens: 64,
          temperature: 0,
          stream: false,
        }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      responseText = data.choices?.[0]?.message?.content || '';

    } else if (effectiveProvider === 'google') {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
            systemInstruction: { parts: [{ text: systemPrompt }] },
            generationConfig: { temperature: 0, maxOutputTokens: 64, responseMimeType: 'application/json' },
          }),
        }
      );
      if (!res.ok) return null;
      const data = await res.json();
      responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    } else if (effectiveProvider === 'openrouter') {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': window.location.origin,
        },
        body: JSON.stringify({
          model: modelId,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          max_tokens: 64,
          temperature: 0,
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
