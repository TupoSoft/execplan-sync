# ExecPlan Sync

Validate repository-owned ExecPlans and synchronize them to GitHub Issues and an organization GitHub Project.

ExecPlan Sync keeps plan files authoritative. It creates or updates one issue per plan, adds that issue to one
configured Project, and derives the Project status from plan readiness, dependencies, and progress. It never writes
back to plan files.

> [!IMPORTANT]
> The action is under active development. Pin a reviewed, full release commit SHA. Do not reference `master`,
> `main`, or a movable version tag in a security-sensitive workflow.

## What it manages

- Discovers `.agents/plans/<feature>/<NN>-<slug>.md` files.
- Preserves the stable `<feature>/<NN>` identity when a plan title or filename slug changes.
- Validates dependency references and rejects duplicate keys, missing dependencies, self-dependencies, and cycles.
- Creates or updates source-repository issues containing `<!-- execplan: <feature>/<NN> -->`.
- Treats only issues carrying the maintainer-controlled `execplan` label as managed; marker text alone is untrusted.
- Preserves issue labels it does not own while managing the `execplan` and `blocked` labels.
- Adds plan issues to one organization Project and updates one single-select status field.
- Reports generated issues whose source plan is absent without closing or archiving them.

Generated issue descriptions are overwritten on synchronization. Use issue comments for discussion.

## Status rules

| Plan state                                         | Default Project status |
| -------------------------------------------------- | ---------------------- |
| Every progress checkbox is complete                | `Done`                 |
| At least one progress checkbox is complete         | `In Progress`          |
| Ready, unstarted, and every dependency is complete | `Todo`                 |
| Waiting for a dependency, decision, or evidence    | `Backlog`              |

An assigned issue already in `In Progress` is not moved backward to `Todo` or `Backlog`. An item already in `Done`
is never reopened. Status option names are configurable.

## ExecPlan layout

Plans must live one feature directory below the configured plans directory:

```text
.agents/
├── PLANS.md
└── plans/
    └── payments/
        ├── README.md
        └── 01-idempotent-credit-grants.md
```

The feature directory must start with a lowercase letter or digit and contain only lowercase letters, digits, and
hyphens. The numeric prefix provides stable identity. At minimum, a plan needs a level-one title plus canonical
`Progress`, `Plan dependencies`, and `Plan readiness` sections:

```markdown
# Grant credits idempotently

## Purpose / Big Picture

Make adding credits safe to retry.

## Progress

- [ ] Implement the behavior.
- [ ] Validate the result.

## Plan dependencies

None.

## Plan readiness

Ready to implement.
```

Use exact sentence-case headings for `## Plan dependencies` and `## Plan readiness`. Dependencies use Markdown list
entries containing a backtick-delimited key (for example, ``- `payments/01` ``). Readiness must end with
`Ready to implement`, `Ready after <decision>`, or `Blocked by <evidence>`.

## Validate plans in pull requests

Validation reads only the checked-out workspace, makes no network request, and needs no credential.

```yaml
name: Validate ExecPlans

on:
    pull_request:
        paths:
            - '.agents/plans/**'
            - '.github/workflows/validate-execplans.yml'

permissions:
    contents: read

jobs:
    validate:
        runs-on: ubuntu-latest
        steps:
            - name: Check out the repository
              uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
              with:
                  persist-credentials: false

            - name: Validate ExecPlans
              uses: TupoSoft/execplan-sync@<FULL_RELEASE_COMMIT_SHA>
              with:
                  mode: validate
```

Replace `<FULL_RELEASE_COMMIT_SHA>` with the 40-character SHA of a reviewed release commit.

## Authenticate synchronization

Synchronization reads and writes repository issues, labels, and an organization Project. Use a short-lived
installation token from an organization-owned GitHub App. The workflow's ordinary `GITHUB_TOKEN` is
repository-scoped and cannot update an organization Project.

Configure the App with:

- Repository permission `Issues: Read and write`.
- Organization permission `Projects: Read and write`.
- Repository metadata read access, which GitHub Apps receive by default.
- Installation access to each source repository that adopts the action.

Create the `EXECPLAN_SYNC_APP_CLIENT_ID` and `EXECPLAN_PROJECT_NUMBER` Actions variables. Store the App private key
as `EXECPLAN_SYNC_APP_PRIVATE_KEY` in a protected `execplan-sync` environment, restrict that environment to the
default branch, and require reviewers before deployment. Never store the private key in source, pass it to
pull-request workflows, or print it.

The `repositories` input in the example downscopes an honestly constructed token, but it is not a boundary around a
widely shared App key. A repository writer who can read that key can change the workflow and request every repository
in the App installation. Use a separate App per repository or mutually trusted group, keep the key behind enforced
environment reviewers and branch restrictions, or mint tokens through a central policy-enforcing broker. Do not
distribute one organization-wide private key to repositories with different trust levels.

## Synchronize the default branch

This example runs only for the repository's default branch or a manual dispatch. It scopes the installation token
to the caller repository and explicitly downscopes its permissions.

```yaml
name: Sync ExecPlans

on:
    push:
        paths:
            - '.agents/plans/**'
            - '.github/workflows/sync-execplans.yml'
    workflow_dispatch:
        inputs:
            dry_run:
                description: Report proposed changes without writing them
                type: boolean
                default: true

permissions:
    contents: read

concurrency:
    group: execplan-sync
    cancel-in-progress: false

jobs:
    sync:
        if: github.event_name == 'workflow_dispatch' || github.ref_name == github.event.repository.default_branch
        environment: execplan-sync
        runs-on: ubuntu-latest
        steps:
            - name: Check out the repository
              uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
              with:
                  persist-credentials: false
                  ref: ${{ github.event.repository.default_branch }}

            - name: Create a short-lived GitHub App token
              id: app-token
              uses: actions/create-github-app-token@bcd2ba49218906704ab6c1aa796996da409d3eb1 # v3.2.0
              with:
                  client-id: ${{ vars.EXECPLAN_SYNC_APP_CLIENT_ID }}
                  private-key: ${{ secrets.EXECPLAN_SYNC_APP_PRIVATE_KEY }}
                  owner: ${{ github.repository_owner }}
                  repositories: ${{ github.event.repository.name }}
                  permission-issues: write
                  permission-metadata: read
                  permission-organization-projects: write

            - name: Synchronize ExecPlans
              uses: TupoSoft/execplan-sync@<FULL_RELEASE_COMMIT_SHA>
              with:
                  mode: sync
                  github-token: ${{ steps.app-token.outputs.token }}
                  project-owner: ${{ github.repository_owner }}
                  project-number: ${{ vars.EXECPLAN_PROJECT_NUMBER }}
                  source-ref: ${{ github.event.repository.default_branch }}
                  dry-run: ${{ github.event_name == 'workflow_dispatch' && inputs.dry_run || false }}
```

For a manual run, dispatch the workflow from the default branch. The protected environment should reject workflows
selected from any other branch or tag, and Checkout independently forces the plan snapshot to the default branch.

The `github-token` input is preferred. For local or advanced automation, the action also checks `GH_TOKEN` and
`GITHUB_TOKEN`, in that order, but the supplied token must have both repository Issue and organization Project
access.

## Inputs

| Input                | Default             | Description                                                           |
| -------------------- | ------------------- | --------------------------------------------------------------------- |
| `mode`               | `sync`              | `validate` performs local validation; `sync` reconciles GitHub state. |
| `github-token`       | —                   | Short-lived GitHub App installation token required for `sync`.        |
| `workspace`          | `GITHUB_WORKSPACE`  | Absolute path to the checked-out caller repository.                   |
| `plans-directory`    | `.agents/plans`     | Repository-relative directory containing feature plan directories.    |
| `repository`         | `GITHUB_REPOSITORY` | Source repository in `owner/name` form; used only by `sync`.          |
| `source-ref`         | Actions ref or SHA  | Branch, tag, or commit used in generated source links.                |
| `project-owner`      | —                   | Organization login owning the target Project; required for `sync`.    |
| `project-number`     | —                   | Positive Project number; required for `sync`.                         |
| `status-field`       | `Status`            | Project single-select field to update.                                |
| `backlog-status`     | `Backlog`           | Option representing dependency-gated or blocked plans.                |
| `todo-status`        | `Todo`              | Option representing actionable, unstarted plans.                      |
| `in-progress-status` | `In Progress`       | Option representing started plans.                                    |
| `done-status`        | `Done`              | Option representing completed plans.                                  |
| `issue-generator`    | `execplan-sync`     | Generator name rendered in managed issue descriptions.                |
| `dry-run`            | `false`             | Reads GitHub state and reports proposed changes without mutating it.  |

All four configured status option names must exist in the target field and must be distinct. Synchronization
preflights the field and options before writing labels or issues.

## Outputs

| Output      | Description                                             |
| ----------- | ------------------------------------------------------- |
| `plans`     | Number of discovered ExecPlans.                         |
| `created`   | Number of issues created or proposed.                   |
| `updated`   | Number of issues updated or proposed.                   |
| `unchanged` | Number of unchanged issues.                             |
| `orphaned`  | Number of generated issues whose source plan is absent. |

The same counts appear in the job summary.

## Safe adoption

1. Add the repository's ExecPlan contract and plans.
2. Run `mode: validate` in pull requests without credentials.
3. Install the GitHub App and pin this action to a reviewed full release SHA.
4. Manually run `mode: sync` with `dry-run: true`.
5. Review proposed creates, updates, Project membership, statuses, and orphan warnings.
6. Disable any legacy writer before the first live run; two writers can race to create duplicate issues.
7. Confirm every legacy generated issue still carries the `execplan` label; reapply it before migration if necessary.
8. Run once with `dry-run: false`, then run again and confirm the second run is unchanged.
9. Enable default-branch synchronization only after the idempotent rerun.

For a LeadEmailFinder migration, set `issue-generator: pnpm plans:sync` during the compatibility dry run to preserve
the legacy generated body text and avoid an unrelated mass update.

## Security model

- Treat synchronized plan content as untrusted text; the action sends it through GitHub APIs and does not execute it.
- Treat the managed `execplan` label as the issue authority boundary. Unlabelled marker lookalikes are ignored so a
  public issue author cannot make the Action overwrite their issue or add it to the Project. Do not auto-apply this
  label to untrusted issue submissions.
- Keep validation tokenless. Never expose App credentials through `pull_request_target` or a forked pull request.
- Grant the GitHub App only Issue and organization Project access, and scope each installation token to the caller.
- Treat access to an App private key as access to every repository in that installation; separate trust domains or use
  a central token broker.
- Pin this action and every third-party action to a full 40-character commit SHA.
- Run synchronization only from reviewed default-branch content or a protected, manually approved environment.
- Review the action's requested inputs and source before granting a token; an action cannot reduce permissions already
  present on a supplied credential.
- Report vulnerabilities according to [`SECURITY.md`](SECURITY.md), not in a public issue.

## Version 1 boundaries

- One source repository and one organization Project per invocation.
- Repository-local dependencies only.
- Direct `<feature>/<NN>-<slug>.md` plan files; nested feature trees are not discovered.
- Only the Project status field is managed.
- Priority, Size, Iteration, assignees, and other human-owned fields are left unchanged.
- Orphaned issues are reported but not closed, archived, or removed from the Project.
- Mutations are serialized and paced. Explicit GitHub rate-limit rejections honor `Retry-After` or reset headers;
  ambiguous failures are left for a marker-safe rerun instead of retrying a possibly completed non-idempotent write.
- Repository workflow concurrency serializes only that repository's runs. When repositories share one App installation,
  stagger schedules or use a central coordinator; one Action invocation cannot pace aggregate installation traffic.
- GitHub Enterprise Server 3.20 or newer uses its supported `2022-11-28` API header. Confirm the server can synchronize
  public GitHub.com actions and uses runner `2.327.1` or newer for the Node 24 runtime.

## Development

See [`CONTRIBUTING.md`](CONTRIBUTING.md). The project is available under the [MIT License](LICENSE).
