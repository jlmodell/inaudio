import type { ReleaseNote } from '../update/release-markdown';

export type UpdateState =
  | 'unavailable'
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'up-to-date'
  | 'error';

export interface UpdateStatus {
  state: UpdateState;
  currentVersion: string;
  availableVersion?: string;
  releaseDate?: string;
  progress?: number;
  /** Bytes downloaded so far and in all, while downloading. */
  transferred?: number;
  total?: number;
  /** Current download speed, in bytes per second. */
  bytesPerSecond?: number;
  /** The release's title, when it has one. */
  releaseName?: string;
  /** What changed, as plain text: release HTML is converted in the main process. */
  releaseNotes?: string;
  error?: string;
  canInstall: boolean;
  checkedAt?: number;
}

/** Published releases from GitHub, newest first, with when they were fetched. */
export interface ReleaseNotesResult {
  releases: ReleaseNote[];
  /** Epoch ms of the last successful fetch, 0 if none. */
  fetchedAt: number;
  /** Why the latest attempt failed; the last good list is still returned. */
  error?: string;
  /** Not fetched because automatic updates are off and nobody asked. */
  paused?: boolean;
}
