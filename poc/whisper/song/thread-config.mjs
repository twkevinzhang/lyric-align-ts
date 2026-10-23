export function threadConfig(value='1') {
  if(!/^[1-6]$/.test(String(value))) throw new Error('SONG_THREADS must be an integer from 1 to 6');
  const threads=Number(value);
  return {threads,poolSize:6,helpersInCompute:threads-1};
}
export function selectThreads(measurements){
  if(!measurements.length)throw new Error('No calibration measurements');
  const groups=new Map();
  for(const {threads,encoderMs} of measurements){threadConfig(threads);if(!Number.isFinite(encoderMs)||encoderMs<=0)throw new Error('Invalid calibration duration');if(!groups.has(threads))groups.set(threads,[]);groups.get(threads).push(encoderMs);}
  const medians=[...groups].map(([threads,times])=>{times.sort((a,b)=>a-b);return{threads,ms:(times[Math.floor((times.length-1)/2)]+times[Math.floor(times.length/2)])/2};});
  const fastest=Math.min(...medians.map(x=>x.ms));
  return Math.min(...medians.filter(x=>x.ms<=fastest*1.05).map(x=>x.threads));
}
