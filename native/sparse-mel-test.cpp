#include "sparse-mel.h"
#include <vector>
#include <initializer_list>
#include <cstring>
#include <cstdio>
int main(){
 for(int n:{1,3,4,5,200,201,202})for(int pattern=0;pattern<100;pattern++){
  std::vector<float>x(n),filter(n,0);
  for(int i=0;i<n;i++){x[i]=((i*17+pattern*11)%101)*.01f;if(pattern && (i+pattern*7)%n<pattern%23+1)filter[i]=((i*19+pattern*3)%61-30)*.003f;}
  double expected=0;int k=0;
  for(;k<n-3;k+=4)expected+=x[k]*filter[k]+x[k+1]*filter[k+1]+x[k+2]*filter[k+2]+x[k+3]*filter[k+3];
  for(;k<n;k++)expected+=x[k]*filter[k];
  const double actual=poc_mel_dot(x.data(),filter.data(),n,poc_mel_range(filter.data(),n));
  if(std::memcmp(&expected,&actual,sizeof(double))){printf("FAIL sparse mel n%d case%d: %.17g vs %.17g\n",n,pattern,actual,expected);return 1;}
 }
 puts("PASS sparse mel sums bit-identical to dense original grouping, empty bands and odd tails");
}
