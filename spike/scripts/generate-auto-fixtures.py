"""Usage: python scripts/generate-auto-fixtures.py /path/to/pinned/lyric-align/src

Only imports the dependency-free pairing package; never executes ASR.
"""
import json,random,sys,hashlib
from pathlib import Path
src=Path(sys.argv[1]).resolve()
sys.path.insert(0,str(src))
from lyric_align import Segment,align
from lyric_align.anchor import auto_pairing
from lyric_align.breath import split_words_by_breath
from lyric_align.model import Word
random.seed(314159)
cases=[]
for i in range(120):
    n=random.randint(0,8)
    lines=[random.choice(['Rain','open the gate','hello','a!','雨空',' x y ','A\tB','']) for _ in range(random.randint(0,15))]
    segments=[]
    for j in range(n):
        text=' '.join(random.choices(lines or ['other'],k=random.randint(1,3)))
        words=[dict(word=w,start=j*10+k,end=j*10+k+random.choice([0.2,0.5,1,1.1])) for k,w in enumerate(text.split())]
        segments.append(dict(text=text,start=j*10,end=j*10+9,words=words if i%4 else []))
    result=align([Segment.from_dict(s) for s in segments],lines,pairing='auto',window=4,karaoke=False)
    cases.append(dict(segments=segments,lyrics=lines,pairing=auto_pairing(lines,segments),expected=[dict(line=r.line,start=r.start,end=r.end,score=r.score,matched=r.matched)for r in result]))
breath=[]
for n in range(0,8):
 for count in range(0,6):
    words=[Word(k,k+0.5,str(k))for k in range(n)]
    lines=['a!'*(i+1)for i in range(count)]
    groups=split_words_by_breath(words,lines)
    breath.append(dict(words=[dict(word=w.word,start=w.start,end=w.end)for w in words],lines=lines,expected=[[w.word for w in g]for g in groups]))
hashes={name:hashlib.sha256((src/'lyric_align'/name).read_bytes()).hexdigest()for name in ['anchor.py','breath.py','normalize.py']}
output=Path(__file__).resolve().parents[1]/'app/lib/fixtures/upstream-auto.json'
output.write_text(json.dumps(dict(source='lyric-align ebe62d8; unmodified anchor.py/breath.py, no ASR executed',sourceHashes=hashes,cases=cases,breath=breath),ensure_ascii=False,indent=2),encoding='utf8')
