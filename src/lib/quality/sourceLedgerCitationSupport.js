export function sourceLedgerSupportForCitation(cite, manifest) {
  const citeText = String(cite?.text || '');
  const normalizedCitation = citeText.toLowerCase().replace(/\s+/g, ' ').trim();
  const ledger = Array.isArray(manifest?.sourceLedger) ? manifest.sourceLedger : [];
  const row = ledger.find((candidate) => {
    const url = String(candidate?.url || '').trim();
    if (url && citeText.includes(url)) return true;
    const title = String(candidate?.title || candidate?.citation || '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
    return title.length >= 8 && normalizedCitation.includes(title);
  });
  if (!row) return '';
  return [
    row.evidence,
    ...(Array.isArray(row.conceptLinks)
      ? row.conceptLinks.map((link) => (typeof link === 'string' ? link : link?.label || link?.id || ''))
      : []),
  ]
    .filter(Boolean)
    .join(' ');
}
