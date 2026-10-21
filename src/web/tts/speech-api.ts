import { hasWebSpeech } from './detect';

type SpeechHooks = {
  onPlaying(): void;
  onEnded(): void;
  onError(error: Error): void;
};

/** Built-in Safari / Chrome voice. Instant; no model download. */
export class SpeechApiPlayer {
  private utter: SpeechSynthesisUtterance | null = null;
  private stopped = false;

  async start(text: string, speed: number, hooks: SpeechHooks): Promise<void> {
    this.stop();
    this.stopped = false;
    if (!hasWebSpeech()) throw new Error('This browser has no built-in voice.');
    await voicesReady();
    if (this.stopped) return;
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = Math.min(2, Math.max(0.5, speed));
    utter.voice = pickVoice();
    utter.onstart = () => {
      if (!this.stopped) hooks.onPlaying();
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

  stop(): void {
    this.stopped = true;
    this.utter = null;
    try {
      window.speechSynthesis.cancel();
    } catch {
      /* some WebKit builds throw if nothing is speaking */
    }
  }
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
