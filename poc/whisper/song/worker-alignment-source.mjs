export function workerAlignmentSource(Whisper,vectors,dtwSource,medianSource){
  const method=Whisper.prototype.findAlignmentPathFromCrossAttentionQKs.toString().replace(/^async findAlignmentPathFromCrossAttentionQKs\(/,'async function(');
  if(!method.startsWith('async function('))throw Error('Unexpected alignment method');
  const moduleBody=s=>s.replace(/^import .*;\r?\n/gm,'').replace(/\bexport (?=function|const|class)/g,'');
  return `(()=>{
    const logToStderr=()=>{};
    ${moduleBody(dtwSource)}
    ${moduleBody(medianSource)}
    const softmax=${vectors.softmax.toString()};
    const sumAndSumOfSquaresOfVector=${vectors.sumAndSumOfSquaresOfVector.toString()};
    const getIntegerRange=(start,end)=>Array.from({length:Math.max(0,end-start)},(_,i)=>start+i);
    const clip=(value,min,max)=>Math.max(min,Math.min(max,value));
    self.alignGuided=${method};
  })();`;
}
