import {Whisper} from './whisper.mjs';
import {createTokenizer} from './tokenizer.mjs';
import {nativeContext,subset,speculativeNativeContext} from './native-context.mjs';
import {virtualAudio,scaleTimeline} from '../core/audio-time-scale.mjs';
import {naturalJapaneseSpacing} from '../core/lyrics.mjs';
import {tokenTextUnits} from '../core/token-units.mjs';
import {lookaheadBudget,trimAttentionPrefix} from '../core/attention-trim.mjs';
import {transcribeAudio} from './transcribe.mjs';
import {decodeKnownTokens,decodeAllKnownTokens} from './guided-decode.mjs';
import {coarseAttentionPath} from './attention-resolution.mjs';
import {attentionGapBounds} from './gap-alignment.mjs';
import {lyricPauseMask} from './lyric-pauses.mjs';
export function validatePcm(audio){if(!(audio instanceof Float32Array)||!audio.length)throw Error('PCM must be a nonempty Float32Array');for(const sample of audio)if(!Number.isFinite(sample))throw Error('PCM samples must be finite');}
export class BrowserEngine{
  constructor(config={}){this.config={timeScale:3.25,batchSize:440,audioContext:960,prepack:'group',attentionQuant:2,vectorActivations:true,attentionStride:4,attentionPositionPenalty:10,trimFinalContext:true,profile:false,...config};if((!Number.isFinite(this.config.timeScale)||this.config.timeScale<1||this.config.timeScale>4||!Number.isInteger(this.config.timeScale*4))||(!Number.isInteger(this.config.audioContext)||this.config.audioContext<32||this.config.audioContext>1500)||!Number.isInteger(this.config.batchSize)||this.config.batchSize<1||this.config.batchSize>440)throw Error('Invalid engine configuration');}
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
    if(this.config.prepack){const pack=this.config.prepack==='group'?m._poc_prepack_group_model:m._poc_prepack_model;if(!pack || pack()<=0)throw Error('Model prepacking failed');}
    if(m._poc_set_threads(this.threads)||m._poc_get_threads()!==this.threads)throw Error('Native thread setting failed');
    if(Number.isInteger(this.config.timeScale)){if(!m._poc_set_time_scale||m._poc_set_time_scale(this.config.timeScale))throw Error('Time-scale native build required');}else if(!m._poc_set_time_scale_fraction||m._poc_set_time_scale_fraction(Math.round(this.config.timeScale*1000),1000))throw Error('Fractional time-scale build required');
    if(m._poc_set_audio_context(this.config.audioContext))throw Error('Audio context rejected');
    if(this.config.encoderBlocks&&(!m._poc_set_encoder_blocks||m._poc_set_encoder_blocks(this.config.encoderBlocks)))throw Error('Encoder attention blocks rejected');
    if(this.config.attentionQuant && (!m._poc_set_attention_quant || m._poc_set_attention_quant(this.config.attentionQuant===true?2:this.config.attentionQuant)))throw Error('Attention quantization rejected');
    if(this.config.vectorActivations && (!m._poc_set_vector_activations || m._poc_set_vector_activations(1)))throw Error('Vector activations rejected');
    this.whisper=new Whisper();this.whisper.tiktoken=await createTokenizer(this.base,this.whisper.specialTokens);
    this.whisper.audioWindowSeconds=this.config.audioContext*.02;
    this.whisper.alignmentPositionPenalty=this.config.attentionPositionPenalty;
    this.initializationSeconds=(performance.now()-this.start)/1000;return{ready:true};
  }
  async align(audio,lyrics,language){
    validatePcm(audio);if(typeof lyrics!=='string'||!lyrics.trim())throw Error('Lyrics must not be empty');
    const w=this.whisper,m=this.module;if(!w||!m)throw Error('Engine is not initialized');
    w.getTextStartTokens(language,'transcribe',true); // validates supported language before inference
    const profile=this.config.profile?{melMs:0,encoderMs:0,decodeMs:0,pathMs:0,windows:0,batches:0,tokens:0}:undefined;
    const alignStart=performance.now(),virtual=virtualAudio(audio,this.config.timeScale),originalContext=nativeContext(m,audio,virtual,this.progress,this.config.timeScale,profile,this.config.trimFinalContext?this.config.audioContext:undefined);
    w.context=originalContext;let lyricTokens,consumed=0,workerPath,prefixBounds,pauseMask;const rateHistory=[];
    w.getTokenTimelineFromAlignmentPath=async(...args)=>{
      const timeline=await Whisper.prototype.getTokenTimelineFromAlignmentPath.apply(w,args);
      if(prefixBounds){for(let i=0;i<prefixBounds.length&&i<timeline.length;i++){timeline[i].startTime=args[2]+prefixBounds[i].start*.02;timeline[i].endTime=Math.max(timeline[i].startTime,Math.min(args[3],args[2]+prefixBounds[i].end*.02));}prefixBounds=undefined;}
      return timeline;
    };
    const tokenize=Whisper.prototype.textToTokens.bind(w);
    const findPath=async(...args)=>{const start=profile?performance.now():0;try{return await Whisper.prototype.findAlignmentPathFromCrossAttentionQKs.apply(w,args);}finally{if(profile)profile.pathMs+=performance.now()-start;}};
    w.textToTokens=text=>{const tokens=tokenize(language==='ja'?naturalJapaneseSpacing(text):text);if(!lyricTokens&&text!==' ')lyricTokens=tokens;return tokens;};
    w.recognize=(audio,task,language,options,...rest)=>Whisper.prototype.recognize.call(w,audio,task,language,{...options,decodeTimestampTokens:false},...rest);
    w.decodeTokens=async(initialTokens,duration,isFirst,isFinal,options,filter,callbacks)=>{
      if(!filter||!lyricTokens)throw Error('Only guided lyric alignment is supported');const remaining=lyricTokens.slice(consumed),eot=w.specialTokens.endOfTextToken;
            if(profile){profile.lyricTokens=lyricTokens.length;if(isFinal)profile.finalRemaining=remaining.length;}
      options={...options,maxTokensPerPart:lookaheadBudget(lyricTokens.length,virtual.length,duration,remaining.length,isFinal,Math.min(440,448-initialTokens.length),1.15)};
      subset(m,remaining,eot);
      const baseOffset=originalContext.audioOffset,windowSamples=Math.round(w.audioWindowSeconds*16000),timeScale=this.config.timeScale;
      if(this.config.lyricPauses&&pauseMask===undefined)pauseMask=lyricPauseMask(lyricTokens,t=>w.tokensToText(t),lyrics)??null;
      // One window: decode the known lyric tokens, bound each token, keep the acoustic prefix. A later start
      // (shiftFrames) re-encodes the window and moves the result back onto the caller's window.
      const attempt=async shiftFrames=>{
        if(shiftFrames){const from=baseOffset+shiftFrames*320;await originalContext.encodeSamples(virtual.subarray(from,Math.min(virtual.length,from+windowSamples)));}
        w.context=speculativeNativeContext(m,originalContext,remaining,eot,options.maxTokensPerPart,this.config.batchSize);
        let decoded;try{decoded=await (isFinal?decodeAllKnownTokens:decodeKnownTokens)(originalContext,initialTokens,remaining,eot,options.maxTokensPerPart,this.config.batchSize,true);}finally{w.context=originalContext;}
        const offset=originalContext.audioOffset,last=decoded.decodedTokens.at(-1),timestampStart=w.specialTokens.timestampTokensStart;
        const end=!isFinal&&last>=timestampStart?offset+(last-timestampStart)*320:Math.min(offset+this.config.audioContext*320,virtual.length),frames=Math.floor((end-offset)/320),count=initialTokens.length;
        decoded.alignmentFrames=frames;
        const evidence={offsetSeconds:offset/16000*timeScale,consumed,logOdds:decoded.decodedTokenLogOdds.slice(count),tokens:decoded.decodedTokens.slice(count)};
        const n=decoded.decodedTokens.slice(count).filter(t=>t<eot).length;
        // Pairwise continuation probability is charged once per consumed token,
        // not once per frame. Stable log(sigmoid(logit(token)-logit(EOT))).
        const entryScores=decoded.decodedTokenLogOdds.slice(count,count+n).map(x=>-Math.max(0,-x)-Math.log1p(Math.exp(-Math.abs(x))));
        let bounds=attentionGapBounds(decoded.decodedTokensCrossAttentionQKs.slice(count,count+n),frames,2,{openEnd:!isFinal,entryScores,blankAfter:this.config.lyricPauses?pauseMask?.slice(consumed,consumed+n):undefined,posterior:this.config.posteriorBoundaries});
        if(bounds!==undefined)decoded.alignmentPath=bounds.map((b,i)=>({source:i,dest:b.start}));
        if(!decoded.alignmentPath)decoded.alignmentPath=await coarseAttentionPath(findPath,decoded.decodedTokensCrossAttentionQKs.slice(count),decoded.decodedTokens.slice(count),frames,this.config.attentionStride??1);
        if(!isFinal)decoded=trimAttentionPrefix(decoded,decoded.alignmentPath,count,frames-Math.round(this.config.audioContext/6),timestampStart,eot,bounds);
        const kept=decoded.decodedTokens.slice(count).filter(t=>t<eot).length;
        if(bounds)bounds=bounds.slice(0,kept);
        if(shiftFrames){
          decoded.decodedTokens[decoded.decodedTokens.length-1]+=shiftFrames;decoded.alignmentFrames+=shiftFrames;
          decoded.alignmentPath=decoded.alignmentPath.map(point=>({...point,dest:point.dest+shiftFrames}));
          if(bounds)bounds=bounds.map(b=>({...b,start:b.start+shiftFrames,end:b.end+shiftFrames,...(b.allocationEnd===undefined?{}:{allocationEnd:b.allocationEnd+shiftFrames})}));
        }
        return{decoded,bounds,evidence,kept,coreSeconds:decoded.alignmentFrames*.02*timeScale,score:kept?entryScores.slice(0,kept).reduce((x,y)=>x+y,0)/kept:-Infinity,offset};
      };
      let chosen=await attempt(0);
      const retry=this.config.windowRetry;
      if(retry&&!isFinal&&chosen.kept>0&&rateHistory.length>=retry.minHistory){
        const sorted=[...rateHistory].sort((x,y)=>x-y),typical=sorted[sorted.length>>1],inBand=c=>{const r=c.kept/c.coreSeconds;return r>=retry.low*typical&&r<=retry.high*typical;};
        // Only a window with both an unusual lyric rate and poor evidence is retried from a later start.
        if(!inBand(chosen)&&chosen.score<retry.maxScore){
          let best;
          for(const shift of retry.shifts){const candidate=await attempt(shift);if(inBand(candidate)&&candidate.score>=chosen.score-retry.tolerance&&(!best||candidate.score>best.score))best=candidate;}
          if(profile)profile.retries=[...(profile.retries??[]),{offsetSeconds:chosen.offset/16000*timeScale,adopted:Boolean(best)}];
          if(best)chosen=best;
        }
      }
      let {decoded}=chosen;prefixBounds=chosen.bounds;
      if(chosen.kept>0)rateHistory.push(chosen.kept/chosen.coreSeconds);
      if(profile)(profile.tokenEvidence??=[]).push(chosen.evidence);
      workerPath={path:decoded.alignmentPath,frames:decoded.alignmentFrames,tokens:decoded.decodedTokens.slice(initialTokens.length)};
      if(profile)(profile.parts??=[]).push({offsetSeconds:chosen.offset/16000*timeScale,remaining:remaining.length,budget:options.maxTokensPerPart,kept:chosen.kept,isFinal,coreSeconds:chosen.coreSeconds});
      consumed+=chosen.kept;decoded.decodedTokensCrossAttentionQKs=decoded.decodedTokens.map(()=>undefined);
      return decoded;
    };
    w.findAlignmentPathFromCrossAttentionQKs=async(qks,tokens,start,end)=>{if(!workerPath||start!==0||end!==workerPath.frames||JSON.stringify(tokens)!==JSON.stringify(workerPath.tokens))throw Error('Alignment boundary mismatch');const path=workerPath.path;workerPath=undefined;return path;};
    let words=await w.align({audioChannels:[virtual],sampleRate:16000},lyrics,language,'transcribe',{model:'tiny',enableGPU:false,threadCount:this.threads,gpuDeviceIndex:0,timestampAccuracy:'medium',maxTokensPerPart:448,endTokenThreshold:1},{logLevel:'silent'});
    if(language==='ja')words=tokenTextUnits(words,tokens=>w.tokensToText(tokens),token=>w.isTextToken(token));scaleTimeline(words,this.config.timeScale,audio.length/16000);
    return{words,metrics:{initializationSeconds:this.initializationSeconds,alignmentSeconds:(performance.now()-alignStart)/1000,totalSeconds:this.initializationSeconds+(performance.now()-alignStart)/1000,...(profile?{profile}:{})}};
  }
  async transcribe(audio,language){validatePcm(audio);return transcribeAudio(this,audio,language);}
  dispose(){this.whisper?.tiktoken?.free();this.whisper=undefined;this.module?._poc_close();this.module?.PThread?.terminateAllThreads();this.module=undefined;}
}
