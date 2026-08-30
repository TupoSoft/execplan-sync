# ExecPlan Contract

An ExecPlan is a self-contained, living design document that an engineer or coding agent can follow to deliver one working pull request without relying on conversation history.

## How to use ExecPlans

Create one ExecPlan for every significant implementation task. Store it under `.agents/plans/<feature>/` and keep any feature `README.md` limited to task order, dependencies, shared constraints, and links.

Update the plan at every meaningful stopping point. Record unexpected findings in `Surprises & Discoveries`, decisions and their rationale in `Decision Log`, and the delivered result in `Outcomes & Retrospective`. The file must remain sufficient for another engineer to resume from it alone.

Each ExecPlan corresponds to exactly one pull request. Put independently useful follow-up work in another ExecPlan instead of silently expanding the current plan.

## Required structure

Every ExecPlan uses these sections:

- `Purpose / Big Picture` explains the observable outcome.
- `Progress` contains timestamped checkboxes and is the only required checklist.
- `Plan dependencies` lists prerequisite keys as ``- `<feature>/<NN>` `` or `None.`.
- `Surprises & Discoveries` records concise evidence or `None yet.`.
- `Decision Log` records material decisions, rationale, date, and author.
- `Outcomes & Retrospective` compares the delivered result with the purpose.
- `Context and Orientation` explains the current system without conversation history.
- `Scope and Non-Goals` fixes the pull-request boundary.
- `Plan of Work` describes the ordered implementation.
- `Interfaces and Dependencies` names public contracts, configuration, and dependencies.
- `Acceptance Criteria` states observable pass-or-fail behavior.
- `Validation` names exact commands and scenarios.
- `Idempotence and Recovery` explains repetition, retry, and rollback.
- `Artifacts and Notes` retains only evidence needed to resume or verify.
- `Plan readiness` ends with `Ready to implement`, `Ready after <decision>`, or `Blocked by <evidence>`.

Use the exact sentence-case headings `## Plan dependencies` and `## Plan readiness`; the parser treats them as part of the public schema.

## Quality requirements

Plans must preserve unrelated behavior, keep credentials out of source and logs, cover relevant failure and concurrency behavior, state observable acceptance criteria separately from validation commands, and avoid claiming validation passed before it actually completed.
