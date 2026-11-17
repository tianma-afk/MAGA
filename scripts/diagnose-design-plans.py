import argparse
import json
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from server.chapters import ChapterStore
from server.search import search_all

parser=argparse.ArgumentParser()
parser.add_argument("--output",type=Path,required=True)
args=parser.parse_args()
root=Path(__file__).resolve().parents[1]
store=ChapterStore(root/'book',root/'data/slides')
old=root/'data/verification/p3t3-comparison-20261116-v1'
supp=root/'data/verification/p3t4-supplement-20261117-v1'
fixture=json.loads((root/'docs/fixtures/iteration3-design-needs-v4.json').read_text('utf-8'))
supp_fixture=json.loads((root/'docs/fixtures/iteration3-decision-supplement.json').read_text('utf-8'))
result=[]
for location,split,f,cases in [(old/'dev/b/rows.jsonl','dev',fixture,{'N01','N02','N03','N06'}),
                             (old/'holdout/b/rows.jsonl','holdout',fixture,{'N13','N14','N15'}),
                             (supp/'b/rows.jsonl','supp',supp_fixture,{'S01','S02','S03'})]:
    for line in location.read_text('utf-8').splitlines():
        row=json.loads(line)
        if row['id'] not in cases: continue
        case=next(c for c in f['cases'] if c['id']==row['id'])
        diagnostic=row['trials'][0]['diagnostics']
        pools=[]
        for query in diagnostic['queries']:
            pages=search_all(store,' '.join(query.split())[:2000],8).results
            pools.append({'query':query,'ids':[[p.chapterId,p.slide] for p in pages]})
        union={tuple(x) for p in pools for x in p['ids']}
        selected={(s['chapterId'],s['slide']) for s in row['trials'][0]['sources']}
        knowledge={}
        for topic in case['knowledge']:
            pages={(c,n) for c,ns in f['topics'][topic]['pages'].items() for n in ns}
            knowledge[topic]={'inPool':sorted(pages&union),'selected':sorted(pages&selected)}
        result.append({'id':row['id'],'split':split,'mode':diagnostic['mode'],
                       'reason':diagnostic['reason'],'plan':diagnostic.get('plan'),
                       'pools':pools,'knowledge':knowledge})
dest=args.output
if dest.exists(): raise ValueError('Refuse overwrite')
dest.write_text(json.dumps({'type':'offline-query-pool-replay','realCalls':0,'rows':result},ensure_ascii=False,indent=2),'utf-8')
print(json.dumps([{k:r[k] for k in ('id','knowledge')} for r in result],ensure_ascii=False,indent=2))
