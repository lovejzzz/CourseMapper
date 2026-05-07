/**
 * Custom Deliverable Library — localStorage-backed CRUD.
 *
 * Each custom deliverable definition:
 * {
 *   id:                 'custom_<timestamp>',
 *   name:               string,
 *   description:        string,
 *   icon:               string (SVG path),
 *   color:              string (one of COLOR_MAP keys),
 *   systemPrompt:       string,
 *   userPromptTemplate: string (must contain {{courseMap}} placeholder),
 *   outputFormat:       string (optional — JSON structure hint for the AI),
 *   defaultConfig: {
 *     tone:       string | null,   // e.g. 'Academic', 'Professional', 'Conversational'
 *     style:      string | null,   // e.g. 'Bullet points', 'Paragraphs', 'Tables'
 *     length:     string | null,   // e.g. 'Brief', 'Standard', 'Detailed'
 *   },
 *   createdAt:  number (ms),
 *   updatedAt:  number (ms),
 * }
 */

import { saveCustomDeliverable as cloudSave, deleteCustomDeliverable as cloudDelete, loadCustomDeliverables as cloudLoadAll } from './cloudStorage';
import { supportsCustomTemperature } from './agentProviders';

const STORAGE_KEY = 'coursemapper-custom-deliverables';

function readAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function writeAll(map) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch (e) {
    console.warn('Failed to save custom deliverables:', e);
  }
}

/**
 * Retrieve a custom deliverable definition by ID.
 * Custom deliverable IDs are prefixed with "custom_".
 * Returns null if not found.
 */
export function getCustomDeliverable(id) {
  const map = readAll();
  return map[id] || null;
}

/** List all saved custom deliverables, sorted by creation time (newest first). */
export function listCustomDeliverables() {
  const map = readAll();
  return Object.values(map).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

/**
 * Save (create or update) a custom deliverable.
 * If def.id is provided and exists, it updates; otherwise creates a new one.
 * Returns the saved definition (with id populated).
 */
export function saveCustomDeliverable(def, uid) {
  const map = readAll();
  const now = Date.now();
  const id = def.id && map[def.id] ? def.id : `custom_${now}`;
  const existing = map[id] || {};
  const saved = {
    ...existing,
    ...def,
    id,
    updatedAt: now,
    createdAt: existing.createdAt || now,
  };
  // Ensure required fields have defaults
  if (!saved.systemPrompt) {
    saved.systemPrompt = `You are an expert instructional designer creating a "${saved.name || 'custom deliverable'}" for a university course. Your output must be classroom-ready, well-structured, and pedagogically sound.

CRITICAL FORMATTING RULES:
1. Return ONLY valid JSON, no markdown fences.
2. Structure your output as a JSON object with a top-level array key (e.g. "${(saved.name || 'items').toLowerCase().replace(/\s+/g, '_')}") containing one item per lesson/week.
3. Each item MUST have at minimum: a "lessonTitle" (string), "weekNumber" (string like "Week 1"), and rich content fields appropriate for this deliverable type.
4. All text content should be detailed, specific to the course material, and written in complete sentences — never return raw data or placeholder text.
5. Format content for human readability: use numbered lists, clear section headers, and professional language throughout.`;
  }
  if (!saved.userPromptTemplate) {
    saved.userPromptTemplate = `Generate a complete "${saved.name || 'deliverable'}" for each lesson in this course.${saved.description ? `\n\nDeliverable description: ${saved.description}` : ''}

Course data:
{{courseMap}}

FORMATTING REQUIREMENTS:
- Create one entry per lesson/week in the course.
- Each entry should contain well-organized, detailed content appropriate for a "${saved.name || 'deliverable'}".
- Use clear section headings, numbered/bulleted lists, and professional academic language.
- Content must be specific to each lesson's topics and learning objectives — no generic filler.
- If this deliverable type typically has a known format (e.g., lab reports have Introduction/Methods/Results, feedback forms have rating scales + open questions, reflections have prompts + rubric), follow that conventional format.

Return ONLY a valid JSON object with this structure:
{
  "${(saved.name || 'items').toLowerCase().replace(/\s+/g, '_')}": [
    {
      "lessonTitle": "Lesson title here",
      "weekNumber": "Week 1",
      ... content fields appropriate for this deliverable type ...
    }
  ]
}`;
  }
  if (!saved.defaultConfig) saved.defaultConfig = {};
  if (!saved.icon) saved.icon = 'M12 6v6m0 0v6m0-6h6m-6 0H6'; // plus icon as default
  if (!saved.color) saved.color = 'violet';
  map[id] = saved;
  writeAll(map);
  // Fire-and-forget cloud sync if user is logged in
  if (uid) cloudSave(uid, id, saved).catch(e => console.warn('[Cloud] deliverable save failed:', e));
  return saved;
}

/** Delete a custom deliverable by ID. Returns true if deleted, false if not found. */
export function deleteCustomDeliverable(id, uid) {
  const map = readAll();
  if (!map[id]) return false;
  delete map[id];
  writeAll(map);
  // Fire-and-forget cloud sync if user is logged in
  if (uid) cloudDelete(uid, id).catch(e => console.warn('[Cloud] deliverable delete failed:', e));
  return true;
}

/**
 * AI auto-fill: given a deliverable name, call the AI to generate
 * description, tone, style, length, icon, and color suggestions.
 *
 * @param {string} name - deliverable name (e.g. "Weekly Reflection")
 * @param {{ provider: string, apiKey: string, modelId: string }} modelConfig
 * @returns {Promise<{ description, tone, style, length, iconLabel, color } | null>}
 */
export async function autoFillCustomDeliverable(name, { provider, apiKey, modelId }) {
  if (!name?.trim() || !modelId) return null;

  const effectiveProvider = provider;
  const tempSetting = supportsCustomTemperature(modelId) ? { temperature: 0 } : {};

  const trimmedName = name.trim();
  const jsonKey = trimmedName.toLowerCase().replace(/\s+/g, '_');
  const sysPrompt = 'You are an expert instructional designer specializing in Quality Matters (QM) aligned course design. Return ONLY valid JSON — no markdown, no explanation.';
  const userPrompt = `A university instructor wants to create a custom course deliverable called "${trimmedName}".

Generate a complete, professional configuration. Return JSON with these exact keys:
{
  "description": "1-2 sentence description of what this deliverable contains and what the AI will generate for each lesson",
  "tone": "<one of: Academic, Professional, Conversational, Friendly, Formal, Encouraging>",
  "style": "<one of: Bullet points, Paragraphs, Tables, Numbered lists, Mixed>",
  "length": "<one of: Brief, Standard, Detailed, Comprehensive>",
  "iconLabel": "<one of: Document, Chart, Light bulb, Users, Clipboard, Star, Puzzle, Beaker>",
  "color": "<one of: violet, indigo, sky, teal, emerald, amber, orange, rose, cyan>",
  "systemPrompt": "A detailed system prompt (5-8 sentences) for generating this deliverable. Must instruct the AI to: act as an expert instructional designer, produce classroom-ready output, align with Quality Matters standards, return ONLY valid JSON with no markdown fences, structure output as a JSON object with a top-level array containing one item per lesson/week, and include specific content fields appropriate for this deliverable type.",
  "userPromptTemplate": "A detailed user prompt template that includes {{courseMap}} placeholder where course data is inserted. Must specify: what to generate per lesson, the expected JSON output structure with field names appropriate for this deliverable type, formatting requirements (numbered lists, professional language, lesson-specific content), and a sample JSON schema showing the output structure with a top-level key '${jsonKey}' containing an array of objects with 'lessonTitle', 'weekNumber', and content fields."
}

IMPORTANT for systemPrompt and userPromptTemplate:
- These prompts will be sent to an AI to generate the actual deliverable content for each lesson in a course.
- The systemPrompt should establish expertise and formatting rules.
- The userPromptTemplate MUST contain the literal text {{courseMap}} (not replaced — kept as-is) where the course map JSON will be injected at runtime.
- Both should reference Quality Matters standards where relevant (e.g., objective alignment, learner support, accessibility).
- The userPromptTemplate should end with a sample JSON output schema so the AI knows exactly what format to return.
- Use the JSON key "${jsonKey}" as the top-level array name in the output schema.

Pick the most fitting tone, style, length, icon, and color for "${trimmedName}". Write a concise, helpful description.`;

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
          model: modelId, max_tokens: 1500, ...tempSetting,
          system: sysPrompt,
          messages: [{ role: 'user', content: userPrompt }],
        }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      responseText = data.content?.[0]?.text || '';

    } else if (effectiveProvider === 'openai') {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: modelId, max_completion_tokens: 1500, ...tempSetting, stream: false,
          response_format: { type: 'json_object' },
          messages: [{ role: 'system', content: sysPrompt }, { role: 'user', content: userPrompt }],
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
            systemInstruction: { parts: [{ text: sysPrompt }] },
            generationConfig: { ...tempSetting, maxOutputTokens: 1500, responseMimeType: 'application/json' },
          }),
        }
      );
      if (!res.ok) return null;
      const data = await res.json();
      responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    } else if (effectiveProvider === 'openrouter') {
      if (!apiKey) return null;
      const url = 'https://openrouter.ai/api/v1/chat/completions';
      const headers = { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'HTTP-Referer': window.location.origin };
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: modelId, max_tokens: 1500, ...tempSetting, stream: false,
          messages: [{ role: 'system', content: sysPrompt }, { role: 'user', content: userPrompt }],
        }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      responseText = data.choices?.[0]?.message?.content || '';
    }

    if (!responseText) return null;
    const cleaned = responseText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

/**
 * Convert a custom deliverable definition to the FEATURES format
 * used by FeatureSelect and Config screens.
 */
export function toFeatureEntry(def) {
  return {
    id: def.id,
    label: def.name || 'Custom Deliverable',
    description: def.description || 'A custom deliverable you created.',
    icon: def.icon || 'M12 6v6m0 0v6m0-6h6m-6 0H6',
    available: true,
    category: 'custom',
    color: def.color || 'violet',
    isCustom: true,
  };
}

/**
 * Merge cloud custom deliverables with localStorage on sign-in.
 * Cloud wins on conflict (by updatedAt).
 * Returns the merged map.
 */
export async function mergeCloudDeliverables(uid) {
  try {
    const cloudMap = await cloudLoadAll(uid);
    const localMap = readAll();
    const merged = { ...localMap };
    for (const [id, cloudDef] of Object.entries(cloudMap)) {
      const local = merged[id];
      if (!local || (cloudDef.updatedAt || 0) >= (local.updatedAt || 0)) {
        merged[id] = { ...cloudDef, id };
      }
    }
    // Also push any local-only items to cloud
    for (const [id, localDef] of Object.entries(localMap)) {
      if (!cloudMap[id]) {
        cloudSave(uid, id, localDef).catch(() => {});
      }
    }
    writeAll(merged);
    return merged;
  } catch (e) {
    console.warn('[Cloud] merge custom deliverables failed:', e);
    return readAll();
  }
}
