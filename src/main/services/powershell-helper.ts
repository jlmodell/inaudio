import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import path from 'node:path';

/**
 * A long-lived PowerShell that answers one line per request. The script prints `ready`
 * once it has loaded, then reads fixed request tokens from stdin and writes one reply
 * line for each. Only constant tokens are ever written to it.
 */
export class PowerShellHelper {
  private child: ChildProcessWithoutNullStreams | null = null;
  private ready = false;
  private buffer = '';
  private waiter: { resolve(line: string): void; reject(error: Error): void } | null = null;

  constructor(
    private readonly file: string,
    private readonly script: string,
    private readonly timeoutMs: number,
    private readonly name: string,
  ) {}

  /** Starts the helper in the background; true once it can take a request. */
  warm(): boolean {
    if (!this.child) this.start();
    return this.ready;
  }

  /** Starts the helper if needed and resolves true once it can take a request, false on timeout or exit. */
  async whenReady(timeoutMs: number): Promise<boolean> {
    this.warm();
    const until = Date.now() + timeoutMs;
    while (!this.ready) {
      if (!this.child || Date.now() >= until) return false;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    return true;
  }

  /** True from start until the process exits or is disposed. */
  get running(): boolean {
    return this.child !== null;
  }

  /** True while a request is waiting for its reply. */
  get busy(): boolean {
    return this.waiter !== null;
  }

  async request(token: string): Promise<string> {
    if (!this.child || !this.ready) throw new Error(`${this.name} is not ready`);
    if (this.waiter) throw new Error(`${this.name} is busy`);
    const reply = this.next();
    this.child.stdin.write(`${token}\n`);
    return reply;
  }

  dispose(): void {
    const child = this.child;
    this.reset(new Error(`${this.name} stopped`));
    child?.kill();
  }

  private start(): void {
    const child = spawn(this.file, ['-NoProfile', '-NonInteractive', '-Command', this.script], {
      windowsHide: true,
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.child = child;
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (data: string) => {
      this.buffer += data;
      let index: number;
      while ((index = this.buffer.indexOf('\n')) >= 0) {
        const line = this.buffer.slice(0, index).trim();
        this.buffer = this.buffer.slice(index + 1);
        if (!this.ready && line === 'ready') this.ready = true;
        else this.settle(line);
      }
    });
    child.stderr.resume();
    child.stdin.on('error', () => undefined);
    child.once('error', (error) => { if (this.child === child) this.reset(error); });
    child.once('exit', () => { if (this.child === child) this.reset(new Error(`${this.name} exited`)); });
  }

  private next(): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        // A wedged helper is replaced on the next request.
        this.dispose();
        reject(new Error(`${this.name} timed out`));
      }, this.timeoutMs);
      this.waiter = {
        resolve: (line) => { clearTimeout(timer); resolve(line); },
        reject: (error) => { clearTimeout(timer); reject(error); },
      };
    });
  }

  private settle(line: string): void {
    const waiter = this.waiter;
    this.waiter = null;
    waiter?.resolve(line);
  }

  private reset(error: Error): void {
    this.child = null;
    this.ready = false;
    this.buffer = '';
    const waiter = this.waiter;
    this.waiter = null;
    waiter?.reject(error);
  }
}

export function windowsPowerShell(): string {
  const root = process.env.SystemRoot ?? 'C:\\Windows';
  return path.win32.join(root, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
}
