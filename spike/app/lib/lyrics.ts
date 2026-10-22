export function parseLyrics(text: string): string[] {
  return text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(
      (s) =>
        s &&
        !s.startsWith("#") &&
        !/^[[(](?:[^[\]()]{0,40})[\])]$/u.test(s) &&
        !/^\[[^[\]()]{1,40}\](?:\s*(?:\([^()]*\)|（[^（）]*）))+$/u.test(s),
    );
}
