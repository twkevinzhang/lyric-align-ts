import {
  env,
  pipeline,
  type AutomaticSpeechRecognitionPipeline,
  type WhisperForConditionalGeneration,
} from "@huggingface/transformers";
import {
  MODEL,
  SETTINGS,
  preparePrompt,
  jsHeap,
  type Command,
  type WorkerEvent,
} from "./lib/protocol";

env.allowLocalModels = false;
let transcriber: AutomaticSpeechRecognitionPipeline | null = null;
let busy = false;
const send = (event: WorkerEvent) => self.postMessage(event);
self.onmessage = async ({ data }: MessageEvent<Command>) => {
  if (busy) return send({ type: "error", message: "上一個操作尚未完成。" });
  busy = true;
  let timer: ReturnType<typeof setInterval> | undefined;
  try {
    if (data.type === "load") {
      if (transcriber) throw new Error("模型已載入。");
      const started = performance.now();
      transcriber = await pipeline("automatic-speech-recognition", MODEL.id, {
        device: SETTINGS.device,
        dtype: SETTINGS.dtype,
        revision: MODEL.revision,
        progress_callback: (data) => send({ type: "progress", data }),
      });
      send({ type: "ready", elapsedMs: performance.now() - started });
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
      const model = transcriber.model as WhisperForConditionalGeneration;
      // Pinned Transformers.js private APIs: English-only models omit language/task.
      const config = model._prepare_generation_config(null, {
        return_timestamps: true,
      });
      const context = transcriber.tokenizer.encode(data.lyrics.join(" "), {
        add_special_tokens: false,
      });
      const prompt = preparePrompt(
        context,
        transcriber.tokenizer.convert_tokens_to_ids("<|startofprev|>"),
        model._retrieve_init_tokens(config),
      );
      const output = await transcriber(data.audio, {
        chunk_length_s: SETTINGS.chunk_length_s,
        stride_length_s: SETTINGS.stride_length_s,
        return_timestamps: SETTINGS.return_timestamps,
        max_new_tokens: SETTINGS.max_new_tokens,
        no_repeat_ngram_size: SETTINGS.no_repeat_ngram_size,
        do_sample: SETTINGS.do_sample,
        decoder_input_ids: prompt,
      });
      send({
        type: "result",
        output,
        elapsedMs: performance.now() - started,
        promptTokens: Math.min(context.length, 224),
        contextTokens: context.length,
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
