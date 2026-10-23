const models={
  small:{heads:10,sha256:'ae85e4a935d7a567bd102fe55afc16bb595bdb618e11b2fc7591bc08120411bb'},
  base:{heads:8,sha256:'422f1ae452ade6f30a004d7e5c6a43195e4433bc370bf23fac9cc591f01a8898'},
  tiny:{heads:6,sha256:'818710568da3ca15689e31a743197b520007872ff9576237bda97bd1b469c3d7'},
};
export function inferenceConfig(env=process.env){
  const model=env.SONG_MODEL??'small';
  if(!Object.hasOwn(models,model))throw Error('SONG_MODEL must be small, base, or tiny');
  const precision=env.SONG_MODEL_PRECISION??'q5_1';
  if(!['q5_1','f16'].includes(precision)||(precision==='f16'&&model!=='tiny'))throw Error('Unsupported model precision');
  const endTokenThreshold=Number(env.SONG_END_THRESHOLD??'0.9');
  if(!Number.isFinite(endTokenThreshold)||endTokenThreshold<0||endTokenThreshold>1)throw Error('Invalid end-token threshold');
  const workerTokenBudget=Number(env.SONG_WORKER_TOKEN_BUDGET??'220');
  if(!Number.isInteger(workerTokenBudget)||workerTokenBudget<1||workerTokenBudget>444)throw Error('Invalid worker token budget');
  const weights=precision==='f16'?{file:'ggml-tiny.bin',sha256:'be07e048e1e599ad46341c8d2a135645097a538221678b7acdd1b1919c6e1b21'}:{file:`ggml-${model}-q5_1.bin`};
  return {model,precision,...models[model],...weights,endTokenThreshold,workerTokenBudget};
}
