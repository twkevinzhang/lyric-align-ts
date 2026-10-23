#include "bridge.h"
#include <fstream>
#include <iostream>
#include <vector>
#include <stdexcept>
#include <string>

static void write(const std::string& path, const float* data, size_t count) {
    std::ofstream stream(path, std::ios::binary);
    stream.write(reinterpret_cast<const char*>(data), count * sizeof(float));
    if (!stream) throw std::runtime_error("Cannot write " + path);
}
int main(int argc, char** argv) {
    try {
        if (argc != 5) throw std::runtime_error("usage: parity MODEL MEL STEPS OUTPUT_DIRECTORY");
        std::vector<float> mel(80 * 3000);
        std::ifstream input(argv[2], std::ios::binary | std::ios::ate);
        if (!input || input.tellg() != static_cast<std::streamoff>(mel.size() * sizeof(float))) throw std::runtime_error("Invalid Mel file size");
        input.seekg(0); input.read(reinterpret_cast<char*>(mel.data()), mel.size() * sizeof(float));
        if (!input || poc_open(argv[1])) throw std::runtime_error("Initialize failed");
#ifdef POC_TRACE
        if (poc_trace_begin(argv[4])) throw std::runtime_error("Trace initialization failed");
#endif
        if (poc_encode(mel.data(), 3000, 80)) throw std::runtime_error("Encode failed");
#ifdef POC_TRACE
        if (poc_trace_end()) throw std::runtime_error("Trace capture failed");
#endif
        std::ifstream steps(argv[3]);
        std::ofstream manifest(std::string(argv[4]) + "/tensors.json");
        if (!steps || !manifest) throw std::runtime_error("Cannot open steps/output");
        manifest << "[";
        std::string name; int past, count, stepIndex = 0;
        while (steps >> name >> past >> count) {
            if (count <= 0 || count > 448) throw std::runtime_error("Invalid token count");
            std::vector<int32_t> tokens(count);
            for (auto& token : tokens) if (!(steps >> token)) throw std::runtime_error("Truncated tokens");
            if (poc_decode(tokens.data(), count, past)) throw std::runtime_error("Decode failed");
            int32_t dims[3]; int size = poc_qk_dims(dims);
            if (size <= 0) throw std::runtime_error("Missing QK");
            std::vector<float> qk(size);
            if (poc_qk_copy(qk.data(), size)) throw std::runtime_error("QK copy failed");
            std::string prefix = std::string(argv[4]) + "/" + name;
            write(prefix + ".logits.f32", poc_logits(), poc_vocab());
            write(prefix + ".qk.f32", qk.data(), qk.size());
            if (stepIndex++) manifest << ",";
            manifest << "{\"name\":\"" << name << "\",\"nPast\":" << past << ",\"tokens\":[";
            for (int i = 0; i < count; ++i) { if (i) manifest << ","; manifest << tokens[i]; }
            manifest << "],\"logitsDims\":[" << poc_vocab() << "],\"qkDims\":[" << dims[0] << "," << dims[1] << "," << dims[2] << "]}";
            std::cout << "Captured " << name << std::endl;
        }
        if (stepIndex == 0) throw std::runtime_error("No steps");
        manifest << "]\n";
        poc_close(); return 0;
    } catch (const std::exception& e) {
        std::cerr << e.what() << std::endl; poc_close(); return 1;
    }
}
