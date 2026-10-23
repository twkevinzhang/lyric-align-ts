// Only immutable model-weight buffers are eligible. Temporary tensors are repacked.
export function cachedWeightKernel(original){
  let code=original;
  const replace=(a,b)=>{if(code.split(a).length!==2)throw Error('Ambiguous cache kernel anchor');code=code.replace(a,b);};
  replace('b->ne[1]<64','b->ne[1]<1');
  const tailStart=code.indexOf('static float poc_compact_tail');
  const tailDotStart=code.indexOf('v128_t dots=wasm_i32x4_add(',tailStart);
  const tailDotEnd=code.indexOf('\n        sum=',tailDotStart);
  if(tailStart<0||tailDotStart<0||tailDotEnd<0)throw Error('Missing tail dot anchor');
  code=code.slice(0,tailDotStart)+'v128_t dots=wasm_i32x4_relaxed_dot_i8x16_i7x16_add(bh,ah,wasm_i32x4_relaxed_dot_i8x16_i7x16_add(bl,al,wasm_i32x4_splat(0)));'+code.slice(tailDotEnd);
  replace('static bool poc_compact_matmul',`struct poc_weight_cache_entry { const void *key; size_t bytes; struct poc_byte_block *data; struct poc_weight_cache_entry *next; };
static struct poc_weight_cache_entry *poc_weight_cache=NULL;
static size_t poc_weight_cache_bytes=0;
static struct poc_byte_block *poc_weight_active=NULL;
static bool poc_weight_fill=true;
size_t poc_compact_cache_size(void) {return poc_weight_cache_bytes;}
void poc_compact_cache_clear(void) {
    while(poc_weight_cache){struct poc_weight_cache_entry *next=poc_weight_cache->next;free(poc_weight_cache->data);free(poc_weight_cache);poc_weight_cache=next;}
    poc_weight_cache_bytes=0;poc_weight_active=NULL;
}
static bool poc_compact_matmul`);
  replace('for(int side=0;side<2;side++) {',`if(p->ith==0) {
        poc_weight_active=NULL;poc_weight_fill=true;
        if(a->buffer && ggml_is_contiguous(a) && ggml_backend_buffer_get_usage(a->buffer)==GGML_BACKEND_BUFFER_USAGE_WEIGHTS) {
            size_t bytes=ggml_nelements(a)/32*sizeof(struct poc_byte_block);
            struct poc_weight_cache_entry *entry=poc_weight_cache;
            while(entry && (entry->key!=a->data || entry->bytes!=bytes))entry=entry->next;
            if(entry){poc_weight_active=entry->data;poc_weight_fill=false;}
            else if(poc_weight_cache_bytes+bytes<=128*1024*1024) {
                entry=malloc(sizeof(*entry));
                struct poc_byte_block *data=malloc(bytes);
                if(entry && data){entry->key=a->data;entry->bytes=bytes;entry->data=data;entry->next=poc_weight_cache;poc_weight_cache=entry;poc_weight_cache_bytes+=bytes;poc_weight_active=data;}
                else {free(entry);free(data);}
            }
        }
    }
    ggml_barrier(p->threadpool);
    if(poc_weight_active)pa=poc_weight_active;
    for(int side=poc_weight_fill?0:1;side<2;side++) {`);
  return code;
}
