# Trellis Roadmap v0.1.8 — Autopsy & Blind Verdict

_July 4, 2026. Input: v0.1.7's null (dense mode moved LA by exactly
zero) and its carries. Rule for this release: after a null, measure the
mechanism before buying another hypothesis. Three autopsies ($0 each)
and one protocol first-run._

## 1 · Dense-mode compliance autopsy (the null's mechanism)

- **Question:** did v017-la-replay's fresh items actually carry three
  different families per item, or did the prompt not land?
- **Method:** deterministic read of authored.json — per fresh item,
  count distinct families its wrong options catch (bench matcher).
- **Decision rule:** compliance <50% → the prompt failed; the lever
  becomes bank-side (tag `familiesCaught` on existing items via their
  source-run graphs, selection prefers multi-catch — no prompt hope).
  Compliance ≥50% with zero repair effect → the hypothesis is wrong;
  retire it and write down why (sim mechanics: students repair only
  their OWN held family; surface ≠ hits).
- **Exit bar:** the autopsy verdict in §20 with numbers; at most ONE
  targeted follow-up implemented per its decision rule.

## 2 · LA cost autopsy

- **Question:** LA replays crept $0.22 → $0.33 — which stage?
- **Method:** ledger diff v016-la vs v017-la ($0).
- **Exit bar:** cause named; if the ds blend tail is runaway, cap
  per-run tail calls; LA replay cost back ≤$0.25 next measurement.

## 3 · Straggler kernels — one cross-family attempt

- **Method:** the six hardest short-belief kernels get ONE authoring
  pass on deepseek-v4-flash (different family phrases differently);
  gates unchanged. Accept-and-document whatever remains.
- **Exit bar:** ≤$0.05; final straggler list in §20 as a standing
  bank annotation, not a recurring task.

## 4 · First semi-blind adjudication (charter A3, executed)

- **Finding:** the semi-blind procedure is documented but has never
  run — every read so far knew which package was which.
- **Method:** humanPacket normalizer over v017-cs-replay vs the current
  pipeline's July-3 package (plain text both sides, assignment
  randomized, key sealed); adjudicator scores per rubric with quoted
  evidence BEFORE unsealing; verdict + unsealing filed in
  docs/adjudications/.
- **Exit bar:** the filed adjudication shows scores written before the
  key was opened; disagreements with panel scores reported.

## Budget

≤$0.15 total (items 1–2 are $0; item 3 ≤$0.05; item 4 is reading).
Standing discipline unchanged.
