// Reduce only the alignment grid, retaining the original song/encoder clock.
export async function coarseAttentionPath(findPath,qks,tokens,frames,stride=1){
 if(stride===1)return findPath(qks,tokens,0,frames);
 if(!Number.isInteger(stride)||stride<1)throw Error('Invalid attention stride');
 const coarseFrames=Math.ceil(frames/stride);
 const coarse=qks.map(q=>{
  const heads=Number(q.dimensions[0]),sourceFrames=Number(q.dimensions[2]);
  const data=new Float32Array(heads*coarseFrames);
  for(let h=0;h<heads;h++)for(let t=0;t<coarseFrames;t++){
   const end=Math.min(frames,(t+1)*stride);let sum=0;
   for(let i=t*stride;i<end;i++)sum+=q.data[h*sourceFrames+i];
   data[h*coarseFrames+t]=sum/(end-t*stride);
  }
  return {dimensions:[BigInt(heads),1n,BigInt(coarseFrames)],data};
 });
 return (await findPath(coarse,tokens,0,coarseFrames)).map(p=>({source:p.source,dest:Math.min(frames-1,p.dest*stride)}));
}
