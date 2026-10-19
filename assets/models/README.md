# Bundled speech-cleanup models

Small models ship with Inaudio so speech cleanup and punctuation work offline from the first launch. Forge copies this folder to `resources/models` (`extraResource` in `forge.config.ts`). `src/main/app/cleanup-models.ts` checks each file's size and SHA-256 before the speech worker is given its path.

| File | Purpose | Bytes | SHA-256 | Source | License |
|---|---|---|---|---|---|
| `silero_vad.onnx` | Voice activity detection: drops stretches without speech before live transcription | 643,854 | `9e2449e1087496d8d4caba907f23e0bd3f78d91fa552479bb9c23ac09cbb1fd6` | [k2-fsa/sherpa-onnx `asr-models`](https://github.com/k2-fsa/sherpa-onnx/releases/tag/asr-models), from [snakers4/silero-vad](https://github.com/snakers4/silero-vad) | MIT |
| `punct_en.int8.onnx` + `punct_en.bpe.vocab` | Restores English punctuation and capitals across live passages (CNN-BiLSTM, int8) | 7,490,500 + 149,430 | `9d611f445fe4a46186080fe161be6059d87d72eb88d3a8cb00c1a06e83a6067e`, `e118b7ad88c54db562517df49e1cffd4836d166c34fb190fd311d7f34eb238f5` | [k2-fsa/sherpa-onnx `punctuation-models`](https://github.com/k2-fsa/sherpa-onnx/releases/tag/punctuation-models) (`sherpa-onnx-online-punct-en-2024-08-06`), from [frankyoujian/Edge-Punct-Casing](https://github.com/frankyoujian/Edge-Punct-Casing) | Apache-2.0 |
| `gtcrn_simple.onnx` | Speech enhancement: suppresses background noise before recognition | 535,638 | `e77603ac0c23dac3227dd2d7135b3a585cbee2679048aecfa886657d3ae1b534` | [k2-fsa/sherpa-onnx `speech-enhancement-models`](https://github.com/k2-fsa/sherpa-onnx/releases/tag/speech-enhancement-models), from [Xiaobin-Rong/gtcrn](https://github.com/Xiaobin-Rong/gtcrn) | MIT |

When you replace a file, update its size and hash in `cleanup-models.ts`. A mismatched file is never loaded: that cleanup step is skipped, and Audio › Diagnostics shows the model as missing.
