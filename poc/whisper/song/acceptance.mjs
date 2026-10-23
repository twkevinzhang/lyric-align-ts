export function acceptance(seconds, rows) {
  if (!Number.isFinite(seconds) || seconds<0 || !rows.length || rows.some(r=>!r.usable || !Number.isFinite(r.startError))) {
    return {pass:false,reason:'耗時或字幕句首無效'};
  }
  const sorted=rows.map((r,index)=>({line:index+1,error:Math.abs(r.startError)})).sort((a,b)=>b.error-a.error||a.line-b.line);
  const excluded=sorted.slice(0,Math.floor(rows.length*0.1));
  const retained=sorted.slice(excluded.length);
  const meanAbs=retained.reduce((s,r)=>s+r.error,0)/retained.length;
  return {pass:seconds<=40&&meanAbs<=1,timePass:seconds<=40,qualityPass:meanAbs<=1,seconds,excluded,retainedCount:retained.length,meanAbs};
}
