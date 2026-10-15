import { Minus, Square, SquareDashed, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { AppMenuCommand } from '@shared/domain/system';
import { IconButton } from '@renderer/components/ui/icon-button';
import { api } from '@renderer/lib/api';
import { useSystemStatus } from '@renderer/lib/queries';

const MENUS: {
  label: string;
  items: { label: string; command: AppMenuCommand }[];
}[] = [
  {
    label: 'File',
    items: [
      { label: 'Open models folder', command: 'file.open-models-folder' },
      { label: 'Run setup', command: 'file.run-setup' },
      { label: 'Quit', command: 'file.quit' },
    ],
  },
  {
    label: 'View',
    items: [
      { label: 'Dictation', command: 'view.dictation' },
      { label: 'History', command: 'view.history' },
      { label: 'Read Aloud', command: 'view.read-aloud' },
      { label: 'Models', command: 'view.models' },
      { label: 'Audio', command: 'view.audio' },
      { label: 'Companion', command: 'view.companion' },
      { label: 'Settings', command: 'view.settings' },
    ],
  },
];

/** Menus on the left, window controls on the right; everything between drags the window. */
export function TitleBar() {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const menuBarRef = useRef<HTMLElement>(null);
  const { data: status } = useSystemStatus();

  useEffect(() => {
    const closeMenu = (event: MouseEvent) => {
      if (menuBarRef.current && !menuBarRef.current.contains(event.target as Node)) setOpenMenu(null);
    };
    document.addEventListener('mousedown', closeMenu);
    return () => document.removeEventListener('mousedown', closeMenu);
  }, []);

  return (
    <header className="drag flex h-[44px] items-center justify-between bg-surface/80 px-3 backdrop-blur-sm">
      <nav ref={menuBarRef} className="no-drag flex items-center gap-1" aria-label="Application menu">
        {MENUS.map((menu) => {
          const isOpen = openMenu === menu.label;
          return (
            <div key={menu.label} className="relative">
              <button
                type="button"
                className="rounded-[6px] px-2 py-1 text-xs font-medium text-muted hover:bg-surface hover:text-ink"
                aria-haspopup="menu"
                aria-expanded={isOpen}
                onClick={() => setOpenMenu(isOpen ? null : menu.label)}
              >
                {menu.label}
              </button>
              {isOpen && (
                <div role="menu" aria-label={`${menu.label} menu`} className="absolute left-0 top-full z-10 mt-1 min-w-44 rounded-md border border-line bg-surface p-1 shadow-lg">
                  {menu.items.map((item) => (
                    <button
                      key={item.command}
                      type="button"
                      role="menuitem"
                      className="block w-full rounded px-3 py-1.5 text-left text-sm text-ink hover:bg-sunken"
                      onClick={() => {
                        setOpenMenu(null);
                        void api.system.menu(item.command);
                      }}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="no-drag flex items-center gap-1">
        <button
          type="button"
          className="rounded-[6px] p-1 text-muted hover:bg-surface hover:text-ink"
          onClick={() => void api.system.window('minimize')}
          aria-label="Minimize window"
        >
          <Minus className="size-4" />
        </button>
        <button
          type="button"
          className="rounded-[6px] p-1 text-muted hover:bg-surface hover:text-ink"
          onClick={() => void api.system.window('maximize-toggle')}
          aria-label={status?.window.maximized ? 'Restore window' : 'Maximize window'}
        >
          {status?.window.maximized ? <SquareDashed className="size-3.5" /> : <Square className="size-3.5" />}
        </button>
        <IconButton label="Close window" className="text-muted hover:bg-danger hover:text-white" onClick={() => void api.system.window('close')}>
          <X />
        </IconButton>
      </div>
    </header>
  );
}
