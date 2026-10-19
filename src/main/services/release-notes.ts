import { app, session, type Session } from 'electron';
import { z } from 'zod';
import { parseReleaseMarkdown, type ReleaseNote } from '@shared/update/release-markdown';
import type { ReleaseNotesResult } from '@shared/domain/update';

/** The same repository the update feed reads (assets/app-update.yml). */
const REPOSITORY = 'shikki841/inaudio';
const RELEASES_URL = `https://api.github.com/repos/${REPOSITORY}/releases?per_page=10`;
const RELEASE_PAGE = `https://github.com/${REPOSITORY}/releases/`;
/**
 * Notes are asked for again at most this often. Each ask is conditional (If-None-Match), and
 * GitHub does not count a 304 against the 60-an-hour limit for unauthenticated requests.
 */
const FRESH_MS = 30_000;
const TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 2_000_000;

const releaseSchema = z.object({
  tag_name: z.string().max(64),
  name: z.string().max(200).nullable(),
  body: z.string().max(100_000).nullable(),
  published_at: z.string().max(40).nullable(),
  html_url: z.string().url(),
  draft: z.boolean(),
  prerelease: z.boolean(),
});

let notesSession: Session | null = null;

/** A session that can reach this repository's releases on the GitHub API and nothing else. */
function releaseSession(): Session {
  if (!notesSession) {
    notesSession = session.fromPartition('inaudio-release-notes', { cache: false });
    notesSession.webRequest.onBeforeRequest((details, callback) => {
      callback({ cancel: !details.url.startsWith(`https://api.github.com/repos/${REPOSITORY}/releases`) });
    });
    notesSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  }
  return notesSession;
}

/**
 * What's new, straight from the published GitHub releases. Only published, non-prerelease
 * releases are kept, their pages must be on this repository, and their Markdown is reduced
 * to plain text before anything leaves this process.
 */
export class ReleaseNotesService {
  private cache: { releases: ReleaseNote[]; fetchedAt: number; etag: string } | null = null;
  private pending: Promise<ReleaseNotesResult> | null = null;

  cached(): ReleaseNotesResult {
    return { releases: this.cache?.releases ?? [], fetchedAt: this.cache?.fetchedAt ?? 0 };
  }

  async get(force: boolean): Promise<ReleaseNotesResult> {
    if (!force && this.cache && Date.now() - this.cache.fetchedAt < FRESH_MS) return this.cached();
    this.pending ??= this.fetch().finally(() => {
      this.pending = null;
    });
    return this.pending;
  }

  private async fetch(): Promise<ReleaseNotesResult> {
    try {
      const response = await releaseSession().fetch(RELEASES_URL, {
        headers: {
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': `Inaudio/${app.getVersion()}`,
          ...(this.cache?.etag ? { 'If-None-Match': this.cache.etag } : {}),
        },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        redirect: 'error',
      });
      if (response.status === 304 && this.cache) {
        this.cache = { ...this.cache, fetchedAt: Date.now() };
        return this.cached();
      }
      if (!response.ok) throw new Error(response.status === 403 ? 'GitHub is limiting requests. Try again later.' : `GitHub answered ${response.status}.`);
      const text = await response.text();
      if (text.length > MAX_RESPONSE_BYTES) throw new Error('The release list was too large.');
      const parsed = z.array(releaseSchema).max(100).parse(JSON.parse(text));
      const releases = parsed
        .filter((release) => !release.draft && !release.prerelease && release.html_url.startsWith(RELEASE_PAGE))
        .map((release) => ({
          version: release.tag_name.replace(/^v/i, ''),
          name: release.name ?? release.tag_name,
          publishedAt: release.published_at ?? '',
          url: release.html_url,
          blocks: parseReleaseMarkdown(release.body ?? ''),
        }));
      const etag = response.headers.get('etag') ?? '';
      this.cache = { releases, fetchedAt: Date.now(), etag: etag.length <= 200 ? etag : '' };
      return this.cached();
    } catch (error) {
      const message = error instanceof Error && error.name !== 'TimeoutError' && !/fetch failed|ERR_/i.test(error.message)
        ? error.message
        : 'GitHub could not be reached. Check your connection.';
      return { ...this.cached(), error: message.slice(0, 200) };
    }
  }
}
