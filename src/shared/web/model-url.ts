const HF_PREFIX = 'https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/';
const LOCAL_PREFIX = '/browser-tts/onnx-community/Kokoro-82M-v1.0-ONNX/';

export function rewriteModelUrl(url: string, origin: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url, origin);
  } catch {
    return url;
  }
  if (parsed.origin === origin) return parsed.href;
  if (!url.startsWith(HF_PREFIX)) throw new Error('The on-device voice tried to leave this Inaudio.');
  const rest = url.replace(/^https:\/\/huggingface\.co\/onnx-community\/Kokoro-82M-v1\.0-ONNX\/resolve\/[^/]+\//, '').split('?')[0];
  return `${origin}${LOCAL_PREFIX}${rest}`;
}
