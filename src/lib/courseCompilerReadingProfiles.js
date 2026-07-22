// Literature-specific assignment language is compile-time data. Keeping it in
// this leaf preserves the compiler's control-flow budget and lets copy evolve
// without invalidating the core compiler chunk.

export function buildCloseReadingCheckProfile({
  assessment = {},
  sourceLabel = 'the assigned text',
  pick = (variants) => variants[0],
}) {
  const artifact = assessment.artifact || assessment.title;
  return {
    assignmentType: 'Close-reading check',
    expectedFormat: pick([
      `annotated passage from ${sourceLabel} followed by a concise analysis of one formal choice, its effect, and one interpretive limit`,
      `annotated passage from ${sourceLabel} plus a focused paragraph connecting exact language to meaning and a bounded conclusion`,
      `annotated passage from ${sourceLabel} with a short analysis that names a formal feature, explains its work, and tests an alternative`,
      `annotated passage from ${sourceLabel} and one evidence-led paragraph tracing form, interpretive consequence, and the claim's boundary`,
      `annotated passage from ${sourceLabel} paired with a close analysis of how one textual choice shapes meaning without proving too much`,
      `annotated passage from ${sourceLabel}, then a compact argument about one formal detail, a plausible second reading, and a qualified claim`,
    ]),
    evidenceRequirement: pick([
      `quote or cite one passage from ${sourceLabel} and identify the exact language or formal feature under analysis`,
      `make the selected section of ${sourceLabel} locatable and mark the words, image, or structure carrying the interpretation`,
      `use a precisely cited moment from ${sourceLabel}, with annotation showing which textual choice supports each inference`,
      `anchor the analysis in exact evidence from ${sourceLabel} rather than a plot event or general theme alone`,
      `identify a bounded passage in ${sourceLabel} and point to the formal detail on which the claim depends`,
      `provide inspectable language from ${sourceLabel} and explain how that feature, not summary, warrants the reading`,
    ]),
    qualityFocus: pick([
      'passage specificity, attention to form, interpretive precision, alternative reading, and evidence restraint',
      'textual accuracy, formal analysis, claim-to-evidence reasoning, credible counter-reading, and bounded scope',
      'annotation quality, close attention to language, interpretive stakes, fair alternative, and qualification',
      'source traceability, formal-feature analysis, inference clarity, competing explanation, and honest limits',
      'passage choice, analytical depth, defensible interpretation, treatment of ambiguity, and claim restraint',
      'exact evidence, explanation of form, interpretive coherence, alternative possibility, and precise conclusion',
    ]),
    reviewProtocol: pick([
      'verify the passage, trace the claim to its formal feature, test another reading, and narrow any conclusion the evidence cannot carry',
      'inspect the marked language, check each interpretive step, compare a plausible alternative, and qualify the final claim',
      'confirm the citation, ask how the same detail could work differently, and revise the inference that extends beyond the passage',
      'follow the reasoning from textual form to meaning, pressure-test it with another account, and mark the evidence boundary',
      'locate the source moment, assess whether the analysis explains rather than summarizes it, and tighten any overclaim',
      'review the annotation beside the paragraph, compare the leading and rival interpretations, and edit the least supported sentence',
    ]),
    taskOverview: pick([
      `Complete ${artifact} as a close reading of ${sourceLabel}: identify one formal feature, explain its effect, and state what the passage alone cannot establish.`,
      `Use ${artifact} to examine one bounded passage from ${sourceLabel}; trace how its language or form produces meaning, then qualify the conclusion.`,
      `Build ${artifact} around a precisely marked feature of ${sourceLabel}, explaining the interpretation it supports and testing a plausible alternative.`,
      `For ${artifact}, annotate a telling moment in ${sourceLabel}, turn the observation into an argument, and keep the claim within the passage's limits.`,
      `Make ${artifact} an evidence-led analysis of ${sourceLabel}: connect one formal choice to its consequence, consider ambiguity, and refine the reading.`,
      `In ${artifact}, read a short section of ${sourceLabel} closely, explain what one textual decision accomplishes, and identify what remains unresolved.`,
    ]),
    parameterLines: [
      pick([
        `Scope: analyze one bounded passage from ${sourceLabel}.`,
        `Focus: stay with one formally significant moment in ${sourceLabel}.`,
        `Range: choose a short section of ${sourceLabel} that can sustain close analysis.`,
        `Passage: limit the check to one inspectable unit of ${sourceLabel}.`,
        `Analytical center: isolate one textual choice in ${sourceLabel}.`,
        `Task boundary: examine one passage from ${sourceLabel}, not the work as a whole.`,
      ]),
      pick([
        'Structure: place the annotated passage before one focused analytical paragraph.',
        'Organization: show the marked text first, then move from feature to effect to qualified claim.',
        'Response shape: annotation followed by a short evidence-to-interpretation argument.',
        'Sequence: identify the formal detail, explain its work, test another reading, and set the limit.',
        'Required parts: marked evidence, interpretive claim, formal analysis, and one qualification.',
        'Layout: pair visible annotations with a compact paragraph that explains their significance.',
      ]),
      pick([
        `Evidence: quote or cite the exact language from ${sourceLabel} that supports the interpretation.`,
        `Textual anchor: make the relevant words or formal turn in ${sourceLabel} easy to inspect.`,
        `Source use: cite the chosen section of ${sourceLabel} and mark the feature being interpreted.`,
        `Inspection point: connect each inference to visible evidence in ${sourceLabel}.`,
        `Warrant: identify the phrase, image, syntax, or structure in ${sourceLabel} that carries the claim.`,
        `Citation: give enough location detail for another reader to find the passage in ${sourceLabel}.`,
      ]),
      pick([
        'Boundary: state one conclusion the selected passage cannot establish by itself.',
        'Limit: identify what remains uncertain after the close reading.',
        'Qualification: narrow the claim where the passage stops providing support.',
        'Restraint: distinguish the warranted interpretation from a broader possibility.',
        'Final check: name the question this evidence leaves open.',
        'Evidence boundary: explain what would require another passage or source to decide.',
      ]),
    ],
    instructionSteps: [
      pick([
        `Select a passage from ${sourceLabel} and mark the exact words, image, structural turn, or other formal feature you will analyze.`,
        `Choose a compact section of ${sourceLabel}; annotate the language or form that makes it interpretively significant.`,
        `Locate one moment in ${sourceLabel} where a formal choice changes how the passage can be understood.`,
        `Begin with a bounded excerpt from ${sourceLabel} and identify the precise textual feature that needs explanation.`,
        `Mark a phrase, image, syntactic pattern, or structural shift in ${sourceLabel} that can support more than summary.`,
        `Identify an inspectable detail in ${sourceLabel} and annotate what the text is doing before deciding what it means.`,
      ]),
      pick([
        'Write an interpretive claim about how that feature shapes meaning, building the reasoning from the marked language rather than plot summary.',
        'Explain the effect of the formal choice and show each step connecting textual evidence to the interpretation.',
        'Turn the annotation into a debatable claim, then analyze why the cited language warrants that inference.',
        'Develop an interpretation whose support is visible in the passage, explaining form and consequence together.',
        'Show how the selected feature works before stating what it suggests; keep summary subordinate to analysis.',
        'Use the textual detail to make a precise claim about meaning and expose the reasoning behind that move.',
      ]),
      pick([
        'Test a plausible alternative reading of the same feature and identify the detail that favors one account over the other.',
        'Ask how another careful reader could interpret the passage, then compare the evidence for both explanations.',
        'Develop a credible second reading and locate where its warrant diverges from the first interpretation.',
        'Pressure-test the claim with another possible account of the same language rather than a weak objection.',
        'Compare two defensible meanings for the feature and decide which better explains the whole selected passage.',
        'Consider how ambiguity changes the interpretation and name the textual signal that constrains the alternatives.',
      ]),
      pick([
        'End by narrowing any claim that reaches beyond what the selected passage can support.',
        'Close with a qualified conclusion and name the evidence another passage would need to supply.',
        'Revise the final claim so its scope matches the limits revealed by the alternative reading.',
        'Identify what remains undecided and remove any inference the passage cannot sustain alone.',
        'Finish by separating the interpretation you can defend from the broader question still open.',
        'State the strongest bounded conclusion available and the limit that prevents a larger claim.',
      ]),
    ],
  };
}
export function buildLiteratureLongFormProfile(assessmentTitle = '') {
  return /\bcomparative essay proposal\b/.test(assessmentTitle)
    ? {
        assignmentType: 'Comparative essay proposal',
        expectedFormat:
          'two-text proposal with a comparative question, working thesis, paired passage plan, rationale for the comparison, counter-reading, and next research step',
        evidenceRequirement:
          'two assigned course texts, one inspectable passage or feature from each, and a clear explanation of why the comparison is analytically productive',
        qualityFocus:
          'comparative logic, text pairing, thesis arguability, evidence feasibility, counter-reading, and project scope',
        reviewProtocol:
          'test whether both texts are necessary, whether the thesis makes a real comparison, whether the proposed evidence can support it, and whether the scope is feasible',
        taskOverview:
          'Develop the comparative essay proposal by naming two assigned texts, posing a focused comparative question, advancing a working thesis, pairing the evidence you will analyze, and identifying one counter-reading or scope risk.',
        parameterLines: [
          'Scope: compare two assigned course texts that illuminate the same focused problem.',
          'Format: submit a comparative question, working thesis, paired evidence plan, rationale, counter-reading, and next step.',
          'Evidence: identify one inspectable passage or formal feature from each selected text.',
          'Feasibility: explain why both texts are necessary and keep the proposed argument narrow enough to complete.',
        ],
        instructionSteps: [
          'Name the two assigned texts and formulate a question that requires comparison rather than two parallel summaries.',
          'Advance a working thesis that states both a meaningful relationship and a consequential difference.',
          'Pair one passage or formal feature from each text and explain what each piece of evidence contributes.',
          'Identify a plausible counter-reading or scope risk, then name the next evidence check needed before writing the paper.',
        ],
      }
    : /\bfinal paper\b/.test(assessmentTitle)
      ? {
          assignmentType: 'Final paper',
          expectedFormat:
            'sustained comparative literary argument with a clear thesis, organized textual analysis, counter-reading, source notes, and a revision rationale',
          evidenceRequirement:
            'precisely cited evidence from multiple assigned texts, with each passage analyzed rather than used as illustration alone',
          qualityFocus:
            'thesis strength, comparative synthesis, close analysis, counterargument, source integrity, organization, and revision',
          reviewProtocol:
            'trace every major claim to textual evidence, test the comparative thesis against a counter-reading, check paragraph-level synthesis, and revise the weakest inference',
          taskOverview:
            'Complete the final paper as a sustained comparative argument across multiple assigned texts: defend a focused thesis through close analysis, address a counter-reading, and document the revision that most strengthened the argument.',
          parameterLines: [
            'Scope: sustain one comparative argument across multiple assigned course texts.',
            'Format: organize the paper around a focused thesis, analytical sections, a counter-reading, and a revision rationale.',
            'Evidence: cite and analyze passages from every text central to the thesis.',
            'Synthesis: make each section develop the comparison rather than treating the texts separately.',
          ],
          instructionSteps: [
            'State a focused comparative thesis and map the evidence each section will use to advance it.',
            'Analyze each cited passage at the level of language or form, then explain its role in the comparison.',
            'Address one credible counter-reading and revise any inference the evidence cannot sustain.',
            'Document the revision that most strengthened the paper’s comparative argument.',
          ],
        }
      : null;
}

export function buildWeeklyReadingResponseProfile({
  assessment = {},
  sourceLabel = 'the assigned text',
  pick = (variants) => variants[0],
}) {
  const artifact = assessment.artifact || assessment.title;
  return {
    assignmentType: 'Weekly reading response',
    expectedFormat: pick([
      `focused response about ${sourceLabel}: arguable claim, passage analysis, competing interpretation, and revision note`,
      `focused response on ${sourceLabel} that moves from a textual detail to a claim, tests another reading, and records the revision`,
      `focused response using ${sourceLabel}: interpretive claim, close evidence analysis, counter-reading, and evidence-bounded revision`,
      `focused response centered on ${sourceLabel}, with one debatable reading, a passage-level warrant, an alternative, and a revised claim`,
      `focused response tracing how evidence from ${sourceLabel} supports a claim, survives a rival interpretation, and changes through revision`,
      `focused response that reads one detail in ${sourceLabel} closely, advances an interpretation, tests its limit, and refines the conclusion`,
    ]),
    evidenceRequirement: pick([
      `quote or cite an inspectable passage from ${sourceLabel} and explain the language that carries the interpretation`,
      `identify precise textual evidence in ${sourceLabel} so another reader can locate it and test the claim`,
      `use one clearly cited detail from ${sourceLabel}, then analyze rather than merely repeat or summarize it`,
      `anchor the response in exact words, an image, or a formal turn from ${sourceLabel} that the claim depends on`,
      `point to a verifiable moment in ${sourceLabel} and show how its form or language warrants the reading`,
      `cite a bounded section of ${sourceLabel} closely enough that a reader can inspect both the evidence and inference`,
    ]),
    qualityFocus: pick([
      'arguable interpretation, precise evidence, fair counter-reading, source accuracy, and meaningful revision',
      'claim clarity, passage-level analysis, treatment of an alternative, citation integrity, and revision judgment',
      'interpretive stakes, textual specificity, competing explanation, evidence restraint, and improved final claim',
      'debatable thesis, close attention to language, credible rival reading, accurate source use, and revision depth',
      'claim-to-evidence reasoning, passage precision, counterargument quality, source traceability, and reflective revision',
      'interpretive precision, close-reading depth, honest limits, exact source handling, and a visible change in the claim',
    ]),
    reviewProtocol: pick([
      'locate the cited passage, test the claim against a plausible alternative, and tighten the inference that outruns the evidence',
      'trace each interpretive move to the text, compare it with a rival reading, and revise the weakest claim-to-evidence link',
      'verify the source detail, ask what else it could mean, and narrow or strengthen the conclusion after that challenge',
      'check that analysis follows from the quoted language, weigh one competing explanation, and record the resulting revision',
      'inspect the passage behind the central claim, pressure-test it with an alternative, and edit the least defensible inference',
      'confirm that the evidence is locatable, assess a reasonable counter-reading, and reshape the claim to match what the text supports',
    ]),
    taskOverview: pick([
      `Write ${artifact} about ${sourceLabel}: advance one interpretation, analyze its decisive textual detail, test a counter-reading, and revise the claim to fit the evidence.`,
      `Use ${artifact} to interpret ${sourceLabel}. Start from a specific passage, defend a debatable claim, consider another reading, and show how that test changes the conclusion.`,
      `Build ${artifact} around one telling feature of ${sourceLabel}: explain the claim it supports, weigh a credible alternative, and refine the reading after the comparison.`,
      `For ${artifact}, turn a close observation from ${sourceLabel} into an arguable interpretation, challenge it with a rival account, and document the final adjustment.`,
      `In ${artifact}, make the evidence from ${sourceLabel} do the work: state a claim, analyze one textual choice, test its limits, and sharpen the interpretation.`,
      `Compose ${artifact} as a short interpretive argument about ${sourceLabel}; connect one passage to the claim, examine a competing explanation, and revise with precision.`,
    ]),
    parameterLines: [
      pick([
        `Scope: develop one arguable interpretation of ${sourceLabel}.`,
        `Focus: pose a debatable claim about one bounded moment in ${sourceLabel}.`,
        `Purpose: explain a contestable reading of ${sourceLabel}, not a plot summary.`,
        `Claim: make one interpretation of ${sourceLabel} that another careful reader could challenge.`,
        `Range: stay with one focused interpretive problem in ${sourceLabel}.`,
        `Central move: convert a close observation from ${sourceLabel} into a defensible claim.`,
      ]),
      pick([
        `Structure: pair the claim with passage analysis, a counter-reading, and a final revision note.`,
        `Organization: move from textual evidence to interpretation, alternative reading, then revised conclusion.`,
        `Sequence: observation, arguable claim, close analysis, competing account, and evidence-bounded revision.`,
        `Response shape: claim and warrant first, rival explanation next, final adjustment last.`,
        `Required parts: interpretive claim, evidence analysis, credible alternative, and a visible revision.`,
        `Arc: read one detail closely, defend its meaning, test another possibility, and refine the result.`,
      ]),
      pick([
        `Evidence: quote or cite a decisive passage or formal detail from ${sourceLabel}.`,
        `Textual anchor: identify the exact words, image, or structural turn in ${sourceLabel} that matters.`,
        `Source use: give a locatable detail from ${sourceLabel} and analyze its role in the argument.`,
        `Passage requirement: cite the moment in ${sourceLabel} on which the interpretation depends.`,
        `Warrant: connect a precise feature of ${sourceLabel} to each major interpretive move.`,
        `Inspection point: make the relevant evidence in ${sourceLabel} easy for another reader to find.`,
      ]),
      pick([
        'Boundary: separate what the passage establishes from what remains uncertain.',
        'Limit: identify where the evidence stops and the interpretation becomes provisional.',
        'Restraint: narrow any conclusion that reaches beyond the cited material.',
        'Qualification: state what the selected evidence cannot settle on its own.',
        'Evidence boundary: distinguish the warranted claim from the open question.',
        'Final check: keep the revised conclusion no broader than the textual support.',
      ]),
    ],
    instructionSteps: [
      pick([
        `Choose a passage or textual detail from ${sourceLabel} that raises a genuine interpretive question.`,
        `Mark one moment in ${sourceLabel} whose language or form makes more than one reading possible.`,
        `Begin with an exact feature of ${sourceLabel} that creates a problem worth interpreting.`,
        `Select a bounded section of ${sourceLabel} where a formal choice changes what the text can mean.`,
        `Locate the image, phrase, scene, or structural turn in ${sourceLabel} that will carry the argument.`,
        `Identify one inspectable detail in ${sourceLabel} that resists a purely descriptive answer.`,
      ]),
      pick([
        'State an arguable claim and explain how the selected evidence supports it instead of retelling the text.',
        'Turn the observation into a debatable interpretation, then trace the reasoning from language to claim.',
        'Explain what the detail suggests and why that inference is stronger than a summary of events.',
        'Advance a claim whose warrant is visible in the passage, analyzing the relevant words or form.',
        'Connect the textual feature to an interpretation and make every step in that connection explicit.',
        'Build the central inference from the cited detail, showing how form or language produces meaning.',
      ]),
      pick([
        'Present a plausible counter-reading and identify the evidence that makes it stronger or weaker than the first claim.',
        'Test a competing interpretation against the same passage and compare the warrants for both readings.',
        'Ask how another careful reader could explain the detail, then decide which account fits more of the evidence.',
        'Develop one credible alternative and name the textual feature that separates it from the leading claim.',
        'Pressure-test the interpretation with a rival account rather than a deliberately weak objection.',
        'Compare the claim with another defensible reading and identify the point where their evidence diverges.',
      ]),
      pick([
        'Revise the claim so its scope matches the evidence, naming the change in the closing note.',
        'Use the comparison to sharpen or narrow the conclusion, then explain the revision in one final sentence.',
        'Rewrite the weakest inference after the counter-reading and record what changed and why.',
        'End with an adjusted claim that acknowledges the evidence boundary revealed by the alternative.',
        'Make one substantive revision to the interpretation and identify the passage detail that prompted it.',
        'Close by refining the original claim so it says no more—and no less—than the evidence can sustain.',
      ]),
    ],
  };
}
