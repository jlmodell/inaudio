# Self-host Inaudio in a browser

This is the same speech stack as the desktop app — sherpa-onnx on your machine, no cloud speech API — served as a website. Anyone in the house can open it in Safari or Chrome. There is nothing to install on their computer.

Read-aloud defaults to an **on-device** Kokoro voice in the browser (about 90 MB, fetched once from this Inaudio and cached). Safari and Chrome on a Mac typically keep up with playback. iPhone Safari may run out of memory; Inaudio then switches to the browser's built-in voice. Settings can pick the built-in voice (instant) or the server voice (the host computer speaks, about 320 MB downloaded once onto the host).

## What you get

- Read-aloud of pasted text (on this device by default; built-in or server voice in Settings)
- An optional password, because the page is reachable on the network

Desktop-only pieces stay in the Electron app: reading the selection in other programs, the tray, and global shortcuts.

## One command

On the computer that will host Inaudio (any machine that can run Docker):

```sh
docker compose up --build
```

The first start downloads the server voice — and the smaller on-device read-aloud voice — into a Docker volume. That can take several minutes and needs internet. Later starts reuse the volume.

Open [http://localhost:8080](http://localhost:8080) on that computer.

## Password

Set one before anyone else on the network can open the address:

```sh
INAUDIO_PASSWORD='pick a long phrase' docker compose up --build
```

Or put `INAUDIO_PASSWORD=...` in a `.env` file next to `docker-compose.yml`. Docker Compose reads that file on its own.

## Other devices

`http://192.168.x.x:8080` from a phone or another computer will load. HTTPS is only required if you later add features that need a secure context.

Read-aloud on this device downloads the browser voice from your Inaudio on first use (progress is on the page). On-device and server voices wait for three sentences (change that in Settings) before playback starts, then keep generating so they stay that far ahead. The server flushes each chunk and pads the first line so proxies (including Tailscale Serve) do not hold the whole story until the end. `docker compose logs` prints model load, warmup, per-sentence synth time, and time to first audio.

The on-device voice needs `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` so WASM can use more than one thread. Inaudio sends those headers. Tailscale Serve often drops them; Read aloud then shows “not isolated” / “WASM, 1 thread”. Use Caddy in front and keep the headers, raise the sentence buffer, or switch to this browser’s built-in voice.

If the on-device voice fails, Read aloud shows the full error (copy it, or look for `[inaudio]` in the browser console) and uses the built-in voice for that visit only. Reload the page or tap “Try on-device voice again” to load Kokoro again. WebGPU failures fall back to multi-thread WASM before the built-in voice.

### Caddy in front (LAN HTTPS)

Point a name you control at the host, or use a local name with a certificate Caddy manages. Example next to this repo:

```caddyfile
inaudio.home.arpa {
  reverse_proxy 127.0.0.1:8080 {
    flush_interval -1
  }
  header Cross-Origin-Opener-Policy same-origin
  header Cross-Origin-Embedder-Policy require-corp
  header Cross-Origin-Resource-Policy same-origin
  # Caddy will need a certificate this browser trusts.
  # On a home LAN, `tls internal` plus installing Caddy's root CA on each device works.
}
```

Keep port 8080 off the public internet unless you also set a password and understand the exposure.

## Models

| Variable | Default | What it is |
| --- | --- | --- |
| `INAUDIO_TTS_MODEL` | `kokoro-en-v0_19` | English read-aloud |
| `INAUDIO_DOWNLOAD_MODELS` | `1` | Set `0` to skip the automatic download |
| `INAUDIO_THREADS` | host CPU count (max 16) | CPU threads for sherpa-onnx |
| `INAUDIO_DATA` | `/data` in Docker | Models and settings |

To bake the voice into an image instead of downloading at first run, start a container once, then commit the `/data` volume or copy `models/` into a custom image. The default compose file does not do that, so the image stays small.

## Without Docker

Node.js 22 and `npm ci`, then:

```sh
npm run build:web
INAUDIO_DATA=./.inaudio-web INAUDIO_PASSWORD='optional' npm run start:web
```

`npm run start:web` serves the UI and the API from the same port.

## What this is not

It will not type into other apps or provide a tray icon. Those remain desktop-only.
