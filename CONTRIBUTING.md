# Contributing

Thank you for helping improve ExecPlan Sync.

## Before starting

- Read [`AGENTS.md`](AGENTS.md) for architecture and delivery rules.
- For a significant feature or refactor, create or update an ExecPlan under `.agents/plans/<feature>/` according to
  [`.agents/PLANS.md`](.agents/PLANS.md).
- Report suspected vulnerabilities privately according to [`SECURITY.md`](SECURITY.md).

## Development setup

The project requires Node.js 24 and npm.

```sh
npm ci
npm run check
```

`npm run check` runs formatting, linting, type checking, tests, and the committed-bundle freshness check.

Useful focused commands:

```sh
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
npm run bundle:check
```

## Architecture

- Keep plan parsing and state resolution pure.
- Put orchestration in application services.
- Keep GitHub behavior behind the Issue and Project ports.
- Keep `src/action.ts` limited to input handling, adapter construction, outputs, and summaries.
- Do not introduce repository-specific owners, project numbers, branches, or status names as hidden defaults.
- Never read credentials from files or log credentials or authorization headers.

Add focused tests for every behavior change. Include dry-run and alternate-status coverage for synchronization changes,
and include pagination or API-error coverage for GitHub adapter changes.

## Generated bundle

`dist/` is distributed and executed by GitHub Actions. It must be generated from reviewed source and the locked
dependency graph.

```sh
npm run build
git diff -- dist
```

Commit the matching `dist/` changes with source changes. Never edit generated bundle files manually. The build emits
`dist/licenses.txt` for bundled runtime dependency notices; review it whenever dependencies change.

## Pull requests

- Keep one coherent change per pull request.
- Use a Conventional Commit subject for commits and the pull-request title.
- Update documentation when public inputs, outputs, permissions, behavior, or recovery steps change.
- Run `npm run check` and record relevant focused evidence.
- Review the diff for secrets, generated-bundle drift, incompatible dependency licenses, and accidental
  organization-specific defaults.
- Do not commit tokens, private keys, copied private repository content, or live API payloads.

By contributing, you agree that your contribution is provided under the repository's [MIT License](LICENSE).
