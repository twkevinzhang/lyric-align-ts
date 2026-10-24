// Research gate: all reference lines count, independently for starts and ends.
export function boundaryErrors(rows,reference,audioSeconds){
 return rows.map(row=>({...row,startError:row.error,
  endError:row.usable&&Number.isFinite(row.start)&&Number.isFinite(row.end)&&
   Number.isFinite(audioSeconds)&&row.end>=row.start&&row.end<=audioSeconds&&
   Number.isFinite(reference[row.line-1]?.end)?row.end-reference[row.line-1].end:null}));
}
export function boundaryAcceptance(seconds,rows,maximumSeconds=3){
 const total=rows.length,required=Math.ceil(total*0.85);
 const boundary=key=>{
  const values=rows.filter(r=>r.usable&&Number.isFinite(r[key])).map(r=>Math.abs(r[key]));
  const withinOne=values.filter(error=>error<1).length;
  return {withinOne,invalid:total-values.length,
   meanAbs:total>0&&values.length===total?values.reduce((sum,value)=>sum+value,0)/total:null,
   pass:total>0&&withinOne>=required};
 };
 const start=boundary('startError'),end=boundary('endError');
 const timePass=Number.isFinite(seconds)&&seconds>=0&&Number.isFinite(maximumSeconds)&&maximumSeconds>=0&&seconds<=maximumSeconds;
 const qualityPass=start.pass&&end.pass;
 return {pass:timePass&&qualityPass,timePass,qualityPass,seconds,total,required,start,end};
}
