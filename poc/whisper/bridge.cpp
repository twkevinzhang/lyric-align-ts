#include "bridge.h"
#include "whisper.h"
#include <limits>
#include <chrono>

// Single context, sequential calls only. All pointers belong to this WASM heap.
static whisper_context* ctx = nullptr;
static whisper_state* state = nullptr;
static int lastTokenCount = 0;
static int threadCount = 1;
static double melMs = 0, encoderMs = 0;
#ifdef POC_TRACE
extern "C" int whisper_poc_trace_begin(const char* directory);
extern "C" int whisper_poc_trace_end();
#endif
extern "C" {
int poc_set_threads(int count) {
    if (count < 1 || count > 6) return -1;
    threadCount = count;
    return 0;
}
int poc_get_threads() { return threadCount; }
double poc_mel_ms() { return melMs; }
double poc_encoder_ms() { return encoderMs; }
int poc_trace_begin(const char* directory) {
#ifdef POC_TRACE
    return whisper_poc_trace_begin(directory);
#else
    (void)directory; return -1;
#endif
}
int poc_trace_end() {
#ifdef POC_TRACE
    return whisper_poc_trace_end();
#else
    return -1;
#endif
}
void poc_close() {
    if (state) whisper_free_state(state);
    if (ctx) whisper_free(ctx);
    state = nullptr; ctx = nullptr; lastTokenCount = 0;
}
int poc_open(const char* model) {
    poc_close();
    auto params = whisper_context_default_params();
    params.use_gpu = false;
    params.flash_attn = false;
    params.dtw_token_timestamps = true;
    params.dtw_aheads_preset = WHISPER_AHEADS_SMALL;
    ctx = whisper_init_from_file_with_params_no_state(model, params);
    if (ctx) state = whisper_init_state(ctx);
    if (!state) { poc_close(); return -1; }
    return 0;
}
int poc_encode(const float* mel, int frames, int bins) {
    if (!state || !mel || frames != 3000 || bins != 80) return -1;
    int rc = whisper_set_mel_with_state(ctx, state, mel, frames, bins);
    return rc ? rc : whisper_encode_with_state(ctx, state, 0, threadCount);
}
int poc_decode(const int32_t* tokens, int count, int past) {
    if (!state || !tokens || count <= 0 || past < 0 || past + count > whisper_n_text_ctx(ctx)) return -1;
    for (int i = 0; i < count; ++i) if (tokens[i] < 0 || tokens[i] >= poc_vocab()) return -1;
    lastTokenCount = 0;
    int rc = whisper_decode_with_state(ctx, state, tokens, count, past, threadCount);
    if (rc == 0) lastTokenCount = count;
    return rc;
}
int poc_encode_samples(const float* samples, int count) {
    if (!state || !samples || count <= 0 || count > 480000) return -1;
    const auto start = std::chrono::steady_clock::now();
    int rc = whisper_pcm_to_mel_with_state(ctx, state, samples, count, threadCount);
    const auto encoded = std::chrono::steady_clock::now();
    melMs = std::chrono::duration<double, std::milli>(encoded - start).count();
    if (!rc) rc = whisper_encode_with_state(ctx, state, 0, threadCount);
    encoderMs = std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - encoded).count();
    return rc;
}
int poc_vocab() { return ctx ? whisper_n_vocab(ctx) : 0; }
// Legacy decode requests only the final token's logits, but the buffer retains
// count * vocabulary elements. Earlier rows are not valid outputs.
const float* poc_logits() {
    return state && lastTokenCount > 0 ? whisper_get_logits_from_state(state) + (lastTokenCount - 1) * poc_vocab() : nullptr;
}
int poc_qk_dims(int32_t* dims) {
    if (!state || !dims) return -1;
    auto source = whisper_get_aheads_cross_QKs_dims(state);
    if (!source) return -1;
    int64_t count = 1;
    for (int i = 0; i < 3; ++i) {
        if (source[i] <= 0 || source[i] > std::numeric_limits<int32_t>::max()) { delete[] source; return -1; }
        dims[i] = static_cast<int32_t>(source[i]);
        count *= source[i];
        if (count > std::numeric_limits<int32_t>::max()) { delete[] source; return -1; }
    }
    delete[] source;
    return static_cast<int>(count);
}
int poc_qk_copy(float* output, int capacity) {
    int32_t dims[3];
    int count = poc_qk_dims(dims);
    if (!output || count <= 0 || capacity < count) return -1;
    whisper_write_aheads_cross_QKs(state, output);
    return 0;
}
}
