import crypto from 'node:crypto';

export const SHA256_PATTERN = /^[a-f0-9]{64}$/;

export function scionIdentityHash(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function clean(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function canonicalScionCourseInput(project = {}) {
  const promptText = typeof project?.promptText === 'string' ? project.promptText : '';
  const fileNames = Array.isArray(project?.fileNames) ? project.fileNames.map(clean) : [];
  const sourcePacketSha256 = String(project?.sourcePacketSha256 || '');
  return {
    promptText,
    fileNames,
    ...(sourcePacketSha256 ? { sourcePacketSha256 } : {}),
  };
}

export function scionCourseInputSha256(project = {}) {
  return scionIdentityHash(JSON.stringify(canonicalScionCourseInput(project)));
}

function slug(value) {
  return clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/**
 * Build one stable course-group identity for every model variant of the same
 * exact course input. The hash always binds the readable group id to the
 * canonical input identity, so a reused label cannot hide a changed prompt.
 */
export function deriveScionCourseGroup({ domain, courseGroupId, courseInputSha256, prompt }) {
  const normalizedDomain = slug(domain) || 'unknown-domain';
  const inputSha256 = SHA256_PATTERN.test(String(courseInputSha256 || ''))
    ? String(courseInputSha256)
    : scionIdentityHash(JSON.stringify({ prompt: clean(prompt) }));
  const explicitId = slug(courseGroupId);
  const id = explicitId || `${normalizedDomain}-input-${inputSha256.slice(0, 20)}`;
  const sha256 = scionIdentityHash(
    JSON.stringify({
      schemaVersion: 1,
      domain: normalizedDomain,
      courseGroupId: id,
      courseInputSha256: inputSha256,
    }),
  );
  return {
    id,
    sha256,
    courseInputSha256: inputSha256,
    source: explicitId ? 'explicit-manifest-id' : 'canonical-input-digest',
  };
}
