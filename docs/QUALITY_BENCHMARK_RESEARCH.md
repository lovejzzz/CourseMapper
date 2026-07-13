# Research basis for CourseMapper quality benchmark v1

Research frozen: 2026-07-13
Purpose: define a defensible, useful, and falsifiable evaluation system for generated higher-education course materials and matched model comparisons.

This is a design evidence review, not a claim that CourseMapper, its rubric, or its outputs are certified by any cited organization. The benchmark adapts ideas from the sources below to CourseMapper's artifact and release context.

## Research question

What evidence and protocol are needed to interpret a CourseMapper score as a bounded statement about the inspected materials, while preventing deterministic proxies, model judgments, or internal review from being mistaken for independent instructor validation or classroom outcomes?

The work combined five literatures:

1. educational measurement, validity, reliability, fairness, and reporting;
2. higher-education course design, alignment, assessment, inclusion, and accessibility;
3. dataset and benchmark documentation, leakage, and evaluation governance;
4. LLM-as-judge bias and human/model preference evaluation;
5. paired statistical comparison and uncertainty reporting.

## Authoritative evidence

### Validity is an argument about interpretation and use

The _Standards for Educational and Psychological Testing_ organize quality around validity, reliability/precision, and fairness, and treat validity as evidence supporting a proposed interpretation and use—not a permanent property of a number. The Standards are available from the joint AERA/APA/NCME site: [open-access Standards](https://www.testingstandards.net/open-access-files.html) and [2014 edition PDF](https://www.testingstandards.net/uploads/7/6/6/4/76643089/standards_2014edition.pdf).

The open fifth edition of NCME's _Educational Measurement_ separately treats validity, reliability, fairness, score reporting, performance assessment, accessibility, and technology-enhanced assessment. That separation supports a profile rather than one opaque “quality” factor: [NCME Educational Measurement](https://ncme.org/resources/books/educational-measurement/), [reliability chapter](https://ncme.org/wp-content/uploads/2026/01/Educational-Measurement-Fifth-Edition-Chapter-05.pdf), [fairness chapter](https://ncme.org/wp-content/uploads/2026/01/Educational-Measurement-Fifth-Edition-Chapter-06.pdf), and [accessibility chapter](https://ncme.org/wp-content/uploads/2026/01/Educational-Measurement-Fifth-Edition-Chapter-14.pdf).

Messick's unified account connects score meaning, use, values, and consequences. For CourseMapper this means “high quality” is incomplete unless the report states the decision it supports and the consequences of a false positive: [ETS report page](https://www.ets.org/research/policy_research_reports/publications/report/1993/hxne.html).

**Implication:** v1 names its construct, intended uses, and out-of-scope claims. It reports coverage, evidence class, confidence, caps, profiles, and critical failures alongside any aggregate.

### Reliability requires a design, rater population, and uncertainty

The GRRAS guideline calls for transparent reliability/agreement study design, rater population and training, sample selection, statistical methods, and uncertainty: [Guidelines for Reporting Reliability and Agreement Studies](https://www.equator-network.org/reporting-guidelines/guidelines-for-reporting-reliability-and-agreement-studies-grras-were-proposed/).

Krippendorff's alpha can support multiple raters, missing ratings, and ordinal distance when implemented for the declared measurement level. The R Journal treatment documents those properties and implementation considerations: [Measuring Agreement Using Krippendorff's Alpha](https://journal.r-project.org/articles/RJ-2021-046/).

**Implication:** v1 keeps every pre-adjudication criterion rating, uses explicit non-score states, reports ordinal alpha with a case-resampled bootstrap interval, and also reports exact and adjacent agreement. The alpha threshold is a policy decision, not a natural law.

### Course quality is multidimensional and essential criteria do not compensate

Quality Matters' Higher Education Rubric has eight general standards, specific review standards, essential standards, and a two-part course-certification rule. It explicitly evaluates course design rather than delivery or learner outcomes: [QM Higher Education Rubric](https://www.qualitymatters.org/qa-resources/rubric-standards/higher-ed-rubric) and [public standards summary PDF](https://www.qualitymatters.org/sites/default/files/PDFs/StandardsfromtheQMHigherEducationRubric.pdf).

OSCQR is a formative, non-evaluative course-design review system spanning course overview, technology/tools, design/layout, content/activities, interaction, and assessment/feedback: [SUNY OSCQR](https://oscqr.suny.edu/).

Carnegie Mellon's teaching guidance states the alignment relationship among learning objectives, assessments, and instructional activities and provides an operational basis for observable objectives: [alignment](https://www.cmu.edu/teaching/assessment/basics/alignment.html) and [learning objectives](https://www.cmu.edu/teaching/designteach/design/learningobjectives.html). Its inclusive-assessment guidance supports examining how assessment conditions interact with student variability: [inclusive assessment strategies](https://www.cmu.edu/teaching/designteach/teach/classroomclimate/strategies/designassessment.html).

AAC&U's VALUE work treats rubric assessment as an argument-based system developed and used across institutions, not a generic keyword checklist: [On Solid Ground](https://eric.ed.gov/?id=ED596333).

**Implication:** v1 has nine dimensions, 26 observable core criteria, 23 specialized deliverable/package rubrics, non-compensable failure caps, and a bidirectional objective-assessment trace. It does not label its automated proxy “QM alignment.”

### Accessibility combines testable conformance and human judgment

WCAG 2.2 defines testable success criteria and conformance requirements while noting that even high conformance does not address every possible user need: [WCAG 2.2](https://www.w3.org/TR/WCAG22/).

CAST's UDL Guidelines 3.0 emphasize multiple means of engagement, representation, and action/expression, with attention to learner agency: [About UDL Guidelines 3.0](https://udlguidelines.cast.org/more/about-guidelines-3-0/).

**Implication:** v1 separates machine-testable export checks from human inspection of meaningful alternatives and construct equivalence. “No automated finding” cannot be reported as accessibility certification.

### AI evaluation needs transparent TEVV and human oversight

NIST's AI RMF Core calls for valid and reliable evaluation, documentation of limits and generalization, testing/evaluation/verification/validation, and human oversight. The Generative AI Profile applies the framework to generative systems: [AI RMF Core](https://airc.nist.gov/airmf-resources/airmf/5-sec-core/) and [Generative AI Profile](https://www.nist.gov/publications/artificial-intelligence-risk-management-framework-generative-artificial-intelligence). NIST's GenAI pilot further demonstrates multi-method text-to-text evaluation rather than reliance on one opaque score: [2024 NIST GenAI Pilot Study](https://www.nist.gov/publications/2024-nist-genai-pilot-study-text-text-evaluation-overview-and-results).

**Implication:** exact model revisions, prompts, configurations, compiler versions, inputs, outputs, failure paths, costs, latencies, and review evidence are first-class benchmark records.

### Model judges have predictable biases and cannot manufacture human evidence

MT-Bench/Chatbot Arena documented position, verbosity, self-enhancement, and reasoning limitations in LLM judging while showing that model judgments can sometimes agree with human preferences: [Judging LLM-as-a-Judge](https://arxiv.org/abs/2306.05685).

Length-controlled AlpacaEval demonstrates that response length can confound automatic preference evaluation and proposes explicit control: [Length-Controlled AlpacaEval](https://arxiv.org/abs/2404.04475). Independent work further analyzes position bias: [Position Bias in LLM-based Evaluation](https://arxiv.org/abs/2406.07791). CoBBLer documents a broader set of cognitive biases in LLM evaluators: [ACL Findings paper](https://aclanthology.org/2024.findings-acl.29/). Human-centered judge research argues that alignment to human criteria and viewpoints must be evaluated explicitly: [HuCLLM paper](https://aclanthology.org/2024.hucllm-1.2/).

Prediction-powered ranking work shows why a small amount of human data can be used to correct model-assisted evaluation rather than treating model ranks as human ranks: [Prediction-Powered Ranking of Large Language Models](https://openreview.net/forum?id=7V62sQ5Jra). Statistical work on Chatbot Arena emphasizes ties and uncertainty in pairwise rankings: [Statistical Framework for Chatbot Arena](https://openreview.net/forum?id=rAoEub6Nw2).

**Implication:** v1 model-judge reviews are capped as provisional. A paired model judge must see both A/B orders; position-sensitive cases are inconclusive. Model judgments can be calibrated per dimension against held-out human judgments, but never relabeled as human.

### Transparent datasets and leakage controls are part of validity

HELM argues for transparent scenarios, metrics, prompts, completions, and broad evaluation rather than selective headline results: [Holistic Evaluation of Language Models](https://arxiv.org/abs/2211.09110).

Data Cards and Datasheets motivate structured documentation of provenance, collection, composition, intended use, maintenance, and limitations: [Data Cards](https://research.google/pubs/data-cards-purposeful-and-transparent-dataset-documentation-for-responsible-ai/) and [Datasheets for Datasets](https://arxiv.org/abs/1803.09010).

Benchmark-leakage research shows that contamination can undermine apparent benchmark performance and motivates explicit transparency artifacts: [Benchmark Transparency Cards](https://arxiv.org/abs/2404.18824).

**Implication:** v1 uses immutable source hashes, permission records, dev/calibration/held-out splits, adversarial conditions, exposure labels, an explicit held-out unlock, access records, contamination declarations, and a recommendation for externally sealed confirmatory cases.

### Paired comparisons should preserve effects, uncertainty, ties, and operations

Demšar recommends paired nonparametric comparisons across datasets for two algorithms and appropriate multi-algorithm procedures rather than repeated uncorrected per-dataset significance tests: [JMLR paper](https://jmlr.org/papers/v7/demsar06a.html).

Bootstrap confidence intervals are widely used for NLP system comparisons and can be reported over paired units: [LREC paper on bootstrap confidence intervals](https://aclanthology.org/2022.lrec-1.640.pdf).

**Implication:** v1's primary reusable comparison report includes paired candidate-minus-control mean and median effects with case/trial-resampled bootstrap intervals, qualified-human wins/losses/ties, effective win rate with a Wilson interval, by-deliverable and by-dimension effects, and matched cost/latency/call/failure summaries. It does not use a p-value as a substitute for practical effect or corpus scope.

### Source, rights, privacy, and integrity must be inspectable

Creative Commons recommends TASL-style attribution—title, author, source, and license—where applicable: [CC attribution practices](https://wiki.creativecommons.org/wiki/Recommended_practices_for_attribution). Crossref and the DOI Foundation document authoritative metadata and persistent-identifier handling: [Crossref metadata retrieval](https://www.crossref.org/documentation/retrieve-metadata/) and [DOI Handbook](https://www.doi.org/the-identifier/resources/handbook/).

The International Center for Academic Integrity identifies honesty, trust, fairness, respect, responsibility, and courage as fundamental values: [ICAI fundamental values](https://www.academicintegrity.org/). UNESCO's guidance for generative AI in education emphasizes human-centered, age-appropriate, privacy-aware governance: [UNESCO guidance](https://www.unesco.org/en/articles/guidance-generative-ai-education-and-research) and [Recommendation on the Ethics of AI](https://www.unesco.org/en/artificial-intelligence/recommendation-ethics).

**Implication:** fabricated sources, rights/privacy breaches, unsafe guidance, and undisclosed material assumptions are non-compensable failures. A strong layout score cannot offset them.

## Evidence, design judgments, and assumptions

The following ledger prevents research citations from being used as decoration for local choices.

### Evidence supported by the literature

- Validity concerns a proposed score interpretation and use; it must be supported by multiple forms of evidence.
- Reliability/precision and fairness are distinct from validity but necessary to responsible score use.
- Course design is multidimensional; alignment, assessment, interaction/support, accessibility, materials, and technology are not interchangeable.
- Essential conditions can be non-compensable even when an aggregate threshold is met.
- Automated accessibility checks cannot establish complete accessibility.
- LLM judges exhibit position, length/verbosity, self-preference, and other biases.
- Dataset provenance, intended use, limitations, exposure, and leakage documentation matter to benchmark interpretation.
- Paired observations provide more efficient and interpretable system comparison than unmatched headline averages.

### CourseMapper design judgments

These are reasoned product decisions, not values dictated by the cited sources:

- nine core dimensions with weights totaling 100;
- a 0–4 ordinal criterion scale, with 0/2/4 criterion anchors and justified interpolation for 1/3;
- 60%, 70%, 80%, 90%, and 95% operational score bands;
- critical-failure caps of 59, 69, or 79 according to severity;
- evidence-tier caps of 69 for automated signals, 79 for model judgments, and 89 for one-human or disputed review;
- at least 90% weighted evidence coverage for an independently validated band;
- ordinal Krippendorff alpha of 0.667 with at least 12 commonly rated units as the initial reliability policy;
- two qualified independent domain-matched instructors per validation case;
- four held-out cases and at least three generation trials per case for the initial corpus;
- tie weight of 0.5 in effective pairwise win rate;
- a reported 100 only under exceptionally restrictive held-out, evidence, agreement, source, export, and zero-finding conditions.

Every judgment is versioned and changeable through calibration evidence. None should be described as a universal psychometric standard.

### Assumptions to test during calibration

- Instructors can apply the 26 criteria with acceptable burden after a short anchor exercise.
- The nine dimensions are distinct enough to diagnose different failure modes but coherent enough to support a bounded aggregate index.
- The declared weights match the harm and decision importance instructors assign to dimensions.
- The 0/2/4 examples produce comparable interpretations across disciplines and modalities.
- The initial 13 cases expose enough variation in source fidelity, accessibility, safety, privacy, rights, disciplinary form, professional language instruction, and custom deliverables to find major scorer defects.
- Estimated edit minutes are usable as a secondary outcome when reviewers receive a common definition and record concrete edits.
- The reliability threshold does not reward uniformly shallow ratings or punish legitimate disciplinary variation.
- Public-governed held-out cases remain useful for process checks, while high-confidence model claims will require new externally sealed cases.
- Model-judge calibration transfers only within the evaluated model, prompt, rubric, deliverable family, and source-risk stratum.

## Rejected designs

- **One universal 0–100 AI score:** hides missing evidence, compounds model bias, and can be read as truth.
- **Average all evidence classes together:** lets cheap automated/model ratings dilute or inflate qualified human evidence.
- **Reward output length and rubric keywords:** directly gameable and poorly connected to accuracy or usefulness.
- **Make every failure compensable:** allows polished formatting to offset fabricated sources, unsafe guidance, or invalid assessments.
- **Treat N/A as zero or omit it silently:** confounds inapplicability with failure and changes denominators invisibly.
- **Use only unanimous wins:** discards ties, disagreement, magnitude, and uncertainty.
- **Tune on held-out cases and still call them held-out:** converts confirmatory evidence into development evidence.
- **Fill missing instructor reviews with model or agent reviews:** creates false evidence and is mechanically prohibited.

## Research limitations

- This was a focused design review, not a formal systematic review or meta-analysis.
- Several relevant frameworks publish full rubric content under restricted terms; v1 uses public descriptions and does not reproduce proprietary rubric text.
- No CourseMapper v1 human calibration study has yet been completed. Thresholds and weights are therefore provisional design policy.
- The versioned held-out cases are visible in the repository. The protocol records that limitation and does not describe them as secret.
- Classroom outcome validity will require prospective use, learner/instructor consent where applicable, privacy review, and a separate study design.
