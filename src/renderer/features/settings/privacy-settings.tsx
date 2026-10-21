import { Row, Section } from '@renderer/components/ui/layout';

export function PrivacySettings({ platform }: { settings: unknown; platform: NodeJS.Platform }) {
  return (
    <Section id="settings-privacy">
      <Row
        label="Local only"
        description="Inaudio reads text aloud on this computer. It does not record a microphone, keep a transcript history, or send speech off this machine."
      />
      <Row
        label="This computer"
        description={`${platform} stores settings and the Kokoro voice in the data folder shown under About.`}
      />
    </Section>
  );
}
