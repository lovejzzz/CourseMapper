/**
 * instructorVerification.js — CurriculumOS V1: who may verify genome atoms.
 *
 * Tier T3 (instructor-verified) is the human loop that makes the genome better
 * than any fresh model call. In V1 the eligibility signal is a verified
 * academic email (.edu and common international academic domains) from the
 * existing Firebase auth. This module is the pure predicate; the UI and the
 * (dormant) verification-event writer consume it.
 *
 * See docs/CURRICULUMOS_V1_DESIGN.md §7.3.
 */

const ACADEMIC_DOMAIN_RE = /\.(edu|ac\.[a-z]{2,}|edu\.[a-z]{2,})$/i;

/** True when the email belongs to a recognized academic institution. */
export function isAcademicEmail(email) {
  const normalized = String(email || '')
    .trim()
    .toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized)) return false;
  const domain = normalized.split('@')[1] || '';
  return ACADEMIC_DOMAIN_RE.test(domain);
}

/**
 * Eligibility to record T3 verifications. Requires a signed-in user with a
 * verified academic email. Returns { eligible, reason }.
 */
export function instructorVerificationEligibility(user) {
  if (!user) return { eligible: false, reason: 'not-signed-in' };
  if (user.emailVerified === false) return { eligible: false, reason: 'email-unverified' };
  if (!isAcademicEmail(user.email)) return { eligible: false, reason: 'non-academic-email' };
  return { eligible: true, reason: 'academic-verified' };
}

/**
 * Build a verification event for the (dormant) queue. `verdict` is 'confirm'
 * (T3 count +1) or 'correct' (files a correction against the atom).
 */
export function buildVerificationEvent({ user, conceptId, rev, verdict, correction = '' } = {}) {
  const eligibility = instructorVerificationEligibility(user);
  if (!eligibility.eligible) return { ok: false, reason: eligibility.reason };
  if (!conceptId || !['confirm', 'correct'].includes(verdict)) return { ok: false, reason: 'bad-event' };
  return {
    ok: true,
    event: {
      conceptId,
      rev: Number(rev) || 1,
      verdict,
      correction: verdict === 'correct' ? String(correction || '').slice(0, 2000) : '',
      // Domain only — never the full email — so the queue stays low-PII.
      institutionDomain: String(user.email).split('@')[1].toLowerCase(),
      at: new Date().toISOString(),
    },
  };
}
