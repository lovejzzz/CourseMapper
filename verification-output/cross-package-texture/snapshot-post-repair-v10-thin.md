# Cross-Package Texture Audit

- Profile: **thin**
- Packages: **12**
- App version: **0.17.18**
- Canonical SHA-256: `0590473c318627e0db150fe627b1a1975a2c852e1b732c459e7429dce3d93487`
- Runtime: **92146 ms**
- Lens-default hits: **0** across **0/12** packages

## Headline teaching-prose measures

| View | Comparable frame units | Clusters K≥2 | K=2 clusters | Support burden | Reader exposure | Cross-package excess |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Raw / path-free | 27573 | 440 | 228 | 3.24% | 4.84% | 3.24% |
| Input-mask / path-free | 27573 | 407 | 165 | 3.76% | 5.86% | 4.01% |
| Input-mask / same-position | 27573 | 246 | 125 | 1.65% | 2.54% | 1.65% |
| Consumed-slot / path-free | 23482 | 1905 | 667 | 24.71% | 49.62% | 37.78% |

## Support distribution

```json
{
  "2": 165,
  "3": 80,
  "4": 60,
  "5": 39,
  "6": 38,
  "7": 6,
  "8": 5,
  "9": 10,
  "10": 4
}
```

## Classification and provenance

- Visible units: 53024
- Teaching-prose units: 27573
- Unclassified visible paths: 0
- Compiler-frame matched units: 25598
- Unknown-provenance teaching units: 1975
- Compiler-frame provenance coverage: 92.84%
- Input-mask → consumed-slot reader-exposure divergence: 43.76 percentage points
- Mask semantics: 1.1.0; placeholder-only source slots are excluded because they contain no comparable compiler frame.

> This report characterizes deterministic compiler output. It is not instructor validation or a real Scion production rate.
