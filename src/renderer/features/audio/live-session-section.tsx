import type { LiveSessionMinutes } from '@shared/domain/capture';
import type { Settings } from '@shared/domain/settings';
import { Badge, Row, Section } from '@renderer/components/ui/layout';
import { Segmented } from '@renderer/components/ui/segmented';
import { Switch } from '@renderer/components/ui/switch';

const LIMITS: { value: `${LiveSessionMinutes}`; label: string }[] = [
  { value: '30', label: '30 min' },
  { value: '60', label: '1 hour' },
  { value: '120', label: '2 hours' },
  { value: '180', label: '3 hours' },
];

/** How long a live transcript may run and what is left of it afterwards. */
export function LiveSessionSection({
  live,
  onChange,
}: {
  live: Settings['live'];
  onChange(patch: Partial<Settings['live']>): void;
}) {
  return (
    <Section id="audio-live-session" title="Session and retention" description="How long a live transcript can run and what is kept afterwards.">
      <Row label="Stop a session after" description="What was transcribed is kept when it stops.">
        <Segmented<`${LiveSessionMinutes}`>
          label="Session time limit"
          value={`${live.maxMinutes}`}
          onValueChange={(value) => onChange({ maxMinutes: Number(value) as LiveSessionMinutes })}
          options={LIMITS}
        />
      </Row>
      <Row label="Save live transcripts to History" description="One entry per session, marked with its source. Dictation has its own switch in Settings.">
        <Switch aria-label="Save live transcripts to History" checked={live.saveHistory} onCheckedChange={(saveHistory) => onChange({ saveHistory })} />
      </Row>
      <Row label="Recordings" description="Audio stays in memory and is released after each part is transcribed. Nothing is written to disk or sent anywhere.">
        <Badge>Never kept</Badge>
      </Row>
    </Section>
  );
}
