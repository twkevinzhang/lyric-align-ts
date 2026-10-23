#!/usr/bin/env bash
set -euo pipefail
cd /work
src=/work/.local/whisper-poc/source
test "$(git -c safe.directory="$src" -C "$src" rev-parse HEAD)" = ca0598eb272bf3ef16f8163ab0bd98503803dee8
emcmake cmake -S poc/whisper -B .local/whisper-poc/build-song-wasm -DWHISPER_SOURCE="$src" -DCMAKE_BUILD_TYPE=Release
cmake --build .local/whisper-poc/build-song-wasm --target parity -j 4
