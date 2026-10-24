#if defined(__wasm_simd128__)
#include <wasm_simd128.h>
#include <math.h>
#ifdef __cplusplus
extern "C" {
#endif
extern bool poc_vector_activations;
int poc_set_vector_activations(int enabled);
#ifdef __cplusplus
}
#endif
// GGML's existing SIMD exponential polynomial, specialized to nonpositive inputs.
// Values below -80 are negligible for softmax and tanh: absolute error < exp(-80).
static inline v128_t poc_exp_negative(v128_t original){
    const v128_t x=wasm_f32x4_max(original,wasm_f32x4_splat(-80)),r=wasm_f32x4_splat(0x1.8p23f);
    const v128_t z=wasm_f32x4_add(wasm_f32x4_mul(x,wasm_f32x4_splat(0x1.715476p+0f)),r),n=wasm_f32x4_sub(z,r);
    const v128_t b=wasm_f32x4_sub(wasm_f32x4_sub(x,wasm_f32x4_mul(n,wasm_f32x4_splat(0x1.62e4p-1f))),wasm_f32x4_mul(n,wasm_f32x4_splat(0x1.7f7d1cp-20f)));
    const v128_t k=wasm_i32x4_add(wasm_i32x4_shl(z,23),wasm_f32x4_splat(1)),u=wasm_f32x4_mul(b,b);
    v128_t p=wasm_f32x4_add(wasm_f32x4_mul(wasm_f32x4_splat(0x1.0e4020p-7f),b),wasm_f32x4_splat(0x1.573e2ep-5f));
    const v128_t q=wasm_f32x4_add(wasm_f32x4_mul(wasm_f32x4_splat(0x1.555e66p-3f),b),wasm_f32x4_splat(0x1.fffdb6p-2f));
    p=wasm_f32x4_add(wasm_f32x4_mul(p,u),q);
    p=wasm_f32x4_add(wasm_f32x4_mul(p,u),wasm_f32x4_mul(wasm_f32x4_splat(0x1.ffffecp-1f),b));
    return wasm_v128_bitselect(wasm_f32x4_splat(0),wasm_f32x4_add(wasm_f32x4_mul(p,k),k),wasm_f32x4_lt(original,wasm_f32x4_splat(-80)));
}
static inline void poc_vector_gelu(int n,float *y,const float *x){
    int i=0;const v128_t one=wasm_f32x4_splat(1),half=wasm_f32x4_splat(.5f),sign=wasm_i32x4_splat((int32_t)0x80000000);
    for(;i+3<n;i+=4){
        const v128_t v=wasm_v128_load(x+i),t=wasm_f32x4_mul(wasm_f32x4_mul(wasm_f32x4_splat(0.7978845608028654f),v),wasm_f32x4_add(one,wasm_f32x4_mul(wasm_f32x4_splat(.044715f),wasm_f32x4_mul(v,v))));
        const v128_t e=poc_exp_negative(wasm_f32x4_mul(wasm_f32x4_splat(-2),wasm_f32x4_abs(t)));
        const v128_t tanh=wasm_v128_or(wasm_f32x4_div(wasm_f32x4_sub(one,e),wasm_f32x4_add(one,e)),wasm_v128_and(t,sign));
        wasm_v128_store(y+i,wasm_f32x4_mul(wasm_f32x4_mul(half,v),wasm_f32x4_add(one,tanh)));
    }
    for(;i<n;i++)y[i]=.5f*x[i]*(1+tanhf(.7978845608028654f*x[i]*(1+.044715f*x[i]*x[i])));
}
static inline double poc_vector_softmax(int n,float *y,const float *x,float max){
    int i=0;v128_t sum=wasm_f32x4_splat(0),offset=wasm_f32x4_splat(max);
    for(;i+3<n;i+=4){const v128_t e=poc_exp_negative(wasm_f32x4_sub(wasm_v128_load(x+i),offset));wasm_v128_store(y+i,e);sum=wasm_f32x4_add(sum,e);}
    double total=(double)wasm_f32x4_extract_lane(sum,0)+wasm_f32x4_extract_lane(sum,1)+wasm_f32x4_extract_lane(sum,2)+wasm_f32x4_extract_lane(sum,3);
    for(;i<n;i++){y[i]=expf(x[i]-max);total+=y[i];}return total;
}
#endif
