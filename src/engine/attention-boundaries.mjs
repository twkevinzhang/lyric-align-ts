// Only refine the first token of the song. DTW ownership and all ends stay intact.
// Minority heads may attend to frame zero; use median contiguous peak support.
export function introBoundaryFrame(q,tokenEnd,frames,{minFrames=24,padding=8,peakFraction=.2}={}){
 if(!q||tokenEnd<minFrames)return 0;
 const [heads,,width]=q.dimensions.map(Number);
 const right=Math.min(frames,width,tokenEnd+padding),starts=[],support=[];
 if(!heads||right<=0)return 0;
 for(let h=0;h<heads;h++){
  let peak=0,min=Infinity;
  for(let t=0;t<right;t++){const value=q.data[h*width+t];min=Math.min(min,value);if(value>q.data[h*width+peak])peak=t;}
  const max=q.data[h*width+peak];
  if(!Number.isFinite(max)||max-min<1e-6){starts.push(0);continue;}
  const cutoff=max+Math.log(peakFraction);let start=peak;
  while(start>0&&q.data[h*width+start-1]>=cutoff)start--;
  let end=peak+1;while(end<right&&q.data[h*width+end]>=cutoff)end++;
  if(start<tokenEnd)support.push({start,end:Math.min(tokenEnd,end)});
  starts.push(Math.min(tokenEnd-1,start));
 }
 starts.sort((a,b)=>a-b);
 const candidate=(starts[Math.floor((heads-1)/2)]+starts[Math.floor(heads/2)])/2;
 // Clipping a peak is not evidence. Require a majority of heads to have
 // support inside the assigned token, and observed support at the result.
 if(support.length<=heads/2||!support.some(s=>candidate>=s.start&&candidate<s.end))return 0;
 return candidate;
}
