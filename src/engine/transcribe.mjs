import {Whisper} from '../../vendor/echogarden/Whisper.mjs';
import {nativeContext} from './native-context.mjs';

/** Independent ASR: no known-token filter, vocabulary subset, or forced lyrics. */
export async function transcribeAudio(engine, audio, language) {
  // Exactly zero PCM contains no acoustic evidence. Do not ask a language
  // model to invent text for digital silence; quiet nonzero audio still runs ASR.
  if (audio.length && audio.every(sample => sample === 0)) return [];
  const m = engine.module;
  if (!m || !engine.whisper?.tiktoken) throw Error('Engine is not initialized');
  const w = new Whisper();
  w.tiktoken = engine.whisper.tiktoken;
  w.audioWindowSeconds = 30;
  w.getTextStartTokens(language, 'transcribe', false);
  const segments = [],restore=[];
  function set(name,value,previous){
    if(typeof m[name]!=='function')return; // Original ten-second ABI lacks fast flags.
    if(m[name](value))throw Error(`ASR configuration failed: ${name}`);
    restore.push(()=>{if(m[name](previous))throw Error(`ASR configuration restore failed: ${name}`);});
  }
  try {
    if(m._poc_set_time_scale(1))throw Error('Could not enable unrestricted ASR');
    restore.push(()=>{
      const scale=engine.config.timeScale;
      const result=Number.isInteger(scale)?m._poc_set_time_scale(scale):m._poc_set_time_scale_fraction?.(Math.round(scale*1000),1000);
      if(result!==0)throw Error('Could not restore native time scale');
    });
    set('_poc_set_alignment_only',0,engine.config.alignmentOnly?1:0);
    set('_poc_set_audio_context',1500,engine.config.audioContext??1500);
    set('_poc_set_encoder_blocks',1,engine.config.encoderBlocks??1);
    set('_poc_set_attention_quant',0,engine.config.attentionQuant===true?2:engine.config.attentionQuant||0);
    set('_poc_set_vector_activations',0,engine.config.vectorActivations?1:0);
    if(m._poc_set_vocab_subset(0,0))throw Error('Could not enable unrestricted vocabulary');
    w.context = nativeContext(m, audio, audio, undefined, 1);
    await w.recognize({audioChannels:[audio], sampleRate:16000}, 'transcribe', language, {
      model:'tiny', threadCount:engine.threads, timestampAccuracy:'medium',
      topCandidateCount:1, temperature:.1, suppressRepetition:false,
      decodeTimestampTokens:false, autoPromptParts:false, maxTokensPerPart:448,
    }, undefined, {
      logLevel:'silent',
      onPart(text, tokens, timeline) {
        const words = timeline.filter(word => typeof word.text === 'string' && word.text.trim() && Number.isFinite(word.startTime) && Number.isFinite(word.endTime) && word.startTime >= 0 && word.endTime > word.startTime && word.endTime <= audio.length/16000)
          .map(word => ({ word:word.text, start:word.startTime, end:word.endTime }));
        if (words.length) segments.push({text, start:words[0].start, end:Math.max(...words.map(w => w.end)), words});
        // This is processed input, not an estimate of transcript accuracy.
        if (timeline.length) engine.progress?.('transcribing');
      },
    });
    return segments;
  } finally {
    let failure;
    for(const reset of restore.reverse())try{reset();}catch(error){failure??=error;}
    if(failure)throw failure;
  }
}
