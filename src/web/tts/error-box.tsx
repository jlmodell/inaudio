import { useState, type ReactNode } from 'react';
import { Button } from '@renderer/components/ui/button';
import { cn } from '@renderer/lib/cn';

export function VoiceErrorBox({
  title,
  detail,
  tone = 'danger',
  onRetry,
}: {
  title: string;
  detail: string;
  tone?: 'danger' | 'warning';
  onRetry?: () => void;
}): ReactNode {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    const text = detail.trim() ? `${title}\n\n${detail}` : title;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.left = '-9999px';
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      area.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div
      role="alert"
      className={cn(
        'grid gap-2 rounded-lg px-4 py-3 text-sm',
        tone === 'danger' ? 'bg-danger-soft text-danger' : 'bg-warning-soft text-warning',
      )}
    >
      <p className="font-medium">{title}</p>
      {detail.trim() && (
        <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-ink">
          {detail}
        </pre>
      )}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => void copy()}>
          {copied ? 'Copied' : 'Copy error'}
        </Button>
        {onRetry && (
          <Button size="sm" variant="primary" onClick={onRetry}>
            Try on-device voice again
          </Button>
        )}
      </div>
    </div>
  );
}
