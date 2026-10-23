#!/usr/bin/env bash
set -euo pipefail
cd /work
em++ -O2 -sENVIRONMENT=node -sEXIT_RUNTIME=1 poc/whisper/song/compress-mel-test.cpp -o .local/whisper-poc/compress-mel-test.cjs
node .local/whisper-poc/compress-mel-test.cjs
cache_enabled=$(node -e 'process.stdout.write(require("./.local/whisper-poc/timescale-source.json").cacheEnabled?"ON":"OFF")')
emcmake cmake -S poc/whisper -B .local/whisper-poc/build-song-timescale12 \
  -DWHISPER_SOURCE=/work/.local/whisper-poc/source-timescale -DCMAKE_BUILD_TYPE=Release \
  -DPOC_WASM_ARCH=ON -DPOC_PTHREAD_POOL_SIZE=12 -DPOC_TIME_SCALE=ON \
  -DPOC_UNROLL_TEST=ON -DPOC_FLOAT_REORDER=ON -DPOC_QUANT_REORDER=ON \
  -DPOC_WEIGHT_CACHE="$cache_enabled" \
  '-DCMAKE_C_FLAGS=-mrelaxed-simd -ffp-contract=off' '-DCMAKE_CXX_FLAGS=-mrelaxed-simd -ffp-contract=off'
cmake --build .local/whisper-poc/build-song-timescale12 --target parity unroll_test -j 4
node .local/whisper-poc/build-song-timescale12/unroll_test.cjs
