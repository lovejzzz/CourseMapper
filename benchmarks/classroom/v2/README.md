# v0.19 classroom acceptance corpus

Thirty new fictional source packets: 18 development cases and 12 reserved acceptance cases, across calculation, source analysis and experimental design, in English and Chinese. Cases vary in the reasoning required, available evidence, missing information, response language and class duration. They are not merely renamed versions of one template.

`expected` is a reference judgment for evaluation; it must never enter the model prompt or compiler input. The first frozen acceptance run occurs after feature development. A held-out case used to repair the implementation must be recorded as exposed and thereafter counted as regression, retaining its original first-run failure. These are author-constructed acceptance cases, not an external blind evaluation: the implementer authored them. They cannot establish teacher agreement or student learning gains.

`manifest.json` freezes the initial source packet hashes. Prior v1 cases and reports remain historical regression evidence. Do not edit reference answers to match product output. Corrections to mistaken references require a written reason and a retained previous result.

Acceptance combines automated defect checks, review of complete materials, rendered exports, source-edit transactions and actual local-model runs. A complete JSON schema or a high count of passing probes is not by itself evidence that a course is classroom-ready.
