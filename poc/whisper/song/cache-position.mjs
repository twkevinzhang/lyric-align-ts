// The upstream caller supplies decodedTokens.length, which includes the
// just-selected token. whisper.cpp expects the number already in the KV cache.
export function cachePosition(past,policy){
  if(!['upstream','contiguous'].includes(policy))throw Error('Unknown KV position policy');
  if(!Number.isInteger(past)||past<0)throw Error('Invalid KV position');
  return policy==='contiguous'&&past>0?past-1:past;
}
