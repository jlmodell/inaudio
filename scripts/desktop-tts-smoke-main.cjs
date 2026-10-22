const { app, utilityProcess } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const worker = process.env.INAUDIO_SMOKE_WORKER;
const models = process.env.INAUDIO_SMOKE_MODELS;
const text = process.env.INAUDIO_SMOKE_TEXT || 'The quick brown fox jumps over the lazy dog.';
const sid = Number(process.env.INAUDIO_SMOKE_SID ?? 4);
const speed = Number(process.env.INAUDIO_SMOKE_SPEED ?? 2);
const clipboardSid = Number(process.env.INAUDIO_SMOKE_CLIPBOARD_SID ?? sid);
const clipboardSpeed = Number(process.env.INAUDIO_SMOKE_CLIPBOARD_SPEED ?? speed);
const expectedRate = Number(process.env.INAUDIO_SMOKE_SAMPLE_RATE ?? 24_000);

if (!worker || !models) {
  console.error('INAUDIO_SMOKE_WORKER and INAUDIO_SMOKE_MODELS are required');
  process.exit(2);
}

app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'inaudio-tts-smoke-')));
app.commandLine.appendSwitch('disable-gpu');

const TIMEOUTS = { 'tts:load': 180_000, 'tts:speak': 180_000, ping: 15_000 };

function request(child, input) {
  const id = Math.floor(Math.random() * 1_000_000);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out (${input.type})`)), TIMEOUTS[input.type] ?? 30_000);
    const onMessage = (message) => {
      if (!message || message.id !== id) return;
      clearTimeout(timer);
      child.off('message', onMessage);
      if (message.ok) resolve(message.result);
      else reject(new Error(message.error));
    };
    child.on('message', onMessage);
    child.postMessage({ ...input, id });
  });
}

function waitReady(child) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('inference worker did not start')), 20_000);
    const onMessage = (message) => {
      if (message?.type === 'ready') {
        clearTimeout(timer);
        child.off('message', onMessage);
        resolve(undefined);
      }
    };
    child.on('message', onMessage);
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`inference worker exited (${code})`));
    });
  });
}

app.whenReady().then(async () => {
  const child = utilityProcess.fork(worker, [], { serviceName: 'Inaudio TTS smoke', stdio: 'pipe' });
  child.stdout?.on('data', (chunk) => process.stdout.write(chunk));
  child.stderr?.on('data', (chunk) => process.stderr.write(chunk));
  try {
    await waitReady(child);
    await request(child, { type: 'ping' });
    await request(child, {
      type: 'tts:load',
      modelId: 'kokoro-en-v0_19',
      dir: models,
      layout: {
        kind: 'tts',
        family: 'kokoro',
        sampleRate: 24_000,
        model: 'model.onnx',
        voices: 'voices.bin',
        tokens: 'tokens.txt',
        dataDir: 'espeak-ng-data',
      },
      threads: 2,
    });
    const play = await request(child, { type: 'tts:speak', text, sid, speed });
    const clipboard = await request(child, {
      type: 'tts:speak',
      text,
      sid: clipboardSid,
      speed: clipboardSpeed,
    });
    if (!play || play.sampleRate !== expectedRate) {
      throw new Error(`play path sample rate ${play?.sampleRate}, expected ${expectedRate}`);
    }
    if (!clipboard || clipboard.sampleRate !== play.sampleRate) {
      throw new Error(`clipboard sample rate ${clipboard?.sampleRate} did not match play ${play.sampleRate}`);
    }
    const playCount = play.samples?.length ?? 0;
    const clipboardCount = clipboard.samples?.length ?? 0;
    if (playCount < 8_000) throw new Error(`play synthesis too short (${playCount} samples)`);
    if (clipboardCount < 8_000) throw new Error(`clipboard synthesis too short (${clipboardCount} samples)`);
    const playMs = (playCount / play.sampleRate) * 1000;
    const clipboardMs = (clipboardCount / clipboard.sampleRate) * 1000;
    if (playMs < 400 || playMs > 8_000) throw new Error(`play duration ${playMs.toFixed(0)} ms is out of range`);
    if (Math.abs(playMs - clipboardMs) / playMs > 0.15) {
      throw new Error(`clipboard duration ${clipboardMs.toFixed(0)} ms did not match play ${playMs.toFixed(0)} ms`);
    }
    process.stdout.write(
      JSON.stringify({
        ok: true,
        sampleRate: play.sampleRate,
        playSamples: playCount,
        clipboardSamples: clipboardCount,
        playMs: Math.round(playMs),
        clipboardMs: Math.round(clipboardMs),
        inferenceMs: play.inferenceMs,
      }) + '\n',
    );
    child.kill();
    app.exit(0);
  } catch (error) {
    console.error(error instanceof Error ? error.stack ?? error.message : error);
    child.kill();
    app.exit(1);
  }
});
