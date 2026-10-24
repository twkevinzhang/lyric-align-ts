// Teacher forcing: supplied text is fixed. Default evidence is the preceding
// input; an explicit research option instead measures the supplied token itself.
// No reference times or precomputed song results enter this decoder.
export async function decodeAllKnownTokens(context,initial,remaining,eot,limit,batchSize,currentTokenAttention=false,prompt=[],evidence=false){
 if(remaining.length<=limit)return decodeKnownTokens(context,initial,remaining,eot,limit,batchSize,currentTokenAttention,prompt,evidence);
 // Each chunk resets text KV positions; all chunks attend to the same encoded
 // audio. Concatenate their actual attention for one monotonic alignment path.
 let result;
 for(let offset=0;offset<remaining.length;offset+=limit){
  const part=await decodeKnownTokens(context,initial,remaining.slice(offset,offset+limit),eot,limit,batchSize,currentTokenAttention,prompt,evidence);
  if(!result)result=part;
  else for(const field of ['decodedTokens','decodedTokensConfidence','decodedTokensCrossAttentionQKs','decodedTokenLogOdds'])result[field].push(...part[field].slice(initial.length));
 }
 return result;
}
export async function decodeKnownTokens(context,initial,remaining,eot,limit,batchSize,currentTokenAttention=false,prompt=[],evidence=false){
 if(evidence&&currentTokenAttention)throw Error('Token evidence requires prediction-input attention');
 const predicted=remaining.slice(0,limit);
 if(predicted.length<limit)predicted.push(eot);
 const inputs=[...prompt,...initial,...(currentTokenAttention?predicted:predicted.slice(0,-1))];
 const attention=Array(initial.length).fill(undefined);
 const logOdds=Array(initial.length).fill(undefined);
 for(let position=0;position<inputs.length;position+=batchSize){
  const batch=inputs.slice(position,position+batchSize);
  await context.decodeTokens(batch,position===0?0:position+1);
  const qk=await context.getCrossAttentionQKs();
  const [heads,count,frames]=qk.dimensions.map(Number);
  if(count!==batch.length)throw Error('Guided attention batch mismatch');
  for(let row=0;row<count;row++){
   if(position+row<prompt.length+initial.length-(currentTokenAttention?0:1))continue;
   const target=predicted[position+row-prompt.length-initial.length+1];
   logOdds.push(evidence?context.getTokenLogOdds(row,count,target,eot):undefined);
   const data=new Float32Array(heads*frames);
   for(let head=0;head<heads;head++)data.set(qk.data.subarray((head*count+row)*frames,(head*count+row+1)*frames),head*frames);
   attention.push({dimensions:[BigInt(heads),1n,BigInt(frames)],data});
  }
 }
 const decodedTokens=[...initial,...predicted];
 return {decodedTokens,decodedTokensConfidence:Array(decodedTokens.length).fill(1),decodedTokensCrossAttentionQKs:attention,decodedTokenLogOdds:logOdds,decodedTokensDecodingTime:[],decodedTokensInferenceTime:[],decodedTokensOverheadTime:[]};
}
