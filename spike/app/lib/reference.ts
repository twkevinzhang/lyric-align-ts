export type Cue = { id: number; start: number; end: number; text: string };
export type LineReference = { lineIndex: number; start: number | null };

export function referenceApplies(
  selectedAudioHash: string | undefined,
  resultAudioHash: string | undefined,
  referenceAudioHash: string | undefined,
  lyrics: string[],
  referenceLyrics: string[],
): boolean {
  return Boolean(
    selectedAudioHash &&
    selectedAudioHash === resultAudioHash &&
    resultAudioHash === referenceAudioHash &&
    lyrics.length === referenceLyrics.length &&
    lyrics.every((line, index) => line === referenceLyrics[index]),
  );
}

function timestamp(value: string): number {
  const match = /^(\d{2,}):(\d{2}):(\d{2})[,.](\d{3})$/.exec(value);
  if (!match || Number(match[2]) > 59 || Number(match[3]) > 59)
    throw new Error(`Invalid SRT timestamp: ${value}`);
  return (
    Number(match[1]) * 3600 +
    Number(match[2]) * 60 +
    Number(match[3]) +
    Number(match[4]) / 1000
  );
}

export function parseSrt(text: string): Cue[] {
  const normalized = text
    .replace(/^\uFEFF/, "")
    .replaceAll("\r\n", "\n")
    .trim();
  if (!normalized) return [];
  return normalized.split(/\n\s*\n/).map((block) => {
    const lines = block.split("\n");
    const id = Number(lines.shift());
    const match = /^(\S+)\s+-->\s+(\S+)(?:\s+.*)?$/.exec(lines.shift() ?? "");
    if (!Number.isInteger(id) || !match || !lines.length)
      throw new Error("Invalid SRT cue");
    const start = timestamp(match[1]),
      end = timestamp(match[2]);
    if (end <= start) throw new Error(`Invalid SRT range in cue ${id}`);
    return { id, start, end, text: lines.map((line) => line.trim()).join(" ") };
  });
}

/** Error statistics apply only to matched lines; success rates use all eligible references. */
export function scoreLineStarts(
  lines: { start: number | null; matched: boolean }[],
  references: LineReference[],
) {
  const seen = new Set<number>();
  const rows = references.map((ref) => {
    if (
      seen.has(ref.lineIndex) ||
      !Number.isInteger(ref.lineIndex) ||
      !lines[ref.lineIndex]
    )
      throw new Error("Invalid or duplicate reference line index");
    seen.add(ref.lineIndex);
    if (ref.start !== null && (!Number.isFinite(ref.start) || ref.start < 0))
      throw new Error("Invalid reference start");
    const predicted = lines[ref.lineIndex];
    const matched =
      predicted.matched &&
      predicted.start !== null &&
      Number.isFinite(predicted.start);
    return {
      lineIndex: ref.lineIndex,
      referenceStart: ref.start,
      predictedStart: predicted.start,
      matched,
      signedError:
        matched && ref.start !== null ? predicted.start! - ref.start : null,
    };
  });
  const eligible = rows.filter((r) => r.referenceStart !== null);
  const errors = eligible
    .filter((r) => r.signedError !== null)
    .map((r) => Math.abs(r.signedError!))
    .sort((a, b) => a - b);
  const withinHalfSecond = errors.filter((e) => e <= 0.5).length;
  const withinOneSecond = errors.filter((e) => e <= 1).length;
  const median = errors.length
    ? (errors[Math.floor((errors.length - 1) / 2)] +
        errors[Math.floor(errors.length / 2)]) /
      2
    : null;
  return {
    eligible: eligible.length,
    matched: errors.length,
    unmatched: eligible.length - errors.length,
    excluded: rows.length - eligible.length,
    withinHalfSecond,
    withinHalfSecondRate: eligible.length
      ? withinHalfSecond / eligible.length
      : null,
    withinOneSecond,
    withinOneSecondRate: eligible.length
      ? withinOneSecond / eligible.length
      : null,
    meanAbsError: errors.length
      ? errors.reduce((sum, e) => sum + e, 0) / errors.length
      : null,
    medianAbsError: median,
    p90AbsError: errors.length
      ? errors[Math.ceil(errors.length * 0.9) - 1]
      : null,
    worstAbsError: errors.at(-1) ?? null,
    percentileMethod: "nearest rank",
    rows,
  };
}
