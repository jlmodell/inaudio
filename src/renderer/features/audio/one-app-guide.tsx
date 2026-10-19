import type { ReactNode } from 'react';
import type { Settings } from '@shared/domain/settings';
import { Button } from '@renderer/components/ui/button';
import { Badge, Section } from '@renderer/components/ui/layout';
import { toast } from '@renderer/components/ui/toast';
import { api, errorMessage } from '@renderer/lib/api';

/** Names virtual audio cables usually go by. Only used to suggest one; never to pick one. */
const VIRTUAL_CABLE = /\b(cable output|vb-?audio|voicemeeter|blackhole|loopback|virtual)\b/i;

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span aria-hidden className="grid size-6 shrink-0 place-items-center rounded-full bg-accent-soft text-xs font-semibold text-accent">
        {n}
      </span>
      <div className="grid min-w-0 gap-1.5">
        <span className="text-sm font-medium">{title}</span>
        {children}
      </div>
    </li>
  );
}

/**
 * System audio is the whole mix. Windows 10 cannot hand out one app's audio, so the way to
 * transcribe one app is to send it to a virtual cable and record the cable as an audio device.
 */
export function OneAppGuide({
  inputs,
  live,
  platform,
  onChange,
}: {
  inputs: { value: string; label: string }[];
  live: Settings['live'];
  platform: NodeJS.Platform;
  onChange(patch: Partial<Settings['live']>): void;
}) {
  const cable = inputs.find((input) => input.value !== 'default' && VIRTUAL_CABLE.test(input.label));
  const using = cable && live.source === 'device' && live.deviceId === cable.value;
  const openMixer = () =>
    void api.system.openSoundSettings().catch((error: unknown) => toast(errorMessage(error), { tone: 'neutral' }));

  const route =
    platform === 'win32'
      ? 'In Windows Settings › Sound › Volume mixer, set that app’s output device to the cable’s input (for example “CABLE Input”). Everything else keeps playing on your speakers.'
      : platform === 'darwin'
        ? 'macOS has no per-app output switch. Choose the cable as the output in the app itself (meeting apps and browsers usually have one), or use a router such as Loopback.'
        : 'In your sound settings or pavucontrol (Playback tab), move that app’s stream to the virtual sink.';

  return (
    <Section
      id="audio-one-app"
      title="Record only one app"
      description="System audio mixes every app that plays sound. To transcribe one app only, send it to a virtual cable and record that cable."
    >
      <ol className="m-0 grid list-none gap-4 py-3 pl-0">
        <Step n={1} title="Install a virtual cable">
          <p className="m-0 text-sm text-muted">
            For example VB-Audio Virtual Cable on Windows or BlackHole on macOS. It appears here as an input once installed.
          </p>
          {cable ? (
            <Badge tone="success" className="w-max max-w-full">
              {cable.label}
            </Badge>
          ) : (
            <Badge className="w-max">No virtual cable found yet</Badge>
          )}
        </Step>
        <Step n={2} title="Send the app to the cable">
          <p className="m-0 text-sm text-muted">{route}</p>
          {(platform === 'win32' || platform === 'darwin') && (
            <Button size="sm" className="w-max" onClick={openMixer}>
              {platform === 'win32' ? 'Open Volume mixer' : 'Open Sound settings'}
            </Button>
          )}
        </Step>
        <Step n={3} title="Record the cable">
          <p className="m-0 text-sm text-muted">The live source switches to Audio device and records only the cable.</p>
          <Button
            size="sm"
            variant={using ? 'secondary' : 'primary'}
            className="w-max"
            disabled={!cable || using}
            onClick={() => cable && onChange({ source: 'device', deviceId: cable.value })}
          >
            {using ? 'Recording the cable for live transcripts' : cable ? `Use ${cable.label} for live transcripts` : 'Use the cable for live transcripts'}
          </Button>
        </Step>
      </ol>
      <p className="m-0 pb-3 text-sm text-faint">
        To hear the app while it is recorded, turn on “Listen to this device” for the cable in your system’s sound settings.
      </p>
    </Section>
  );
}
