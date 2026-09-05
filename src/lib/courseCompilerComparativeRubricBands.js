function clean(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildComparativeLiteraturePerformanceBand({ assessment, criterion, planEntry, evidenceEntry }) {
  const title = clean(assessment?.title || assessment?.artifact);
  const criterionText = clean(criterion);
  const isResponses = /\bcomparative reading responses?\b/i.test(title);
  const isProposal = /\bcomparative essay proposal\b/i.test(title);
  const isFinal = /\bfinal\s+(?:comparative\s+)?(?:paper|essay)\b/i.test(title);
  if (!isResponses && !isProposal && !isFinal) return null;

  let bands;
  if (isResponses && /\bpaired,\s*locatable passage evidence\b/i.test(criterionText)) {
    bands = {
      exemplary:
        'Both responses analyze one locatable passage or formal feature from each assigned work; every comparison lets a scorer verify the paired evidence in context.',
      proficient:
        'Both responses use evidence from each assigned work, with one passage locator, formal feature, or contextual connection needing more precision.',
      developing:
        'The responses mention both works but rely on summary, uneven passage analysis, or evidence from only one side of a pairing.',
      beginning: 'One or both responses omit an assigned work or provide no locatable paired textual evidence.',
    };
  } else if (isResponses && /\bcomparative claim\b/i.test(criterionText)) {
    bands = {
      exemplary:
        'Each response advances an arguable comparative claim whose consequential similarity or difference can be explained only by analyzing both paired works.',
      proficient:
        'Each response makes a comparative claim and analyzes both works, though one relationship or consequence needs sharper explanation.',
      developing:
        'The responses place two summaries beside each other without consistently explaining what the comparison changes.',
      beginning: 'The responses make separate single-text claims or offer no defensible comparative interpretation.',
    };
  } else if (/\bcounter-reading\b/i.test(criterionText)) {
    bands = {
      exemplary: isProposal
        ? 'The proposal states the strongest credible counter-reading, identifies the paired evidence that could support it, and explains how the planned essay will test it.'
        : isFinal
          ? 'The paper tests the strongest credible counter-reading against the same paired evidence and explains why the revised comparative thesis remains more persuasive.'
          : 'Each response tests a credible counter-reading against the same paired passages and revises the comparative claim in light of that test.',
      proficient:
        'The work addresses a plausible alternative interpretation with relevant paired evidence, though the test or resulting revision needs more precision.',
      developing:
        'The work names an alternative but does not test it against the same evidence or show how it changes the comparative claim.',
      beginning: 'The work dismisses alternatives, substitutes a straw claim, or omits the required counter-reading.',
    };
  } else if (isProposal && /\bfocused comparative question\b/i.test(criterionText)) {
    bands = {
      exemplary:
        'The proposal asks a focused, analytically productive question and explains why the answer requires a comparison of the selected texts.',
      proficient:
        'The question supports a feasible two-text comparison, though its rationale or analytical stakes need sharpening.',
      developing:
        'The question names two texts but invites parallel summary or remains too broad for the proposed essay.',
      beginning: 'The proposal lacks a workable comparative question or does not make both selected texts necessary.',
    };
  } else if (isProposal && /\bworking thesis\b/i.test(criterionText)) {
    bands = {
      exemplary:
        'The working thesis states an arguable relationship and consequential difference between the selected texts, with language precise enough to guide passage selection.',
      proficient:
        'The thesis is comparative and arguable, though one relationship, difference, or implication needs clarification.',
      developing: 'The thesis is mostly topical, descriptive, or two parallel single-text claims.',
      beginning: 'The proposal has no arguable comparative thesis.',
    };
  } else if (isProposal && /\bpaired passage plan\b/i.test(criterionText)) {
    bands = {
      exemplary:
        'The proposal identifies locatable evidence from both selected texts, explains what each passage contributes, and presents a feasible plan for close comparative analysis.',
      proficient:
        'The proposal identifies usable evidence from both texts, with one locator or analytical role needing more detail.',
      developing:
        'The proposal gestures toward passages but leaves one text, locator, or comparative purpose underdeveloped.',
      beginning: 'The proposal provides no feasible paired evidence plan.',
    };
  } else if (isFinal && /\bsustained comparative thesis\b/i.test(criterionText)) {
    bands = {
      exemplary:
        'The paper sustains an arguable comparative thesis and synthesizes the assigned texts within paragraphs so every major section advances the same bounded argument.',
      proficient:
        'The paper sustains a comparative thesis and usually synthesizes texts, with one section slipping into parallel treatment.',
      developing: 'The paper has a comparative topic but organizes mainly as separate single-text summaries.',
      beginning: 'The paper lacks a sustained comparative thesis or does not analyze multiple assigned texts.',
    };
  } else if (isFinal && /\bclose analysis of locatable textual evidence\b/i.test(criterionText)) {
    bands = {
      exemplary:
        'Every work central to the thesis is supported by locatable textual evidence, close analysis of formal features, and an explicit explanation of how that evidence advances the comparison.',
      proficient:
        'The paper closely analyzes locatable evidence from the central works, with one evidence-to-comparison link needing more precision.',
      developing:
        'The paper uses some textual evidence but relies on plot summary, uneven close reading, or an unsupported central work.',
      beginning:
        'The paper makes broad comparative claims without locatable textual evidence from the works central to its thesis.',
    };
  } else {
    bands = {
      exemplary: isProposal
        ? 'The proposal names a credible counter-reading, bounds the thesis to what the planned evidence can establish, and identifies the next evidence or revision step.'
        : isFinal
          ? 'The paper uses only verifiable assigned-text evidence, states an explicit limit for every major interpretation, is coherently organized, and documents substantive revision.'
          : 'Each response states explicitly what its selected passages cannot establish and shows an evidence-informed revision to the comparative claim.',
      proficient:
        'The work keeps its claims within the evidence boundary and shows revision, with one limit, source cue, or change needing clearer documentation.',
      developing:
        'The work gestures toward limits or revision but leaves an overclaim, unsupported source detail, or invisible change.',
      beginning:
        'The work presents an unbounded interpretation, unverifiable evidence, or no meaningful evidence-informed revision.',
    };
  }

  return {
    ...bands,
    performanceBandEvidence: {
      priority: planEntry?.priority || 'comparative literary evidence and reasoning',
      evidenceSignal:
        planEntry?.evidenceSignal ||
        evidenceEntry?.evidenceNeeded ||
        `Look for inspectable evidence that directly satisfies "${criterionText}" in ${title}.`,
      scorerQuestion:
        evidenceEntry?.calibrationQuestion ||
        `Can two scorers locate the paired textual evidence and reach the same judgment for "${criterionText}"?`,
      commonPitfall: bands.beginning,
      revisionTarget:
        evidenceEntry?.feedbackMove ||
        `Revise ${title} by making the paired evidence, comparative reasoning, counter-reading, or claim boundary visible for this criterion.`,
    },
  };
}
