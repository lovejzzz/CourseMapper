import { cleanText, stripTerminalPunctuation } from './compilerText';
import { compactSlideInstructionLabel, selectVariant } from './courseCompilerCopyVariants';

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

function factLedgerLead(rows) {
  // Evidence rows are already compacted once for the fixed table. Clipping
  // the first row a second time produced a visible ellipsis and sometimes
  // removed the claim's predicate from the lead sentence.
  const firstEvidence = cleanText(rows?.[0]?.[1]);
  if (!firstEvidence) return '';
  return `Test this admitted claim before deciding: ${firstEvidence}`;
}

export function preferredKernelFacts(kernel = {}) {
  const canonical = Array.isArray(kernel.canonicalFacts) ? kernel.canonicalFacts : [];
  const facts = Array.isArray(kernel.facts) ? kernel.facts : [];
  return [...new Set([...canonical, ...facts].map(cleanText).filter(Boolean))];
}

export function preferredSlideTerm(terms = [], lessonNumber = 1) {
  const authored = terms.find((term) => !/-projection$/.test(cleanText(term?.source)));
  const leadDefinition = cleanText(terms[0]?.definition).toLowerCase();
  const differentiated = terms.find(
    (term) => cleanText(term?.definition) && cleanText(term?.definition).toLowerCase() !== leadDefinition,
  );
  // When every term was projected from the fact ledger, avoid making the
  // ledger's first (and most reused) claim the deck's default as well.
  return (
    authored ||
    differentiated ||
    terms[terms.length - 1] ||
    terms[(Math.max(1, Number(lessonNumber) || 1) - 1) % terms.length] ||
    null
  );
}

export function prepareEnrichedSlideCopy({ content = {}, kernel = {}, concept = 'Lesson concept' }) {
  const authoredTitle = stripTerminalPunctuation(cleanText(content.title));
  const titleIsLedgerFact = preferredKernelFacts(kernel).some(
    (fact) => stripTerminalPunctuation(fact).toLowerCase() === authoredTitle.toLowerCase(),
  );
  const seen = new Set();
  const notes = cleanText(content.notes)
    .split(/(?<=[.!?])\s+/)
    .filter((item) => {
      const key = stripTerminalPunctuation(item).toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join(' ');
  return {
    title: titleIsLedgerFact ? `${stripTerminalPunctuation(concept)}: source claim` : content.title,
    titleKey: authoredTitle.toLowerCase(),
    notes,
  };
}

export function displayedEvidenceNotePrefix(bullets = [], noteEvidence = '') {
  const evidenceKey = stripTerminalPunctuation(cleanText(noteEvidence)).toLowerCase();
  return bullets.some((bullet) => stripTerminalPunctuation(cleanText(bullet)).toLowerCase() === evidenceKey)
    ? 'Discuss the displayed evidence.'
    : `Verified evidence: ${stripTerminalPunctuation(noteEvidence)}.`;
}

export function slideAgendaDecisionCue({ lessonNumber, concept, secondary, sourceCue, artifact, successCriterion }) {
  const conceptLabel = compactSlideInstructionLabel(concept, 'lesson concept');
  const alternativeLabel = compactSlideInstructionLabel(secondary, 'alternative evidence', {
    rejectInstruction: true,
  });
  const sourceLabel = compactSlideInstructionLabel(sourceCue, 'assigned evidence', {
    rejectInstruction: true,
  });
  const artifactLabel = compactSlideInstructionLabel(artifact, 'course artifact', {
    rejectInstruction: true,
  });
  const criterionLabel = compactSlideInstructionLabel(successCriterion, 'the success criterion');
  const cue = selectVariant(lessonNumber, [
    `Source cue — ${sourceLabel}: decide what it supports and where it stops`,
    `Criterion — ${criterionLabel}: keep only evidence that visibly meets it`,
    `Keep the better-supported of two ${conceptLabel} claims`,
    `Use ${sourceLabel} to separate support from overreach`,
    `Set the evidence boundary for ${conceptLabel} before drawing a conclusion`,
    `Counterevidence — ${alternativeLabel}: decide whether it changes the current claim`,
    `For ${artifactLabel}, link one source detail to the learner's decision`,
    `Discard ${conceptLabel} evidence that misses the success criterion`,
    `For ${artifactLabel}, identify the source detail a scorer should inspect`,
    `Compare the strongest ${conceptLabel} claim with the uncertainty that remains`,
    `Before revising ${artifactLabel}, preserve its evidence-to-decision link`,
    `Alternative cue — ${alternativeLabel}: explain whether it changes the conclusion`,
  ]);
  return /[.!?]$/.test(cue) ? cue : `${cue}.`;
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
        tableLead: factLedgerLead(rows),
      }
    : { rows: [] };
}
