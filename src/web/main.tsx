import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster } from '@renderer/components/ui/toast';
import { TooltipProvider } from '@renderer/components/ui/tooltip';
import '@renderer/styles/index.css';
import { App } from './app';
import { queryClient } from './queries';

document.documentElement.dataset.fontFamily = 'system';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root');

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={400}>
        <App />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  </StrictMode>,
);
