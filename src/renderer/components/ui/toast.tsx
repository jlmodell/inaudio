import * as ToastPrimitive from '@radix-ui/react-toast';
import { X } from 'lucide-react';
import { create } from 'zustand';
import { cn } from '@renderer/lib/cn';

type ToastTone = 'neutral' | 'danger';

interface ToastItem {
  id: number;
  title: string;
  description?: string;
  tone: ToastTone;
}

const useToasts = create<{ items: ToastItem[]; dismiss(id: number): void }>((set) => ({
  items: [],
  dismiss: (id) => set((state) => ({ items: state.items.filter((item) => item.id !== id) })),
}));

let nextId = 1;

/** A short, non-blocking note. Inline errors stay in a Notice; this is for passing events. */
export function toast(title: string, options: { description?: string; tone?: ToastTone } = {}): void {
  const item: ToastItem = { id: nextId++, title, description: options.description, tone: options.tone ?? 'neutral' };
  useToasts.setState((state) => ({ items: [...state.items.slice(-2), item] }));
}

export function Toaster() {
  const { items, dismiss } = useToasts();
  return (
    <ToastPrimitive.Provider swipeDirection="right" duration={5000}>
      {items.map((item) => (
        <ToastPrimitive.Root
          key={item.id}
          onOpenChange={(open) => !open && dismiss(item.id)}
          className="flex items-start gap-3 rounded-[12px] border border-line bg-surface px-4 py-3 shadow-[0_8px_24px_rgb(0_0_0/0.12)] dark:shadow-[0_8px_24px_rgb(0_0_0/0.5)]"
        >
          <div className="grid min-w-0 flex-1 gap-0.5">
            <ToastPrimitive.Title className={cn('text-sm font-medium', item.tone === 'danger' ? 'text-danger' : 'text-ink')}>
              {item.title}
            </ToastPrimitive.Title>
            {item.description && (
              <ToastPrimitive.Description className="text-sm text-muted">{item.description}</ToastPrimitive.Description>
            )}
          </div>
          <ToastPrimitive.Close aria-label="Dismiss" className="rounded p-0.5 text-faint hover:text-ink">
            <X className="size-4" />
          </ToastPrimitive.Close>
        </ToastPrimitive.Root>
      ))}
      <ToastPrimitive.Viewport className="fixed right-4 bottom-4 z-50 grid w-[360px] max-w-[calc(100vw-2rem)] gap-2 outline-none" />
    </ToastPrimitive.Provider>
  );
}
