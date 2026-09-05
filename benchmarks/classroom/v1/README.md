# EduTool Classroom Output Benchmark v1

This benchmark asks whether a teacher and learner can use the **materials**, not whether the generator produced valid JSON. It does not import the product quality grader and does not award points for receipts, self-reported coverage or metadata volume. No paid model or server is used.

## Corpus and reproducibility

Three development cases preserve real generation inputs and model kernels: a local Scion proportions lesson, a fictional museum-record workshop, and a fictional experiment-design workshop. Two constructed extension cases change the fraction/class duration and add a second session with a distinct objective. The latter were set aside from the initial three-course inspection; they are a regression holdout, not a permanently unseen evaluation set. All five are small English-language lessons/workshops, so this corpus does **not** establish quality across languages, ages, semester courses or all subjects.

The runner freezes model kernels and regenerates only explicitly compiler-owned fallback surfaces and derivatives. It makes **zero model calls**. This isolates compiler changes from model sampling. Course Map is the captured input artifact; its score will not improve merely because derivatives improve. Full model generation, finalizer behavior, Smart Sync and rendered exports require separate captures. Reports record corpus SHA-256, provenance, checks and exact output files. Do not call a replay a new Scion generation.

```sh
npm run benchmark:outputs
npm run benchmark:outputs -- --out .audit-work/classroom-benchmark/candidate
npm run benchmark:outputs -- --out .audit-work/classroom-benchmark/baseline --regrade
npm run benchmark:outputs -- --strict
npm run benchmark:outputs:test
```

`--strict` fails on any detected defect. The ordinary report command intentionally succeeds with findings so failing outputs remain inspectable. Reports and complete generated artifacts go into ignored `.audit-work/`, never the production bundle. Mutation tests must detect wrong displayed arithmetic with stale verification metadata, missing materials/answers, invalid choice keys, broken clocks/point totals, answer divergence and crowded slides. These are defect probes; their pass percentage is **not** an educational quality score.

## Review rubric: four dimensions, 0–4 each

Review every material separately, with a quoted example and JSON field or exported page/slide. Scores are Codex's reasoned judgments; no independent teacher rating or measured learning gain is implied.

1. **Correctness and evidence:** facts, calculations and keys are correct within the stated source; missing inputs are explicit; no invented resources or institutional rules.
2. **Instructional substance:** content actually teaches the objective, with explanations, suitable practice, useful feedback and an appropriate distinction between rehearsal and transfer.
3. **Usability:** a learner or substitute teacher can act without repairing the directions; scope, workload, language and rendered layout are appropriate.
4. **Alignment and consistency:** objectives, taught examples, tasks, answers, rubric criteria, identifiers and timings agree across materials.

Anchors: **0** unusable or misleading; **1** requires substantial rewriting; **2** useful parts but material teacher preparation remains; **3** usable with small, specific corrections; **4** ready for the stated classroom and source packet after the required checks. A wrong answer, unavailable required source, or contradictory grading requirement prevents a classroom-ready verdict regardless of average. Unknown is recorded as `null`, never zero or an automatic pass. Formatting is unknown until the actual export is rendered and inspected.

## Material-specific acceptance criteria

| Material           | What must be judged beyond field presence                                                                                               | Typical rejection                                                                            |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Course Map         | Observable objectives; distinct lesson progression; explicit links from activity to assessment; feasible scope and resources            | Topic labels repeated as goals; later lessons duplicate earlier tasks                        |
| Syllabus           | Accurate course/session scope; navigable schedule; consistent assessment weights and workload; unconfirmed policies visibly provisional | Single workshop described as a semester; invented dates or grading rules                     |
| Lesson Plans       | Another teacher can run every activity; real inputs and expected responses; clock adds up; feedback tells the teacher what to do next   | “Discuss the evidence” with no evidence, answer or decision rule                             |
| Slide Decks        | Teach one manageable idea at a time; reveal reasoning; useful prompts and notes; legible export and meaningful visuals when needed      | Paragraphs compressed onto slides; steps missing from the visible example                    |
| Assignment Briefs  | Clear product, source packet, task, reasonable extent, submission requirements and success test; achievable from supplied inputs        | Unavailable comparison samples; essay length attached to a short calculation                 |
| Rubrics            | Observable, task-specific evidence at each level; genuinely discriminating bands; points and criteria match the assignment              | “Good analysis” or source-trace language that never specifies the required reasoning         |
| Discussion Prompts | A real reasoning problem; source-backed alternatives where alternatives are warranted; productive follow-ups and response criteria      | Debating whether a verified equation is true; generic three-position templates               |
| Quiz & Exam Bank   | Independently checked keys; complete reference responses; plausible distinct distractors; objective coverage and appropriate demand     | A grading instruction instead of an answer; definition recall presented as design competence |
| Study Guides       | Explanations and worked reasoning; answerable retrieval/application; helpful feedback; source boundaries; no false claim of transfer    | “Compare the claims” called a solved example; unanswered self-study prompts                  |
| Course FAQ         | Direct answers to real learner questions; correct logistics; concise language and accurate links to tasks                               | Repeated assignment prose; invented support channels; incomplete correction sentences        |

The 85-word slide and 120-word FAQ probes are review triggers for these short workshops, not universal instructional laws. Factual truth and pedagogical alignment cannot be established by regex or vocabulary overlap. Keep source-grounded arithmetic checks separate from judgments about sampling validity or educational effectiveness.

`reference-tasks.json` contains independently written reference answers, required reasoning and contrasting learner responses. The runner records its hash but does not feed these answers to the compiler or claim to grade semantic equivalence automatically. Reviewers should try scoring the contrasting responses with the generated rubric: a rubric that rewards a polished wrong answer is defective.

The first completed review and improvement priorities are in [REVIEW.zh-CN.md](REVIEW.zh-CN.md); the frozen before/after defect records are in [results/2026-09-05.json](results/2026-09-05.json). Private complete outputs and rendered files are retained locally. The baseline was generated before product changes at commit `379e5e62`; `--regrade` reevaluates those existing files without regenerating them. If an old report lacks compiler identity, the runner records it as unknown.

The rubric is original to this benchmark. Its focus on alignment is informed by [Carnegie Mellon's teaching/assessment guidance](https://www.cmu.edu/teaching/assessment/basics/alignment.html). Its worked-example, retrieval and practice distinctions are informed by the [IES practice guide](https://ies.ed.gov/ncee/wwc/PracticeGuide/1). These references support the design choices; they do not validate this benchmark or its scores.

## Improvement order

Fix the shared cause before polishing each export: (1) inputs and reference answers, (2) an objective-specific task and rubric, (3) a sequence of teaching/example/practice/feedback, (4) export and editing fidelity. Keep authored source content and explicit constraints intact. Never tune thresholds or suppress findings to favor a candidate. Checker bugs require a mutation regression, a recorded explanation and regrading **both** saved outputs with the same checker. Record remaining defects and compare the same frozen inputs before/after.
