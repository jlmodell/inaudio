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
- The companion window uses `useGaze({ travel })` from `@blobatar/react/gaze` for pointer tracking. `useGaze({ travel })` is required — `--mo-track-travel` defaults to 0.

## Read Aloud
- Capture of selected text runs in main (`SelectionProvider`). The renderer only plays PCM pushed as `EVENTS.readAloudChunk`.
- Prefetch uses `settings.tts.readAloudBuffer` via `aheadEnd`. Playback waits until that buffer is full while `status === 'preparing'`.
- Speech synthesis runs in one `InferenceHost` worker. Companion speech shares that queue.
- No `Co-Authored-By` trailers in commits or PRs.

## Settings
- Settings is a route with its own sidebar (`SettingsSidebar`, swapped in by `AppShell`): "Back to Inaudio" returns to `useUi().previousRoute`. Categories and the search index live in `features/settings/settings-nav.ts`; `openSettings(category, focusId)` opens a page and scrolls to a setting. Each section in `settings-page.tsx` renders only on its category.

## Onboarding
- Setup is a non-dismissible `Billboard` (`components/ui/billboard.tsx`) over `<AppShell backdrop>`, which is inert and always shows the app sidebar without window controls; setup draws its own minimize and close. Hero scenes in `features/tour/hero-scenes.tsx` animate with `transform` only (Tailwind v4 centers with the `translate` property) and stop under reduced or off motion.

## Navigation
- Sidebar icons are the same Lucide icons drawn as motion components in `components/icons/motion-icons.tsx` (motion from the MIT AnimateIcons set; Settings2 is ours). They play once on hover, keyboard focus and when their page opens, never under reduced/off motion or the system setting. Reading shows a `Waveform` (`components/ui/waveform.tsx`), not a red dot; under reduced motion the bars hold still and the label carries the state.
- Read Aloud can start from anywhere in the app with `readText(text, { id, title })`; the store keeps that `origin`, and `NowReadingBar` (in `AppShell`) shows it on every page but Read Aloud and Settings. Text over `MAX_READ_ALOUD_CHARS` is cut, not rejected.

## Installer
- Windows uses an assisted NSIS installer with our own pages (`assets/installer/installer.nsh`): billboard-style welcome, finish and uninstall pages whose hero frames are rendered by `scripts/build-installer-art.mjs` into `out/installer-art` (run by `build-release.mjs`, never committed). Builds run `makensis -WX`: a function or `Var` one build (installer or uninstaller) does not use fails it, so keep each in the macro only that build inserts.
- Installs stay per user (`customInstallMode`). The uninstaller keeps user data unless its checkbox is ticked, and never deletes it during an update. Updates install silently (`quitAndInstall(true, true)`); every custom page also skips itself when `${isUpdated}`, for updates started by older versions.

## Updates
- Update progress is pushed (`EVENTS.updateState` → query `['update']`). Release notes are converted from HTML to plain text in main (`src/shared/update/notes.ts`); never render release HTML. The title bar `UpdateIndicator` and the Updates hero card show only while `updates.checkAutomatically` is on.
- Live release notes: `ReleaseNotesService` (main) fetches `api.github.com/repos/shikki841/inaudio/releases` on its own session partition that allows only that URL, at most every 30 s and with `If-None-Match` (a 304 does not count against GitHub's unauthenticated limit). Markdown becomes plain `ReleaseBlock`s in `src/shared/update/release-markdown.ts` and is never rendered as HTML. There is no built-in fallback: the billboard lists `whatsNewSince()` (changes since `seenVersion`, filled from earlier releases when a release holds only chores) or says the notes could not be loaded. Short items go in the `WhatsNewBillboard`; full notes go in `ReleaseNotesDrawer`.
- The what's-new billboard opens once per `appVersion` (`announcements.seenVersion`), after onboarding, and not at all when `announcements.whatsNew` is off. Finishing setup marks the current version seen.
- `electron-updater` reads `resources/app-update.yml` for feed, cache dir, and signature config; Forge ships it via `extraResource` in `forge.config.ts` from `assets/app-update.yml`. `scripts/build-release.mjs` fails the release if the electron-builder output lacks an update manifest. Keep `assets/app-update.yml` in sync with the GitHub `shikki841/inaudio` feed if the repo moves.

## Performance rules
- Main-process status paths (`modelStatuses()`, `status()`, tray) must not touch the disk. `ModelManager.isInstalled()` is in-memory; `revalidate()` does the async stamp check before a load.
- Model installs carry `.installed.json` (file stamps from the last full hash). Launch re-hashes only files whose stamp changed; the Verify button hashes everything.
- TTS runs in one `InferenceHost` worker.
