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

## Live transcript
- Capture only ever runs in the app window (surface `main`). The floating live window (`live.html`, surface `live`, `LiveWindowController`) draws pushed `LiveWindowState` and sends a fixed `liveWindowAction` enum. Copy reads the transcript in main; never give that window text-sending or capture channels.
- A start from the tray, a shortcut or the live window opens the app window hidden (`ensureWindow` → `openWindow(false)`).
- Sources `system` and `system+mic` use `getDisplayMedia` plus the one-shot capture grant; `device` is `getUserMedia` only (`needsDisplayCapture()`).
- Queue priorities: dictation 100 > live chunk 50 > preview 10. `LiveCaptureController.preview()` drops a preview whenever anything else is waiting.
- Live text is assembled in `LiveCaptureController.fold()`: passages join in chunk order through `joinPassage()` (`src/shared/live/join.ts`: no false full stops after a hard cut, overlap words dropped, paragraphs after a 1.5 s pause), then custom words (`src/shared/text/replacements.ts`), then optional punctuation (`text:punct` in the STT worker).
- The live window is transparent with 6px CSS corners; it has no native resize, so `ResizeEdges` report pointer moves and `LiveWindowController.resizeTo()` applies `resizedBounds()`. The overlay pill is dragged by its handle (`overlay:drag`); its place is saved as work-area fractions (`overlay.customX/Y`), never pixels.
- History is main-window only (`handleOn('main')`). Export writes to a path from the native save dialog only; the renderer sends ids and a format, never a path.
- Speech cleanup (Silero VAD, GTCRN) runs inside the STT worker through `stt:transcribe`'s `cleanup` paths. The models ship in `assets/models` and are hash-checked by `CleanupModels`; see its README before replacing them.
- Microphone `media` permission requests are granted to the `main` surface only.
- No `Co-Authored-By` trailers in commits or PRs.

## Settings
- Settings is a route with its own sidebar (`SettingsSidebar`, swapped in by `AppShell`): "Back to Inaudio" returns to `useUi().previousRoute`. Categories and the search index live in `features/settings/settings-nav.ts`; `openSettings(category, focusId)` opens a page and scrolls to a setting. Each section in `settings-page.tsx` renders only on its category.

## Onboarding
- Setup is a non-dismissible `Billboard` (`components/ui/billboard.tsx`) over `<AppShell backdrop>`, which is inert and always shows the app sidebar without window controls; setup draws its own minimize and close. Hero scenes in `features/tour/hero-scenes.tsx` animate with `transform` only (Tailwind v4 centers with the `translate` property) and stop under reduced or off motion.

## Navigation
- Sidebar icons are the same Lucide icons drawn as motion components in `components/icons/motion-icons.tsx` (motion from the MIT AnimateIcons set; Settings2 is ours). They play once on hover, keyboard focus and when their page opens, never under reduced/off motion or the system setting. Recording, live capture and reading show a `Waveform` (`components/ui/waveform.tsx`), not a red dot; under reduced motion the bars hold still and the label carries the state.
- Read Aloud can start from anywhere in the app with `readText(text, { id, title })`; the store keeps that `origin`, and `NowReadingBar` (in `AppShell`) shows it on every page but Read Aloud and Settings. History rows, the transcript drawer, the ⋯ menu and Dictation's recent takes use `ReadAloudButton`. Text over `MAX_READ_ALOUD_CHARS` is cut, not rejected.

## Installer
- Windows uses an assisted NSIS installer with our own pages (`assets/installer/installer.nsh`): billboard-style welcome, finish and uninstall pages whose hero frames are rendered by `scripts/build-installer-art.mjs` into `out/installer-art` (run by `build-release.mjs`, never committed). Builds run `makensis -WX`: a function or `Var` one build (installer or uninstaller) does not use fails it, so keep each in the macro only that build inserts.
- Installs stay per user (`customInstallMode`). The uninstaller keeps user data unless its checkbox is ticked, and never deletes it during an update. Updates install silently (`quitAndInstall(true, true)`); every custom page also skips itself when `${isUpdated}`, for updates started by older versions.

## Updates
- Update progress is pushed (`EVENTS.updateState` → query `['update']`). Release notes are converted from HTML to plain text in main (`src/shared/update/notes.ts`); never render release HTML. The title bar `UpdateIndicator` and the Updates hero card show only while `updates.checkAutomatically` is on.
- Live release notes: `ReleaseNotesService` (main) fetches `api.github.com/repos/shikki841/inaudio/releases` on its own session partition that allows only that URL, at most every 30 s and with `If-None-Match` (a 304 does not count against GitHub's unauthenticated limit). Markdown becomes plain `ReleaseBlock`s in `src/shared/update/release-markdown.ts` and is never rendered as HTML. There is no built-in fallback: the billboard lists `whatsNewSince()` (changes since `seenVersion`, filled from earlier releases when a release holds only chores) or says the notes could not be loaded. Short items go in the `WhatsNewBillboard`; full notes go in `ReleaseNotesDrawer`.
- The what's-new billboard opens once per `appVersion` (`announcements.seenVersion`), after onboarding, never while dictation or live capture runs, and not at all when `announcements.whatsNew` is off. Finishing setup marks the current version seen.
- `electron-updater` reads `resources/app-update.yml` for feed, cache dir, and signature config; Forge ships it via `extraResource` in `forge.config.ts` from `assets/app-update.yml`. `scripts/build-release.mjs` fails the release if the electron-builder output lacks an update manifest. Keep `assets/app-update.yml` in sync with the GitHub `shikki841/inaudio` feed if the repo moves.

## Performance rules
- Main-process status paths (`modelStatuses()`, `status()`, tray, overlay) must not touch the disk. `ModelManager.isInstalled()` is in-memory; `revalidate()` does the async stamp check before a load.
- Model installs carry `.installed.json` (file stamps from the last full hash). Launch re-hashes only files whose stamp changed; the Verify button hashes everything.
- STT and TTS run in separate `InferenceHost` workers with separate queues; companion speech must never queue ahead of dictation.
- Dictation reports state every 100 ms; level-only reports go to `overlay.setLevel()` only.
