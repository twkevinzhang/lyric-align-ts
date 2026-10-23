// Keep only the acoustic prefix before the overlap boundary. Reference times
// are neither accepted nor consulted; unfinished text remains for the next part.
export function trimAttentionPrefix(decoded,path,initialCount,coreFrames,timestampStart,endOfText){
  const tokens=decoded.decodedTokens.slice(initialCount);
  const starts=new Map();for(const point of path)if(!starts.has(point.source))starts.set(point.source,point.dest);
  let keep=0;
  while(keep<tokens.length&&tokens[keep]<endOfText&&(starts.get(keep)??Infinity)<coreFrames)keep++;
  return {
    ...decoded,
    decodedTokens:[...decoded.decodedTokens.slice(0,initialCount+keep),timestampStart+coreFrames],
    decodedTokensConfidence:[...decoded.decodedTokensConfidence.slice(0,initialCount+keep),1],
    decodedTokensCrossAttentionQKs:Array(initialCount+keep+1).fill(undefined),
    alignmentPath:[...path.filter(p=>p.source<keep&&p.dest<coreFrames),{source:keep,dest:coreFrames-1}],
    alignmentFrames:coreFrames,
    deferredTextCount:tokens.filter(t=>t<endOfText).length-keep,
  };
}
export function lookaheadBudget(totalTokens,totalSamples,partDuration,remaining,isFinal,limit,ratio=1.5){
  if(!Number.isFinite(ratio)||ratio<1||ratio>2)throw Error('Invalid lookahead ratio');
  const estimated=Math.ceil(totalTokens/(totalSamples/16000)*partDuration*ratio)+16;
  return Math.max(1,Math.min(limit,isFinal?remaining+1:estimated));
}
