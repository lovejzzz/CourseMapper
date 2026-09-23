# Scion base-model comparison: Gemma 4 E2B vs Qwen3.5-4B

Date: 2026-09-22. Both models ran the twelve pre-registered descriptions in `benchmarks/scion-live/briefs.json` through the same v0.20.08 pipeline, WebGPU runtime, prompts, checks and greedy decoding. Only the weights and chat template differ.

|                                    | Gemma 4 E2B (current)  | Qwen3.5-4B Q4_K_M       |
| ---------------------------------- | ---------------------- | ----------------------- |
| Download                           | 3.35 GB                | 2.74 GB                 |
| Automated gate                     | 10/12 (Q 4, T 3, A 3)  | 11/12 (Q 4, T 4, A 3)   |
| Read by hand: clean                | 7                      | 6                       |
| Read by hand: usable after one fix | 2                      | 3                       |
| Read by hand: not usable           | 3 (T2, T4, A4)         | 3 (T2, T3, A4)          |
| Wrong answer keys found            | 6                      | 8                       |
| Time per course (model cached)     | 44–85 s, median ≈ 56 s | 54–107 s, median ≈ 77 s |

Where Qwen was better: Chinese reasoning (A3 causal inference fully correct; T4 reliability and "cannot be sure" items correct), and it followed the JSON contract with fewer rejections.
Where Gemma was better: English source questions (T3: Qwen keyed three wrong answers), Ozymandias (A1), the chemistry conceptual item (Q1), and speed (about 1.4× faster).
Both failed T2 the same way (treating "rebuilt in 1631" as "built in 1631").

Decision: keep Gemma 4 E2B. Qwen is not clearly better on the same material, is slower, and produced more wrong keys. The largest gains in v0.20.08 came from computing answers in code and checking drafts, which help either model.

## Reproducing

1. `brew install llama.cpp`, download `Qwen3.5-4B-Q4_K_M.gguf` from `unsloth/Qwen3.5-4B-GGUF`, then split it for the browser (each file must stay under 2 GB):
   `llama-gguf-split --split --split-max-size 500M Qwen3.5-4B-Q4_K_M.gguf public/dev-models/qwen35-4b/Qwen3.5-4B-Q4_K_M`
   Keep `public/dev-models/` out of git (`.git/info/exclude`).
2. Run `npx vite --port 5207`, then in the browser: `localStorage.setItem('edutool-dev-scion-model', 'qwen35-4b')`. The switch exists only in development builds (`src/lib/scionExperimentalModel.js`).
3. Generate each brief and score it with `scripts/benchmarks/scionLiveScore.mjs`; read every answer key by hand.

Caveats: one run per description (n = 12); greedy decoding for both, while Qwen recommends temperature 0.7 with a presence penalty in non-thinking mode.
