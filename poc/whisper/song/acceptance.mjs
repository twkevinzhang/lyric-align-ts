export function acceptance(seconds, rows) {
  const timePass=Number.isFinite(seconds)&&seconds>=0&&seconds<=10;
  const sorted=rows.map((r,index)=>({line:r.line??index+1,
    error:r.usable&&Number.isFinite(r.startError)?Math.abs(r.startError):null,
    reason:r.usable&&Number.isFinite(r.startError)?'outlier':'invalid'}))
    .sort((a,b)=>(a.error===null?-Infinity:-a.error)-(b.error===null?-Infinity:-b.error)||a.line-b.line);
  const excluded=sorted.slice(0,Math.floor(rows.length*0.1));
  const retained=sorted.slice(excluded.length);
  const valid=retained.length>0&&retained.every(r=>r.error!==null);
  const meanAbs=valid?retained.reduce((s,r)=>s+r.error,0)/retained.length:null;
  const qualityPass=valid&&meanAbs<=1;
  return {pass:timePass&&qualityPass,timePass,qualityPass,seconds,excluded,retainedCount:retained.length,meanAbs};
}
