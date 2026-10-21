import { useEffect, useState } from 'react';
import { LogoMark } from '@renderer/components/brand/logo';
import { AuthError } from './api';
import { DictatePage } from './pages/dictate';
import { HistoryPage } from './pages/history';
import { LoginPage } from './pages/login';
import { ReadAloudPage } from './pages/read-aloud';
import { SettingsPage } from './pages/settings';
import { useStatus } from './queries';
import { Shell, type WebRoute } from './shell';

const ROUTES: WebRoute[] = ['dictate', 'history', 'read-aloud', 'settings'];

function routeFromHash(): WebRoute {
  const value = window.location.hash.replace(/^#\/?/, '') as WebRoute;
  return ROUTES.includes(value) ? value : 'dictate';
}

export function App() {
  const { data: status, error, isLoading, refetch } = useStatus();
  const [route, setRoute] = useState<WebRoute>(routeFromHash);

  useEffect(() => {
    const onHash = () => setRoute(routeFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const navigate = (next: WebRoute) => {
    window.location.hash = next === 'dictate' ? '' : `/${next}`;
    setRoute(next);
  };

  if (isLoading && !status) {
    return (
      <div className="grid h-full place-items-center bg-canvas text-accent">
        <LogoMark className="size-14" />
      </div>
    );
  }

  if (status?.authRequired && !status.authenticated) {
    return <LoginPage onSignedIn={() => void refetch()} />;
  }

  if (error instanceof AuthError) {
    return <LoginPage onSignedIn={() => void refetch()} />;
  }

  if (error || !status) {
    return (
      <div className="grid min-h-full place-items-center bg-canvas px-6 text-center text-ink">
        <div className="grid max-w-md justify-items-center gap-3">
          <LogoMark className="size-14 text-accent" />
          <h1 className="text-xl font-semibold">Inaudio could not start</h1>
          <p className="text-sm text-muted">
            {error instanceof Error ? error.message : 'The server did not answer.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <Shell route={route} onNavigate={navigate}>
      {route === 'dictate' && <DictatePage />}
      {route === 'history' && <HistoryPage />}
      {route === 'read-aloud' && <ReadAloudPage />}
      {route === 'settings' && <SettingsPage />}
    </Shell>
  );
}
