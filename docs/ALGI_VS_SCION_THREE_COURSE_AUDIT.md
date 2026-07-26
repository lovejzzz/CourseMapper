# Algi V0 vs Scion — three-course output audit

Date: 2026-07-25 · Arms: `round-2026-07-26T02-30-27-608Z` (Scion), `round-2026-07-26T02-42-33-362Z` (Algi)
Courses chosen to span the genome coverage range: stats-intro (64% hit), ux-design-studio (50%), business-ethics (0%).

## 1. Scores

| Course           | Scion                         | Algi                               |
| ---------------- | ----------------------------- | ---------------------------------- |
| stats-intro      | passed 99 (A), 240s           | **FAILED** no-artifacts, 14s       |
| ux-design-studio | **FAILED** no-artifacts, 211s | **FAILED** no-artifacts, 12s       |
| business-ethics  | passed 99 (A), 268s           | passed **89 (B)**, 0 P0, 2 P1, 40s |

Two results were not predicted by anything measured earlier in this workstream.

## 2. Surprise 1 — the enrichment gate is not an Algi problem

`ux-design-studio` failed on **both** arms, for the same reason:

```
SCION ux: enrichment (11/12) — lesson 7 fell back to template after 1 retry
ALGI stats: enrichment (12/14) — lessons 10, 11 fell back to template
```

The gate is all-or-nothing: one unenriched lesson voids the package. Scion has a
model and a repair path and still lost a lesson to it. So "Algi fails because it
has no repair path" is at best half the story — the dominant failure is the gate's
own strictness, and it bites the model arm too. Any fix belongs in the gate, not
in Algi.

## 3. Surprise 2 — zero coverage is more dangerous than partial coverage

The asymmetry, stated plainly:

- **Partial** genome coverage (stats-intro, 10/14 linked) → enrichment engages,
  falls short, package **blocked**. Loud, safe.
- **Zero** genome coverage (business-ethics, 0/12 linked) → enrichment never
  engages, the gate never fires, package **ships at 89/B with 0 P0**. Silent.

Algi is at its most confident exactly where it knows least.

## 4. What the text actually shows

Both business-ethics packages, DOCX text extracted, paragraphs ≥8 words:

```
shared paragraphs 1061 | SCION-only 831 | ALGI-only 829
overlap = 56.1% of the smaller package
```

So ~56% of a package is compiler template that neither arm authored. The audit
question is what fills the other 44%. Sorted by length, the divergent text:

**Scion-only** — subject knowledge in the evidence-anchor slot:

> "Utilitarianism is a consequentialist ethical theory focusing on maximizing overall happiness or utility."
> "A conflict of interest arises when personal interests improperly influence professional judgment in business decisions."
> "Consumer protection involves legal frameworks designed to safeguard individuals against unfair business practices."
> "Fair employment involves ensuring equitable treatment for all workers regardless of personal characteristics."

**Algi-only** — the publishing checklist promoted into that same slot:

> "A team must interpret this case: Constraint: Review the whistleblowing organizational loyalty focus for local schedule, modality, accessibility needs, source permissions, and grading policy before publishing."
> "An analyst reviews the following case: Constraint: Confirm the consumer protection focus fits the local schedule, modality, accessibility needs, source permissions, and grading rules before students see it."

With no kernel to retrieve, Algi had nothing for the anchor-fact slot, so the
compiler filled it with instructor housekeeping. The sentences are well-formed,
correctly placed, and carry **zero** subject content. A student reading the Algi
lesson learns nothing about consumer protection; a student reading Scion's learns
what it is.

Tautology check (lesson title repeated 3+ times in one sentence) came back
6/2218 Scion vs 12/2243 Algi — 0.3% vs 0.5%. Near-identical, so the circular
phrasing visible in both packages is a **compiler template artifact, not an Algi
defect**. That one is shared and pre-existing.

## 5. The grader cannot see this

89/B, 0 P0 was assigned to a package whose teaching slots contain scheduling
logistics. The rubric checks structure, coverage tags, and format — all of which
Algi satisfies. It does not check whether the anchor fact is a fact about the
subject. This is the same class of defect as the `enrichmentSource`-tag grounding
metric: we are counting the slot, not its contents.

The 99 vs 89 gap therefore **understates** the real difference by a wide margin.
Ten points of rubric separate "teaches utilitarianism" from "reminds you to check
the grading policy."

## 6. What this changes

1. **Algi must refuse uncovered courses.** The 0%-coverage path shipping at 89/B
   is the single most serious finding here. Coverage should be checked before
   composition, and a course under threshold routed to Scion or declined —
   never filled with logistics prose.
2. **The earlier "Algi matches Scion at 99/A" result stands but is narrower than
   I framed it.** It was measured on covered subjects, where retrieval has kernels.
   It says nothing about behaviour off-genome, which is where the risk lives.
3. **The enrichment gate needs work independent of Algi**, since it failed Scion too.
4. **A grader check is needed** that the anchor-fact slot contains a subject
   claim, not boilerplate. Without it, no score from this harness can be trusted
   to distinguish these two packages.

Authoring volume for the four uncovered disciplines (art-history, business-ethics,
intro-philosophy, public-speaking) remains the standing content fix, but it is now
second in priority to the refusal path — authoring shrinks the uncovered set,
refusal makes the uncovered set safe.
