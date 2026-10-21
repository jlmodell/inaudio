import { useEffect, useState } from 'react';
import { Notice } from '@renderer/components/ui/layout';
import { formatReadAloudDiag, readAloudDiag, subscribeAloudDiag, type ReadAloudDiag } from './diag';

export function useReadAloudDiag(): ReadAloudDiag {
  const [diag, setDiag] = useState(readAloudDiag);
  useEffect(() => subscribeAloudDiag(setDiag), []);
  return diag;
}

export function ReadAloudDiagLine({ className }: { className?: string }) {
  const diag = useReadAloudDiag();
  return (
    <p className={className ?? 'text-xs text-muted'}>
      {formatReadAloudDiag(diag)}
      {diag.runtime === 'wasm-single' && !diag.isolated
        ? ' Tailscale Serve often drops the isolation headers this voice needs for more than one thread.'
        : ''}
    </p>
  );
}

export function IsolationNotice() {
  const diag = useReadAloudDiag();
  if (diag.runtime !== 'wasm-single' || diag.isolated) return null;
  return (
    <Notice>
      This page is not cross-origin isolated, so the on-device voice can use only one WASM thread. Put Caddy in front
      and keep the isolation headers (see the self-hosting notes), raise the sentence buffer, or use this browser&apos;s
      built-in voice.
    </Notice>
  );
}
