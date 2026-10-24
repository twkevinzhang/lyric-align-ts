import { mapTimelineToCues } from './core/timeline-cues.mjs';
import type { Cue, TimelineEntry } from './types.ts';

/** Map supplied lyric lines without consulting any reference timestamps. */
export function timelineToCues(lyrics: string[], words: TimelineEntry[], audioSeconds: number): Cue[] {
  return mapTimelineToCues(lyrics, words, audioSeconds);
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
