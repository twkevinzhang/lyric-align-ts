// One SOT decode reuses the current encoded audio. Full-vocabulary softmax is
// required: a lyric-only subset would change the probability's meaning.
export async function noSpeechProbability(module,context,specialTokens,alignmentOnly){
 try{
  if(module._poc_set_alignment_only(0)||module._poc_set_vocab_subset(0,0))throw Error('No-speech probe configuration failed');
  await context.decodeTokens([specialTokens.startOfTextToken],0);
  const logits=context.getLogits();
  const value=logits[specialTokens.nonSpeechToken];
  let maximum=-Infinity;for(const x of logits)maximum=Math.max(maximum,x);
  if(!Number.isFinite(maximum)||!Number.isFinite(value))throw Error('Invalid no-speech logits');
  let sum=0;for(const x of logits)sum+=Math.exp(x-maximum);
  return Math.exp(value-maximum)/sum;
 }finally{
  if(module._poc_set_alignment_only(alignmentOnly?1:0))throw Error('Cannot restore alignment mode');
 }
}
