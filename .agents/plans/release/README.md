# Release Road Map

This road map takes ExecPlan Sync from its first reviewed prerelease to a stable version without introducing a
movable Action reference or treating isolated CI as adoption proof.

1. [Prepare the v0.1.0 prerelease](01-prepare-v0-1-0.md)
2. [Prepare the stable v1.0.0 release](02-prepare-v1-0-0.md)

Shared decisions:

- Every published release and its release-specific tag are immutable. Consumers pin the reviewed 40-character
  release commit SHA rather than `master` or a movable major-version tag.
- A failed release is superseded by a new patch release; an existing tag is never moved or reused.
- The prerelease proves packaging, documentation, and release mechanics. Stable support begins only after a real
  consumer completes a dry run, a live synchronization, and an unchanged rerun with the intended credential path.
- Release work does not silently expand version 1 beyond the boundaries documented in `README.md`.
- Public release notes identify the exact commit, compatibility boundaries, validation evidence, and known
  limitations without including credentials or private-repository data.
- Each ExecPlan delivers one release-ready pull request. Privileged publication happens from the reviewed merge
  commit through `RELEASING.md`; its post-merge evidence belongs in the immutable GitHub Release and merged pull
  request rather than a second plan pull request.
