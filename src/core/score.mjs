// Shared text normalization for monotonic lyric matching and evaluation.
export const normalize=text=>text.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
