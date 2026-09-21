# Direct course MCP — v0.20.01

The normal website no longer presents the independent AI authoring request/draft workflow. Open a course, click **MCP**, and enable **Allow MCP to read and edit the open course in this tab**. Use a browser AI host that exposes native WebMCP page tools (such as the supported Codex browser environment).

This is browser WebMCP, not an HTTP MCP endpoint that can be pasted into an ordinary ChatGPT connector. The panel explicitly reports browsers without page-tool support. No new OAuth or AI identity connection is needed for this page connection.

## Tools

- `cm_course_status`: connection and open-course status without course content.
- `cm_course_read`: current course map and material data, an opaque revision, and existing editable text paths. It excludes account credentials, attachment contents, and conversation history.
- `cm_course_edit`: `{ expectedRevision, operationId, changes: [{ path, value }] }`. Uses the revision and paths from a fresh read. Edits up to 50 existing text fields, maximum 20,000 characters each. IDs, structure, adding/removing lessons and arbitrary project metadata are not editable.
- `cm_course_undo`: `{ expectedRevision, operationId }`. Restores the last MCP edit only while the course still matches its committed content. Also available as **Undo last MCP edit** in the panel.

An edit is immediately visible and uses the existing persistence owner, including exact IndexedDB fallback and cloud account/ownership checks. `localSave: saved` means exact local persistence confirmed; `failed` means the edit remains visible but needs a backup. Cloud sync remains separately reported by the website. No model call is made by these tools.

Repeat an identical operation ID to obtain its receipt without applying it again. Changed arguments with the same ID, stale revisions, incomplete/invalid batches, concurrent generation, revoked access, and unsupported paths are rejected. Course text is untrusted reference data, never instructions to the AI.

Course-map edits mark linked materials stale; content edits clear outdated package-quality evidence and blueprint approval. Authored material overrides remain preserved for reopening and export. Reloading, disabling the switch, and changing accounts revoke page access. Undo and retry receipts last only for the current connection.

## Legacy compatibility

Previously authored courses and stored draft data are not deleted. The legacy request/draft UI is only reachable in a Vite development compatibility fixture at `?authoring=1`; production tree shaking excludes that panel. Existing remote authoring storage and endpoints are retained for compatibility, not presented as this new direct connection. Their retirement or migration is separate from removing the website workflow.

## Verification

`tests/authoring/directCourseMcp.test.js` tests validation, revision conflicts, retry receipts, undo, save failures, revoked access/account changes and registration lifecycle. `tests/production-export.spec.js` exercises the real built editor and persistence with an instrumented browser registration host. That automated host verifies product behavior; native discovery, read, direct edit, exact local-save receipt, undo to the original revision, and revoked-access rejection were also verified through Codex’s actual browser WebMCP interface using a disposable course.
