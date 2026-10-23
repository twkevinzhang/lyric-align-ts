#!/usr/bin/env bash
set -euo pipefail
cd /work
cmake -S poc/whisper -B .local/whisper-poc/build-native-portable \
  -DWHISPER_SOURCE=/work/.local/whisper-poc/source -DCMAKE_BUILD_TYPE=Release \
  -DGGML_SSE42=OFF -DGGML_AVX=OFF -DGGML_AVX2=OFF -DGGML_FMA=OFF -DGGML_F16C=OFF -DGGML_BMI2=OFF
cmake --build .local/whisper-poc/build-native-portable --target parity -j 4
