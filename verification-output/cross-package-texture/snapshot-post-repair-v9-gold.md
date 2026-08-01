# Cross-Package Texture Audit

- Profile: **gold**
- Packages: **10**
- App version: **0.17.08**
- Canonical SHA-256: `b5addc56dea66f6ed27ece43515adda7a268196d746f95958385b1a353a7b7fe`
- Runtime: **28915 ms**
- Lens-default hits: **3** across **1/10** packages

## Headline teaching-prose measures

| View | Comparable frame units | Clusters K≥2 | K=2 clusters | Support burden | Reader exposure | Cross-package excess |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Raw / path-free | 14922 | 207 | 112 | 2.90% | 4.52% | 3.03% |
| Input-mask / path-free | 14842 | 550 | 282 | 9.14% | 18.66% | 12.82% |
| Input-mask / same-position | 14842 | 558 | 326 | 7.19% | 10.96% | 7.20% |
| Consumed-slot / path-free | 13040 | 407 | 214 | 7.64% | 14.32% | 9.51% |

## Support distribution

```json
{
  "2": 282,
  "3": 89,
  "4": 63,
  "5": 30,
  "6": 22,
  "7": 16,
  "8": 16,
  "9": 19,
  "10": 13
}
```

## Classification and provenance

- Visible units: 28061
- Teaching-prose units: 14922
- Unclassified visible paths: 0
- Compiler-frame matched units: 13763
- Unknown-provenance teaching units: 1159
- Compiler-frame provenance coverage: 92.23%
- Input-mask → consumed-slot reader-exposure divergence: -4.34 percentage points
- Mask semantics: 1.1.0; placeholder-only source slots are excluded because they contain no comparable compiler frame.

> This report characterizes deterministic compiler output. It is not instructor validation or a real Scion production rate.
