# Trellis

The side-build candidate pipeline: course graph → judgment → AI voice →
rendered package, graded by CourseMapper's existing instruments.

**The spec lives in [docs/TRELLIS.md](../docs/TRELLIS.md).** Part II is the
build plan; a session resuming cold starts at §19 (bootstrap) and §20
(status ledger). Ground rules (§11) in one line: never touch `src/`
behavior, borrow by import never by copy, all spend through the run ledger,
never grade Trellis with a grader Trellis wrote.

Quick start:

```
npm run trellis:test                                  # token-free suite incl. E0
npm run trellis -- generate --graph fixtures/graphs/researchMethods8.mjs --tier draft --mock
npm run trellis -- generate --syllabus trellis/fixtures/syllabi/cs-python.md --tier draft
```
