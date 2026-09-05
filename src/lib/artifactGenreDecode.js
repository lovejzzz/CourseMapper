// Artifact-genre decoding is deterministic compile-only policy. Isolating
// it keeps the compiler facade focused on orchestration and makes this large
// cross-discipline decision table independently cacheable.
export function createArtifactGenreDecode(dependencies) {
  const {
    LEARNER_CHECKPOINT_ARTIFACT_GENRE_PROFILES,
    conciseClause,
    ensureSentenceCompiler,
    hasCaseMethodEvidence,
    hasInterpretiveHumanitiesEvidence,
    hasLegalDoctrinalEvidence,
    isMusicIntervalLesson,
    lessonOwnedArtifactGenre,
    lessonRotationIndex,
    lessonVariant,
    recordContentFallbackHit,
    sentenceCase,
    statisticalArtifactDetailsForOperation,
    stripLessonPrefix,
    stripTerminalPunctuation,
  } = dependencies;

  function buildArtifactGenreDecode(lesson = {}, profile = {}, modalityDecode = {}) {
    const artifact = stripTerminalPunctuation(lesson.studentArtifact || 'the lesson artifact');
    const concept = lesson.keyConcepts?.[0] || stripLessonPrefix(lesson.title) || 'the lesson focus';
    const artifactText = `${lesson.studentArtifact || ''} ${lesson.title || ''}`.toLowerCase();
    const contextText =
      `${lesson.title || ''} ${lesson.studentArtifact || ''} ${lesson.activityPattern || ''} ${(lesson.keyConcepts || []).join(' ')} ${(lesson.outcomes || []).join(' ')}`.toLowerCase();
    const artifactMatches = (pattern) => pattern.test(artifactText);
    const contextMatches = (pattern) => pattern.test(contextText);
    const lessonOwnedGenre = lessonOwnedArtifactGenre(contextText);
    let genre = 'applied-artifact';
    if (isMusicIntervalLesson(lesson)) {
      genre = 'music-interval-analysis';
    } else if (lessonOwnedGenre) {
      genre = lessonOwnedGenre;
    } else if (
      profile.primaryMode === 'lecture-exam' &&
      (artifactMatches(
        /\b(quiz|check|worksheet|test|exam|retrieval|study[-\s]?guide|exam blueprint|corrected explanation|practice item|confidence rating|wrong[-\s]?answer|misconception)\b/,
      ) ||
        contextMatches(
          /\b(quiz|check|worksheet|test|exam|retrieval|study[-\s]?guide|exam blueprint|corrected explanation|practice item|confidence rating|wrong[-\s]?answer|misconception)\b/,
        ))
    ) {
      genre = 'checkpoint-response';
    } else if (
      profile.primaryMode === 'world-language' &&
      (artifactMatches(
        /\b(dialogue|conversation|oral|speaking|listening|pronunciation|vocabulary|grammar|interpersonal|interpretive|presentational|cultural comparison|proficiency task|can[-\s]?do|language portfolio|target[-\s]?language|narration|recording|story)\b/,
      ) ||
        contextMatches(
          /\b(dialogue|conversation|oral proficiency|speaking|listening|pronunciation|vocabulary|grammar|interpersonal|interpretive|presentational|cultural comparison|proficiency task|can[-\s]?do|comprehensible input|target[-\s]?language|narration|recording|story)\b/,
        ))
    ) {
      genre = 'language-performance';
    } else if (
      profile.primaryMode === 'linguistic-analysis' &&
      (lesson.authenticDataTaskPlan?.protocol ||
        artifactMatches(
          /\b(language data|transcription|paradigm|feature chart|syntax tree|parse tree|corpus|linguistic analysis|form[-\s]?gloss|minimal pair|dialect comparison)\b/,
        ) ||
        contextMatches(
          /\b(phonetics|phonology|morphology|syntax|semantics|pragmatics|language variation|language change|linguistic evidence)\b/,
        ))
    ) {
      genre = 'linguistic-data-analysis';
    } else if (
      profile.primaryMode === 'performing-arts' &&
      (artifactMatches(
        /\b(monologue|scene|rehearsal|performance recording|performance journal|run[-\s]?through|choreography|movement phrase|score excerpt|ensemble cue|blocking note|stage picture|vocal performance|instrumental performance|audition|technique drill|director note)\b/,
      ) ||
        contextMatches(
          /\b(monologue|scene study|scene work|rehearsal|performance recording|performance critique|run[-\s]?through|choreography|movement phrase|score study|ensemble cue|blocking|staging|stage picture|vocal warm[-\s]?up|audition|technique drill|director note)\b/,
        ))
    ) {
      genre = 'performance-rehearsal';
    } else if (
      profile.primaryMode === 'capstone-project' &&
      (artifactMatches(
        /\b(capstone|project charter|project milestone|milestone brief|client project|sponsor brief|portfolio defense|final showcase|project portfolio|integration portfolio|proposal defense)\b/,
      ) ||
        artifactMatches(
          /\b(project|charter|milestone|brief|plan|portfolio|showcase|defense|deliverable|roadmap|matrix)\b/,
        ))
    ) {
      genre = 'capstone-project';
    } else if (
      artifactMatches(
        /\b(clinical placement|clinical practicum|clinical rotation|clinical hours|preceptor feedback|preceptor observation|patient encounter log|deidentified patient|competency log|skills checklist|site evaluation|placement reflection|scope of practice|confidentiality check|hipaa|clinical conference)\b/,
      ) ||
      (profile.primaryMode === 'clinical-placement-practicum' &&
        contextMatches(
          /\b(clinical placement|clinical practicum|clinical rotation|clinical hours|clinical site|preceptor|site supervisor|supervised practice|patient encounter|deidentified|competency|skills checklist|site evaluation|confidentiality|hipaa|scope of practice|patient safety|handoff)\b/,
        ))
    ) {
      genre = 'clinical-placement-evidence';
    } else if (
      artifactMatches(
        /\b(competency|proficiency|accreditation|standards[-\s]?aligned|program standard|performance task|evidence portfolio|mastery demonstration|benchmark|calibration note|remediation plan|competency checklist)\b/,
      ) ||
      (profile.primaryMode === 'competency-based' &&
        artifactMatches(
          /\b(evidence|portfolio|task|checklist|demonstration|standard|benchmark|proficiency|remediation)\b/,
        ))
    ) {
      genre = 'competency-evidence';
    } else if (
      artifactMatches(
        /\b(creative writing|poetry workshop|fiction workshop|writing workshop|screenwriting workshop|playwriting workshop|scene draft|poem draft|fiction draft|short story draft|screenplay draft|manuscript|craft essay|workshop critique|revision portfolio|artist statement|process journal|creative draft|line[-\s]?level revision)\b/,
      ) ||
      (profile.primaryMode === 'creative-studio' &&
        artifactMatches(/\b(draft|portfolio|workshop|critique|craft|revision|artist statement|journal|manuscript)\b/))
    ) {
      genre = 'creative-portfolio';
    } else if (
      artifactMatches(
        /\b(financial statement analysis|ratio analysis memo|cash[-\s]?flow forecast|cash[-\s]?flow statement analysis|journal entr(?:y|ies) worksheet|trial balance review|ledger reconciliation|budget variance report|variance analysis report|valuation model|npv analysis|discounted cash[-\s]?flow|cost[-\s]?volume[-\s]?profit analysis|break[-\s]?even analysis|control review note)\b/,
      ) ||
      (profile.primaryMode === 'accounting-finance-analysis' &&
        (artifactMatches(
          /\b(balance sheet|income statement|cash[-\s]?flow|journal entr(?:y|ies)|debit|credit|ledger|trial balance|adjusting entr(?:y|ies)|ratio|financial ratio|budget variance|variance analysis|contribution margin|break[-\s]?even|net present value|npv|valuation|working capital|internal control|audit trail)\b/,
        ) ||
          contextMatches(
            /\b(balance sheet|income statement|cash[-\s]?flow|journal entr(?:y|ies)|debit|credit|ledger|trial balance|adjusting entr(?:y|ies)|ratio|financial ratio|budget variance|variance analysis|contribution margin|break[-\s]?even|net present value|npv|valuation|working capital|internal control|audit trail)\b/,
          )))
    ) {
      genre = 'financial-analysis-report';
    } else if (
      artifactMatches(
        /\b(ethical argument brief|moral argument brief|ethics argument memo|argument map|argument mapping|dilemma analysis|normative framework comparison|objection reply memo|objection\/reply memo|thought experiment response|case application judgment|moral reasoning portfolio|ethical judgment memo)\b/,
      ) ||
      (profile.primaryMode === 'ethics-argumentation' &&
        (artifactMatches(
          /\b(ethic|ethical|moral|argument|claim|reason|normative|framework|utilitarian|deontolog|virtue ethics|care ethics|rights|justice|dilemma|thought experiment|objection|counterargument|reply|principle|judgment|case application)\b/,
        ) ||
          contextMatches(
            /\b(ethic|ethical|moral|argument|claim|reason|normative|framework|utilitarian|deontolog|virtue ethics|care ethics|rights|justice|dilemma|thought experiment|objection|counterargument|reply|principle|judgment|case application)\b/,
          )))
    ) {
      genre = 'ethical-argument-brief';
    } else if (
      artifactMatches(
        /\b(economic analysis brief|economic decision brief|market analysis memo|elasticity memo|supply[-\s]?demand analysis|supply and demand analysis|consumer surplus analysis|producer surplus analysis|welfare analysis|deadweight loss analysis|externality analysis|market failure analysis|tax incidence note|comparative statics memo|price ceiling analysis|price floor analysis|macro policy effect explanation)\b/,
      ) ||
      (profile.primaryMode === 'economics-analysis' &&
        (artifactMatches(
          /\b(economic|economics|market|supply|demand|elasticity|equilibrium|consumer surplus|producer surplus|deadweight loss|externality|market failure|marginal cost|marginal benefit|opportunity cost|comparative statics|tax incidence|price ceiling|price floor|welfare|incentive|scarcity|monopoly|perfect competition|gdp|inflation|unemployment|monetary|fiscal)\b/,
        ) ||
          contextMatches(
            /\b(economic|economics|market|supply|demand|elasticity|equilibrium|consumer surplus|producer surplus|deadweight loss|externality|market failure|marginal cost|marginal benefit|opportunity cost|comparative statics|tax incidence|price ceiling|price floor|welfare|incentive|scarcity|monopoly|perfect competition|gdp|inflation|unemployment|monetary|fiscal)\b/,
          )))
    ) {
      genre = 'economic-analysis-brief';
    } else if (
      artifactMatches(
        /\b(policy memo|policy brief|policy option matrix|policy option|stakeholder policy analysis|equity policy analysis|policy implementation plan|policy cost[-\s]?benefit analysis|policy impact assessment|regulatory analysis|public value memo|administrative burden review)\b/,
      ) ||
      (profile.primaryMode === 'policy-analysis' &&
        (artifactMatches(
          /\b(policy|memo|brief|option|stakeholder|equity|feasibility|implementation|cost[-\s]?benefit|impact|regulatory|public value|administrative burden|trade[-\s]?off)\b/,
        ) ||
          contextMatches(
            /\b(policy|memo|brief|option|stakeholder|equity|feasibility|implementation|cost[-\s]?benefit|impact|regulatory|public value|administrative burden|trade[-\s]?off)\b/,
          )))
    ) {
      genre = 'policy-brief';
    } else if (
      hasCaseMethodEvidence(artifactText) ||
      (profile.primaryMode === 'case-method' &&
        artifactMatches(/\b(case|memo|brief|recommendation|tradeoff|criteria|stakeholder|implementation|exhibit)\b/))
    ) {
      genre = 'case-analysis';
    } else if (
      hasLegalDoctrinalEvidence(artifactText) ||
      (profile.primaryMode === 'legal-doctrinal' &&
        artifactMatches(/\b(case|brief|memo|rule|issue|irac|precedent|hypothetical|holding|application)\b/))
    ) {
      genre = 'legal-analysis';
    } else if (
      artifactMatches(
        /\b(proof portfolio|proof write[-\s]?up|theorem proof|lemma proof|counterexample analysis|definition map|induction proof|contradiction proof|epsilon[-\s]?delta proof|formal proof|proof critique|proof revision)\b/,
      ) ||
      (profile.primaryMode === 'proof-seminar' &&
        (artifactMatches(
          /\b(theorem|lemma|definition|hypothesis|axiom|conjecture|counterexample|proof|quantifier|induction|contradiction|epsilon[-\s]?delta|logical implication|formal notation|proof strategy|proof revision)\b/,
        ) ||
          contextMatches(
            /\b(theorem|lemma|definition|hypothesis|axiom|conjecture|counterexample|proof|quantifier|induction|contradiction|epsilon[-\s]?delta|logical implication|formal notation|proof strategy|proof revision)\b/,
          )))
    ) {
      genre = 'proof-portfolio';
    } else if (
      (profile.primaryMode !== 'engineering-design-lab' &&
        artifactMatches(
          /\b(prototype|wireframe|design system|design-system|design artifact|design brief|portfolio rationale|journey map|usability|accessibility audit|inclusive interaction|design decision|screen|component)\b/,
        )) ||
      (profile.primaryMode === 'studio-lab' &&
        (artifactMatches(
          /\b(design|prototype|wireframe|journey map|usability|accessibility|inclusive interaction|critique|revision plan|rationale|artifact|portfolio|decision|recommendation|memo|brief)\b/,
        ) ||
          contextMatches(
            /\b(design|prototype|wireframe|journey map|usability|accessibility|inclusive interaction|critique|revision|rationale|artifact|portfolio|studio)\b/,
          )))
    ) {
      genre = 'design-prototype';
    } else if (
      artifactMatches(
        /\b(engineering prototype|prototype test|bench test|load test|stress test|test fixture|design verification|cad model|schematic|fabrication log|tolerance check|safety factor)\b/,
      ) ||
      (profile.primaryMode === 'engineering-design-lab' &&
        (artifactMatches(
          /\b(requirement|requirements|constraint|constraints|specification|tolerance|prototype|test data|test report|measurement|failure|failure analysis|redesign|redesign log|verification|verification report|trade[-\s]?off|cad|schematic|fabrication|safety factor|test fixture)\b/,
        ) ||
          contextMatches(
            /\b(requirement|requirements|constraint|constraints|specification|tolerance|prototype|test data|test report|measurement|failure|failure analysis|redesign|redesign log|verification|verification report|trade[-\s]?off|cad|schematic|fabrication|safety factor|test fixture)\b/,
          )))
    ) {
      genre = 'engineering-design-test';
    } else if (
      artifactMatches(
        /\b(statistical inference report|inference question memo|statistical question memo|hypothesis test write[-\s]?up|hypothesis-test write[-\s]?up|confidence interval interpretation|p[-\s]?value explanation|assumption check memo|test statistic report|effect size interpretation|regression inference memo|chi[-\s]?square (?:report|inference memo|test memo)|categorical association memo|t[-\s]?test report)\b/,
      ) ||
      (profile.primaryMode === 'statistics-inference' &&
        (artifactMatches(
          /\b(statistical question|inference question|inference claim|sample context|sample|population|variable|parameter|confidence interval|hypothesis test|hypothesis testing|null hypothesis|alternative hypothesis|p[-\s]?value|test statistic|standard error|margin of error|assumption|effect size|statistical significance|sampling distribution|inference decision|regression inference|chi[-\s]?square|categorical variable|expected count|contingency table|association|independence)\b/,
        ) ||
          contextMatches(
            /\b(statistical question|inference question|inference claim|sample context|sample|population|variable|parameter|confidence interval|hypothesis test|hypothesis testing|null hypothesis|alternative hypothesis|p[-\s]?value|test statistic|standard error|margin of error|assumption|effect size|statistical significance|sampling distribution|inference decision|regression inference|chi[-\s]?square|categorical variable|expected count|contingency table|association|independence)\b/,
          )))
    ) {
      genre = 'statistical-inference-report';
    } else if (
      artifactMatches(
        /\b(source[-\s]?evaluation dossier|source evaluation dossier|research log|database search log|search strategy log|citation[-\s]?trail map|source-use plan|credibility review)\b/,
      ) ||
      (profile.primaryMode === 'information-literacy' &&
        (artifactMatches(
          /\b(source|sources|database|search|keyword|controlled vocabulary|credibility|authority|peer[-\s]?reviewed|scholarly|citation|bibliography|synthesis|research log|source-use)\b/,
        ) ||
          contextMatches(
            /\b(source|sources|database|search|keyword|controlled vocabulary|credibility|authority|peer[-\s]?reviewed|scholarly|citation|bibliography|synthesis|research log|source-use)\b/,
          )))
    ) {
      genre = 'source-evaluation-dossier';
    } else if (
      artifactMatches(
        /\b(teaching plan portfolio|lesson plan|unit plan|microteaching|micro-teaching|teaching demonstration|learning target|standards alignment|differentiation plan|formative assessment plan|student work analysis|classroom management plan|reteach plan|instructional sequence|lesson study|edTPA)\b/,
      ) ||
      (profile.primaryMode === 'teacher-preparation' &&
        (artifactMatches(
          /\b(lesson|unit|microteaching|teaching|instruction|learning target|standard|differentiation|formative assessment|student work|classroom management|reteach|scaffold|family communication)\b/,
        ) ||
          contextMatches(
            /\b(lesson plan|unit plan|microteaching|micro-teaching|teaching demonstration|learning target|standards alignment|differentiation|formative assessment|student work analysis|classroom management|instructional strategy|assessment plan|scaffolding|reteach plan)\b/,
          )))
    ) {
      genre = 'teaching-plan-portfolio';
    } else if (
      profile.primaryMode === 'counseling-practice' &&
      (artifactMatches(
        /\b(case conceptualization|case formulation|intake note|process recording|session note|helping-skills transcript|helping skills transcript|active-listening transcript|reflective listening note|motivational interviewing plan|safety plan|risk assessment|service plan|referral note|supervision reflection|client goal plan|biopsychosocial assessment)\b/,
      ) ||
        artifactMatches(
          /\b(client|intake|case|counseling|counselling|helping|listening|reflection|oars|risk|safety|referral|service plan|treatment plan|process recording|supervision)\b/,
        ) ||
        contextMatches(
          /\b(client|intake|case conceptualization|case formulation|helping skill|active listening|reflective listening|motivational interviewing|risk assessment|safety plan|referral|service plan|process recording|supervision note)\b/,
        ))
    ) {
      genre = 'case-conceptualization';
    } else if (profile.primaryMode === 'data-storytelling-studio') {
      genre = 'data-story-portfolio';
    } else if (
      artifactMatches(
        /\b(data science notebook|analytics notebook|jupyter notebook|model evaluation|validation report|bias audit|fairness audit|confusion matrix|predictive model|model card)\b/,
      ) ||
      (profile.primaryMode === 'data-science-lab' &&
        (artifactMatches(
          /\b(dataset|data set|dataframe|csv|notebook|visualization|visual encoding|chart|dashboard|model|metric|validation|train[-\s]?test|cross[-\s]?validation|bias|fairness|feature|prediction|classification|regression|data story|source ledger|cleaning log|uncertainty note)\b/,
        ) ||
          contextMatches(
            /\b(dataset|data set|dataframe|csv|notebook|visualization|visual encoding|chart|dashboard|model|metric|validation|train[-\s]?test|cross[-\s]?validation|bias|fairness|feature|prediction|classification|regression|data story|source ledger|cleaning log|uncertainty note)\b/,
          )))
    ) {
      genre = 'data-science-notebook';
    } else if (
      artifactMatches(
        /\b(code lab|programming lab|software project|repository commit|pull request|unit test|test suite|debugging log|refactor plan|implementation trace|code review)\b/,
      ) ||
      (profile.primaryMode === 'programming-lab' &&
        (artifactMatches(
          /\b(code|coding|debug|debugging|unit test|test suite|automated test|repository|repo|git|commit|pull request|code review|implementation|algorithm|function|module|script|notebook|refactor|edge case)\b/,
        ) ||
          contextMatches(
            /\b(code|coding|debug|debugging|unit test|test suite|automated test|repository|repo|git|commit|pull request|code review|implementation|algorithm|function|module|script|notebook|refactor|edge case)\b/,
          )))
    ) {
      genre = 'code-lab';
    } else if (
      artifactMatches(
        /\b(lab report|lab notebook|lab safety|laboratory|specimen|microscopy|serial dilution|dilution|enzyme assay|assay|pipette|pipetting|aseptic|contamination|variable[-\s]?control|safety observation)\b/,
      )
    ) {
      genre = 'lab-report';
    } else if (
      artifactMatches(
        /\b(problem[-\s]?set|worked solution|solution set|solution rationale|calculation|equation|formula|derivation|proof|graphing|optimization|quantitative exercise|homework set|practice problems)\b/,
      )
    ) {
      genre = 'problem-set';
    } else if (
      profile.primaryMode === 'interpretive-humanities' &&
      (artifactMatches(
        /\b(close[-\s]?reading|context annotation|translation comparison|narrative voice|genre convention|poetic form|critical lens|archive note|adaptation comparison|reception annotation|comparative passage|scholarly conversation|interpretive portfolio|public[-\s]?facing rationale|scene analysis|visual analysis|primary source|source[-\s]?integrity|passage|annotation|memo|portfolio|rationale)\b/,
      ) ||
        contextMatches(
          /\b(close[-\s]?reading|interpretive claim|interpretive argument|passage evidence|textual evidence|translation choice|critical lens|genre convention|scene analysis|visual analysis|primary source analysis|historiography|archive note|reception context|source integrity)\b/,
        ))
    ) {
      genre = 'close-reading-analysis';
    } else if (
      artifactMatches(
        /\b(clinical care plan|care plan|nursing diagnosis|sbar|patient handoff|handoff note|patient assessment|assessment data|clinical judgment map|concept map|intervention plan|medication safety|medication administration|monitoring plan|ehr note|charting note|clinical decision rationale)\b/,
      ) ||
      (profile.primaryMode === 'clinical-judgment-simulation' &&
        contextMatches(
          /\b(patient|clinical|nursing|care plan|nursing diagnosis|sbar|handoff|assessment data|intervention|prioritization|priority|medication|safety|monitoring|charting|ehr|deterioration|clinical cue)\b/,
        ))
    ) {
      genre = 'clinical-care-plan';
    } else if (artifactMatches(/\b(memo|brief|recommendation|rationale)\b/)) {
      genre = 'memo-brief';
    } else if (
      profile.primaryMode === 'information-literacy' &&
      artifactMatches(
        /\b(source|sources|database|search|keyword|controlled vocabulary|credibility|peer[-\s]?reviewed|citation|bibliography|synthesis|research log|source-use)\b/,
      )
    ) {
      genre = 'source-evaluation-dossier';
    } else if (
      artifactMatches(/\b(dataset|data set|data|statistics|analysis|coding|log|instrument|survey|observation)\b/)
    ) {
      genre = 'analysis-log';
    } else if (
      artifactMatches(/\b(literature|literature matrix|source synthesis|annotated bibliography|gap statement)\b/)
    ) {
      genre = 'literature-synthesis';
    } else if (artifactMatches(/\b(field note|field|stakeholder|community|implementation|program|placement)\b/)) {
      genre = 'field-evidence';
    } else if (artifactMatches(/\b(presentation|slide|pitch)\b/)) {
      genre = 'presentation';
    } else if (
      artifactMatches(
        /\b(role[-\s]?play|simulation|interview|oral|encounter|dialogue|performance|scenario|teach[-\s]?back)\b/,
      ) ||
      (profile.primaryMode === 'clinical-simulation' && artifactMatches(/\b(script|conversation|instruction)\b/))
    ) {
      genre = 'performance-simulation';
    } else if (artifactMatches(/\b(quiz|check|worksheet|test|exam)\b/)) {
      genre = 'checkpoint-response';
    } else if (artifactMatches(/\b(reflection|discussion|post|journal)\b/)) {
      genre = 'reflection-response';
    } else if (contextMatches(/\b(memo|brief|recommendation|rationale)\b/)) {
      genre = 'memo-brief';
    } else if (
      profile.primaryMode === 'capstone-project' &&
      contextMatches(
        /\b(capstone|project charter|project milestone|milestone brief|client project|sponsor brief|portfolio defense|final showcase|project portfolio|integration portfolio|proposal defense)\b/,
      )
    ) {
      genre = 'capstone-project';
    } else if (
      contextMatches(
        /\b(competency|proficiency|accreditation|standards[-\s]?aligned|program standard|performance task|evidence portfolio|mastery demonstration|benchmark|calibration note|remediation plan|competency checklist)\b/,
      )
    ) {
      genre = 'competency-evidence';
    } else if (
      contextMatches(
        /\b(creative writing|poetry workshop|fiction workshop|writing workshop|screenwriting workshop|playwriting workshop|scene draft|poem draft|fiction draft|short story draft|screenplay draft|manuscript|craft essay|workshop critique|revision portfolio|artist statement|process journal|creative draft)\b/,
      )
    ) {
      genre = 'creative-portfolio';
    } else if (
      contextMatches(
        /\b(financial statement analysis|ratio analysis memo|cash[-\s]?flow forecast|cash[-\s]?flow statement analysis|journal entr(?:y|ies) worksheet|trial balance review|ledger reconciliation|budget variance report|variance analysis report|valuation model|npv analysis|discounted cash[-\s]?flow|cost[-\s]?volume[-\s]?profit analysis|break[-\s]?even analysis|control review note)\b/,
      ) ||
      (profile.primaryMode === 'accounting-finance-analysis' &&
        contextMatches(
          /\b(balance sheet|income statement|cash[-\s]?flow|journal entr(?:y|ies)|debit|credit|ledger|trial balance|adjusting entr(?:y|ies)|ratio|financial ratio|budget variance|variance analysis|contribution margin|break[-\s]?even|net present value|npv|valuation|working capital|internal control|audit trail)\b/,
        ))
    ) {
      genre = 'financial-analysis-report';
    } else if (
      contextMatches(
        /\b(ethical argument brief|moral argument brief|ethics argument memo|argument map|argument mapping|dilemma analysis|normative framework comparison|objection reply memo|objection\/reply memo|thought experiment response|case application judgment|moral reasoning portfolio|ethical judgment memo)\b/,
      ) ||
      (profile.primaryMode === 'ethics-argumentation' &&
        contextMatches(
          /\b(ethic|ethical|moral|argument|claim|reason|normative|framework|utilitarian|deontolog|virtue ethics|care ethics|rights|justice|dilemma|thought experiment|objection|counterargument|reply|principle|judgment|case application)\b/,
        ))
    ) {
      genre = 'ethical-argument-brief';
    } else if (
      contextMatches(
        /\b(economic analysis brief|economic decision brief|market analysis memo|elasticity memo|supply[-\s]?demand analysis|supply and demand analysis|consumer surplus analysis|producer surplus analysis|welfare analysis|deadweight loss analysis|externality analysis|market failure analysis|tax incidence note|comparative statics memo|price ceiling analysis|price floor analysis|macro policy effect explanation)\b/,
      ) ||
      (profile.primaryMode === 'economics-analysis' &&
        contextMatches(
          /\b(economic|economics|market|supply|demand|elasticity|equilibrium|consumer surplus|producer surplus|deadweight loss|externality|market failure|marginal cost|marginal benefit|opportunity cost|comparative statics|tax incidence|price ceiling|price floor|welfare|incentive|scarcity|monopoly|perfect competition|gdp|inflation|unemployment|monetary|fiscal)\b/,
        ))
    ) {
      genre = 'economic-analysis-brief';
    } else if (
      contextMatches(
        /\b(policy memo|policy brief|policy option matrix|policy option|stakeholder policy analysis|equity policy analysis|policy implementation plan|policy cost[-\s]?benefit analysis|policy impact assessment|regulatory analysis|public value memo|administrative burden review)\b/,
      ) ||
      (profile.primaryMode === 'policy-analysis' &&
        contextMatches(
          /\b(policy|memo|brief|option|stakeholder|equity|feasibility|implementation|cost[-\s]?benefit|impact|regulatory|public value|administrative burden|trade[-\s]?off)\b/,
        ))
    ) {
      genre = 'policy-brief';
    } else if (hasCaseMethodEvidence(contextText)) {
      genre = 'case-analysis';
    } else if (hasLegalDoctrinalEvidence(contextText)) {
      genre = 'legal-analysis';
    } else if (
      contextMatches(
        /\b(proof portfolio|proof write[-\s]?up|theorem proof|lemma proof|counterexample analysis|definition map|induction proof|contradiction proof|epsilon[-\s]?delta proof|formal proof|proof critique|proof revision)\b/,
      ) ||
      (profile.primaryMode === 'proof-seminar' &&
        contextMatches(
          /\b(theorem|lemma|definition|hypothesis|axiom|conjecture|counterexample|proof|quantifier|induction|contradiction|epsilon[-\s]?delta|logical implication|formal notation|proof strategy|proof revision)\b/,
        ))
    ) {
      genre = 'proof-portfolio';
    } else if (hasInterpretiveHumanitiesEvidence(contextText)) {
      genre = 'close-reading-analysis';
    } else if (
      profile.primaryMode !== 'engineering-design-lab' &&
      contextMatches(
        /\b(prototype|wireframe|design system|portfolio rationale|journey map|usability|accessibility audit|inclusive interaction|design decision)\b/,
      )
    ) {
      genre = 'design-prototype';
    } else if (
      contextMatches(
        /\b(engineering prototype|prototype test|bench test|load test|stress test|test fixture|design verification|cad model|schematic|fabrication log|tolerance check|safety factor)\b/,
      ) ||
      (profile.primaryMode === 'engineering-design-lab' &&
        contextMatches(
          /\b(requirement|requirements|constraint|constraints|specification|tolerance|prototype|test data|test report|measurement|failure|failure analysis|redesign|redesign log|verification|verification report|trade[-\s]?off|cad|schematic|fabrication|safety factor|test fixture)\b/,
        ))
    ) {
      genre = 'engineering-design-test';
    } else if (
      contextMatches(
        /\b(statistical inference report|inference question memo|statistical question memo|hypothesis test write[-\s]?up|hypothesis-test write[-\s]?up|confidence interval interpretation|p[-\s]?value explanation|assumption check memo|test statistic report|effect size interpretation|regression inference memo|chi[-\s]?square (?:report|inference memo|test memo)|categorical association memo|t[-\s]?test report)\b/,
      ) ||
      (profile.primaryMode === 'statistics-inference' &&
        contextMatches(
          /\b(statistical question|inference question|inference claim|sample context|sample|population|variable|parameter|confidence interval|hypothesis test|hypothesis testing|null hypothesis|alternative hypothesis|p[-\s]?value|test statistic|standard error|margin of error|assumption|effect size|statistical significance|sampling distribution|inference decision|regression inference|chi[-\s]?square|categorical variable|expected count|contingency table|association|independence)\b/,
        ))
    ) {
      genre = 'statistical-inference-report';
    } else if (
      contextMatches(
        /\b(source[-\s]?evaluation dossier|source evaluation dossier|research log|database search log|search strategy log|citation[-\s]?trail map|source-use plan|credibility review)\b/,
      ) ||
      (profile.primaryMode === 'information-literacy' &&
        contextMatches(
          /\b(source|sources|database|search|keyword|controlled vocabulary|credibility|authority|peer[-\s]?reviewed|scholarly|citation|bibliography|synthesis|research log|source-use)\b/,
        ))
    ) {
      genre = 'source-evaluation-dossier';
    } else if (
      contextMatches(
        /\b(teaching plan portfolio|lesson plan|unit plan|microteaching|micro-teaching|teaching demonstration|learning target|standards alignment|differentiation plan|formative assessment plan|student work analysis|classroom management plan|reteach plan|instructional sequence|lesson study|edTPA)\b/,
      ) ||
      (profile.primaryMode === 'teacher-preparation' &&
        contextMatches(
          /\b(lesson|unit|microteaching|teaching|instruction|learning target|standard|differentiation|formative assessment|student work|classroom management|reteach|scaffold|family communication)\b/,
        ))
    ) {
      genre = 'teaching-plan-portfolio';
    } else if (
      profile.primaryMode === 'counseling-practice' &&
      (contextMatches(
        /\b(case conceptualization|case formulation|intake note|process recording|session note|helping-skills transcript|helping skills transcript|active-listening transcript|reflective listening note|motivational interviewing plan|safety plan|risk assessment|service plan|referral note|supervision reflection|client goal plan|biopsychosocial assessment)\b/,
      ) ||
        contextMatches(
          /\b(client|intake|case|counseling|counselling|helping|listening|reflection|oars|risk|safety|referral|service plan|treatment plan|process recording|supervision)\b/,
        ))
    ) {
      genre = 'case-conceptualization';
    } else if (
      contextMatches(
        /\b(data science notebook|analytics notebook|jupyter notebook|model evaluation|validation report|bias audit|fairness audit|confusion matrix|predictive model|model card)\b/,
      ) ||
      (profile.primaryMode === 'data-science-lab' &&
        contextMatches(
          /\b(dataset|data set|dataframe|csv|notebook|visualization|dashboard|model|metric|validation|train[-\s]?test|cross[-\s]?validation|bias|fairness|feature|prediction|classification|regression|data story)\b/,
        ))
    ) {
      genre = 'data-science-notebook';
    } else if (
      contextMatches(
        /\b(code lab|programming lab|software project|repository commit|pull request|unit test|test suite|debugging log|refactor plan|implementation trace|code review)\b/,
      ) ||
      (profile.primaryMode === 'programming-lab' &&
        contextMatches(
          /\b(code|coding|debug|debugging|unit test|test suite|automated test|repository|repo|git|commit|pull request|code review|implementation|algorithm|function|module|script|notebook|refactor|edge case)\b/,
        ))
    ) {
      genre = 'code-lab';
    } else if (
      contextMatches(
        /\b(problem[-\s]?set|worked solution|solution set|calculation|equation|formula|derivation|proof|graphing|optimization|quantitative exercise|homework set|practice problems)\b/,
      )
    ) {
      genre = 'problem-set';
    } else if (contextMatches(/\b(dataset|data set|statistics|analysis|coding|instrument|survey|observation)\b/)) {
      genre = 'analysis-log';
    } else if (contextMatches(/\b(role[-\s]?play|simulation|interview|oral|encounter|dialogue|performance)\b/)) {
      genre = 'performance-simulation';
    }

    if (genre === 'applied-artifact') {
      // v0.15.187 fallback telemetry: no branch of the genre ladder matched —
      // the artifact ships the generic applied-artifact treatment.
      recordContentFallbackHit('artifact-genre-default', artifactText.slice(0, 200));
    }

    const baseDetails = {
      ...LEARNER_CHECKPOINT_ARTIFACT_GENRE_PROFILES,
      'clinical-placement-evidence': {
        outputFormat:
          'clinical hours log, competency log, preceptor-feedback response, deidentified patient encounter note, skills checklist, site evaluation, or clinical placement reflection',
        evidenceRequirement:
          'site expectation, deidentified patient-care evidence, preceptor or site-supervisor feedback, competency target, confidentiality check, patient-safety action, scope-of-practice boundary, and next placement decision',
        qualityFocus:
          'patient safety, confidentiality, scope awareness, supervised practice evidence, preceptor-feedback uptake, competency progression, and handoff usefulness',
        reviewProtocol:
          'confirm deidentification and confidentiality, trace the site evidence, compare the competency target to preceptor feedback, inspect patient-safety and scope boundaries, and require a next-shift action or handoff revision',
        commonFailure:
          'students submit broad clinical reflections without deidentified site evidence, preceptor feedback, competency targets, patient-safety reasoning, or scope-of-practice boundaries',
      },
      'clinical-care-plan': {
        outputFormat:
          'clinical care plan, nursing diagnosis, patient-assessment note, SBAR handoff, medication-safety rationale, EHR/charting note, or clinical judgment map',
        evidenceRequirement:
          'patient-assessment data, relevant clinical cue, priority or nursing diagnosis, safety risk, intervention rationale, monitoring plan, escalation cue, and handoff evidence',
        qualityFocus:
          'cue recognition, prioritization, patient safety, intervention fit, rationale quality, monitoring clarity, and handoff usefulness',
        reviewProtocol:
          'trace the patient assessment data, verify the priority or nursing diagnosis, inspect safety and medication risks, test the intervention rationale, and require a revised monitoring or SBAR handoff decision',
        commonFailure:
          'students list interventions or generic reflections without tying them to patient cues, safety priorities, monitoring evidence, or handoff clarity',
      },
      'performance-simulation': {
        outputFormat: 'observable performance plus brief debrief note',
        evidenceRequirement: 'exact phrase choices, response moves, safety or accuracy cues, and debrief evidence',
        qualityFocus: 'communication accuracy, responsiveness, professionalism, and recovery after feedback',
        reviewProtocol:
          'observe or review the performance, mark evidence against the rubric, then require one coached reattempt or debrief revision',
        commonFailure: 'students submit polished notes without showing observable performance evidence',
      },
      'design-prototype': {
        outputFormat: lessonVariant(lesson, [
          'annotated prototype or design artifact with user-evidence rationale',
          'before/after design artifact plus critique note and revision rationale',
          'prototype update with usability finding, design decision, and next iteration note',
          'wireframe, prototype, or portfolio artifact with evidence-backed design rationale',
          'artifact revision packet showing critique evidence and the design move it changed',
          'UX case artifact with user signal, rationale, and feedback-informed iteration note',
        ]),
        evidenceRequirement: lessonVariant(lesson, [
          'observable design revision, critique cue, user/usability evidence, and rationale',
          'before/after artifact evidence, peer critique signal, usability cue, and design reason',
          'artifact annotation, research or test observation, revision decision, and rationale',
          'prototype change, user-evidence detail, critique response, and iteration boundary',
          'portfolio-ready artifact evidence, feedback cue, design choice, and next-step note',
          'wireframe or prototype revision, supporting user signal, and defensible design rationale',
        ]),
        qualityFocus: lessonVariant(lesson, [
          'artifact specificity, usability evidence, design reasoning, and iteration quality',
          'traceable user evidence, critique uptake, rationale clarity, and design-change quality',
          'prototype fit, evidence use, decision defensibility, and next-iteration readiness',
          'visible UX artifact change, research grounding, feedback response, and rationale quality',
        ]),
        reviewProtocol: lessonVariant(lesson, [
          'compare the before/after artifact, inspect critique evidence, and require one named next iteration',
          'mark what changed in the artifact, cite the user signal, and name the next test or critique question',
          'review the prototype against user evidence, identify the weakest rationale link, and revise it',
          'trace the critique note into the visible design change, then require one defensible next move',
        ]),
        commonFailure: 'students describe design intentions without changing or testing the artifact',
      },
      'analysis-log': {
        outputFormat: 'analysis log, worksheet, dataset note, or instrument revision',
        evidenceRequirement:
          'data choice, method decision, observation, calculation, or instrument change tied to the claim',
        qualityFocus: 'method fit, evidence traceability, limitation language, and interpretation accuracy',
        reviewProtocol: lessonVariant(lesson, [
          'trace the evidence step by step, verify the method choice, and ask for one limitation or correction',
          'check the data or observation trail, test whether the method fits the question, and mark one claim that needs qualification',
          'reconstruct the analysis from the recorded evidence, challenge the interpretation, and require one corrected or bounded conclusion',
          'inspect the instrument, calculation, or coding decision, confirm what supports the claim, and identify the strongest remaining uncertainty',
          'follow one result back to its source evidence, compare it with an alternative explanation, and revise the conclusion where needed',
          'audit the method decision and evidence trail, then add one limitation that changes how the result should be interpreted',
        ]),
        commonFailure: 'students complete procedures without explaining why the evidence supports the conclusion',
      },
      'music-interval-analysis': {
        outputFormat:
          'interval-classification sheet, annotated notation response, listening-identification log, or inversion analysis',
        evidenceRequirement:
          'the written or heard pitch endpoints, inclusive letter-name count, semitone check, generic number, quality, and any simple-interval reduction or inversion rule used',
        qualityFocus:
          'pitch-spelling accuracy, inclusive counting, semitone verification, number-and-quality agreement, and a correction trace for any misclassified interval',
        reviewProtocol:
          'verify the pitch endpoints, recalculate the generic number and semitone span, test the quality label, and require one corrected classification with its reasoning',
        commonFailure:
          'students name an interval from semitone count alone without checking letter spelling, generic number, or the required inversion-quality exchange',
      },
      'engineering-design-test': {
        outputFormat:
          'engineering prototype, CAD or schematic note, test report, tradeoff matrix, failure analysis, redesign log, verification memo, or fabrication record',
        evidenceRequirement:
          'design requirement, constraint or tolerance, prototype or model decision, test setup, measurement data, failure or margin analysis, safety consideration, and redesign rationale',
        qualityFocus:
          'requirement fit, technical reasoning, test validity, measurement quality, failure diagnosis, safety or tolerance risk, tradeoff reasoning, and verification readiness',
        reviewProtocol:
          'compare the prototype or model to the requirement, inspect the test setup and measurement data, diagnose one failure mode or margin, check safety or tolerance risk, and require a redesign or verification decision',
        commonFailure:
          'students display a prototype without proving which requirement it meets, how it was tested, what failed, or why the redesign is justified',
      },
      'financial-analysis-report': {
        outputFormat:
          'journal-entry worksheet, ledger or trial-balance review, financial statement analysis, ratio-analysis memo, cash-flow forecast, budget variance report, cost-volume-profit analysis, valuation model, or control-review note',
        evidenceRequirement:
          'source transaction or statement line, account classification, calculation or model trace, statement or cash-flow effect, assumption or control check, interpretation, and decision consequence',
        qualityFocus:
          'source-document fit, account classification, statement linkage, calculation accuracy, assumption or control validity, ratio or variance interpretation, and decision usefulness',
        reviewProtocol:
          'trace the source document or statement line, verify the account classification and calculation, check the statement or cash-flow effect, inspect the assumption or control, and require a financial interpretation tied to the decision',
        commonFailure:
          'students submit calculations, entries, or ratios without source evidence, statement linkage, assumption/control checks, or decision interpretation',
      },
      'economic-analysis-brief': {
        outputFormat:
          'economic analysis brief, supply-demand diagram, elasticity memo, welfare analysis, tax-incidence note, market-failure review, comparative-statics explanation, or macro-policy effect note',
        evidenceRequirement:
          'market context, actors, assumptions, model or diagram evidence, calculation trace when relevant, incentive or welfare effect, comparative-static or policy effect, limitation, and economic decision',
        qualityFocus:
          'model fit, assumption clarity, diagram or calculation accuracy, incentive reasoning, welfare or distributional interpretation, limitation language, and decision usefulness',
        reviewProtocol:
          'check the market definition and assumptions, inspect the model or calculation, trace the comparative-static effect, test incentive or welfare reasoning, and require a revised economic decision with a named limitation',
        commonFailure:
          'students state an opinion or final answer without showing the economic model, assumptions, incentives, welfare effects, or decision limit',
      },
      'ethical-argument-brief': {
        outputFormat:
          'ethical argument brief, argument map, dilemma analysis, normative framework comparison, objection/reply memo, thought-experiment response, case-application judgment, or moral reasoning portfolio entry',
        evidenceRequirement:
          'moral issue, affected parties, value conflict, normative framework, claim, reasons, objection, reply, case evidence, decision limit, and revised moral judgment',
        qualityFocus:
          'claim clarity, framework fit, reason support, objection strength, reply quality, stakeholder sensitivity, case application, and judgment revision',
        reviewProtocol:
          'check the moral issue and framework, trace claim and reasons, test a serious objection or counterexample, inspect the reply, and require a revised judgment with a named limit',
        commonFailure:
          'students state personal opinion or broad values without mapping reasons, applying a framework, answering objections, or naming the limit of the judgment',
      },
      'data-science-notebook': {
        outputFormat:
          'analytics notebook, data-cleaning log, visualization, dashboard, model evaluation, model card, data story, or bias-audit note',
        evidenceRequirement:
          'dataset provenance, cleaning or transformation decision, notebook output, visualization or model evidence, validation metric, interpretation, and bias or limitation check',
        qualityFocus:
          'data integrity, reproducibility, visualization or model fit, validation evidence, interpretation accuracy, bias or fairness reasoning, and decision usefulness',
        reviewProtocol:
          'inspect the dataset source and cleaning steps, run or review the notebook output, compare the validation metric to the claim, check one bias or limitation risk, and require a revised analytic conclusion',
        commonFailure:
          'students present a polished chart or model result without proving data provenance, cleaning choices, validation, interpretation limits, or bias risk',
      },
      'data-story-portfolio': {
        outputFormat:
          'source ledger, data-cleaning log, annotated chart set, uncertainty note, accessibility check, data-story sequence, or revision memo',
        evidenceRequirement:
          'source provenance, documented transformation, claim-to-chart fit, visual-encoding rationale, uncertainty boundary, accessibility check, audience consideration, and visible revision',
        qualityFocus:
          'source integrity, transformation transparency, visual honesty, uncertainty communication, accessibility, audience fit, and revision quality',
        reviewProtocol:
          'trace the claim to its source and transformation record, inspect the visual encoding and scale, test the uncertainty and accessibility notes, and require one visible portfolio revision',
        commonFailure:
          'students publish a persuasive chart or narrative without an inspectable source ledger, cleaning record, uncertainty boundary, accessibility check, or revision trail',
      },
      'statistical-inference-report': {
        outputFormat:
          'statistical inference report, hypothesis-test write-up, confidence-interval interpretation, assumption-check memo, p-value explanation, regression-inference memo, or statistical decision brief',
        evidenceRequirement:
          'research question, variable or parameter, sample context, assumption check, calculation or software output, confidence interval or test statistic, p-value or effect size when relevant, interpretation, and limitation',
        qualityFocus:
          'question fit, assumption validity, calculation or output accuracy, uncertainty interpretation, effect size reasoning, limitation language, and decision usefulness',
        reviewProtocol:
          'check the question, variable or parameter, and sample; inspect assumptions; verify the interval, test statistic, p-value, effect size, or software output; and require an interpretation with uncertainty and limitation language',
        commonFailure:
          'students report formulas, p-values, or statistical significance without assumptions, uncertainty, practical interpretation, effect size, or limitations',
      },
      'source-evaluation-dossier': {
        outputFormat:
          'source-evaluation dossier, research log, database-search strategy, annotated bibliography, citation-trail map, synthesis matrix, or source-use plan',
        evidenceRequirement:
          'research question, database or catalog choice, search string and filter decision, source authority, relevance and credibility evidence, citation-trail note, synthesis relationship, attribution plan, and source-use decision',
        qualityFocus:
          'search strategy fit, source authority, relevance, credibility, citation-trail reasoning, synthesis usefulness, attribution integrity, and source-use judgment',
        reviewProtocol:
          'inspect the search strategy and database choice, verify the source authority and relevance, follow one citation trail, compare sources in the synthesis matrix, and require a revised source-use decision with attribution notes',
        commonFailure:
          'students list sources or summaries without showing how the search was built, why sources are credible and relevant, how sources connect, or how attribution will be handled',
      },
      'teaching-plan-portfolio': {
        outputFormat:
          'lesson plan, unit plan, microteaching demonstration, student-work analysis, formative-assessment plan, differentiation plan, classroom-management note, reteach plan, or reflective teaching portfolio',
        evidenceRequirement:
          'learning target, standard or objective alignment, instructional move, student-work or formative-assessment evidence, differentiation or accessibility support, classroom feasibility cue, feedback response, and revised instructional decision',
        qualityFocus:
          'target-task alignment, student evidence, pedagogical reasoning, differentiation, classroom feasibility, formative feedback, and reteach readiness',
        reviewProtocol:
          'check the learning target and standard, compare the task to student evidence, inspect formative assessment and differentiation, test classroom feasibility, and require a revised teaching move or reteach decision',
        commonFailure:
          'teacher candidates submit a polished lesson narrative without student evidence, target-task alignment, differentiation, formative assessment, or a defensible reteach decision',
      },
      'case-conceptualization': {
        outputFormat:
          'case conceptualization, intake note, process recording, helping-skills transcript, safety plan, service plan, referral note, treatment-plan rationale, or supervision reflection',
        evidenceRequirement:
          'client context, stated concern, observable helping response, client-goal evidence, empathy or reflection evidence, risk/safety cue, ethics or boundary note, supervision feedback, referral rationale, and revised helping response decision',
        qualityFocus:
          'client-centered evidence, active listening, helping-skill fit, ethics and boundaries, risk recognition, cultural humility, referral reasoning, supervision uptake, and next-response readiness',
        reviewProtocol:
          'check client context and goals, inspect the exact helping response, code listening or reflection evidence, verify risk/safety and ethics boundaries, compare referral options, and require a revised helping response or service decision',
        commonFailure:
          'students write broad empathy reflections without client-specific evidence, observable helping skills, risk or ethics reasoning, supervision feedback, or referral rationale',
      },
      'lab-report': {
        outputFormat: 'lab notebook entry, protocol log, data table, analysis note, or concise lab report',
        evidenceRequirement:
          'safety or protocol check, controlled variable or specimen evidence, recorded observation, data interpretation, and limitation',
        qualityFocus: 'procedural accuracy, data integrity, safety reasoning, variable control, and conclusion limits',
        reviewProtocol:
          'verify the protocol step, inspect the notebook evidence or data table, check safety and variable controls, and require one corrected interpretation',
        commonFailure:
          'students report that the procedure was completed without preserving raw observations, safety checks, or limits on the conclusion',
      },
      'problem-set': {
        outputFormat: 'worked problem set, solution trace, graph/equation annotation, or proof rationale',
        evidenceRequirement:
          'setup choice, equation or representation, intermediate reasoning, answer check, and error or limitation note',
        qualityFocus:
          'mathematical setup, step-by-step reasoning, representation accuracy, answer verification, and error analysis',
        reviewProtocol:
          'inspect the setup, trace each solution step, compare alternate representations, and require one corrected or verified step',
        commonFailure:
          'students submit final answers without showing the setup, reasoning path, verification, or error diagnosis',
      },
      'proof-portfolio': {
        outputFormat:
          'theorem proof, lemma proof, counterexample analysis, definition map, proof critique, formal proof note, or proof revision portfolio',
        evidenceRequirement:
          'precise definition, hypotheses, claim, proof strategy, justified logical steps, counterexample or edge-case check, notation choice, and revision rationale',
        qualityFocus:
          'definition use, hypothesis tracking, quantifier precision, logical validity, proof strategy, counterexample reasoning, notation clarity, and revision quality',
        reviewProtocol:
          'check definitions and hypotheses, trace each implication, test boundary cases or counterexamples, inspect notation, and require one revised proof step with justification',
        commonFailure:
          'students present intuition, symbolic manipulation, or a final theorem statement without justified proof steps, hypothesis checks, counterexample testing, or revision evidence',
      },
      'capstone-project': {
        outputFormat: 'project charter, milestone brief, implementation plan, portfolio defense, or showcase artifact',
        evidenceRequirement:
          'sponsor or stakeholder need, integrated source evidence, project decision, risk or constraint, milestone status, and revision commitment',
        qualityFocus:
          'project coherence, stakeholder fit, integration across course concepts, feasibility, risk management, and defense readiness',
        reviewProtocol:
          'inspect the milestone evidence, compare it to sponsor constraints and success criteria, identify the highest implementation risk, and require a next-milestone revision',
        commonFailure:
          'students describe project progress without proving the decision, constraint, risk, or next milestone with evidence',
      },
      'competency-evidence': {
        outputFormat:
          'competency checklist, standards-aligned performance task, evidence portfolio, calibration note, or remediation plan',
        evidenceRequirement:
          'target competency, observable performance evidence, benchmark descriptor, assessor calibration note, proficiency decision, and reassessment or extension step',
        qualityFocus:
          'standards alignment, evidence sufficiency, calibrated proficiency judgment, feedback precision, remediation fit, and reassessment readiness',
        reviewProtocol:
          'map evidence to the competency descriptor, compare it against the benchmark, calibrate the proficiency decision, and require a remediation or extension step',
        commonFailure:
          'students list completed activities without showing observable evidence, benchmark alignment, calibration, or reassessment planning',
      },
      'creative-portfolio': {
        outputFormat:
          'creative draft, craft annotation, workshop response, process journal, artist statement, or revision portfolio',
        evidenceRequirement:
          'specific craft choice, draft evidence, critique note, revision decision, audience effect, and portfolio reflection',
        qualityFocus:
          'craft intentionality, visible revision, critique uptake, audience effect, risk-taking, and portfolio coherence',
        reviewProtocol:
          'read or view the draft closely, identify the craft move, compare critique notes to the revision, and require one targeted next draft decision',
        commonFailure:
          'students describe inspiration or feelings without showing the craft choice, critique evidence, or revision change',
      },
      'case-analysis': {
        outputFormat:
          'case analysis memo, executive recommendation, stakeholder tradeoff table, decision criteria brief, or implementation-risk note',
        evidenceRequirement:
          'case facts, exhibit evidence, stakeholder tradeoffs, decision criteria, strategic recommendation, and implementation risk',
        qualityFocus:
          'case specificity, tradeoff reasoning, defensible recommendation, audience fit, financial or operational implication, and implementation realism',
        reviewProtocol:
          'check the recommendation against case facts and exhibits, test it against at least one alternative, inspect stakeholder tradeoffs, and require one implementation-risk revision',
        commonFailure:
          'students summarize the case or choose an attractive option without decision criteria, tradeoff evidence, or implementation risk',
      },
      'legal-analysis': {
        outputFormat:
          'case brief, rule synthesis chart, issue-spotting response, IRAC memo, precedent map, or hypothetical application',
        evidenceRequirement:
          'material facts, procedural posture or legal context, holding, rationale, rule statement, doctrinal limit, and application to a new fact pattern',
        qualityFocus:
          'rule accuracy, holding/rationale distinction, precedent use, issue spotting, fact-sensitive application, counterargument, and doctrinal limits',
        reviewProtocol:
          'check the rule against the case holding and rationale, test it with a hypothetical or counterexample, inspect distinguishing facts, and require one revised application paragraph',
        commonFailure:
          'students summarize the case without extracting the rule, distinguishing the rationale, or applying doctrine to a new fact pattern',
      },
      'close-reading-analysis': {
        outputFormat:
          'close-reading memo, passage annotation, scene analysis, context note, interpretive portfolio, or source-integrity rationale',
        evidenceRequirement:
          'specific passage, scene, form, source, translation, or context evidence; bounded interpretive claim; counter-reading or source limit; and revision move',
        qualityFocus:
          'evidence specificity, claim arguability, context restraint, source integrity, counter-interpretation, and revision of the reading',
        reviewProtocol:
          'check the claim against the passage or source evidence, test one counter-reading or context boundary, and require a revised interpretive sentence or paragraph',
        commonFailure:
          'students summarize the text, film, or context without proving how specific evidence supports an arguable interpretation',
      },
      'field-evidence': {
        outputFormat: 'field note, stakeholder map, implementation memo, or community-facing recommendation',
        evidenceRequirement:
          'local observation, stakeholder evidence, implementation constraint, and equity or feasibility check',
        qualityFocus: 'local grounding, stakeholder fit, equity reasoning, and feasible action',
        reviewProtocol:
          'separate observed evidence from assumptions, check who is represented, and require one locally grounded revision',
        commonFailure: 'students write broad reflection without enough field or stakeholder evidence',
      },
      'literature-synthesis': {
        outputFormat: 'literature matrix, source synthesis, gap statement, or annotated evidence table',
        evidenceRequirement:
          'source claim, comparison point, gap or limitation, and implication for the assigned artifact',
        qualityFocus: 'source accuracy, synthesis across sources, gap logic, and attribution integrity',
        reviewProtocol:
          'check every claim against the source list, compare at least two sources, and revise the gap statement',
        commonFailure: 'students summarize sources one by one without making a synthesis decision',
      },
      'memo-brief': {
        outputFormat: 'focused memo, brief, rationale, or recommendation document',
        evidenceRequirement: 'clear claim, source evidence, decision logic, limitation, and recommended next step',
        qualityFocus: 'claim clarity, evidence quality, decision logic, audience fit, and revision use',
        reviewProtocol: 'read for claim-evidence-fit, mark one weak reasoning link, and require a targeted revision',
        commonFailure: 'students make a recommendation that is polished but under-evidenced',
      },
      'checkpoint-response': {
        outputFormat: 'short checkpoint, quiz response, worksheet, or test-selection answer',
        evidenceRequirement:
          'selected answer or short response plus reasoning, misconception check, and correction path',
        qualityFocus: 'concept accuracy, retrieval strength, explanation quality, and readiness for the next artifact',
        reviewProtocol:
          'compare the response with the answer rationale, correct the weakest explanation, and submit the revised reasoning',
        commonFailure: 'students choose an answer without explaining the reasoning or correcting the misconception',
      },
      'language-performance': {
        outputFormat:
          'dialogue, oral recording, interpretive response, presentational script, cultural comparison, or language portfolio entry',
        evidenceRequirement:
          'target-language sample, meaning/comprehension evidence, accuracy or pronunciation focus, cultural-context choice, and feedback-based revision',
        qualityFocus:
          'comprehensibility, communicative function, language accuracy, cultural fit, confidence, and revised target-language use',
        reviewProtocol:
          'listen to or read the language sample, check meaning and accuracy against the communicative purpose, give one focused recast, and require a revised utterance or script',
        commonFailure:
          'students complete grammar or vocabulary drills without proving they can use the language to communicate meaning',
      },
      'linguistic-data-analysis': {
        outputFormat:
          'annotated language-data table, transcription, paradigm, tree, corpus note, or analysis memo with a source locator and revision trace',
        evidenceRequirement:
          'exact form or transcription, gloss or structural annotation, source locator, explicit analysis step, competing explanation or counterexample, and a bounded conclusion',
        qualityFocus:
          'data fidelity, notation accuracy, structural reasoning, alternative-analysis testing, source traceability, and disciplined generalization',
        reviewProtocol:
          'verify the language record first, trace each analysis step to visible data, test one competing explanation or counterexample, and revise any claim that exceeds the records',
        commonFailure:
          'students repeat linguistic terminology without preserving the data record, showing the analysis, or limiting the generalization',
      },
      'performance-rehearsal': {
        outputFormat:
          'monologue, scene run, choreography phrase, score performance, rehearsal journal, performance recording, or critique-response note',
        evidenceRequirement:
          'observable performance attempt, technique or interpretive choice, rehearsal note, critique uptake, revised run, and next rehearsal cue',
        qualityFocus:
          'technique accuracy, artistic intention, ensemble awareness, critique uptake, performance presence, and revision visibility',
        reviewProtocol:
          'watch or listen to the performance evidence, name the technique or interpretive choice, compare notes to the revised run, and require one next rehearsal decision',
        commonFailure:
          'students describe performance intentions without showing the rehearsal evidence, critique uptake, or revised performance choice',
      },
      presentation: {
        outputFormat: 'brief presentation, slide, pitch, or spoken explanation with support notes',
        evidenceRequirement:
          'clear audience claim, organized evidence, visual or spoken support, and response to feedback',
        qualityFocus: 'audience fit, evidence organization, clarity, timing, and response to questions',
        reviewProtocol:
          'rehearse with a timing and evidence checklist, capture peer questions, and revise one slide or speaking move',
        commonFailure: 'students present polished slides that do not make the evidence decision visible',
      },
      'reflection-response': {
        outputFormat: 'reflection, discussion post, journal entry, or short response',
        evidenceRequirement: 'specific experience or source evidence, named learning move, limitation, and next action',
        qualityFocus: 'specificity, metacognition, evidence connection, and actionable transfer',
        reviewProtocol: 'ask for one concrete evidence detail, one feedback-based change, and one next-use commitment',
        commonFailure: 'students write general feelings without tying them to source evidence or transfer',
      },
      'applied-artifact': {
        outputFormat: 'course-specific applied artifact with evidence and revision trace',
        evidenceRequirement:
          'source evidence, visible decision, success criteria, limitation, and feedback-informed revision',
        qualityFocus: 'concept accuracy, evidence specificity, decision logic, and revision quality',
        reviewProtocol: lessonVariant(lesson, [
          'check the artifact against success criteria, identify one missing evidence link, and require revision',
          'compare the artifact with the success criteria, mark the weakest evidence link, and revise it',
          'review the artifact for criteria fit, evidence visibility, and one required improvement',
          'use the criteria to locate one unsupported claim or limitation, then revise before submission',
        ]),
        commonFailure: 'students complete the task format without making the evidence decision inspectable',
      },
    }[genre];
    const details =
      genre === 'statistical-inference-report'
        ? statisticalArtifactDetailsForOperation(lesson, baseDetails)
        : baseDetails;

    const feedbackRoutine =
      modalityDecode?.feedbackRoutine ||
      profile?.teachingPattern?.feedbackRoutine ||
      'criterion-level feedback and one required revision';
    const checkpointOutput = lessonVariant(lesson, [
      'brief selected-answer checkpoint with a written rationale and correction note',
      'short quiz explanation that diagnoses one misconception and records the repaired reasoning',
      'compact worksheet response showing the chosen method, evidence cue, and next-study move',
      'test-selection analysis with a defensible answer, distractor check, and revision trace',
      'retrieval response that pairs the answer with its rationale and one transfer question',
      'concept-check record containing the decision, supporting evidence, correction, and follow-up practice',
    ]);
    const checkpointCycle = [
      'Keep the evidence for the selected answer visible.',
      'Make the corrected reasoning usable in later study.',
      'Include the boundary that prevents the same error next time.',
    ][Math.floor(lessonRotationIndex(lesson) / 6) % 3];
    const { evidenceRequirement, qualityFocus, reviewProtocol, commonFailure } = details;

    return {
      genre,
      label: sentenceCase(genre.replace(/-/g, ' ')),
      outputFormat:
        genre === 'checkpoint-response'
          ? `${artifact}: quiz response format — ${checkpointOutput}. ${checkpointCycle}`
          : `${artifact}: ${
              genre === 'statistical-inference-report' ? details.primaryOutputFormat : details.outputFormat
            }`,
      evidenceRequirement: `For ${artifact}, require ${evidenceRequirement} about ${concept}.`,
      evidenceStandard: `Strong ${artifact} work makes ${evidenceRequirement} inspectable for ${concept}.`,
      qualityFocus:
        genre === 'applied-artifact'
          ? lessonVariant(lesson, [
              `concept accuracy, evidence specificity, decision logic, and revision quality for ${artifact}`,
              `accurate use of ${concept}, inspectable evidence, clear decision logic, and a visible revision trail for ${artifact}`,
              `${artifact} quality depends on precise concept use, source-grounded reasoning, and feedback-informed improvement`,
              `review ${artifact} for source evidence, decision clarity, limitation language, and revision follow-through`,
            ])
          : genre === 'checkpoint-response'
            ? lessonVariant(lesson, [
                `concept accuracy, retrieval strength, explanation quality, and readiness for the next artifact in ${artifact}`,
                `accurate use of ${concept}, corrected reasoning, transfer readiness, and a clear next-study move for ${artifact}`,
                `${artifact} should show the selected answer, why it holds, what misconception was avoided, and what students should practice next`,
                `review ${artifact} for defensible reasoning, correction of inaccurate claims, and evidence that students can transfer the concept forward`,
              ])
            : qualityFocus
                .split(/,\s*/)
                .map((focus) => `${artifact}: ${focus}`)
                .join('; '),
      reviewProtocol: `${reviewProtocol} for ${stripLessonPrefix(lesson.title)}.`,
      commonFailure,
      revisionMove: lessonVariant(lesson, [
        `Revise ${artifact} by strengthening one ${concept} evidence link. Name what feedback changed. Use this routine: ${ensureSentenceCompiler(conciseClause(feedbackRoutine, feedbackRoutine, 150))}`,
        `After feedback, return to ${artifact} and name what changed. Make the weakest ${concept} evidence link inspectable. Use this routine: ${ensureSentenceCompiler(conciseClause(feedbackRoutine, feedbackRoutine, 150))}`,
        `Use this routine to revise ${artifact}: ${ensureSentenceCompiler(conciseClause(feedbackRoutine, feedbackRoutine, 150))} State what feedback changed. Name the ${concept} claim that now has better support.`,
        `For ${artifact}, convert feedback into one visible ${concept} revision. Identify what changed. Then point to the evidence link that improved.`,
      ]),
      modalityFit: `This ${genre} should be reviewed through the course practice pattern, not as a generic submission.`,
    };
  }

  return { buildArtifactGenreDecode };
}
