import {voiceProbabilities} from './voice-runtime.mjs';
let module;
self.onmessage=async({data})=>{
 try{
  let result;
  if(data.type==='initialize'){const imported=await import(data.moduleUrl);module=await imported.default();result={ready:true};}
  else if(data.type==='infer'){
   if(!module)throw Error('Voice model not initialized');
   const start=performance.now(),signal=voiceProbabilities(module,data.audio);
   result={signal,seconds:(performance.now()-start)/1000};
  }else throw Error('Unknown voice request');
  self.postMessage({id:data.id,result});
 }catch(error){self.postMessage({id:data.id,error:String(error)});}
};
