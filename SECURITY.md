# Security Policy

ExecPlan Sync receives credentials capable of writing repository issues and organization Projects. Please report
security problems privately and do not include tokens, private keys, authorization headers, or private repository
content in a public issue.

## Supported versions

Before the first stable release, security fixes are made on the default branch and coordinated release candidates.
After `v1.0.0`, the latest release in each explicitly maintained major line is supported. Older commits, movable
branches, and prereleases are not guaranteed to receive fixes.

## Report a vulnerability

Use [GitHub private vulnerability reporting](https://github.com/TupoSoft/execplan-sync/security/advisories/new). If the
private report form is unavailable, open a public issue asking the maintainers for a private contact channel without
including vulnerability details.

Include:

- The affected release tag and full commit SHA.
- A concise impact assessment and reproduction steps.
- Whether credentials, private repository data, issue content, or Project state may be exposed.
- Any suggested remediation or temporary mitigation.

We aim to acknowledge a complete report within five business days. Please allow time to investigate and prepare a
coordinated fix before public disclosure.

## Scope

Examples of in-scope reports include:

- Token or private-key disclosure through logs, outputs, errors, or generated artifacts.
- Execution of plan content or workflow inputs as shell commands.
- Workspace or symlink traversal outside the checked-out repository.
- Unauthorized issue or Project mutations, including dry-run writes.
- Marker collisions that can mutate the wrong issue.
- Supply-chain compromise of the committed Action bundle or release tags.

Ordinary usage questions, public feature requests, and reports without a security impact belong in GitHub Issues.

## Maintainer response

Maintainers will validate the report, identify supported affected versions, prepare a private patch when practical,
and publish a GitHub Security Advisory with upgrade guidance. Released credentials should be revoked immediately;
the repository will never ask a reporter to send a live secret for reproduction.
