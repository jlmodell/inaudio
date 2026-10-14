import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import {
  DEFAULT_SETTINGS,
  coerceSettings,
  mergeSettings,
  type Settings,
  type SettingsPatch,
} from '@shared/domain/settings';

/** Versioned JSON settings with atomic writes. Invalid files fall back to defaults. */
export class SettingsStore extends EventEmitter<{ change: [Settings, Settings] }> {
  private current: Settings;

  constructor(private readonly file: string) {
    super();
    this.current = this.read();
  }

  get(): Settings {
    return this.current;
  }

  update(patch: SettingsPatch): Settings {
    const previous = this.current;
    const next = mergeSettings(previous, patch);
    this.write(next);
    this.current = next;
    this.emit('change', next, previous);
    return next;
  }

  private read(): Settings {
    try {
      // Field by field, so one stale or invalid value in an older file does not reset the rest.
      return coerceSettings(JSON.parse(fs.readFileSync(this.file, 'utf8')) as unknown);
    } catch {
      // Missing or unreadable file.
    }
    return DEFAULT_SETTINGS;
  }

  private write(settings: Settings): void {
    const tmp = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(settings, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, this.file);
  }
}
