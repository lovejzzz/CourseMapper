// Subject-matter slide depth is isolated from the core compiler so it is
// independently cacheable and cannot silently expand the monolithic path.
import { SOURCE_ARITHMETIC_PROTOCOL } from './sourceArithmeticStudyPractice.js';

export function createCompilerSlideDepth({
  asArray,
  authenticDataStudyWorkedExample,
  cleanText,
  conciseClause,
  displayedEvidenceNotePrefix,
  enrichedEvidenceTableDescriptor,
  ensureSentenceCompiler,
  identityTokens,
  kernelMisconceptionDistractor,
  kernelSlideEvidenceDiscussionCopy,
  lessonPrimaryTeachingKeyTerms,
  lessonTeachingKeyTerms,
  lessonVariant,
  normalizedFactOwnershipKey,
  operationQualifiedWorkedExampleForLesson,
  preferredKernelFacts,
  preferredSlideTerm,
  primarySlideConcept,
  punctuateDisplayBullet,
  readableCorrection,
  readableMisconception,
  sentenceCase,
  slideArtifact,
  slideConceptCandidates,
  slideSourceCue,
  stripLessonPrefix,
  stripTerminalPunctuation,
  unique,
}) {
  function applyKernelSubjectMatterSlides(slides, lesson) {
    const targets = slides.filter(
      (slide) => ['keyTerm', 'content', 'example'].includes(slide.type) && !slide.enrichmentSource,
    );
    if (targets.length === 0) return;
    const terms = lessonPrimaryTeachingKeyTerms(lesson).filter(
      (term) => cleanText(term?.term) && cleanText(term?.definition),
    );
    const facts = unique(preferredKernelFacts(lesson?.enrichment?.kernel).map(cleanText), 6);
    const primaryTerm = preferredSlideTerm(terms, lesson?.lessonNumber);
    const concept = cleanText(primaryTerm?.term) || primarySlideConcept(lesson);
    const definition = cleanText(primaryTerm?.definition);
    const exampleCandidate =
      cleanText(primaryTerm?.example) ||
      cleanText(lesson?.enrichment?.kernel?.scenario?.case) ||
      cleanText(lesson?.enrichment?.kernel?.scenario?.description);
    const sourceClaimKeys = new Set([definition, ...facts].map(normalizedFactOwnershipKey).filter(Boolean));
    const example = sourceClaimKeys.has(normalizedFactOwnershipKey(exampleCandidate)) ? '' : exampleCandidate;
    const misconception = primaryTerm ? kernelMisconceptionDistractor(lesson, concept) : '';
    const correction = cleanText(primaryTerm?.correction || primaryTerm?.corrective);
    if (!definition && facts.length === 0 && !example) return;

    const authored = [
      {
        title: `${stripTerminalPunctuation(concept)}: core model`,
        bullets: unique([definition, ...facts.slice(0, 3)].filter(Boolean), 4),
      },
      {
        title: `What the evidence shows about ${stripTerminalPunctuation(concept)}`,
        bullets: unique([...facts, definition].filter(Boolean), 4),
      },
      example
        ? {
            title: `Test ${stripTerminalPunctuation(concept)} with a concrete case`,
            bullets: unique(
              [
                `Case: ${stripTerminalPunctuation(example)}`,
                facts[1] ? `Evidence: ${stripTerminalPunctuation(facts[1])}` : '',
                misconception ? `Tempting claim: ${stripTerminalPunctuation(misconception)}` : '',
                correction ? `Correction: ${stripTerminalPunctuation(correction)}` : '',
              ].filter(Boolean),
              4,
            ),
          }
        : {
            title: `Compare the source evidence for ${stripTerminalPunctuation(concept)}`,
            bullets: unique(
              [
                facts[0] ? `Source claim 1: ${stripTerminalPunctuation(facts[0])}` : '',
                facts[1] ? `Source claim 2: ${stripTerminalPunctuation(facts[1])}` : '',
                `Decision check: use both claims to bound what ${stripTerminalPunctuation(concept)} supports, then name one limit.`,
              ].filter(Boolean),
              4,
            ),
          },
    ].filter((entry) => entry.bullets.length > 0);

    targets.slice(0, authored.length).forEach((slide, index) => {
      if (slide.type === 'content' && authored[index].bullets.length < 2) return;
      slide.title = authored[index].title;
      slide.bullets = authored[index].bullets;
      // Keep one rotating evidence anchor instead of duplicating every visible bullet.
      const noteEvidence =
        facts[index % facts.length] || authored[index].bullets[index % authored[index].bullets.length];
      slide.notes = `${displayedEvidenceNotePrefix(authored[index].bullets, noteEvidence)} ${kernelSlideEvidenceDiscussionCopy(
        {
          lessonNumber: lesson?.lessonNumber,
          slideIndex: index,
          concept,
        },
      )}`;
      slide.enrichmentSource = 'kernel-subject-matter';
    });
  }

  /**
   * v0.9.1 Phase 3: deck length follows content instead of a fixed 12-slide
   * template. Lessons with extra enriched teaching content gain up to two
   * content slides; light lessons (a single concept, no enrichment) drop the
   * second generic content slide. Range stays a teachable 11-14.
   */
  function adjustDeckLengthForContent(slides, lesson) {
    const enriched = Array.isArray(lesson?.enrichment?.slideContent) ? lesson.enrichment.slideContent : [];
    const teachingSlots = slides.filter((slide) => ['keyTerm', 'content', 'example'].includes(slide.type)).length;
    // Extra enriched assertions beyond the standard teaching slots become
    // additional content slides placed before the activity slide.
    const extras = enriched.slice(teachingSlots, teachingSlots + 2);
    if (extras.length > 0) {
      const activityIndex = slides.findIndex((slide) => slide.type === 'activity');
      const insertAt = activityIndex > 0 ? activityIndex : slides.length - 2;
      extras.forEach((content, offset) => {
        if (!content?.title || !Array.isArray(content.bullets) || content.bullets.length === 0) return;
        slides.splice(insertAt + offset, 0, {
          type: 'content',
          title: content.title,
          bullets: content.bullets.slice(0, 4),
          ...(content.notes ? { notes: content.notes } : {}),
          minutes: 5,
          bloom: 'Understand',
          objective: slides[insertAt]?.objective || null,
          activity: null,
          enrichmentSource: 'lesson-content-enrichment',
        });
      });
      return;
    }
    // Light lesson: one concept, no enrichment — drop the second generic
    // content slide instead of padding the deck.
    if ((lesson?.keyConcepts || []).length < 2) {
      const contentIndexes = slides
        .map((slide, index) => (slide.type === 'content' && !slide.enrichmentSource ? index : -1))
        .filter((index) => index >= 0);
      if (contentIndexes.length > 1) slides.splice(contentIndexes[1], 1);
    }
  }

  /**
   * v0.14.1 (5.2c): when the lesson cannot field a real evidence table (< 2
   * claim/evidence rows from the same source atoms), the table slide's content
   * is replaced by the lesson's kernel worked example when one exists — the
   * v0.13.3 workedExamples finally get slide presence — so deck content varies
   * with lesson data instead of every deck shipping the same fabricated table.
   * Without a worked example the slide keeps its key-concept detail as plain
   * text (the exporter no longer fabricates rows from bullets).
   */
  function applyEvidenceSlideIntegrity(slides, lesson) {
    const workedExample = operationQualifiedWorkedExampleForLesson(lesson) || authenticDataStudyWorkedExample(lesson);
    if (enrichedEvidenceTableDescriptor(lesson).rows.length >= 2 && !workedExample) return;
    const problem = cleanText(workedExample?.problem);
    const steps = (Array.isArray(workedExample?.steps) ? workedExample.steps : []).map(cleanText).filter(Boolean);
    if (!problem || steps.length < 2) return;
    const target = slides.find(
      (slide) => slide.type === 'content' && !/limit|honest|gap|worked example/i.test(slide.title || ''),
    );
    if (!target) return;
    const result = cleanText(workedExample.result);
    if (workedExample.protocol === SOURCE_ARITHMETIC_PROTOCOL) {
      const { numerator, denominator, decimal, percent } = workedExample.verification;
      target.title = `From ${numerator}/${denominator} to a percentage`;
      target.bullets = [
        `Identify the whole: denominator ${denominator}; counted part: numerator ${numerator}.`,
        `Divide: ${numerator} ÷ ${denominator} = ${decimal}.`,
        `Convert: ${decimal} × 100 = ${percent}%.`,
        `Reverse check: ${decimal} × ${denominator} = ${numerator}.`,
        'Interpret only the observations described in the source. Correct arithmetic alone does not justify a population claim.',
      ];
      target.notes = `${problem} ${steps.join(' ')} ${result} ${workedExample.boundary} Ask learners to cover the steps and recover the numerator from the percentage and denominator.`;
      target.enrichmentSource = 'deterministic-worked-example';
      target.workedExample = workedExample;
      return;
    }
    const isAuthenticEvidence = workedExample?.protocol === 'coursemapper-authentic-evidence-study-practice-v1';
    if (isAuthenticEvidence) {
      const task = lesson?.authenticDataTaskPlan || {};
      const recordBullets = asArray(task.examples)
        .slice(0, 3)
        .map((example, index) => {
          const label = conciseClause(example.displayLabel || example.id, `record ${index + 1}`, 48);
          // Authentic evidence is byte-bound teaching data. Do not use
          // conciseClause here: it strips terminal punctuation and can turn a
          // source form such as "Cö-ba!" into a different learner-visible datum.
          const form = cleanText(example.form, 'displayed form');
          const gloss = conciseClause(example.gloss, 'recorded gloss', 64);
          const translation = conciseClause(example.translation, 'recorded translation', 70);
          const locator = conciseClause(example.sourceLocator, 'packet locator', 52);
          const articulatory = example?.articulatoryProfile
            ? ` · articulatory evidence: ${[
                example.articulatoryProfile.voicing,
                example.articulatoryProfile.constrictionPlace,
                example.articulatoryProfile.manner,
                example.articulatoryProfile.airflow,
              ]
                .map(cleanText)
                .filter(Boolean)
                .join('; ')}`
            : '';
          return `Record ${index + 1} — ${label}: “${form}” · gloss: ${gloss}${articulatory} · source: ${locator} · translation: ${translation}.`;
        });
      const operation = cleanText(task.operation || workedExample.verification?.operation || 'evidence analysis');
      const recordAnalyses = unique(
        asArray(task.examples)
          .map((example, index) => {
            const focus = cleanText(example.analysisFocus);
            return focus ? `Record ${index + 1}: ${focus}` : '';
          })
          .filter(Boolean),
        3,
      );
      const proceduralOperation = ['dataset-audit', 'proposal-defense'].includes(operation);
      const resultSource = proceduralOperation ? result.split(/(?<=[.!?])\s+/)[0] : recordAnalyses.join(' ');
      const resultSummary = conciseClause(
        resultSource || result,
        'Use the displayed records to reach a bounded result.',
        recordAnalyses.length > 1 ? 270 : 190,
      );
      const boundarySummary = conciseClause(
        workedExample.boundary,
        'Keep the conclusion within the displayed records and cited locations.',
        170,
      );
      const operationBullet = lessonVariant(lesson, [
        `Operation — ${operation}: inspect the form and gloss first; verify the translation and source locator before interpreting.`,
        `Operation — ${operation}: align each displayed field, then connect the observation to an evidence-bounded inference.`,
        `Operation — ${operation}: trace the record from visible form through gloss and translation before stating the claim.`,
        `Operation — ${operation}: preserve provenance while separating what the packet shows from what the analysis adds.`,
        `Operation — ${operation}: mark the decisive data detail, confirm its locator, and only then test the conclusion.`,
        `Operation — ${operation}: compare the recorded fields in sequence and stop the inference at the packet boundary.`,
      ]);
      target.title = `Worked example: ${stripLessonPrefix(lesson.title)}`;
      target.bullets = [
        ...recordBullets,
        operationBullet,
        `Result — ${stripTerminalPunctuation(resultSummary)}.`,
        `Boundary — ${stripTerminalPunctuation(boundarySummary)}.`,
      ];
      // The projection stays fully auditable in notes and structured metadata,
      // while the visible slide becomes a presentation instead of a document
      // page squeezed into two columns.
      target.notes = `Model the complete bound task: ${stripTerminalPunctuation(problem)}. Reveal these steps in sequence: ${steps.join(' → ')}.${result ? ` Result: ${stripTerminalPunctuation(result)}.` : ''} Then assign the verified transfer: ${stripTerminalPunctuation(workedExample.transferTask)}.`;
      target.enrichmentSource = 'authentic-evidence-worked-example';
      target.workedExample = workedExample;
      return;
    }
    target.title = `Worked example: ${conciseClause(problem, 'the lesson worked example', 64)}`;
    target.bullets = [
      ...(cleanText(workedExample.studentTask) ? [`Task: ${cleanText(workedExample.studentTask)}`] : []),
      `Problem: ${problem}`,
      ...steps
        .slice(0, cleanText(workedExample.studentTask) ? 2 : 3)
        .map((step, index) => `Step ${index + 1}: ${stripTerminalPunctuation(step)}.`),
      ...(result ? [`Result: ${result}`] : []),
    ];
    target.notes = `Work the example on the board step by step: ${stripTerminalPunctuation(problem)}. Solution path: ${steps.join(' → ')}.${result ? ` Result: ${stripTerminalPunctuation(result)}.` : ''} After students annotate the trace, have them complete this aligned variation: ${stripTerminalPunctuation(workedExample.transferTask || `change one input and recheck the result before continuing ${slideArtifact(lesson)}`)}.`;
    target.enrichmentSource = lesson?.enrichment?.workedExample
      ? 'kernel-worked-example'
      : 'deterministic-worked-example';
    target.workedExample = workedExample;
  }

  // ── v0.14.3 D1: two deterministic content slides from data the lesson
  // already paid for ─────────────────────────────────────────────────────────
  // Deck length becomes data-driven 12-14: a lesson with real misconception
  // pairs gains a "Common pitfalls" slide, and a lesson whose kernel bank had
  // an unused MC item gains a second application slide (the item recast as a
  // worked walkthrough). Zero AI calls — pure recomposition of authored atoms.

  // A teachable deck stays 12-14 slides; the depth slides never push past it.
  const MAX_DEPTH_DECK_SLIDES = 14;

  // Lowercase a clause lead so it reads mid-sentence; acronym leads ("DNA",
  // "GDP growth") stay intact.
  function lowercaseClauseLead(value) {
    const text = cleanText(value);
    if (!text) return '';
    const firstWord = text.split(/\s+/)[0];
    if (firstWord.length > 1 && firstWord === firstWord.toUpperCase()) return text;
    return text.charAt(0).toLowerCase() + text.slice(1);
  }

  // The realness signal (D1a): enrichment keyTerms carrying a misconception are
  // model- or genome-authored subject matter — the same signal the study guide
  // (enrichedMisconceptions) and the lesson-plan warm-up poll already trust.
  // Compiler-template misconceptions live on lesson.misconceptionMap and never
  // reach this list, so a template-only lesson produces no pitfalls slide.
  function lessonMisconceptionPairs(lesson) {
    const seen = new Set();
    const pairs = [];
    for (const term of lessonTeachingKeyTerms(lesson)) {
      // These pairs are synthesized from a quiz distractor and its answer-key
      // explanation. They are useful fallback metadata, but they are not an
      // authored misconception/correction pair and can produce circular or
      // chopped classroom prose on a pitfalls slide.
      if (/\bverified[- ]quiz[- ]projection\b/i.test(cleanText(term?.source))) continue;
      const misconception = cleanText(term?.misconception);
      if (!misconception) continue;
      const key = misconception.toLowerCase();
      if (seen.has(key)) continue;
      // The corrective is the kernel's own counter-statement when one exists;
      // the fallback phrases the definition as the counter (study-guide rule).
      const corrective =
        cleanText(term?.correction).replace(/^in fact[,:]?\s*/i, '') ||
        stripTerminalPunctuation(cleanText(term?.definition));
      if (!corrective) continue;
      seen.add(key);
      pairs.push({ misconception, corrective });
    }
    return pairs;
  }

  function applyCommonPitfallsSlide(slides, lesson, { concept, objective }) {
    if (slides.length >= MAX_DEPTH_DECK_SLIDES) return;
    const pairs = lessonMisconceptionPairs(lesson).slice(0, 3);
    if (pairs.length < 2) return;
    const bullets = pairs.map((pair, index) => {
      // conciseClause splits list-ish text on semicolons (splitList) — soften
      // them to commas first so a two-clause corrective keeps both clauses.
      const tempting = conciseClause(
        stripTerminalPunctuation(pair.misconception).replace(/;\s+/g, ', '),
        pair.misconception,
        160,
      );
      const corrective = conciseClause(
        stripTerminalPunctuation(pair.corrective).replace(/;\s+/g, ', '),
        pair.corrective,
        180,
      );
      return pitfallBullet({
        lesson,
        index,
        tempting,
        corrective,
        fallback: pair.corrective,
      });
    });
    // Placement: directly after the key-concept/evidence/example cluster, so
    // the repair lands while the concept is still on screen.
    const exampleIndex = slides.findIndex((slide) => slide.type === 'example');
    const activityIndex = slides.findIndex((slide) => slide.type === 'activity');
    const insertAt = exampleIndex >= 0 ? exampleIndex + 1 : activityIndex >= 0 ? activityIndex : slides.length - 2;
    const closePrompt = lessonVariant(lesson, [
      'Close by asking students which pitfall they are most likely to make and what check would catch it.',
      'End with each student naming one pitfall they will watch for and the evidence cue that would reveal it.',
      'Have students choose the tempting claim that fits their current work and write the correction check beside it.',
      'Finish by asking teams to turn one pitfall into a self-check they can apply before submitting.',
    ]);
    slides.splice(insertAt, 0, {
      type: 'content',
      title: `Common pitfalls in ${stripTerminalPunctuation(concept)}`,
      bullets,
      notes: `${lessonVariant(lesson, [
        'Start with a vote on each tempting claim, then reveal and discuss the correction.',
        'Have students mark each misconception as plausible or not before showing the correction.',
        'Use each tempting claim as a prediction check; students commit first, then compare with the corrective.',
        'Ask teams to accept, revise, or reject each claim before the correction appears.',
      ])} ${pairs
        .map(
          (pair) =>
            `${ensureSentenceCompiler(readableMisconception(pair.misconception))} Correction: ${ensureSentenceCompiler(readableCorrection(pair.corrective))}`,
        )
        .join(' ')} ${closePrompt}`,
      minutes: 4,
      bloom: 'Understand',
      objective: objective || null,
      activity: null,
      enrichmentSource: 'kernel-misconception-pitfalls',
    });
  }

  function pitfallBullet({ lesson, index = 0, tempting, corrective, fallback }) {
    const lessonNumber = Math.max(1, Number(lesson?.lessonNumber || 1));
    const temptingLead = lowercaseClauseLead(tempting).replace(
      /^students?\s+(?:(?:often|sometimes|may)\s+)?(?:think|believe|assume|mistake)\s+/i,
      '',
    );
    const correctiveLead = lowercaseClauseLead(corrective);
    const variants = [
      `Tempting claim: ${sentenceCase(temptingLead)}. Correction: ${sentenceCase(correctiveLead)}`,
      `Common misconception: ${sentenceCase(temptingLead)}. Better reasoning: ${sentenceCase(correctiveLead)}`,
      `Students may assume ${temptingLead}. Corrective check: ${sentenceCase(correctiveLead)}`,
      `Weak claim: ${sentenceCase(temptingLead)}. Stronger reasoning: ${sentenceCase(correctiveLead)}`,
      `Watch for this idea: ${sentenceCase(temptingLead)}. Evidence should show ${correctiveLead}`,
    ];
    return punctuateDisplayBullet(variants[(lessonNumber - 1 + index) % variants.length], fallback);
  }

  function applyMcWalkthroughSlide(slides, lesson, { concept, objective }) {
    if (slides.length >= MAX_DEPTH_DECK_SLIDES) return;
    const item = lesson?.enrichment?.mcWalkthrough;
    const stem = cleanText(item?.question);
    const options = (item?.options || []).map(cleanText).filter(Boolean);
    const resolution = options[Number(item?.answerIndex) || 0] || options[0] || '';
    const why = cleanText(item?.explanation);
    if (!stem || !resolution || !why) return;
    // All three lines are authored text recomposed: the unused bank item's stem
    // is the scenario, its key is the resolution, its answer-key explanation is
    // the why. Placement: after the activity, as the second application pass.
    const activityIndex = slides.findIndex((slide) => slide.type === 'activity');
    const discussionIndex = slides.findIndex((slide) => slide.type === 'discussion');
    const insertAt =
      activityIndex >= 0 ? activityIndex + 1 : discussionIndex >= 0 ? discussionIndex : slides.length - 2;
    // Soften semicolons before conciseClause (splitList would drop the second
    // clause), and keep the title heading-styled (no terminal period).
    const softStem = stem.replace(/;\s+/g, ', ');
    slides.splice(insertAt, 0, {
      type: 'content',
      title: `Worked example: ${stripTerminalPunctuation(conciseClause(softStem, `apply ${concept}`, 64, { ellipsis: true })) || `apply ${concept}`}`,
      bullets: [
        punctuateDisplayBullet(`Scenario: ${conciseClause(softStem, stem, 100, { ellipsis: true })}`, stem),
        punctuateDisplayBullet(
          `Resolution: ${conciseClause(resolution.replace(/;\s+/g, ', '), resolution, 98, { ellipsis: true })}`,
          resolution,
        ),
        punctuateDisplayBullet(
          `Why it holds: ${conciseClause(why.replace(/;\s+/g, ', '), why, 96, { ellipsis: true })}`,
          why,
        ),
      ],
      notes: `Walk the scenario before revealing the resolution: ${ensureSentenceCompiler(stem)} Have students commit to an answer, then show the resolution — ${ensureSentenceCompiler(resolution)} The reasoning to model aloud: ${ensureSentenceCompiler(why)}`,
      minutes: 5,
      bloom: 'Apply',
      objective: objective || null,
      activity: null,
      enrichmentSource: 'kernel-mc-walkthrough',
    });
  }

  function deckClaimsKernelDepth(slides, lesson) {
    if ((slides || []).some((slide) => /\bcommon pitfalls\b|\bworked example\b/i.test(cleanText(slide?.title)))) {
      return true;
    }
    const enrichment = lesson?.enrichment || {};
    return (
      asArray(enrichment.slideContent).length > 0 ||
      asArray(enrichment.keyTerms).some((term) => cleanText(term?.misconception) && cleanText(term?.correction)) ||
      Boolean(enrichment.mcWalkthrough || enrichment.workedExample)
    );
  }

  function contentFloorTokenSet(lesson) {
    // v0.16 C3 companion: keyConcepts now caps at the 4-concept teaching core,
    // so the floor's vocabulary also draws on the kernel's OWN terms — the
    // authored key terms are exactly the content the floor exists to measure.
    const tokens = new Set(
      [
        stripLessonPrefix(lesson?.title || ''),
        ...(lesson?.keyConcepts || []),
        ...lessonTeachingKeyTerms(lesson)
          .map((term) => cleanText(term?.term))
          .filter(Boolean),
      ].flatMap(identityTokens),
    );
    if (tokens.size >= 2) return tokens;
    for (const candidate of slideConceptCandidates(lesson).slice(0, 3).flatMap(identityTokens)) tokens.add(candidate);
    return tokens;
  }

  function slideContentFloorTokenCount(slide, tokens) {
    if (!slide || !tokens?.size) return 0;
    const bodyTokens = new Set(identityTokens([slide.title, ...(slide.bullets || [])].join(' ')));
    let hits = 0;
    for (const token of tokens) {
      if (bodyTokens.has(token)) hits += 1;
      if (hits >= 2) return hits;
    }
    return hits;
  }

  function countLessonContentBearingSlides(slides, lesson) {
    const tokens = contentFloorTokenSet(lesson);
    if (tokens.size < 2) return 0;
    return (slides || []).filter(
      (slide) =>
        ['keyTerm', 'content', 'example'].includes(slide?.type) && slideContentFloorTokenCount(slide, tokens) >= 2,
    ).length;
  }

  const MIN_CONTENT_BEARING_SLIDES = 5;

  function contentFloorTeachingNote(lesson, { first, second, third }) {
    return lessonVariant(lesson, [
      `Have students ${first}. They then ${second}. Close by having them ${third}. Before moving on, invite one student to challenge the evidence and another to name a limitation.`,
      `Begin with a short check in which students ${first}. After that, they ${second}. Use the final minute to ${third}.`,
      `Make the work visible: students ${first}. Ask them to ${second}, then have each learner ${third}. End by asking a partner to point out one unsupported leap and suggest a stronger trace.`,
      `Use an individual-to-pair cycle. First, students ${first}; next, they ${second}; finally, they ${third}. Compare the paired explanations and revise one sentence that overstates the evidence.`,
      `Frame this as an evidence checkpoint. Students ${first}, test the result as they ${second}, and then ${third}.`,
      `Pause the explanation for a concrete trace. Learners ${first}; a partner checks how they ${second}; students then ${third}.`,
    ]);
  }

  function buildContentFloorSlides(lesson, { concept, secondary, objective, artifact }) {
    const candidates = slideConceptCandidates(lesson);
    const tertiary =
      candidates.find(
        (candidate) =>
          cleanText(candidate).toLowerCase() !== cleanText(concept).toLowerCase() &&
          cleanText(candidate).toLowerCase() !== cleanText(secondary).toLowerCase(),
      ) ||
      stripLessonPrefix(lesson?.title) ||
      secondary;
    const assessmentCue = cleanText(lesson?.assessment?.title || lesson?.assessmentFocus || lesson?.weeklyAssessment);
    const sourceCue = slideSourceCue(lesson);
    const lessonFocus = stripLessonPrefix(lesson?.title) || concept;
    return [
      {
        type: 'content',
        title: `Concept trace: ${stripTerminalPunctuation(concept)} and ${stripTerminalPunctuation(secondary)}`,
        bullets: [
          `${concept} names the step students inspect before they use ${artifact}.`,
          `${secondary} shows the condition, input, source detail, or design choice that changes the result.`,
          `Students explain how ${concept} and ${secondary} change the next ${artifact} decision.`,
        ],
        notes: contentFloorTeachingNote(lesson, {
          first: `mark where ${concept} appears`,
          second: `explain how ${secondary} changes the reasoning`,
          third: `state the consequence for ${artifact}`,
        }),
        minutes: 5,
        bloom: 'Analyze',
        objective,
        activity: null,
        enrichmentSource: 'deterministic-content-floor',
      },
      {
        type: 'content',
        title: `Boundary check: ${stripTerminalPunctuation(concept)} evidence`,
        bullets: [
          `Name what the ${concept} evidence proves for ${artifact}.`,
          `Name what ${secondary} does not prove yet, even if the answer looks plausible.`,
          `Revise the claim so the ${concept} boundary is visible before submission.`,
        ],
        notes: contentFloorTeachingNote(lesson, {
          first: `write the strongest defensible claim about ${concept}`,
          second: `add the limit created by ${secondary}`,
          third: `revise one sentence in ${artifact} so the boundary is explicit`,
        }),
        minutes: 5,
        bloom: 'Evaluate',
        objective,
        activity: null,
        enrichmentSource: 'deterministic-content-floor',
      },
      {
        type: 'content',
        title: `Transfer check: ${stripTerminalPunctuation(tertiary)} in ${stripTerminalPunctuation(artifact)}`,
        bullets: [
          `Connect ${tertiary} back to ${concept} before starting the next example.`,
          `Compare where ${secondary} changes the approach and where the same rule still holds.`,
          assessmentCue
            ? `Use the ${assessmentCue} requirement to decide which ${tertiary} detail matters most.`
            : `Use the next ${artifact} requirement to decide which ${tertiary} detail matters most.`,
        ],
        notes: contentFloorTeachingNote(lesson, {
          first: `identify one usable part of ${tertiary}`,
          second: `connect it to ${concept}`,
          third: `explain whether ${secondary} changes the action they would take in ${artifact}`,
        }),
        minutes: 5,
        bloom: 'Apply',
        objective,
        activity: null,
        enrichmentSource: 'deterministic-content-floor',
      },
      {
        type: 'content',
        title: `Evidence source check: ${stripTerminalPunctuation(concept)}`,
        bullets: [
          `Use ${sourceCue} to locate one concrete ${concept} detail.`,
          `Separate the ${secondary} evidence from guesses or unstated assumptions.`,
          `Record the detail that should appear in ${artifact}.`,
        ],
        notes: contentFloorTeachingNote(lesson, {
          first: `point to the exact ${concept} detail in ${sourceCue}`,
          second: `explain how it relates to ${secondary}`,
          third: `record the sentence or data point they will carry into ${artifact}`,
        }),
        minutes: 5,
        bloom: 'Analyze',
        objective,
        activity: null,
        enrichmentSource: 'deterministic-content-floor',
      },
      {
        type: 'content',
        title: `Practice proof: ${stripTerminalPunctuation(concept)} decision`,
        bullets: [
          `Use ${concept} and ${secondary} to write one concrete ${artifact} decision.`,
          `Point to the ${lessonFocus} detail that makes the decision defensible.`,
          `Name how ${tertiary} would change the next ${artifact} attempt.`,
        ],
        notes: contentFloorTeachingNote(lesson, {
          first: `make one ${concept} decision`,
          second: `cite the ${lessonFocus} detail that supports it`,
          third: `explain how ${secondary} or ${tertiary} would change their next ${artifact} revision`,
        }),
        minutes: 5,
        bloom: 'Apply',
        objective,
        activity: null,
        enrichmentSource: 'deterministic-content-floor',
      },
    ];
  }

  function ensureMinimumContentSlideFloor(slides, lesson, { concept, secondary, objective, artifact }) {
    if (!deckClaimsKernelDepth(slides, lesson)) return;
    let contentCount = countLessonContentBearingSlides(slides, lesson);
    // Three slides authored directly from an admitted kernel already provide a
    // definition/fact model, an evidence explanation, and a concrete test case.
    // Padding that sequence to five with generic "concept trace" frames made
    // strong astronomy decks worse after the factual repair. Keep the five-slide
    // floor for sparse/template lessons; treat a complete kernel trio as the
    // stronger, content-bearing floor.
    const kernelSubjectMatterCount = slides.filter((slide) =>
      ['kernel-subject-matter', 'lesson-content-enrichment'].includes(slide?.enrichmentSource),
    ).length;
    if (kernelSubjectMatterCount >= 3) return;
    const requiredContentSlides = MIN_CONTENT_BEARING_SLIDES;
    if (contentCount >= requiredContentSlides) return;
    const neededContentSlides = Math.max(requiredContentSlides - contentCount, contentCount <= 2 ? 5 : 0);
    let insertedContentFloorSlides = 0;
    const existingTitles = new Set(slides.map((slide) => cleanText(slide.title).toLowerCase()).filter(Boolean));
    const activityIndex = slides.findIndex((slide) => slide.type === 'activity');
    const discussionIndex = slides.findIndex((slide) => slide.type === 'discussion');
    let insertAt = activityIndex >= 0 ? activityIndex : discussionIndex >= 0 ? discussionIndex : slides.length - 2;
    for (const slide of buildContentFloorSlides(lesson, {
      concept,
      secondary,
      objective,
      artifact,
    })) {
      if (contentCount >= requiredContentSlides && insertedContentFloorSlides >= neededContentSlides) break;
      const key = cleanText(slide.title).toLowerCase();
      if (existingTitles.has(key)) continue;
      slides.splice(Math.max(0, insertAt), 0, slide);
      insertAt += 1;
      existingTitles.add(key);
      insertedContentFloorSlides += 1;
      if (slideContentFloorTokenCount(slide, contentFloorTokenSet(lesson)) >= 2) contentCount += 1;
    }
  }

  return {
    adjustDeckLengthForContent,
    applyCommonPitfallsSlide,
    applyEvidenceSlideIntegrity,
    applyKernelSubjectMatterSlides,
    applyMcWalkthroughSlide,
    countLessonContentBearingSlides,
    deckClaimsKernelDepth,
    ensureMinimumContentSlideFloor,
    lowercaseClauseLead,
    lessonMisconceptionPairs,
  };
}
