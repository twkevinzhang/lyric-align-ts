"""Read-only oracle: python compare-upstream.py UPSTREAM_SRC segments.json lyrics.txt.

UPSTREAM_SRC contains the pinned lyric_align package; no ASR dependencies needed.
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, sys.argv[1])
from lyric_align import Segment, align
from lyric_align.cli import read_lyrics

segments = json.loads(Path(sys.argv[2]).read_text(encoding="utf-8-sig"))
lyrics = read_lyrics(Path(sys.argv[3]))
pairing_arg = sys.argv[4] if len(sys.argv) > 4 else 'auto'
rows = align([Segment.from_dict(s) for s in segments], lyrics,
             pairing=(int(pairing_arg) if pairing_arg != 'auto' else 'auto'), window=4, karaoke=False)
print(json.dumps([dict(line=r.line, start=r.start, end=r.end,
                       score=r.score, matched=r.matched) for r in rows], ensure_ascii=False))
