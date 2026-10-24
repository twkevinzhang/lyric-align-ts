#if defined(__wasm_simd128__)
void poc_group_cache_clear(void);
size_t poc_group_cache_size(void);
// Same Q5/Q8 values, with half-precision scales converted exactly once.
struct poc_byte_block { float d, offset; int8_t q[32]; };
// Immutable model weights only. Populate before inference; reads are thread-safe.
struct poc_weight_entry { const void *key; struct poc_byte_block *data; size_t bytes; };
static struct poc_weight_entry poc_weights[256];
static int poc_weight_count=0;
static size_t poc_weight_bytes=0;
static struct poc_byte_block *poc_weight_find(const struct ggml_tensor *a) {
    if(a->type!=GGML_TYPE_Q5_1 || !ggml_is_contiguous(a) || !a->buffer || ggml_backend_buffer_get_usage(a->buffer)!=GGML_BACKEND_BUFFER_USAGE_WEIGHTS)return NULL;
    for(int i=0;i<poc_weight_count;i++)if(poc_weights[i].key==a->data)return poc_weights[i].data;
    return NULL;
}
void poc_compact_cache_clear(void) {
    poc_group_cache_clear();
    for(int i=0;i<poc_weight_count;i++)free(poc_weights[i].data);
    poc_weight_count=0;poc_weight_bytes=0;
}
size_t poc_compact_cache_size(void) { return poc_weight_bytes+poc_group_cache_size(); }
int poc_compact_cache_add(const struct ggml_tensor *a) {
    if(a->type!=GGML_TYPE_Q5_1 || !a->buffer || ggml_backend_buffer_get_usage(a->buffer)!=GGML_BACKEND_BUFFER_USAGE_WEIGHTS || !ggml_is_contiguous(a))return 0;
    if(poc_weight_find(a))return 1;
    size_t count=ggml_nelements(a)/32,bytes=count*sizeof(struct poc_byte_block);
    if(poc_weight_count>=256 || poc_weight_bytes+bytes>128*1024*1024)return 0;
    struct poc_byte_block *packed=malloc(bytes);if(!packed)return 0;
    const block_q5_1 *source=a->data;
    for(size_t j=0;j<count;j++) {
        const block_q5_1 *q=source+j;struct poc_byte_block *o=packed+j;
        uint32_t high;memcpy(&high,q->qh,4);
        o->d=GGML_CPU_FP16_TO_FP32(q->d);o->offset=GGML_CPU_FP16_TO_FP32(q->m);
        for(int i=0;i<16;i++){o->q[i]=(q->qs[i]&15)|(((high>>i)&1)<<4);o->q[i+16]=(q->qs[i]>>4)|(((high>>(i+16))&1)<<4);}
    }
    poc_weights[poc_weight_count++]=(struct poc_weight_entry){a->data,packed,bytes};poc_weight_bytes+=bytes;
    return 1;
}
static size_t poc_compact_size(const struct ggml_tensor *a,const struct ggml_tensor *b) {
    if(a->type!=GGML_TYPE_Q5_1 || b->type!=GGML_TYPE_F32 || b->ne[1]<64 || a->nb[0]!=sizeof(block_q5_1) || b->nb[0]!=sizeof(float))return 0;
    int64_t blocks=(ggml_nelements(a)+ggml_nelements(b))/32;
    return blocks>0 && blocks<=256*1024*1024/sizeof(struct poc_byte_block)?blocks*sizeof(struct poc_byte_block):0;
}
static float poc_compact_reduce(v128_t sum,float offset) {
    return wasm_f32x4_extract_lane(sum,0)+wasm_f32x4_extract_lane(sum,1)+wasm_f32x4_extract_lane(sum,2)+wasm_f32x4_extract_lane(sum,3)+offset;
}
static void poc_compact_tile(int blocks,const struct poc_byte_block *a,const struct poc_byte_block *b,float out[8]) {
    v128_t sum[8];float offsets[8]={0};
    for(int i=0;i<8;i++)sum[i]=wasm_f32x4_splat(0);
    for(int k=0;k<blocks;k++) {
        v128_t yl[2],yh[2];float yd[2],ym[2];
        for(int c=0;c<2;c++){const struct poc_byte_block *q=b+c*blocks+k;yl[c]=wasm_v128_load(q->q);yh[c]=wasm_v128_load(q->q+16);yd[c]=q->d;ym[c]=q->offset;}
        for(int r=0;r<4;r++) {
            const struct poc_byte_block *q=a+r*blocks+k;
            v128_t lo=wasm_v128_load(q->q),hi=wasm_v128_load(q->q+16);
            for(int c=0;c<2;c++) {
                int i=c*4+r;
                v128_t dots=wasm_i32x4_relaxed_dot_i8x16_i7x16_add(yh[c],hi,wasm_i32x4_relaxed_dot_i8x16_i7x16_add(yl[c],lo,wasm_i32x4_splat(0)));
                sum[i]=wasm_f32x4_relaxed_madd(wasm_f32x4_convert_i32x4(dots),wasm_f32x4_splat(q->d*yd[c]),sum[i]);
                offsets[i]+=q->offset*ym[c];
            }
        }
    }
    for(int i=0;i<8;i++)out[i]=poc_compact_reduce(sum[i],offsets[i]);
}
// Edge outputs retain the original dot grouping, matching qbyte's fallback.
static float poc_compact_tail(int blocks,const struct poc_byte_block *a,const struct poc_byte_block *b) {
    v128_t sum=wasm_f32x4_splat(0);float offset=0;
    for(int k=0;k<blocks;k++) {
        v128_t al=wasm_v128_load(a[k].q),ah=wasm_v128_load(a[k].q+16),bl=wasm_v128_load(b[k].q),bh=wasm_v128_load(b[k].q+16);
        v128_t dots=wasm_i32x4_add(
            wasm_i32x4_add(wasm_i32x4_dot_i16x8(wasm_i16x8_extend_low_i8x16(al),wasm_i16x8_extend_low_i8x16(bl)),wasm_i32x4_dot_i16x8(wasm_i16x8_extend_high_i8x16(al),wasm_i16x8_extend_high_i8x16(bl))),
            wasm_i32x4_add(wasm_i32x4_dot_i16x8(wasm_i16x8_extend_low_i8x16(ah),wasm_i16x8_extend_low_i8x16(bh)),wasm_i32x4_dot_i16x8(wasm_i16x8_extend_high_i8x16(ah),wasm_i16x8_extend_high_i8x16(bh))));
        sum=wasm_f32x4_add(sum,wasm_f32x4_mul(wasm_f32x4_convert_i32x4(dots),wasm_f32x4_splat(a[k].d*b[k].d)));
        offset+=a[k].offset*b[k].offset;
    }
    return poc_compact_reduce(sum,offset);
}
static bool poc_compact_matmul(const struct ggml_compute_params *p,struct ggml_tensor *dst) {
    const struct ggml_tensor *a=dst->src[0],*b=dst->src[1];size_t size=poc_compact_size(a,b);
    if(!size)return false;
    GGML_ASSERT(p->wsize>=size);
    int64_t blocks=a->ne[0]/32,m=a->ne[1],n=b->ne[1];
    struct poc_byte_block *pa=p->wdata,*pb=pa+ggml_nelements(a)/32;
    struct poc_byte_block *cached=poc_weight_find(a);if(cached)pa=cached;
    for(int side=0;side<2;side++) {
        if(!side && cached)continue;
        const struct ggml_tensor *t=side?b:a;struct poc_byte_block *out=side?pb:pa;
        for(int64_t r=p->ith;r<ggml_nrows(t);r+=p->nth) {
            const char *row=(const char *)t->data+(r%t->ne[1])*t->nb[1]+(r/t->ne[1]%t->ne[2])*t->nb[2]+(r/(t->ne[1]*t->ne[2]))*t->nb[3];
            for(int64_t j=0;j<blocks;j++) {
                struct poc_byte_block *o=out+r*blocks+j;
                if(!side) {
                    const block_q5_1 *q=(const block_q5_1 *)row+j;uint32_t high;memcpy(&high,q->qh,4);
                    o->d=GGML_CPU_FP16_TO_FP32(q->d);o->offset=GGML_CPU_FP16_TO_FP32(q->m);
                    for(int i=0;i<16;i++){o->q[i]=(q->qs[i]&15)|(((high>>i)&1)<<4);o->q[i+16]=(q->qs[i]>>4)|(((high>>(i+16))&1)<<4);}
                } else {
                    block_q8_1 q;quantize_row_q8_1((const float *)row+j*32,&q,32);
                    o->d=GGML_CPU_FP16_TO_FP32(q.d);o->offset=GGML_CPU_FP16_TO_FP32(q.s);memcpy(o->q,q.qs,32);
                }
            }
        }
    }
    ggml_barrier(p->threadpool);
    int64_t mt=(m+3)/4,nt=(n+1)/2,r2=b->ne[2]/a->ne[2],r3=b->ne[3]/a->ne[3];
    for(int64_t tile=p->ith;tile<mt*nt*b->ne[2]*b->ne[3];tile+=p->nth) {
        int64_t row=tile%mt*4,col=tile/mt%nt*2,i2=tile/(mt*nt)%b->ne[2],i3=tile/(mt*nt*b->ne[2]);
        const struct poc_byte_block *ar=pa+((i3/r3*a->ne[2]+i2/r2)*m+row)*blocks,*br=pb+((i3*b->ne[2]+i2)*n+col)*blocks;
        char *out=(char *)dst->data+row*sizeof(float)+col*dst->nb[1]+i2*dst->nb[2]+i3*dst->nb[3];
        if(row+3<m && col+1<n) {
            float values[8];poc_compact_tile(blocks,ar,br,values);
            memcpy(out,values,4*sizeof(float));memcpy(out+dst->nb[1],values+4,4*sizeof(float));
        } else for(int c=0;c<2 && col+c<n;c++)for(int r=0;r<4 && row+r<m;r++)
            *((float *)(out+c*dst->nb[1])+r)=poc_compact_tail(blocks,ar+r*blocks,br+c*blocks);
    }
    return true;
}
#endif
