<!-- LEDGER NOTE: this doc is the July-7 session record for Scion-in-Composer-
ZERO. The canonical TRELLIS.md §20 append is DEFERRED: a concurrent session
is editing TRELLIS.md in this shared tree (its own "Scion-native compiler"
work), and appending now would clobber or entangle it. Merge the one-paragraph
§20 entry from this doc's "Verdict" once the tree is uncontended. Commits from
this session use explicit paths only, never `git add -A`. -->

# Scion in Composer-ZERO — what the house model buys the $0 pipeline

_July 7, 2026. The V2.1 house model **Scion** (Gemma-4-E2B rootstock + the
house harness; UI: Local · Free · Scion-1) grafted onto the Composer-ZERO
pipeline at its three JUDGED seats, one per judge artifact class, each
flag-gated (`SCION=skin,polish,fill`), each local and $0. Measured by
ablation on two frozen graphs — one day-one course (Music Theory, 7 lessons)
and one mature course (Intro CS with Python, 15 lessons) — with
`--freeze-exposure` so the store never drifts between arms. Grades from the
unmodified deep grader; judge panels pooled 12 openai seats per arm.
SIMULATED throughout._

## The seats

| Seat       | Artifact it touches  | What Scion does                                                                                        | Gate (source form ships on failure)                                                       |
| ---------- | -------------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| **skin**   | lesson-plan segments | rewrites assembled parts into one instructor voice (replaces the Tendril-S 0.5B on this call)          | ±40% length, terminal punctuation, mode-example, code-fence                               |
| **polish** | study-guide markdown | self-refines draft prose (the V2 pass that beat paid on the compiler seat)                             | ±40% length, EXACT heading/fence counts, **non-reader contract marker**                   |
| **fill**   | quiz items           | authors items where the bank runs short (zero mode's documented no-author gap) via `authorItemsE2BMax` | full gate stack + **blind self-solve = key** (self-verified; no paid solver in zero mode) |

## Honesty invariants (unchanged)

- Every arm ledgered **$0.0000** — the graft never reaches a paid call.
- Every arm graded **98/A**, P0=0, P1=0 — the deep grader's structural floor
  is untouched by any seat.
- `--freeze-exposure` genuinely freezes now: it was born **unconsumed**
  (threaded since eec5635 but never gating the store write), so every
  "frozen" composer ruler since v0.1.1 silently drifted. Fixed here
  (`persistExposure`); regression-tested.

## Judge panels — 12 openai seats/arm (⚠ cross-family seat DOWN this session)

> The DeepSeek cross-family seat returned **HTTP 402 Insufficient Balance**
> on every call (surfaced visibly, per design). Panels are openai-only:
> arm-to-arm **deltas** are valid (identical seats judge every arm), but the
> absolute numbers carry same-family optimism. Claims below lean on deltas.

### Noise floor (measured, not assumed)

scion-m-base judged **three** independent 12-seat panels on byte-identical
content: overall 5.33–5.50, plan 6.11–6.33, quiz 3.00–3.36, **guide
7.44–7.50**. Per-class panel noise is ±0.2–0.35 — but **guides are the
lowest-noise artifact (±0.06)**. Any arm delta below ~0.35 on plan/quiz is
noise; on guides a +0.3 is real.

### Music Theory (day-one course)

| Arm   | Overall | plan | quiz | guide | Seat effect                                                                       |
| ----- | ------- | ---- | ---- | ----- | --------------------------------------------------------------------------------- |
| base  | 5.42    | 6.19 | 3.36 | 7.44  | —                                                                                 |
| +skin | 5.58    | 5.75 | 3.64 | 7.64  | plan −0.44 (≈noise/slightly down); guide move = noise (skin doesn't touch guides) |
| +fill | 5.92    | 6.64 | 3.44 | 7.75  | quiz +0.08 (noise); overall gain is noise on untouched artifacts                  |

Reading the seats on the artifact each one actually changes:

- **skin** moved plans −0.44 (at/just below noise) — not a win on this course.
- **fill** moved quizzes +0.08 (pure noise). **Fill's real value is
  COVERAGE**, not the judge: it cut short quizzes from **4 lessons → 1**,
  authoring self-verified items where the bank was thin (6 items, 1
  self-rejected on music).
- The music **quiz floor (~3.1)** is the deciding weakness and no local seat
  moves it — it is content depth / bank maturity, not a harness lever.

### Intro CS (mature course) — the clean paired arm

Both arms **md5-verified to the identical store snapshot** (`62c565ca…`
before and after), so the per-class deltas attribute to the seats, not to
store drift. Because each seat touches a distinct artifact class, the paired
deltas isolate cleanly: **plan Δ = skin, guide Δ = polish, quiz Δ = fill.**

| Arm  | Overall | plan      | quiz      | guide     | Seat counts                      |
| ---- | ------- | --------- | --------- | --------- | -------------------------------- |
| base | 6.92    | 7.08      | 6.19      | 7.11      | —                                |
| +all | 7.00    | **7.56**  | **5.78**  | **7.53**  | skin 62/73, polish 14/15, fill 2 |
| Δ    | +0.08   | **+0.48** | **−0.41** | **+0.42** |                                  |

The mature course sits **+1.4 above day-one** (6.9 vs 5.4), driven entirely
by quizzes (6.2 vs 3.1) — the standing bank-maturity story. And the seat
deltas tell the real Scion story:

- **polish +0.42 on guides** — a clean, real win (guide noise is ±0.06). This
  is the single strongest signal in the study: on structured guides Scion's
  self-refine pass measurably improves the judge.
- **skin +0.48 on plans** — on the mature course skin HELPS (opposite of
  day-one's −0.44). Skin needs good underlying assets to unify into one
  voice; on a mature bank it delivers, on thin day-one prose it does not.
- **fill −0.41 on quizzes** — on a mature course the banked quiz already
  clears a bar 4B fill items cannot, so adding them DILUTES. Fill is a
  coverage lever for thin courses, not a quality lever for full ones.

Net overall is a wash (+0.08) precisely because skin+polish gains (+0.48,
+0.42) are cancelled by fill's dilution (−0.41). The lesson is a **config
lesson**, not a null: run `SCION=skin,polish` on a mature course and
`SCION=fill` where quizzes are short.

## Where Scion helps most — the ranking (by measured, clean delta)

1. **polish — the clearest QUALITY win: +0.42 on mature guides.** Guides are
   the lowest-noise artifact (±0.06), so this is the most trustworthy number
   in the study. On structured guides (real `##`/`###` headings) Scion's
   self-refine pass lands 14/15 and the judge sees it. On day-one prose
   guides it correctly **no-ops**: those sections ARE the non-reader
   compliance contract, and the gate refuses any rewrite that drops the
   "missed the reading?" marker — a relaxation that allowed it failed 7/7
   lessons downstream, so the gate earns its keep.
2. **skin — +0.48 on plans, but asset-dependent.** On the mature course skin
   unifies 62/73 segments and lifts plans +0.48; on the thin day-one course
   the same seat scored −0.44. Skin needs good parts to make read as one
   voice — it amplifies a good bank, it cannot rescue a thin one.
3. **fill — a COVERAGE capability, not a quality lever.** Its true value: it
   gives the $0 pipeline something it never had — self-verified item
   authoring — cutting short quizzes from **4 lessons → 1** on the day-one
   course (each item shipped only if Scion blind-solves it to its own key, no
   paid solver). But on a mature course whose banked quiz already clears a
   bar 4B items can't, adding fill items **dilutes** (quiz −0.41). Engage it
   only where the bank is short.

## The honest verdict

Scion in Composer-ZERO holds every invariant (98/A, $0, offline Tutor) and
earns its place with **two measurable levers and one new capability**:

- **`SCION=skin,polish` on a mature course** buys **+0.48 plans and +0.42
  guides** at $0 — the config to ship.
- **`SCION=fill` where quizzes are short** buys real coverage (self-verified,
  $0) — but do NOT add it to an already-full strong quiz, where it dilutes.
- Running all three blindly is a **wash** (+0.08 net) because fill's dilution
  cancels skin+polish — the finding is a config rule, not a null.

What Scion does NOT do is lift the day-one **quiz** ceiling (~3.1): that is
quiz content depth, a bank-maturity problem the mature course (6.9) already
answers. The single highest-value next lever is unchanged from the V2.1
roadmap — the ORPO-trained **Scion-1** checkpoint for the item seat, which is
the only thing that would let `fill` add quality instead of just coverage.

## Caveats of record

- **Cross-family judge seat down**: DeepSeek returned HTTP 402 (insufficient
  balance) all session; panels are openai-only (same-family). Deltas are
  valid; absolute numbers carry same-family optimism.
- **Shared working tree**: a concurrent session built a DIFFERENT "Scion" (the
  compiler seat, `src/lib/scion*.js`, committed as `b3800e7`) in this same
  tree and its `git add -A` swept some of this work into that commit. All
  Composer-ZERO commits here use explicit paths to avoid clobbering it.
- The music day-one arms (base/skin/fill) were judged on a pre-drift store;
  the cs paired arms are md5-pinned and are the measurement of record for the
  per-seat deltas.
