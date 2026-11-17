"""Separate sensitivity regrading of saved sources; never reruns old retrieval."""
import argparse
import copy
import importlib.util
import json
import statistics
from pathlib import Path


def regrade(row, fixture, strict=False, availability_pages=()):
    topics = copy.deepcopy(fixture['topics'])
    if strict:
        topics['response_capacity']['pages'] = {'chapter-8': [28, 29, 30]}
    topics['availability']['pages']['chapter-5'] += list(availability_pages)
    case = next(c for c in fixture['cases'] if c['id'] == row['id'])
    expected = [{(c, n) for c, ns in topics[t]['pages'].items() for n in ns} for t in case['knowledge']]
    direct = set().union(*expected) if expected else set()
    grades = copy.deepcopy(row['trials'][0]['scoredSources'])
    for source in grades:
        if source['grade'] == 'unusable':
            continue
        if tuple(source['key']) in direct:
            source['grade'] = 'direct'
        elif source['grade'] == 'direct':
            source['grade'] = 'unjudged'
    count = sum(s['grade'] == 'direct' for s in grades)
    coverage = sum(any(tuple(s['key']) in pages and s['grade'] == 'direct' for s in grades)
                   for pages in expected) / len(expected) if expected else None
    return {'P8Lower': count / 8, 'KC8': coverage}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=False)
    root = Path(__file__).resolve().parents[1]
    fixture = json.loads((root/'docs/fixtures/iteration3-design-needs-v4.json').read_text('utf-8'))
    run = root/'data/verification/p3t3-comparison-20261116-v1'
    scenarios = {'original': (False, ()), 'strict_capacity': (True, ()),
                 'accept_tactic_map': (False, (13,)), 'strict_plus_tactic_map': (True, (13,)),
                 'broad_availability_upper': (False, (7, 13))}
    sensitivity = {}
    for name, (strict, extra) in scenarios.items():
        sensitivity[name] = {}
        for split in ('dev', 'holdout'):
            sensitivity[name][split] = {}
            for v in ('baseline','a','b','c'):
                rows = [json.loads(l) for l in (run/split/v/'rows.jsonl').read_text('utf-8').splitlines()]
                values = {r['id']: regrade(r,fixture,strict,extra) for r in rows if r['scorable']}
                sensitivity[name][split][v] = {'queries': values,
                    'P8Lower': statistics.mean(r['P8Lower'] for r in values.values()),
                    'KC8': statistics.mean(r['KC8'] for r in values.values())}
    supplement = root/'data/verification/p3t4-supplement-20261117-v1'
    summary = {}
    all_rows = {}
    for v in ('baseline','a','b','c'):
        rows = [json.loads(l) for l in (supplement/v/'rows.jsonl').read_text('utf-8').splitlines()]
        if len(rows) != 6:
            raise ValueError('Incomplete supplemental worker')
        all_rows[v] = rows
        trials = [r['trials'][0] for r in rows]
        summary[v] = {'P8Lower': statistics.mean(t['metrics']['directPrecisionLowerBoundAt8'] for t in trials),
                      'KC8': statistics.mean(t['metrics']['knowledgeCoverageAt8'] for t in trials),
                      'meanWallMs': statistics.mean(t['wallMs'] for t in trials),
                      'fallbacks': sum(t['diagnostics']['mode']=='fallback' for t in trials),
                      'calls': sum(t['observedNetworkCalls'] for t in trials),
                      'inputTokens': sum(t['diagnostics']['usage'].get('prompt_tokens',0) for t in trials),
                      'outputTokens': sum(t['diagnostics']['usage'].get('completion_tokens',0) for t in trials),
                      'cost': None if v=='b' else 0,
                      'errors': sum(t['status']=='error' for t in trials)}
    pairs = {}
    for v in ('a','b','c'):
        delta = {r['id']: r['trials'][0]['metrics']['knowledgeCoverageAt8'] - base['trials'][0]['metrics']['knowledgeCoverageAt8']
                 for r,base in zip(all_rows[v],all_rows['baseline'])}
        pairs[v] = dict(deltas=delta, improved=sum(x>0 for x in delta.values()),
                        degraded=sum(x<0 for x in delta.values()), tied=sum(x==0 for x in delta.values()))
    report = dict(sensitivity=sensitivity, supplement=summary, paired=pairs)
    (args.output/'review.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),'utf-8')
    print(json.dumps(dict(supplement=summary, paired=pairs,
        sensitivity={n:{s:{v:round(x['KC8'],4) for v,x in variants.items()} for s,variants in splits.items()}
                     for n,splits in sensitivity.items()}),ensure_ascii=False,indent=2))


if __name__ == '__main__':
    main()
