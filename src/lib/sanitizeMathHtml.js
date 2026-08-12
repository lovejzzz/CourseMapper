import DOMPurify from 'dompurify';

const FORBIDDEN_TAGS = ['script', 'style', 'iframe', 'object', 'embed', 'link', 'meta', 'img', 'svg'];
const FORBIDDEN_ATTRS = new Set(['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus']);
const SANITIZER_BOUNDARY_ATTR = 'data-coursemapper-math-boundary';

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

function unwrapSanitizerBoundary(html) {
  if (typeof document === 'undefined' || !document.createElement) return html;
  const template = document.createElement('template');
  template.innerHTML = html;
  const boundary = template.content.querySelector(`[${SANITIZER_BOUNDARY_ATTR}]`);
  return boundary ? boundary.innerHTML : template.innerHTML;
}

export function sanitizeMathHtml(html) {
  const dirty = String(html || '');
  const purifier = getPurifier();
  const sanitized = purifier
    ? purifier.sanitize(`<div ${SANITIZER_BOUNDARY_ATTR}>${dirty}</div>`, {
        USE_PROFILES: { html: true },
        FORBID_TAGS: FORBIDDEN_TAGS,
        FORBID_ATTR: [...FORBIDDEN_ATTRS],
      })
    : dirty;
  // DOMPurify 3.4.13 intentionally removes a parser-promoted root in some
  // DOM implementations. Give it an application-owned boundary to remove,
  // then unwrap that boundary when the browser preserves it. Either branch
  // leaves the user-provided KaTeX root inside the sanitized result.
  return enforceMathHtmlBoundary(unwrapSanitizerBoundary(sanitized));
}
