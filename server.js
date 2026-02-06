import express from 'express';
import cors from 'cors';
import session from 'express-session';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: true,
  credentials: true,
}));
app.use(express.json({ limit: '50mb' }));

// Session middleware — stores API key server-side, sends only httpOnly cookie to client
app.use(session({
  secret: crypto.randomBytes(32).toString('hex'),
  resave: false,
  saveUninitialized: false,
  name: 'cm_sid',
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
  },
}));

// ── Store API key in server-side session ──
app.post('/api/session/set-key', (req, res) => {
  const { provider, apiKey } = req.body;
  if (!apiKey || !provider) {
    return res.status(400).json({ error: 'Provider and API key are required.' });
  }
  req.session.provider = provider;
  req.session.apiKey = apiKey;
  res.json({ ok: true });
});

app.get('/api/session/status', (req, res) => {
  res.json({
    hasKey: !!req.session.apiKey,
    provider: req.session.provider || null,
  });
});

// Helper: get API key — prefer session, fall back to request body
function getApiKey(req) {
  return req.session?.apiKey || req.body?.apiKey;
}
function getProvider(req) {
  return req.session?.provider || req.body?.provider;
}

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(join(__dirname, 'dist')));
}

// Fetch available models for a provider using the API key
app.post('/api/models', async (req, res) => {
  const provider = getProvider(req);
  const apiKey = getApiKey(req);

  if (!apiKey || !provider) {
    return res.status(400).json({ valid: false, error: 'API key and provider are required.' });
  }

  try {
    if (provider === 'openai') {
      const response = await fetch('https://api.openai.com/v1/models', {
        headers: { 'Authorization': `Bearer ${apiKey}` },
      });
      if (!response.ok) throw new Error('Invalid API key');
      const data = await response.json();
      // Filter to chat models, sort by id
      const chatModels = data.data
        .filter((m) => m.id.includes('gpt') || m.id.includes('o1') || m.id.includes('o3') || m.id.includes('o4'))
        .map((m) => ({ id: m.id, name: m.id }))
        .sort((a, b) => a.name.localeCompare(b.name));
      res.json({ valid: true, models: chatModels });
    } else if (provider === 'anthropic') {
      // Fetch real model list from Anthropic API
      const response = await fetch('https://api.anthropic.com/v1/models', {
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        if (err.error?.type === 'authentication_error') throw new Error('Invalid API key');
        throw new Error(err.error?.message || 'Failed to fetch models');
      }
      const data = await response.json();
      const models = (data.data || [])
        .map((m) => ({ id: m.id, name: m.display_name || m.id, created: m.created_at || '' }))
        .sort((a, b) => (b.created || '').localeCompare(a.created || ''));
      if (models.length === 0) throw new Error('No models available');
      res.json({ valid: true, models });
    } else if (provider === 'google') {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error?.message || 'Invalid API key');
      }
      const data = await response.json();
      const models = (data.models || [])
        .filter((m) => m.supportedGenerationMethods?.includes('generateContent') && m.name.includes('gemini'))
        .map((m) => ({
          id: m.name.replace('models/', ''),
          name: m.displayName || m.name.replace('models/', ''),
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
      if (models.length === 0) throw new Error('No Gemini models available');
      res.json({ valid: true, models });
    } else {
      res.status(400).json({ valid: false, error: 'Invalid provider.' });
    }
  } catch (err) {
    res.json({ valid: false, error: err.message, models: [] });
  }
});

// Streaming AI endpoint using SSE
app.post('/api/generate-stream', async (req, res) => {
  const { modelId, systemPrompt, userPrompt } = req.body;
  const provider = getProvider(req);
  const apiKey = getApiKey(req);

  if (!apiKey || !provider || !modelId) {
    return res.status(400).json({ error: 'API key, provider, and model are required.' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  try {
    if (provider === 'openai') {
      await streamOpenAI(apiKey, systemPrompt, userPrompt, modelId, res);
    } else if (provider === 'anthropic') {
      await streamAnthropic(apiKey, systemPrompt, userPrompt, modelId, res);
    } else if (provider === 'google') {
      await streamGoogle(apiKey, systemPrompt, userPrompt, modelId, res);
    } else {
      res.write(`data: ${JSON.stringify({ error: 'Invalid provider.' })}\n\n`);
    }
  } catch (err) {
    console.error('Stream error:', err.message);
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
  } finally {
    res.write('data: [DONE]\n\n');
    res.end();
  }
});

async function streamOpenAI(apiKey, systemPrompt, userPrompt, modelId, res) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
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
      max_tokens: 16384,
      temperature: 0.3,
      stream: true,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `OpenAI API error: ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data: ')) continue;
      const data = trimmed.slice(6);
      if (data === '[DONE]') return;

      try {
        const parsed = JSON.parse(data);
        const content = parsed.choices?.[0]?.delta?.content;
        if (content) {
          res.write(`data: ${JSON.stringify({ chunk: content })}\n\n`);
        }
      } catch {}
    }
  }
}

async function streamAnthropic(apiKey, systemPrompt, userPrompt, modelId, res) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'content-type': 'application/json',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: modelId,
      max_tokens: 16384,
      temperature: 0.3,
      stream: true,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `Anthropic API error: ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data: ')) continue;
      const data = trimmed.slice(6);

      try {
        const parsed = JSON.parse(data);
        if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
          res.write(`data: ${JSON.stringify({ chunk: parsed.delta.text })}\n\n`);
        }
      } catch {}
    }
  }
}

async function streamGoogle(apiKey, systemPrompt, userPrompt, modelId, res) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:streamGenerateContent?key=${apiKey}&alt=sse`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      systemInstruction: { parts: [{ text: systemPrompt }] },
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 16384,
        responseMimeType: 'application/json',
      },
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `Google API error: ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data: ')) continue;
      const data = trimmed.slice(6);

      try {
        const parsed = JSON.parse(data);
        const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          res.write(`data: ${JSON.stringify({ chunk: text })}\n\n`);
        }
      } catch {}
    }
  }
}

// AI proxy endpoint (non-streaming, kept for revisions)
app.post('/api/generate', async (req, res) => {
  const { modelId, systemPrompt, userPrompt } = req.body;
  const provider = getProvider(req);
  const apiKey = getApiKey(req);

  if (!apiKey || !provider || !modelId) {
    return res.status(400).json({ error: 'API key, provider, and model are required.' });
  }

  try {
    let result;

    if (provider === 'openai') {
      result = await callOpenAI(apiKey, systemPrompt, userPrompt, modelId);
    } else if (provider === 'anthropic') {
      result = await callAnthropic(apiKey, systemPrompt, userPrompt, modelId);
    } else {
      return res.status(400).json({ error: 'Invalid provider.' });
    }

    res.json({ result, modelName: modelId });
  } catch (err) {
    console.error('AI API error:', err.message);
    res.status(500).json({ error: err.message || 'Failed to generate course map.' });
  }
});

async function callOpenAI(apiKey, systemPrompt, userPrompt, modelId = 'gpt-4o') {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
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
      max_tokens: 16384,
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `OpenAI API error: ${response.status}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('No content in OpenAI response.');

  return JSON.parse(content);
}

async function callAnthropic(apiKey, systemPrompt, userPrompt, modelId = 'claude-sonnet-4-20250514') {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'content-type': 'application/json',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: modelId,
      max_tokens: 16384,
      temperature: 0.3,
      system: systemPrompt,
      messages: [
        { role: 'user', content: userPrompt },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `Anthropic API error: ${response.status}`);
  }

  const data = await response.json();
  const content = data.content?.[0]?.text;
  if (!content) throw new Error('No content in Anthropic response.');

  // Extract JSON from the response (Anthropic may wrap it in markdown)
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Could not parse JSON from Anthropic response.');

  return JSON.parse(jsonMatch[0]);
}

async function callGoogle(apiKey, systemPrompt, userPrompt, modelId = 'gemini-2.0-flash') {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      systemInstruction: { parts: [{ text: systemPrompt }] },
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 16384,
        responseMimeType: 'application/json',
      },
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `Google API error: ${response.status}`);
  }

  const data = await response.json();
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!content) throw new Error('No content in Google response.');

  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Could not parse JSON from Google response.');

  return JSON.parse(jsonMatch[0]);
}

// Examine endpoint — AI reviews course map for completeness/accuracy
app.post('/api/examine-stream', async (req, res) => {
  const { modelId, courseMap, syllabusText } = req.body;
  const provider = getProvider(req);
  const apiKey = getApiKey(req);

  if (!apiKey || !provider || !modelId || !courseMap) {
    return res.status(400).json({ error: 'All fields are required.' });
  }

  const systemPrompt = `You are an expert instructional designer performing a quality assurance review of a Course Map.

Your task is to carefully examine the provided Course Map against the original syllabus/course materials and identify any issues. Return ONLY targeted patches for cells that need fixing.

CHECK FOR:
1. Missing content — lessons, topics, activities, or assessments mentioned in the syllabus but absent from the course map.
2. Inaccurate information — wrong dates, mismatched topics, incorrect descriptions, or misattributed readings.
3. Incomplete cells — fields that are empty or too vague when the syllabus provides specific details.
4. Consistency — ensure lesson numbering, formatting, and terminology are consistent throughout.
5. Alignment — verify learning objectives align with assessments and activities for each lesson.

RULES:
- Do NOT return the whole course map. Return ONLY a JSON patches object.
- Only patch fields that actually need changes. Leave correct content alone.
- Do NOT remove or shorten existing correct content.
- If nothing needs fixing, return: {"patches": []}

IMPORTANT: Every patch MUST include a "reason" field that explains:
- WHAT was wrong (e.g., "Missing reading assignment mentioned on syllabus p.3")
- WHY you changed it (e.g., "Syllabus specifies Chapter 5, not Chapter 3")
- Cite the specific syllabus reference if applicable (page, section, week, date).
Be precise — vague reasons like "improved content" are NOT acceptable.

Return a JSON object with a "patches" array. Each patch targets a specific cell:
{"patches": [
  {"lessonIndex": 0, "sectionIndex": 0, "field": "learningObjectives", "value": "Corrected content...", "reason": "Syllabus Week 1 lists 'Analyze social policy frameworks' as an objective, but it was missing from the course map."},
  {"lessonIndex": 2, "field": "title", "value": "Lesson 3: Corrected Title", "reason": "Syllabus names this module 'Health Policy Analysis', not 'Policy Review'."},
  {"action": "addSection", "lessonIndex": 2, "sectionIndex": 3, "section": {"learningGoals": "...", ...}, "reason": "Syllabus Week 3 includes a second topic section on 'Community Health' that was omitted."},
  {"field": "courseName", "value": "Corrected Course Name", "reason": "Syllabus header shows the official course name as 'SOCW-GP 5001'."}
]}

- lessonIndex and sectionIndex are 0-based.
- For lesson titles, use "field": "title" with no sectionIndex.
- For section fields, include both lessonIndex and sectionIndex.
- For course-level fields (courseName, semester), just use "field" and "value".
- Every patch MUST have a "reason" string. No exceptions.
- Return ONLY the JSON object, no explanation or commentary.`;

  const userPrompt = `Here is the Course Map to examine:\n\n${JSON.stringify(courseMap)}${
    syllabusText ? `\n\nHere is the original syllabus/course material for reference:\n\n${syllabusText.slice(0, 30000)}` : ''
  }\n\nExamine this course map thoroughly. Return ONLY a JSON patches object for cells that need fixing. If nothing needs fixing, return {"patches": []}:`;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  try {
    if (provider === 'openai') {
      await streamOpenAI(apiKey, systemPrompt, userPrompt, modelId, res);
    } else if (provider === 'anthropic') {
      await streamAnthropic(apiKey, systemPrompt, userPrompt, modelId, res);
    } else if (provider === 'google') {
      await streamGoogle(apiKey, systemPrompt, userPrompt, modelId, res);
    } else {
      res.write(`data: ${JSON.stringify({ error: 'Invalid provider.' })}\n\n`);
    }
  } catch (err) {
    console.error('Examine stream error:', err.message);
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
  } finally {
    res.write('data: [DONE]\n\n');
    res.end();
  }
});

// Streaming revision endpoint
app.post('/api/revise-stream', async (req, res) => {
  const { modelId, courseMap, userMessage, userEdits, chatHistory } = req.body;
  const provider = getProvider(req);
  const apiKey = getApiKey(req);

  if (!apiKey || !provider || !modelId || !courseMap || !userMessage) {
    return res.status(400).json({ error: 'All fields are required.' });
  }

  const systemPrompt = `You are an expert instructional designer assistant. You have previously generated a Course Map (provided as JSON). You are now chatting with the user about it.

FIRST, determine if the user's message is:
(A) A REVISION REQUEST — they want to change, add, remove, or fix something in the course map.
(B) A CONVERSATIONAL MESSAGE — they are saying thanks, asking a question, confirming things look good, making a comment, etc.

If (B) CONVERSATIONAL: Respond with ONLY a JSON object like this:
{"chatReply": "Your friendly response here."}
Do NOT regenerate or return the course map. Just reply naturally and helpfully.

If (A) REVISION REQUEST: You MUST use the PATCH FORMAT to minimize token usage. Return ONLY a JSON object with a "patches" array. Each patch targets a specific cell:

{"patches": [
  {"lessonIndex": 0, "sectionIndex": 0, "field": "learningObjectives", "value": "New content..."},
  {"lessonIndex": 2, "field": "title", "value": "Lesson 3: New Title"},
  {"lessonIndex": 1, "sectionIndex": 1, "field": "syncActivities", "value": "Updated activity..."},
  {"action": "addLesson", "lessonIndex": 5, "lesson": {"title": "...", "sections": [...]}},
  {"action": "addSection", "lessonIndex": 2, "sectionIndex": 3, "section": {"learningGoals": "...", ...}},
  {"action": "removeLesson", "lessonIndex": 4},
  {"field": "courseName", "value": "Updated Course Name"},
  {"field": "semester", "value": "SP27"}
]}

PATCH RULES:
1. ONLY include patches for fields that actually need to change. Do NOT include unchanged content.
2. lessonIndex and sectionIndex are 0-based.
3. For lesson titles, use "field": "title" with no sectionIndex.
4. For section fields, include both lessonIndex and sectionIndex.
5. For course-level fields, just use "field" and "value".
6. Return ONLY the JSON patches object, no explanation or commentary.
7. If the user provides additional reference files, create patches for the specific sections that need new info.
8. Consider the full conversation history when making changes — do NOT undo previous revisions unless the user explicitly asks.`;

  let editsContext = '';
  if (userEdits && userEdits.length > 0) {
    editsContext = '\n\nIMPORTANT — The user has manually edited some cells since the last AI generation. Respect and preserve these manual changes unless the user explicitly asks to change them:\n';
    for (const edit of userEdits) {
      if (edit.key === 'title') {
        editsContext += `- Lesson ${edit.lessonIdx + 1} title changed from "${edit.oldValue}" to "${edit.newValue}"\n`;
      } else {
        editsContext += `- Lesson ${edit.lessonIdx + 1}, Section ${edit.sectionIdx + 1}, ${edit.key}: changed from "${edit.oldValue.slice(0, 80)}..." to "${edit.newValue.slice(0, 80)}..."\n`;
      }
    }
  }

  // Build conversation history context
  let historyContext = '';
  if (chatHistory && chatHistory.length > 0) {
    historyContext = '\n\nPrevious conversation (for context — do NOT repeat these changes, they are already applied):\n';
    for (const msg of chatHistory) {
      const prefix = msg.role === 'user' ? 'User' : 'Assistant';
      historyContext += `${prefix}: ${msg.text}\n`;
    }
  }

  const userPrompt = `Here is the current Course Map JSON:\n\n${JSON.stringify(courseMap)}${editsContext}${historyContext}\n\nUser's latest request:\n${userMessage}\n\nReturn ONLY the JSON patches object:`;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  try {
    if (provider === 'openai') {
      await streamOpenAI(apiKey, systemPrompt, userPrompt, modelId, res);
    } else if (provider === 'anthropic') {
      await streamAnthropic(apiKey, systemPrompt, userPrompt, modelId, res);
    } else if (provider === 'google') {
      await streamGoogle(apiKey, systemPrompt, userPrompt, modelId, res);
    } else {
      res.write(`data: ${JSON.stringify({ error: 'Invalid provider.' })}\n\n`);
    }
  } catch (err) {
    console.error('Revision stream error:', err.message);
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
  } finally {
    res.write('data: [DONE]\n\n');
    res.end();
  }
});

// Revision endpoint (non-streaming, kept as fallback)
app.post('/api/revise', async (req, res) => {
  const { modelId, courseMap, userMessage } = req.body;
  const provider = getProvider(req);
  const apiKey = getApiKey(req);

  if (!apiKey || !provider || !modelId || !courseMap || !userMessage) {
    return res.status(400).json({ error: 'All fields are required.' });
  }

  const systemPrompt = `You are an expert instructional designer. You have previously generated a Course Map (provided as JSON). The user wants revisions. Apply their requested changes and return the COMPLETE updated Course Map as valid JSON in the exact same format. Return ONLY the JSON object, no explanation.`;

  const userPrompt = `Here is the current Course Map JSON:\n\n${JSON.stringify(courseMap)}\n\nUser's revision request:\n${userMessage}\n\nReturn the complete updated Course Map JSON:`;

  try {
    let result;
    if (provider === 'openai') {
      result = await callOpenAI(apiKey, systemPrompt, userPrompt, modelId);
    } else if (provider === 'anthropic') {
      result = await callAnthropic(apiKey, systemPrompt, userPrompt, modelId);
    } else if (provider === 'google') {
      result = await callGoogle(apiKey, systemPrompt, userPrompt, modelId);
    } else {
      return res.status(400).json({ error: 'Invalid provider.' });
    }

    res.json({ result, modelName: modelId });
  } catch (err) {
    console.error('Revision API error:', err.message);
    res.status(500).json({ error: err.message || 'Failed to revise course map.' });
  }
});

// Catch-all for SPA in production
if (process.env.NODE_ENV === 'production') {
  app.get('*', (req, res) => {
    res.sendFile(join(__dirname, 'dist', 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
