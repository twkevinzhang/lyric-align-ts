# Third-party notices

## whisper.cpp and ggml

Native engine: https://github.com/echogarden-project/whisper.cpp at commit `ca0598eb272bf3ef16f8163ab0bd98503803dee8`, including ggml.

MIT License

Copyright (c) 2023-2026 The ggml authors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Echogarden 3.4.0

Browser alignment helpers are adapted from https://github.com/echogarden-project/echogarden (WhisperSTT and browser-safe dependencies). Package metadata states `MIT AND GPL-3.0`. Its README states all source code is MIT, and the package can be used under MIT when GPL libraries such as eSpeak-NG are not loaded. This browser package does not load those GPL libraries.

Copyright (c) 2026 Rotem Dan

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the “Software”), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.


### Local changes (formerly vendor/echogarden/PROVENANCE.md)

Source: Echogarden 3.4.0, https://github.com/echogarden-project/echogarden . Original WhisperSTT.js SHA256 6930b7301ec7253f73437471088994e6b60b21eb8a1e4f28156208a30d3ad9b3. The code now lives directly in this repository and is no longer refreshed from upstream: `src/engine/whisper.mjs` (WhisperSTT recognize, align, decodeTokens, token timeline and cross-attention path), `src/engine/dtw.mjs` (windowed DTW), `src/engine/vector-math.mjs` (only the VectorMath and MedianFilter functions the aligner calls), `src/engine/word-patterns.json`.

Native context, filesystem tokenizer loading, language detection and mel conversion were removed; browser helpers in `src/engine/helpers.mjs` replace logging, segmentation, compression, deterministic top-1 sampling and yields. Unreachable definitions (mel filterbank tables, language-detection helpers, unused VectorMath functions) were deleted. Decoder ceiling is 448, matching the old generated Worker decoder. Japanese and Chinese word segmentation uses Intl.Segmenter with middle-dot compounds merged; arbitrary morphological boundaries are not claimed equivalent to Kuromoji. English and other non-CJK word patterns are precompiled from @echogarden/text-segmentation 0.8.1.

Alignment changes are local: configurable audio window length, fractional frame conversion, guided teacher-forced batch decoding in the engine adapter, raw cross-attention frame aggregation and the joint gap-alignment boundaries. Timing behaviour is therefore not claimed equivalent to upstream.

## tiktoken 1.0.22

JavaScript/WASM tokenizer implementation: https://github.com/dqbd/tiktoken (npm package tiktoken 1.0.22). The browser Worker bundles its lite/init implementation and the distribution includes its tiktoken_bg.wasm. This implementation is distinct from the Whisper vocabulary data below.

Upstream license: https://github.com/dqbd/tiktoken/blob/main/LICENSE

MIT License

Copyright (c) 2022 OpenAI, Shantanu Jain

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## OpenAI Whisper tokenizer data

Vocabulary and merges originate from https://github.com/openai/whisper. Model weights are acquired separately and not distributed.

MIT License

Copyright (c) 2022 OpenAI

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## @echogarden/text-segmentation 0.8.1

The precompiled non-CJK word patterns are generated from this MIT-licensed package. Source: https://github.com/echogarden-project/text-segmentation .

Copyright (c) 2024 Rotem Dan

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the “Software”), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

