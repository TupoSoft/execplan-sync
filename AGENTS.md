# Repository Guidance

## Architecture

- Keep ExecPlan parsing and status resolution pure and independent of GitHub Actions.
- Put orchestration in application services and GitHub-specific behavior behind narrow ports.
- Keep the Action entry point thin: read inputs, construct adapters, run the use case, and report outputs.
- Never read credentials from files or print tokens, private keys, or authorization headers.
- Preserve existing issue markers and one-way synchronization semantics unless an ExecPlan explicitly introduces a versioned migration.
- Add focused tests for every behavior change, including alternate status mappings and dry-run behavior.

## ExecPlans

- Follow `.agents/PLANS.md` for significant features and refactors.
- Store plans under `.agents/plans/<feature>/`.
- Keep each plan current while implementing it, including validation evidence and remaining limitations.
- One ExecPlan corresponds to exactly one pull request.

## Delivery

- Build the committed Action bundle from reviewed TypeScript sources; never edit `dist/` manually.
- Pin third-party Actions in release workflows to full commit SHAs.
- Review the final diff for secret exposure and accidental organization-specific defaults.
- Use Conventional Commits for commit and pull-request titles.
