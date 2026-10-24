#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
node scripts/native/prepare.mjs
em++ -O2 -sENVIRONMENT=node -sEXIT_RUNTIME=1 native/compress-mel-test.cpp -o .local/native/compress-mel-test.cjs
node .local/native/compress-mel-test.cjs
em++ -O2 -sENVIRONMENT=node -sEXIT_RUNTIME=1 native/fft25-test.cpp -o .local/native/fft25-test.cjs
node .local/native/fft25-test.cjs
em++ -O2 -ffp-contract=off -sENVIRONMENT=node -sEXIT_RUNTIME=1 native/sparse-mel-test.cpp -o .local/native/sparse-mel-test.cjs
node .local/native/sparse-mel-test.cjs
emcmake cmake -S native -B .local/native/build \
  -DWHISPER_SOURCE="$PWD/.local/native/source-timescale" -DCMAKE_BUILD_TYPE=Release \
  -DPOC_WASM_ARCH=ON -DPOC_PTHREAD_POOL_SIZE=12 -DPOC_TIME_SCALE=ON \
  -DPOC_WEIGHT_CACHE=ON -DPOC_UNROLL_TEST=ON -DPOC_FLOAT_REORDER=ON -DPOC_QUANT_REORDER=ON \
  '-DCMAKE_C_FLAGS=-mrelaxed-simd -ffp-contract=off' '-DCMAKE_CXX_FLAGS=-mrelaxed-simd -ffp-contract=off'
cmake --build .local/native/build --target parity unroll_test -j 4
node .local/native/build/unroll_test.cjs
