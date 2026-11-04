// Relative sung-duration weight of lyric text. Kana are one mora each (small
// kana merge into the previous one), kanji are approximated as two moras
// because no reading dictionary is bundled, and Latin letters are fractions of
// a syllable. Only ratios between tokens matter.
const SMALL_KANA=/[ぁぃぅぇぉゃゅょゎァィゥェォャュョヮ]/u;
export function moraWeight(text){
 let weight=0;
 for(const char of text){
  if(SMALL_KANA.test(char))continue;
  if(/[぀-ヿ]/u.test(char))weight+=1;
  else if(/[一-鿿々]/u.test(char))weight+=2;
  else if(/[A-Za-z]/.test(char))weight+=.4;
  else if(/[0-9]/.test(char))weight+=1;
 }
 return weight;
}
// Byte-level tokens that do not decode alone share their character group's weight.
export function tokenMoraWeights(tokens,decode,floor=.25){
 const weights=[];let pending=[];
 for(const token of tokens){
  pending.push(token);const decoded=decode(pending);
  if(decoded.includes('�'))continue;
  const share=moraWeight(decoded)/pending.length;
  for(let i=0;i<pending.length;i++)weights.push(Math.max(floor,share));
  pending=[];
 }
 for(const _ of pending)weights.push(floor);
 return weights;
}
