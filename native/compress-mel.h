#include <vector>
#include <algorithm>
#include <cmath>
// Average adjacent time frames independently in each mel frequency bin.
// No PCM playback-rate change or reference timing enters this transform.
static int poc_compress_mel(std::vector<float>& data, int& frames, int& original_frames, int bins, double factor) {
    if (!std::isfinite(factor) || factor < 1 || factor > 4 || frames <= 0 || bins <= 0 || data.size() != size_t(frames)*bins) return -1;
    if (factor == 1) return 0;
    const int output_frames = int(std::ceil(frames/factor));
    std::vector<float> output(size_t(output_frames)*bins);
    for (int bin=0; bin<bins; ++bin) for (int t=0; t<output_frames; ++t) {
        float sum=0; const double start=t*factor,end=std::min(double(frames),(t+1)*factor);
        for (int j=int(start); j<int(std::ceil(end)); ++j) sum+=data[size_t(bin)*frames+j]*float(std::min(end,double(j+1))-std::max(start,double(j)));
        output[size_t(bin)*output_frames+t]=float(sum/(end-start));
    }
    data.swap(output);frames=output_frames;original_frames=int(std::ceil(original_frames/factor));
    return 0;
}
