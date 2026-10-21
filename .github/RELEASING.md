# Releasing Inaudio

Merging or pushing to `main` starts the release workflow. The workflow reads stable GitHub release tags and the commits since the newest stable tag. `feat:` creates a minor release, `!` or `BREAKING CHANGE:` creates a major release, and other commits create a patch release. With no prior release, the `package.json` version is the baseline. Once a stable release exists, the newest stable tag decides the next version and `package.json` is only kept in step with it.

The workflow first runs the reusable CI workflow on Windows and macOS. Each runner applies the planned version in its disposable checkout, packages the application, and emits installers plus SHA-256 manifests. A separate publisher job has the only `contents: write` permission. It creates a draft release with GitHub generated notes, uploads all verified artifacts, and publishes the draft.

A rerun for a commit that already has a public release exits without changing its assets. A partially uploaded draft can be resumed when its existing assets match their local checksums. Conflicting assets, tags, release targets, or checksums fail closed; remove the failed draft manually after investigating before retrying. Published assets are never overwritten.

Artifacts are electron-builder updates for Windows x64 (NSIS) and Apple Silicon macOS (`.zip` and `.dmg`). Linux and Intel macOS are not built. Each release also contains the platform update manifest (`latest.yml` or `latest-mac.yml`) and blockmaps used by `electron-updater`, plus SHA-256 manifests. The client only checks feeds in packaged builds and requires HTTPS. CI does not provide platform signing or notarization credentials, so these artifacts are unsigned until signing is configured separately.

Use conventional commit messages in the commits that actually reach `main` (including squash merge titles). For example, an initial `fix:` commit produces `v1.0.1`, while an initial `feat:` produces `v1.1.0`. No version commit is pushed back to the repository. GitHub notes are grouped using `.github/release.yml`; labels affect notes, while commit messages determine versions.

Protect `main` with required PR review and the `Lint and typecheck` and two `Package (...)` checks. Restrict who can change workflows and publish releases. Never run untrusted PR code using `pull_request_target` or give build jobs secrets. PR workflows use read-only permissions and checkout credentials are not persisted.

The release concurrency group serializes active releases. GitHub may replace an older pending run with a newer push, so multiple rapid merges can be combined into one release. A failed gate publishes nothing. Manually created tags or drafts that conflict with the computed version require investigation; the automation never moves an existing tag.

## Manual operation

Use **Run workflow** only when a push to `main` was not delivered. The workflow still uses the selected commit on `main`; do not run it from a feature branch. `GITHUB_TOKEN` needs repository Actions permission to read releases and contents write permission is granted only to the publisher job.

The macOS runner creates `assets/icons/icon.icns` from the checked-in PNG because the repository does not currently contain an ICNS source. Signing and notarization are intentionally not wired into GitHub Actions. If trusted Windows Authenticode or macOS Developer ID releases are needed later, add the platform credentials through a protected signing service or environment rather than storing private keys in the repository. Pull-request and production CI builds are currently unsigned.

Published manifests can be staged with the **Update rollout percentage** workflow. It rewrites the `stagingPercentage` field in every platform manifest without rebuilding the binary. Start with a small percentage, verify telemetry and support signals, then increase it to 100. The client keeps a persistent hashed installation identifier and uses the manifest percentage to make the rollout decision stable per installation.

The About section exposes update state, manual check/download/install actions, and preferences for automatic checks and background downloads. Installation is explicit: the app disposes inference, models, tray, companion, and shortcuts before `electron-updater` quits and relaunches the new version.

Action references in the workflows are immutable commit SHAs. Update them only after checking the upstream release tag and commit with `gh api` or `git ls-remote`, then update the adjacent version comment.
