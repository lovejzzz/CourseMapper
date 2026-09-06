# Local Scion task-design investigation

These are actual completions from synthetic source packets, not mocked outputs or teacher/student outcome measurements. The packets were already exposed during this work; subsequent trials are diagnostic comparisons, not fresh held-out results. No adapter was installed or activated.

The browser used the pinned Gemma 4 E2B Q4_0 shards and packaged Wllama WebGPU runtime. Each saved browser result includes its prompt, settings, final response, completion metadata, runtime/model identity and elapsed time. Native probes used cached local weights and llama.cpp b10809 with Metal, two CPU threads and serial requests. Native latency includes model loading and cannot be compared directly with a warm browser completion.

| Trial                               |       Cases | Observation                                                                                                                                                                                                                         |
| ----------------------------------- | ----------: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Initial count-selection smoke test  |           1 | Correctly selected 12 of 30; did not explain the missing-response uncertainty well.                                                                                                                                                 |
| V1 task design                      |           3 | Structure and exact-quotation checks passed, but experimental repair and some feedback/unknowns were inadequate.                                                                                                                    |
| V2, no thinking, greedy             |           4 | Two calculation plans selected the right observed counts but added a forbidden schema property; source analysis was malformed. The syntactically valid cache comparison still repeated the confound.                                |
| V2, thinking, greedy                |           4 | All four failed structural admission. Some explanations improved, but one plan invented a complementary count and the experimental procedure remained inadequate. About 22–27 seconds per warm browser request.                     |
| V2, thinking, documented sampling   |           4 | All four failed structural admission; semantic errors remained. One seed is not a sampling-distribution comparison.                                                                                                                 |
| V2, thinking, shorter example shape |           4 | All four failed structural admission; arithmetic and experimental-design instruction violations remained.                                                                                                                           |
| Same E2B prompt on native Metal     |           2 | Visible final answers exactly matched the browser's thinking/greedy results for both probes. This provides a narrow runtime parity check, not proof of parity on every operation/device.                                            |
| Short natural-language prompts, E2B | 2 × 2 modes | Thinking improved the household/volume distinction, but both modes still produced an inadequate cache/order repair.                                                                                                                 |
| Same full prompts on native E4B     |           2 | Household count selection and the evidence boundary improved. The experiment still instructed an identical run order rather than an executable balanced allocation. Browser compatibility and resource use for E4B were not tested. |

The no-thinking V2 output budget was 1,400 tokens and thinking trials allowed 4,096. The baseline responses ended normally below their limit, but the different budgets should still be retained in any replication. The sampled trial used temperature 1, top-k 64, top-p 0.95, seed 7. The shorter-template trial kept those settings. Each trial's JSON is the authority for its actual parameters.

Google documents E2B thinking in its [thinking guide](https://ai.google.dev/gemma/docs/capabilities/thinking) and sampling settings in the [model card](https://ai.google.dev/gemma/docs/core/model_card_4). These comparisons did not establish a generally better setting for this workload. Thinking remains off by default. The trusted runtime option strips the native reasoning channel before streaming or JSON admission; unfinished reasoning is rejected.

## Consequences for the implementation

- Do not promote a task design merely because its JSON parses or its quotations match a source.
- Copying a source ledger is useful provenance work, but is not semantic task design.
- Keep exact arithmetic, source/input identity, task projections, undo and teacher-edit reconciliation deterministic.
- Investigate smaller semantic decisions with explicit operation contracts and independent checks. A constrained JSON decoder could fix syntax failures; it would not fix the incorrect experimental procedures seen here.
- Preserve the first compiler held-out failure separately in `benchmarks/classroom/v2/results/held-out-first.json`. Do not add a template for each exposed case and call the resulting score generalization.
- Neither task-design research protocol is connected to production. There is no measured adapter benefit, no external educational review, and no evidence of improved student learning from these probes.

Only final visible responses are published here. Native internal reasoning, browser storage/device state, credentials and account data are not included in these comparison files.
