#if defined(__wasm_simd128__)
#include "ggml-quants.h"
static bool poc_model_weight(const struct ggml_tensor *a){for(int depth=0;a && depth<64;depth++,a=a->view_src)if(a->buffer && ggml_backend_buffer_get_usage(a->buffer)==GGML_BACKEND_BUFFER_USAGE_WEIGHTS)return true;return false;}
#endif
