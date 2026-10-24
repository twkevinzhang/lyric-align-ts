export interface SourceCue { id: number; start: number; end: number; text: string }
function parseTimestamp(value: string): number {
  const match = /^(\d{2,}):(\d{2}):(\d{2})[,.](\d{3})$/.exec(value);
  if (!match || Number(match[2]) > 59 || Number(match[3]) > 59) throw new TypeError(`Invalid SRT timestamp: ${value}`);
  const seconds = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) + Number(match[4]) / 1000;
  if (!Number.isFinite(seconds)) throw new TypeError('SRT timestamp must be finite');
  return seconds;
}
/** Parse SRT; to align these lyrics, pass only .map(cue => cue.text) to align(). */
export function parseSrt(text: string): SourceCue[] {
  const normalized = text.replace(/^\uFEFF/, '').replaceAll('\r\n', '\n').trim();
  if (!normalized) return [];
  return normalized.split(/\n\s*\n/).map(block => {
    const lines = block.split('\n'), id = Number(lines.shift());
    const range = /^(\S+)\s+-->\s+(\S+)(?:\s+.*)?$/.exec(lines.shift() ?? '');
    if (!Number.isInteger(id) || !range || !lines.length) throw new TypeError('Invalid SRT cue');
    const start = parseTimestamp(range[1]), end = parseTimestamp(range[2]);
    if (end <= start) throw new TypeError(`Invalid SRT range in cue ${id}`);
    return { id, start, end, text: lines.map(line => line.trim()).join(' ') };
  });
}
