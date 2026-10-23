#!/usr/bin/env bash
set -euo pipefail
cd /work
emcmake cmake -S poc/whisper -B .local/whisper-poc/build-song-experimental12 \
  -DWHISPER_SOURCE=/work/.local/whisper-poc/source-compact -DCMAKE_BUILD_TYPE=Release \
  -DPOC_WASM_ARCH=ON -DPOC_PTHREAD_POOL_SIZE=12 -DPOC_FLOAT_REORDER=ON -DPOC_QUANT_REORDER=ON \
  '-DCMAKE_C_FLAGS=-mrelaxed-simd -ffp-contract=off' '-DCMAKE_CXX_FLAGS=-mrelaxed-simd -ffp-contract=off'
cmake --build .local/whisper-poc/build-song-experimental12 --target parity -j 4
