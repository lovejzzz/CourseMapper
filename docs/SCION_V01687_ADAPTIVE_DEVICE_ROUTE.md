# Scion V0.16.87 — Adaptive Device Route

## Goal

Make Scion reliable on the device a professor actually uses: prove local-model capability before any multi-gigabyte download, preserve the quality-first Gemma lane where it can run, and automatically use Scion’s private zero-model evidence/compiler lane where it cannot.

## The production evidence

V0.16.86 fixed two serious behaviors: an invalid local-model activation could no longer enter prose fallback, and a failure could no longer start a hidden second 3.35 GB transfer. Its required production Chrome audit then exposed the remaining diagnosis.

After Chrome downloaded a clean copy of all five pinned Gemma shards, the worker threw:

```text
Invalid typed array length: 1163217991
```

That decimal value is hexadecimal `0x45554c47`; as little-endian bytes it spells `GLUE`, the binary request marker. Native `wllama_action` writes the response length over those first four request bytes only after an action succeeds. A native exception returns a null pointer without overwriting the marker, and the JavaScript worker had blindly treated those stale bytes as a valid output length.

Once native logging was no longer suppressed, the actual C++ cause was visible:

```text
ggml_webgpu: Failed to get an adapter: WebGPU not available on this browser
WebGPU backend not available
```

The same production page confirmed that `navigator.gpu` existed while both high-performance and default `requestAdapter()` calls returned `null`. A separate small-GGUF probe failed in the same place, proving the failure was device/runtime capability—not Gemma bytes, shard size, prompt content, storage quota, or the compiler.

## Implementation Lanes

### 1. Prove the real capability before download

`loadScionBrowserWllama` now awaits a usable WebGPU adapter before it:

- imports the Wllama runtime;
- opens or mutates the model cache;
- starts a network transfer; or
- advertises local-model progress.

Checking only `navigator.gpu` is no longer sufficient. Scion tries the high-performance preference, then the browser default. A null or rejected result carries the explicit `SCION_WLLAMA_WEBGPU_ADAPTER` code. The regression proves runtime import and model loading remain untouched.

### 2. Keep one public Scion identity

The landing page still exposes one free product:

```text
Provider: Scion
API: No API key required
Model: Scion V0.16.87
```

Execution is private and adaptive:

- a capable browser runs the immutable public Gemma base locally;
- an incompatible or storage-constrained browser uses Scion’s source-evidence and deterministic compiler lane with no model download or inference.

The latter reuses the source-consolidation work developed in the former Algi research prototype, but it is not a second public model. It receives the same task, structured prompt, uploaded-source context, explicit research consent, typed CourseIR, compiler, Agent evidence layer, and exporters. Telemetry records an adaptive Scion route with zero model requests instead of a red provider failure.

Research privacy does not change. Private mode sends no course topic to public research services. Only the existing explicit opt-in allows the course title and uncovered topics to reach the bounded source providers.

### 3. Preserve the native cause

The generated worker validates:

- a non-null, safe output pointer;
- a finite, non-negative output length; and
- an output range inside the active WASM heap

before constructing any output view. An invalid response throws a bounded action error and directs engineering logs to the preceding native message. Scion no longer classifies the stale `GLUE` marker as proof of an incomplete model cache, so a valid cache is not deleted for the wrong reason.

`suppressNativeLog` is disabled, while Scion’s logger still filters the known single-thread WebGPU warnings and suppresses native debug noise. Real native errors survive.

### 4. Keep byte transport bounded

As defense in depth, the OPFS reader serves a legal large request through consecutive 64 MiB destination views. Destination and file cursors advance from the exact browser-reported count, and invalid read counts fail explicitly.

The generated-worker regression executes this loop rather than a handwritten copy. It proves a 64 MiB read plus an exact 257-byte remainder with no overlap or gap. This is transport hardening, not the claimed production root-cause repair.

The generated runtime digest is:

```text
4b43ed59785ae9aa89aae67ac504534d9bf7b65e6340969b7bd13550146a6433
```

The public Gemma revision, five GGUF shard sizes, total model bytes, and weights are unchanged.

### 5. Fix the first visible course identity

The live workspace appears before the generated map has a final course name. Prompt-derived titles now remove explicit count contracts such as:

```text
Digital Accessibility for Product Teams, exactly three lessons: …
```

The first frame therefore shows `Digital Accessibility for Product Teams`, not a truncated instruction.

## Preserved safety boundary

The V0.16.86 orchestration repair remains active. An actual runtime startup error cannot enter the older prose provider path or trigger another model attempt. Abort and semantic-admission failures do not use the adaptive capability route. The lightweight lane is reserved for explicit runtime, capability, storage, cache, and recovery boundaries.

## Local professor-facing acceptance

A fresh Chrome run exercised the complete adapter-less route with this brief:

```text
Digital Accessibility for Product Teams, a 4-lesson graduate workshop for UX
designers and product managers. Cover WCAG principles and conformance, semantic
HTML and keyboard accessibility, accessible forms, and evidence-based
accessibility testing and remediation. Each lesson must produce a concrete
product-team artifact and use current official W3C/WAI sources where available.
```

The first frame showed the correct course identity. Scion forecast three evidence gaps and changed the primary action to **Use current sources & generate**, naming the public catalogs and the exact course-title/topic boundary before the click. That explicit action selected the zero-download research/compiler lane before any model transfer and completed in nine seconds with:

- 4/4 lessons mapped;
- 4/4 lesson kernels;
- 9/9 material families;
- zero model requests and zero model bytes downloaded;
- zero blockers and zero warnings;
- 65/100 Automated Readiness under the unchanged automation-only evidence ceiling;
- 99/A deterministic package conformance;
- texture 97; and
- 38/38 physical export checks with zero failures or warnings across 35 files.

The browser audit inspected all ten public surfaces in dark mode and repeated the completed workspace in light mode: Course Map, Syllabus, Lesson Plans, Slide Decks, Assignment Briefs, Rubrics, Discussion Prompts, Quiz & Exam Bank, Study Guides, and Course FAQ. Separate responsive Chromium checks cover 320-pixel setup, phone, tablet, and compact-laptop workspace frames. The Agent replay asked which official source supports Lesson 3 and how that lesson connects to Lesson 4. Scion named the W3C Accessible Forms and Labels sources, explained how form findings feed evidence-based remediation, and stated that one passing component check does not prove product conformance.

The same pass drove content repairs rather than merely recording success:

- instructional acronyms retain their canonical capitalization;
- WCAG version sentences and plural FAQ questions use correct grammar;
- glossary terms are quoted naturally;
- general policy statements are bounded to the cited source context;
- source cues remain concise and do not become activity commands;
- authoritative but instructionally weak W3C navigation, alternate-version, and obsolete markup-aside fragments fail source admission;
- demonstrative reference debris such as “Conformance to this level” cannot become a lesson concept;
- unfinished-product wording is removed from Week instructions;
- editable slide text retains its intended transparent background in dark mode instead of inheriting a white hover background;
- research-provider identity survives compilation, including `w3c-wai`; and
- public Scion ZIP receipts use `scion-research` provenance without exposing the internal prototype codename.

The resulting ZIP contains six accessible, concept-linked source rows. Its manifest, quality report, source report, and UI receipt agree: the evidence-compiler lane records zero model inference, zero downloaded weights, and `$0.000` rewrite cost. The archive contains no bad reference fragment, unfinished-product label, or internal Algi identity. This local acceptance is release evidence, but it does not replace the required post-deploy production audit or establish instructor, factual, accessibility, or classroom validation.

The final local gate set passes 5,873 active unit tests across 470 passing files, 151/151 Chromium tests, the 40/40 layered evaluation, the 18/40 PR compiler contract profile, format, lint, build, bundle, release-history, and generated-runtime digest checks. The evaluation remains explicitly `compiler-contract-only`.

Because source-ledger attribution and downstream quality checks changed, held-out ruler V27 binds the new transitive grader receipt. It preserves V26's five fixtures and task boundary but inherits no V26 score, adapter result, or quality claim.

## Release-blocking proof

V0.16.87 is not ready merely because focused tests pass. The release requires:

1. generated-runtime pin and digest checks;
2. focused adapter-preflight, adaptive-route, runtime-envelope, cache, title, and failure-boundary tests;
3. complete unit, format, lint, release-history, build, bundle, evaluation, contract, and Chromium gates;
4. green pull-request and main-branch CI;
5. green production deployment;
6. one production-origin Chrome build that repeats the locally verified adaptive no-download path in this adapter-less session;
7. one production-origin local-model activation on a WebGPU-capable device when that device is available;
8. frame inspection across Model, Map, Enrich, Compile, Verify, and Grade;
9. a Scion-backed Agent interaction;
10. desktop, tablet, and narrow-mobile inspection in light and dark presentation;
11. a clean console with no failed provider call or duplicate model path; and
12. a downloaded physical ZIP whose manifest, readiness report, and quality report agree.

The adaptive path is a valid production outcome, not a disguised model success: its receipt must say zero model requests and no model download. Local Gemma remains separately capability-gated.

## Release Boundary

V0.16.87 changes runtime admission, adaptive orchestration, error fidelity, defensive byte transport, prompt-derived title identity, source attribution, and language finalization. It binds those grader dependencies under V27 but does not change Gemma weights, activate the optional trained adapter, relax evidence admission, inherit or raise a benchmark score, or establish instructor, factual, accessibility, or classroom validation.

## Production Result

Fast verification and deployment passed, but the mandatory production-origin
course did not satisfy this acceptance contract. The primary action disclosed
current-source research, yet the lazy application handoff later resolved the
run as private mode. The resulting Digital Accessibility course prepared only
1/4 lesson kernels, reported 53/100 Automated Readiness, and correctly remained
blocked. A manually dispatched Deep proof run also failed its app/runtime job
because the quota-pressure autosave fixture reached the recovered workspace
after the old ten-second runner threshold.

V0.16.87 is therefore retained as the adaptive-device architecture release,
not represented as professor-ready production proof. V0.16.88 carries the
explicit one-run consent handoff, the exact lesson-sequence parser repair, and a
runner-independent autosave recovery assertion.
