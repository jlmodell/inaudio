import { Check, FolderOpen } from 'lucide-react';
import { useEffect } from 'react';
import { Button } from '@renderer/components/ui/button';
import { Badge, PageHeader, Row, Section } from '@renderer/components/ui/layout';
import { RadioGroup } from '@renderer/components/ui/radio-group';
import { Segmented } from '@renderer/components/ui/segmented';
import { Select } from '@renderer/components/ui/select';
import { Switch } from '@renderer/components/ui/switch';
import { api } from '@renderer/lib/api';
import { useSettings, useSystemStatus, useUpdateActions, useUpdateSettings, useUpdateStatus } from '@renderer/lib/queries';
import { useUi, type SettingsCategory } from '@renderer/stores/ui-store';
import type { Settings } from '@shared/domain/settings';
import type { ShortcutStatus } from '@shared/domain/system';
import { LiveWindowSettings } from './live-window-settings';
import { OverlaySettings } from './overlay-settings';
import { ReadAloudSettings } from './read-aloud-settings';
import { CATEGORIES } from './settings-nav';
import { ShortcutInput } from './shortcut-input';
import { TranscriptQualitySettings } from './transcript-quality-settings';
import { TraySettings } from './tray-settings';
import { UpdateSection } from './update-section';
import { PrivacySettings } from './privacy-settings';

const THREADS = [1, 2, 4, 6, 8, 12, 16];
/** Idle delays offered before the engine unloads. The schema allows 1–60 minutes. */
const IDLE_MINUTES = [1, 2, 5, 10, 20, 30, 60];
const ACCENT_COLORS = {
  blue: '#2f5bea',
  violet: '#6148d8',
  green: '#1f8a4c',
  amber: '#ba7400',
  rose: '#c14574',
} as const;

/** Three words for the three ways a configured accelerator can land. */
const SHORTCUT_NOTE: Record<ShortcutStatus, string | null> = {
  registered: null,
  unavailable: 'In use by another app',
  off: null,
};

/** The two palettes a theme card draws, from the tokens in index.css. */
const PALETTE = {
  light: { canvas: '#eef0f3', surface: '#ffffff', sunken: '#f0f2f6', line: '#c7cdd8', ink: '#8a919c', accent: '#2f5bea' },
  dark: { canvas: '#0b0b0d', surface: '#131316', sunken: '#0f1012', line: '#32343a', ink: '#a8adb7', accent: '#7f95ff' },
} as const;

/** A miniature Inaudio window in one palette. */
function MiniWindow({ tone }: { tone: 'light' | 'dark' }) {
  const c = PALETTE[tone];
  return (
    <span className="absolute inset-0 block" style={{ backgroundColor: c.canvas }}>
      <span
        className="absolute top-3.5 right-3.5 bottom-0 left-3.5 flex overflow-hidden rounded-t-[8px] shadow-[0_2px_10px_rgb(0_0_0/0.14)]"
        style={{ backgroundColor: c.surface }}
      >
        <span className="grid w-[32%] content-start gap-1.5 px-2 py-2.5" style={{ backgroundColor: c.sunken }}>
          <span className="h-1.5 w-[70%] rounded-full" style={{ backgroundColor: c.line }} />
          <span className="h-1.5 rounded-full" style={{ backgroundColor: c.accent }} />
          <span className="h-1.5 w-[80%] rounded-full" style={{ backgroundColor: c.line }} />
          <span className="h-1.5 w-[60%] rounded-full" style={{ backgroundColor: c.line }} />
        </span>
        <span className="grid flex-1 content-start gap-2 px-2.5 py-3">
          <span className="h-2 w-[55%] rounded-full" style={{ backgroundColor: c.ink }} />
          <span className="h-1.5 w-[85%] rounded-full" style={{ backgroundColor: c.line }} />
          <span className="h-1.5 w-[70%] rounded-full" style={{ backgroundColor: c.line }} />
          <span className="mt-1 h-4 w-[40%] rounded-[5px]" style={{ backgroundColor: c.accent }} />
        </span>
      </span>
    </span>
  );
}

const THEMES = [
  { value: 'system', label: 'System', description: 'Matches your computer' },
  { value: 'light', label: 'Light', description: 'Bright surfaces' },
  { value: 'dark', label: 'Dark', description: 'Dark surfaces' },
] as const;

/** A theme to pick, drawn as the app would look in it. System shows both, split on the diagonal. */
function ThemeCard({ theme, selected, onSelect }: { theme: (typeof THEMES)[number]; selected: boolean; onSelect(): void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className="group grid gap-2.5 rounded-[14px] text-left outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
    >
      <span
        className={`relative block h-32 overflow-hidden rounded-[12px] transition-shadow ${selected ? 'shadow-[0_0_0_2px_var(--accent),0_0_0_5px_var(--accent-soft)]' : 'shadow-[0_0_0_1px_var(--line)] group-hover:shadow-[0_0_0_1px_var(--line-strong)]'}`}
      >
        <MiniWindow tone={theme.value === 'dark' ? 'dark' : 'light'} />
        {theme.value === 'system' && (
          <span className="absolute inset-0 block [clip-path:polygon(62%_0,100%_0,100%_100%,38%_100%)]">
            <MiniWindow tone="dark" />
          </span>
        )}
      </span>
      <span className="flex items-center justify-between px-0.5">
        <span className="text-sm font-semibold">{theme.label}</span>
        {selected && (
          <span className="grid size-[18px] place-items-center rounded-full bg-accent text-on-accent">
            <Check aria-hidden className="size-3" strokeWidth={3} />
          </span>
        )}
      </span>
      <span className="-mt-1.5 px-0.5 text-xs text-muted">{theme.description}</span>
    </button>
  );
}

export function SettingsPage() {
  const { data: settings } = useSettings();
  const { data: status } = useSystemStatus();
  const { data: updateStatus } = useUpdateStatus();
  const update = useUpdateSettings();
  const updateActions = useUpdateActions();
  const category = useUi((s) => s.settingsCategory);
  const focus = useUi((s) => s.settingsFocus);
  const clearFocus = useUi((s) => s.clearSettingsFocus);
  // A search result scrolls to its setting once the page holding it has rendered.
  useEffect(() => {
    if (!focus || !settings || !status) return;
    const frame = requestAnimationFrame(() => {
      const target = document.getElementById(focus);
      target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      target?.classList.add('settings-flash');
      setTimeout(() => target?.classList.remove('settings-flash'), 1_400);
      clearFocus();
    });
    return () => cancelAnimationFrame(frame);
  }, [focus, category, settings, status, clearFocus]);
  if (!settings || !status) return null;
  const { dictation } = settings;
  const cpu = navigator.hardwareConcurrency || 4;
  const page = CATEGORIES[category];
  const show = (id: SettingsCategory) => id === category;

  return (
    <div>
      <PageHeader title={page.label} description={page.description} />
      <div className="flex flex-col">
      {show('dictation') && (
      <Section id="settings-dictation">
        <Row
          label="Recording mode"
          description="Push to talk records while the shortcut is held; it only works while Inaudio is focused. From other apps the shortcut toggles."
        >
          <Segmented<Settings['dictation']['mode']>
            label="Recording mode"
            value={dictation.mode}
            onValueChange={(mode) => update.mutate({ dictation: { mode } })}
            options={[
              { value: 'toggle', label: 'Toggle' },
              { value: 'push-to-talk', label: 'Push to talk' },
            ]}
          />
        </Row>
        <div className="py-3">
          <p className="pb-2 text-sm font-medium">When a transcript is ready</p>
          <RadioGroup<Settings['dictation']['insertMode']>
            label="Insertion mode"
            value={dictation.insertMode}
            onValueChange={(insertMode) => update.mutate({ dictation: { insertMode } })}
            options={[
              {
                value: 'paste',
                label: 'Type into the focused app',
                description: status.insertion.available ? `Pastes with ${status.insertion.method}.` : status.insertion.reason,
                disabled: !status.insertion.available,
              },
              { value: 'clipboard', label: 'Copy to clipboard', description: 'Paste it yourself.' },
              { value: 'none', label: 'Keep it in Inaudio', description: 'Shown on the Dictation page and in History.' },
            ]}
          />
        </div>
        <Row id="settings-cues" label="Play sound cues" description="A short tone when recording starts and stops.">
          <Switch
            aria-label="Play sound cues"
            checked={dictation.playCues}
            onCheckedChange={(playCues) => update.mutate({ dictation: { playCues } })}
          />
        </Row>
        <Row label="Restore clipboard" description="Put back what was on the clipboard after typing.">
          <Switch
            aria-label="Restore clipboard"
            checked={dictation.restoreClipboard}
            disabled={dictation.insertMode !== 'paste'}
            onCheckedChange={(restoreClipboard) => update.mutate({ dictation: { restoreClipboard } })}
          />
        </Row>
        <Row label="Save history" description="Keep transcripts in a local database on this computer.">
          <Switch
            aria-label="Save history"
            checked={dictation.saveHistory}
            onCheckedChange={(saveHistory) => update.mutate({ dictation: { saveHistory } })}
          />
        </Row>
      </Section>
      )}

      {show('read-aloud') && (
      <Section id="settings-read-aloud">
        <ReadAloudSettings tts={settings.tts} status={status} onChange={(patch) => update.mutate({ tts: patch })} />
      </Section>
      )}

      {show('quality') && (
      <Section id="settings-quality">
        <TranscriptQualitySettings
          live={settings.live}
          stt={settings.stt}
          models={status.cleanupModels}
          onLive={(patch) => update.mutate({ live: patch })}
          onStt={(patch) => update.mutate({ stt: patch })}
        />
      </Section>
      )}

      {show('overlay') && (
      <Section id="settings-overlay">
        <OverlaySettings
          overlay={settings.overlay}
          support={status.overlay}
          platform={status.platform}
          shortcut={status.shortcuts.overlay}
          onChange={(patch) => update.mutate({ overlay: patch })}
        />
      </Section>
      )}

      {show('live-window') && (
      <Section id="settings-live-window">
        <LiveWindowSettings
          liveWindow={settings.liveWindow}
          support={status.overlay}
          platform={status.platform}
          onChange={(patch) => update.mutate({ liveWindow: patch })}
        />
      </Section>
      )}

      {show('tray') && (
      <Section id="settings-tray">
        <TraySettings
          tray={settings.tray}
          status={status}
          onChange={(patch) => update.mutate({ tray: patch })}
        />
      </Section>
      )}

      {show('shortcuts') && (
      <Section id="settings-shortcuts">
        <Row id="settings-shortcut-dictation" label="Dictation" description={SHORTCUT_NOTE[status.shortcuts.dictation] ?? undefined}>
          <ShortcutInput
            label="Dictation shortcut"
            value={dictation.shortcut}
            platform={status.platform}
            status={status.shortcuts.dictation}
            onChange={(shortcut) => update.mutate({ dictation: { shortcut } })}
          />
        </Row>
        <Row
          label="Read selection"
          description={SHORTCUT_NOTE[status.shortcuts.readAloud] ?? 'Reads the text selected in any app. Press it again to stop.'}
        >
          <ShortcutInput
            label="Read aloud shortcut"
            value={settings.tts.shortcut}
            platform={status.platform}
            status={status.shortcuts.readAloud}
            onChange={(shortcut) => update.mutate({ tts: { shortcut } })}
          />
        </Row>
        <Row
          id="settings-shortcut-read-pause"
          label="Pause or resume reading"
          description={SHORTCUT_NOTE[status.shortcuts.readAloudPause] ?? undefined}
        >
          <ShortcutInput
            label="Pause reading shortcut"
            optional
            value={settings.tts.pauseShortcut}
            platform={status.platform}
            status={status.shortcuts.readAloudPause}
            onChange={(pauseShortcut) => update.mutate({ tts: { pauseShortcut } })}
          />
        </Row>
        <Row
          id="settings-shortcut-read-stop"
          label="Stop reading"
          description={SHORTCUT_NOTE[status.shortcuts.readAloudStop] ?? undefined}
        >
          <ShortcutInput
            label="Stop reading shortcut"
            optional
            value={settings.tts.stopShortcut}
            platform={status.platform}
            status={status.shortcuts.readAloudStop}
            onChange={(stopShortcut) => update.mutate({ tts: { stopShortcut } })}
          />
        </Row>
        <Row id="settings-shortcut-cancel" label="Cancel recording" description="Discards the recording in progress without transcribing it.">
          <ShortcutInput
            label="Cancel shortcut"
            optional
            value={dictation.cancelShortcut}
            platform={status.platform}
            status={status.shortcuts.cancel}
            onChange={(cancelShortcut) => update.mutate({ dictation: { cancelShortcut } })}
          />
        </Row>
        <Row id="settings-shortcut-overlay" label="Show or hide the overlay" description="Turns the pill on and off without opening Settings.">
          <ShortcutInput
            label="Overlay shortcut"
            optional
            value={settings.overlay.toggleShortcut}
            platform={status.platform}
            status={status.shortcuts.overlay}
            onChange={(toggleShortcut) => update.mutate({ overlay: { toggleShortcut } })}
          />
        </Row>
        <Row
          id="settings-shortcut-live"
          label="Start or stop a live transcript"
          description={SHORTCUT_NOTE[status.shortcuts.live] ?? 'Records system audio from any app. Off until you set it.'}
        >
          <ShortcutInput
            label="Live transcript shortcut"
            optional
            value={settings.live.shortcut}
            platform={status.platform}
            status={status.shortcuts.live}
            onChange={(shortcut) => update.mutate({ live: { shortcut } })}
          />
        </Row>
        <Row
          id="settings-shortcut-live-window"
          label="Show or hide the live window"
          description={SHORTCUT_NOTE[status.shortcuts.liveWindow] ?? 'Off until you set it.'}
        >
          <ShortcutInput
            label="Live window shortcut"
            optional
            value={settings.liveWindow.shortcut}
            platform={status.platform}
            status={status.shortcuts.liveWindow}
            onChange={(shortcut) => update.mutate({ liveWindow: { shortcut } })}
          />
        </Row>
      </Section>
      )}

      {show('performance') && (
      <Section id="settings-performance">
        <Row label="CPU threads" description={`Threads used by the speech engine. This computer has ${cpu}.`}>
          <Select
            label="CPU threads"
            className="min-w-28"
            value={String(settings.stt.threads)}
            onValueChange={(v) => update.mutate({ stt: { threads: Number(v) } })}
            options={THREADS.filter((n) => n <= Math.max(cpu, 4)).map((n) => ({ value: String(n), label: String(n) }))}
          />
        </Row>
        {status.onBattery && (
          <Row label="Power" description="Running on battery. Fewer threads use less power.">
            <Badge tone="warning">On battery</Badge>
          </Row>
        )}
        <Row
          id="settings-unload"
          label="Unload models when idle"
          description="Frees memory between sessions. The next recording takes a moment longer to start."
        >
          <Switch
            aria-label="Unload models when idle"
            checked={settings.system.autoUnload}
            onCheckedChange={(autoUnload) => update.mutate({ system: { autoUnload } })}
          />
        </Row>
        <Row label="Idle after" description="How long to wait before unloading.">
          <Select
            label="Idle minutes"
            className="min-w-28"
            value={String(settings.system.idleMinutes)}
            disabled={!settings.system.autoUnload}
            onValueChange={(v) => update.mutate({ system: { idleMinutes: Number(v) } })}
            options={IDLE_MINUTES.map((n) => ({
              value: String(n),
              label: n === 1 ? '1 minute' : `${n} minutes`,
            }))}
          />
        </Row>
      </Section>
      )}

      {show('appearance') && (
      <Section id="settings-appearance">
        <div id="settings-theme" className="grid scroll-mt-6 gap-3 pb-5">
          <p className="text-sm font-medium">Theme</p>
          <div role="radiogroup" aria-label="Theme" className="grid gap-4 sm:grid-cols-3">
            {THEMES.map((theme) => (
              <ThemeCard
                key={theme.value}
                theme={theme}
                selected={settings.appearance.theme === theme.value}
                onSelect={() => update.mutate({ appearance: { theme: theme.value } })}
              />
            ))}
          </div>
        </div>
        <Row id="settings-font-size" label="Font size">
          <Segmented<Settings['appearance']['fontSize']>
            label="Font size"
            value={settings.appearance.fontSize}
            onValueChange={(fontSize) => update.mutate({ appearance: { fontSize } })}
            options={[
              { value: 'sm', label: 'Small' },
              { value: 'md', label: 'Default' },
              { value: 'lg', label: 'Large' },
            ]}
          />
        </Row>
        <Row id="settings-font-family" label="Font family">
          <Segmented<Settings['appearance']['fontFamily']>
            label="Font family"
            value={settings.appearance.fontFamily}
            onValueChange={(fontFamily) => update.mutate({ appearance: { fontFamily } })}
            options={[
              { value: 'inter', label: 'Inter' },
              { value: 'system', label: 'System' },
            ]}
          />
        </Row>
        <Row id="settings-animations" label="Animations">
          <Segmented<Settings['appearance']['animations']>
            label="Animations"
            value={settings.appearance.animations}
            onValueChange={(animations) => update.mutate({ appearance: { animations } })}
            options={[
              { value: 'full', label: 'Full' },
              { value: 'reduced', label: 'Reduced' },
              { value: 'off', label: 'Off' },
            ]}
          />
        </Row>
        <Row id="settings-content-width" label="Display width">
          <Segmented<Settings['appearance']['contentWidth']>
            label="Display width"
            value={settings.appearance.contentWidth}
            onValueChange={(contentWidth) => update.mutate({ appearance: { contentWidth } })}
            options={[
              { value: 'compact', label: 'Compact' },
              { value: 'default', label: 'Default' },
              { value: 'wide', label: 'Wide' },
            ]}
          />
        </Row>
        <Row id="settings-accent" label="Accent color">
          <div role="radiogroup" aria-label="Accent color" className="flex items-center gap-2.5">
            {(Object.entries(ACCENT_COLORS) as [Settings['appearance']['accentTone'], string][]).map(([tone, color]) => {
              const selected = settings.appearance.accentTone === tone;
              const name = tone.charAt(0).toUpperCase() + tone.slice(1);
              return (
                <button
                  key={tone}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={name}
                  title={name}
                  onClick={() => update.mutate({ appearance: { accentTone: tone } })}
                  className="grid size-7 place-items-center rounded-full outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  <span
                    className="block size-6 rounded-full transition-shadow"
                    style={{ backgroundColor: color, boxShadow: selected ? `0 0 0 2px var(--surface), 0 0 0 4px ${color}` : undefined }}
                  />
                </button>
              );
            })}
          </div>
        </Row>
      </Section>
      )}

      {show('app') && (
      <Section id="settings-app">
        {status.platform !== 'linux' && (
          <Row label="Open at login">
            <Switch
              aria-label="Open at login"
              checked={settings.system.launchAtLogin}
              onCheckedChange={(launchAtLogin) => update.mutate({ system: { launchAtLogin } })}
            />
          </Row>
        )}
        {status.platform !== 'linux' && (
          <Row
            id="settings-launch-minimized"
            label="Launch minimized"
            description="When Inaudio opens at login, keep its main window hidden until you open it from the tray."
          >
            <Switch
              aria-label="Launch minimized"
              checked={settings.system.launchMinimized}
              disabled={!settings.system.launchAtLogin}
              onCheckedChange={(launchMinimized) => update.mutate({ system: { launchMinimized } })}
            />
          </Row>
        )}
        <Row label="Keep running in the tray" description="Closing the window leaves shortcuts active.">
          <Switch
            aria-label="Keep running in the tray"
            checked={settings.system.closeToTray}
            onCheckedChange={(closeToTray) => update.mutate({ system: { closeToTray } })}
          />
        </Row>
        <Row
          id="settings-quit-confirmation"
          label="Confirm before quitting during capture"
          description="Ask before stopping an active dictation or live transcript from the tray."
        >
          <Switch
            aria-label="Confirm before quitting during capture"
            checked={settings.system.confirmQuitDuringCapture}
            onCheckedChange={(confirmQuitDuringCapture) => update.mutate({ system: { confirmQuitDuringCapture } })}
          />
        </Row>
        <Row label="Setup" description="Walk through microphone, models and live transcript setup again.">
          <Button size="sm" onClick={() => update.mutate({ onboardingComplete: false })}>
            Run setup
          </Button>
        </Row>
      </Section>
      )}

      {show('updates') && (
        <UpdateSection
          status={updateStatus}
          updates={settings.updates}
          announcements={settings.announcements}
          actions={updateActions}
          onChange={(patch) => update.mutate({ updates: patch })}
          onAnnouncements={(patch) => update.mutate({ announcements: patch })}
        />
      )}

      {show('privacy') && <PrivacySettings settings={settings} platform={status.platform} />}

      {show('about') && (
      <Section id="settings-about">
        <Row label="Data folder" description={<span data-selectable>{status.dataDir}</span>}>
          <Button size="sm" variant="ghost" onClick={() => void api.system.revealModels()}>
            <FolderOpen /> Models
          </Button>
        </Row>
        <Row label="Version" description={`Inaudio ${status.appVersion} · Electron ${status.electronVersion} · ${status.platform} ${status.arch}`} />
        <Row label="Engine" description="sherpa-onnx, CPU. No network access after models are downloaded.">
          <Button size="sm" variant="ghost" onClick={() => void api.system.openLink('sherpaOnnx')}>
            Project page
          </Button>
        </Row>
      </Section>
      )}
      </div>
    </div>
  );
}
