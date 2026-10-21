# Contributing to Inaudio

Start with an issue for a new feature or a change to read-aloud, model handling, or platform behavior. Small fixes can go straight to a pull request. Search existing issues first, and include your OS, app version, model, and reproduction steps when reporting a bug.

## Development

Use Node.js 24 LTS, npm, and Git. Run `npm ci`, then `npm start`. Use `npm.cmd` if PowerShell blocks the npm script shim. Models download separately; don't commit model weights, credentials, or generated packages.

Electron Forge packages for the host OS. Linux makers need `rpm` and `dpkg` tooling (on Ubuntu: `sudo apt-get install rpm fakeroot`). Native rebuilds may need Python and a C/C++ toolchain: Visual Studio Build Tools on Windows, Xcode Command Line Tools on macOS, or build-essential on Linux. See [Forge prerequisites](https://www.electronforge.io/import-existing-project).

```sh
npm run check
npm run make
```

Run automation tests with `node --test scripts/*.test.mjs` when changing them. Explain any check you could not run. For app changes, test Read Aloud, the Kokoro voice, and the packaged app on your OS. There is no automated end-to-end audio suite yet.

## Code layout

| Directory | Responsibility |
| --- | --- |
| `src/main` | Desktop lifecycle, IPC, downloads, and local storage |
| `src/preload` | The renderer's explicit API boundary |
| `src/renderer` | React UI and client state |
| `src/worker` | Speech inference in a separate process |
| `src/shared` | Domain types and validated IPC contracts |

Keep IPC capabilities explicit and validate inputs in the main process. Follow existing TypeScript and formatting conventions. Add meaningful coverage where behavior changes; include manual reproduction steps for audio or OS integrations.

## Pull requests

Use a Conventional Commit title such as `fix: restore read-aloud speed` or `feat: add playback speed control`. Explain the problem, the resulting behavior, and how you tested it. Include screenshots for visible UI changes and `Closes #123` when resolving an issue; GitHub closes linked issues when the PR merges into the default branch. Follow the PR template and [automation rules](.github/AUTOMATION.md) for changes without an issue.

Maintainers should squash merge so the PR title becomes the release commit. Release behavior and required branch checks are documented in [.github/RELEASING.md](.github/RELEASING.md).

Contributions are licensed under the repository's MIT license. Be respectful and follow the [community guidelines](CODE_OF_CONDUCT.md).
