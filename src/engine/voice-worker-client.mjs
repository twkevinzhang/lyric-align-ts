export async function createVoiceWorker(url,moduleUrl,WorkerClass=Worker){
 const worker=new WorkerClass(url),pending=new Map();let next=0,closed=false;
 const dispose=(error=new Error('Voice worker disposed'))=>{
  if(closed)return;closed=true;worker.terminate();
  for(const request of pending.values())request.reject(error);pending.clear();
 };
 worker.onmessage=({data})=>{const request=pending.get(data.id);if(!request)return;pending.delete(data.id);data.error?request.reject(new Error(data.error)):request.resolve(data.result);};
 worker.onerror=event=>dispose(new Error(event.message||'Voice worker failed'));
 const request=(type,payload,transfer=[])=>new Promise((resolve,reject)=>{
  if(closed){reject(new Error('Voice worker disposed'));return;}
  const id=++next;pending.set(id,{resolve,reject});
  try{worker.postMessage({id,type,...payload},transfer);}catch(error){pending.delete(id);reject(error);}
 });
 try{await request('initialize',{moduleUrl});}catch(error){dispose(error);throw error;}
 return {infer(audio){const copy=audio.slice();return request('infer',{audio:copy},[copy.buffer]);},dispose};
}
