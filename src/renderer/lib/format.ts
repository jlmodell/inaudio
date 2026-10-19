export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[unit]}`;
}

export function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const time = new Intl.DateTimeFormat(undefined, { timeStyle: 'short' });

export function formatWhen(epochMs: number): string {
  const date = new Date(epochMs);
  const today = new Date();
  return date.toDateString() === today.toDateString() ? `Today, ${time.format(date)}` : dateTime.format(date);
}

export function formatTime(epochMs: number): string {
  return time.format(new Date(epochMs));
}

const weekday = new Intl.DateTimeFormat(undefined, { weekday: 'long' });
const dayMonth = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'long' });
const dayMonthYear = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'long', year: 'numeric' });

/** The heading a day's items sit under: Today, Yesterday, a weekday this week, then the date. */
export function formatDay(epochMs: number, now = Date.now()): string {
  const start = (ms: number) => new Date(new Date(ms).toDateString()).getTime();
  const days = Math.round((start(now) - start(epochMs)) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return weekday.format(new Date(epochMs));
  return new Date(epochMs).getFullYear() === new Date(now).getFullYear() ? dayMonth.format(new Date(epochMs)) : dayMonthYear.format(new Date(epochMs));
}

/** Items already in order, cut into runs that share a formatDay heading. */
export function groupByDay<T extends { createdAt: number }>(items: T[]): { day: string; items: T[] }[] {
  const groups: { day: string; items: T[] }[] = [];
  for (const item of items) {
    const day = formatDay(item.createdAt);
    const last = groups[groups.length - 1];
    if (last?.day === day) last.items.push(item);
    else groups.push({ day, items: [item] });
  }
  return groups;
}

/** Renders an Electron accelerator for the current platform. */
export function formatAccelerator(accelerator: string, platform: string): string[] {
  const mac = platform === 'darwin';
  return accelerator.split('+').map((part) => {
    switch (part) {
      case 'CommandOrControl':
      case 'CmdOrCtrl':
        return mac ? '⌘' : 'Ctrl';
      case 'Shift':
        return mac ? '⇧' : 'Shift';
      case 'Alt':
      case 'Option':
        return mac ? '⌥' : 'Alt';
      case 'Control':
      case 'Ctrl':
        return mac ? '⌃' : 'Ctrl';
      case 'Super':
      case 'Meta':
        return mac ? '⌘' : 'Win';
      default:
        return part;
    }
  });
}

const MODIFIERS: Record<string, string> = {
  Control: 'Control',
  Meta: 'Super',
  Alt: 'Alt',
  Shift: 'Shift',
};

/** Converts a keydown event into an Electron accelerator, or null if incomplete. */
export function acceleratorFromEvent(event: KeyboardEvent, platform: string): string | null {
  if (event.key in MODIFIERS) return null;
  const parts: string[] = [];
  const mac = platform === 'darwin';
  if ((mac && event.metaKey) || (!mac && event.ctrlKey)) parts.push('CommandOrControl');
  if (mac && event.ctrlKey) parts.push('Control');
  if (!mac && event.metaKey) parts.push('Super');
  if (event.altKey) parts.push('Alt');
  if (event.shiftKey) parts.push('Shift');
  if (parts.length === 0) return null;
  const code = event.code;
  let key: string | null = null;
  if (/^Key[A-Z]$/.test(code)) key = code.slice(3);
  else if (/^Digit\d$/.test(code)) key = code.slice(5);
  else if (/^F\d{1,2}$/.test(code)) key = code;
  else if (code === 'Space') key = 'Space';
  else if (code === 'Backquote') key = '`';
  else if (code === 'Period') key = '.';
  else if (code === 'Comma') key = ',';
  else if (code === 'Slash') key = '/';
  else if (code === 'Semicolon') key = ';';
  return key ? [...parts, key].join('+') : null;
}
