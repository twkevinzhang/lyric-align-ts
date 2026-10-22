import {
  env,
  pipeline,
  WhisperTextStreamer,
  type AutomaticSpeechRecognitionPipeline,
  type WhisperTokenizer,
  type WhisperForConditionalGeneration,
} from "@huggingface/transformers";
import {
  MODELS,
  SETTINGS,
  jsHeap,
  type Command,
  type WorkerEvent,
} from "./lib/protocol";
import { EXPERIMENTS } from "./lib/experiments";
import { withPromptRowTimingFix } from "./lib/timestamp-experiment";
import { runCtcExperiment } from "./ctc-experiment";
import { parseLyrics } from "./lib/alignment";

env.allowLocalModels = false;
let transcriber: AutomaticSpeechRecognitionPipeline | null = null;
let busy = false;
let englishOnly = false;
const send = (event: WorkerEvent) => self.postMessage(event);
self.onmessage = async ({ data }: MessageEvent<Command>) => {
  if (busy) {
    send({ type: "error", message: "上一個 worker 操作尚未完成。" });
    return;
  }
  busy = true;
  let timer: ReturnType<typeof setInterval> | undefined;
  try {
    if (data.type === "load") {
      if (transcriber) throw new Error("請先釋放模型再切換。");
      const started = performance.now();
      englishOnly = data.model.endsWith("En");
      transcriber = await pipeline(
        "automatic-speech-recognition",
        MODELS[data.model].id,
        {
          device: "webgpu",
          dtype: "q4",
          revision: MODELS[data.model].revision,
          progress_callback: (progress) =>
            send({ type: "progress", data: progress }),
        },
      );
      send({
        type: "ready",
        model: data.model,
        elapsedMs: performance.now() - started,
      });
    } else if (data.type === "ctc-experiment") {
      if (!transcriber) throw new Error("模型尚未載入。");
      if (transcriber.model.config.model_type !== "wav2vec2")
        throw new Error("請載入 CTC q4 模型。");
      const started = performance.now();
      timer = setInterval(
        () =>
          send({
            type: "tick",
            elapsedMs: performance.now() - started,
            jsHeapBytes: jsHeap(),
          }),
        1000,
      );
      const output = await runCtcExperiment(
        transcriber,
        data.audio,
        data.lyrics,
        (label) =>
          send({ type: "progress", data: { file: "CTC", status: label } }),
      );
      send({
        type: "experiment-result",
        id: "ctc20-stride2-forced",
        settings: {
          runtime: SETTINGS.runtime,
          device: "webgpu",
          dtype: "q4",
          mode: "ctc-forced-alignment",
          chunk_length_s: 20,
          stride_length_s: 2,
          referenceTimingsUsed: false,
        },
        output,
        elapsedMs: performance.now() - started,
      });
      send({ type: "experiment-complete" });
    } else if (data.type === "experiment-suite") {
      if (!transcriber) throw new Error("模型尚未載入。");
      const suiteStarted = performance.now();
      timer = setInterval(
        () =>
          send({
            type: "tick",
            elapsedMs: performance.now() - suiteStarted,
            jsHeapBytes: jsHeap(),
          }),
        1000,
      );
      for (const { id, ...parameters } of EXPERIMENTS) {
        // Built-in n-gram suppression also scans prompt tokens. Disable it for
        // the lyric-prompt ablation so it does not ban the supplied lyrics.
        const candidateId = data.lyricPrompt
          ? "single128"
          : "single128-repeat4";
        if (data.candidateOnly && id !== candidateId) continue;
        const started = performance.now();
        const settings = {
          ...SETTINGS,
          ...parameters,
          language: englishOnly ? undefined : SETTINGS.language,
          task: englishOnly ? undefined : SETTINGS.task,
          do_sample: false,
        };
        let promptIds: number[] | undefined;
        if (data.lyricPrompt) {
          const model = transcriber.model as WhisperForConditionalGeneration;
          const config = model._prepare_generation_config(null, {
            language: settings.language,
            task: settings.task,
            return_timestamps: true,
          });
          const text = parseLyrics(data.lyrics ?? "").join(" ");
          if (!text) throw new Error("歌詞提示不可為空。");
          const context = transcriber.tokenizer
            .encode(text, { add_special_tokens: false })
            .slice(-224);
          const previous =
            transcriber.tokenizer.convert_tokens_to_ids("<|startofprev|>");
          promptIds = [
            previous,
            ...context,
            ...model._retrieve_init_tokens(config),
          ];
        }
        const infer = () =>
          transcriber!(data.audio, {
            ...settings,
            decoder_input_ids: promptIds,
          });
        const output = data.correctTimestamps
          ? await withPromptRowTimingFix(
              transcriber.model as WhisperForConditionalGeneration,
              infer,
            )
          : await infer();
        send({
          type: "experiment-result",
          id: `${id}${data.lyricPrompt ? "-lyricprompt" : ""}${data.correctTimestamps ? "-timingfix" : ""}`,
          settings: {
            ...settings,
            decoder_input_ids: promptIds,
            promptTextSource: data.lyricPrompt ? "provided-lyrics" : "none",
            timestampCorrection: data.correctTimestamps
              ? "prompt-row-pr1809"
              : "none",
          },
          output,
          elapsedMs: performance.now() - started,
        });
      }
      send({ type: "experiment-complete" });
    } else if (data.type === "text-control") {
      if (!transcriber) throw new Error("模型尚未載入。");
      const started = performance.now();
      timer = setInterval(
        () =>
          send({
            type: "tick",
            elapsedMs: performance.now() - started,
            jsHeapBytes: jsHeap(),
          }),
        1000,
      );
      const output = await transcriber(data.audio, {
        language: englishOnly ? undefined : SETTINGS.language,
        task: englishOnly ? undefined : SETTINGS.task,
        return_timestamps: data.nativeTimestamps,
        return_token_timestamps: false,
        chunk_length_s: SETTINGS.chunk_length_s,
        stride_length_s: SETTINGS.stride_length_s,
      });
      send({
        type: "text-control-result",
        output,
        elapsedMs: performance.now() - started,
      });
    } else if (data.type === "run") {
      if (!transcriber) throw new Error("模型尚未載入。");
      const started = performance.now();
      timer = setInterval(
        () =>
          send({
            type: "tick",
            elapsedMs: performance.now() - started,
            jsHeapBytes: jsHeap(),
          }),
        1000,
      );
      let streamFinalizations = 0;
      const streamer = new WhisperTextStreamer(
        transcriber.tokenizer as WhisperTokenizer,
        {
          skip_prompt: true,
          callback_function: () => {},
          on_finalize: () =>
            send({
              type: "chunk",
              data: {
                streamFinalizations: ++streamFinalizations,
                elapsedMs: performance.now() - started,
                jsHeapBytes: jsHeap(),
              },
            }),
        },
      );
      // Diagnostic adapter for the pinned 4.3.1 tokenizer. Decode the same
      // generated token sequences a second time to retain native segment spans.
      // Word output and model generation remain unchanged; no SRT is available here.
      const tokenizer = transcriber.tokenizer as WhisperTokenizer;
      const originalDecode = tokenizer._decode_asr;
      let nativeChunks: unknown = null;
      let generationWindows: unknown = null;
      let nativeCaptureError: string | null = null;
      tokenizer._decode_asr = function (sequences, options) {
        const wordResult = originalDecode.call(this, sequences, options);
        try {
          generationWindows = sequences.map((sequence) => ({
            stride: sequence.stride,
            tokens: sequence.tokens.map(Number),
            token_timestamps: sequence.token_timestamps,
            text: this.decode(sequence.tokens, { skip_special_tokens: true }),
          }));
          const nativeResult = originalDecode.call(this, sequences, {
            ...options,
            return_timestamps: true,
          });
          const optional = nativeResult[1];
          nativeChunks =
            typeof optional === "object" ? (optional.chunks ?? null) : null;
        } catch (error) {
          nativeCaptureError =
            error instanceof Error ? error.message : String(error);
        }
        return wordResult;
      };
      let output;
      try {
        output = await transcriber(data.audio, {
          language: englishOnly ? undefined : SETTINGS.language,
          task: englishOnly ? undefined : SETTINGS.task,
          return_timestamps: "word",
          chunk_length_s: SETTINGS.chunk_length_s,
          stride_length_s: SETTINGS.stride_length_s,
          streamer,
        });
      } finally {
        tokenizer._decode_asr = originalDecode;
      }
      send({
        type: "result",
        output: {
          ...output,
          native_chunks: nativeChunks,
          generation_windows: generationWindows,
          native_capture_error: nativeCaptureError,
        },
        elapsedMs: performance.now() - started,
      });
    } else {
      await transcriber?.dispose();
      transcriber = null;
      send({ type: "released" });
    }
  } catch (error) {
    send({
      type: "error",
      message: error instanceof Error ? error.message : String(error),
    });
  } finally {
    clearInterval(timer);
    busy = false;
  }
};
