# Self-host Inaudio in a browser

This is the same speech stack as the desktop app — sherpa-onnx on your machine, no cloud speech API — served as a website. Anyone in the house can open it in Safari or Chrome. There is nothing to install on their computer.

Speech models run **on the server**, not in the browser. A phone or a laptop only sends microphone audio and plays the result. That is the better default here: the English model is about 650 MB, the voice model about 320 MB, and you download them once onto the host. In-browser WASM would make every device fetch those files and do the work on whatever CPU it has.

## What you get

- Dictate from the browser microphone, with the transcript updating while you speak
- A searchable history and copy-to-clipboard
- Read-aloud of pasted text
- An optional password, because the page is reachable on the network

Desktop-only pieces stay in the Electron app: typing into other programs, system-audio capture, the floating window, the tray, and global shortcuts.

## One command

On the computer that will host Inaudio (any machine that can run Docker):

```sh
docker compose up --build
```

The first start downloads the speech models into a Docker volume. That can take several minutes and needs internet. Later starts reuse the volume.

Open [http://localhost:8080](http://localhost:8080) on that computer.

## Password

Set one before anyone else on the network can open the address:

```sh
INAUDIO_PASSWORD='pick a long phrase' docker compose up --build
```

Or put `INAUDIO_PASSWORD=...` in a `.env` file next to `docker-compose.yml`. Docker Compose reads that file on its own.

## Microphone access from other devices

Browsers only give a page the microphone on **https** or on **localhost**. `http://192.168.x.x:8080` from a phone or another computer will load, but the mic button will fail.

Pick one of these. Both keep traffic on machines you already trust.

### Tailscale

Install Tailscale on the host and on the Mac or Windows computer. Open `http://<hostname>.<tailnet>.ts.net:8080` — or, if you turn on Tailscale Serve / HTTPS, the `https://` URL it prints. That URL is enough for the microphone.

### Caddy in front (LAN HTTPS)

Point a name you control at the host, or use a local name with a certificate Caddy manages. Example next to this repo:

```caddyfile
inaudio.home.arpa {
  reverse_proxy 127.0.0.1:8080
  # Caddy will need a certificate this browser trusts.
  # On a home LAN, `tls internal` plus installing Caddy's root CA on each device works.
}
```

Keep port 8080 off the public internet unless you also set a password and understand the exposure.

## Models

| Variable | Default | What it is |
| --- | --- | --- |
| `INAUDIO_STT_MODEL` | `parakeet-tdt-0.6b-v2-int8` | English speech-to-text |
| `INAUDIO_TTS_MODEL` | `kokoro-en-v0_19` | English read-aloud |
| `INAUDIO_DOWNLOAD_MODELS` | `1` | Set `0` to skip the automatic download |
| `INAUDIO_THREADS` | host CPU count (max 16) | CPU threads for sherpa-onnx |
| `INAUDIO_DATA` | `/data` in Docker | Models, history, settings |

Other catalog models (`parakeet-tdt-0.6b-v3-int8`, `nemotron-speech-streaming-en-0.6b-560ms-int8`) work if you set `INAUDIO_STT_MODEL` and have the disk for them.

To bake models into an image instead of downloading at first run, start a container once, then commit the `/data` volume or copy `models/` into a custom image. The default compose file does not do that, so the image stays small.

## Without Docker

Node.js 22 and `npm ci`, then:

```sh
npm run build:web
INAUDIO_DATA=./.inaudio-web INAUDIO_PASSWORD='optional' npm run start:web
```

`npm run start:web` serves the UI and the API from the same port.

## What this is not

It will not type into other apps, capture what the computer is playing, or provide a tray icon. Those remain desktop-only.
