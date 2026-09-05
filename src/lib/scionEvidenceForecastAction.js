/**
 * Decide whether Scion's primary generation action must disclose and enable
 * current-source research.
 *
 * Evidence need is independent of the author's device route. A browser that
 * can run the local model still needs authoritative sources for lesson topics
 * the shipped library cannot support. Device capability decides who writes
 * the lesson; it must never decide whether unsupported claims are researched.
 */
export function shouldOfferCurrentSourceResearch({
  scionSelected = false,
  researchEnabled = false,
  forecast = null,
} = {}) {
  return Boolean(
    scionSelected && forecast?.status === 'ready' && Number(forecast?.externalNeeded) > 0 && researchEnabled !== true,
  );
}
