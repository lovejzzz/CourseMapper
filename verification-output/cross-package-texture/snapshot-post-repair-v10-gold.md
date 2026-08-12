# Cross-Package Texture Audit

- Profile: **gold**
- Packages: **10**
- App version: **0.17.18**
- Canonical SHA-256: `d5fed9095159e2d77e2e7d073d3a5c93d69ce7ae3c03740bdff3eb42b36731b2`
- Runtime: **56901 ms**
- Lens-default hits: **3** across **1/10** packages

## Headline teaching-prose measures

| View | Comparable frame units | Clusters K≥2 | K=2 clusters | Support burden | Reader exposure | Cross-package excess |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Raw / path-free | 15930 | 180 | 99 | 2.41% | 3.68% | 2.47% |
| Input-mask / path-free | 15776 | 527 | 247 | 8.39% | 16.75% | 11.52% |
| Input-mask / same-position | 15776 | 550 | 318 | 6.48% | 10.40% | 6.76% |
| Consumed-slot / path-free | 14149 | 643 | 352 | 11.68% | 23.20% | 15.91% |

## Support distribution

```json
{
  "2": 247,
  "3": 109,
  "4": 62,
  "5": 30,
  "6": 13,
  "7": 12,
  "8": 28,
  "9": 15,
  "10": 11
}
```

## Classification and provenance

- Visible units: 30471
- Teaching-prose units: 15930
- Unclassified visible paths: 0
- Compiler-frame matched units: 15071
- Unknown-provenance teaching units: 859
- Compiler-frame provenance coverage: 94.61%
- Input-mask → consumed-slot reader-exposure divergence: 6.44 percentage points
- Mask semantics: 1.1.0; placeholder-only source slots are excluded because they contain no comparable compiler frame.

> This report characterizes deterministic compiler output. It is not instructor validation or a real Scion production rate.
