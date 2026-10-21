import { Check, Download, ExternalLink, Trash2, X } from 'lucide-react';
import { MODEL_CATALOG, modelBytes, type ModelStatus } from '@shared/domain/models';
import type { ExternalLinkId } from '@shared/ipc/schemas';
import { ConfirmDialog } from '@renderer/components/ui/alert-dialog';
import { Button } from '@renderer/components/ui/button';
import { IconButton } from '@renderer/components/ui/icon-button';
import { Badge } from '@renderer/components/ui/layout';
import { Progress } from '@renderer/components/ui/progress';
import { api, errorMessage } from '@renderer/lib/api';
import { formatBytes } from '@renderer/lib/format';
import { useModelAction } from '@renderer/lib/queries';

const LINKS: Record<string, ExternalLinkId> = {
  'kokoro-en-v0_19': 'kokoro',
};

export function ModelRow({
  status,
  selected,
  onSelect,
  compact,
}: {
  status: ModelStatus;
  selected: boolean;
  onSelect?: () => void;
  compact?: boolean;
}) {
  const model = MODEL_CATALOG[status.id];
  const actions = useModelAction();
  const total = status.bytesTotal || modelBytes(model);
  const pct = total ? (status.bytesDone / total) * 100 : 0;
  const active = status.state === 'downloading' || status.state === 'verifying';
  const error =
    status.error ?? (actions.download.error ? errorMessage(actions.download.error) : undefined);
  const link = LINKS[status.id];

  return (
    <div className="grid gap-3 py-5">
      <div className="flex items-start justify-between gap-6">
        <div className="grid gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-base font-medium">{model.name}</span>
            {selected && <Badge tone="accent">In use</Badge>}
            {status.state === 'installed' && (
              <Badge tone="success">
                <Check className="size-3" /> Installed
              </Badge>
            )}
            {status.loaded && <Badge>Loaded</Badge>}
          </div>
          {!compact && <p className="text-sm text-muted">{model.summary}</p>}
          <p className="text-xs text-faint">
            {formatBytes(modelBytes(model))} ·{' '}
            {model.languages.length > 3
              ? `${model.languages.length} languages`
              : model.languages.join(', ')}{' '}
            · {model.license}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {link && !compact && (
            <IconButton
              label="Model card"
              size="icon-sm"
              onClick={() => void api.system.openLink(link)}
            >
              <ExternalLink />
            </IconButton>
          )}
          {status.state === 'installed' ? (
            <>
              {onSelect && !selected && (
                <Button size="sm" onClick={onSelect}>
                  Use
                </Button>
              )}
              {!compact && (
                <ConfirmDialog
                  title={`Remove ${model.name}?`}
                  description={`${formatBytes(modelBytes(model))} is freed. You can download it again later.`}
                  confirmLabel="Remove"
                  onConfirm={() => actions.remove.mutate(status.id)}
                  trigger={
                    <IconButton label="Remove model" size="icon-sm">
                      <Trash2 />
                    </IconButton>
                  }
                />
              )}
            </>
          ) : active ? (
            <Button size="sm" variant="ghost" onClick={() => actions.cancel.mutate(status.id)}>
              <X /> Cancel
            </Button>
          ) : (
            <Button size="sm" variant="primary" onClick={() => actions.download.mutate(status.id)}>
              <Download /> {status.state === 'error' ? 'Retry' : 'Download'}
            </Button>
          )}
        </div>
      </div>
      {active && (
        <div className="grid gap-1.5">
          <Progress value={pct} label={`Downloading ${model.name}`} />
          <span className="text-xs text-faint tabular-nums">
            {status.state === 'verifying'
              ? 'Verifying and unpacking…'
              : `${formatBytes(status.bytesDone)} of ${formatBytes(total)}`}
          </span>
        </div>
      )}
      {status.state === 'error' && error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
