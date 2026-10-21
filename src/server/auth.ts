import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_ATTEMPTS = 10;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
export const SESSION_COOKIE = 'inaudio_session';

function scrypt(password: string, salt: Buffer): Buffer {
  return scryptSync(password, salt, 32, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
}

function digestToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Optional password gate. An empty password leaves the app open on the local network. */
export class AuthGate {
  private readonly salt: Buffer;
  private readonly hash: Buffer | null;
  private readonly sessions = new Map<string, number>();
  private readonly attempts = new Map<string, number[]>();

  constructor(password: string) {
    this.salt = randomBytes(16);
    this.hash = password ? scrypt(password, this.salt) : null;
  }

  get required(): boolean {
    return this.hash !== null;
  }

  login(password: string, ip: string): string | null {
    if (!this.hash) return this.issue();
    const now = Date.now();
    const recent = (this.attempts.get(ip) ?? []).filter((at) => now - at < ATTEMPT_WINDOW_MS);
    if (recent.length >= MAX_ATTEMPTS) return null;
    recent.push(now);
    this.attempts.set(ip, recent);
    const offered = scrypt(password, this.salt);
    if (offered.length !== this.hash.length || !timingSafeEqual(offered, this.hash)) return null;
    this.attempts.delete(ip);
    return this.issue();
  }

  verify(token: string | undefined): boolean {
    if (!this.hash) return true;
    if (!token) return false;
    const expires = this.sessions.get(digestToken(token));
    if (!expires) return false;
    if (expires <= Date.now()) {
      this.sessions.delete(digestToken(token));
      return false;
    }
    return true;
  }

  logout(token: string | undefined): void {
    if (token) this.sessions.delete(digestToken(token));
  }

  cookie(token: string, secure: boolean): string {
    const parts = [
      `${SESSION_COOKIE}=${token}`,
      'Path=/',
      'HttpOnly',
      'SameSite=Lax',
      `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
    ];
    if (secure) parts.push('Secure');
    return parts.join('; ');
  }

  clearCookie(secure: boolean): string {
    const parts = [`${SESSION_COOKIE}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
    if (secure) parts.push('Secure');
    return parts.join('; ');
  }

  private issue(): string {
    const token = randomBytes(32).toString('hex');
    this.sessions.set(digestToken(token), Date.now() + SESSION_TTL_MS);
    return token;
  }
}

export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const trimmed = part.trim();
    const cut = trimmed.indexOf('=');
    if (cut <= 0) continue;
    if (trimmed.slice(0, cut) === name) return trimmed.slice(cut + 1);
  }
  return undefined;
}
