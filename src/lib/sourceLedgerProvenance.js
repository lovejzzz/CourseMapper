export const EXACT_SOURCE_LEDGER_PROVENANCE = 'compiler-owned-exact-source-ledger';

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
