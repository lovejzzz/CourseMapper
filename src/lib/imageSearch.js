/**
 * imageSearch.js — AI image generation for slide illustration.
 * Uses the user's existing API key: OpenAI (DALL-E 3) or Google (Imagen 3).
 * Anthropic does not support image generation.
 */

export async function generateImages(query, { provider, apiKey, count = 2 } = {}, signal) {
  if (!apiKey) {
    return { images: [], error: 'No API key configured.' };
  }

  if (provider === 'openai') {
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
