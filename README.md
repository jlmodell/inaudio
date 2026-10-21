<p align="center">
  <img src="assets/icons/icon.png" width="180" height="180" alt="Inaudio microphone logo" />
</p>
<h1 align="center">Inaudio</h1>
<p align="center">Your voice, on your machine.</p>
<p align="center">
  Offline dictation and read-aloud for the desktop.<br />
  Built with Electron, React, TypeScript, and sherpa-onnx.
</p>
<p align="center">
  <a href="https://github.com/shikki841/inaudio/actions/workflows/ci.yml"><img src="https://github.com/shikki841/inaudio/actions/workflows/ci.yml/badge.svg" alt="CI status" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT license" /></a>
  <a href="https://github.com/shikki841/inaudio/releases"><img src="https://img.shields.io/github/v/release/shikki841/inaudio" alt="Latest release" /></a>
</p>
<p align="center">
  <a href="https://github.com/shikki841/inaudio/releases">Downloads</a> ·
  <a href="CONTRIBUTING.md">Contribute</a> ·
  <a href="https://github.com/shikki841/inaudio/issues/new/choose">Report an issue</a>
</p>

## See it work

<p align="center">
  <a href="https://github.com/shikki841/inaudio/releases/download/v1.10.0/inaudio-demo.mp4">
    <img src="docs/media/inaudio-demo.gif" width="880" alt="Inaudio demo: dictating into Notepad, a live transcript of system audio in the app and in the floating window, the audio settings, Read Aloud, and History with its text blurred" />
  </a>
</p>
<p align="center">
  <a href="https://github.com/shikki841/inaudio/releases/download/v1.10.0/inaudio-demo.mp4">Watch the full recording with sound</a> (about 4 minutes, recorded on Windows from a real run; History text is blurred).
</p>

## Speak. Edit. Keep going.

- Dictate with a keyboard shortcut and keep a searchable transcript history.
- Transcribe what your computer plays, such as a meeting or a video, as it is heard. Grey provisional text keeps up with the speech, and a small floating window shows the transcript without opening Inaudio.
- Pick the source: system audio, system audio with your microphone, or one audio device such as a virtual cable.
- Clean up noise on the device: a voice detector skips stretches without speech, and an optional speech cleanup model filters background noise.
- Read text or your clipboard aloud with on-device speech synthesis.
- Manage speech models, microphone settings, and playback in one desktop app.

Download a model once, then run inference locally. Model downloads need an internet connection. Desktop packages target Windows, macOS, and Linux; permissions and text insertion vary by platform. Releases are distributed through electron-builder update manifests; CI artifacts are currently unsigned and development builds do not contact the update feed.

Speech-to-text includes NVIDIA Nemotron ASR Streaming, an English cache-aware streaming model with a 560 ms latency/accuracy profile. It runs through sherpa-onnx on the CPU after its verified model archive is downloaded; the model remains subject to the [NVIDIA Open Model License](https://www.nvidia.com/en-us/agreements/enterprise-software/nvidia-open-model-license/).

## Run locally

Use Node.js 24 LTS and npm. Native packaging prerequisites are in [CONTRIBUTING.md](CONTRIBUTING.md).

```sh
git clone https://github.com/shikki841/inaudio.git
cd inaudio
npm ci
npm start
```

```sh
npm run check   # TypeScript + ESLint
npm run package:release  # Build the electron-builder package for your current OS
```

Pick a model during setup and grant microphone access when prompted.

## Self-host in a browser

A Node server and a small website reuse the same sherpa-onnx models. Family members can open it in Safari or Chrome — no install, no terminal on their computer. Desktop-only features (typing into other apps, system audio, the tray) stay in the Electron app.

```sh
docker compose up --build
```

Open [http://localhost:8080](http://localhost:8080) on the host. The first start downloads the speech models. Other devices need HTTPS or Tailscale for the microphone; see [docs/self-hosting.md](docs/self-hosting.md).

```sh
npm run web   # without Docker: build the site and serve it
```

## Build with us

Small fixes, platform testing, and clear bug reports help. Read the [contribution guide](CONTRIBUTING.md), [community guidelines](CODE_OF_CONDUCT.md), and [release process](.github/RELEASING.md). Report vulnerabilities through the [security policy](SECURITY.md).

[MIT](LICENSE). Downloaded models and dependencies retain their own licenses.
