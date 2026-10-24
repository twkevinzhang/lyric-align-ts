import type { AlignedLine, AlignOptions, Segment, Word } from '../contract.ts';
import { libraryError } from '../binding.ts';

const normalize = (text: string): string[] => Array.from(text.normalize('NFKC').toLocaleLowerCase('und').replace(/[^\p{L}\p{N}]/gu, ''));
type Evidence = { char: string; start: number; end: number; unit: number };
function validTime(start: unknown, end: unknown): boolean {
  return typeof start === 'number' && typeof end === 'number' && Number.isFinite(start) && Number.isFinite(end) && start >= 0 && end > start;
}
function invalid(message: string): never { throw libraryError('INVALID_INPUT', message); }

/** Global monotonic text alignment. Timings come exclusively from ASR evidence. */
export function alignSegments(segments: readonly Segment[], lyrics: readonly string[], options: AlignOptions): AlignedLine[] {
  if (!Array.isArray(segments) || !Array.isArray(lyrics) || lyrics.some(line => typeof line !== 'string')) invalid('Expected segment and lyric arrays');
  if (!options || typeof options !== 'object') invalid('Expected alignment options');
  for (const key of Object.keys(options)) if (!['threshold','karaoke'].includes(key)) throw libraryError('UNSUPPORTED_OPTION', `Unsupported option: ${key}`);
  if (options.karaoke !== undefined && options.karaoke !== false) throw libraryError('UNSUPPORTED_OPTION', 'Only karaoke=false is supported');
  const threshold = options.threshold ?? .65;
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) invalid('threshold must be between 0 and 1');
  const evidence: Evidence[] = [];
  let previous = -1, unitId = 0;
  for (const segment of segments) {
    if (!segment || typeof segment.text !== 'string' || !validTime(segment.start, segment.end) || segment.start < previous) invalid('Invalid or unordered ASR segment');
    previous = segment.start;
    if (segment.words !== undefined && !Array.isArray(segment.words)) invalid('Expected ASR word array');
    const units = segment.words?.length ? segment.words.map((w: Word) => {
      if (!w || typeof w !== 'object') invalid('Invalid ASR word');
      return {text:w.word,start:w.start,end:w.end};
    }) : [segment];
    let wordStart = segment.start;
    for (const unit of units) {
      if (typeof unit.text !== 'string' || !validTime(unit.start, unit.end) || unit.start < wordStart || unit.start < segment.start || unit.end > segment.end) invalid('Invalid or unordered ASR word');
      wordStart = unit.start;
      const id = unitId++;
      for (const char of normalize(unit.text)) evidence.push({ char, start: unit.start, end: unit.end, unit: id });
    }
  }
  const lines = lyrics.map(normalize), target = lines.flat(), width = evidence.length + 1;
  const cells = (target.length + 1) * width;
  // Reject explicitly instead of silently dropping the tail of a long song.
  if (cells > 64_000_000) invalid('Text alignment exceeds 64 million cells; reduce ASR/lyric text size');
  const trace = new Uint8Array(cells);
  let row = Int32Array.from({length: width}, (_, j) => -j), next = new Int32Array(width);
  for (let i = 1; i <= target.length; i++) {
    next[0] = -i;
    for (let j = 1; j < width; j++) {
      const diagonal = row[j-1] + (target[i-1] === evidence[j-1].char ? 2 : -2);
      const up = row[j] - 1, left = next[j-1] - 1;
      next[j] = Math.max(diagonal, up, left);
      trace[i*width+j] = diagonal >= up && diagonal >= left ? 1 : up >= left ? 2 : 3;
    }
    [row, next] = [next, row];
  }
  const mapping = new Int32Array(target.length).fill(-1);
  let i = target.length, j = evidence.length;
  while (i > 0 && j > 0) {
    const direction = trace[i*width+j];
    if (direction === 1) { mapping[--i] = --j; }
    else if (direction === 2) i--;
    else j--;
  }
  let offset = 0;
  const unitsByLine: Set<number>[] = [];
  const result = lyrics.map((line, index) => {
    const chars = lines[index], positions = mapping.subarray(offset, offset + chars.length); offset += chars.length;
    const assigned = Array.from(positions).filter(p => p >= 0);
    let score = 0, start: number | null = null, end: number | null = null;
    const units = new Set<number>(); unitsByLine.push(units);
    if (chars.length && assigned.length) {
      const first = assigned[0], last = assigned.at(-1)!;
      let equal = 0;
      for (let k = 0; k < positions.length; k++) if (positions[k] >= 0 && chars[k] === evidence[positions[k]].char) equal++;
      score = equal / Math.max(chars.length, last - first + 1);
      if (equal > 0 && score >= threshold) {
        start = evidence[first].start;
        end = 0;
        for (let p = first; p <= last; p++) { units.add(evidence[p].unit); end = Math.max(end,evidence[p].end); }
      }
    }
    return { line, start, end, score, matched: start !== null && end !== null };
  });
  const owners = new Map<number, number[]>();
  unitsByLine.forEach((units,line) => { for (const unit of units) { const lines = owners.get(unit) ?? []; lines.push(line); owners.set(unit,lines); } });
  // One coarse word/segment cannot independently locate multiple lyric lines.
  // Preserve legitimate overlap between distinct ASR units, but never split or
  // interpolate timing inside a unit that has no finer timing evidence.
  for (const lines of owners.values()) if (lines.length > 1) for (const line of lines) Object.assign(result[line],{start:null,end:null,matched:false});
  return result;
}
