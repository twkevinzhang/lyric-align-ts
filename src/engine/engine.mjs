import {Whisper} from '../../vendor/echogarden/Whisper.mjs';
import {createTokenizer} from './tokenizer.mjs';
import {nativeContext,subset,speculativeNativeContext} from './native-context.mjs';
import {virtualAudio,scaleTimeline} from '../core/audio-time-scale.mjs';
import {naturalJapaneseSpacing} from '../core/lyrics.mjs';
import {tokenTextUnits} from '../core/token-units.mjs';
import {lookaheadBudget,trimAttentionPrefix} from '../core/attention-trim.mjs';
import {decodeKnownTokens} from './guided-decode.mjs';
export function validatePcm(audio){if(!(audio instanceof Float32Array)||!audio.length)throw Error('PCM must be a nonempty Float32Array');for(const sample of audio)if(!Number.isFinite(sample))throw Error('PCM samples must be finite');}
export class BrowserEngine{
  constructor(config={}){this.config={timeScale:2,batchSize:128,audioContext:1500,guided:false,profile:false,...config};if(![1,2,3,4].includes(this.config.timeScale)||![375,750,1500].includes(this.config.audioContext)||!Number.isInteger(this.config.batchSize)||this.config.batchSize<1||this.config.batchSize>440)throw Error('Invalid engine configuration');}
  async initialize(options,progress){
    this.start=performance.now();this.progress=progress;
    if(!globalThis.crossOriginIsolated||typeof SharedArrayBuffer==='undefined')throw Error('Cross-origin isolation (COOP/COEP) and SharedArrayBuffer are required');
    if(!/^[a-f0-9]{64}$/i.test(options.modelSha256))throw Error('A SHA256 model digest is required');
    if(![1,2,4,6,8,12].includes(options.threads))throw Error('Unsupported thread count');this.threads=options.threads;
    this.base=new URL(options.assetBaseUrl,globalThis.location.href).href;if(!this.base.endsWith('/'))this.base+='/';
    progress?.('model');const response=await fetch(options.modelUrl);if(!response.ok)throw Error(`Model fetch failed: HTTP ${response.status}`);let model=await response.arrayBuffer();
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',model)),b=>b.toString(16).padStart(2,'0')).join('');if(hash!==options.modelSha256.toLowerCase())throw Error('Model SHA256 mismatch');
    const script=new URL('parity.js',this.base).href;importScripts(script);
    this.module=await globalThis.createWhisperParity({noInitialRun:true,mainScriptUrlOrBlob:script,locateFile:name=>new URL(name,this.base).href,print:()=>{},printErr:()=>{}});
    const m=this.module;m.FS.writeFile('/model.bin',new Uint8Array(model));model=null;
    try{if(m.ccall('poc_open_model','number',['string','number'],['/model.bin',0]))throw Error('Cannot open tiny model');}finally{m.FS.unlink('/model.bin');}
    if(m._poc_set_threads(this.threads)||m._poc_get_threads()!==this.threads)throw Error('Native thread setting failed');
    if(!m._poc_set_time_scale||m._poc_set_time_scale(this.config.timeScale))throw Error('Time-scale native build required');
    if(m._poc_set_audio_context(this.config.audioContext))throw Error('Audio context rejected');
    this.whisper=new Whisper();this.whisper.tiktoken=await createTokenizer(this.base,this.whisper.specialTokens);
    this.whisper.audioWindowSeconds=this.config.audioContext*.02;
    this.initializationSeconds=(performance.now()-this.start)/1000;return{ready:true};
  }
  async align(audio,lyrics,language){
    validatePcm(audio);if(typeof lyrics!=='string'||!lyrics.trim())throw Error('Lyrics must not be empty');
    const w=this.whisper,m=this.module;if(!w||!m)throw Error('Engine is not initialized');
    w.getTextStartTokens(language,'transcribe',true); // validates supported language before inference
    const profile=this.config.profile?{melMs:0,encoderMs:0,decodeMs:0,pathMs:0,windows:0,batches:0,tokens:0}:undefined;
    const alignStart=performance.now(),virtual=virtualAudio(audio,this.config.timeScale),originalContext=nativeContext(m,audio,virtual,this.progress,this.config.timeScale,profile);
    w.context=originalContext;let lyricTokens,consumed=0,workerPath;
    const tokenize=Whisper.prototype.textToTokens.bind(w),decode=Whisper.prototype.decodeTokens.bind(w);
    const findPath=async(...args)=>{const start=profile?performance.now():0;try{return await Whisper.prototype.findAlignmentPathFromCrossAttentionQKs.apply(w,args);}finally{if(profile)profile.pathMs+=performance.now()-start;}};
    w.textToTokens=text=>{const tokens=tokenize(language==='ja'?naturalJapaneseSpacing(text):text);if(!lyricTokens&&text!==' ')lyricTokens=tokens;return tokens;};
    w.recognize=(audio,task,language,options,...rest)=>Whisper.prototype.recognize.call(w,audio,task,language,{...options,decodeTimestampTokens:false},...rest);
    w.decodeTokens=async(initialTokens,duration,isFirst,isFinal,options,filter,callbacks)=>{
      if(!filter||!lyricTokens)throw Error('Only guided lyric alignment is supported');const remaining=lyricTokens.slice(consumed),eot=w.specialTokens.endOfTextToken;
      options={...options,maxTokensPerPart:lookaheadBudget(lyricTokens.length,virtual.length,duration,remaining.length,isFinal,Math.min(440,448-initialTokens.length),1.15)};
      subset(m,remaining,eot);w.context=speculativeNativeContext(m,originalContext,remaining,eot,options.maxTokensPerPart,this.config.batchSize);
      const guidedFilter=(logits,tokens)=>{const next=remaining[tokens.filter(t=>t<eot).length]??eot;return logits.map((value,index)=>index===next||(!isFinal&&index===eot)?value:-Infinity);};
      let decoded;try{decoded=this.config.guided?await decodeKnownTokens(originalContext,initialTokens,remaining,eot,options.maxTokensPerPart,this.config.batchSize):await decode(initialTokens,duration,isFirst,isFinal,options,guidedFilter,callbacks);}finally{w.context=originalContext;}
      const offset=originalContext.audioOffset,last=decoded.decodedTokens.at(-1),timestampStart=w.specialTokens.timestampTokensStart;
      const end=!isFinal&&last>=timestampStart?offset+Math.floor((last-timestampStart)*.02*16000):Math.min(offset+this.config.audioContext*320,virtual.length),frames=Math.floor((end/16000-offset/16000)/.02),count=initialTokens.length;
      decoded.alignmentPath=await findPath(decoded.decodedTokensCrossAttentionQKs.slice(count),decoded.decodedTokens.slice(count),0,frames);decoded.alignmentFrames=frames;
      if(!isFinal)decoded=trimAttentionPrefix(decoded,decoded.alignmentPath,count,frames-Math.round(this.config.audioContext/6),timestampStart,eot);
      workerPath={path:decoded.alignmentPath,frames:decoded.alignmentFrames,tokens:decoded.decodedTokens.slice(count)};
      consumed+=decoded.decodedTokens.slice(count).filter(t=>t<eot).length;decoded.decodedTokensCrossAttentionQKs=decoded.decodedTokens.map(()=>undefined);
      return decoded;
    };
    w.findAlignmentPathFromCrossAttentionQKs=async(qks,tokens,start,end)=>{if(!workerPath||start!==0||end!==workerPath.frames||JSON.stringify(tokens)!==JSON.stringify(workerPath.tokens))throw Error('Alignment boundary mismatch');const path=workerPath.path;workerPath=undefined;return path;};
    let words=await w.align({audioChannels:[virtual],sampleRate:16000},lyrics,language,'transcribe',{model:'tiny',enableGPU:false,threadCount:this.threads,gpuDeviceIndex:0,timestampAccuracy:'medium',maxTokensPerPart:448,endTokenThreshold:1},{logLevel:'silent'});
    if(language==='ja')words=tokenTextUnits(words,tokens=>w.tokensToText(tokens),token=>w.isTextToken(token));scaleTimeline(words,this.config.timeScale,audio.length/16000);
    return{words,metrics:{initializationSeconds:this.initializationSeconds,alignmentSeconds:(performance.now()-alignStart)/1000,totalSeconds:this.initializationSeconds+(performance.now()-alignStart)/1000,...(profile?{profile}:{})}};
  }
  dispose(){this.whisper?.tiktoken?.free();this.whisper=undefined;this.module?._poc_close();this.module?.PThread?.terminateAllThreads();this.module=undefined;}
}
