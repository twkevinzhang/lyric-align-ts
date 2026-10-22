# Third-party notices

The MIT license for lyric-align-ts applies to original project code. Third-party code retains its own license. Dependencies are bundled in the Worker artifact.

| Component | Version / source | License / notice |
| --- | --- | --- |
| lyric-align rules (TypeScript adaptation) | ebe62d8a8628d0b2579987598f0442ebffcc68bb | licenses/upstream.LICENSE (MIT) |
| faster-whisper / CTranslate2 rules (TypeScript adaptation) | 1.2.1 / 4.8.3 | licenses/asr-upstream.LICENSE (MIT) |
| Transformers.js | 4.3.1 | licenses/transformers.LICENSE (Apache-2.0) |
| Hugging Face tokenizers / jinja (included in Transformers.js browser bundle) | 0.2.0 / 0.5.10 | licenses/tokenizers.LICENSE (Apache-2.0), licenses/jinja.LICENSE (MIT) |
| ONNX Runtime Web | 1.31.0-dev.20260914-8d85527a0 | licenses/onnxruntime.LICENSE (MIT), licenses/onnxruntime.NOTICE |
| ONNX Runtime Common | 1.30.0 and Web runtime's 1.31.0-dev.20260911-2a43ec07e | licenses/onnxruntime.LICENSE (MIT) |
| pako | 3.0.2 | licenses/pako.LICENSE (MIT), licenses/pako-zlib.LICENSE (Zlib) |

ONNX Runtime notices are preserved from upstream commit 8d85527a010e294a26b274749f74294b2a32cec5. The complete upstream notice file covers multiple distributions and may list components not used by this browser build.

Model weights are not distributed in this package. The fixed Hugging Face revision is downloaded separately at prepare time; consult the model repository for its license. The upstream Python/C++ libraries are not executed by this TypeScript adaptation.
