import * as AlertDialogPrimitive from '@radix-ui/react-alert-dialog';
import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import { Check } from 'lucide-react';
import { useId, useState } from 'react';
import { Button } from '@renderer/components/ui/button';

/** Shown before a live transcript starts, until the user asks not to see it again. */
export function ConsentDialog({
  open,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  onCancel(): void;
  onConfirm(remember: boolean): void;
}) {
  const [remember, setRemember] = useState(false);
  const id = useId();
  return (
    <AlertDialogPrimitive.Root open={open} onOpenChange={(next) => !next && onCancel()}>
      <AlertDialogPrimitive.Portal>
        <AlertDialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <AlertDialogPrimitive.Content className="fixed top-1/2 left-1/2 z-50 grid w-[440px] -translate-x-1/2 -translate-y-1/2 gap-4 overscroll-contain rounded-xl bg-surface p-6">
          <AlertDialogPrimitive.Title className="text-base font-semibold text-balance">Record system audio?</AlertDialogPrimitive.Title>
          <AlertDialogPrimitive.Description className="text-sm leading-relaxed text-muted">
            Live transcript records everything this computer plays, including other people on a call. Make sure everyone
            has agreed to be recorded. Audio stays on this computer and is never saved.
          </AlertDialogPrimitive.Description>
          <label htmlFor={id} className="flex cursor-pointer items-center gap-2.5 text-sm">
            <CheckboxPrimitive.Root
              id={id}
              checked={remember}
              onCheckedChange={(value) => setRemember(value === true)}
              className="grid size-4 shrink-0 place-items-center rounded-[4px] border-2 border-line-strong data-[state=checked]:border-accent data-[state=checked]:bg-accent"
            >
              <CheckboxPrimitive.Indicator>
                <Check aria-hidden className="size-3 text-on-accent" strokeWidth={3} />
              </CheckboxPrimitive.Indicator>
            </CheckboxPrimitive.Root>
            Don’t show this again
          </label>
          <div className="flex justify-end gap-2">
            <AlertDialogPrimitive.Cancel asChild>
              <Button variant="ghost">Cancel</Button>
            </AlertDialogPrimitive.Cancel>
            <AlertDialogPrimitive.Action asChild>
              <Button variant="primary" onClick={() => onConfirm(remember)}>
                Start recording
              </Button>
            </AlertDialogPrimitive.Action>
          </div>
        </AlertDialogPrimitive.Content>
      </AlertDialogPrimitive.Portal>
    </AlertDialogPrimitive.Root>
  );
}
