export function packDecode(result){
  let floats=0;
  const qks=result.decodedTokensCrossAttentionQKs.map(q=>{
    if(!q)return null;
    const entry={dimensions:q.dimensions.map(Number),offset:floats,length:q.data.length};floats+=q.data.length;return entry;
  });
  const {decodedTokensCrossAttentionQKs,decodedTokensTimestampLogits,...rest}=result;
  const header=new TextEncoder().encode(JSON.stringify({...rest,qks}));
  const padded=(header.length+3)&~3;
  const bytes=new Uint8Array(4+padded+floats*4);
  new DataView(bytes.buffer).setUint32(0,header.length,true);bytes.set(header,4);
  const values=new Float32Array(bytes.buffer,4+padded);
  decodedTokensCrossAttentionQKs.forEach((q,i)=>{if(q)values.set(q.data,qks[i].offset);});
  return bytes;
}
export function unpackDecode(input){
  const bytes=Uint8Array.from(input),view=new DataView(bytes.buffer);
  const size=view.getUint32(0,true),padded=(size+3)&~3;
  if(size>bytes.length-4||4+padded>bytes.length)throw Error('Invalid decode header');
  const {qks,...rest}=JSON.parse(new TextDecoder().decode(bytes.subarray(4,4+size)));
  const values=new Float32Array(bytes.buffer,4+padded);
  return {...rest,decodedTokensCrossAttentionQKs:qks.map(q=>{
    if(!q)return undefined;
    if(q.offset<0||q.length!==q.dimensions.reduce((a,b)=>a*b,1)||q.offset+q.length>values.length)throw Error('Invalid attention span');
    return {dimensions:q.dimensions.map(BigInt),data:values.slice(q.offset,q.offset+q.length)};
  })};
}
