const HF = 'https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main';

export const BROWSER_TTS_MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX';
export const BROWSER_TTS_URL_PREFIX = '/browser-tts';

export interface BrowserTtsFile {
  path: string;
  url: string;
  bytes: number;
  sha256: string;
}

function file(path: string, bytes: number, sha256: string): BrowserTtsFile {
  return { path: `${BROWSER_TTS_MODEL_ID}/${path}`, url: `${HF}/${path}`, bytes, sha256 };
}

/** Quantized Kokoro 82M (q8) plus the English voices the web UI offers. */
export const BROWSER_TTS_FILES: readonly BrowserTtsFile[] = [
  file('config.json', 44, 'df34b4f930b23447cd4dc410fabfb42eb3f24e803e6c3f97d618fb359380a36f'),
  file('tokenizer.json', 3497, '77a02c8e164413299b4b4c403b14f8e0e1c1b727db4d46a09d6327b861060a34'),
  file('tokenizer_config.json', 113, 'be1cb066d6ef6b074b3f15e6a6dd21ac88ff3cdaedf325f0aaed686c70f75d20'),
  file(
    'onnx/model_quantized.onnx',
    92_361_116,
    'fbae9257e1e05ffc727e951ef9b9c98418e6d79f1c9b6b13bd59f5c9028a1478',
  ),
  file('voices/af_heart.bin', 522_240, 'd583ccff3cdca2f7fae535cb998ac07e9fcb90f09737b9a41fa2734ec44a8f0b'),
  file('voices/af_bella.bin', 522_240, 'f69d836209b78eb8c66e75e3cda491e26ea838a3674257e9d4e5703cbaf55c8b'),
  file('voices/af_nicole.bin', 522_240, 'cd2191ab31b914ed7b318416b0e4440fdf392ddad9106a060819aa600a64f59a'),
  file('voices/af_sarah.bin', 522_240, '4409fbc125afabacc615d94db5398d847006a737b0247d6892b7a9a0007a2f0a'),
  file('voices/af_sky.bin', 522_240, '4435255c9744f3f31659e0d714ab7689bf65d9e77ec1cce060f083912614f0b9'),
  file('voices/am_adam.bin', 522_240, '162b035ed91cfc48b6046982184c645f72edcdd1b82843347f605d7bf7b15716'),
  file('voices/am_michael.bin', 522_240, '1d1f21dd8da39c30705cd4c75d039d265e9bc4a2a93ed09bc9e1b1225eb95ba1'),
  file('voices/bf_emma.bin', 522_240, '669fe0647f9dd04fcab92f1439a40eeb4c8b4ab1f82e4996fe3d918ce4a63b73'),
  file('voices/bf_isabella.bin', 522_240, '3754352c4aaa46d17f27654ab7518d65b62ad6163a0f55a5f4330c2da2c4e94f'),
  file('voices/bm_george.bin', 522_240, 'c4b235a4c1f2cd3b939fed08b899ce9385638b763f7b73a59616c4fc9bd6c9bc'),
  file('voices/bm_lewis.bin', 522_240, 'b8f671cef828c30e66fdf0b0756a76bba58f6bb3398cbbf27058642acbcedb97'),
];

export const BROWSER_TTS_BYTES = BROWSER_TTS_FILES.reduce((sum, file) => sum + file.bytes, 0);

/** One English style pack: 510 lengths × 256 floats. */
export const BROWSER_TTS_VOICE_BYTES = 522_240;

/** American/British only. `zf_`/`zm_` are Chinese; `jf_`/`jm_` are Japanese. */
export const ENGLISH_KOKORO_VOICE = /^(?:af|am|bf|bm)_[a-z]+$/;

export function isEnglishKokoroVoice(name: string): boolean {
  return ENGLISH_KOKORO_VOICE.test(name);
}

export function browserTtsFile(relative: string): BrowserTtsFile | undefined {
  return BROWSER_TTS_FILES.find((file) => file.path === relative);
}

export function browserTtsVoicePath(name: string): string {
  if (!isEnglishKokoroVoice(name)) {
    throw new Error(`The on-device voice "${name}" is not an English Kokoro voice.`);
  }
  const relative = `${BROWSER_TTS_MODEL_ID}/voices/${name}.bin`;
  if (!browserTtsFile(relative)) throw new Error(`The on-device voice "${name}" is not on this Inaudio.`);
  return relative;
}

export function browserTtsVoiceUrl(name: string): string {
  return `${BROWSER_TTS_URL_PREFIX}/${browserTtsVoicePath(name)}`;
}

export interface BrowserTtsProgress {
  installed: boolean;
  downloading: boolean;
  bytesDone: number;
  bytesTotal: number;
  error?: string;
}
