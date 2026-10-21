import { useState } from 'react';
import { KOKORO_VOICES, type VoiceId } from '@shared/domain/models';
import type { Settings } from '@shared/domain/settings';
import type { SystemStatus } from '@shared/domain/system';
import { MAX_READ_ALOUD_BUFFER, MIN_READ_ALOUD_BUFFER } from '@shared/read-aloud/ahead';
import { Notice, Row } from '@renderer/components/ui/layout';
import { Select } from '@renderer/components/ui/select';
import { Slider } from '@renderer/components/ui/slider';
import { Switch } from '@renderer/components/ui/switch';

const DIRECT_READ: Partial<Record<NodeJS.Platform, string>> = {
  win32: 'Asks the app through Windows UI Automation, without touching the clipboard. Not every app supports it.',
  darwin: 'Asks the app through the macOS Accessibility API, without touching the clipboard.',
  linux: 'Reads the primary selection, which holds whatever text is highlighted.',
};

export interface ReadAloudSettingsProps {
  tts: Settings['tts'];
  status: SystemStatus;
  onChange(patch: Partial<Settings['tts']>): void;
}

/** Voice, capture and playback options for Read Aloud. */
export function ReadAloudSettings({ tts, status, onChange }: ReadAloudSettingsProps) {
  const [speed, setSpeed] = useState<number | null>(null);
  const copyUnavailable = status.platform === 'linux' && !status.insertion.available ? status.insertion.reason : null;

  return (
    <>
      {status.accessibilityTrusted === false && (
        <div className="py-3">
          <Notice tone="warning">
            Allow Inaudio under Privacy &amp; Security → Accessibility to read selected text in other apps.
          </Notice>
        </div>
      )}

      <Row id="settings-read-aloud-voice" label="Voice" description="Voices that Kokoro English v0.19 includes.">
        <Select<VoiceId>
          label="Voice"
          value={tts.voiceId as VoiceId}
          onValueChange={(voiceId) => onChange({ voiceId })}
          options={KOKORO_VOICES.map((v) => ({ value: v.id, label: v.name, hint: `${v.accent} ${v.gender}` }))}
        />
      </Row>

      <Row label="Speed" description="Applies from the next sentence when changed mid-reading. Up to 3×.">
        <div className="flex w-56 items-center gap-3">
          <Slider
            aria-label="Speech speed"
            min={0.5}
            max={3}
            step={0.05}
            value={[speed ?? tts.speed]}
            onValueChange={([next]) => next !== undefined && setSpeed(next)}
            onValueCommit={([next]) => {
              setSpeed(null);
              if (next !== undefined) onChange({ speed: next });
            }}
          />
          <span className="w-12 font-mono text-sm tabular-nums">{(speed ?? tts.speed).toFixed(2)}×</span>
        </div>
      </Row>

      <Row label="Volume" description="Playback volume for Read Aloud only.">
        <div className="flex w-56 items-center gap-3">
          <Slider
            aria-label="Speech volume"
            min={0}
            max={1}
            step={0.05}
            value={[tts.volume]}
            onValueChange={([volume]) => volume !== undefined && onChange({ volume })}
          />
          <span className="w-12 font-mono text-sm tabular-nums">{Math.round(tts.volume * 100)}%</span>
        </div>
      </Row>

      <Row
        id="settings-read-aloud-capture"
        label="Read the selection directly"
        description={DIRECT_READ[status.platform] ?? 'Not available on this platform.'}
      >
        <Switch
          aria-label="Read the selection directly"
          checked={tts.useAccessibility}
          onCheckedChange={(useAccessibility) => onChange({ useAccessibility })}
        />
      </Row>

      <Row
        label="Copy the selection as a fallback"
        description={
          copyUnavailable ??
          'For apps that do not share their selection, Inaudio sends Copy and reads the clipboard. Password fields are never copied.'
        }
      >
        <Switch
          aria-label="Copy the selection as a fallback"
          checked={tts.copyFallback}
          disabled={copyUnavailable !== null}
          onCheckedChange={(copyFallback) => onChange({ copyFallback })}
        />
      </Row>

      <Row
        label="Restore the clipboard"
        description="Puts back what was on the clipboard after a copy, unless something else was copied meanwhile."
      >
        <Switch
          aria-label="Restore the clipboard"
          checked={tts.restoreClipboard}
          disabled={!tts.copyFallback}
          onCheckedChange={(restoreClipboard) => onChange({ restoreClipboard })}
        />
      </Row>

      <Row
        id="settings-read-aloud-overlay"
        label="Show in the overlay"
        description="The pill shows progress, with pause and stop under the pointer. Needs the overlay turned on."
      >
        <Switch
          aria-label="Show Read Aloud in the overlay"
          checked={tts.showInOverlay}
          onCheckedChange={(showInOverlay) => onChange({ showInOverlay })}
        />
      </Row>

      <Row label="Pause while dictating" description="Starting dictation pauses reading so the microphone does not pick it up.">
        <Switch
          aria-label="Pause while dictating"
          checked={tts.pauseOnDictation}
          onCheckedChange={(pauseOnDictation) => onChange({ pauseOnDictation })}
        />
      </Row>

      <Row label="Follow along" description="Highlight the sentence being read on the Read Aloud page.">
        <Switch
          aria-label="Follow along"
          checked={tts.followAlong}
          onCheckedChange={(followAlong) => onChange({ followAlong })}
        />
      </Row>

      <Row
        id="settings-read-aloud-speed-reading"
        label="Speed reading"
        description="Show one word at a time on the Read Aloud page, timed to the voice."
      >
        <Switch
          aria-label="Speed reading"
          checked={tts.speedReading}
          onCheckedChange={(speedReading) => onChange({ speedReading })}
        />
      </Row>

      <Row
        id="settings-read-aloud-buffer"
        label="Sentence buffer"
        description="How many sentences to generate before playback starts, then stay that far ahead."
      >
        <div className="flex w-56 items-center gap-3">
          <Slider
            aria-label="Sentence buffer"
            min={MIN_READ_ALOUD_BUFFER}
            max={MAX_READ_ALOUD_BUFFER}
            step={1}
            value={[tts.readAloudBuffer]}
            onValueChange={([readAloudBuffer]) => readAloudBuffer !== undefined && onChange({ readAloudBuffer })}
          />
          <span className="w-8 font-mono text-sm tabular-nums">{tts.readAloudBuffer}</span>
        </div>
      </Row>
    </>
  );
}
