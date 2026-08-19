# EDUTOOL v0.18.3 — Seamless Best-Available Generation

## Goal

Deliver the best package Scion can produce without transferring responsibility
for Scion's intermediate planning decisions to the teacher.

## Product decision

Teachers should describe the course, choose the materials they want, and receive
the best package Scion can produce. Reviewing and approving Scion's intermediate
instructional blueprint is not a teacher task.

The setup journey is therefore:

1. Brief
2. Materials
3. Generate

## Internal quality boundary

Removing the visible checkpoint does not remove plan-first generation. Before
any selected material is drafted, Scion still:

- builds the lesson-specific instructional blueprint;
- binds it to the exact Course Map hash;
- checks whether the plan is eligible to run;
- creates the signed approval receipt used by downstream generation;
- records the exact execution map after build-owned enrichment; and
- blocks the package if the plan cannot earn internal authorization.

The difference is ownership: Scion is accountable for this quality decision.
The teacher is not asked to approve weak or generic intermediate work.

## Compatibility

A v0.18.2 project saved on the former approval screen automatically continues
through the internal planning and generation workflow when restored. It does not
reopen the retired checkpoint.

## Lane

This is a setup-orchestration and recovery lane. It removes a user-facing pause
while retaining the existing plan-first compiler authority and evidence gates.

## Release Boundary

This patch changes setup orchestration, recovery, and presentation. It does not
change model weights, evidence admission, compiler output schemas, exporters,
or package grading policy.
