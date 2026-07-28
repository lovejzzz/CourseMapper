# Scion V0.16.88 — Professor Acceptance

Date: July 28, 2026

## Goal

V0.16.87 passed automated verification and deployed, but its first mandatory
production-origin course was rejected. The package archive was structurally
valid while the actual course prepared only one of four lesson kernels.
V0.16.88 fixes the two causal defects and adds the exact failed workflow to the
regression boundary.

This is an engineering acceptance contract. It does not claim instructor
approval, factual certification, accessibility certification, classroom
effectiveness, paid-model superiority, or a trained-adapter victory.

## What failed in production

The live prompt was:

> Digital Accessibility for Product Teams — create exactly 4 lessons: WCAG
> principles and conformance, semantic HTML and keyboard accessibility,
> accessible forms, and evidence-based accessibility testing and remediation.
> Make it practical for product designers and frontend developers, with
> source-grounded explanations, applied accessibility checks, and current open
> web evidence.

The primary action correctly disclosed **Use current sources & generate**, but
the generation route reread consent from persistent browser storage after the
lazy Landing → AppFlow transition. The audit browser did not preserve that
storage boundary, so the run entered private mode. A separate exact-list parser
used the Oxford comma as the final list boundary and then incorrectly treated
the _and_ inside “testing and remediation” as another delimiter. The resulting
five fragments failed the exact four-lesson contract.

Observed V0.16.87 result:

- 0/4 knowledge kernels;
- no current-source research despite the named action;
- 33/100 Automated Readiness;
- archive verification passed, demonstrating why archive integrity cannot stand
  in for content readiness.

## Implementation Lanes

### 1. Consent belongs to the run

The current-source choice now travels explicitly through:

```text
Landing action
  → startup recovery
  → App startup action
  → AppFlow one-run override
  → Course Map provider
  → lesson evidence prepass
  → deterministic compiler
```

Persistent preference remains a convenience for later runs. It is not the
source of truth for the run started by a consent-bearing action.

### 2. Exact topic lists preserve internal conjunctions

The counted comma-list parser now distinguishes:

- the Oxford boundary: `A, B, C, and D`;
- an internal lesson-title conjunction: `testing and remediation`.

After the Oxford boundary is found, an `and` inside the final item is not
reinterpreted as a fifth delimiter. Non-Oxford `A, B and C` remains supported.

### 3. The failed prompt is a test fixture

The exact production prompt is asserted in the skeleton composer tests. Focused
tests also pin startup recovery, explicit Scion fallback consent, and quick-start
wiring. These tests fail on the deployed V0.16.87 behavior and pass on V0.16.88.

## Local browser replay

The same storage-ephemeral browser and exact prompt were replayed against the
V0.16.88 source tree.

| Measure                       |           Result |
| ----------------------------- | ---------------: |
| Named lessons forecast        |              4/4 |
| Private-ready lessons         |              1/4 |
| Explicitly researched lessons |              3/4 |
| Admitted source ledgers       |              4/4 |
| Course Map lessons            |              4/4 |
| Lesson kernels                |              4/4 |
| Material families             |              9/9 |
| Blockers / warnings           |            0 / 0 |
| Automated Readiness           |           69/100 |
| Package conformance           |             99/A |
| Texture                       |               97 |
| Export checks                 |            38/38 |
| Model download / requests     |          0 B / 0 |
| Model tokens / rewrite cost   |       0 / $0.000 |
| Observed completion time      | about 16 seconds |

The source route disclosed `W3C/WAI → Wikipedia → DOAJ` before the click. The
run recorded three researched lessons, eleven checked source candidates during
research, four admitted lesson ledgers, and concept-linked W3C/WAI and public
background sources in the Course Map.

The physical ZIP contains 35 files, passes all 38 archive checks and `unzip -t`,
and reproduces the same 99/A result under offline regrading. Its manifest records
six trusted concept-linked sources and complete 48/48 source-reference coverage
across outcomes, activities, examples, assessments, rubric criteria, and factual
claims. SHA-256:
`aa82ab7eb8f9c95efc090441a1026aacd26fa1d473c94335bc97e0527496d0a4`.

The headless CurriculumOS proof was also repaired so an evidence-bearing
pipeline cannot accidentally grade an evidence-free fixture. It now compiles an
eight-lesson Introductory Astronomy course with 8/8 graph-linked lessons, eight
linked citations, seven exported source resources, all 9/9 deliverable families,
69 physical files, and 99/A conformance. This is deterministic architecture
proof, not a browser, production, instructor, or classroom claim.

## K3 review: protocol lessons adopted without changing the model

The Kimi K3 review does not justify replacing Scion's pinned browser base with a
roughly 1.56 TB model package or porting K3's MoE, KDA, hidden reasoning, or
model-specific wire format. The useful lesson is to make a small model operate
inside a stricter, narrower protocol.

V0.16.88 applies that lesson to the read-only local Agent path:

- capabilities are imported progressively from question intent instead of
  presenting one large tool surface;
- assigned-source answers stay bounded to sources already compiled into the
  course;
- connected lessons may be named by topic as well as by number;
- the exact professor-facing question about accessible forms and testing /
  remediation is a regression fixture; and
- the answer must preserve both W3C source links and the whole-product
  conformance boundary.

Autonomous local mutation remains disabled. Before that boundary moves, Scion
needs the report's strict versioned action envelope, canonical call/result
ledger, course-aware context handoff, explicit budgets, and a frozen final-state
workspace gym. Those controls must reuse the existing confirmation, read-back,
receipt, undo, and verification path.

## Required release gates

Before merge:

1. focused regression tests;
2. full unit and closed-loop suite;
3. full Chromium E2E suite;
4. format and lint;
5. proof smoke;
6. main layered evaluation;
7. build and bundle budgets;
8. release-history and contract audits.
9. headless CurriculumOS source-provenance proof.

The final local run passes 470 unit-test files and 5,878 active tests, with 16
files and 162 tests intentionally skipped; 151/151 Chromium tests; the 40/40
layered evaluation; the 18/40 PR compiler contract profile; format, lint,
build, bundle, release-history, generated-runtime, and headless provenance
checks. These are compiler-contract results, not instructor or classroom
validation.

After deployment, the exact production prompt must be repeated from a fresh,
cache-busted session. Acceptance requires:

- named topics in the forecast and Course Map;
- a visible current-source consent boundary;
- research activity only after the explicit action;
- 4/4 kernels, 9/9 material families, zero blockers and zero warnings;
- every public surface inspected;
- a source-bound Agent answer inspected;
- no public internal codename or unfinished-product wording;
- no unexpected console errors;
- a physical ZIP that passes archive and nested document inspection.

## Release Boundary

V0.16.88 changes orchestration, recovery metadata, exact-topic parsing, and
proof coverage. It does not change Gemma weights. The optional adapter remains
inactive until it beats the pinned public base on a frozen held-out ruler.
Ruler V28 binds the changed transitive grader bytes without inheriting a V27
score, adapter result, or quality claim.
