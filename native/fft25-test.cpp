#include "fft25.h"
#include <cmath>
#include <cstdio>
#include <initializer_list>
static float cs[400],sn[400];
static void fft(float *in,int n,float *out){
    if(n==1){out[0]=in[0];out[1]=0;return;}
    if(n==25){poc_fft25(in,out,cs,sn);return;}
    const int half=n/2;
    float *even=in+n,*a=out+2*n,*b=a+n;
    for(int j=0;j<half;j++)even[j]=in[j*2];fft(even,half,a);
    for(int j=0;j<half;j++)even[j]=in[j*2+1];fft(even,half,b);
    for(int k=0;k<half;k++){const float c=cs[k*(400/n)],s=-sn[k*(400/n)];const float r=c*b[k*2]-s*b[k*2+1],i=c*b[k*2+1]+s*b[k*2];out[k*2]=a[k*2]+r;out[k*2+1]=a[k*2+1]+i;out[(k+half)*2]=a[k*2]-r;out[(k+half)*2+1]=a[k*2+1]-i;}
}
int main(){
    const double pi=acos(-1);for(int j=0;j<400;j++){cs[j]=cosf(2*pi*j/400);sn[j]=sinf(2*pi*j/400);}
    double maxError=0;
    for(int n:{25,400})for(int mode=0;mode<5;mode++){
        float in[800]={0},out[3200]={0},original[400];
        for(int j=0;j<n;j++)original[j]=in[j]=mode==0?(j==0):mode==1?(j==n-1):mode==2?1:mode==3?sinf(j*.137f):((j*73)%251-125)/125.f;
        fft(in,n,out);
        for(int k=0;k<n;k++){
            double re=0,im=0;for(int j=0;j<n;j++){re+=original[j]*cos(2*pi*k*j/n);im-=original[j]*sin(2*pi*k*j/n);}
            for(int component=0;component<2;component++){const double expected=component?im:re,error=fabs(out[k*2+component]-expected);maxError=fmax(maxError,error);if(error>1e-4+1e-5*fabs(expected)){printf("FAIL FFT n%d mode%d bin%d error %.9g\n",n,mode,k,error);return 1;}}
        }
    }
    printf("PASS radix-five FFT versus independent double DFT, 25/400 points, impulses/DC/sine/mixed: max error %.9g\n",maxError);
}
