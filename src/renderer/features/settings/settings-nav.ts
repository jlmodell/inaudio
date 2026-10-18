import {
  AppWindow,
  Cpu,
  Download,
  Info,
  Keyboard,
  Mic,
  MonitorSmartphone,
  Palette,
  PanelBottom,
  PictureInPicture2,
  SpellCheck,
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

/** The Settings sidebar, in groups. Every setting keeps the section it always had. */
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
      { id: 'dictation', label: 'Dictation', description: 'What happens to what you say.', icon: Mic },
      { id: 'quality', label: 'Transcript quality', description: 'How finished text is cleaned up. Everything runs on this computer.', icon: SpellCheck },
      { id: 'read-aloud', label: 'Read Aloud', description: 'Hear selected or typed text in a local Kokoro voice.', icon: Volume2 },
      { id: 'shortcuts', label: 'Shortcuts', description: 'Accelerators work from any app while Inaudio is running.', icon: Keyboard },
    ],
  },
  {
    label: 'Windows',
    items: [
      { id: 'overlay', label: 'Recording overlay', description: 'The floating pill that shows what dictation is doing.', icon: PanelBottom },
      { id: 'live-window', label: 'Live window', description: 'A small floating window that shows a live transcript without opening Inaudio.', icon: PictureInPicture2 },
      { id: 'tray', label: 'Tray', description: 'The menu bar icon and what it offers.', icon: MonitorSmartphone },
    ],
  },
  {
    label: 'System',
    items: [
      { id: 'performance', label: 'Performance', description: 'How hard the speech engine works and when it rests.', icon: Cpu },
      { id: 'updates', label: 'Updates', description: 'Signed updates from GitHub Releases.', icon: Download },
      { id: 'about', label: 'About', description: 'Version, data folder and engine.', icon: Info },
    ],
  },
];

export const CATEGORIES = Object.fromEntries(
  CATEGORY_GROUPS.flatMap((group) => group.items).map((item) => [item.id, item]),
) as Record<SettingsCategory, CategoryInfo>;

/** Everything the settings search can find, and the page each one lives on. */
export const SEARCH_ITEMS: { id: string; label: string; category: SettingsCategory; keywords: string }[] = [
  { id: 'settings-theme', label: 'Theme', category: 'appearance', keywords: 'system light dark theme preview mode' },
  { id: 'settings-font-size', label: 'Font size', category: 'appearance', keywords: 'text size' },
  { id: 'settings-font-family', label: 'Font family', category: 'appearance', keywords: 'typeface font' },
  { id: 'settings-animations', label: 'Animations', category: 'appearance', keywords: 'motion reduced off' },
  { id: 'settings-content-width', label: 'Display width', category: 'appearance', keywords: 'compact default wide layout' },
  { id: 'settings-accent', label: 'Accent color', category: 'appearance', keywords: 'blue violet green amber rose color' },
  { id: 'settings-dictation', label: 'Dictation', category: 'dictation', keywords: 'recording transcript clipboard history push to talk toggle insert' },
  { id: 'settings-cues', label: 'Sound cues', category: 'dictation', keywords: 'audio tones volume start stop error' },
  { id: 'settings-smart-join', label: 'Join live passages into sentences', category: 'quality', keywords: 'full stop period repeated words paragraph pause' },
  { id: 'settings-restore-punctuation', label: 'Restore punctuation and capitals', category: 'quality', keywords: 'commas question marks capital letters model' },
  { id: 'settings-custom-words', label: 'Custom words', category: 'quality', keywords: 'vocabulary names terms replace correct spelling' },
  { id: 'settings-read-aloud', label: 'Read Aloud', category: 'read-aloud', keywords: 'speech voice speak tts kokoro selection' },
  { id: 'settings-read-aloud-voice', label: 'Voice and speed', category: 'read-aloud', keywords: 'speaker voice speed rate volume loudness' },
  { id: 'settings-read-aloud-capture', label: 'Read the selection directly', category: 'read-aloud', keywords: 'accessibility ui automation selected text copy clipboard restore' },
  { id: 'settings-read-aloud-overlay', label: 'Read Aloud in the overlay', category: 'read-aloud', keywords: 'pill pause stop dictation follow highlight' },
  { id: 'settings-overlay', label: 'Recording overlay', category: 'overlay', keywords: 'pill floating window show hide' },
  { id: 'settings-overlay-visibility', label: 'When to show the overlay', category: 'overlay', keywords: 'always while active hide idle' },
  { id: 'settings-overlay-placement', label: 'Overlay placement', category: 'overlay', keywords: 'position corner top bottom left right screen drag move' },
  { id: 'settings-overlay-display', label: 'Overlay display', category: 'overlay', keywords: 'monitor screen cursor pointer primary follow' },
  { id: 'settings-overlay-opacity', label: 'Overlay opacity', category: 'overlay', keywords: 'transparent fade solid' },
  { id: 'settings-overlay-click-through', label: 'Click through', category: 'overlay', keywords: 'mouse clicks idle ignore' },
  { id: 'settings-overlay-sections', label: 'Overlay contents', category: 'overlay', keywords: 'timer level model language meter elapsed caption' },
  { id: 'settings-live-window-open', label: 'Show the live window when a session starts', category: 'live-window', keywords: 'floating live transcript captions pop out open automatically' },
  { id: 'settings-live-window-top', label: 'Keep the live window on top', category: 'live-window', keywords: 'always on top pin float' },
  { id: 'settings-live-window-capture', label: 'Hide the live window from screen sharing', category: 'live-window', keywords: 'privacy content protection screenshot meeting share' },
  { id: 'settings-live-window-text', label: 'Live window text size', category: 'live-window', keywords: 'font large small captions' },
  { id: 'settings-live-window-position', label: 'Live window placement', category: 'live-window', keywords: 'corner position opacity' },
  { id: 'settings-tray', label: 'Tray icon', category: 'tray', keywords: 'menu icon status notification' },
  { id: 'settings-tray-left-click', label: 'Tray left click', category: 'tray', keywords: 'window dictate' },
  { id: 'settings-tray-microphones', label: 'Tray microphones', category: 'tray', keywords: 'input device menu' },
  { id: 'settings-tray-notifications', label: 'Tray notifications', category: 'tray', keywords: 'system notify alert' },
  { id: 'settings-shortcut-dictation', label: 'Dictation shortcut', category: 'shortcuts', keywords: 'keyboard keys accelerator hotkey' },
  { id: 'settings-shortcut-cancel', label: 'Cancel recording shortcut', category: 'shortcuts', keywords: 'escape abort discard' },
  { id: 'settings-shortcut-read-pause', label: 'Pause reading shortcut', category: 'shortcuts', keywords: 'read aloud resume speech' },
  { id: 'settings-shortcut-read-stop', label: 'Stop reading shortcut', category: 'shortcuts', keywords: 'read aloud end speech' },
  { id: 'settings-shortcut-overlay', label: 'Overlay shortcut', category: 'shortcuts', keywords: 'show hide pill' },
  { id: 'settings-shortcut-live', label: 'Live transcript shortcut', category: 'shortcuts', keywords: 'system audio loopback meeting record' },
  { id: 'settings-shortcut-live-window', label: 'Live window shortcut', category: 'shortcuts', keywords: 'floating show hide captions' },
  { id: 'settings-performance', label: 'CPU threads', category: 'performance', keywords: 'cpu threads power battery' },
  { id: 'settings-unload', label: 'Unload models when idle', category: 'performance', keywords: 'memory ram free idle minutes' },
  { id: 'settings-app', label: 'Open at login and tray', category: 'app', keywords: 'login tray setup close quit' },
  { id: 'settings-updates', label: 'Updates', category: 'updates', keywords: 'update download install release rollout version automatic' },
  { id: 'settings-about', label: 'Version and data folder', category: 'about', keywords: 'version engine data folder models' },
];
