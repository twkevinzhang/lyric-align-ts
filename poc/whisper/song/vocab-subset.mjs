export function vocabularySubset(tokens,endOfText,vocabSize){
  if(!Number.isInteger(endOfText)||endOfText<0||endOfText>=vocabSize)throw Error('Invalid vocabulary boundary');
  if(tokens.some(t=>!Number.isInteger(t)||t<0||t>=vocabSize))throw Error('Invalid lyric token');
  return Int32Array.from(new Set([...tokens,...Array.from({length:vocabSize-endOfText},(_,i)=>endOfText+i)])).sort();
}
