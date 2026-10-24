#pragma once
#include <cstdint>
extern "C" {
int poc_open(const char* model);
void poc_close();
int poc_encode(const float* mel, int frames, int bins);
int poc_encode_samples(const float* samples, int count);
int poc_set_threads(int count);
int poc_get_threads();
double poc_mel_ms();
double poc_encoder_ms();
int poc_decode(const int32_t* tokens, int count, int past);
int poc_vocab();
const float* poc_logits();
int poc_qk_dims(int32_t* dims);
int poc_qk_copy(float* output, int capacity);
int poc_trace_begin(const char* directory);
int poc_trace_end();
}
