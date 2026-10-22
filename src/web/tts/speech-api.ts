import { clampReadSpeed } from '@shared/web/read-aloud-engine';
import { wordAtChar, wordCues } from '@shared/read-aloud/words';
import { hasWebSpeech } from './detect';

type SpeechHooks = {
  onPlaying(): void;
  onEnded(): void;
  onError(error: Error): void;
  onWord?(word: string): void;
};

/** Built-in Safari / Chrome voice. Instant; no model download. */
export class SpeechApiPlayer {
  private utter: SpeechSynthesisUtterance | null = null;
  private stopped = false;
  private timers: number[] = [];
  private sawBoundary = false;
  private text = '';
  private charIndex = 0;

  async start(text: string, speed: number, hooks: SpeechHooks): Promise<void> {
    this.stop();
    this.stopped = false;
    if (!hasWebSpeech()) throw new Error('This browser has no built-in voice.');
    await voicesReady();
    if (this.stopped) return;
    const rate = clampReadSpeed(speed);
    this.text = text;
    this.charIndex = 0;
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = Math.min(3, Math.max(0.5, rate));
    utter.voice = pickVoice();
    utter.onboundary = (event) => {
      if (this.stopped) return;
      if (event.name && event.name !== 'word') return;
      this.sawBoundary = true;
      this.charIndex = event.charIndex;
      const word = wordAtChar(text, event.charIndex);
      if (word) hooks.onWord?.(word);
    };
    utter.onstart = () => {
      if (this.stopped) return;
      hooks.onPlaying();
      this.timers.push(
        window.setTimeout(() => {
          if (this.stopped || this.sawBoundary) return;
          this.estimateWords(text, rate, hooks);
        }, 250),
      );
    };
    utter.onend = () => {
      if (!this.stopped) hooks.onEnded();
    };
    utter.onerror = (event) => {
      if (this.stopped || event.error === 'canceled' || event.error === 'interrupted') return;
      hooks.onError(new Error('The browser voice stopped.'));
    };
    this.utter = utter;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utter);
  }

  pause(): void {
    window.speechSynthesis.pause();
  }

  resume(): void {
    window.speechSynthesis.resume();
  }

  remainingText(): string {
    return this.text.slice(this.charIndex).trim() || this.text;
  }

  stop(): void {
    this.stopped = true;
    this.utter = null;
    this.sawBoundary = false;
    for (const timer of this.timers) window.clearTimeout(timer);
    this.timers = [];
    try {
      window.speechSynthesis.cancel();
    } catch {
      /* some WebKit builds throw if nothing is speaking */
    }
  }

  private estimateWords(text: string, speed: number, hooks: SpeechHooks): void {
    const wordsPerSecond = 2.6 * speed;
    const words = wordCues(text, (splitCount(text) / wordsPerSecond) * 1000);
    for (const cue of words) {
      this.timers.push(
        window.setTimeout(() => {
          if (!this.stopped) hooks.onWord?.(cue.word);
        }, cue.atMs),
      );
    }
  }
}

function splitCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length || 1;
}

function voicesReady(): Promise<void> {
  const voices = window.speechSynthesis.getVoices();
  if (voices.length) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      window.speechSynthesis.removeEventListener('voiceschanged', done);
      resolve();
    };
    window.speechSynthesis.addEventListener('voiceschanged', done);
    window.setTimeout(done, 400);
  });
}

function pickVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  return voices.find((voice) => voice.lang.toLowerCase().startsWith('en')) ?? voices[0] ?? null;
}
