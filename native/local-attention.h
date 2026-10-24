#pragma once
#include "ggml.h"
// Preserve every encoder time position. Only attention connectivity is local;
// blocks=1 is the original full-context operation with an explicit batch axis.
static inline ggml_tensor *poc_local_attention(ggml_context *ctx,ggml_tensor *q,ggml_tensor *k,ggml_tensor *v,int heads,int frames,int blocks,ggml_type type,float scale){
 const int state=q->ne[0],dim=state/heads,width=frames/blocks;
 GGML_ASSERT(state%heads==0&&frames%blocks==0);
 auto *Q=ggml_permute(ctx,ggml_reshape_4d(ctx,q,dim,heads,width,blocks),0,2,1,3);
 auto *K=ggml_permute(ctx,ggml_cast(ctx,ggml_reshape_4d(ctx,k,dim,heads,width,blocks),type),0,2,1,3);
 auto *P=ggml_soft_max_ext(ctx,ggml_mul_mat(ctx,K,Q),nullptr,scale,0.0f);
 auto *V=ggml_cast(ctx,ggml_permute(ctx,ggml_reshape_4d(ctx,v,dim,heads,width,blocks),1,2,0,3),type);
 auto *out=ggml_permute(ctx,ggml_mul_mat(ctx,V,P),0,2,1,3);
 return ggml_cont_2d(ctx,out,state,frames);
}
