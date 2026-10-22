/** CTranslate2 v4.8.3 whisper.cc/decoding.cc/sampling.cc, default options.
 * Ties use stable parent/token order; CT2 device TopK tie order is unspecified.
 */
export function logSoftmax(values: ArrayLike<number>): Float64Array {
  let max = -Infinity;
  for (let i = 0; i < values.length; i++) max = Math.max(max, values[i]);
  if (!Number.isFinite(max)) throw Error("No finite decoder candidate");
  let z = 0;
  for (let i = 0; i < values.length; i++) z += Math.exp(values[i] - max);
  const norm = max + Math.log(z);
  return Float64Array.from(values, (x) => x - norm);
}
export function generationBudget(promptLength: number) {
  return Math.min(224, 448 - (promptLength - 1));
}
export type TokenRules = {
  eos: number;
  timestamp: number;
  noTimestamps: number;
  suppress: number[];
  blank: number[];
  maxInitial: number;
};
export function maskLogits(
  raw: Float32Array,
  tokens: number[],
  c: TokenRules,
): Float32Array {
  const x = raw.slice(),
    ts = c.timestamp;
  for (const id of c.suppress) x[id] = -Infinity;
  if (!tokens.length) for (const id of c.blank) x[id] = -Infinity;
  x[c.noTimestamps] = -Infinity;
  if (!tokens.length) {
    x.fill(-Infinity, 0, ts);
    x.fill(-Infinity, ts + c.maxInitial + 1);
  } else {
    const last = tokens.at(-1)!,
      penultimate = tokens.length > 1 ? tokens.at(-2)! : last;
    let check = false;
    if (last >= ts) {
      if (penultimate >= ts) x.fill(-Infinity, ts);
      else {
        x.fill(-Infinity, 0, c.eos);
        x.fill(-Infinity, ts, last);
        check = true;
      }
    } else {
      check = true;
      const prior = [...tokens].reverse().find((t) => t >= ts);
      if (prior !== undefined) x.fill(-Infinity, ts, prior + 1);
    }
    if (check) {
      let maxText = -Infinity,
        maxTs = -Infinity;
      for (let i = 0; i < ts; i++) maxText = Math.max(maxText, x[i]);
      for (let i = ts; i < x.length; i++) maxTs = Math.max(maxTs, x[i]);
      let sum = 0;
      if (Number.isFinite(maxTs))
        for (let i = ts; i < x.length; i++) sum += Math.exp(x[i] - maxTs);
      if (maxTs + Math.log(sum) > maxText) x.fill(-Infinity, 0, ts);
    }
  }
  return x;
}
export type DecodeRuntime<C> = {
  forward(
    ids: number[],
    cache?: C,
  ): Promise<{ logits: Float32Array; cache: C }>;
  clone(cache: C): Promise<C>;
  dispose(cache: C): Promise<void>;
};
type Hypothesis = {
  tokens: number[];
  sumLogprob: number;
  score: number;
  reason: "eos" | "limit";
};
export type DecodeTrace = {
  step: number;
  active: { tokens: number[]; sumLogprob: number }[];
  continuing: { parent: number; token: number; sumLogprob: number }[];
  candidates: { parent: number; token: number; sumLogprob: number }[];
  completed: number;
};
export type Options = {
  eos: number;
  beam: number;
  maxSteps: number;
  temperature: number;
  mask: (x: Float32Array, tokens: number[]) => Float32Array;
  random?: () => number;
  noSpeech?: number;
  onStep?: (step: number) => void;
};
function top(x: Float64Array, n: number) {
  const result: { token: number; logprob: number }[] = [];
  for (let i = 0; i < x.length; i++)
    if (
      Number.isFinite(x[i]) &&
      (result.length < n || x[i] > result.at(-1)!.logprob)
    ) {
      result.push({ token: i, logprob: x[i] });
      result.sort((a, b) => b.logprob - a.logprob || a.token - b.token);
      if (result.length > n) result.pop();
    }
  return result;
}
function sample(logprobs: Float64Array, t: number, random: () => number) {
  const scaled = logSoftmax(Float64Array.from(logprobs, (x) => x / t));
  let draw = random();
  for (let i = 0; i < scaled.length; i++) {
    const probability = Math.exp(scaled[i]);
    if (probability > 0 && draw < probability) return i;
    draw -= probability;
  }
  for (let i = scaled.length - 1; i >= 0; i--)
    if (Number.isFinite(scaled[i])) return i;
  throw Error("Sampling has no finite candidate");
}
export async function search<C>(
  runtime: DecodeRuntime<C>,
  prompt: number[],
  options: Options,
) {
  const { eos, beam, maxSteps, temperature, mask } = options;
  if (maxSteps < 1 || beam < 1) throw Error("Invalid decoder budget");
  const owned = new Set<C>();
  const drop = async (c: C) => {
    if (owned.delete(c)) await runtime.dispose(c);
  };
  const clone = async (c: C) => {
    const v = await runtime.clone(c);
    owned.add(v);
    return v;
  };
  const forward = async (ids: number[], c?: C) => {
    const out = await runtime.forward(ids, c);
    owned.add(out.cache);
    if (c !== undefined && c !== out.cache) await drop(c);
    return out;
  };
  const finished: Hypothesis[] = [],
    trace: DecodeTrace[] = [];
  let noSpeech = 0;
  try {
    const root = await forward(prompt);
    if (options.noSpeech !== undefined)
      noSpeech = Math.exp(logSoftmax(root.logits)[options.noSpeech]);
    let beams = [{ tokens: [] as number[], sum: 0, ...root }];
    if (temperature > 0) {
      beams = [];
      for (let i = 0; i < beam; i++)
        beams.push({
          tokens: [],
          sum: 0,
          logits: root.logits,
          cache: await clone(root.cache),
        });
      await drop(root.cache);
    }
    for (let step = 0; step < maxSteps; step++) {
      options.onStep?.(step);
      const candidates: {
        parent: number;
        token: number;
        sumLogprob: number;
      }[] = [];
      for (let parent = 0; parent < beams.length; parent++) {
        const b = beams[parent],
          lp = logSoftmax(mask(b.logits, b.tokens));
        const picks =
          temperature > 0
            ? [
                {
                  token: sample(lp, temperature, options.random ?? Math.random),
                  logprob: 0,
                },
              ]
            : top(lp, beam * 2);
        for (const p of picks)
          candidates.push({
            parent,
            token: p.token,
            sumLogprob: b.sum + lp[p.token],
          });
      }
      if (temperature === 0)
        candidates.sort(
          (a, b) =>
            b.sumLogprob - a.sumLogprob ||
            a.parent - b.parent ||
            a.token - b.token,
        );
      const ranked =
        temperature > 0 ? candidates : candidates.slice(0, beam * 2);
      const selected = ranked.slice(0, beam),
        continuing: typeof selected = [];
      let secondary = beam;
      for (const c of selected) {
        const tokens = [
          ...beams[c.parent].tokens,
          ...(c.token === eos ? [] : [c.token]),
        ];
        if (c.token === eos || step === maxSteps - 1) {
          finished.push({
            tokens,
            sumLogprob: c.sumLogprob,
            score: c.sumLogprob / Math.max(1, tokens.length),
            reason: c.token === eos ? "eos" : "limit",
          });
          if (temperature === 0) {
            while (secondary < ranked.length && ranked[secondary].token === eos)
              secondary++;
            if (secondary < ranked.length) continuing.push(ranked[secondary++]);
          }
        } else continuing.push(c);
      }
      trace.push({
        step,
        active: beams.map((b) => ({ tokens: b.tokens, sumLogprob: b.sum })),
        continuing,
        candidates: ranked,
        completed: finished.length,
      });
      if (
        step === maxSteps - 1 ||
        (temperature === 0 && finished.length >= beam) ||
        !continuing.length
      )
        break;
      const next = [];
      for (const c of continuing) {
        const parent = beams[c.parent],
          cache = await clone(parent.cache);
        const out = await forward([c.token], cache);
        next.push({
          tokens: [...parent.tokens, c.token],
          sum: c.sumLogprob,
          ...out,
        });
      }
      for (const b of beams) await drop(b.cache);
      beams = next;
    }
    finished.sort((a, b) => b.score - a.score);
    if (!finished.length)
      throw Error("Decoder produced no completed hypothesis");
    return {
      ...finished[0],
      noSpeech,
      avgLogprob: finished[0].sumLogprob / (finished[0].tokens.length + 1),
      finished,
      trace,
    };
  } finally {
    for (const c of owned) await drop(c);
  }
}
