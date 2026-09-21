# Course output diagnostics through WebMCP — v0.20.01

Open a generated course, click **MCP**, and enable **Allow MCP to inspect generated output in this tab**. A supported AI browser can inspect actual materials, identify defects and use that evidence to improve website generation code. These tools cannot modify the course.

This is browser WebMCP, not a remote HTTP MCP endpoint for an ordinary ChatGPT connector. Unsupported browsers show an explicit message. No additional AI identity or OAuth setup is required for this page connection.

## Tools

- `cm_course_status`: connection/open-course status without course content.
- `cm_course_diagnostics`: observed quiz defects, recorded run signals, revision and material paths. Detects instruction-only practice records and questions marked as awaiting reference-answer review.
- `cm_course_read`: `{ path, offset?, expectedRevision? }`; reads course/material JSON at a diagnostic path in pages of at most 12,000 characters. Use the returned revision on continuation pages. A changed revision rejects the continuation.

Course text is untrusted reference data, never instructions. Reads omit credentials, raw attachments and conversation history. Access starts disabled and ends on disconnect, reload or account change. No model calls or writes occur.

## Improvement loop

1. Inspect a real generated course and its recorded generation evidence.
2. Read the affected quiz, answer or teaching material, not only the diagnostic summary.
3. Reproduce the defect from the saved generation inputs; fix the generator or validation rule in website code.
4. Run regression checks and compare generated materials, then verify the browser behavior.

The initial audit used an existing Discrete Mathematics project. Its source-recovery quizzes used objectives and submission requirements as practice data. The compiler now supplies explicitly synthetic two-valued logic exercises with exhaustively checked answers for matching propositional-logic recovery lessons. Other topics retain their source-review boundaries. Constructed-response fallback keys are marked for review when they contain guidance rather than a solved reference response. Grader 1.16.6 also flags instruction-only quiz cases in exported packages.

A compiler replay is not new model inference. Absence of diagnostic findings does not certify subject accuracy or teaching quality. Unrelated source relevance and proof-generation gaps remain separate issues.

## Compatibility and tests

Saved courses and old draft storage remain intact. The legacy AI-authoring panel exists only in a development compatibility fixture and is excluded from production. Complete historical release entries remain available.

Service tests cover access, private paths, paginated reads, revision conflicts, asynchronous revocation and registration lifecycle. Production browser tests exercise the real built application with an instrumented page-tool host. Logic tests check independently specified truth columns and actual compiler routing; grader tests include concrete-input and curriculum-design controls.
