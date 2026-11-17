"""Report all same-pool improvements and regressions without changing labels."""
import argparse
import json
import statistics
from pathlib import Path


def paired(rows):
    deltas={r['id']:r['selections']['b-coverage']['metrics']['knowledgeCoverageAt8']-
                     r['selections']['b']['metrics']['knowledgeCoverageAt8']
            for r in rows if r['scorable']}
    return dict(deltas=deltas,meanDelta=statistics.mean(deltas.values()) if deltas else None,
                improved=sum(x>0 for x in deltas.values()),degraded=sum(x<0 for x in deltas.values()),
                tied=sum(x==0 for x in deltas.values()))


def summarize(rows):
    scored=[r for r in rows if r['scorable']]
    quality={v:{m:statistics.mean(r['selections'][v]['metrics'][m] for r in scored)
                for m in ('knowledgeCoverageAt8','directPrecisionLowerBoundAt8','unjudgedCount','sourceCount')}
             for v in ('baseline','b','b-coverage')}
    return dict(cases=len(rows),scored=len(scored),quality=quality,paired=paired(rows),
                candidateOracle=statistics.mean(r['candidateKnowledgeUpperBound'] for r in scored),
                roundMeanMs=statistics.mean(r['roundRobinMs'] for r in rows),
                coverageMeanMs=statistics.mean(r['selectionDetails']['selection_ms'] for r in rows),
                fallbackCases=sum(r['mode']=='fallback' for r in rows))


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--run',type=Path,required=True)
    parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args()
    args.output.mkdir(parents=True,exist_ok=False)
    manifest=json.loads((args.run/'manifest.json').read_text('utf-8'))
    if not manifest.get('complete'): raise ValueError('Online comparison incomplete')
    fixed=[json.loads(l) for l in (args.run/'fixed.jsonl').read_text('utf-8').splitlines()]
    if not all(r['historicalRoundRobinEquality'] for r in fixed):
        raise ValueError('Historical equality failure')
    report={'fixed':{},'fixedAll':summarize(fixed),'online':{},'candidate':manifest['head']}
    for group in dict.fromkeys(r['group'] for r in fixed):
        report['fixed'][group]=summarize([r for r in fixed if r['group']==group])
    live=[json.loads(l) for l in (args.run/'online-comparison.jsonl').read_text('utf-8').splitlines()]
    report['online']=summarize(live)
    trials=[r['liveTrial'] for r in live]
    diagnostics=[t['diagnostics'] for t in trials]
    report['online'].update(calls=sum(t['observedNetworkCalls'] for t in trials),
        inputTokens=sum(d['usage'].get('prompt_tokens',0) for d in diagnostics),
        outputTokens=sum(d['usage'].get('completion_tokens',0) for d in diagnostics),
        models=sorted({d['model_id'] for d in diagnostics}),
        promptHashes=sorted({d['prompt_hash'] for d in diagnostics}),cost=None,
        meanWallMs=statistics.mean(t['wallMs'] for t in trials),
        meanValidationMs=statistics.mean(t['validationMs'] for t in trials),
        stageMeanMs={key:statistics.mean(d['stage_times_ms'].get(key,0) for d in diagnostics)
                     for key in ('planning','retrieval_merge','source_selection')},
        errors=sum(t['status']=='error' for t in trials))
    audit=['# Coverage 全部同池查询（全部为探索性，非独立人工评审）','']
    for experiment,rows in [('fixed',fixed),('fresh',live)]:
        for row in rows:
            audit += ['## '+experiment+'/'+row['id'],json.dumps(row['request'],ensure_ascii=False)]
            for v in ('baseline','b','b-coverage'):
                selected=row['selections'][v]
                audit.append(v+' KC='+str(selected['metrics']['knowledgeCoverageAt8']))
                audit.extend(f"- {s['key'][0]}:{s['key'][1]} {s['title']} [{s['grade']}]"
                             for s in selected['scoredSources'])
            audit += ['pool KC oracle='+str(row['candidateKnowledgeUpperBound']),'']
    (args.output/'all-query-audit.md').write_text('\n'.join(audit),'utf-8')
    (args.output/'summary.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),'utf-8')
    print(json.dumps(report,ensure_ascii=False,indent=2))


if __name__=='__main__': main()
