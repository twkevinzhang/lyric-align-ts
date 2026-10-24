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
  if (m._poc_set_time_scale(1) || m._poc_set_vocab_subset(0, 0)) throw Error('Could not enable unrestricted ASR');
  const segments = [];
  try {
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
    if (m._poc_set_time_scale(engine.config.timeScale)) throw Error('Could not restore native time scale');
  }
}
