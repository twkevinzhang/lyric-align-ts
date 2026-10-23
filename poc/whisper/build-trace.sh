#!/usr/bin/env bash
set -euo pipefail
cd /work
src=/work/.local/whisper-poc/source-trace
out=/work/.local/whisper-poc
test "$(git -c safe.directory="$src" -C "$src" rev-parse HEAD)" = ca0598eb272bf3ef16f8163ab0bd98503803dee8
cmake -S poc/whisper -B "$out/build-native-trace" -DWHISPER_SOURCE="$src" -DPOC_TRACE=ON -DCMAKE_BUILD_TYPE=Release
cmake --build "$out/build-native-trace" --target parity -j 4
emcmake cmake -S poc/whisper -B "$out/build-wasm-trace" -DWHISPER_SOURCE="$src" -DPOC_TRACE=ON -DCMAKE_BUILD_TYPE=Release
cmake --build "$out/build-wasm-trace" --target parity -j 4
