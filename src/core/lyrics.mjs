// Only cross-script parenthetical translations after a Latin-only sung line.
export function naturalJapaneseSpacing(text){
  return text.replace(/([\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]) +(?=[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}])/gu,'$1');
}
// Japanese sung parentheticals and English refrains are deliberately preserved.
export function spokenLyrics(text){
  return text.replace(/([^\n]*[A-Za-z][^\n]*?)(?:[ \t]*\r?\n[ \t]*|[ \t]+)[(（]([^()（）\n]+)[)）]/gu,(whole,sung,note)=>{
    const japanese=/[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u;
    return !japanese.test(sung)&&japanese.test(note)?sung.trimEnd():whole;
  });
}
