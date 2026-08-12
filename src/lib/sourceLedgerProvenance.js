export const EXACT_SOURCE_LEDGER_PROVENANCE = 'compiler-owned-exact-source-ledger';
export const SOURCE_LEDGER_AUTHORITIES = Object.freeze({
  VERIFIED_OPEN_RESEARCH: 'verified-open-research',
  INSTRUCTOR_SUPPLIED: 'instructor-supplied',
  SHIPPED_SOURCE_LIBRARY: 'shipped-source-library',
  ADMITTED_EVIDENCE_AUTHORITY: 'admitted-evidence-authority',
  MODEL_PROVISIONAL: 'model-provisional',
});

const AUTHORITATIVE_LEDGER_CLASSES = new Set([
  SOURCE_LEDGER_AUTHORITIES.VERIFIED_OPEN_RESEARCH,
  SOURCE_LEDGER_AUTHORITIES.INSTRUCTOR_SUPPLIED,
  SOURCE_LEDGER_AUTHORITIES.SHIPPED_SOURCE_LIBRARY,
  SOURCE_LEDGER_AUTHORITIES.ADMITTED_EVIDENCE_AUTHORITY,
]);

/**
 * v0.17.15 migration for saved projects produced before authority was stored
 * beside the exact-ledger marker. A legacy packet earns an inferred class only
 * when its own citation provenance is complete enough to recreate the Scion
 * evidence prepass admission: at least three exact facts, an explicitly fully
 * anchored concept ledger, and one cited source. A bare exact-copy marker, a
 * model fallback packet, or a partial research result remains provisional.
 */
export function inferLegacySourceLedgerAuthority(payload) {
  const facts = Array.isArray(payload?.kernel?.facts) ? payload.kernel.facts.filter(Boolean) : [];
  const provenance = payload?.conceptProvenance;
  const citations = Array.isArray(provenance?.citations) ? provenance.citations.filter(Boolean) : [];
  if (facts.length < 3 || provenance?.fullyAnchored !== true || citations.length === 0) return '';
  if (provenance?.source === 'algi-researched') return SOURCE_LEDGER_AUTHORITIES.VERIFIED_OPEN_RESEARCH;
  if (provenance?.source === 'genome-linked') return SOURCE_LEDGER_AUTHORITIES.SHIPPED_SOURCE_LIBRARY;
  return '';
}

/**
 * Exact source ledgers are copied verbatim from the compiler-owned prompt and
 * admitted only after every claim matches its frozen source slot. This marker
 * is never accepted from model output; the admission parser creates it after
 * the equality check. It therefore outranks generated/cache overlays when the
 * native authoring pipeline chooses a canonical lesson kernel.
 */
export function hasExactSourceLedgerProvenance(payload) {
  const facts = Array.isArray(payload?.kernel?.facts) ? payload.kernel.facts : [];
  const provenance = payload?.kernel?.provenance;
  return (
    facts.length > 0 &&
    provenance?.source === EXACT_SOURCE_LEDGER_PROVENANCE &&
    provenance?.copiedFactsVerbatim === true &&
    Number(provenance?.factCount) === facts.length
  );
}

/** Copy integrity and knowledge authority are deliberately separate. */
export function sourceLedgerAuthority(payload) {
  return String(
    payload?.sourceFactAuthority ||
      payload?.conceptProvenance?.authority ||
      payload?.kernel?.provenance?.authority ||
      inferLegacySourceLedgerAuthority(payload) ||
      SOURCE_LEDGER_AUTHORITIES.MODEL_PROVISIONAL,
  );
}

export function hasAuthoritativeSourceLedgerProvenance(payload) {
  return hasExactSourceLedgerProvenance(payload) && AUTHORITATIVE_LEDGER_CLASSES.has(sourceLedgerAuthority(payload));
}
