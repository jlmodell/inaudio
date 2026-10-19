import * as DialogPrimitive from '@radix-ui/react-dialog';
import { ClipboardPaste, Copy, Download, PanelRightOpen, PencilLine, Pin, PinOff, Trash2, Volume2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { MAX_TITLE_CHARS, transcriptTitle, type ExportFormat, type Transcript } from '@shared/domain/history';
import { ConfirmDialog } from '@renderer/components/ui/alert-dialog';
import { Button } from '@renderer/components/ui/button';
import { ActionMenu, MenuItem, MenuSeparator, MenuSub } from '@renderer/components/ui/menu';
import { toast } from '@renderer/components/ui/toast';
import { useReadAloud } from '@renderer/features/read-aloud/read-aloud-store';
import { api, errorMessage } from '@renderer/lib/api';

export const EXPORT_OPTIONS: { format: ExportFormat; label: string }[] = [
  { format: 'txt', label: 'Plain text' },
  { format: 'md', label: 'Markdown' },
  { format: 'json', label: 'JSON' },
];

export const SOURCE_LABEL: Record<Transcript['source'], string> = {
  microphone: 'Dictation',
  system: 'System audio',
  'system+mic': 'System + microphone',
  device: 'Audio device',
};

function fail(error: unknown): void {
  toast(errorMessage(error), { tone: 'danger' });
}

/** Asks for a new title. Empty puts the first words back. */
function RenameDialog({ item, onClose }: { item: Transcript | null; onClose(): void }) {
  const [value, setValue] = useState('');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!item) return;
    void api.history
      .update(item.id, { title: value.trim() })
      .then(onClose)
      .catch(fail);
  };
  return (
    <DialogPrimitive.Root
      open={item !== null}
      onOpenChange={(open) => {
        if (open && item) setValue(item.title);
        if (!open) onClose();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[60] bg-black/40" />
        <DialogPrimitive.Content
          onOpenAutoFocus={() => item && setValue(item.title)}
          className="fixed top-1/2 left-1/2 z-[60] grid w-[420px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl bg-surface p-6"
        >
          <DialogPrimitive.Title className="text-base font-semibold">Rename transcript</DialogPrimitive.Title>
          <DialogPrimitive.Description className="text-sm text-muted">
            Leave it empty to show the first words again.
          </DialogPrimitive.Description>
          <form onSubmit={submit} className="grid gap-4">
            <input
              autoFocus
              aria-label="Title"
              value={value}
              maxLength={MAX_TITLE_CHARS}
              placeholder={item ? transcriptTitle({ title: '', text: item.text }) : ''}
              onChange={(event) => setValue(event.target.value)}
              className="h-10 rounded-lg bg-sunken px-3 text-sm text-ink outline-none placeholder:text-faint focus:shadow-[0_0_0_2px_var(--accent)]"
            />
            <div className="flex justify-end gap-2">
              <DialogPrimitive.Close asChild>
                <Button variant="ghost">Cancel</Button>
              </DialogPrimitive.Close>
              <Button type="submit" variant="primary">
                Save
              </Button>
            </div>
          </form>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/**
 * Everything a saved transcript can do, shared by the History list, its drawer and the Live
 * page's saved sessions. Text never leaves this computer: copy and type use the clipboard,
 * export writes where the user picks in the system save dialog.
 */
export function useTranscriptActions(options: { onDeleted?(id: string): void } = {}) {
  const [renaming, setRenaming] = useState<Transcript | null>(null);
  const [deleting, setDeleting] = useState<Transcript | null>(null);

  const actions = {
    copy: (item: Transcript) =>
      void api.text
        .copy(item.text)
        .then(() => toast('Copied to the clipboard'))
        .catch(fail),
    insert: (item: Transcript) => void api.text.insert(item.text).catch(fail),
    /** Reads it in the Read Aloud voice; the Now reading bar keeps the controls in reach. */
    readAloud: (item: Transcript) => void useReadAloud.getState().readText(item.text, { id: item.id, title: transcriptTitle(item) }),
    exportAs: (item: Transcript, format: ExportFormat) =>
      void api.history
        .export({ ids: [item.id], format })
        .then((count) => count > 0 && toast('Transcript exported'))
        .catch(fail),
    togglePin: (item: Transcript) =>
      void api.history
        .update(item.id, { pinned: !item.pinned })
        .then(() => toast(item.pinned ? 'Unpinned' : 'Pinned'))
        .catch(fail),
    rename: (item: Transcript) => setRenaming(item),
    remove: (item: Transcript) => setDeleting(item),
  };

  const dialogs = (
    <>
      <RenameDialog item={renaming} onClose={() => setRenaming(null)} />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete this transcript?"
        description={deleting ? `“${transcriptTitle(deleting)}” is deleted from this computer. This cannot be undone.` : ''}
        confirmLabel="Delete"
        onConfirm={() => {
          const item = deleting;
          setDeleting(null);
          if (!item) return;
          void api.history
            .remove(item.id)
            .then(() => options.onDeleted?.(item.id))
            .catch(fail);
        }}
      />
    </>
  );

  return { actions, dialogs };
}

export type TranscriptActions = ReturnType<typeof useTranscriptActions>['actions'];

/** The "⋯" menu on a transcript: eight actions, export by format. */
export function TranscriptMenu({
  item,
  actions,
  onOpen,
  triggerClassName,
}: {
  item: Transcript;
  actions: TranscriptActions;
  /** Omitted inside the drawer, where the transcript is already open. */
  onOpen?(): void;
  triggerClassName?: string;
}) {
  return (
    <ActionMenu label={`Actions for ${transcriptTitle(item)}`} triggerClassName={triggerClassName}>
      {onOpen && (
        <MenuItem icon={<PanelRightOpen />} onSelect={onOpen}>
          Open
        </MenuItem>
      )}
      <MenuItem icon={<Copy />} onSelect={() => actions.copy(item)}>
        Copy text
      </MenuItem>
      <MenuItem icon={<Volume2 />} onSelect={() => actions.readAloud(item)}>
        Read aloud
      </MenuItem>
      <MenuItem icon={<ClipboardPaste />} onSelect={() => actions.insert(item)}>
        Type into focused app
      </MenuItem>
      <MenuSub label="Export" icon={<Download />}>
        {EXPORT_OPTIONS.map((option) => (
          <MenuItem key={option.format} onSelect={() => actions.exportAs(item, option.format)} tail={`.${option.format}`}>
            {option.label}
          </MenuItem>
        ))}
      </MenuSub>
      <MenuItem icon={<PencilLine />} onSelect={() => actions.rename(item)}>
        Rename
      </MenuItem>
      <MenuItem icon={item.pinned ? <PinOff /> : <Pin />} onSelect={() => actions.togglePin(item)}>
        {item.pinned ? 'Unpin' : 'Pin'}
      </MenuItem>
      <MenuSeparator />
      <MenuItem icon={<Trash2 />} danger onSelect={() => actions.remove(item)}>
        Delete…
      </MenuItem>
    </ActionMenu>
  );
}
