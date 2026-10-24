import { scoreCues } from './core/cue-score.mjs';
import type { Cue, TimelineEntry } from './types.ts';

/** Map supplied lyric lines without consulting any reference timestamps. */
export function timelineToCues(lyrics: string[], words: TimelineEntry[], audioSeconds: number): Cue[] {
  const rows = scoreCues({ timeline: words, audioSeconds }, lyrics.map(text => ({ text, start: 0 }))).rows;
  return rows.map((row: { line: number; text: string; start: number | null; end: number | null; usable: boolean }) => {
    const issues: string[] = [];
    if (!row.usable) issues.push('unmatched-text');
    if (row.start === null || row.end === null || !Number.isFinite(row.start) || !Number.isFinite(row.end)) issues.push('invalid-time');
    else {
      if (row.end === row.start) issues.push('zero-duration');
      if (row.end < row.start) issues.push('negative-duration');
      if (row.start < 0 || row.end > audioSeconds + 1e-8) issues.push('out-of-bounds');
    }
    return { id: row.line, text: row.text, start: row.start, end: row.end, matched: row.usable, issues };
  });
}
function timestamp(seconds: number): string {
  const total = Math.round(seconds * 1000);
  const pad = (n: number, width = 2) => String(n).padStart(width, '0');
  return `${pad(Math.floor(total / 3600000))}:${pad(Math.floor(total / 60000) % 60)}:${pad(Math.floor(total / 1000) % 60)},${pad(total % 1000, 3)}`;
}
/** Export valid intervals only; no guessed offsets or artificial duration padding. */
export function toSrt(cues: readonly Cue[]): string {
  return cues.filter(c => c.matched && c.issues.length === 0 && c.start !== null && c.end !== null && Number.isFinite(c.start) && Number.isFinite(c.end) && c.start >= 0 && Math.round(c.end * 1000) > Math.round(c.start * 1000))
    .map((c, i) => `${i + 1}\n${timestamp(c.start!)} --> ${timestamp(c.end!)}\n${c.text}\n`).join('\n');
}
