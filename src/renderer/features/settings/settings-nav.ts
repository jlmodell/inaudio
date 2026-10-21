import {
  AppWindow,
  Cpu,
  Download,
  Info,
  Keyboard,
  MonitorSmartphone,
  Palette,
  ShieldCheck,
  Volume2,
  type LucideIcon,
} from 'lucide-react';
import type { SettingsCategory } from '@renderer/stores/ui-store';

export interface CategoryInfo {
  id: SettingsCategory;
  label: string;
  description: string;
  icon: LucideIcon;
}

export const CATEGORY_GROUPS: { label: string; items: CategoryInfo[] }[] = [
  {
    label: 'General',
    items: [
      { id: 'appearance', label: 'Appearance', description: 'How Inaudio looks on this computer.', icon: Palette },
      { id: 'app', label: 'App', description: 'Starting, closing and setup.', icon: AppWindow },
    ],
  },
  {
    label: 'Voice',
    items: [
      { id: 'read-aloud', label: 'Read Aloud', description: 'Hear selected or typed text in a local Kokoro voice.', icon: Volume2 },
      { id: 'shortcuts', label: 'Shortcuts', description: 'Accelerators work from any app while Inaudio is running.', icon: Keyboard },
    ],
  },
  {
    label: 'Windows',
    items: [
      { id: 'tray', label: 'Tray', description: 'The menu bar icon and what it offers.', icon: MonitorSmartphone },
    ],
  },
  {
    label: 'System',
    items: [
      { id: 'performance', label: 'Performance', description: 'How hard the speech engine works and when it rests.', icon: Cpu },
      { id: 'updates', label: 'Updates', description: 'Signed updates from GitHub Releases.', icon: Download },
      { id: 'privacy', label: 'Privacy & data', description: 'What Inaudio keeps on this computer.', icon: ShieldCheck },
      { id: 'about', label: 'About', description: 'Version, data folder and engine.', icon: Info },
    ],
  },
];

export const CATEGORIES = Object.fromEntries(
  CATEGORY_GROUPS.flatMap((group) => group.items).map((item) => [item.id, item]),
) as Record<SettingsCategory, CategoryInfo>;

export const SEARCH_ITEMS: { id: string; label: string; category: SettingsCategory; keywords: string }[] = [
  { id: 'settings-theme', label: 'Theme', category: 'appearance', keywords: 'system light dark theme preview mode' },
  { id: 'settings-font-size', label: 'Font size', category: 'appearance', keywords: 'text size' },
  { id: 'settings-font-family', label: 'Font family', category: 'appearance', keywords: 'typeface font' },
  { id: 'settings-animations', label: 'Animations', category: 'appearance', keywords: 'motion reduced off' },
  { id: 'settings-content-width', label: 'Display width', category: 'appearance', keywords: 'compact default wide layout' },
  { id: 'settings-accent', label: 'Accent color', category: 'appearance', keywords: 'blue violet green amber rose color' },
  { id: 'settings-read-aloud', label: 'Read Aloud', category: 'read-aloud', keywords: 'speech voice speak tts kokoro selection' },
  { id: 'settings-read-aloud-voice', label: 'Voice and speed', category: 'read-aloud', keywords: 'speaker voice speed rate volume loudness 3x' },
  { id: 'settings-read-aloud-speed-reading', label: 'Speed reading', category: 'read-aloud', keywords: 'rsvp one word at a time follow highlight' },
  { id: 'settings-read-aloud-buffer', label: 'Sentence buffer', category: 'read-aloud', keywords: 'prefetch lookahead generate ahead sentences' },
  { id: 'settings-read-aloud-capture', label: 'Read the selection directly', category: 'read-aloud', keywords: 'accessibility ui automation selected text copy clipboard restore' },
  { id: 'settings-output-device', label: 'Playback device', category: 'read-aloud', keywords: 'speakers headphones output sound audio' },
  { id: 'settings-tray', label: 'Tray icon', category: 'tray', keywords: 'menu icon status notification' },
  { id: 'settings-tray-notifications', label: 'Tray notifications', category: 'tray', keywords: 'system notify alert' },
  { id: 'settings-shortcut-read-pause', label: 'Pause reading shortcut', category: 'shortcuts', keywords: 'read aloud resume speech' },
  { id: 'settings-shortcut-read-stop', label: 'Stop reading shortcut', category: 'shortcuts', keywords: 'read aloud end speech' },
  { id: 'settings-performance', label: 'CPU threads', category: 'performance', keywords: 'cpu threads power battery' },
  { id: 'settings-unload', label: 'Unload models when idle', category: 'performance', keywords: 'memory ram free idle minutes' },
  { id: 'settings-app', label: 'Open at login and tray', category: 'app', keywords: 'login tray setup close quit minimize' },
  { id: 'settings-launch-minimized', label: 'Launch minimized', category: 'app', keywords: 'startup hidden login background' },
  { id: 'settings-whats-new', label: 'Show what’s new after an update', category: 'updates', keywords: 'release notes announcement changelog tour' },
  { id: 'settings-updates', label: 'Updates', category: 'updates', keywords: 'update download install release rollout version automatic' },
  { id: 'settings-about', label: 'Version and data folder', category: 'about', keywords: 'version engine data folder models' },
];
