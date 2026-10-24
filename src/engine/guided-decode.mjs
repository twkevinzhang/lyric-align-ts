// Teacher forcing: supplied text is fixed; each token uses the preceding input's attention.
// No reference times or precomputed song results enter this decoder.
export async function decodeAllKnownTokens(context,initial,remaining,eot,limit,batchSize){
 if(remaining.length<=limit)return decodeKnownTokens(context,initial,remaining,eot,limit,batchSize);
 // Each chunk resets text KV positions; all chunks attend to the same encoded
 // audio. Concatenate their actual attention for one monotonic alignment path.
 let result;
 for(let offset=0;offset<remaining.length;offset+=limit){
  const part=await decodeKnownTokens(context,initial,remaining.slice(offset,offset+limit),eot,limit,batchSize);
  if(!result)result=part;
  else for(const field of ['decodedTokens','decodedTokensConfidence','decodedTokensCrossAttentionQKs'])result[field].push(...part[field].slice(initial.length));
 }
 return result;
}
export async function decodeKnownTokens(context,initial,remaining,eot,limit,batchSize){
 const predicted=remaining.slice(0,limit);
 if(predicted.length<limit)predicted.push(eot);
 const inputs=[...initial,...predicted.slice(0,-1)];
 const attention=Array(initial.length).fill(undefined);
 for(let position=0;position<inputs.length;position+=batchSize){
  const batch=inputs.slice(position,position+batchSize);
  await context.decodeTokens(batch,position===0?0:position+1);
  const qk=await context.getCrossAttentionQKs();
  const [heads,count,frames]=qk.dimensions.map(Number);
  if(count!==batch.length)throw Error('Guided attention batch mismatch');
  for(let row=0;row<count;row++){
   if(position+row<initial.length-1)continue;
   const data=new Float32Array(heads*frames);
   for(let head=0;head<heads;head++)data.set(qk.data.subarray((head*count+row)*frames,(head*count+row+1)*frames),head*frames);
   attention.push({dimensions:[BigInt(heads),1n,BigInt(frames)],data});
  }
 }
 const decodedTokens=[...initial,...predicted];
 return {decodedTokens,decodedTokensConfidence:Array(decodedTokens.length).fill(1),decodedTokensCrossAttentionQKs:attention,decodedTokensDecodingTime:[],decodedTokensInferenceTime:[],decodedTokensOverheadTime:[]};
}
