import patterns from '../../vendor/echogarden/word-patterns.json' with {type:'json'};
export class Logger {start(){} async startAsync(){} end(){} write(){} log(){} logLevelGreaterOrEqualTo(){return false;}}
export class Timer {constructor(){this.start=performance.now();}get elapsedTime(){return performance.now()-this.start;}getElapsedTimeAndRestart(){const v=this.elapsedTime;this.start=performance.now();return v;}}
export const chalk={magentaBright:s=>s,blueBright:s=>s};
export const extendDeep=(base,options)=>({...base,...options});
export const getRawAudioDuration=audio=>audio.audioChannels[0].length/audio.sampleRate;
export const includesPunctuation=s=>/\p{Punctuation}/u.test(s);
export const isAllWhitespace=s=>/^\s+$/u.test(s);
export const containsInvalidCodepoint=s=>s.includes('\uFFFD');
export const clip=(x,a,b)=>Math.max(a,Math.min(b,x));
export const getIntegerRange=(a,b)=>Array.from({length:Math.max(0,b-a)},(_,i)=>a+i);
export const concatUint8Arrays=arrays=>{const result=new Uint8Array(arrays.reduce((n,a)=>n+a.length,0));let offset=0;for(const a of arrays){result.set(a,offset);offset+=a.length;}return result;};
export const yieldToEventLoop=async()=>{};
export const getDeflateCompressionMetricsForString=async()=>({ratio:0});
export const getTokenRepetitionScore=()=>{throw Error('Only fixed deterministic alignment is supported');};
export const getTopKIndexes=(values,k)=>{if(k!==1)throw Error('Only deterministic top-1 supported');let best=0;for(let i=1;i<values.length;i++)if(values[i]>values[best])best=i;return[best];};
export async function splitToWords(text,language){if(language!=='ja'&&language!=='zh')return{nonPunctuationWords:Array.from(text.matchAll(new RegExp(patterns[language]??patterns[''],'gu')),match=>match[0])};const segments=Array.from(new Intl.Segmenter(language,{granularity:'word'}).segment(text));if(language==='ja')for(let i=1;i<segments.length-1;i++)if(segments[i].segment==='・'&&segments[i-1].isWordLike&&segments[i+1].isWordLike){segments.splice(i-1,3,{segment:segments[i-1].segment+'・'+segments[i+1].segment,isWordLike:true});i=Math.max(0,i-2);}return {nonPunctuationWords:segments.filter(part=>part.isWordLike||/^[\p{Emoji_Presentation}$€¢£¥©®™%&#~@+±÷/\\^*×=≈¼½¾→≤≥∞]+$/u.test(part.segment)).map(part=>part.segment)};}
