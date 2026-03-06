/**
 * imageSearch.js — Pixabay API wrapper for slide illustration.
 * Requires a free API key from pixabay.com, stored in localStorage.
 */

const PIXABAY_KEY_NAME = 'coursemapper-pixabay-key';

export function getPixabayKey() {
  return localStorage.getItem(PIXABAY_KEY_NAME) || '';
}

export function setPixabayKey(key) {
  localStorage.setItem(PIXABAY_KEY_NAME, key);
}

export function hasPixabayKey() {
  return !!getPixabayKey();
}

export async function searchImages(query, options = {}, signal) {
  const key = getPixabayKey();
  if (!key) {
    return { images: [], error: 'No Pixabay API key configured. Add one in Settings.' };
  }

  const { perPage = 6, imageType = 'photo', category = '' } = options;
  try {
    const params = new URLSearchParams({
      key,
      q: query,
      image_type: imageType,
      per_page: String(perPage),
      safesearch: 'true',
      ...(category ? { category } : {}),
    });
    const res = await fetch(`https://pixabay.com/api/?${params}`, { signal });
    if (!res.ok) throw new Error(`Pixabay: ${res.status}`);
    const json = await res.json();
    const images = (json.hits || []).map(img => ({
      id: img.id,
      previewUrl: img.previewURL,
      webformatUrl: img.webformatURL,
      largeUrl: img.largeImageURL,
      tags: img.tags,
      user: img.user,
      width: img.imageWidth,
      height: img.imageHeight,
      pageUrl: img.pageURL,
    }));
    return { images };
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    console.warn('[CM] Pixabay search failed:', err.message);
    return { images: [], error: err.message };
  }
}
