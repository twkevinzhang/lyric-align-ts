#if defined(__wasm_simd128__)
// One scale per row; blocks only describe storage, not separate quantizers.
static int poc_attention_quant=0;
int poc_set_attention_quant(int enabled){if(enabled!=0 && enabled!=2)return -1;poc_attention_quant=enabled;return 0;}
#define POC_GROUP_WIDTH 128
struct poc_group_block {float d,offset;int8_t q[POC_GROUP_WIDTH];};
struct poc_group_entry {const void *key;struct poc_group_block *data;int64_t k,m;};
static struct poc_group_entry poc_group_weights[256];
static int poc_group_count=0;
static size_t poc_group_bytes=0;
void poc_group_cache_clear(void){for(int i=0;i<poc_group_count;i++)free(poc_group_weights[i].data);poc_group_count=0;poc_group_bytes=0;}
size_t poc_group_cache_size(void){return poc_group_bytes;}
static float poc_row_peak(const float *x,int n){v128_t v=wasm_f32x4_splat(0);int j=0;for(;j+3<n;j+=4)v=wasm_f32x4_max(v,wasm_f32x4_abs(wasm_v128_load(x+j)));float p=fmaxf(fmaxf(wasm_f32x4_extract_lane(v,0),wasm_f32x4_extract_lane(v,1)),fmaxf(wasm_f32x4_extract_lane(v,2),wasm_f32x4_extract_lane(v,3)));for(;j<n;j++)p=fmaxf(p,fabsf(x[j]));return p;}
static void poc_group_quant(const float *source,int count,bool activation,struct poc_group_block *q,float scale,int width){
    float tail[POC_GROUP_WIDTH];const float *x=source;
    if(count<width){memcpy(tail,source,count*sizeof(float));memset(tail+count,0,(width-count)*sizeof(float));x=tail;}
    q->d=scale;
    const v128_t inv=wasm_f32x4_splat(q->d?1/q->d:0),half=wasm_f32x4_splat(.5f),sign=wasm_i32x4_splat((int32_t)0x80000000);
    v128_t sumv=wasm_i32x4_splat(0);
    for(int j=0;j<width;j+=16){v128_t v[4];for(int c=0;c<4;c++){const v128_t in=wasm_v128_load(x+j+c*4);v[c]=wasm_i32x4_trunc_sat_f32x4(wasm_f32x4_add(wasm_f32x4_mul(in,inv),wasm_v128_or(half,wasm_v128_and(in,sign))));sumv=wasm_i32x4_add(sumv,v[c]);if(!activation)v[c]=wasm_i32x4_add(v[c],wasm_i32x4_splat(63));}wasm_v128_store(q->q+j,wasm_i8x16_narrow_i16x8(wasm_i16x8_narrow_i32x4(v[0],v[1]),wasm_i16x8_narrow_i32x4(v[2],v[3])));}
    const int sum=wasm_i32x4_extract_lane(sumv,0)+wasm_i32x4_extract_lane(sumv,1)+wasm_i32x4_extract_lane(sumv,2)+wasm_i32x4_extract_lane(sumv,3);
    q->offset=activation?sum*q->d:-63*q->d;
}
static struct poc_group_block *poc_group_find(const struct ggml_tensor *a){
    if(a->type!=GGML_TYPE_Q5_1 || !ggml_is_contiguous(a) || a->ne[2]!=1 || a->ne[3]!=1 || !poc_model_weight(a))return NULL;
    for(int i=0;i<poc_group_count;i++)if(poc_group_weights[i].key==a->data && poc_group_weights[i].k==a->ne[0] && poc_group_weights[i].m==a->ne[1])return poc_group_weights[i].data;
    return NULL;
}
int poc_group_cache_add(const struct ggml_tensor *a){
    if(a->type!=GGML_TYPE_Q5_1 || !ggml_is_contiguous(a) || a->ne[2]!=1 || a->ne[3]!=1 || a->ne[1]>10000 || a->ne[0]>4096 || !poc_model_weight(a))return 0;
    if(poc_group_find(a))return 1;
    const int64_t k=a->ne[0],m=a->ne[1],groups=(k+POC_GROUP_WIDTH-1)/POC_GROUP_WIDTH;const size_t bytes=groups*m*sizeof(struct poc_group_block);
    if(poc_group_count>=256 || poc_group_bytes+bytes>128*1024*1024)return 0;
    struct poc_group_block *packed=malloc(bytes);float *row=malloc(k*sizeof(float));if(!packed || !row){free(packed);free(row);return 0;}
    for(int64_t r=0;r<m;r++){dequantize_row_q5_1((const block_q5_1*)((const char*)a->data+r*a->nb[1]),row,k);const float scale=poc_row_peak(row,k)/63;for(int64_t g=0;g<groups;g++)poc_group_quant(row+g*POC_GROUP_WIDTH,MIN(POC_GROUP_WIDTH,k-g*POC_GROUP_WIDTH),false,packed+r*groups+g,scale,POC_GROUP_WIDTH);}
    free(row);poc_group_weights[poc_group_count++]=(struct poc_group_entry){a->data,packed,k,m};poc_group_bytes+=bytes;return 1;
}
static size_t poc_group_size(const struct ggml_tensor *a,const struct ggml_tensor *b){
    if(b->type!=GGML_TYPE_F32 || b->nb[0]!=sizeof(float) || a->ne[0]>4096)return 0;
    const bool cached=poc_group_find(a)!=NULL;
    if(!cached && (poc_attention_quant!=2 || a->type!=GGML_TYPE_F16 || a->nb[0]!=sizeof(ggml_fp16_t) || poc_model_weight(a)))return 0;
    const int width=cached?128:64;
    const int64_t groups=(a->ne[0]+width-1)/width,count=groups*((cached?0:ggml_nrows(a))+ggml_nrows(b));
    return count>0 && count<256*1024*1024/sizeof(struct poc_group_block)?count*sizeof(struct poc_group_block):0;
}
static void poc_group_tile(int groups,const struct poc_group_block *a,const struct poc_group_block *b,float out[4],int rows,int cols,int width){
    v128_t acc[4];for(int i=0;i<4;i++)acc[i]=wasm_i32x4_splat(0);
    for(int g=0;g<groups;g++)for(int j=0;j<width;j+=32){
        v128_t yl[2],yh[2];for(int c=0;c<cols;c++){yl[c]=wasm_v128_load(b[c*groups+g].q+j);yh[c]=wasm_v128_load(b[c*groups+g].q+j+16);}
        for(int r=0;r<rows;r++){const v128_t lo=wasm_v128_load(a[r*groups+g].q+j),hi=wasm_v128_load(a[r*groups+g].q+j+16);for(int c=0;c<cols;c++){const int i=c*2+r;acc[i]=wasm_i32x4_relaxed_dot_i8x16_i7x16_add(yh[c],hi,wasm_i32x4_relaxed_dot_i8x16_i7x16_add(yl[c],lo,acc[i]));}}
    }
    for(int c=0;c<cols;c++)for(int r=0;r<rows;r++){const int i=c*2+r;out[i]=poc_compact_reduce(wasm_f32x4_convert_i32x4(acc[i]),0)*(a[r*groups].d*b[c*groups].d)+a[r*groups].offset*b[c*groups].offset;}
}
static void poc_group_tile42(int groups,const struct poc_group_block *a,const struct poc_group_block *b,float out[8]){
    v128_t acc[8];for(int i=0;i<8;i++)acc[i]=wasm_i32x4_splat(0);
    for(int g=0;g<groups;g++)for(int j=0;j<128;j+=32){
        v128_t yl[2],yh[2];for(int c=0;c<2;c++){yl[c]=wasm_v128_load(b[c*groups+g].q+j);yh[c]=wasm_v128_load(b[c*groups+g].q+j+16);}
        for(int r=0;r<4;r++){const v128_t lo=wasm_v128_load(a[r*groups+g].q+j),hi=wasm_v128_load(a[r*groups+g].q+j+16);for(int c=0;c<2;c++){const int i=c*4+r;acc[i]=wasm_i32x4_relaxed_dot_i8x16_i7x16_add(yh[c],hi,wasm_i32x4_relaxed_dot_i8x16_i7x16_add(yl[c],lo,acc[i]));}}
    }
    for(int c=0;c<2;c++)for(int r=0;r<4;r++){const int i=c*4+r;out[i]=poc_compact_reduce(wasm_f32x4_convert_i32x4(acc[i]),0)*(a[r*groups].d*b[c*groups].d)+a[r*groups].offset*b[c*groups].offset;}
}
static void poc_group_tile42_64(int groups,const struct poc_group_block *a,const struct poc_group_block *b,float out[8]){
    v128_t acc[8];for(int i=0;i<8;i++)acc[i]=wasm_i32x4_splat(0);
    for(int g=0;g<groups;g++)for(int j=0;j<64;j+=32){
        v128_t yl[2],yh[2];for(int c=0;c<2;c++){yl[c]=wasm_v128_load(b[c*groups+g].q+j);yh[c]=wasm_v128_load(b[c*groups+g].q+j+16);}
        for(int r=0;r<4;r++){const v128_t lo=wasm_v128_load(a[r*groups+g].q+j),hi=wasm_v128_load(a[r*groups+g].q+j+16);for(int c=0;c<2;c++){const int i=c*4+r;acc[i]=wasm_i32x4_relaxed_dot_i8x16_i7x16_add(yh[c],hi,wasm_i32x4_relaxed_dot_i8x16_i7x16_add(yl[c],lo,acc[i]));}}
    }
    for(int c=0;c<2;c++)for(int r=0;r<4;r++){const int i=c*4+r;out[i]=poc_compact_reduce(wasm_f32x4_convert_i32x4(acc[i]),0)*(a[r*groups].d*b[c*groups].d)+a[r*groups].offset*b[c*groups].offset;}
}
static void poc_group_tile44(int groups,const struct poc_group_block *a,const struct poc_group_block *b,float out[16]){
    v128_t acc[16];for(int i=0;i<16;i++)acc[i]=wasm_i32x4_splat(0);
    for(int g=0;g<groups;g++)for(int j=0;j<128;j+=32){
        v128_t yl[4],yh[4];for(int c=0;c<4;c++){yl[c]=wasm_v128_load(b[c*groups+g].q+j);yh[c]=wasm_v128_load(b[c*groups+g].q+j+16);}
        for(int r=0;r<4;r++){const v128_t lo=wasm_v128_load(a[r*groups+g].q+j),hi=wasm_v128_load(a[r*groups+g].q+j+16);for(int c=0;c<4;c++){const int i=c*4+r;acc[i]=wasm_i32x4_relaxed_dot_i8x16_i7x16_add(yh[c],hi,wasm_i32x4_relaxed_dot_i8x16_i7x16_add(yl[c],lo,acc[i]));}}
    }
    for(int c=0;c<4;c++)for(int r=0;r<4;r++){const int i=c*4+r;out[i]=poc_compact_reduce(wasm_f32x4_convert_i32x4(acc[i]),0)*(a[r*groups].d*b[c*groups].d)+a[r*groups].offset*b[c*groups].offset;}
}
static void poc_group_tile44_64(int groups,const struct poc_group_block *a,const struct poc_group_block *b,float out[16]){
    v128_t acc[16];for(int i=0;i<16;i++)acc[i]=wasm_i32x4_splat(0);
    for(int g=0;g<groups;g++)for(int j=0;j<64;j+=32){
        v128_t yl[4],yh[4];for(int c=0;c<4;c++){yl[c]=wasm_v128_load(b[c*groups+g].q+j);yh[c]=wasm_v128_load(b[c*groups+g].q+j+16);}
        for(int r=0;r<4;r++){const v128_t lo=wasm_v128_load(a[r*groups+g].q+j),hi=wasm_v128_load(a[r*groups+g].q+j+16);for(int c=0;c<4;c++){const int i=c*4+r;acc[i]=wasm_i32x4_relaxed_dot_i8x16_i7x16_add(yh[c],hi,wasm_i32x4_relaxed_dot_i8x16_i7x16_add(yl[c],lo,acc[i]));}}
    }
    for(int c=0;c<4;c++)for(int r=0;r<4;r++){const int i=c*4+r;out[i]=poc_compact_reduce(wasm_f32x4_convert_i32x4(acc[i]),0)*(a[r*groups].d*b[c*groups].d)+a[r*groups].offset*b[c*groups].offset;}
}
static bool poc_group_matmul(const struct ggml_compute_params *p,struct ggml_tensor *dst){
    const struct ggml_tensor *a=dst->src[0],*b=dst->src[1];const size_t size=poc_group_size(a,b);if(!size)return false;GGML_ASSERT(p->wsize>=size);
    struct poc_group_block *cached=poc_group_find(a);const int width=cached?128:64;
    const int64_t k=a->ne[0],groups=(k+width-1)/width,m=a->ne[1],n=b->ne[1];
    struct poc_group_block *pa=cached?cached:p->wdata,*pb=cached?p->wdata:pa+groups*ggml_nrows(a);
    for(int side=0;side<2;side++){if(!side && cached)continue;const struct ggml_tensor *t=side?b:a;struct poc_group_block *out=side?pb:pa;
        for(int64_t row=p->ith;row<ggml_nrows(t);row+=p->nth){const char *src=(const char*)t->data+(row%t->ne[1])*t->nb[1]+(row/t->ne[1]%t->ne[2])*t->nb[2]+(row/(t->ne[1]*t->ne[2]))*t->nb[3];
            float values[4096];const float *input;
            if(t->type==GGML_TYPE_F32)input=(const float*)src;else{for(int j=0;j<k;j++)values[j]=poc_half_value(t,src,j);input=values;}
            const float scale=poc_row_peak(input,k)/(side?127:63);float sum=0;
            for(int64_t g=0;g<groups;g++){struct poc_group_block *block=out+row*groups+g;poc_group_quant(input+g*width,MIN(width,k-g*width),side!=0,block,scale,width);sum+=block->offset;}
            if(side)out[row*groups].offset=sum;
        }
    }
    ggml_barrier(p->threadpool);
    const int tilecols=4;
    const int64_t mt=(m+3)/4,nt=(n+tilecols-1)/tilecols,r2=b->ne[2]/a->ne[2],r3=b->ne[3]/a->ne[3];
    for(int64_t tile=p->ith;tile<mt*nt*b->ne[2]*b->ne[3];tile+=p->nth){const int64_t row=tile%mt*4,col=tile/mt%nt*tilecols,i2=tile/(mt*nt)%b->ne[2],i3=tile/(mt*nt*b->ne[2]);
        const struct poc_group_block *ar=pa+((i3/r3*a->ne[2]+i2/r2)*m+row)*groups,*br=pb+((i3*b->ne[2]+i2)*n+col)*groups;
        float values[16];const int rows=MIN(4,m-row),cols=MIN(tilecols,n-col);
        if(rows==4 && cols==4){if(width==64)poc_group_tile44_64(groups,ar,br,values);else poc_group_tile44(groups,ar,br,values);}
        else if(rows==4 && cols==2){if(width==64)poc_group_tile42_64(groups,ar,br,values);else poc_group_tile42(groups,ar,br,values);}
        else for(int c=0;c<cols;c++)for(int r=0;r<rows;r++){float edge[4];poc_group_tile(groups,ar+r*groups,br+c*groups,edge,1,1,width);values[c*4+r]=edge[0];}
        for(int c=0;c<cols;c++){float *out=(float*)((char*)dst->data+row*sizeof(float)+(col+c)*dst->nb[1]+i2*dst->nb[2]+i3*dst->nb[3]);for(int r=0;r<rows;r++)out[r]=values[c*4+r];}
    }
    return true;
}
#endif
