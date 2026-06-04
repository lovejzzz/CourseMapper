import DOMPurify from 'dompurify';

const FORBIDDEN_TAGS = ['script', 'style', 'iframe', 'object', 'embed', 'link', 'meta', 'img', 'svg'];
const FORBIDDEN_ATTRS = new Set(['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus']);

function getPurifier() {
  if (typeof DOMPurify === 'function' && typeof window !== 'undefined' && window.document) {
    const purifier = DOMPurify(window);
    if (purifier && typeof purifier.sanitize === 'function') return purifier;
  }
  if (DOMPurify && typeof DOMPurify.sanitize === 'function') return DOMPurify;
  return null;
}

function enforceMathHtmlBoundary(html) {
  if (typeof document === 'undefined' || !document.createElement) {
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<(?:script|style|iframe|object|embed|link|meta|img|svg)\b[^>]*>/gi, '')
      .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
      .replace(/\s+(href|src|xlink:href)\s*=\s*(["'])\s*javascript:[\s\S]*?\2/gi, '');
  }

  const template = document.createElement('template');
  template.innerHTML = html;
  template.content.querySelectorAll(FORBIDDEN_TAGS.join(',')).forEach((node) => node.remove());
  template.content.querySelectorAll('*').forEach((node) => {
    [...node.attributes].forEach((attribute) => {
      const name = attribute.name.toLowerCase();
      const value = String(attribute.value || '').trim();
      if (name.startsWith('on') || FORBIDDEN_ATTRS.has(name)) {
        node.removeAttribute(attribute.name);
      } else if (/^(?:href|src|xlink:href)$/i.test(name) && /^javascript:/i.test(value)) {
        node.removeAttribute(attribute.name);
      }
    });
  });
  return template.innerHTML;
}

export function sanitizeMathHtml(html) {
  const dirty = String(html || '');
  const purifier = getPurifier();
  const sanitized = purifier
    ? purifier.sanitize(dirty, {
        USE_PROFILES: { html: true },
        FORBID_TAGS: FORBIDDEN_TAGS,
        FORBID_ATTR: [...FORBIDDEN_ATTRS],
      })
    : dirty;
  return enforceMathHtmlBoundary(sanitized);
}
