#!/usr/bin/env bash
set -euo pipefail
cd /work
src=/work/.local/whisper-poc/source
test "$(git -c safe.directory="$src" -C "$src" rev-parse HEAD)" = ca0598eb272bf3ef16f8163ab0bd98503803dee8
for variant in generic simd; do
  arch=OFF
  if [ "$variant" = simd ]; then arch=ON; fi
  out=".local/whisper-poc/build-song-$variant"
  emcmake cmake -S poc/whisper -B "$out" -DWHISPER_SOURCE="$src" -DCMAKE_BUILD_TYPE=Release -DPOC_WASM_ARCH="$arch" -DPOC_PTHREAD_POOL_SIZE=6
  cmake --build "$out" --target parity -j 4
done
