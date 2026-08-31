# Prepare the v0.1.0 Prerelease

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Prepare the first reviewable ExecPlan Sync release without presenting it as stable or asking consumers to trust a
movable branch or tag. After this work, the repository contains a checked-in release procedure and a Core-reviewed,
fully validated merge candidate. Once the pull request merges, a maintainer can publish an immutable GitHub
prerelease from that exact commit and provide its 40-character SHA to a pilot workflow.

## Progress

- [ ] (2026-08-31) Reconcile the completed bootstrap plan with the merged pull request and post-merge CI evidence.
- [ ] (2026-08-31) Document the pre-tag checks, immutable-tag policy, release-note contents, and recovery procedure.
- [ ] (2026-08-31) Make credential guidance explicit about GitHub plan limitations and private-repository trust
      boundaries.
- [ ] (2026-08-31) Keep routine Dependabot updates inside the supported TypeScript and Node type ranges.
- [ ] (2026-08-31) Run repository, documentation, bundle, and release-candidate validation on the reviewed commit.
- [ ] (2026-08-31) Deliver one Core-reviewed release-readiness pull request with required checks green.

## Plan dependencies

- `bootstrap/01`

## Surprises & Discoveries

- Pull request #2 merged into `master` on 2026-08-31 and the post-merge `Quality` run passed, but
  `.agents/plans/bootstrap/01-publish-reusable-execplan-sync-action.md` still says that the pull request is blocked
  waiting for Core review.
- The repository has no tag or GitHub Release. `package.json` already declares version `0.1.0`, and `SECURITY.md`
  deliberately treats everything before `v1.0.0` as prerelease software.
- Repository-level immutable releases are disabled at authoring time. The existing protected-tag ruleset prevents
  deletion and rewriting of `v*` tags, but it does not make a published GitHub Release and its assets immutable.
- Dependabot pull request #3 combines TypeScript 7 and Node 26 type definitions with a Node 24 toolchain. Its
  `npm ci` fails because the current latest `typescript-eslint` accepts TypeScript versions below 6.1.
- TupoSoft is on GitHub Free. GitHub environments and environment secrets are unavailable to private repositories
  on that plan, so the current protected-environment example cannot be presented as universally available to
  TupoSoft's private consumers.
- The local checkout used to author this plan still points at the merged feature branch. Implementation must begin
  from a freshly fetched `origin/master`, not from the stale local `master` reference.

## Decision Log

- Decision: Publish `v0.1.0` as a GitHub prerelease before claiming stable support.
  Rationale: The source, bundle, tests, governance, and a read-only Project 9 dry run are proven, while a consumer has
  not yet exercised the intended credential path through a live synchronization and unchanged rerun.
  Date/Author: 2026-08-31, Codex.
- Decision: Protect immutable semantic-version tags and tell consumers to pin the full release SHA; do not maintain a
  movable `v1` reference.
  Rationale: A mutable reference would let reviewed consumer workflows execute different code without another
  review. Existing tag rules already prevent deletion and non-fast-forward updates of `v*` tags.
  Date/Author: 2026-08-31, Codex.
- Decision: Enable repository-level immutable releases before publishing the first prerelease.
  Rationale: The release record and any assets deserve the same supply-chain protection as the release-specific tag.
  Drafting the release first preserves a review point before publication makes it immutable.
  Date/Author: 2026-08-31, Codex.
- Decision: Validate before creating the protected tag instead of relying only on a tag-triggered check.
  Rationale: A failed post-tag check would leave an immutable bad tag. The release procedure must prove the candidate
  commit first, then create the tag and verify that GitHub resolves it to that same commit.
  Date/Author: 2026-08-31, Codex.
- Decision: Keep TypeScript below `6.1.0` and `@types/node` below `25.0.0` until their surrounding toolchain supports a
  deliberate compatibility upgrade.
  Rationale: Forcing or bypassing peer dependency resolution would make the lockfile non-reproducible and would not
  establish compatibility. The current `typescript-eslint` peer range excludes TypeScript `6.1.0` and later, while
  Node 25 and later types do not describe the Action's Node 24 runtime.
  Date/Author: 2026-08-31, Codex.
- Decision: Document a visibility and plan capability matrix instead of grouping every paid private repository into
  one protection tier.
  Rationale: A shared App private key in an unprotected repository secret grants repository writers authority beyond
  the workflow's declared inputs. Private repositories on Pro or Team can use environment secrets and branch
  restrictions but cannot require environment reviewers; private required-reviewer protection needs Enterprise.
  Date/Author: 2026-08-31, Codex.

## Outcomes & Retrospective

Not started.

## Context and Orientation

`src/` contains the reviewed TypeScript implementation, while `dist/` is the committed JavaScript Action bundle
that callers execute. `.github/workflows/ci.yml` runs formatting, linting, type checking, tests, a bundle freshness
check, and a tokenless bundled-Action smoke test on pull requests and `master`. `package.json` is private because this
project is distributed as a GitHub Action rather than an npm package; its current version is `0.1.0`.

`README.md` tells consumers to use a full release SHA and explains GitHub App permissions, synchronization, and safe
adoption. `SECURITY.md` defines the pre-v1 support posture. `CONTRIBUTING.md` documents local checks but does not yet
contain a release procedure. `.github/dependabot.yml` currently groups every development dependency update,
including incompatible major versions. `.agents/plans/bootstrap/01-publish-reusable-execplan-sync-action.md` is the
living record of the merged implementation and must no longer describe its pull request as pending.

The default-branch ruleset requires the strict `Quality` check, a Core code-owner approval, resolved review threads,
linear history, and squash merging. A separate active ruleset protects all `v*` tags from deletion and rewriting.
Repository-level immutable releases are not yet enabled. Release publication occurs only after the plan's pull
request merges, the merge commit passes `Quality`, and that setting is enabled and verified.

## Scope and Non-Goals

Update the bootstrap outcome, add a concise release procedure, correct credential documentation for supported GitHub
plan and visibility combinations, and adjust Dependabot policy so unsupported compiler and Node type ranges are not
grouped into routine maintenance. This pull request ends at a verified release-ready state. Publishing `v0.1.0` is a
privileged post-merge operation governed by `RELEASING.md`, not an acceptance criterion that would require a second
pull request to update this plan.

Do not change Action inputs, synchronization behavior, `src/`, or the committed `dist/` bundle. Do not migrate a
consumer, run the first live write, claim stable support, create a movable `v1` tag, publish to npm, list the Action in
GitHub Marketplace, enable CodeQL, or expand the documented version 1 feature boundary. Those outcomes belong to the
consumer adoption plan or `release/02`.

## Plan of Work

Fetch the live default branch and create the implementation branch from `origin/master`. Update the bootstrap
ExecPlan's progress and outcome so it records pull request #2 as merged, issue #1 as closed, the squash commit, and the
successful post-merge `Quality` run. Retain historical command evidence, including temporary-directory overrides,
as evidence of what actually ran rather than rewriting history.

Add `RELEASING.md` with an exact maintainer sequence: select a Core-reviewed default-branch commit, confirm its
required checks, confirm `package.json` matches the intended tag, run the complete local check from a clean checkout,
review the generated bundle and licenses, create an annotated `v0.1.0` tag, and publish a GitHub prerelease containing
the full commit SHA and known limitations. State that a bad immutable release is superseded by a new patch version.
Require maintainers to create and review a draft before publication makes it immutable. Link the procedure from
`CONTRIBUTING.md`.

Revise the authentication and safe-adoption sections of `README.md` with an explicit GitHub visibility and plan
matrix. Public repositories can use environment secrets and required reviewers on current plans. Private repositories
on Free cannot use environment secrets; private repositories on Pro or Team can use environment secrets and branch
restrictions but not required reviewers; private required-reviewer protection needs Enterprise. Preserve the
least-privilege GitHub App path, but require an explicit trusted coordinator, external broker, separately bounded
credential, or plan upgrade when an App private key cannot be protected. Warn that a public coordinator must not emit
private plan content into public workflow logs.

Change `.github/dependabot.yml` so the routine development-dependency group accepts compatible updates but ignores
`typescript` versions at or above `6.1.0` and `@types/node` versions at or above `25.0.0`. Handle either range in an
explicit compatibility pull request. After this policy merges, close superseded Dependabot pull request #3 with the
peer-range and Node-runtime evidence rather than forcing it through CI.

Run the validations below on the candidate branch and update this plan's Outcome with the release-ready evidence
before merge. `RELEASING.md` must direct a maintainer to wait for the reviewed merge commit and successful post-merge
CI, enable and verify repository-level immutable releases, create and review a draft prerelease, and then publish it.
Post-merge evidence belongs in the immutable GitHub Release and a comment on the merged pull request, not a second
pull request that changes this ExecPlan.

## Interfaces and Dependencies

This plan changes maintainer and consumer documentation plus Dependabot update policy. It adds `RELEASING.md` and
updates `README.md`, `CONTRIBUTING.md`, `.github/dependabot.yml`, and the completed bootstrap ExecPlan. It does not
change `action.yml`, Action inputs or outputs, runtime dependencies, GitHub API contracts, or generated bundle files.

Release publication uses the existing GitHub repository, default-branch ruleset, protected `v*` tag ruleset, Core
team ownership, CI workflow, GitHub Releases, and repository-level immutable-release setting. `v0.1.0` must resolve to
one reviewed default-branch commit, and release notes must name that same 40-character SHA. The GitHub authentication
used by a maintainer to change the setting or publish the release is operational state and is never stored in the
repository.

## Acceptance Criteria

- The bootstrap ExecPlan no longer claims that merged pull request #2 is waiting for review, and it records the
  post-merge result without deleting historical evidence.
- A maintainer unfamiliar with the conversation can follow `RELEASING.md` to validate, tag, publish, verify, and, if
  necessary, supersede a release without moving an existing tag.
- Authentication documentation distinguishes public repositories, private Free, private Pro or Team, and private
  Enterprise capabilities without weakening the App-key trust boundary.
- Routine grouped development-dependency updates exclude `typescript >=6.1.0` and `@types/node >=25.0.0`;
  incompatible pull request #3 is not merged with `--force` or legacy peer resolution.
- `npm run check` passes from the locked dependency graph, rebuilds `dist/` without a diff, and the release-readiness
  changes introduce no runtime or bundle change.
- The release-readiness pull request has Core approval and required `Quality` passes on its reviewed head commit.
- `RELEASING.md` requires successful post-merge `Quality`, a clean release checkout, verified immutable-release
  enforcement, a reviewed draft, and `gh release verify v0.1.0 --repo TupoSoft/execplan-sync` after publication.
- The procedure requires the immutable prerelease tag to resolve to the approved merge commit and its notes to include
  the exact 40-character SHA, validation summary, version 1 boundaries, and known lack of stable support.
- No movable `v1` tag, npm publication, consumer credential, or private-repository content is created.

## Validation

Run `npm ci` followed by `npm run check` and `git diff --check`. Fetch the current default branch, then run `git diff
--exit-code "$(git merge-base origin/master HEAD)"...HEAD -- src action.yml dist package-lock.json` to prove that the
committed pull-request delta does not change the Action runtime or locked dependency graph. Review
`.github/dependabot.yml` against GitHub's current Dependabot configuration schema and run Prettier through
`npm run format:check` as part of the full check.

Inspect pull request #2, issue #1, the default-branch commit, repository rulesets, and the latest `Quality` run with
read-only `gh` queries before writing their final evidence into the bootstrap plan. Confirm that current
`typescript-eslint` peer metadata excludes TypeScript 7 so the Dependabot decision remains evidence-based.

Before merging, inspect the documented post-merge sequence and its exact commands. It must require successful
`Quality` on the merge commit, read and enable `gh api repos/TupoSoft/execplan-sync/immutable-releases`, and verify the
setting before publication. It must create and review the draft `v0.1.0` prerelease before publishing it, then use
`git ls-remote --tags origin refs/tags/v0.1.0`, `gh release view v0.1.0 --repo TupoSoft/execplan-sync`, `gh release
verify v0.1.0 --repo TupoSoft/execplan-sync`, and a read-only commit query to prove that the tag, release target,
immutable release, and recorded full SHA agree. Require `npm ci && npm run check` from a clean checkout of the release
commit if the publishing checkout is not the already validated checkout.

## Idempotence and Recovery

Documentation and Dependabot policy edits are ordinary reviewed files and can be amended safely before merge. Local
validation is repeatable and must leave `dist/` unchanged. Release creation must first check that `v0.1.0` and a
release with that name do not already exist, so retrying the procedure cannot create competing artifacts.

Enabling immutable releases is idempotent but changes the recovery model for every release published afterward.
Review the draft carefully because publication locks its tag and assets. If publication fails before the release
object exists but after the tag is created, resume by verifying the protected tag SHA and creating the missing release
for that exact commit. If the tag points at defective code or the published release is materially wrong, keep it as
historical evidence, mark the release notes accordingly, fix the problem through a new pull request, and publish
`v0.1.1`; never move or reuse `v0.1.0`. Reverting the release-readiness pull request does not revoke code already
referenced by a published SHA.

## Artifacts and Notes

Record the release-readiness pull request, Core approval, head commit, required checks, and the disposition of
Dependabot pull request #3 here before merge. The later publisher records the merge commit, post-merge `Quality`,
protected tag, immutable-release setting, prerelease URL, and integrity verification in the GitHub Release and a
comment on the merged pull request. The GitHub environment capability reference is
<https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments>. Never record a
token, App private key, authorization header, private workflow payload, or private repository content.

## Plan readiness

Ready to implement.
