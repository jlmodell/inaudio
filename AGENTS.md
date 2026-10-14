# Agent notes

## Verification
- Typecheck: `npx tsc --noEmit -p tsconfig.json` (or `npm run typecheck`)
- Lint: `npx eslint --ext .ts,.tsx src` (or `npm run lint`)
- Script tests: `node --test scripts/*.test.mjs`
- On Windows, run npm from Git Bash: PowerShell blocks `npm.ps1` (execution policy).
- `npm start` exits immediately if the installed Inaudio app is running (single-instance lock, shared `%APPDATA%\Inaudio`).

## Companion
- Companions are built-in Blobatars (`@blobatar/react`, `animate="always"`). The roster lives in `src/shared/domain/companion.ts` (`COMPANIONS`); each entry pins `traits.shape` to a shape band. There is no external package/spritesheet loader — do not reintroduce one.
- State → face mapping is `companionExpression()` in `src/renderer/features/companion/companion-avatar.tsx`; idle mood drift is in `src/renderer/companion.tsx`.
- Eye tracking: main (`companion-gaze.ts` + `focus-probe.ts`, Windows `GetGUIThreadInfo`/UIA via `powershell-helper.ts`) sends window-client targets over `EVENTS.companionGaze`; the renderer feeds them to `useGaze` from `@blobatar/react/gaze`. `useGaze({ travel })` is required — `--mo-track-travel` defaults to 0.
- Main only tracks eyes while the companion is visible, awake, `eyesFollow` on, and `motion === 'full'`; field probing also runs for `position === 'focus-area'` placement.

## Updates
- `electron-updater` reads `resources/app-update.yml` for feed, cache dir, and signature config; Forge ships it via `extraResource` in `forge.config.ts` from `assets/app-update.yml`. `scripts/build-release.mjs` fails the release if the electron-builder output lacks an update manifest. Keep `assets/app-update.yml` in sync with the GitHub `shikki841/inaudio` feed if the repo moves.

## Performance rules
- Main-process status paths (`modelStatuses()`, `status()`, tray, overlay) must not touch the disk. `ModelManager.isInstalled()` is in-memory; `revalidate()` does the async stamp check before a load.
- Model installs carry `.installed.json` (file stamps from the last full hash). Launch re-hashes only files whose stamp changed; the Verify button hashes everything.
- STT and TTS run in separate `InferenceHost` workers with separate queues; companion speech must never queue ahead of dictation.
- Dictation reports state every 100 ms; level-only reports go to `overlay.setLevel()` only.
