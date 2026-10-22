export function parseLyrics(text: string): string[] {
  return text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(
      (s) =>
        s &&
        !s.startsWith("#") &&
        !/^\[[^\]]+\]\s*(?:\([^)]*\)|（[^）]*）)?\s*$/u.test(s),
    );
}
