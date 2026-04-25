/**
 * imageSearch.js - AI image generation for slide illustration.
 * Uses the user's existing API key: OpenAI (GPT Image / DALL-E 3) or Google (Imagen 3).
 * Anthropic does not support image generation.
 */

export const OPENAI_SLIDE_IMAGE_MODEL = 'gpt-image-2';
export const OPENAI_IMAGE_MODEL_FALLBACKS = [
  'gpt-image-2',
  'gpt-image-1.5',
  'gpt-image-1',
  'gpt-image-1-mini',
  'dall-e-3',
];
const OPENAI_LEGACY_IMAGE_MODEL = 'dall-e-3';

export async function fetchOpenAIImageModels(apiKey, signal) {
  if (!apiKey) return [];

  const res = await fetch('https://api.openai.com/v1/models', {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `OpenAI models API: ${res.status}`);
  }

  const json = await res.json();
  const ids = (json.data || [])
    .map(model => model?.id)
    .filter(id => typeof id === 'string')
    .filter(id => id.startsWith('gpt-image') || id.startsWith('dall-e'));

  const fallbackRank = new Map(OPENAI_IMAGE_MODEL_FALLBACKS.map((id, index) => [id, index * 10]));
  const rankModel = (id) => {
    if (fallbackRank.has(id)) return fallbackRank.get(id);
    if (id.startsWith('gpt-image-2-')) return 1;
    if (id.startsWith('gpt-image-1.5-')) return 11;
    if (id.startsWith('gpt-image-1-mini-')) return 31;
    if (id.startsWith('gpt-image-1-')) return 21;
    if (id.startsWith('dall-e-3')) return 40;
    if (id.startsWith('dall-e-2')) return 50;
    return 100;
  };
  return [...new Set(ids)].sort((a, b) => {
    const ar = rankModel(a);
    const br = rankModel(b);
    if (ar !== br) return ar - br;
    return b.localeCompare(a);
  });
}

export async function generateImages(query, { provider, apiKey, count = 2, model, size = '1024x1024', quality } = {}, signal) {
  if (!apiKey) {
    return { images: [], error: 'No API key configured.' };
  }

  if (provider === 'openai') {
    const imageModel = model || OPENAI_LEGACY_IMAGE_MODEL;
    if (imageModel.startsWith('gpt-image')) {
      return generateWithOpenAIImageFallbacks(query, apiKey, count, imageModel, size, quality, signal);
    }
    return generateWithDallE(query, apiKey, count, signal);
  }
  if (provider === 'google') {
    return generateWithImagen(query, apiKey, count, signal);
  }
  // Anthropic or unknown provider
  return {
    images: [],
    error: 'Image generation is not supported with your current provider. Switch to OpenAI or Google to generate images.',
  };
}

// ── OpenAI GPT Image ────────────────────────────────────────────────────────

async function generateWithOpenAIImageFallbacks(query, apiKey, count, preferredModel, size, quality, signal) {
  const models = [
    preferredModel,
    ...OPENAI_IMAGE_MODEL_FALLBACKS.filter(model => model !== preferredModel),
  ];
  const errors = [];

  for (const model of models) {
    const result = model.startsWith('gpt-image')
      ? await generateWithOpenAIImageModel(query, apiKey, count, model, size, quality, signal)
      : await generateWithDallE(query, apiKey, count, signal);
    if (result.images?.length > 0) return result;
    if (result.error) errors.push(`${model}: ${result.error}`);
  }

  return {
    images: [],
    error: errors.length > 0
      ? `OpenAI image generation failed for all fallback models. ${errors.join(' | ')}`
      : 'OpenAI image generation failed for all fallback models.',
  };
}

async function generateWithOpenAIImageModel(query, apiKey, count, model, size, quality, signal) {
  const images = [];
  const requests = Math.min(count, 4);

  for (let i = 0; i < requests; i++) {
    try {
      const res = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          prompt: query,
          n: 1,
          size,
          ...(quality ? { quality } : {}),
        }),
        signal,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message || `OpenAI Image API: ${res.status}`);
      }
      const json = await res.json();
      const item = json.data?.[0];
      if (item) {
        images.push({
          id: `gpt-image-${Date.now()}-${i}`,
          url: item.b64_json ? `data:image/png;base64,${item.b64_json}` : item.url,
          revisedPrompt: item.revised_prompt || query,
          provider: model,
        });
      }
    } catch (err) {
      if (err.name === 'AbortError') throw err;
      console.warn('[CM] GPT Image generation failed:', err.message);
      if (images.length === 0) return { images: [], error: err.message };
    }
  }
  return { images };
}

// ── OpenAI DALL-E 3 ─────────────────────────────────────────────────────────

async function generateWithDallE(query, apiKey, count, signal) {
  const images = [];
  const requests = Math.min(count, 2); // cap at 2 images

  for (let i = 0; i < requests; i++) {
    try {
      const res = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'dall-e-3',
          prompt: query,
          n: 1, // DALL-E 3 only supports n=1
          size: '1024x1024',
          response_format: 'url',
        }),
        signal,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message || `OpenAI Image API: ${res.status}`);
      }
      const json = await res.json();
      const item = json.data?.[0];
      if (item) {
        images.push({
          id: `dalle-${Date.now()}-${i}`,
          url: item.url,
          revisedPrompt: item.revised_prompt || query,
          provider: 'dall-e-3',
        });
      }
    } catch (err) {
      if (err.name === 'AbortError') throw err;
      console.warn('[CM] DALL-E generation failed:', err.message);
      if (images.length === 0) return { images: [], error: err.message };
    }
  }
  return { images };
}

// ── Google Imagen 3 ─────────────────────────────────────────────────────────

async function generateWithImagen(query, apiKey, count, signal) {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instances: [{ prompt: query }],
          parameters: { sampleCount: Math.min(count, 4) },
        }),
        signal,
      }
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `Imagen API: ${res.status}`);
    }
    const json = await res.json();
    const predictions = json.predictions || [];
    const images = predictions.map((p, i) => ({
      id: `imagen-${Date.now()}-${i}`,
      url: `data:image/png;base64,${p.bytesBase64Encoded}`,
      provider: 'imagen-3',
    }));
    return { images };
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    console.warn('[CM] Imagen generation failed:', err.message);
    return { images: [], error: err.message };
  }
}
