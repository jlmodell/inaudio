# Agent notes

## Verification
- Typecheck: `npx tsc --noEmit -p tsconfig.json` (or `npm run typecheck`)
- Lint: `npx eslint --ext .ts,.tsx src` (or `npm run lint`)
- On Windows, run npm from Git Bash: PowerShell blocks `npm.ps1` (execution policy).
- `src/main/services/updater.ts` fails typecheck/lint until `electron-updater` is installed (`npm install`); that error predates other work.
- `npm start` exits immediately if the installed Inaudio app is running (single-instance lock, shared `%APPDATA%\Inaudio`).

## Performance rules
- Main-process status paths (`modelStatuses()`, `status()`, tray, overlay) must not touch the disk. `ModelManager.isInstalled()` is in-memory; `revalidate()` does the async stamp check before a load.
- Model installs carry `.installed.json` (file stamps from the last full hash). Launch re-hashes only files whose stamp changed; the Verify button hashes everything.
- STT and TTS run in separate `InferenceHost` workers with separate queues; companion speech must never queue ahead of dictation.
- Dictation reports state every 100 ms; level-only reports go to `overlay.setLevel()` only.
