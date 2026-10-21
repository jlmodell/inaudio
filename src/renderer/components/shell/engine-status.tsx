import { MODEL_CATALOG } from '@shared/domain/models';
import type { WorkerHealth } from '@shared/domain/system';
import { StatusDot } from '@renderer/components/ui/layout';
import { Tooltip } from '@renderer/components/ui/tooltip';
import { cn } from '@renderer/lib/cn';
import { useSettings, useSystemStatus } from '@renderer/lib/queries';
import { useUi } from '@renderer/stores/ui-store';

type Tone = 'success' | 'warning' | 'danger' | 'neutral';

function describe(worker: WorkerHealth | undefined, loaded: boolean): { tone: Tone; label: string } {
  switch (worker?.state) {
    case 'crashed':
      return { tone: 'danger', label: 'Engine crashed' };
    case 'stopped':
      return { tone: 'neutral', label: 'Engine stopped' };
    case 'busy':
      return { tone: 'success', label: 'Working' };
    case 'ready':
      return loaded ? { tone: 'success', label: 'Ready' } : { tone: 'neutral', label: 'Loads on first use' };
    default:
      return { tone: 'warning', label: 'Starting' };
  }
}

/** The voice engine and its model, at the foot of the sidebar. Opens Models. */
export function EngineStatus({ collapsed }: { collapsed: boolean }) {
  const { data: status } = useSystemStatus();
  const { data: settings } = useSettings();
  const navigate = useUi((s) => s.navigate);
  const model = settings ? MODEL_CATALOG[settings.tts.modelId] : null;
  const worker = status?.worker;
  const { tone, label } = describe(worker, !!model && worker?.loadedTts === model.id);
  const summary = model ? `${model.name} · ${label}` : label;

  const chip = (
    <button
      type="button"
      onClick={() => navigate('models')}
      aria-label={`Speech engine: ${summary}. Open Models`}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-lg text-left transition-colors hover:bg-surface/60',
        collapsed ? 'h-10 justify-center' : 'px-3 py-2',
      )}
    >
      <StatusDot tone={tone} />
      {!collapsed && (
        <span className="grid min-w-0">
          <span className="truncate text-xs font-medium text-ink">{model?.name ?? 'Speech engine'}</span>
          <span className="truncate text-xs text-muted">{label}</span>
        </span>
      )}
    </button>
  );
  return collapsed ? (
    <Tooltip content={summary} side="right">
      {chip}
    </Tooltip>
  ) : (
    chip
  );
}
