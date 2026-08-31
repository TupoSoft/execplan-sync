# Prepare the Stable v1.0.0 Release

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Prepare ExecPlan Sync for its first supported stable release only after real adoption proves the write path,
credential boundary, and idempotent rerun. After this work, the repository has a Core-reviewed merge candidate with
stable documentation, security checks, and release instructions. Once that pull request merges, a maintainer can
publish immutable `v1.0.0` from the exact green merge commit.

## Progress

- [ ] (2026-08-31) Link successful LeadEmailFinder migration, unchanged rerun, and credential-safe canary evidence.
- [ ] (2026-08-31) Add pinned CodeQL analysis for the JavaScript and TypeScript source and make its result enforceable.
- [ ] (2026-08-31) Reconcile pilot discoveries with version 1 documentation without expanding the public contract.
- [ ] (2026-08-31) Set version `1.0.0` and document stable support, changes, compatibility, and known limitations.
- [ ] (2026-08-31) Run source, bundle, security, documentation, and clean-checkout release validation.
- [ ] (2026-08-31) Deliver one Core-reviewed stable-release pull request with required checks green.

## Plan dependencies

- `release/01`

## Surprises & Discoveries

- Code scanning is not configured even though the repository is a public token-bearing GitHub Action. Secret scanning,
  push protection, Dependabot security updates, private vulnerability reporting, full-SHA Action policy, Core review,
  and protected version tags are already enabled.
- At authoring time, repository-level immutable releases are disabled. Plan `release/01` must enable them before
  `v0.1.0`; this plan verifies that the protection remains active before stable publication.
- Unit and adapter tests, the bundled validation smoke test, and a read-only Project 9 dry run establish strong
  pre-release evidence, but none proves the final consumer GitHub App path or a successful live write followed by an
  unchanged rerun.
- The repository's version 1 boundaries already exclude multiple Project targets, cross-repository dependencies,
  automatic orphan cleanup, and management of human-owned Project fields. Stable publication does not require those
  features.

## Decision Log

- Decision: Require linked live-adoption evidence before stable publication.
  Rationale: Passing CI and a dry run cannot prove installation permissions, environment or broker configuration,
  mutation behavior, legacy-writer cutover, or the second-run idempotence contract.
  Date/Author: 2026-08-31, Codex.
- Decision: Add CodeQL before `v1.0.0` and require its stable check only after the workflow has produced a known check
  context.
  Rationale: Static analysis is proportionate hardening for a public Action that receives privileged tokens, while
  adding an unobserved required context prematurely could block every pull request.
  Date/Author: 2026-08-31, Codex.
- Decision: Preserve the documented version 1 boundary unless pilot evidence identifies a correctness or security
  blocker.
  Rationale: Stable means the documented narrow contract is supportable; it does not require speculative Project
  fields, lifecycle automation, or multi-repository orchestration.
  Date/Author: 2026-08-31, Codex.
- Decision: Require immutable releases from the first prerelease and verify the setting again before `v1.0.0`.
  Rationale: Stable release metadata and assets must retain the same supply-chain protection established by
  `release/01`; a disabled setting blocks publication.
  Date/Author: 2026-08-31, Codex.
- Decision: Publish only immutable semantic-version tags and continue recommending full-SHA consumer pins.
  Rationale: Stable support does not justify silently changing code behind a previously reviewed workflow reference.
  Date/Author: 2026-08-31, Codex.
- Decision: Leave Marketplace publication outside this pull request.
  Rationale: Marketplace discoverability is optional for organization adoption and can occur after the stable release
  is verified without changing the Action contract.
  Date/Author: 2026-08-31, Codex.

## Outcomes & Retrospective

Not started.

## Context and Orientation

Plan `release/01` establishes `RELEASING.md`, correct prerelease documentation, and compatible dependency-update
policy. Its post-merge procedure enables immutable releases and publishes the `v0.1.0` prerelease. The Action runs on
Node 24 from committed `dist/index.js`; `src/` remains the reviewed source of truth, and `npm run check` proves
formatting, linting, types, tests, and bundle reproducibility.

The stable release is gated by evidence outside this repository. LeadEmailFinder currently owns the legacy
ExecPlan-to-Project 9 writer and is the compatibility pilot. Its adoption plan must pin the prerelease SHA, run
tokenless pull-request validation, perform an authenticated dry run, stop the legacy writer, complete one live
synchronization, and prove an unchanged rerun. A credential-safe canary must also exercise the current GitHub Issues
and Projects APIs without exposing private source content or an organization-wide private key.

`README.md` currently labels the Action as under active development and already documents the intended version 1
boundaries. `SECURITY.md` starts stable support at `v1.0.0`. `package.json` remains at the prerelease version until this
plan. `.github/workflows/ci.yml` provides `Quality`; this plan adds CodeQL with every third-party workflow dependency
pinned to a full commit SHA.

## Scope and Non-Goals

Add CodeQL workflow coverage, incorporate concrete pilot findings that affect documented safety or recovery, set the
repository version to `1.0.0`, prepare stable release notes or a changelog, and update the active-development and
supported-version language. Update the default-branch ruleset to require the observed CodeQL check once it is known to
pass. This pull request ends at a verified release-ready state; privileged `v1.0.0` publication follows
`RELEASING.md` after merge and does not require a second pull request to update this plan.

Do not add new synchronization features, change existing Action inputs or outputs without evidence of a release
blocker, manage additional Project fields, close orphaned issues, support multiple targets, build a central
coordinator, migrate another consumer, publish an npm package, create a movable `v1` tag, or list the Action in
Marketplace. Any pilot-discovered runtime defect must be fixed with focused tests and documented explicitly; an
independently useful enhancement becomes another ExecPlan and pull request.

## Plan of Work

Begin by recording immutable links to the prerelease, the LeadEmailFinder adoption pull request, its authenticated
dry run, its first live synchronization, the unchanged rerun, and the credential-safe canary. Review the runs for
unexpected issue changes, orphan reports, Project status changes, permission broadening, secret exposure, and private
data in public logs. If any correctness or security issue remains, stop and create or complete the focused fix before
continuing the stable-release work.

Add `.github/workflows/codeql.yml` for JavaScript and TypeScript analysis on pull requests, default-branch pushes, and
a conservative schedule. Pin checkout and every CodeQL Action invocation to reviewed full commit SHAs, grant only the
documented security-events and contents permissions, apply bounded concurrency and timeouts, and avoid access to any
consumer credential. Let the workflow produce its check context successfully before updating the active default-branch
ruleset to require it.

Change `package.json` to `1.0.0` and update the lockfile through npm rather than manual lockfile editing. Add stable
release notes, preferably in `CHANGELOG.md`, summarizing the public contract, security model, migration evidence,
known version 1 limitations, and full-SHA pinning policy. Update `README.md`, `SECURITY.md`, and `RELEASING.md` so they
agree on stable support and the exact publication process. Do not soften recovery or credential warnings merely to
remove prerelease language.

Run the validations below on the reviewed branch and update this plan's Outcome with the release-ready evidence before
merge. `RELEASING.md` must direct the later publisher to wait for the exact merge commit and successful post-merge
`Quality` and CodeQL checks, use a clean checkout, confirm immutable releases remain enabled, and review a draft before
publishing `v1.0.0`. The publisher records the final evidence in the immutable GitHub Release and a comment on the
merged pull request rather than changing this plan through another pull request.

## Interfaces and Dependencies

The public Action inputs, outputs, marker format, label authority, status mapping, REST API version selection, and
one-way synchronization semantics remain compatible with `v0.1.0` unless pilot evidence proves a blocking defect.
Any required defect fix stays inside the existing ports and receives focused regression coverage plus a rebuilt
`dist/` bundle.

Expected files are `.github/workflows/codeql.yml`, `package.json`, `package-lock.json`, `README.md`, `SECURITY.md`,
`RELEASING.md`, `CHANGELOG.md`, and this ExecPlan. The remote default-branch ruleset gains the observed CodeQL check
after that check exists. The remote immutable-release setting remains enabled before publication. Release publication
depends on the existing Core CODEOWNERS enforcement, strict `Quality` check, protected `v*` tags, and the immutable
`v0.1.0` process established by `release/01`.

## Acceptance Criteria

- The plan links a successful LeadEmailFinder dry run, live synchronization, and second unchanged run using the
  reviewed prerelease SHA and the approved credential boundary.
- Canary evidence exercises authenticated repository Issue and organization Project access without mutating an
  unintended target, disclosing a credential, or writing private plan content to a public log.
- CodeQL runs for pull requests and `master`, uses only pinned Actions and least-privilege permissions, passes on the
  reviewed pull-request head, and becomes a required default-branch check only after its check context is observed.
- `package.json` and `package-lock.json` agree on version `1.0.0`; the locked dependency graph installs without bypassing
  peer dependency validation.
- `README.md`, `SECURITY.md`, release documentation, and stable release notes agree on supported versions, the exact
  public contract, recovery behavior, credential boundaries, and known version 1 limitations.
- `npm run check` passes from a clean checkout and proves the committed bundle corresponds to reviewed source and the
  locked runtime dependencies.
- The stable-release pull request receives Core approval; required `Quality` and CodeQL checks pass on its reviewed
  head commit; no unrelated feature or organization-specific default enters the Action runtime.
- `RELEASING.md` requires successful checks on the merge commit, verified immutable-release enforcement, a clean
  release checkout, draft review, and `gh release verify v1.0.0 --repo TupoSoft/execplan-sync` after publication.
- The procedure requires stable `v1.0.0` to target the approved merge commit and its release notes to contain the exact
  full SHA and verification evidence.
- No existing release tag moves, no movable `v1` tag is created, and no npm or Marketplace publication occurs.

## Validation

Verify every prerequisite URL with read-only GitHub queries and retain the run identifiers for the LeadEmailFinder
dry run, live run, unchanged rerun, and canary. Confirm that the consumer workflow references the exact `v0.1.0`
commit SHA and that only the intended issues, labels, Project membership, and status field were considered or changed.

Run `npm ci`, `npm run check`, and `git diff --check`. Review `git diff -- dist` after the build and inspect
`dist/licenses.txt` whenever the locked runtime dependency graph changes. Run CodeQL through the pull-request workflow
and inspect its alerts; a successful workflow with unresolved actionable alerts does not satisfy this plan. Confirm
that all workflow `uses:` entries are full 40-character SHAs and that workflow permissions contain no write access
other than CodeQL's required security-event upload.

Before merging, inspect the documented post-merge sequence and its exact commands. It must inspect `Quality` and
CodeQL on the merge commit, run `npm ci && npm run check` from a clean checkout of that commit, confirm `package.json`
reports `1.0.0`, and require `gh api repos/TupoSoft/execplan-sync/immutable-releases` to report enabled. It must create
and review the draft stable release before publication, then use `git ls-remote --tags origin refs/tags/v1.0.0`, `gh
release view v1.0.0 --repo TupoSoft/execplan-sync`, `gh release verify v1.0.0 --repo TupoSoft/execplan-sync`, and a
read-only commit query to prove that the tag, release target, immutable release, and recorded 40-character SHA agree.

## Idempotence and Recovery

Prerequisite inspection, CodeQL, local checks, and clean-checkout validation are safe to repeat. A failed CodeQL run
blocks release and is corrected through the same pull request or a focused predecessor; do not add a failing or
unknown check context to the ruleset. Package and documentation changes can be reverted normally before publication.
The immutable-release setting is expected to exist from `release/01`. If it has been disabled, stop publication and
restore the reviewed protection before drafting the release. Review the draft carefully because publication locks the
release-specific tag and assets.

Check for an existing `v1.0.0` tag and release before creating either. If the protected tag exists and is correct but
release-object creation failed, resume by publishing the release for that exact SHA. If released code is defective,
leave `v1.0.0` immutable, document the impact, fix it through a new reviewed pull request, and publish `v1.0.1`.
Consumers remain on their pinned SHA until they explicitly review and select the fixed release.

## Artifacts and Notes

Record the `v0.1.0` release, consumer adoption issue and pull request, dry-run/live/rerun and canary URLs, CodeQL
workflow and ruleset evidence, stable-release pull request head, Core review, and required pull-request checks here
before merge. The later publisher records the merge SHA, protected tag, immutable-release setting, GitHub Release URL,
and verification result in the immutable Release and a comment on the merged pull request. Record only public
identifiers or sanitized private-run references suitable for this public repository.
Never copy private plan content, tokens, App identifiers that are treated as confidential, private keys, or
authorization headers into the plan or release notes.

## Plan readiness

Blocked by a successful LeadEmailFinder live migration with an unchanged rerun and credential-safe canary evidence.
