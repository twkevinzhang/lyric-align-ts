static bool poc_kernel_enabled=false;
static int64_t poc_kernel_times[11];
void poc_kernel_profile_reset(void){memset(poc_kernel_times,0,sizeof(poc_kernel_times));poc_kernel_enabled=true;}
double poc_kernel_profile_ms(int category){return category>=0 && category<11?poc_kernel_times[category]/1000.0:0;}
static int poc_kernel_category(const struct ggml_tensor *node){
    if(node->op==GGML_OP_MUL_MAT){
        const struct ggml_tensor *a=node->src[0];
        if(a->type==GGML_TYPE_Q5_1)return 0;
        if(a->type==GGML_TYPE_F16)return poc_model_weight(a)?2:1;
        return 3;
    }
    if(node->op==GGML_OP_SOFT_MAX)return 4;
    if(node->op==GGML_OP_NORM || node->op==GGML_OP_RMS_NORM)return 5;
    if(node->op==GGML_OP_UNARY)return 6;
    if(node->op==GGML_OP_CPY || node->op==GGML_OP_CONT || node->op==GGML_OP_DUP)return 7;
    if(node->op==GGML_OP_ADD || node->op==GGML_OP_MUL)return 8;
    if(node->op==GGML_OP_IM2COL)return 9;
    return 10;
}
