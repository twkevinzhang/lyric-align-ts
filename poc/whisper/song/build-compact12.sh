#!/usr/bin/env bash
set -euo pipefail
cd /work
emcmake cmake -S poc/whisper -B .local/whisper-poc/build-song-compact12 -DWHISPER_SOURCE=/work/.local/whisper-poc/source-compact -DCMAKE_BUILD_TYPE=Release -DPOC_WASM_ARCH=ON -DPOC_PTHREAD_POOL_SIZE=12 -DPOC_UNROLL_TEST=ON -DPOC_FLOAT_REORDER=ON -DPOC_QUANT_REORDER=ON '-DCMAKE_C_FLAGS=-mrelaxed-simd -ffp-contract=off' '-DCMAKE_CXX_FLAGS=-mrelaxed-simd -ffp-contract=off'
cmake --build .local/whisper-poc/build-song-compact12 --target parity unroll_test -j 4
/emsdk/upstream/bin/wasm-dis .local/whisper-poc/build-song-compact12/parity.wasm -o .local/whisper-poc/build-song-compact12/parity.wat
python3 - <<'PY'
from pathlib import Path
text = Path('.local/whisper-poc/build-song-compact12/parity.wat').read_text()
fused = text.count('f32x4.relaxed_madd') + text.count('f32x4.relaxed_nmadd')
dots = text.count('i32x4.dot_i8x16_i7x16_add_s')
print(f'Final SIMD audit: floating fused operations={fused}, byte dot operations={dots}')
assert fused == 0, 'Unexpected automatic floating-point fusion'
assert dots > 0, 'Expected byte dot optimization is absent'
PY
