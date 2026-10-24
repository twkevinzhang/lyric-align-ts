#ifndef POC_QTILE_ROWS
#define POC_QTILE_ROWS 2
#endif
#include "vec.h"
#include "quants.h"
#include "ggml-quants.h"
#include <cstdio>
#include <cstring>
#include <initializer_list>
#include <cmath>
#include <vector>
#include "local-attention.h"
static bool testLocalAttention(){
 for(int blocks:{1,2,4}){
  ggml_init_params ip={2*1024*1024,nullptr,false};auto *ctx=ggml_init(ip);
  const int state=4,heads=2,frames=8,dim=2,width=frames/blocks;
  auto *q=ggml_new_tensor_2d(ctx,GGML_TYPE_F32,state,frames),*k=ggml_new_tensor_2d(ctx,GGML_TYPE_F32,state,frames),*v=ggml_new_tensor_2d(ctx,GGML_TYPE_F32,state,frames);
  for(int i=0;i<state*frames;i++){((float*)q->data)[i]=(i%7-3)*.2f;((float*)k->data)[i]=(i%11-5)*.1f;((float*)v->data)[i]=i*.03f;}
  auto *out=poc_local_attention(ctx,q,k,v,heads,frames,blocks,GGML_TYPE_F32,.7f);
  auto *gf=ggml_new_graph(ctx);ggml_build_forward_expand(gf,out);
  if(ggml_graph_compute_with_ctx(ctx,gf,1)!=GGML_STATUS_SUCCESS)return false;
  for(int t=0;t<frames;t++)for(int h=0;h<heads;h++)for(int d=0;d<dim;d++){
   double sum=0,z=0;
   for(int j=t/width*width;j<(t/width+1)*width;j++){
    double dot=0;for(int a=0;a<dim;a++)dot+=((float*)q->data)[t*state+h*dim+a]*((float*)k->data)[j*state+h*dim+a];
    double p=exp(dot*.7f);sum+=p*((float*)v->data)[j*state+h*dim+d];z+=p;
   }
   if(std::fabs(((float*)out->data)[t*state+h*dim+d]-sum/z)>1e-5)return false;
  }
  ggml_free(ctx);
 }
 return true;
}
#ifdef POC_WEIGHT_CACHE_TEST
#include "ggml-backend.h"
extern "C" void poc_compact_cache_clear();
extern "C" size_t poc_compact_cache_size();
extern "C" int poc_compact_cache_add(const struct ggml_tensor*);
extern "C" int poc_group_cache_add(const struct ggml_tensor*);
extern "C" int poc_set_attention_quant(int);
static bool testVectorActivations(){
 if(poc_set_vector_activations(1))return false;
 for(int base=0;base<82000;base+=4){float x[4],out[4];for(int j=0;j<4;j++)x[j]=-(base+j)*.001f;wasm_v128_store(out,poc_exp_negative(wasm_v128_load(x)));for(int j=0;j<4;j++){const float expected=expf(x[j]);if(std::fabs(out[j]-expected)>2e-6f*expected+2e-35f)return false;}}
 for(int n:{1,3,4,65,1537}){
  std::vector<float>x(n),y(n);for(int i=0;i<n;i++)x[i]=sinf(i*.13f)*12;
  ggml_vec_gelu_f32(n,y.data(),x.data());for(int i=0;i<n;i++){const float expected=ggml_gelu_f32(x[i]);if(std::fabs(expected-y[i])>2e-6f*(1+std::fabs(expected)))return false;}
  for(int i=1;i<n;i++)if(i%17==0)x[i]=-INFINITY;
  float max=-INFINITY;for(float v:x)max=std::fmax(max,v);
  const double sum=ggml_vec_soft_max_f32(n,y.data(),x.data(),max);double expectedSum=0;
  for(int i=0;i<n;i++){const float expected=expf(x[i]-max);expectedSum+=expected;if(std::fabs(expected-y[i])>2e-6f*expected+2e-35f)return false;}
  if(std::fabs(sum-expectedSum)>1e-5*expectedSum)return false;
 }
 return poc_set_vector_activations(0)==0;
}
static bool testQuantAttention(int mode=2){
 if(poc_set_attention_quant(mode))return false;
 for(const int k:{64,65,1500})for(const int cols:{7,65}){
  const int rows=5,batches=2;
  ggml_init_params ip={4*1024*1024,nullptr,false};auto *ctx=ggml_init(ip);
  auto *a=ggml_new_tensor_3d(ctx,GGML_TYPE_F16,k,rows,1),*b=ggml_new_tensor_3d(ctx,GGML_TYPE_F32,k,cols,batches);
  for(int i=0;i<k*rows;i++)((ggml_fp16_t*)a->data)[i]=ggml_fp32_to_fp16(((i*17)%107-53)*.013f);
  for(int i=0;i<k*cols*batches;i++)((float*)b->data)[i]=((i*23)%113-56)*.017f;
  const int width=k;
  auto quant=[width](std::vector<float> x,float limit){for(size_t block=0;block<x.size();block+=width){float peak=0;for(size_t i=block;i<x.size()&&i<block+width;i++)peak=std::fmax(peak,std::fabs(x[i]));float d=peak/limit;for(size_t i=block;i<x.size()&&i<block+width;i++)x[i]=d?std::round(x[i]*(1/d))*d:0;}return x;};
  auto *c=ggml_mul_mat(ctx,a,b);auto *gf=ggml_new_graph(ctx);ggml_build_forward_expand(gf,c);
  for(const int threads:{1,6}){
   if(ggml_graph_compute_with_ctx(ctx,gf,threads)!=GGML_STATUS_SUCCESS)return false;
   for(int col=0;col<cols*batches;col++)for(int row=0;row<rows;row++){
    std::vector<float>x(k),y(k);for(int j=0;j<k;j++){x[j]=ggml_fp16_to_fp32(((ggml_fp16_t*)a->data)[row*k+j]);y[j]=((float*)b->data)[col*k+j];}
    const auto qx=quant(x,63),qy=quant(y,127);double expected=0,original=0,bound=0;
    for(int j=0;j<k;j++){expected+=double(qx[j])*qy[j];original+=double(x[j])*y[j];bound+=std::fabs(double(x[j]-qx[j])*y[j])+std::fabs(double(qx[j])*(y[j]-qy[j]));}
    const float actual=((float*)c->data)[col*rows+row];const double tolerance=.001+.001*std::fabs(expected);
    if(!std::isfinite(actual)||std::fabs(actual-expected)>tolerance||std::fabs(actual-original)>bound+tolerance){printf("quant attention mismatch k%d col%d row%d: %.8f vs %.8f\n",k,col,row,actual,expected);return false;}
   }
  }
  ggml_free(ctx);
 }
 return poc_set_attention_quant(0)==0;
}
static bool testWeightCache(int mode=0,int n=64){
 const int rows=17;
 ggml_init_params ip={4*1024*1024,nullptr,false};auto *ctx=ggml_init(ip);
 auto *a=ggml_new_tensor_2d(ctx,GGML_TYPE_Q5_1,n,rows);
 auto *b=ggml_new_tensor_2d(ctx,GGML_TYPE_F32,n,65);
 auto buffer=ggml_backend_buft_alloc_buffer(ggml_backend_cpu_buffer_type(),ggml_nbytes(a));
 a->data=nullptr; // Replace the unused arena allocation with a marked weight buffer.
 ggml_backend_tensor_alloc(buffer,a,ggml_backend_buffer_get_base(buffer));
 ggml_backend_buffer_set_usage(buffer,GGML_BACKEND_BUFFER_USAGE_WEIGHTS);
 auto *c=ggml_mul_mat(ctx,a,b);auto *gf=ggml_new_graph(ctx);ggml_build_forward_expand(gf,c);
 std::vector<float> values(n);std::vector<block_q8_1> quantized(n/32);
 for(int generation=0;generation<2;generation++){
  poc_compact_cache_clear();if(poc_compact_cache_size()!=0)return false;
  for(int row=0;row<rows;row++){
   for(int j=0;j<n;j++)values[j]=((row*19+j*7+generation*31)%101-50)*0.0317f;
   quantize_row_q5_1(values.data(),(char*)a->data+row*a->nb[1],n);
  }
  if((mode==2?poc_group_cache_add(a):poc_compact_cache_add(a))!=1)return false;
  size_t cacheBytes=0;
  for(int pass=0;pass<3;pass++){
   for(int j=0;j<n*65;j++)((float*)b->data)[j]=((j*13+pass*7)%53-26)*0.071f;
   if(ggml_graph_compute_with_ctx(ctx,gf,pass==0?1:pass==1?6:8)!=GGML_STATUS_SUCCESS)return false;
   for(int col=0;col<65;col++){
    quantize_row_q8_1((float*)b->data+col*n,quantized.data(),n);
    for(int row=0;row<rows;row++){
     float expected;
     if(mode==2){
      dequantize_row_q5_1((block_q5_1*)((char*)a->data+row*a->nb[1]),values.data(),n);double sum=0;
      for(int block=0;block<n;block+=n){float peakA=0,peakB=0;for(int j=block;j<n&&j<block+n;j++){peakA=std::fmax(peakA,std::fabs(values[j]));peakB=std::fmax(peakB,std::fabs(((float*)b->data)[col*n+j]));}const float da=peakA/63,db=peakB/127;
       for(int j=block;j<n&&j<block+n;j++){float x=values[j],y=((float*)b->data)[col*n+j];if(mode==2){x=da?std::round(x*(1/da))*da:0;y=db?std::round(y*(1/db))*db:0;}sum+=double(x)*y;}
      }expected=sum;
     }
     else ggml_vec_dot_q5_1_q8_1(n,&expected,0,(char*)a->data+row*a->nb[1],0,quantized.data(),0,1);
     if(std::fabs(expected-((float*)c->data)[col*rows+row])>0.001+0.001*std::fabs(expected))return false;
    }
   }
   if(!poc_compact_cache_size()||(pass&&cacheBytes!=poc_compact_cache_size()))return false;
   cacheBytes=poc_compact_cache_size();
  }
 }
 poc_compact_cache_clear();ggml_backend_buffer_free(buffer);ggml_free(ctx);return poc_compact_cache_size()==0;
}
#endif
#if POC_TEST_MAX_THREADS >= 12
static constexpr int testThreadCounts[]={1,6,8,12};
#else
static constexpr int testThreadCounts[]={1,6};
#endif
static double largestF16Error=0;
#ifdef POC_QTILE_BYTE
extern "C" void poc_q5_tile(int,float *,const void *,size_t,const void *,size_t);
#endif
#if defined(POC_QUANT_FMA) || defined(POC_QUANT_DOT)
extern "C" void poc_q5_unfused_reference(int,float *,size_t,const void *,size_t,const void *,size_t,int);
#endif
#ifdef POC_QUANT_FMA
static double largestQ5Error=0;
#endif
static bool f16Matches(float expected,float actual) {
 largestF16Error=std::fmax(largestF16Error,std::fabs(double(expected)-actual));
#ifdef POC_FLOAT_REORDER
 // Same atol/rtol as the pinned PoC lock; only execution summation order changes.
 return std::isfinite(expected)&&std::isfinite(actual)&&std::fabs(double(expected)-actual)<=0.001+0.001*std::fabs(expected);
#else
 return memcmp(&expected,&actual,4)==0;
#endif
}
int main(){
 ggml_cpu_init();
 if(!testLocalAttention()){puts("FAIL local attention head/block/time layout");return 21;}
 puts("PASS local attention versus independent per-head scalar softmax for 1/2/4 blocks");
#ifdef POC_WEIGHT_CACHE_TEST
 if(!testWeightCache()){puts("FAIL immutable weight cache reuse/reset");return 12;}
 puts("PASS immutable weight cache reuse, changing activations and model reset");
 for(int k:{64,384,1536})if(!testWeightCache(2,k)){puts("FAIL grouped integer model cache reference");return 15;}
 puts("PASS grouped Q7/Q8 model cache versus scalar reference, multiple groups and changing activations");
 if(!testQuantAttention()){puts("FAIL quantized attention reference/bound");return 13;}
 puts("PASS rowwise attention versus scalar Q7/Q8, bounded float error, partial blocks, odd edges and broadcast");
 if(!testVectorActivations()){puts("FAIL SIMD activation accuracy");return 17;}
 puts("PASS SIMD exp/GELU/softmax accuracy, masked infinities and odd tails");
#endif
#ifdef POC_QTILE_BYTE
 for(int q=0;q<32;q++)for(int v=-128;v<128;v++) {
  block_q5_1 x[POC_QTILE_ROWS]={};block_q8_1 y[2]={};float out[2*POC_QTILE_ROWS];
  for(int r=0;r<POC_QTILE_ROWS;r++) {
   x[r].d=ggml_fp32_to_fp16(1);x[r].m=ggml_fp32_to_fp16(0);
   memset(x[r].qh,q&16?255:0,4);memset(x[r].qs,(q&15)*17,16);
  }
  for(int r=0;r<2;r++) {
   y[r].d=ggml_fp32_to_fp16(1);y[r].s=ggml_fp32_to_fp16(32*v);memset(y[r].qs,v,32);
  }
  poc_q5_tile(32,out,x,sizeof(x[0]),y,sizeof(y[0]));
  for(float actual:out)if(actual!=32*q*v){puts("FAIL byte-dot value range");return 11;}
 }
 puts("PASS all 8192 Q5/Q8 value pairs in all tile outputs");
#endif
 ggml_fp16_t x[2][1537],y[1537];
 unsigned seed=12345;
 for(auto &row:x)for(auto &v:row){seed=seed*1664525+1013904223;v=ggml_fp32_to_fp16((int(seed>>16)-32768)/4096.f);}
 for(auto &v:y){seed=seed*1664525+1013904223;v=ggml_fp32_to_fp16((int(seed>>16)-32768)/4096.f);}
 for(int n=1;n<=1537;n++){
  float a[2],b[2];
  for(int j=0;j<2;j++)ggml_vec_dot_f16(n,&a[j],0,x[j],0,y,0,1);
  ggml_vec_dot_f16_unroll(n,sizeof(x[0]),b,x,y);
  if(memcmp(a,b,sizeof(a))){printf("FAIL n=%d\n",n);return 1;}
 }
 puts("PASS 1537 lengths, two rows bit-identical including SIMD tails and strided rows");
 for(int threads: testThreadCounts) for(int cols: {3,64,65}) for(int n: {1,31,32,33,64,1500}) {
  ggml_init_params ip={4*1024*1024,nullptr,false};
  auto *ctx=ggml_init(ip);
  auto *a=ggml_new_tensor_2d(ctx,GGML_TYPE_F16,n,17);
  auto *b=ggml_new_tensor_2d(ctx,GGML_TYPE_F32,n,cols);
  for(int j=0;j<17;j++)memcpy((ggml_fp16_t*)a->data+j*n,x[j%2],n*2);
  ggml_fp16_t rounded[1537];
  for(int j=0;j<cols*n;j++) {
   float value=ggml_fp16_to_fp32(y[j%n])+0.00013f;
   ((float*)b->data)[j]=value;
   rounded[j%n]=ggml_fp32_to_fp16(value);
  }
  auto *c=ggml_mul_mat(ctx,a,b);auto *gf=ggml_new_graph(ctx);ggml_build_forward_expand(gf,c);
  if(ggml_graph_compute_with_ctx(ctx,gf,threads)!=GGML_STATUS_SUCCESS)return 2;
  for(int col=0;col<cols;col++)for(int row=0;row<17;row++){
   float expected;ggml_vec_dot_f16(n,&expected,0,(ggml_fp16_t*)a->data+row*n,0,rounded,0,1);
   if(!f16Matches(expected,((float*)c->data)[col*17+row])){printf("FAIL graph n=%d row=%d col=%d\n",n,row,col);return 3;}
  }
  ggml_free(ctx);
 }
 puts("PASS actual F16 matmul graphs: odd rows, chunk boundary, tails, 3/64/65 columns, configured thread counts");
 for(int threads: testThreadCounts) for(int n: {32,64,768,3072}) for(int rows:{17,18,19}) {
  ggml_init_params ip={8*1024*1024,nullptr,false}; auto *ctx=ggml_init(ip);
  auto *a=ggml_new_tensor_2d(ctx,GGML_TYPE_Q5_1,n,rows);
  auto *b=ggml_new_tensor_2d(ctx,GGML_TYPE_F32,n,65);
  float values[3072]; block_q8_1 quantized[3072/32];
  for(int row=0;row<rows;row++) {
   for(int j=0;j<n;j++){seed=seed*1664525+1013904223;values[j]=(int(seed>>16)-32768)/4096.f;}
   quantize_row_q5_1(values,(char *)a->data+row*a->nb[1],n);
  }
  for(int j=0;j<n*65;j++){seed=seed*1664525+1013904223;((float *)b->data)[j]=(int(seed>>16)-32768)/8192.f;}
  auto *c=ggml_mul_mat(ctx,a,b);auto *gf=ggml_new_graph(ctx);ggml_build_forward_expand(gf,c);
  if(ggml_graph_compute_with_ctx(ctx,gf,threads)!=GGML_STATUS_SUCCESS)return 4;
  for(int col=0;col<65;col++) {
   quantize_row_q8_1((float *)b->data+col*n,quantized,n);
   for(int row=0;row<rows;row++) {
    float expected;float actual=((float *)c->data)[col*rows+row];
#ifdef POC_QUANT_FMA
    poc_q5_unfused_reference(n,&expected,0,(char *)a->data+row*a->nb[1],0,quantized,0,1);
    double error=std::fabs(double(expected)-actual);largestQ5Error=std::fmax(largestQ5Error,error);
    bool matches=std::isfinite(actual)&&error<=0.001+0.001*std::fabs(expected);
#else
#ifdef POC_QUANT_DOT
    poc_q5_unfused_reference(n,&expected,0,(char *)a->data+row*a->nb[1],0,quantized,0,1);
#else
    ggml_vec_dot_q5_1_q8_1(n,&expected,0,(char *)a->data+row*a->nb[1],0,quantized,0,1);
#endif
    #ifdef POC_QUANT_REORDER
    bool matches=std::isfinite(actual)&&std::fabs(double(expected)-actual)<=0.001+0.001*std::fabs(expected);
#else
    bool matches=memcmp(&expected,&actual,4)==0;
#endif
#endif
    if(!matches){printf("FAIL Q5 n=%d row=%d col=%d threads=%d\n",n,row,col,threads);return 5;}
   }
  }
  ggml_free(ctx);
 }
#ifdef POC_QUANT_FMA
 printf("PASS Q5_1 matrices versus original unfused dot at pinned tolerance; max error %.9g\n",largestQ5Error);
#else
#ifdef POC_QUANT_REORDER
 puts("PASS Q5_1 matrices versus original dot at pinned tolerance, configured thread counts");
#else
 puts("PASS Q5_1 actual matrices match original quantized dot bitwise, configured thread counts");
#endif
#endif
 for(int threads:testThreadCounts) {
  const int k=64;ggml_init_params ip={8*1024*1024,nullptr,false};auto *ctx=ggml_init(ip);
  auto *abase=ggml_new_tensor_4d(ctx,GGML_TYPE_Q5_1,k,18,2,1);
  auto *bbase=ggml_new_tensor_4d(ctx,GGML_TYPE_F32,k,66,4,2);
  float values[k];block_q8_1 quantized[k/32];
  for(int r=0;r<36;r++) {
   for(int j=0;j<k;j++)values[j]=((r*71+j*19)%101-50)*0.0317f;
   quantize_row_q5_1(values,(char *)abase->data+r*abase->nb[1],k);
  }
  for(int i=0;i<ggml_nelements(bbase);i++)((float *)bbase->data)[i]=(i%97-48)*0.071f;
  auto *a=ggml_view_4d(ctx,abase,k,17,2,1,abase->nb[1],abase->nb[2],abase->nb[3],0);
  auto *b=ggml_view_4d(ctx,bbase,k,65,4,2,bbase->nb[1],bbase->nb[2],bbase->nb[3],0);
  auto *c=ggml_mul_mat(ctx,a,b);auto *gf=ggml_new_graph(ctx);ggml_build_forward_expand(gf,c);
  if(ggml_graph_compute_with_ctx(ctx,gf,threads)!=GGML_STATUS_SUCCESS)return 9;
  for(int i3=0;i3<2;i3++)for(int i2=0;i2<4;i2++)for(int col=0;col<65;col++) {
   const float *bp=(const float *)((const char *)b->data+i3*b->nb[3]+i2*b->nb[2]+col*b->nb[1]);
   quantize_row_q8_1(bp,quantized,k);
   for(int row=0;row<17;row++) {
    float expected;const char *ap=(const char *)a->data+(i2/2)*a->nb[2]+row*a->nb[1];
    ggml_vec_dot_q5_1_q8_1(k,&expected,0,ap,0,quantized,0,1);
    float actual=*(const float *)((const char *)c->data+i3*c->nb[3]+i2*c->nb[2]+col*c->nb[1]+row*sizeof(float));
#ifdef POC_QUANT_REORDER
    if(!std::isfinite(actual)||std::fabs(double(expected)-actual)>0.001+0.001*std::fabs(expected)){puts("FAIL Q5 broadcast/view");return 10;}
#else
    if(memcmp(&expected,&actual,4)){puts("FAIL Q5 broadcast/view");return 10;}
#endif
   }
  }
  ggml_free(ctx);
 }
 puts("PASS Q5 broadcast, noncontiguous rows, odd output edges, configured thread counts");
 for(int threads:testThreadCounts) for(auto bt:{GGML_TYPE_F16,GGML_TYPE_F32}) {
  const int k=33;ggml_init_params ip={8*1024*1024,nullptr,false};auto *ctx=ggml_init(ip);
  auto *abase=ggml_new_tensor_4d(ctx,GGML_TYPE_F16,k,18,2,1);
  auto *bbase=ggml_new_tensor_4d(ctx,bt,k,66,4,2);
  auto *a=ggml_view_4d(ctx,abase,k,17,2,1,abase->nb[1],abase->nb[2],abase->nb[3],0);
  auto *b=ggml_view_4d(ctx,bbase,k,65,4,2,bbase->nb[1],bbase->nb[2],bbase->nb[3],0);
  for(int i=0;i<ggml_nelements(abase);i++)((ggml_fp16_t *)abase->data)[i]=ggml_fp32_to_fp16((i%97-48)*0.071f);
  for(int i=0;i<ggml_nelements(bbase);i++) {
   float value=(i%101-50)*0.0317f;
   if(bt==GGML_TYPE_F16)((ggml_fp16_t *)bbase->data)[i]=ggml_fp32_to_fp16(value);
   else ((float *)bbase->data)[i]=value;
  }
  auto *c=ggml_mul_mat(ctx,a,b);auto *gf=ggml_new_graph(ctx);ggml_build_forward_expand(gf,c);
  if(ggml_graph_compute_with_ctx(ctx,gf,threads)!=GGML_STATUS_SUCCESS)return 6;
  for(int i3=0;i3<2;i3++)for(int i2=0;i2<4;i2++)for(int col=0;col<65;col++) {
   const char *bp=(char *)b->data+i3*b->nb[3]+i2*b->nb[2]+col*b->nb[1];ggml_fp16_t half[k];
   for(int i=0;i<k;i++)half[i]=bt==GGML_TYPE_F16?((const ggml_fp16_t *)bp)[i]:ggml_fp32_to_fp16(((const float *)bp)[i]);
   for(int row=0;row<17;row++) {
    auto *ap=(ggml_fp16_t *)((char *)a->data+(i2/2)*a->nb[2]+row*a->nb[1]);
    float expected;ggml_vec_dot_f16(k,&expected,0,ap,0,half,0,1);
    auto *actual=(char *)c->data+i3*c->nb[3]+i2*c->nb[2]+col*c->nb[1]+row*c->nb[0];
    if(!f16Matches(expected,*(float *)actual)){puts("FAIL broadcast/noncontiguous");return 7;}
   }
  }
  ggml_free(ctx);
 }
 puts("PASS broadcast across two batch axes and noncontiguous F16/F32 views, configured thread counts");
#ifdef POC_QUANT_DOT
 for(int q=0;q<32;q++)for(int v=-128;v<128;v++) {
  block_q5_1 x={};block_q8_1 y={};x.d=ggml_fp32_to_fp16(1);y.d=ggml_fp32_to_fp16(1);y.s=ggml_fp32_to_fp16(v*32.f);
  memset(x.qs,(q&15)|((q&15)<<4),sizeof(x.qs));memset(x.qh,q>=16?255:0,sizeof(x.qh));memset(y.qs,(unsigned char)v,sizeof(y.qs));
  float a,b;poc_q5_unfused_reference(32,&a,0,&x,0,&y,0,1);ggml_vec_dot_q5_1_q8_1(32,&b,0,&x,0,&y,0,1);
  if(memcmp(&a,&b,4)){printf("FAIL byte dot q=%d v=%d\n",q,v);return 8;}
 }
 puts("PASS all 8192 Q5/Q8 scalar-value combinations versus original dot bitwise");
#endif
 printf("Maximum F16 graph absolute error: %.9g\n",largestF16Error);
#ifdef POC_FLOAT_REORDER
 puts("F16 checks use pinned atol=rtol=0.001");
#endif
}
