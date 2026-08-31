# Publish the Reusable ExecPlan Synchronization Action

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Make the proven ExecPlan-to-GitHub synchronization behavior reusable by repositories of any language without copying LeadEmailFinder's TypeScript scripts or installing its application dependencies. After this change, a repository can check out its plans, invoke the public `TupoSoft/execplan-sync` Action with a short-lived GitHub App token, and observe repository-owned issues mirrored into one organization Project with deterministic statuses.

## Progress

- [x] (2026-08-30) Create the public MIT-licensed repository and implementation branch.
- [x] (2026-08-30) Port the parser and synchronization policy behind repository and Project ports.
- [x] (2026-08-30) Add validated Action inputs and a thin validation-or-sync entry point.
- [x] (2026-08-30) Add compatibility, pagination, configuration, dry-run, and adapter tests.
- [x] (2026-08-30) Document secure installation, permissions, adoption, and recovery.
- [x] (2026-08-30) Validate the source, committed bundle, repository fixture, and a read-only LeadEmailFinder dry run.
- [x] (2026-08-30) Publish pull request #2, assigned to the requesting maintainer and linked to issue #1.
- [x] (2026-08-31) Assign TupoSoft Core as code owner and enforce one independent code-owner approval.

## Plan dependencies

None.

## Surprises & Discoveries

- The repository was created successfully, but `gh repo create --clone` could not use SSH because the host's `/etc/ssh/ssh_config.d/20-systemd-ssh-proxy.conf` permissions were rejected. Cloning the same public repository over HTTPS succeeded without changing repository state.
- TupoSoft is on GitHub Free. A public repository allows both public and private callers and supports stronger repository governance than the existing private shared-workflow repository under the current plan.
- GitHub's versioned Projects v2 REST API uses numeric field and item identifiers, while the older GraphQL and `gh project` interfaces expose node identifiers. Live read-only inspection confirmed that the numeric `Status` field identifier must be supplied to the REST `fields` query.
- Vitest inherited a Windows temporary directory that is not writable from WSL. Running validation with `TMPDIR=/tmp TEMP=/tmp TMP=/tmp` keeps its transform cache inside WSL without affecting CI runners.
- The managed `execplan` label must be the issue authority boundary. Marker text is writable by public issue authors, so synchronization ignores unlabelled lookalikes and fails closed only when a labelled managed issue has a missing, malformed, or duplicate marker.
- Repository-level workflow concurrency cannot serialize traffic from other repositories that share the same App installation. The adapter serializes reads and paces mutations within one invocation, while adopters must stagger or centrally coordinate installation-wide synchronization.
- The authenticated GitHub CLI token initially lacked the `workflow` scope, so GitHub correctly rejected the first push containing CI configuration. After the user explicitly authorized that scope, the same reviewed commit pushed successfully without rewriting it.
- GitHub requires the OAuth `admin:org` scope to attach an organization team to a repository. After explicit authorization, Core received write access and became eligible for CODEOWNERS enforcement without receiving unnecessary repository administration through the team grant.

## Decision Log

- Decision: Publish the implementation in a dedicated public `TupoSoft/execplan-sync` repository under MIT instead of making `TupoSoft/GitHubActions` public.
  Rationale: Public and private repositories can consume it, while internal Swarm and deployment workflows remain private.
  Date/Author: 2026-08-30, user and Codex.
- Decision: Keep plan issues in their source repositories and use the organization Project only as a generated mirror.
  Rationale: Repository ownership, issue permissions, pull-request linking, and existing marker identity remain intact.
  Date/Author: 2026-08-30, Codex.
- Decision: Preserve the existing `<!-- execplan: <feature>/<NN> -->` marker format in version 1.
  Rationale: LeadEmailFinder must adopt the extracted Action without creating duplicate issues.
  Date/Author: 2026-08-30, Codex.
- Decision: Support one explicit organization Project target per invocation in version 1.
  Rationale: One shared delivery board solves organization-wide repository adoption without introducing competing status ownership across boards.
  Date/Author: 2026-08-30, Codex.
- Decision: Configure version 1 entirely through Action inputs and existing environment fallbacks instead of introducing a YAML configuration file.
  Rationale: Inputs are sufficient for one Project target and avoid freezing a second public schema before multiple consumers provide evidence for it.
  Date/Author: 2026-08-30, Codex.
- Decision: Use GitHub's paginated Projects v2 REST API version `2026-03-10` instead of shelling out to `gh` or mixing REST with GraphQL.
  Rationale: The bundled Action then has no caller CLI dependency, handles lists beyond 500 items, and keeps transport behavior behind the Project port.
  Date/Author: 2026-08-30, Codex.
- Decision: Do not add this issue to TupoSoft Project 9.
  Rationale: Live inspection showed that Project 9 is the LeadEmailFinder delivery board, not an organization-wide shared-action board.
  Date/Author: 2026-08-30, Codex.
- Decision: Retry only explicit GitHub rate-limit rejections and leave ambiguous mutation failures for a marker-safe rerun.
  Rationale: Automatically retrying a timed-out non-idempotent create could duplicate an issue or Project item, while `Retry-After` and reset headers provide authoritative retry evidence.
  Date/Author: 2026-08-30, Codex.
- Decision: Require the managed `execplan` label before adopting an existing issue.
  Rationale: Public issue authors control issue body marker text but cannot apply repository labels; marker-only adoption would let an untrusted author redirect synchronization into their issue.
  Date/Author: 2026-08-30, Codex.
- Decision: Make `@TupoSoft/core` the sole code owner and require one matching approval on the default branch.
  Rationale: Team ownership avoids a single-maintainer review boundary, while explicit write access is the least privilege GitHub accepts for CODEOWNERS eligibility.
  Date/Author: 2026-08-31, user and Codex.

## Outcomes & Retrospective

The reusable Action, pure parser, narrow GitHub ports, paginated REST adapter, committed bundle, tests, CI, and secure adoption guidance are implemented and delivered in pull request #2. A read-only run against the live LeadEmailFinder `master` and Project 9 found all 70 plans unchanged, with no creates, updates, or orphans. The public repository also has full-SHA Action restrictions, protected default-branch and release-tag rulesets, secret scanning, private vulnerability reporting, and automated dependency security updates. The pull request's required `Quality` check passed on implementation commit `015ee500ad9bc29c4720440b7c277143453a4f83` and on CODEOWNERS commit `52d6e2e527d4cd76dbf81f8c2afac93ad3e9ec03`.

No release tag is published yet. TupoSoft Core now has explicit repository write access, owns every path through `.github/CODEOWNERS`, and is requested on pull request #2. Default-branch ruleset `21876418` requires one approval from a matching code owner in addition to the strict `Quality` check, so the pull request remains intentionally blocked until a Core teammate reviews it.

## Context and Orientation

LeadEmailFinder currently owns `scripts/plans/execplan.ts`, `sync.ts`, `github-project-api.ts`, and `sync-project.ts`. The parser derives stable `<feature>/<NN>` keys, validates dependency graphs, maps readiness and progress to `Backlog`, `Todo`, `In Progress`, or `Done`, and renders generated issue bodies. The synchronizer creates or updates repository issues, adds them to TupoSoft Project 9, advances Project status, preserves assigned work already in progress, and never moves completed items backward.

The current workflow installs LeadEmailFinder's complete pnpm dependency graph and invokes a repository-local script. Its entry point assumes its own source directory is the target workspace, hard-codes LeadEmailFinder defaults, shells out to `gh`, and loads at most 500 issues or Project items. Those constraints prevent safe organization-wide use.

This repository initially contains only its MIT license and README. The implementation must establish its own toolchain, tests, Action bundle, workflows, agent guidance, and ExecPlan contract.

## Scope and Non-Goals

Create a public JavaScript Action that validates and synchronizes repository-owned ExecPlans into one organization Project. Preserve current parsing, dependency, marker, status-protection, and dry-run semantics while making repository, workspace, Project field, and status option names configurable. Use paginated GitHub APIs and short-lived caller-supplied tokens.

Do not migrate LeadEmailFinder in this pull request, publish an npm package, host a webhook service, synchronize Project fields other than status, infer multiple Project targets, close orphaned issues, or support cross-repository dependencies. Those changes require independent plans and pull requests.

## Plan of Work

Establish a TypeScript Node 24 project with deterministic npm dependencies, formatting, linting, tests, type checking, and an `@vercel/ncc` bundle. Port the pure parser and state resolver with compatibility tests. Represent logical plan states independently from configured Project option names.

Define narrow repository-issue and Project-board ports. Keep orchestration in the synchronizer, including duplicate-marker preflight, label ownership, issue creation and update, Project membership, dry-run reporting, assigned-in-progress protection, and completed-item protection. Implement the ports with paginated GitHub REST APIs.

Define validated Action inputs for the plans directory, source repository and ref, Project owner and number, status field and mapping, generator name, and dry-run flag. The Action entry point reads only the caller workspace and Actions context, validates before mutation, and requires a token only in sync mode. Document tokenless pull-request validation separately from authenticated default-branch synchronization so each caller retains control of its triggers, concurrency, and GitHub App secret.

Add focused unit and adapter-contract tests, a real repository fixture, a bundled-output freshness check, and CI. Document the GitHub App permissions, caller workflow, secret boundary, SHA pinning, dry-run adoption, idempotence, and recovery. Finally, run the public Action's dry-run path against LeadEmailFinder using the current authenticated user token without performing writes.

## Interfaces and Dependencies

Public Action inputs are `mode` (`validate` or `sync`), `github-token`, `workspace`, `plans-directory`, `repository`, `source-ref`, `project-owner`, `project-number`, `status-field`, the four logical status mappings, `issue-generator`, and `dry-run`. Repository, source ref, and workspace have GitHub Actions context defaults; the legacy `PLANS_*` environment variables remain supported for migration. The Action exposes summary outputs for plan, created, updated, unchanged, and orphaned counts.

Runtime dependencies are limited to the official GitHub Actions core and GitHub/Octokit libraries. Development dependencies provide TypeScript, ESLint, Prettier, Vitest, and the committed `@vercel/ncc` Action bundle.

## Acceptance Criteria

- A non-Node repository can validate and synchronize plans without installing its own dependencies.
- Existing LeadEmailFinder markers resolve to existing issues; a dry run proposes no duplicate issue creation.
- The parser rejects malformed headings, missing dependencies, duplicate keys, missing dependency keys, and cycles before GitHub mutation.
- Logical states map to configured Project status names, and missing fields or options fail before issue writes.
- REST pagination handles more than 500 issues or Project items.
- Duplicate issue markers fail explicitly instead of selecting an arbitrary issue.
- Dry-run mode performs no label, issue, Project-item, or status mutation.
- Assigned `In Progress` items do not move backward, and `Done` items never reopen.
- Validation mode requires no GitHub App credential and makes no network request.
- The committed JavaScript bundle is reproducible from reviewed sources and CI detects drift.
- Documentation provides a least-privilege GitHub App and a full-SHA-pinned caller example.

## Validation

Run `npm ci`, `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, and `npm run bundle:check`. Under WSL, prefix Vitest-bearing commands with `TMPDIR=/tmp TEMP=/tmp TMP=/tmp`. Run the Action locally in validation mode against this repository's checked-in plan. Run sync in dry-run mode against LeadEmailFinder and verify that every existing plan marker matches an existing issue or is reported accurately, with zero writes.

Inspect the final dependency licenses and bundled files, run `git diff --check`, and review the complete diff for secret exposure, organization-specific defaults, port leakage, and generated-output drift.

## Idempotence and Recovery

Markers make repeated synchronization stable, and unchanged issues or statuses receive no writes. Configuration and plan validation complete before mutation. A failed partial run can be retried after correcting credentials, Project schema, or source metadata. The synchronizer reports orphaned generated issues but does not close or archive them in version 1.

Revert the implementation pull request to remove the Action. Existing repository issues and Project items remain valid because their markers and source ownership do not depend on this repository. Consumers pin an immutable commit and therefore opt into upgrades explicitly.

## Artifacts and Notes

Validation evidence from 2026-08-30:

- `TMPDIR=/tmp TEMP=/tmp TMP=/tmp npm run check` passed: six test files and 88 tests, plus Prettier, ESLint, TypeScript, and a clean bundle rebuild.
- `node --check dist/index.js` passed. The minified Action bundle is approximately 636 kB and its generated runtime license manifest is approximately 30 kB.
- The bundled runtime license review found MIT, Apache-2.0, and ISC dependencies; the Apache-2.0 component ships no separate `NOTICE` file.
- `npm pack --dry-run` passed with the writable npm cache override and produced no archive.
- The bundled Action validated this repository's checked-in bootstrap plan without a token.
- A dry run against live LeadEmailFinder `master` commit `4779625c376a926d71e86e2122a1d1eee3931bec` reported 70 unchanged plans, zero creates, zero updates, zero orphans, and no proposed status changes.
- Bootstrap issue: <https://github.com/TupoSoft/execplan-sync/issues/1>.
- Implementation commit: `015ee500ad9bc29c4720440b7c277143453a4f83`.
- Pull request: <https://github.com/TupoSoft/execplan-sync/pull/2>.
- GitHub Actions `Quality` check: passed in 28 seconds on the implementation commit.
- TupoSoft Core: explicit `push` permission, sole CODEOWNERS team, and requested reviewer on pull request #2.
- Default-branch ruleset `21876418`: one approval and code-owner review required with no bypass actors.

Never record a token, private key, authorization header, or secret value.

## Plan readiness

Ready to implement.
