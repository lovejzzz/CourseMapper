// Discussion choreography is deterministic compile-only policy. It is
// isolated so protocol depth and accessibility can evolve without inflating
// the compiler controller.
export function createDiscussionProtocol(dependencies) {
  const {
    cleanText,
    closeReadingDiscussionCopy,
    discussionDurationForFormat,
    ensureSentenceCompiler,
    lessonVariant,
    operationEvidenceDemandForLesson,
    recordContentFallbackHit,
    safeLessonArtifact,
    safeLessonPrimaryConcept,
    sentenceCase,
    statisticalArtifactDetailsForOperation,
    stripLessonPrefix,
    stripTerminalPunctuation,
  } = dependencies;

  function buildDiscussionProtocol({ lesson = {}, blueprint = {}, phrase = {}, lens = {} }) {
    const mode =
      lesson.modalityDecode?.mode || blueprint.courseModalityProfile?.primaryMode || 'weekly-applied-seminar';
    const genre = lesson.artifactGenre?.genre || 'applied-artifact';
    const artifact = safeLessonArtifact(lesson);
    const concept = safeLessonPrimaryConcept(lesson);
    const evidenceMove = phrase.evidenceMove || `use ${lens.evidenceNoun || 'source evidence'} to test ${concept}`;
    const decisionMove = stripTerminalPunctuation(
      phrase.decisionMove || `make a defensible ${lens.decisionNoun || 'course decision'} for ${artifact}`,
    ).toLowerCase();
    const closeReadingCopy = closeReadingDiscussionCopy({
      lessonNumber: lesson.lessonNumber,
      concept,
    });
    const lessonUsesInferentialStatistics =
      /\b(?:confidence interval|p[- ]?value|hypothesis|inferenc|regression|sampling distribution|standard error)\b/i.test(
        [lesson.title, ...(lesson.keyConcepts || []), ...(lesson.outcomes || [])].filter(Boolean).join(' '),
      );
    const statisticalOperation = operationEvidenceDemandForLesson(lesson, { requireAction: false }).operation;
    const statisticalDetails = statisticalArtifactDetailsForOperation(lesson, null);
    const statisticalDiscussionByOperation = {
      'summarize-and-interpret-distribution': {
        format: 'Distribution Evidence Clinic',
        participationPattern:
          'variable and scale check, center-and-spread trace, outlier challenge, summary comparison, limitation check, and revised distribution conclusion',
      },
      'construct-and-interpret-histogram': {
        format: 'Histogram Interpretation Clinic',
        participationPattern:
          'bin-rule check, count trace, total verification, shape interpretation, alternate-binning challenge, and revised display conclusion',
      },
      'standardize-and-interpret-normal-observation': {
        format: 'Standardization Clinic',
        participationPattern:
          'model-input check, signed z-score trace, distance interpretation, comparison challenge, normal-model boundary, and revised conclusion',
      },
      'calculate-and-interpret-correlation': {
        format: 'Association Clinic',
        participationPattern:
          'paired-data check, scatterplot inspection, correlation trace, unusual-point challenge, causal-boundary check, and revised association conclusion',
      },
      'fit-and-interpret-simple-linear-regression': {
        format: 'Regression Interpretation Clinic',
        participationPattern:
          'paired-data check, slope-and-intercept trace, fitted-value or residual review, extrapolation challenge, causal-boundary check, and revised regression conclusion',
      },
      'calculate-and-interpret-two-way-table': {
        format: 'Two-Way Table Clinic',
        participationPattern:
          'cell-and-total check, conditioning choice, proportion trace, group comparison, causal-boundary challenge, and revised association conclusion',
      },
      'construct-and-audit-probability-sample': {
        format: 'Sampling Design Clinic',
        participationPattern:
          'population-frame check, selection replay, inclusion-probability audit, undercoverage challenge, limitation review, and repaired sampling plan',
      },
      'calculate-and-interpret-confidence-interval': {
        format: 'Confidence Interval Clinic',
        participationPattern:
          'sample check, error trace, endpoint verification, repeated-sampling interpretation, assumption check, and revised interval conclusion',
      },
      'calculate-and-interpret-one-proportion-test': {
        format: 'Hypothesis Test Clinic',
        participationPattern:
          'hypothesis framing, null-error trace, statistic and p-value check, effect comparison, assumption check, and revised inference decision',
      },
    };
    const operationDiscussion = statisticalDiscussionByOperation[statisticalOperation] || null;
    const protocolByGenre = {
      'clinical-placement-evidence': {
        format: 'Clinical Placement Conference',
        participationPattern:
          'site-evidence check, confidentiality screen, preceptor feedback, competency calibration, safety challenge, and next-shift plan',
        artifactUse: `Students inspect the deidentified site evidence, preceptor feedback, competency target, confidentiality check, safety action, and handoff decision in ${artifact}.`,
        reviewFocus: `patient safety, confidentiality, scope of practice, preceptor-feedback uptake, competency progression, and placement transfer for ${concept}`,
      },
      'clinical-care-plan': {
        format: 'Clinical Judgment Conference',
        participationPattern:
          'patient-cue sort, priority ranking, safety challenge, intervention rationale, SBAR handoff, and debrief revision',
        artifactUse: `Students inspect the patient assessment data, priority, intervention, monitoring cue, and handoff evidence in ${artifact}.`,
        reviewFocus: `cue recognition, prioritization, patient safety, intervention rationale, monitoring plan, and handoff clarity for ${concept}`,
      },
      'performance-simulation': {
        format: 'Role Play / Simulation',
        participationPattern: 'paired rehearsal, observation notes, debrief, and coached reattempt',
        artifactUse: `Students test exact language and response moves before revising ${artifact}.`,
        reviewFocus: `observable performance evidence, recovery after feedback, and safe or accurate ${concept} communication`,
      },
      'design-prototype': {
        format: 'Studio Critique',
        participationPattern: lessonVariant(lesson, [
          'artifact walk-through, critique notes, revision commitment, and peer challenge',
          'prototype tour, evidence-based critique, priority revision choice, and peer stress test',
          'design rationale share, usability-evidence check, critique response, and next-iteration commitment',
          'visible-decision review, peer question round, evidence note, and revision target selection',
          'studio pin-up, source-backed critique, accessibility check, and iteration plan',
          'artifact inspection, user-evidence comparison, critique synthesis, and revision handoff',
        ]),
        artifactUse: `Students inspect the visible design decision in ${artifact} before selecting the next iteration.`,
        reviewFocus: `visible change, critique evidence, usability reasoning, and the next ${concept} revision`,
      },
      'analysis-log': {
        format: 'Method Clinic',
        participationPattern: 'method trace, peer check, limitation naming, and corrected interpretation',
        artifactUse: `Students trace how the method choice in ${artifact} supports or weakens the conclusion.`,
        reviewFocus: `method fit, evidence traceability, limitation language, and interpretation accuracy for ${concept}`,
      },
      'engineering-design-test': {
        format: 'Engineering Design Review',
        participationPattern:
          'requirement check, prototype or model walkthrough, test-data review, failure-mode diagnosis, redesign critique, and verification handoff',
        artifactUse: `Students inspect the requirement, prototype or model, test setup, measurement data, and redesign rationale in ${artifact}.`,
        reviewFocus: `requirement fit, test validity, measurement evidence, failure analysis, safety or tolerance risk, and verification readiness for ${concept}`,
      },
      'statistical-inference-report': {
        format:
          operationDiscussion?.format ||
          (lessonUsesInferentialStatistics ? 'Inference Interpretation Clinic' : 'Statistical Evidence Clinic'),
        participationPattern:
          operationDiscussion?.participationPattern ||
          (lessonUsesInferentialStatistics
            ? 'question framing, assumption check, output trace, uncertainty interpretation, limitation challenge, and revised inference decision'
            : 'question framing, variable and scale check, display or summary trace, pattern interpretation, limitation challenge, and revised statistical conclusion'),
        artifactUse: statisticalDetails
          ? `Students inspect ${statisticalDetails.evidenceRequirement} in ${artifact}.`
          : lessonUsesInferentialStatistics
            ? `Students inspect the question, sample context, assumptions, inference output, interpretation, and limitation in ${artifact}.`
            : `Students inspect the question, variables, display or numerical summary, observed pattern, and limitation in ${artifact}.`,
        reviewFocus: statisticalDetails
          ? `${statisticalDetails.qualityFocus} for ${concept}`
          : lessonUsesInferentialStatistics
            ? `question fit, assumption validity, calculation or output accuracy, uncertainty interpretation, effect size reasoning, limitation language, and inference decision quality for ${concept}`
            : `question fit, variable and scale identification, display or summary accuracy, pattern interpretation, limitation language, and conclusion quality for ${concept}`,
      },
      'source-evaluation-dossier': {
        format: 'Source Evaluation Clinic',
        participationPattern:
          'research-question check, database-search trace, credibility screen, citation-trail comparison, synthesis-matrix challenge, and revised source-use decision',
        artifactUse: `Students inspect the search string, database choice, source authority, relevance evidence, citation trail, and synthesis relationship in ${artifact}.`,
        reviewFocus: `search strategy fit, source authority, relevance, credibility, citation-trail reasoning, synthesis usefulness, attribution integrity, and source-use judgment for ${concept}`,
      },
      'teaching-plan-portfolio': {
        format: 'Microteaching Lesson Study',
        participationPattern:
          'learning-target check, standards alignment, microteaching rehearsal, student-work analysis, differentiation challenge, and revised instructional decision',
        artifactUse: `Teacher candidates inspect the learning target, instructional move, student evidence, formative check, and differentiation plan in ${artifact}.`,
        reviewFocus: `target-task alignment, student evidence, pedagogical reasoning, differentiation, formative feedback, classroom feasibility, and reteach readiness for ${concept}`,
      },
      'case-conceptualization': {
        format: 'Helping Skills Case Conference',
        participationPattern:
          'client-scenario read, helping-response rehearsal, observation coding, risk and ethics check, referral comparison, and revised helping decision',
        artifactUse: `Students inspect the client cue, exact helping response, observation code, risk or ethics note, and referral rationale in ${artifact}.`,
        reviewFocus: `client-centered evidence, active listening, helping-skill fit, risk recognition, ethics and boundaries, referral reasoning, supervision uptake, and next-response readiness for ${concept}`,
      },
      'financial-analysis-report': {
        format: 'Financial Analysis Clinic',
        participationPattern:
          'source document check, account classification, calculation trace, statement-effect review, assumption or control challenge, and revised financial decision',
        artifactUse: `Students inspect the source document or statement line, calculation trace, statement effect, assumption or control, and decision logic in ${artifact}.`,
        reviewFocus: `source fit, account classification, statement linkage, calculation accuracy, control validity, ratio or variance interpretation, and decision quality for ${concept}`,
      },
      'economic-analysis-brief': {
        format: 'Economic Model Clinic',
        participationPattern:
          'market definition check, assumption statement, diagram or calculation trace, comparative-static challenge, welfare or incentive review, and revised economic decision',
        artifactUse: `Students inspect the market, assumptions, model or calculation, incentive effect, welfare implication, and decision limit in ${artifact}.`,
        reviewFocus: `model fit, assumptions, supply-demand or macro reasoning, elasticity or surplus interpretation, incentives, welfare effects, and decision quality for ${concept}`,
      },
      'ethical-argument-brief': {
        format: 'Ethical Argument Seminar',
        participationPattern:
          'dilemma framing, normative-framework comparison, argument-map share, objection and reply, case variation test, and revised moral judgment',
        artifactUse: `Students inspect the claim, reasons, framework, objection, reply, case evidence, and judgment limit in ${artifact}.`,
        reviewFocus: `claim clarity, framework fit, support, objection, reply, stakeholder sensitivity, case application, and moral judgment for ${concept}`,
      },
      'policy-brief': {
        format: 'Policy Option Clinic',
        participationPattern:
          'problem definition check, stakeholder map, option comparison, equity and feasibility challenge, implementation-risk review, and revised policy recommendation',
        artifactUse: `Students inspect the public problem, affected population, option evidence, stakeholder/equity effect, feasibility constraint, and implementation risk in ${artifact}.`,
        reviewFocus: `problem framing, evidence credibility, stakeholder representation, equity, tradeoffs, feasibility, implementation, and policy judgment for ${concept}`,
      },
      'data-science-notebook': {
        format: 'Analytics Review Clinic',
        participationPattern:
          'dataset provenance check, cleaning trace, notebook output review, validation comparison, bias or limitation challenge, and revised analytic conclusion',
        artifactUse: `Students inspect the dataset, notebook output, visualization or model evidence, and validation logic in ${artifact}.`,
        reviewFocus: `data integrity, reproducibility, validation evidence, interpretation accuracy, bias or fairness risk, and analytic usefulness for ${concept}`,
      },
      'data-story-portfolio': {
        format: 'Public Data Story Critique',
        participationPattern:
          'source-ledger check, transformation trace, chart and scale critique, uncertainty annotation, accessibility review, and visible revision',
        artifactUse: `Students trace the public claim in ${artifact} back to its source, transformation record, visual choice, uncertainty boundary, and revision note.`,
        reviewFocus: `source integrity, transformation transparency, visual honesty, uncertainty, accessibility, audience fit, and visible revision for ${concept}`,
      },
      'code-lab': {
        format: 'Code Review Clinic',
        participationPattern:
          'test setup, pair implementation, failing or passing test trace, code review, refactor note, and commit handoff',
        artifactUse: `Students inspect the code, tests, debugging trace, and implementation rationale in ${artifact}.`,
        reviewFocus: `correctness, readability, test coverage, edge-case handling, debugging evidence, and commit clarity for ${concept}`,
      },
      'lab-report': {
        format: 'Lab Evidence Clinic',
        participationPattern:
          'protocol trace, safety check, notebook evidence comparison, and corrected interpretation',
        artifactUse: `Students inspect the protocol, raw observations, and data evidence in ${artifact} before revising the conclusion.`,
        reviewFocus: `protocol accuracy, safety reasoning, data integrity, variable control, and conclusion limits for ${concept}`,
      },
      'problem-set': {
        format: 'Problem-Solving Clinic',
        participationPattern: 'setup comparison, step trace, answer check, error diagnosis, and corrected solution',
        artifactUse: `Students inspect the equation setup, representation, and reasoning path in ${artifact} before revising the solution.`,
        reviewFocus: `mathematical setup, step logic, representation accuracy, verification, and error analysis for ${concept}`,
      },
      'music-interval-analysis': {
        format: 'Interval Reasoning Clinic',
        participationPattern:
          'pitch-endpoint check, inclusive letter-name count, semitone verification, number-and-quality comparison, peer error diagnosis, and corrected classification',
        artifactUse: `Students inspect the notated or heard endpoints, generic number, semitone span, quality, and any reduction or inversion rule used in ${artifact}.`,
        reviewFocus: `pitch-spelling accuracy, inclusive counting, semitone verification, interval quality, inversion rules, and correction quality for ${concept}`,
      },
      'proof-portfolio': {
        format: 'Proof Clinic',
        participationPattern:
          'definition unpacking, theorem statement check, proof-strategy comparison, counterexample test, peer proof critique, and revised proof step',
        artifactUse: `Students inspect the definitions, hypotheses, proof strategy, logical steps, and revision evidence in ${artifact}.`,
        reviewFocus: `definition use, hypothesis tracking, quantifier precision, logical validity, counterexample reasoning, notation clarity, and proof revision for ${concept}`,
      },
      'capstone-project': {
        format: 'Milestone Design Review',
        participationPattern:
          'milestone evidence share, sponsor constraint check, risk triage, decision defense, and revision commitment',
        artifactUse: `Students inspect how ${artifact} connects project evidence, stakeholder constraints, and next milestone decisions.`,
        reviewFocus: `project coherence, stakeholder fit, integration evidence, feasibility risk, and defense readiness for ${concept}`,
      },
      'competency-evidence': {
        format: 'Competency Calibration Panel',
        participationPattern:
          'performance evidence review, benchmark comparison, proficiency calibration, remediation planning, and reassessment commitment',
        artifactUse: `Students map ${artifact} to the target competency, benchmark descriptor, and next evidence step.`,
        reviewFocus: `standards alignment, evidence sufficiency, calibrated proficiency judgment, remediation fit, and reassessment readiness for ${concept}`,
      },
      'creative-portfolio': {
        format: 'Creative Workshop Critique',
        participationPattern:
          'silent read or viewing, craft observation, peer critique, revision question, and next-draft commitment',
        artifactUse: `Students inspect the craft choices, critique notes, and revision evidence in ${artifact}.`,
        reviewFocus: `craft intentionality, audience effect, critique uptake, visible revision, and portfolio coherence for ${concept}`,
      },
      'case-analysis': {
        format: 'Case Decision Board',
        participationPattern:
          'case fact sort, exhibit check, stakeholder tradeoff challenge, recommendation defense, and implementation-risk revision',
        artifactUse: `Students test the recommendation, decision criteria, exhibits, and stakeholder tradeoffs in ${artifact}.`,
        reviewFocus: `case evidence, tradeoff reasoning, decision criteria, recommendation defense, and implementation realism for ${concept}`,
      },
      'legal-analysis': {
        format: 'Socratic Rule Application',
        participationPattern:
          'case brief comparison, holding extraction, rule statement challenge, hypothetical application, and revised IRAC paragraph',
        artifactUse: `Students test the rule statement, holding, rationale, distinguishing facts, and application logic in ${artifact}.`,
        reviewFocus: `rule accuracy, precedent use, issue spotting, fact-sensitive application, counterargument, and doctrinal limits for ${concept}`,
      },
      'close-reading-analysis': {
        format: 'Interpretive Evidence Seminar',
        participationPattern: closeReadingCopy.participationPattern,
        artifactUse: `Students test the evidence, context boundary, counter-reading, and revised interpretive claim in ${artifact}.`,
        reviewFocus: closeReadingCopy.reviewFocus,
      },
      'field-evidence': {
        format: 'Field Evidence Roundtable',
        participationPattern: 'observed evidence share, stakeholder check, equity question, and feasible action',
        artifactUse: `Students separate local evidence from assumptions before revising ${artifact}.`,
        reviewFocus: `stakeholder grounding, feasibility, equity reasoning, and the local action in ${artifact}`,
      },
      'literature-synthesis': {
        format: 'Source Synthesis Seminar',
        participationPattern: 'source comparison, gap challenge, attribution check, and synthesis revision',
        artifactUse: `Students compare source claims before revising the synthesis decision in ${artifact}.`,
        reviewFocus: `source accuracy, cross-source synthesis, gap logic, and attribution integrity for ${concept}`,
      },
      'memo-brief': {
        format: 'Claim-Evidence Critique',
        participationPattern: 'claim share, evidence challenge, limitation check, and memo revision decision',
        artifactUse: `Students test whether the claim, evidence, limitation, and next step in ${artifact} fit together.`,
        reviewFocus: `claim clarity, evidence quality, decision logic, audience fit, and revision use for ${concept}`,
      },
      'checkpoint-response': {
        format: 'Misconception Clinic',
        participationPattern: 'answer sort, reasoning explanation, misconception repair, and corrected response',
        artifactUse: `Students use ${artifact} to expose a misconception before writing a corrected explanation.`,
        reviewFocus: `concept accuracy, reasoning quality, correction path, and readiness for the next artifact`,
      },
      'language-performance': {
        format: 'Communicative Practice Lab',
        participationPattern:
          'input comprehension check, paired target-language rehearsal, focused recast, cultural-context check, and revised performance',
        artifactUse: `Students use ${artifact} to show what they can understand, say, interpret, or present in the target language.`,
        reviewFocus: `comprehensibility, language accuracy, communicative function, cultural fit, and revised target-language use for ${concept}`,
      },
      'performance-rehearsal': {
        format: 'Rehearsal Critique Lab',
        participationPattern:
          'warm-up, first run, director or peer notes, targeted rehearsal, revised performance run, and next-cue reflection',
        artifactUse: `Students use ${artifact} to make the performance choice, critique uptake, and revised run visible.`,
        reviewFocus: `technique accuracy, artistic intention, ensemble awareness, note uptake, and revised performance evidence for ${concept}`,
      },
      presentation: {
        format: 'Peer Presentation Critique',
        participationPattern: 'timed explanation, audience question, evidence check, and speaking or slide revision',
        artifactUse: `Students rehearse the audience claim and support evidence before revising ${artifact}.`,
        reviewFocus: 'audience fit, evidence organization, clarity, timing, and response to questions',
      },
      'reflection-response': {
        format: 'Structured Reflection Circle',
        participationPattern: 'individual write, evidence share, peer connection, and next-use commitment',
        artifactUse: `Students tie the reflection in ${artifact} to a concrete learning move and next action.`,
        reviewFocus: `specificity, metacognition, evidence connection, and actionable transfer for ${concept}`,
      },
      'applied-artifact': {
        format: mode === 'online-hybrid' ? 'Asynchronous Online' : 'Case-Based Discussion',
        participationPattern: lessonVariant(lesson, [
          'evidence display, observation check, claim boundary, and written revision choice',
          'initial interpretation, peer counterexample, warrant repair, and artifact update',
          'feature annotation, competing reading, evidence test, and decision revision',
          'viewpoint comparison, inference challenge, missing-context check, and qualified response',
          'source audit, ethical boundary discussion, attribution check, and publication decision',
        ]),
        artifactUse: `Students use ${artifact} to make the source evidence decision visible.`,
        reviewFocus: `concept accuracy, evidence specificity, decision logic, and revision quality for ${concept}`,
      },
    };
    const modeOverride =
      mode === 'online-hybrid'
        ? {
            ...(protocolByGenre[genre] || protocolByGenre['applied-artifact']),
            format: 'Asynchronous Online',
            participationPattern:
              'initial post, evidence-based reply, instructor checkpoint, and LMS revision commitment',
            artifactUse: `Students make the ${artifact} reasoning visible online before revising from feedback.`,
          }
        : mode === 'clinical-simulation'
          ? protocolByGenre['performance-simulation']
          : mode === 'clinical-placement-practicum'
            ? protocolByGenre['clinical-placement-evidence']
            : mode === 'clinical-judgment-simulation'
              ? protocolByGenre['clinical-care-plan']
              : mode === 'lecture-exam' && genre === 'checkpoint-response' && lesson.hasStandaloneAssessment !== false
                ? {
                    ...protocolByGenre['checkpoint-response'],
                    format: 'Exam Readiness Clinic',
                    participationPattern: lessonVariant(lesson, [
                      'retrieval attempt, confidence check, wrong-answer sort, misconception repair, and exam-style transfer item',
                      'answer poll, distractor rationale, correction draft, paired explanation, and transfer check',
                      'quick response, confidence mark, fragile-reasoning discussion, corrected claim, and study-plan note',
                      'practice item, evidence cue, misconception diagnosis, revised answer, and next-question rehearsal',
                      'solo retrieval answer, peer rationale comparison, instructor repair, and parallel exam prompt',
                      'concept check, tempting-answer audit, correction language, and transfer-ready explanation',
                    ]),
                    artifactUse: lessonVariant(lesson, [
                      `Students use ${artifact} to diagnose what they know, correct the misconception, and prepare for an exam-style transfer prompt.`,
                      `Students annotate ${artifact} for the answer cue, the misleading distractor, and the correction they would reuse.`,
                      `Students turn ${artifact} into a short repair note that names the missed idea and the next practice move.`,
                      `Students compare ${artifact} responses before writing the explanation that would survive a parallel exam item.`,
                      `Students use ${artifact} to separate recall from reasoning, then revise the line that made the answer fragile.`,
                      `Students map ${artifact} onto a new question stem and mark which evidence makes the corrected answer hold.`,
                    ]),
                    reviewFocus: lessonVariant(lesson, [
                      `concept accuracy, retrieval strength, misconception repair, confidence calibration, and exam-transfer readiness for ${concept}`,
                      `answer rationale, distractor rejection, corrected explanation, and next-study target for ${concept}`,
                      `retrieval evidence, repair language, parallel-item transfer, and study-guide update for ${concept}`,
                      `selected answer, evidence cue, misconception diagnosis, and transfer-ready explanation for ${concept}`,
                      `confidence judgment, reasoning trace, corrected claim, and future practice choice for ${concept}`,
                      `accuracy check, answer-cue evidence, misconception recovery, and exam-prep decision for ${concept}`,
                    ]),
                  }
                : mode === 'world-language'
                  ? protocolByGenre['language-performance']
                  : mode === 'performing-arts'
                    ? protocolByGenre['performance-rehearsal']
                    : mode === 'engineering-design-lab'
                      ? protocolByGenre['engineering-design-test']
                      : mode === 'statistics-inference'
                        ? protocolByGenre['statistical-inference-report']
                        : mode === 'information-literacy'
                          ? protocolByGenre['source-evaluation-dossier']
                          : mode === 'teacher-preparation'
                            ? protocolByGenre['teaching-plan-portfolio']
                            : mode === 'counseling-practice'
                              ? protocolByGenre['case-conceptualization']
                              : mode === 'accounting-finance-analysis'
                                ? protocolByGenre['financial-analysis-report']
                                : mode === 'economics-analysis'
                                  ? protocolByGenre['economic-analysis-brief']
                                  : mode === 'ethics-argumentation'
                                    ? protocolByGenre['ethical-argument-brief']
                                    : mode === 'policy-analysis'
                                      ? protocolByGenre['policy-brief']
                                      : mode === 'proof-seminar'
                                        ? protocolByGenre['proof-portfolio']
                                        : mode === 'data-storytelling-studio'
                                          ? protocolByGenre['data-story-portfolio']
                                          : mode === 'data-science-lab'
                                            ? protocolByGenre['data-science-notebook']
                                            : mode === 'programming-lab'
                                              ? protocolByGenre['code-lab']
                                              : mode === 'studio-lab' && genre === 'applied-artifact'
                                                ? protocolByGenre['design-prototype']
                                                : null;
    // v0.15.187 dictionary retirement (slice 1): a complete kernel-authored
    // course protocol beats the 34-genre dictionary — the dictionary (and its
    // mode overrides) become the fallback for unauthored courses.
    const authoredProtocol = blueprint.enrichment?.discussionProtocol;
    const authoredComplete = Boolean(
      authoredProtocol?.format &&
      authoredProtocol?.participationPattern &&
      authoredProtocol?.artifactUse &&
      authoredProtocol?.reviewFocus,
    );
    if (!authoredComplete && !modeOverride && !protocolByGenre[genre]) {
      // v0.15.187 fallback telemetry: no authored protocol, no mode override,
      // no genre entry — the discussion runs the generic applied-artifact
      // protocol.
      recordContentFallbackHit('discussion-protocol-default', `${mode} × ${genre}`);
    }
    const selected = authoredComplete
      ? {
          format: cleanText(authoredProtocol.format),
          participationPattern: cleanText(authoredProtocol.participationPattern),
          artifactUse: cleanText(authoredProtocol.artifactUse),
          reviewFocus: cleanText(authoredProtocol.reviewFocus),
        }
      : modeOverride || protocolByGenre[genre] || protocolByGenre['applied-artifact'];
    return {
      ...selected,
      estimatedDuration: discussionDurationForFormat(selected.format),
      modality: mode,
      artifactGenre: genre,
      evidenceMove,
      decisionMove,
      facilitationMove: `Use ${selected.participationPattern} so students ${evidenceMove} and then ${decisionMove}.`,
      modalityFit: lesson.modalityDecode?.signaturePractice
        ? `This discussion follows the course practice pattern. ${ensureSentenceCompiler(
            sentenceCase(lesson.modalityDecode.signaturePractice),
          )}`
        : 'This discussion follows the course practice pattern instead of a generic seminar exchange.',
      artifactGenreFit: `This discussion treats ${artifact} as ${lesson.artifactGenre?.label || genre}, with review focused on ${selected.reviewFocus}.`,
      localAdaptationCue: `Confirm participation mode, privacy, accessibility, and time limits before running the ${selected.format.toLowerCase()} for ${stripLessonPrefix(lesson.title)}.`,
    };
  }

  return { buildDiscussionProtocol };
}
