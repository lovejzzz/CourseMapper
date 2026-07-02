/**
 * scripts/prof/verdictLedger.mjs — the append-only verdict ledger with the
 * quote-or-discard rule enforced in code (design doc §6): a persona claim
 * with no verbatim quote from the artifact corpus is discarded and logged
 * with a reason. This is the single biggest defense against judge
 * hallucination — an opinion must point at real text.
 */

import fs from 'node:fs/promises';
import path from 'node:path';

/** Whitespace/punctuation-tolerant containment: quotes survive extraction noise. */
export function normalizeForQuoteMatch(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/[^a-z0-9'"-]+/g, ' ')
    .trim();
}

export function quoteAppearsInCorpus(quote, normalizedCorpus) {
  const normalized = normalizeForQuoteMatch(quote);
  // Too-short quotes match everything; they don't count as evidence.
  if (normalized.split(' ').filter(Boolean).length < 4) return false;
  return normalizedCorpus.includes(normalized);
}

export class VerdictLedger {
  constructor({ termDir, normalizedCorpus }) {
    this.ledgerPath = path.join(termDir, 'verdict-ledger.jsonl');
    this.discardPath = path.join(termDir, 'discarded-claims.jsonl');
    this.normalizedCorpus = normalizedCorpus;
    this.accepted = [];
    this.discarded = [];
  }

  /**
   * Validate one persona verdict: findings without a corpus-verbatim quote
   * are stripped (and logged); the verdict itself is kept with its surviving
   * findings. Returns the cleaned verdict.
   */
  screenVerdict(verdict, { universeId, personaId }) {
    const surviving = [];
    for (const finding of verdict.findings || []) {
      if (finding.quote && quoteAppearsInCorpus(finding.quote, this.normalizedCorpus)) {
        surviving.push(finding);
      } else {
        this.discarded.push({
          universeId,
          personaId,
          reason: finding.quote ? 'quote-not-in-corpus' : 'missing-quote',
          finding,
        });
      }
    }
    return { ...verdict, findings: surviving };
  }

  append(entry) {
    this.accepted.push(entry);
  }

  async flush() {
    await fs.writeFile(this.ledgerPath, this.accepted.map((entry) => JSON.stringify(entry)).join('\n') + '\n');
    await fs.writeFile(
      this.discardPath,
      this.discarded.length > 0 ? this.discarded.map((entry) => JSON.stringify(entry)).join('\n') + '\n' : '',
    );
    return { accepted: this.accepted.length, discarded: this.discarded.length };
  }
}
