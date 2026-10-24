#pragma once
// Factor the real 25-point DFT into five 5-point transforms. The 400-entry
// trigonometric table is the same immutable table used by Whisper's FFT.
static inline void poc_fft25(const float *in,float *out,const float *cosine,const float *sine){
    float re[5][5],im[5][5];
    for(int r=0;r<5;r++)for(int k=0;k<5;k++){
        float x=0,y=0;
        for(int j=0;j<5;j++){const int index=(k*j%5)*80;x+=in[r+j*5]*cosine[index];y-=in[r+j*5]*sine[index];}
        re[r][k]=x;im[r][k]=y;
    }
    for(int k=0;k<25;k++){
        float x=0,y=0;
        for(int r=0;r<5;r++){const int index=(k*r%25)*16;const float c=cosine[index],s=sine[index];x+=re[r][k%5]*c+im[r][k%5]*s;y+=im[r][k%5]*c-re[r][k%5]*s;}
        out[k*2]=x;out[k*2+1]=y;
    }
}
