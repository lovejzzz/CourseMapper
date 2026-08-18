# EDUTOOL V0.18.2 — Course Plan Review

## Outcome

V0.18.2 makes instructional review a first-class teacher workflow stage:

`Brief → Materials → Review → Generate`

The review no longer competes with the Agent, deliverable tabs, Export, or the editable Course Map. It becomes the primary workspace surface after Scion prepares a plan and before any selected materials are drafted.

## Goal

Make the authorization boundary feel like a natural teacher task: orient quickly, spend attention on uncertainty, inspect lesson intent on demand, and approve the exact plan with a clear consequence.

## Lane

This is a bounded workflow and responsive-UX patch. It changes setup language, review hierarchy, workspace visibility, accessibility focus, and Course Map navigation without changing model weights, evidence admission, compiler semantics, exporters, or grading policy.

## Release Boundary

V0.18.2 may ship only after the exact candidate passes component, architecture, setup-mobile, lint, format, build, bundle, pipeline, and release-history gates; then remote fast verification, deployment, and a live exact-version smoke must pass. A material post-candidate fix requires v0.18.3 rather than silently reusing the version.

## Interaction model

- The teacher sees a course-level structure, throughline, and culminating evidence before lesson detail.
- Decisions and assumptions are presented first and grouped by lesson, so repeated internal records do not exaggerate the review burden.
- Lessons remain collapsed by default and disclose purpose, learner action, evidence, success criteria, and source boundary on demand.
- The primary action says exactly what happens: **Approve plan and generate**.
- **Edit Course Map** opens the canonical editor without dismissing the review. Returning restores the teacher to the review checkpoint, and meaning-changing edits still require refreshed approval.

## Responsive and accessible behavior

- Desktop review uses a centered, distraction-free surface with normal document scrolling.
- Phone review uses one column and a bounded bottom action bar; neither the review nor its controls widen the document.
- The first meaningful state is announced through a focused screen-reader summary without creating a visible focus rectangle on the heading.
- Status is conveyed with text—Confirmed, Inferred, or Needs review—not color alone.

## Acceptance boundary

This release proves workflow placement, visible hierarchy, responsive containment, edit/return behavior, and focused automated contracts. It does not claim instructor approval, accessibility certification, factual certification, or classroom outcomes.
