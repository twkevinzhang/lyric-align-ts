// 4x4 outer-product experiment. F16 rounding is preserved; summation order changes.
#if defined(__wasm_simd128__)
#define POC_TILE_FMA(a,b,c) wasm_f32x4_relaxed_madd(b,c,a)
static size_t poc_pack_size(const struct ggml_tensor *a,const struct ggml_tensor *b) {
    if(a->type!=GGML_TYPE_F16 || (b->type!=GGML_TYPE_F16 && b->type!=GGML_TYPE_F32) || b->ne[1]<64)return 0;
    int64_t count=((a->ne[1]+3)/4)*4*a->ne[0]*a->ne[2]*a->ne[3]+ggml_nelements(b);
    return count>0 && count<=64*1024*1024 ? count*sizeof(float):0;
}
static float poc_half_value(const struct ggml_tensor *t,const char *row,int64_t k) {
    ggml_fp16_t h=t->type==GGML_TYPE_F16?((const ggml_fp16_t *)row)[k]:GGML_CPU_FP32_TO_FP16(((const float *)row)[k]);
    return GGML_CPU_FP16_TO_FP32(h);
}
static bool poc_packed_matmul(const struct ggml_compute_params *p,struct ggml_tensor *dst) {
    const struct ggml_tensor *a=dst->src[0],*b=dst->src[1];size_t size=poc_pack_size(a,b);
    if(!size)return false;GGML_ASSERT(p->wsize>=size);
    const int64_t k=a->ne[0],m=a->ne[1],n=b->ne[1],mt=(m+3)/4,nt=(n+3)/4;
    float *pa=p->wdata,*pb=pa+mt*4*k*a->ne[2]*a->ne[3];
    for(int64_t tile=p->ith;tile<mt*a->ne[2]*a->ne[3];tile+=p->nth) {
        int64_t batch=tile/mt,i2=batch%a->ne[2],i3=batch/a->ne[2];
        for(int lane=0;lane<4;lane++) {
            int64_t row=(tile%mt)*4+lane;
            const char *src=(const char *)a->data+i3*a->nb[3]+i2*a->nb[2];
            if(row<m)src+=row*a->nb[1];
            for(int64_t j=0;j<k;j++)pa[tile*k*4+j*4+lane]=row<m?poc_half_value(a,src,j):0;
        }
    }
    for(int64_t row=p->ith;row<ggml_nrows(b);row+=p->nth) {
        const char *src=(const char *)b->data+(row%n)*b->nb[1]+(row/n%b->ne[2])*b->nb[2]+(row/(n*b->ne[2]))*b->nb[3];
        for(int64_t j=0;j<k;j++)pb[row*k+j]=poc_half_value(b,src,j);
    }
    ggml_barrier(p->threadpool);
    int64_t r2=b->ne[2]/a->ne[2],r3=b->ne[3]/a->ne[3];
    for(int64_t tile=p->ith;tile<mt*nt*b->ne[2]*b->ne[3];tile+=p->nth) {
        int64_t ti=tile%mt,tj=tile/mt%nt,batch=tile/(mt*nt),i2=batch%b->ne[2],i3=batch/b->ne[2];
        const float *x=pa+(((i3/r3)*a->ne[2]+i2/r2)*mt+ti)*k*4;
        const float *y0=pb+(batch*n+tj*4)*k;
        const float *y1=tj*4+1<n?y0+k:y0,*y2=tj*4+2<n?y0+2*k:y0,*y3=tj*4+3<n?y0+3*k:y0;
        v128_t s0=wasm_f32x4_splat(0),s1=s0,s2=s0,s3=s0;
        v128_t t0=s0,t1=s0,t2=s0,t3=s0;
        int64_t j=0;
        for(;j+1<k;j+=2) {
            v128_t v=wasm_v128_load(x+j*4),w=wasm_v128_load(x+(j+1)*4);
            s0=POC_TILE_FMA(s0,v,wasm_f32x4_splat(y0[j]));t0=POC_TILE_FMA(t0,w,wasm_f32x4_splat(y0[j+1]));
            s1=POC_TILE_FMA(s1,v,wasm_f32x4_splat(y1[j]));t1=POC_TILE_FMA(t1,w,wasm_f32x4_splat(y1[j+1]));
            s2=POC_TILE_FMA(s2,v,wasm_f32x4_splat(y2[j]));t2=POC_TILE_FMA(t2,w,wasm_f32x4_splat(y2[j+1]));
            s3=POC_TILE_FMA(s3,v,wasm_f32x4_splat(y3[j]));t3=POC_TILE_FMA(t3,w,wasm_f32x4_splat(y3[j+1]));
        }
        if(j<k){v128_t v=wasm_v128_load(x+j*4);s0=POC_TILE_FMA(s0,v,wasm_f32x4_splat(y0[j]));s1=POC_TILE_FMA(s1,v,wasm_f32x4_splat(y1[j]));s2=POC_TILE_FMA(s2,v,wasm_f32x4_splat(y2[j]));s3=POC_TILE_FMA(s3,v,wasm_f32x4_splat(y3[j]));}
        float values[16];wasm_v128_store(values,wasm_f32x4_add(s0,t0));wasm_v128_store(values+4,wasm_f32x4_add(s1,t1));wasm_v128_store(values+8,wasm_f32x4_add(s2,t2));wasm_v128_store(values+12,wasm_f32x4_add(s3,t3));
        for(int col=0;col<4 && tj*4+col<n;col++) {
            float *out=(float *)((char *)dst->data+i3*dst->nb[3]+i2*dst->nb[2]+(tj*4+col)*dst->nb[1]);
            for(int lane=0;lane<4 && ti*4+lane<m;lane++)out[ti*4+lane]=values[col*4+lane];
        }
    }
    return true;
}
#endif
