# CourseMapper Agent Real-Life Scenario Audit

Date: 2026-06-04
Scope: Agent behavior, local command UX, no-key fallback behavior, and landing-screen readability
Primary live model: `gpt-5.4-mini` through the private local OpenAI API file

## Summary

The agent passed 20 live real-life scenarios against OpenAI. The first set covers common instructor tasks: asking factual questions, adding content, checking quality, producing receipts, editing the course map, expanding scope, saving preferences, checking alignment, improving active deliverables, and refusing to fabricate edits for missing deliverables. The second set adds research, grammar checking, concept maps, charts, lesson reads, quiz cognitive-level review, slide-deck visual improvement, reusable custom macros, undo, and missing-assignment safety.

The main product issue found was UX, not model quality: when AI was not configured, local Agent commands were available but the typed natural-language command matcher was too strict. Real users typing polite requests like "can you audit this package?" could get stuck behind the disabled chat path instead of seeing the local Audit command. That is fixed.

## 20 Live Agent Scenarios

|   # | Scenario                                                                | Expected behavior                                                        | Result |
| --: | ----------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------ |
|   1 | "How many lessons does this course have?"                               | Answer directly with the correct count.                                  | Pass   |
|   2 | "Add a new multiple choice question about gradient descent to Lesson 3" | Propose or apply a quiz-bank change against the right deliverable.       | Pass   |
|   3 | "Check my course for any issues or alignment problems"                  | Use validation or package-finalization tools instead of generic advice.  | Pass   |
|   4 | "Run validate_course..." in read-only mode                              | Produce an auditable receipt with no key leakage.                        | Pass   |
|   5 | "Rename Lesson 2..."                                                    | Target lesson index 1 and update only the title field.                   | Pass   |
|   6 | "Expand the course map from 3 to 5 lessons"                             | Append exactly two concrete lessons and keep existing lessons unchanged. | Pass   |
|   7 | "Remember that I always want Bloom's level Apply or higher"             | Save the preference through memory/preference tooling.                   | Pass   |
|   8 | "Are the quiz questions aligned with the lesson plan objectives?"       | Use alignment, validation, finalization, or relevant read tooling.       | Pass   |
|   9 | Command-strip Improve Lesson Plans prompt                               | Treat command-strip text as actionable agent work.                       | Pass   |
|  10 | "Add a rubric criterion..." when rubrics are not generated              | Do not fabricate rubric edits against a missing deliverable.             | Pass   |
|  11 | "Find two academic sources on random forests..."                        | Use academic research tooling with a relevant query.                     | Pass   |
|  12 | "Check grammar across the course map..."                                | Run the grammar checker instead of generic advice.                       | Pass   |
|  13 | "Make a concept map connecting the three lessons..."                    | Return a Mermaid diagram response grounded in course lessons.            | Pass   |
|  14 | "Show me a chart of quiz question counts by lesson."                    | Return a chart or read quiz data before charting.                        | Pass   |
|  15 | "Use read_lesson to inspect Lesson 2..."                                | Read Lesson 2 with the correct 0-based tool index.                       | Pass   |
|  16 | "Review the Lesson 3 quiz bank..."                                      | Read the Lesson 3 quiz bank before judging cognitive level.              | Pass   |
|  17 | "Make Lesson 1 slides more visual..."                                   | Target the generated slide deck, not unrelated deliverables.             | Pass   |
|  18 | "Create a reusable helper called quiz_alignment_check..."               | Register a custom macro for repeatable alignment work.                   | Pass   |
|  19 | "Undo the last change."                                                 | Call the undo tool directly.                                             | Pass   |
|  20 | "Add an assignment brief..." when assignments are not generated         | Do not create ghost assignment edits.                                    | Pass   |

Verification command:

```bash
while IFS='=' read -r key value; do
  case "$key" in
    OPENAI_API_KEY) export "$key=$value" ;;
  esac
done < /Users/tianxing/Documents/NYU/NYUsliver/CourseMapper/API-dontComit/api.ev
OPENAI_MODEL=${OPENAI_MODEL:-gpt-5.4-mini} npx vitest run tests/agent-openai.test.js --reporter=verbose
```

Result: `20 passed`.

## UX Fixes Made

### Natural local commands

Fixed local command matching so no-key users can type polite real-world requests and still trigger local Agent actions:

- "can you audit this package?"
- "please check my course for issues"
- "please finish this package"
- "can you help me plan the next step?"
- "can you undo that last change?"
- "switch me to review only"
- "go back to auto fix"
- "show me agent commands"

The matcher remains conservative. It still avoids hijacking ordinary explanatory questions such as "can you explain what an audit checks?" or long content-editing messages that should go to the model when AI is configured.

### Review-package action label

Changed the review-only package action button from `Review only` to `Review package`. The old label duplicated the mode toggle and did not describe the action being run.

### Release label drift

The in-app footers still displayed `v0.8.1` after the release metadata and changelog moved to `v0.8.2`. Browser inspection caught this on the landing screen. App footer labels now show `v0.8.2` on Landing, Feature Select, Configure, and Workspace.

### Landing-screen contrast

The browser visual pass showed the default/no-key landing screen reading too faintly, especially the prompt placeholder, file helper text, footer links, and inactive model field. Tightened contrast on those states without changing layout or generation behavior.

## Bug Fix Evidence

Focused local verification:

```bash
npx vitest run src/components/chat/__tests__/AgentCommandStrip.test.jsx src/components/chat/__tests__/ChatInput.test.jsx
```

Result: `39 passed`.

No-key browser-path verification:

```bash
npx playwright test tests/agent-no-key.spec.js
```

Result: `3 passed`.

Live verification:

```bash
OPENAI_MODEL=${OPENAI_MODEL:-gpt-5.4-mini} npx vitest run tests/agent-openai.test.js --reporter=verbose
```

Result: `20 passed`.

Static verification:

```bash
npm run format:check
npm run lint
npm run build
git diff --check
```

Result: all passed.

Broad Vitest verification:

```bash
npm test -- --reporter=dot
```

Result: `136 passed`, `15 skipped`; `1,785 passed`, `139 skipped`.

Release-gate verification:

```bash
npm run audit:self
npm run audit:pipeline
npm run audit:gold
npm run bundle:check
```

Result: all passed. `audit:gold` passed all 40 curated samples.

## Remaining Watch Items

- The Anthropic-only quality probes still exist and cover deeper multi-turn behavior, but this pass used OpenAI because the project already has a private OpenAI API file workflow.
- The live OpenAI suite validates first-call behavior for most scenarios; only the receipt scenario drives the actual app agent loop. More full-loop OpenAI scenarios would be useful if we want to test state mutation end-to-end for every provider.
- No external expert review is implied by this audit.
