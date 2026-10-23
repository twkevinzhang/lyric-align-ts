#!/usr/bin/env bash
set -euo pipefail
cd /work
src=/work/.local/whisper-poc/source
out=/work/.local/whisper-poc
test "$(git -c safe.directory="$src" -C "$src" rev-parse HEAD)" = ca0598eb272bf3ef16f8163ab0bd98503803dee8
cmake -S poc/whisper -B "$out/build-native" -DWHISPER_SOURCE="$src" -DCMAKE_BUILD_TYPE=Release
cmake --build "$out/build-native" --target parity -j 4
emcmake cmake -S poc/whisper -B "$out/build-wasm" -DWHISPER_SOURCE="$src" -DCMAKE_BUILD_TYPE=Release
cmake --build "$out/build-wasm" --target parity -j 4
{ emcc --version; gcc --version; cmake --version; uname -a; } > "$out/toolchain.txt"
