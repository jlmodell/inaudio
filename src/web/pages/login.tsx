import { useState, type FormEvent } from 'react';
import { LogoMark } from '@renderer/components/brand/logo';
import { Button } from '@renderer/components/ui/button';
import { api } from '../api';

export function LoginPage({ onSignedIn }: { onSignedIn(): void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.login(password);
      onSignedIn();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not sign in');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-full place-items-center bg-canvas px-6 text-ink">
      <form onSubmit={(event) => void submit(event)} className="grid w-full max-w-sm justify-items-center gap-5">
        <LogoMark className="size-14 text-accent" />
        <div className="grid justify-items-center gap-1 text-center">
          <h1 className="text-xl font-semibold">Inaudio</h1>
          <p className="text-sm text-muted">This copy is password protected.</p>
        </div>
        <label className="grid w-full gap-1.5">
          <span className="text-sm font-medium">Password</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="h-10 rounded-[6px] border border-line bg-surface px-3 text-sm outline-none focus:border-accent"
          />
        </label>
        {error && <p className="m-0 text-sm text-danger">{error}</p>}
        <Button type="submit" variant="primary" className="w-full" disabled={busy}>
          {busy ? 'Opening…' : 'Open Inaudio'}
        </Button>
      </form>
    </div>
  );
}
