function compactFact(value, limit = 124) {
  const text = String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= limit) return text;
  const clipped = text
    .slice(0, limit - 1)
    .replace(/\s+\S*$/, '')
    .trim();
  return `${clipped || text.slice(0, limit - 1)}…`;
}

export function buildEvidenceTableVisualDescriptor(termAtoms = [], facts = []) {
  const termRows = termAtoms
    .map(([claim, definition, example]) =>
      claim && definition && example
        ? [claim, `${definition} — e.g., ${example.charAt(0).toLowerCase()}${example.slice(1)}.`]
        : null,
    )
    .filter((row) => row && row[0].length <= 42 && row[1].length <= 130)
    .slice(0, 4);
  if (termRows.length >= 2) {
    return {
      rows: termRows,
      columnLabels: ['CONCEPT', 'EVIDENCE'],
    };
  }
  const seen = new Set();
  const rows = facts
    // Array#map passes (value, index, array). Passing compactFact directly
    // accidentally treated each fact's index as its character limit, turning
    // later rows into "…", "A…", and similarly useless fragments.
    .map((fact) => compactFact(fact))
    .filter((fact) => {
      const key = fact.toLowerCase();
      if (!fact || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    // Three evidence rows remain fully legible in the fixed slide table.
    // A fourth long fact forces the Office renderer to clip the final cell;
    // the complete ledger still remains in the lesson's authored content.
    .slice(0, 3)
    .map((fact, index) => [`Fact ${index + 1}`, fact.charAt(0).toUpperCase() + fact.slice(1)]);

  return rows.length >= 2
    ? {
        rows,
        columnLabels: ['SOURCE ATOM', 'LESSON EVIDENCE'],
        tableLead: 'Use the fact ledger to compare what the lesson evidence supports.',
      }
    : { rows: [] };
}
