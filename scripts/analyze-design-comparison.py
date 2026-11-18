"""Aggregate frozen paired retrieval observations, without rejudging any source."""
import argparse
import csv
import json
import statistics
from pathlib import Path

QUALITY = ('directPrecisionLowerBoundAt8', 'knowledgeCoverageAt8')
VARIANTS = ('baseline', 'a', 'b', 'c')


def mean(values):
    values = [v for v in values if v is not None]
    return statistics.mean(values) if values else None


def paired(left, right, metric):
    a = {r['id']: r for r in left if r['scorable']}
    b = {r['id']: r for r in right if r['scorable']}
    if a.keys() != b.keys():
        raise ValueError('Paired IDs mismatch')
    deltas = {key: a[key]['trials'][0]['metrics'][metric] - b[key]['trials'][0]['metrics'][metric]
              for key in a}
    return {'meanDelta': mean(deltas.values()),
            'improved': sum(v > 0 for v in deltas.values()),
            'degraded': sum(v < 0 for v in deltas.values()),
            'tied': sum(v == 0 for v in deltas.values()),
            'maximum': max(deltas.values(), default=None),
            'minimum': min(deltas.values(), default=None),
            'maximumIDs': [k for k, v in deltas.items() if v == max(deltas.values())],
            'minimumIDs': [k for k, v in deltas.items() if v == min(deltas.values())],
            'deltas': deltas}


def summarize(rows, variant):
    scored = [r for r in rows if r['scorable']]
    first = [r['trials'][0] for r in rows]
    trials = [t for r in rows for t in r['trials']]
    diagnostics = [t['diagnostics'] for t in first if t['diagnostics']]
    latency = [statistics.median(t['wallMs'] for t in r['trials']) for r in rows]
    usage = [d.get('usage', {}) for d in diagnostics]
    result = {'cases': len(rows), 'scoredCases': len(scored),
              'quality': {key: mean(r['trials'][0]['metrics'][key] for r in scored)
                          for key in QUALITY + ('unjudgedCount', 'unusableCount', 'confirmedIrrelevantCount',
                                                'judgedDirectRatio', 'sourceCount', 'traceability')},
              'latencyMeanMs': mean(latency), 'latencyP50Ms': statistics.median(latency),
              'latencyP95Ms': None, 'latencyMinMs': min(latency), 'latencyMaxMs': max(latency),
              'validationMeanMs': mean(statistics.median(t['validationMs'] for t in r['trials']) for r in rows),
              'independentValidationMeanMs': mean(t['independentValidationMs'] for t in first),
              'stageMeanMs': {key: mean(d['stage_times_ms'].get(key) for d in diagnostics)
                              for key in set().union(*(d['stage_times_ms'].keys() for d in diagnostics))},
              'errors': sum(t['status'] == 'error' for t in trials),
              'empty': sum(t['status'] == 'empty' for t in trials),
              'fallbacks': sum(d['mode'] == 'fallback' for d in diagnostics),
              'fallbackRate': sum(d['mode'] == 'fallback' for d in diagnostics) / len(rows),
              'reasons': {reason: sum(d['reason'] == reason for d in diagnostics)
                          for reason in {d['reason'] for d in diagnostics} if reason},
              'observedNetworkCalls': sum(t['observedNetworkCalls'] for t in trials),
              'diagnosticCalls': sum(d['llm_calls'] for d in diagnostics),
              'uniqueRatio': mean(t['diversity']['uniqueRatio'] for t in first),
              'maximumJaccardMean': mean(t['diversity']['maximumTextJaccard'] for t in first),
              'deterministicCases': sum(r['deterministic'] is True for r in rows),
              'nondeterministicCases': sum(r['deterministic'] is False for r in rows),
              'models': sorted({d['model_id'] for d in diagnostics if d['model_id']}),
              'promptTokensKnown': sum(u.get('prompt_tokens', 0) for u in usage),
              'completionTokensKnown': sum(u.get('completion_tokens', 0) for u in usage),
              'tokenUnknownCases': sum('prompt_tokens' not in u or 'completion_tokens' not in u for u in usage)
                                   if variant == 'b' else 0,
              'cost': None if variant == 'b' else 0,
              'candidateKnowledgeUpperBound': mean(r['candidateKnowledgeUpperBound'] for r in scored)}
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--run', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=False)
    freeze = json.loads((args.run / 'freeze.json').read_text('utf-8'))
    frozen_hashes = {key.replace('\\', '/'): value for key, value in freeze['frozenSHA256'].items()}
    if not freeze['completed']:
        raise ValueError('Comparison is incomplete')
    summaries, pairwise, all_rows = {}, {}, {}
    for split in ('dev', 'holdout'):
        all_rows[split] = {}
        summaries[split], pairwise[split] = {}, {}
        for variant in VARIANTS:
            directory = args.run / split / variant
            manifest = json.loads((directory / 'manifest.json').read_text('utf-8'))
            if manifest['head'] != freeze['versions'][variant]:
                raise ValueError('Candidate identity mismatch')
            if manifest['fixtureSHA256'] != frozen_hashes['docs/fixtures/iteration3-design-needs-v4.json']:
                raise ValueError('Annotation hash mismatch')
            if manifest['protocolSHA256'] != frozen_hashes['docs/iteration3_jack/phase3-evaluation-protocol.md']:
                raise ValueError('Protocol hash mismatch')
            if manifest['corpusSHA256'] != freeze['corpusSHA256']:
                raise ValueError('Corpus hash mismatch')
            rows = [json.loads(line) for line in (directory / 'rows.jsonl').read_text('utf-8').splitlines()]
            if len({r['id'] for r in rows}) != len(rows):
                raise ValueError('Duplicate query IDs')
            all_rows[split][variant] = rows
            summaries[split][variant] = summarize(rows, variant)
        for left, right in (('a', 'baseline'), ('b', 'baseline'), ('c', 'baseline'),
                            ('a', 'b'), ('a', 'c'), ('b', 'c')):
            label = left + '-' + right
            pairwise[split][label] = {metric: paired(all_rows[split][left], all_rows[split][right], metric)
                                      for metric in QUALITY}
    output = {'summary': summaries, 'paired': pairwise, 'versions': freeze['versions']}
    (args.output / 'comparison.json').write_text(json.dumps(output, ensure_ascii=False, indent=2), 'utf-8')
    audit = ['# 自动待审来源清单', '', '依据冻结标签；unjudged不是不相关，无独立人工确认。', '']
    with (args.output / 'per-query.csv').open('w', newline='', encoding='utf-8-sig') as stream:
        writer = csv.writer(stream)
        writer.writerow(['split', 'variant', 'query', 'scorable', 'P8_lower', 'KC8', 'wall_median_ms',
                         'covered', 'unjudged', 'source_ids', 'mode', 'reason', 'candidate_KC_upper'])
        for split, variants in all_rows.items():
            for variant, rows in variants.items():
                for row in rows:
                    trial = row['trials'][0]
                    ids = [s['chapterId'] + ':' + str(s['slide']) for s in trial['sources']]
                    d = trial['diagnostics'] or {}
                    writer.writerow([split, variant, row['id'], row['scorable'],
                                     *(trial['metrics'][m] for m in QUALITY),
                                     statistics.median(t['wallMs'] for t in row['trials']),
                                     '|'.join(trial['coveredKnowledge']), trial['metrics']['unjudgedCount'],
                                     '|'.join(ids), d.get('mode'), d.get('reason'), row['candidateKnowledgeUpperBound']])
                    unknown = [s for s in trial['scoredSources'] if s['grade'] == 'unjudged']
                    audit.append(f"## {split}/{row['id']}/{variant}")
                    audit.append(json.dumps(row['request'], ensure_ascii=False))
                    audit.extend(f"- 待人工：{s['key'][0]}:{s['key'][1]} {s['title']}" for s in unknown)
                    audit.append('')
    (args.output / 'unjudged-audit.md').write_text('\n'.join(audit), 'utf-8')
    print(json.dumps(output['summary'], ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
