# Cross-Package Texture Audit

- Profile: **thin**
- Packages: **12**
- App version: **0.17.08**
- Canonical SHA-256: `597b3b8b72077266296d7e16da477a18a58c2c82246cb7ba793b24ebbc790169`
- Runtime: **43920 ms**
- Lens-default hits: **0** across **0/12** packages

## Headline teaching-prose measures

| View | Comparable frame units | Clusters K≥2 | K=2 clusters | Support burden | Reader exposure | Cross-package excess |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Raw / path-free | 26010 | 536 | 258 | 4.37% | 6.85% | 4.65% |
| Input-mask / path-free | 26010 | 482 | 178 | 4.98% | 8.05% | 5.57% |
| Input-mask / same-position | 26010 | 323 | 133 | 2.56% | 3.80% | 2.56% |
| Consumed-slot / path-free | 21649 | 1192 | 435 | 16.54% | 28.69% | 21.06% |

## Support distribution

```json
{
  "2": 178,
  "3": 93,
  "4": 76,
  "5": 52,
  "6": 48,
  "7": 13,
  "8": 6,
  "9": 10,
  "10": 6
}
```

## Classification and provenance

- Visible units: 47545
- Teaching-prose units: 26010
- Unclassified visible paths: 0
- Compiler-frame matched units: 23427
- Unknown-provenance teaching units: 2583
- Compiler-frame provenance coverage: 90.07%
- Input-mask → consumed-slot reader-exposure divergence: 20.64 percentage points
- Mask semantics: 1.1.0; placeholder-only source slots are excluded because they contain no comparable compiler frame.

> This report characterizes deterministic compiler output. It is not instructor validation or a real Scion production rate.
