import type { ReactNode } from 'react';
import type { SystemStatus } from '@shared/domain/system';
import { Badge, Section } from '@renderer/components/ui/layout';
import { useLive } from '@renderer/features/live/live-store';
import { formatDuration } from '@renderer/lib/format';

function captureMethod(status: SystemStatus): string {
  const { systemAudio, platform } = status;
  if (!systemAudio.available) return `Unavailable: ${systemAudio.reason}`;
  if (platform === 'win32') return 'Windows loopback (WASAPI), no picker';
  if (platform === 'darwin') return 'macOS audio tap, through the system picker';
  if (platform === 'linux') return 'PulseAudio loopback (PipeWire through its PulseAudio server)';
  return 'Chromium loopback';
}

function ownAudio(status: SystemStatus, confirmed: boolean): string {
  if (confirmed || status.systemAudio.ownAudioFiltered) {
    return status.platform === 'win32' ? 'Filtered out (Windows 11 process loopback)' : 'Filtered out';
  }
  return 'Not filtered: Read Aloud pauses while recording';
}

const MODEL_STATE = {
  verified: { tone: 'success', label: 'verified' },
  missing: { tone: 'danger', label: 'missing' },
  unchecked: { tone: 'neutral', label: 'not checked yet' },
} as const;

/** What this computer can do with system audio, for a bug report. Read-only. */
export function DiagnosticsSection({ status }: { status: SystemStatus }) {
  const live = useLive((s) => s.live);
  const vad = MODEL_STATE[status.cleanupModels.vad];
  const denoiser = MODEL_STATE[status.cleanupModels.denoiser];
  const punct = MODEL_STATE[status.cleanupModels.punct];
  const rows: { label: string; value: ReactNode }[] = [
    { label: 'Capture method', value: captureMethod(status) },
    { label: 'Inaudio’s own audio', value: ownAudio(status, live.ownAudioFiltered) },
    { label: 'Processing format', value: '16 kHz mono; stereo is downmixed and resampled by Chromium' },
    {
      label: 'Speech cleanup models',
      value: (
        <span className="flex flex-wrap gap-2">
          <Badge tone={vad.tone}>Voice detector {vad.label}</Badge>
          <Badge tone={denoiser.tone}>Noise cleanup {denoiser.label}</Badge>
          <Badge tone={punct.tone}>Punctuation {punct.label}</Badge>
        </span>
      ),
    },
    {
      label: 'Engine',
      value: <span className="font-mono text-[13px]">Electron {status.electronVersion} · Chromium {status.chromeVersion}</span>,
    },
    { label: 'Backlog', value: live.pendingMs > 0 ? formatDuration(live.pendingMs) : 'None' },
    { label: 'Last problem', value: live.phase === 'error' && live.message ? live.message : 'None this session' },
  ];
  return (
    <Section id="audio-diagnostics" title="Diagnostics" description="What this computer can do with system audio. Useful when reporting a problem.">
      <dl className="m-0 grid grid-cols-[minmax(0,14rem)_minmax(0,1fr)] text-sm">
        {rows.map((row) => (
          <div key={row.label} className="contents">
            <dt className="border-b border-line py-2.5 text-muted">{row.label}</dt>
            <dd className="m-0 border-b border-line py-2.5 break-words">{row.value}</dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}
