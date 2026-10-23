// Draft only supplied lyrics. Reuse rows only while actual decoder inputs agree.
export function speculativeContext(evaluate,remainingTokens,eot,batchSize=8,tokenBudget=Infinity){
  let consumed=0,cache,latest,steps=0;
  return {
    async decodeTokens(tokens,past){
      if(++steps>tokenBudget)throw Error('Decode exceeded token budget');
      const position=past>0?past-1:0;
      consumed+=tokens.filter(t=>t<eot).length;
      const index=cache?position-cache.position:-1;
      if(tokens.length===1&&index>=0&&index<cache.tokens.length&&cache.tokens[index]===tokens[0]){
        latest=cache.rows[index];return;
      }
      const draft=remainingTokens.slice(consumed,consumed+Math.min(batchSize-1,448-position-tokens.length,tokenBudget-steps));
      const input=[...tokens,...draft];
      const rows=await evaluate(input,position);
      if(rows.length!==input.length)throw Error('Speculative row count mismatch');
      cache={position,tokens:input,rows};latest=rows[tokens.length-1];
    },
    getLogits:()=>latest.logits.slice(),
    getCrossAttentionQKs:async()=>latest.qk,
  };
}
