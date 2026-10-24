#include <vector>
#include <algorithm>
// Average adjacent time frames independently in each mel frequency bin.
// No PCM playback-rate change or reference timing enters this transform.
static int poc_compress_mel(std::vector<float>& data, int& frames, int& original_frames, int bins, int factor) {
    if (factor < 1 || factor > 4 || frames <= 0 || bins <= 0 || data.size() != size_t(frames)*bins) return -1;
    if (factor == 1) return 0;
    const int output_frames = (frames + factor - 1)/factor;
    std::vector<float> output(size_t(output_frames)*bins);
    for (int bin=0; bin<bins; ++bin) for (int t=0; t<output_frames; ++t) {
        float sum=0; const int end=std::min(frames,(t+1)*factor);
        for (int j=t*factor; j<end; ++j) sum+=data[size_t(bin)*frames+j];
        output[size_t(bin)*output_frames+t]=sum/(end-t*factor);
    }
    data.swap(output);frames=output_frames;original_frames=(original_frames+factor-1)/factor;
    return 0;
}
