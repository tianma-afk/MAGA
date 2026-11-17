"""Summarize new paired trials and explicitly separate historical online references."""
import argparse
import importlib.util
import json
import statistics
from pathlib import Path


def load(path):
    spec = importlib.util.spec_from_file_location('shared_analysis',path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def read(path):
    return [json.loads(l) for l in path.read_text('utf-8').splitlines()]


def summarize(rows):
    scored = [r for r in rows if r['scorable']]
    first = [r['trials'][0] for r in rows]
    diagnostics = [t['diagnostics'] for t in first if t['diagnostics']]
    quality = {m:statistics.mean(r['trials'][0]['metrics'][m] for r in scored)
               for m in ('directPrecisionLowerBoundAt8','knowledgeCoverageAt8','unjudgedCount')}
    return dict(quality=quality,scored=len(scored),cases=len(rows),
        wallMeanMs=statistics.mean(t['wallMs'] for t in first),
        planningMeanMs=statistics.mean(d['stage_times_ms'].get('planning',0) for d in diagnostics),
        retrievalMeanMs=statistics.mean(d['stage_times_ms'].get('retrieval_merge',d['stage_times_ms'].get('legacy_selection',0)) for d in diagnostics),
        validationMeanMs=statistics.mean(t['validationMs'] for t in first),
        errors=sum(t['status']=='error' for t in first),
        fallbacks=sum(d['mode']=='fallback' for d in diagnostics),
        inputTokens=sum(d['usage'].get('prompt_tokens',0) for d in diagnostics),
        outputTokens=sum(d['usage'].get('completion_tokens',0) for d in diagnostics),
        usageUnknown=sum(bool(d['llm_calls']) and not d['usage'] for d in diagnostics),
        calls=sum(t.get('observedNetworkCalls',0) for t in first),
        maxJaccardMean=statistics.mean(t['diversity']['maximumTextJaccard'] or 0 for t in first),
        models=sorted({d['model_id'] for d in diagnostics if d['model_id']}),
        cost=None if any(d['llm_calls'] for d in diagnostics) else 0)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--run',type=Path,required=True)
    parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args()
    args.output.mkdir(parents=True,exist_ok=False)
    root=Path(__file__).resolve().parents[1]
    shared=load(root/'scripts/analyze-design-comparison.py')
    freeze=json.loads((args.run/'freeze.json').read_text('utf-8'))
    if not freeze['complete']: raise ValueError('Incomplete formal run')
    groups={}
    for phase in ('new-dev','new-test'):
        groups[phase]={v:read(args.run/phase/v/'rows.jsonl') for v in ('baseline','b','b-v2')}
    # Historical B is saved online output, not a current-run replay or fresh trial.
    old=root/'data/verification/p3t3-comparison-20261116-v1'
    for phase,split in [('history-dev','dev'),('history-holdout','holdout')]:
        groups[phase]={v:read(old/split/v/'rows.jsonl') for v in ('baseline','b')}
        groups[phase]['b-v2']=read(args.run/phase/'b-v2/rows.jsonl')
    supp=root/'data/verification/p3t4-supplement-20261117-v1'
    groups['history-s']={v:read(supp/v/'rows.jsonl') for v in ('baseline','b')}
    groups['history-s']['b-v2']=read(args.run/'history-s/b-v2/rows.jsonl')
    report={'summary':{},'paired':{},'versions':freeze['versions'],
            'historicalCaveat':'Baseline/B历史online首遍引用，B-v2本轮fresh；历史时延非同轮对照'}
    for phase,variants in groups.items():
        report['summary'][phase]={v:summarize(rows) for v,rows in variants.items()}
        report['paired'][phase]={}
        for a,b in [('b','baseline'),('b-v2','baseline'),('b-v2','b')]:
            report['paired'][phase][a+'-'+b]={m:shared.paired(variants[a],variants[b],m)
                for m in ('directPrecisionLowerBoundAt8','knowledgeCoverageAt8')}
    (args.output/'summary.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),'utf-8')
    lines=['# B-v2 全部查询与未审来源（自动汇总，未人工确认）','']
    for phase,variants in groups.items():
        for v,rows in variants.items():
            lines += ['## '+phase+'/'+v,'']
            for r in rows:
                t=r['trials'][0]
                lines += ['### '+r['id'],json.dumps(r['request'],ensure_ascii=False),
                          'KC8='+str(t['metrics']['knowledgeCoverageAt8'])]
                for s in t['scoredSources']:
                    lines.append(f"- {s['key'][0]}:{s['key'][1]} {s['title']} [{s['grade']}]")
    (args.output/'all-query-audit.md').write_text('\n'.join(lines),'utf-8')
    print(json.dumps(report['summary'],ensure_ascii=False,indent=2))


if __name__=='__main__': main()
