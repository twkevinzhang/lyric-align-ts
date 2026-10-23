cmake_minimum_required(VERSION 3.16)
project(whisper_parity LANGUAGES C CXX)
set(CMAKE_CXX_STANDARD 17)
set(BUILD_SHARED_LIBS OFF CACHE BOOL "" FORCE)
set(WHISPER_BUILD_TESTS OFF CACHE BOOL "" FORCE)
set(WHISPER_BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
set(WHISPER_BUILD_SERVER OFF CACHE BOOL "" FORCE)
set(GGML_NATIVE OFF CACHE BOOL "" FORCE)
set(GGML_OPENMP OFF CACHE BOOL "" FORCE)
set(GGML_BLAS OFF CACHE BOOL "" FORCE)
set(GGML_CUDA OFF CACHE BOOL "" FORCE)
set(GGML_VULKAN OFF CACHE BOOL "" FORCE)
set(GGML_METAL OFF CACHE BOOL "" FORCE)
option(POC_WASM_ARCH "Select GGML's explicit wasm quantized kernels" OFF)
set(POC_PTHREAD_POOL_SIZE 1 CACHE STRING "Prewarmed pthread worker pool")
if(EMSCRIPTEN AND POC_WASM_ARCH)
  # Emscripten 4.0.22 reports x86; this fork checks the processor for wasm.
  set(CMAKE_SYSTEM_PROCESSOR wasm32)
endif()
add_subdirectory(${WHISPER_SOURCE} whisper)
add_executable(parity bridge.cpp runner.cpp)
target_link_libraries(parity PRIVATE whisper)
if(POC_TRACE)
  target_compile_definitions(parity PRIVATE POC_TRACE)
  target_include_directories(whisper PRIVATE ${CMAKE_CURRENT_SOURCE_DIR})
endif()
if(EMSCRIPTEN)
  target_compile_options(parity PRIVATE -pthread -msimd128)
  target_link_options(parity PRIVATE
    -pthread "-sPTHREAD_POOL_SIZE=${POC_PTHREAD_POOL_SIZE}" "-sPTHREAD_POOL_SIZE_STRICT=2" "-sALLOW_BLOCKING_ON_MAIN_THREAD=0" "-sSTACK_SIZE=5242880"
    "-sMODULARIZE=1" "-sEXPORT_NAME=createWhisperParity" "-sENVIRONMENT=web,worker"
    "-sALLOW_MEMORY_GROWTH=1" "-sINITIAL_MEMORY=536870912" "-sMAXIMUM_MEMORY=2147483648"
    "-sFORCE_FILESYSTEM=1" "-sINVOKE_RUN=0"
    "-sEXPORTED_RUNTIME_METHODS=['FS','callMain','ccall','HEAPU8']"
    "-sEXPORTED_FUNCTIONS=['_main','_malloc','_free','_poc_open','_poc_close','_poc_encode','_poc_encode_samples','_poc_decode','_poc_set_threads','_poc_get_threads','_poc_mel_ms','_poc_encoder_ms','_poc_vocab','_poc_logits','_poc_qk_dims','_poc_qk_copy','_poc_trace_begin','_poc_trace_end']")
endif()
