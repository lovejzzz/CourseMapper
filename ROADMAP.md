# CourseMapper Roadmap

## Product Direction

CourseMapper is moving toward a "consider it done" course-production agent. The user should describe the course, choose scope/materials, and receive a finished draft package. The agent owns generation, QA, repair, alignment, and export readiness. Human involvement should be final approval only, not QA labor.

## v0.7 - God-Mode Delivery Release

Goal: make the website feel like an autonomous course package producer, not a prompt-and-review tool.

1. One primary course-package flow: describe the course, choose scope, generate, receive package.
2. Agent-owned quality loop after generation: completeness check, readiness check, cross-deliverable validation, safe repair, recheck.
3. Safe auto-repair before presentation: missing metadata, inconsistent quiz points, unsupported FAQ categories, short slide notes, rubric coverage, publishability placeholders.
4. Targeted retry without asking: regenerate only weak lessons or deliverable sections when validation identifies local failure.
5. Final "Done Package" handoff: generated materials, agent fixes, remaining assumptions, and export actions in one simple view.
6. Internal scores hidden by default: user sees confidence states like Excellent, Good with assumptions, Needs attention.
7. Model auto-routing: use cost-efficient models first and escalate only after failed quality/repair passes.
8. Export auto-test: verify ZIP/PPTX/DOCX/CSV paths before claiming the package is ready.
9. No fake chat labor: background agent work must not appear as user-authored prompts.
10. Simpler UI: fewer expert controls in the main path; advanced controls remain available but out of the way.

## v0.8 - Autonomous Classroom Package Release

Goal: make CourseMapper credible for real classroom pilots while keeping the agent in charge.

1. Institution profile memory for school policies, grading language, accessibility defaults, AI policy, and course logistics.
2. Agent-filled classroom policies using the institution profile and safe defaults.
3. Reading and citation agent that finds, cites, and formats readings instead of emitting vague reading lists.
4. Canvas-oriented LMS package structure: modules, pages, assignments, quizzes, rubrics, and files.
5. Full-course consistency agent across syllabus, assignments, rubrics, quizzes, slides, study guides, and FAQ.
6. Multi-pass autonomous improvement runs until target quality is reached or a true blocker remains.
7. Finished package report: generated, repaired, verified, assumptions.
8. Minimal escalation: ask only for official dates, official policies, copyrighted readings, or instructor-specific constraints.
9. Versioned package handoff so users can recover prior generated packages.
10. Public demo packages showing polished complete outputs across multiple subjects.

## Current v0.7 Focus

Implement a built-in package finalizer that the agent can call in one step: repair safe issues, rerun readiness, rerun course health validation, and return a concise delivery confidence state before presenting anything to the user.
