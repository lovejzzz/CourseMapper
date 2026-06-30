# GPT-5.5-pro Python Course Audit — v0.15.147

## Artifacts

- ZIP: `/Users/tianxing/Downloads/Introduction to Computer Science with Python - Course Materials (1).zip`
- Log: `/Users/tianxing/Downloads/edutool.dev-1782801502712.log`
- Local evidence folder: `verification-output/edutool-audit-loop/20260630T064106Z-v015147-gpt55pro-python/`
- App version: `0.15.147`
- Model: `gpt-5.5-pro`
- Run ID: `run-1782801273612`
- Finish ID: `finish-mr09yxk6-ypfoq`

## Score

- Exported report: 93/100 (A), texture 92, 0 P0, 2 P1, 12 P2
- Current-rule local regrade: 94/100 (A), texture 92, 0 P0, 1 P1, 12 P2
- Export verification: passed, 38 checked, 0 failed
- Final digest status: blocked

## Main Losses

1. Partial enrichment P1: enrichment covered 11/15 lessons. Lessons 1, 10, 13, and 15 fell back to template after two repair/retry calls.
2. Citation P2s: 11 OpenStax section rows stayed in source review notes because they lacked URL/license proof for trusted bibliography status.
3. Honesty P2: native authoring fell back to prose because the provider rejected the request.
4. Texture: 92/100. The output is mostly varied, but not clean enough to count as perfect texture.

## Cause Classification

- CourseMapper-side: GPT-5.5-pro request compatibility. The logs show OpenAI rejected `reasoning.effort: low`; supported values were `medium`, `high`, and `xhigh`. This broke native authoring and enrichment repair calls before the model could fairly compete.
- CourseMapper-side: manifest readiness truth. `READINESS_REPORT.txt` and the digest correctly said blocked, but `PACKAGE_MANIFEST.json` downgraded readiness to warnings after package quality was merged.
- Mixed/provider-side: source proof. OpenAlex returned 429s, and the package kept many OpenStax rows as review-only because they lacked URL/license proof. A better model does not automatically fix missing external metadata or trust accounting.
- Mixed/model-side: texture. GPT-5.5-pro produced a strong map and acceptable texture, but repeated/generic phrasing still depends on both model output and deterministic compiler/post-processing.

## Model Comparison Verdict

This run is not a fair pure GPT-5.5-pro quality comparison yet. It proves that the model can produce a strong course outline, but the lower score was dominated by CourseMapper sending a reasoning option that GPT-5.5-pro does not accept. A fair comparison requires a fresh deployed run after the pro-model reasoning clamp, using the same prompt/domain and then comparing score, texture, retries, enrichment coverage, source proof, and cost.

## Release Decision

Patch CourseMapper narrowly:

1. Normalize OpenAI pro reasoning levels so low-effort tasks use `medium` when `low` is unsupported.
2. Preserve partial-enrichment blockers in `PACKAGE_MANIFEST.json` after quality warnings are merged.
3. Retest with a fresh deployed GPT-5.5-pro ZIP/log run before drawing model-quality conclusions.
