import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { LiveWindow } from './features/live-window/live-window';
import './styles/index.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

// Thin like the overlay: no query client and no tooltip provider. The window renders one
// pushed message and fetches nothing.
createRoot(root).render(
  <StrictMode>
    <LiveWindow />
  </StrictMode>,
);
