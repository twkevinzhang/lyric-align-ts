// Reuse the pinned upstream decoder decisions verbatim. Only logging, top-1
// sampling and event-loop yields are replaced; model inference stays in Worker.
export function workerDecoderSource(Whisper,{softmax,indexOfMax,sumVector}){
  const method=Whisper.prototype.decodeTokens.toString().replace(/^async decodeTokens\(/,'async function(');
  if(!method.startsWith('async function('))throw Error('Unexpected upstream decoder signature');
  return `
const softmax=${softmax.toString()};
const indexOfMax=${indexOfMax.toString()};
const sumVector=${sumVector.toString()};
const largestMaximumTokensPerPart=448,defaultWhisperOptions={};
const extendDeep=(base,options)=>({...base,...options});
class Logger{async startAsync(){} end(){} write(){}}
class Timer{constructor(){this.start=performance.now();}get elapsedTime(){return performance.now()-this.start;}getElapsedTimeAndRestart(){const t=this.elapsedTime;this.start=performance.now();return t;}}
const yieldToEventLoop=async()=>{};
const containsInvalidCodepoint=()=>false;
const getTokenRepetitionScore=()=>{throw Error('Repetition sampling unsupported');};
const getTopKIndexes=(values,k)=>{if(k!==1)throw Error('Only deterministic top-1 supported');return [indexOfMax(values)];};
const upstreamDecode=${method};
self.runGuided=async(request,context)=>{
  const {initialTokens,remainingTokens,specialTokens,suppressedMetadataTokens,isFirstPart,isFinalPart}=request;
  const options={...request.options,punctuationThreshold:Infinity,repetitionThreshold:Infinity};
  if(options.topCandidateCount!==1||options.suppressRepetition||options.temperature!==0)throw Error('Unsupported guided decode options');
  const eot=specialTokens.endOfTextToken;
  const decoder={context,specialTokens,randomGen:{selectRandomIndexFromDistribution:()=>0},
    isTextToken:t=>t<eot,isMetadataToken:t=>t>=eot,
    isTimestampToken:t=>t>=specialTokens.timestampTokensStart,
    timestampTokenToSeconds:t=>(t-specialTokens.timestampTokensStart)*0.02,
    getSuppressedTextTokens:()=>request.suppressedTextTokens??[],getSuppressedMetadataTokens:()=>suppressedMetadataTokens,
    getAllowedPunctuationMarks:()=>[],textToTokens:()=>[request.spaceToken],
    tokenToText:()=>'',tokensToText:()=>'',tokenToBytes:()=>new Uint8Array(0)};
  const filter=(logits,decoded)=>{
    const count=decoded.filter(t=>t<eot).length;
    const next=remainingTokens[count]??eot;
    return logits.map((value,index)=>index===next||(!isFinalPart&&index===eot)?value:-Infinity);
  };
  return upstreamDecode.call(decoder,initialTokens,request.audioDuration,isFirstPart,isFinalPart,options,request.guided===false?undefined:filter,{logLevel:'silent'});
};
`;
}
