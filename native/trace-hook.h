// Included only in the generated diagnostic copy of whisper.cpp.
// Observe completed tensors before scheduler buffers are reused. No graph math changes.
#include <cstdint>
#include <stdexcept>
static std::string poc_trace_directory;
static std::ofstream poc_trace_manifest;
static int poc_trace_count = 0;
static bool poc_trace_failed = false;
extern "C" int whisper_poc_trace_begin(const char* directory);
extern "C" int whisper_poc_trace_end();

extern "C" int whisper_poc_trace_begin(const char* directory) {
    poc_trace_directory = directory;
    poc_trace_count = 0;
    poc_trace_failed = false;
    poc_trace_manifest.open(poc_trace_directory + "/trace.json", std::ios::trunc);
    if (!poc_trace_manifest) return -1;
    poc_trace_manifest << "[";
    return 0;
}

static bool poc_trace_capture(ggml_tensor* tensor, bool ask, void*) {
    std::string name = tensor->name;
    if (name == "embd_conv") name = "trace-conv2-gelu";
    if (name == "mel") name = "trace-mel";
    // ggml derives names such as "... (reshaped)" automatically. Capture only
    // explicit checkpoints, not these aliases of already captured storage.
    bool selected = poc_trace_manifest.is_open() && name.rfind("trace-", 0) == 0 &&
        name.find_first_not_of("abcdefghijklmnopqrstuvwxyz0123456789-") == std::string::npos;
    if (ask) return selected;
    if (!selected) return true;
    try {
        if (tensor->type != GGML_TYPE_F32 && tensor->type != GGML_TYPE_F16) throw std::runtime_error("Unsupported trace dtype");
        std::vector<uint8_t> raw(ggml_nbytes(tensor));
        ggml_backend_tensor_get(tensor, raw.data(), 0, raw.size());
        std::vector<float> values(ggml_nelements(tensor));
        size_t index = 0;
        // Canonical row-major flattening in reversed ggml dimension order.
        // Read strides explicitly: reshape/transpose nodes need not be contiguous.
        for (int64_t i3 = 0; i3 < tensor->ne[3]; ++i3)
        for (int64_t i2 = 0; i2 < tensor->ne[2]; ++i2)
        for (int64_t i1 = 0; i1 < tensor->ne[1]; ++i1)
        for (int64_t i0 = 0; i0 < tensor->ne[0]; ++i0) {
            size_t offset = i3*tensor->nb[3] + i2*tensor->nb[2] + i1*tensor->nb[1] + i0*tensor->nb[0];
            if (tensor->type == GGML_TYPE_F32) memcpy(&values[index], raw.data() + offset, 4);
            else { ggml_fp16_t half; memcpy(&half, raw.data() + offset, 2); values[index] = ggml_fp16_to_fp32(half); }
            ++index;
        }
        std::ofstream output(poc_trace_directory + "/" + name + ".f32", std::ios::binary);
        output.write(reinterpret_cast<const char*>(values.data()), values.size() * sizeof(float));
        if (!output) throw std::runtime_error("Trace write failed");
        if (poc_trace_count++) poc_trace_manifest << ",";
        poc_trace_manifest << "{\"name\":\"" << name << "\",\"dtype\":\"" << ggml_type_name(tensor->type)
            << "\",\"op\":\"" << ggml_op_name(tensor->op) << "\",\"dims\":["
            << tensor->ne[3] << "," << tensor->ne[2] << "," << tensor->ne[1] << "," << tensor->ne[0] << "]}";
        return true;
    } catch (const std::exception& error) {
        fprintf(stderr, "Trace %s: %s\n", name.c_str(), error.what());
        poc_trace_failed = true; return false;
    }
}
extern "C" int whisper_poc_trace_end() {
    poc_trace_manifest << "]\n";
    poc_trace_manifest.close();
    return poc_trace_failed || poc_trace_count == 0 ? -1 : 0;
}
