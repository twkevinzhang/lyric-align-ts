export function threadConfig(value='1',poolValue='6') {
  if(!/^(?:[1-9]|1[0-2])$/.test(String(poolValue))) throw new Error('Worker pool must be an integer from 1 to 12');
  const poolSize=Number(poolValue);
  if(!/^(?:[1-9]|1[0-2])$/.test(String(value)) || Number(value)>poolSize) throw new Error('SONG_THREADS must fit the prewarmed worker pool');
  const threads=Number(value);
  return {threads,poolSize,helpersInCompute:threads-1};
}
export function selectThreads(measurements,poolSize=6){
  if(!measurements.length)throw new Error('No calibration measurements');
  const groups=new Map();
  for(const {threads,encoderMs} of measurements){threadConfig(threads,poolSize);if(!Number.isFinite(encoderMs)||encoderMs<=0)throw new Error('Invalid calibration duration');if(!groups.has(threads))groups.set(threads,[]);groups.get(threads).push(encoderMs);}
  const medians=[...groups].map(([threads,times])=>{times.sort((a,b)=>a-b);return{threads,ms:(times[Math.floor((times.length-1)/2)]+times[Math.floor(times.length/2)])/2};});
  const fastest=Math.min(...medians.map(x=>x.ms));
  return Math.min(...medians.filter(x=>x.ms<=fastest*1.05).map(x=>x.threads));
}
