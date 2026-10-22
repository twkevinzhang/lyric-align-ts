/* eslint-disable @typescript-eslint/no-explicit-any -- Single pinned adapter for
 * Transformers.js 4.3.1 private session/forward APIs; guarded by browser probes.
 * Other ASR modules use typed, backend-independent contracts. */
import {
  AutoModelForSpeechSeq2Seq,
  AutoProcessor,
  AutoTokenizer,
  Tensor,
  DynamicCache,
  env,
} from "@huggingface/transformers";
import { MODEL } from "../protocol.ts";
import { logSoftmax, type TokenRules } from "./decode.ts";
import {
  alignmentMatrix,
  negativeDtw,
  splitWordTokens,
  type TimedWord,
} from "./word-timing.ts";
import { wholeSongFeatures, featureWindow, type Features } from "./features.ts";
export type Backend = "wasm" | "webgpu";
type Cache = Record<string, Tensor>;
export class WhisperRuntime {
  model: any;
  processor: any;
  tokenizer: any;
  private tensors = new Set<Tensor>();
  private tensorBytes = 0;
  peakTensorBytes = 0;
  private hidden: Tensor | null = null;
  encoderRuns = 0;
  resetRunMetrics() {
    if (this.tensors.size) throw Error("Previous ASR tensors are still live");
    this.encoderRuns = 0;
    this.peakTensorBytes = 0;
  }
  private track<T extends Tensor>(t: T): T {
    if (!this.tensors.has(t)) {
      const width =
        t.type === "float32"
          ? 4
          : t.type === "int64"
            ? 8
            : t.type === "float16"
              ? 2
              : 1;
      this.tensorBytes += t.dims.reduce((a, b) => a * b, 1) * width;
      this.peakTensorBytes = Math.max(this.peakTensorBytes, this.tensorBytes);
    }
    this.tensors.add(t);
    return t;
  }
  private async drop(t: Tensor) {
    if (this.tensors.delete(t)) {
      const width =
        t.type === "float32"
          ? 4
          : t.type === "int64"
            ? 8
            : t.type === "float16"
              ? 2
              : 1;
      this.tensorBytes -= t.dims.reduce((a, b) => a * b, 1) * width;
      await t.dispose();
    }
  }
  private async values(t: Tensor): Promise<Float32Array> {
    return t.location === "gpu-buffer"
      ? await (t as any).ort_tensor.getData()
      : (t.data as Float32Array);
  }
  async load(backend: Backend, progress?: (data: unknown) => void) {
    env.allowLocalModels = false;
    env.backends.onnx.wasm!.numThreads = 1;
    const options = { revision: MODEL.revision, progress_callback: progress };
    try {
      this.tokenizer = await AutoTokenizer.from_pretrained(MODEL.id, options);
      this.processor = await AutoProcessor.from_pretrained(MODEL.id, options);
      this.model = await AutoModelForSpeechSeq2Seq.from_pretrained(MODEL.id, {
        ...options,
        device: backend,
        dtype: "q4",
      });
    } catch (e) {
      await this.release();
      throw e;
    }
  }
  token(text: string): number {
    const id = this.tokenizer.convert_tokens_to_ids(text);
    if (!Number.isInteger(id))
      throw Error(`Missing tokenizer special token ${text}`);
    return id;
  }
  decode(ids: number[]) {
    return this.tokenizer.decode(ids, {
      skip_special_tokens: false,
      clean_up_tokenization_spaces: false,
    }) as string;
  }
  text(ids: number[]) {
    return this.decode(ids.filter((t) => t < this.token("<|endoftext|>")));
  }
  rules(): TokenRules {
    const encode = (s: string) =>
      this.tokenizer.encode(s, { add_special_tokens: false }) as number[];
    const symbols = [
      ...'"#()*+/:;<=>@[\\]^_`{|}~「」『』',
      ..."<< >> <<< >>> -- --- -( -[ (' (\" (( )) ((( ))) [[ ]] {{ }} ♪♪ ♪♪♪".split(
        " ",
      ),
    ];
    const misc = [..."♩♪♫♬♭♮♯"];
    const ids = new Set<number>([encode(" -")[0], encode(" '")[0]]);
    for (const s of [...symbols, ...misc])
      for (const seq of [encode(s), encode(" " + s)])
        if (seq.length === 1 || misc.includes(s)) ids.add(seq[0]);
    for (const s of [
      "<|transcribe|>",
      "<|translate|>",
      "<|startoftranscript|>",
      "<|startofprev|>",
      "<|startoflm|>",
      "<|nocaptions|>",
    ])
      ids.add(this.token(s));
    return {
      eos: this.token("<|endoftext|>"),
      timestamp: this.token("<|notimestamps|>") + 1,
      noTimestamps: this.token("<|notimestamps|>"),
      suppress: [...ids],
      blank: [encode(" ")[0], this.token("<|endoftext|>")],
      maxInitial: 50,
    };
  }
  async features(audio: Float32Array) {
    return wholeSongFeatures(audio, this.processor.feature_extractor);
  }
  async encode(features: Features, seek: number) {
    await this.clearWindow();
    const input = this.track(
      new Tensor("float32", featureWindow(features, seek), [1, 80, 3000]),
    );
    try {
      const out = await this.model.sessions.model.run({
        input_features: (input as any).ort_tensor,
      });
      const wrapped = Object.fromEntries(
        Object.entries(out).map(([k, v]) => [
          k,
          this.track(new Tensor(v as any)),
        ]),
      );
      this.hidden = wrapped.last_hidden_state;
      if (!this.hidden) throw Error("Encoder missing last_hidden_state");
      this.encoderRuns++;
    } finally {
      await this.drop(input);
    }
  }
  private async raw(ids: number[], cache?: Cache) {
    if (!this.hidden) throw Error("Encoder has not run");
    const input = this.track(
      new Tensor("int64", ids.map(BigInt), [1, ids.length]),
    );
    try {
      const out: Record<string, Tensor> = await this.model.forward({
        encoder_outputs: this.hidden,
        decoder_input_ids: input,
        ...(cache ? { past_key_values: new DynamicCache(cache) } : {}),
      });
      for (const t of Object.values(out))
        if (t instanceof Tensor) this.track(t);
      return out;
    } finally {
      await this.drop(input);
    }
  }
  async forward(ids: number[], cache?: Cache) {
    const out = await this.raw(ids, cache);
    const vocab = out.logits.dims.at(-1)!;
    const logits = Float32Array.from(
      (await this.values(out.logits)).slice(-vocab),
    );
    if (logits.some((x) => !Number.isFinite(x)))
      throw Error("Non-finite raw logits");
    const next: Cache = cache ?? {};
    for (const [name, t] of Object.entries(out))
      if (name.startsWith("present")) {
        const key = name.replace("present", "past_key_values");
        if (cache && name.includes(".encoder.")) continue;
        if (next[key] && next[key] !== t) await this.drop(next[key]);
        next[key] = t;
      }
    const keep = new Set(Object.values(next));
    keep.add(this.hidden!);
    for (const t of Object.values(out))
      if (t instanceof Tensor && !keep.has(t)) await this.drop(t);
    return { logits, cache: next };
  }
  async clone(cache: Cache): Promise<Cache> {
    const out: Cache = {};
    try {
      for (const [key, t] of Object.entries(cache))
        out[key] = this.track(
          new Tensor(t.type, (await this.values(t)).slice(), [...t.dims]),
        );
      return out;
    } catch (e) {
      await this.dispose(out);
      throw e;
    }
  }
  async dispose(cache: Cache) {
    for (const [key, t] of Object.entries(cache)) {
      await this.drop(t);
      delete cache[key];
    }
  }
  async align(
    tokens: number[],
    numFrames: number,
  ): Promise<{
    words: TimedWord[];
    jumps: number[];
    attentionRange: { min: number; max: number };
  }> {
    if (!tokens.length || numFrames < 2)
      return { words: [], jumps: [], attentionRange: { min: 0, max: 0 } };
    const sot = this.token("<|startoftranscript|>"),
      eos = this.token("<|endoftext|>");
    const ids = [sot, this.token("<|notimestamps|>"), ...tokens, eos];
    if (ids.length > 448)
      throw Error("Alignment sequence exceeds model context");
    const out = await this.raw(ids);
    try {
      const heads: number[][][] = [];
      const config = this.model.generation_config;
      const selected = config.alignment_heads as number[][];
      if (!selected?.length) throw Error("Missing alignment_heads");
      const frames = Math.floor(numFrames / 2);
      let min = Infinity,
        max = -Infinity;
      for (const [layer, head] of selected) {
        const t = out[`cross_attentions.${layer}`];
        if (!t || t.dims[1] <= head || t.dims[2] !== ids.length)
          throw Error("Required cross attention unavailable");
        const data = await this.values(t),
          stride = t.dims[3],
          matrix = [];
        for (let row = 0; row < ids.length; row++) {
          const start = (head * ids.length + row) * stride;
          const values = Array.from(data.slice(start, start + frames));
          for (const x of values) {
            min = Math.min(min, x);
            max = Math.max(max, x);
          }
          matrix.push(values);
        }
        heads.push(matrix);
      }
      const matrix = alignmentMatrix(heads, frames).slice(
        1,
        1 + tokens.length + 1,
      );
      const path = negativeDtw(matrix),
        jumps = path
          .filter((p, i) => i === 0 || p[0] !== path[i - 1][0])
          .map((p) => p[1] / 50);
      const vocab = out.logits.dims.at(-1)!,
        logits = await this.values(out.logits),
        probs: number[] = [];
      for (let i = 0; i < tokens.length; i++)
        probs.push(
          Math.exp(
            logSoftmax(logits.subarray((i + 1) * vocab, (i + 1) * vocab + eos))[
              tokens[i]
            ],
          ),
        );
      const groups = splitWordTokens(
        [...tokens, eos],
        (ids) => this.decode(ids),
        eos,
      );
      let index = 0;
      const words = groups.slice(0, -1).map((g) => {
        const end = index + g.tokens.length;
        const w = {
          ...g,
          start: jumps[index],
          end: jumps[end],
          probability:
            probs.slice(index, end).reduce((a, b) => a + b, 0) / (end - index),
        };
        index = end;
        return w;
      });
      if (
        words.some((w) => !Number.isFinite(w.start) || !Number.isFinite(w.end))
      )
        throw Error("Incomplete alignment path");
      return { words, jumps, attentionRange: { min, max } };
    } finally {
      for (const t of Object.values(out))
        if (t instanceof Tensor && t !== this.hidden) await this.drop(t);
    }
  }
  async clearWindow() {
    for (const t of this.tensors) await this.drop(t);
    this.hidden = null;
  }
  async release() {
    await this.clearWindow();
    await this.model?.dispose();
    this.model = null;
  }
  get liveTensors() {
    return this.tensors.size;
  }
}
