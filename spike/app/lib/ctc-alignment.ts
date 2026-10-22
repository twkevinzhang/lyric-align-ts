export type TokenSpan = {
  startFrame: number;
  endFrame: number;
  meanLogProbability: number;
};

/** Viterbi forced alignment. Target text is supplied, not recognized. No reference times. */
export function ctcAlign(
  logp: Float32Array,
  frames: number,
  vocab: number,
  target: number[],
  blank: number,
): TokenSpan[] {
  if (
    !target.length ||
    frames < 1 ||
    vocab < 2 ||
    logp.length !== frames * vocab ||
    target.some(
      (t) => !Number.isInteger(t) || t < 0 || t >= vocab || t === blank,
    )
  )
    throw new Error("Invalid CTC alignment inputs");
  const states = target.length * 2 + 1;
  if (frames * states > 32_000_000)
    throw new Error("CTC alignment exceeds this spike memory budget");
  const labels = Array.from({ length: states }, (_, s) =>
    s % 2 ? target[(s - 1) / 2] : blank,
  );
  const back = new Uint8Array(frames * states);
  let previous = new Float64Array(states).fill(-Infinity);
  previous[0] = 0;
  for (let t = 0; t < frames; t++) {
    const next = new Float64Array(states).fill(-Infinity);
    for (let s = 0; s < states; s++) {
      let score = previous[s],
        step = 0;
      if (s > 0 && previous[s - 1] > score) {
        score = previous[s - 1];
        step = 1;
      }
      if (
        s > 1 &&
        labels[s] !== blank &&
        labels[s] !== labels[s - 2] &&
        previous[s - 2] > score
      ) {
        score = previous[s - 2];
        step = 2;
      }
      const value = logp[t * vocab + labels[s]];
      if (!Number.isFinite(value))
        throw new Error("Non-finite CTC probability");
      next[s] = score + value;
      back[t * states + s] = step;
    }
    previous = next;
  }
  let state =
    previous[states - 1] > previous[states - 2] ? states - 1 : states - 2;
  if (!Number.isFinite(previous[state]))
    throw new Error("Target cannot fit the CTC frames");
  const spans = target.map(() => ({
    startFrame: Infinity,
    endFrame: -1,
    meanLogProbability: 0,
    count: 0,
  }));
  for (let t = frames - 1; t >= 0; t--) {
    if (state % 2) {
      const p = spans[(state - 1) / 2];
      p.startFrame = t;
      p.endFrame = Math.max(p.endFrame, t + 1);
      p.meanLogProbability += logp[t * vocab + labels[state]];
      p.count++;
    }
    state -= back[t * states + state];
  }
  return spans.map((p) => {
    if (!p.count) throw new Error("Unvisited target token");
    return {
      startFrame: p.startFrame,
      endFrame: p.endFrame,
      meanLogProbability: p.meanLogProbability / p.count,
    };
  });
}
