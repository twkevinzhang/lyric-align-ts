#include "compress-mel.h"
#include <cassert>
#include <cstdio>
int main(){
  std::vector<float> data={0,2,4,6,8,10,12,14,16,18};
  int frames=5,original=3;
  assert(poc_compress_mel(data,frames,original,2,2)==0);
  assert(frames==3&&original==2);
  assert((data==std::vector<float>{1,5,8,11,15,18}));
  const auto unchanged=data;
  assert(poc_compress_mel(data,frames,original,2,1)==0&&data==unchanged);
  assert(poc_compress_mel(data,frames,original,2,0)==-1);
  puts("PASS mel compression preserves frequency bins, partial frames and scale-one identity");
}
