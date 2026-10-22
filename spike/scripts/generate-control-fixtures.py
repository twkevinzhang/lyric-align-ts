"""Usage: python scripts/generate-control-fixtures.py /path/to/faster_whisper/transcribe.py

Execute extracted pure source functions only; never import/run an ASR backend.
Requires NumPy for the original add_word_timestamps median calculation.
"""
import ast,json,types,random,copy,itertools,hashlib,sys,zlib
from pathlib import Path
import numpy as np
path=Path(sys.argv[1])
tree=ast.parse(path.read_text(encoding='utf8'))
names={'_split_segments_by_timestamps','get_prompt','add_word_timestamps'}
methods=[]
for node in tree.body:
 if isinstance(node,ast.ClassDef) and node.name=='WhisperModel':methods=[n for n in node.body if isinstance(n,ast.FunctionDef) and n.name in names]
pure=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='merge_punctuations']
module=ast.Module(body=[ast.ImportFrom(module='__future__',names=[ast.alias(name='annotations')],level=0),*pure,ast.ClassDef(name='Oracle',bases=[],keywords=[],body=methods,decorator_list=[])],type_ignores=[])
ast.fix_missing_locations(module)
scope={'np':np,'itertools':itertools}
exec(compile(module,str(path),'exec'),scope)
oracle=scope['Oracle']();oracle.time_precision=.02;oracle.input_stride=2;oracle.frames_per_second=100;oracle.max_length=448
tokenizer=types.SimpleNamespace(timestamp_begin=50363,eot=50256,sot_prev=50360,sot_sequence=[50257])
random.seed(271828);splits=[];words=[]
for i in range(150):
 seek=random.choice([0,3000,3001,4999]);size=random.choice([1,2,100,999,3000]);t=tokenizer.timestamp_begin
 tokens=random.choice([[],[t,1,t+20],[t,1,t+20,t+25,2],[t,1,t+20,t+25,2,t+40],[1,2],[t,1],[t,t]])
 segments,next_seek,single=oracle._split_segments_by_timestamps(tokenizer,tokens,seek/100,size,size/100,seek)
 splits.append(dict(tokens=tokens,seek=seek,size=size,expected=dict(segments=segments,seek=next_seek,singleEnding=single)))
for i in range(80):
 offset=random.choice([0,3,10]);count=random.choice([0,1,2,3,6]);alignment=[];text_tokens=[]
 for j in range(count):
  start=j*random.choice([.02,.2,1,3]);end=start+random.choice([0,.02,.2,.8,3]);text=random.choice([' hello',',','.', ' (',' world','!'])
  alignment.append(dict(word=text,tokens=[j+1],start=start,end=end,probability=.8));text_tokens.append(j+1)
 segments=[dict(seek=offset*100,start=offset+.5,end=offset+max(1,count),tokens=text_tokens)]
 oracle.find_alignment=lambda *args: [copy.deepcopy(alignment)]
 last=random.choice([0,offset,offset+1]);actual=[copy.deepcopy(segments)]
 oracle.add_word_timestamps(actual,tokenizer,None,3000,'"\'“¿([{-','"\'.。,，!！?？:：”)]}、',last)
 words.append(dict(segments=segments,alignment=alignment,lastSpeech=last,expected=actual[0]))
compression=[]
texts=['','hello world','repeat '*200,'雨空']
vocab=['one','two','three','four','five','six','seven','eight','nine','ten','x','zz','測試',' ','.']
for i in range(200):
 base=' '.join(random.choices(vocab,k=random.randint(1,20)))
 texts.append((base+' ')*random.randint(1,25)+' '.join(random.choices(vocab,k=random.randint(0,10))))
for text in texts:
 b=text.strip().encode('utf8');compressed=zlib.compress(b)
 compression.append(dict(text=text,compressedBytes=len(compressed),ratio=len(b)/len(compressed)))
out=dict(source='faster-whisper 1.2.1 pure AST-extracted functions, no model/backend import',sourceSha=hashlib.sha256(path.read_bytes()).hexdigest(),zlibVersion=zlib.ZLIB_RUNTIME_VERSION,splits=splits,words=words,compression=compression)
output=Path(__file__).resolve().parents[1]/'app/lib/fixtures/upstream-control.json'
output.write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf8')
