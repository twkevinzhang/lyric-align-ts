#pragma once
struct PocMelRange { int begin,end; };
static inline PocMelRange poc_mel_range(const float *filter,int count){
    int first=count,last=-1;
    for(int i=0;i<count;i++)if(filter[i]!=0){if(first==count)first=i;last=i;}
    const int full=count/4*4;
    return {first<count?first/4*4:0,last<0?0:((last/4+1)*4<full?(last/4+1)*4:full)};
}
static inline double poc_mel_dot(const float *power,const float *filter,int count,PocMelRange range){
    double sum=0;
    for(int k=range.begin;k<range.end;k+=4)sum+=power[k]*filter[k]+power[k+1]*filter[k+1]+power[k+2]*filter[k+2]+power[k+3]*filter[k+3];
    for(int k=count/4*4;k<count;k++)sum+=power[k]*filter[k];
    return sum;
}
