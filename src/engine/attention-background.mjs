// Remove the per-head temporal component shared by all lyric queries before
// temporal softmax. This is a contrast between tokens, not a voice detector.
// A single token has no independent background estimate, so leave it unchanged.
export function removeAttentionBackground(qks,frames){
 if(qks.length<2)return qks;
 const heads=Number(qks[0]?.dimensions[0]);
 if(!Number.isInteger(frames)||frames<1||!heads)throw Error('Invalid attention background shape');
 const mean=new Float64Array(heads*frames);
 for(const q of qks){
  const width=Number(q?.dimensions[2]);
  if(Number(q?.dimensions[0])!==heads||Number(q?.dimensions[1])!==1||width<frames||q.data.length!==heads*width)throw Error('Inconsistent attention background shape');
  for(let h=0;h<heads;h++)for(let t=0;t<frames;t++)mean[h*frames+t]+=q.data[h*width+t]/qks.length;
 }
 return qks.map(q=>{
  const width=Number(q.dimensions[2]),data=new Float32Array(heads*frames);
  for(let h=0;h<heads;h++)for(let t=0;t<frames;t++)data[h*frames+t]=q.data[h*width+t]-mean[h*frames+t];
  return {dimensions:[BigInt(heads),1n,BigInt(frames)],data};
 });
}

// Softmax of the mean head logits equals the normalized geometric mean of
// their temporal probabilities. A peak must be supported across heads rather
// than winning through one highly concentrated head in an arithmetic mixture.
export function geometricAttentionHeads(qks,frames){
 return qks.map(q=>{
  const [heads,,width]=q.dimensions.map(Number),data=new Float32Array(frames);
  if(!heads||width<frames||q.data.length!==heads*width)throw Error('Invalid attention head shape');
  for(let t=0;t<frames;t++){
   let sum=0;for(let h=0;h<heads;h++)sum+=q.data[h*width+t];data[t]=sum/heads;
  }
  return {dimensions:[1n,1n,BigInt(frames)],data};
 });
}
