"""Offline iteration-3 evidence baseline; never invokes a model or changes retrieval."""
import argparse
import hashlib
import json
import platform
import statistics
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def keys(mapping):
    return {(cid, n) for cid, numbers in mapping.items() for n in numbers}


def metrics(rows, expected, k):
    direct = sum(row['grade'] == 'direct' for row in rows)
    unknown = sum(row['grade'] == 'unjudged' for row in rows)
    covered = sum(any(tuple(row['key']) in pages and row['grade'] == 'direct'
                      for row in rows) for pages in expected)
    return {'directPrecisionLowerBoundAt8': direct / k,
            'knowledgeCoverageAt8': covered / len(expected) if expected else None,
            'unjudgedCount': unknown,
            'unusableCount': sum(row['grade'] == 'unusable' for row in rows),
            'confirmedIrrelevantCount': sum(row['grade'] == 'irrelevant' for row in rows),
            'sourceCount': len(rows),
            'traceability': sum(row['traceable'] for row in rows) / len(rows) if rows else None}


def aggregate(rows):
    scored = [row for row in rows if row['scorable']]
    names = ['directPrecisionLowerBoundAt8', 'knowledgeCoverageAt8', 'unjudgedCount',
             'unusableCount', 'confirmedIrrelevantCount', 'sourceCount', 'traceability',
             'warmMedianMs', 'contextCharacters']
    values = {name: [row['metrics'][name] for row in scored
                     if row['metrics'][name] is not None] for name in names}
    return {'cases': len(rows), 'scoredCases': len(scored),
            'macro': {name: statistics.mean(items) if items else None
                      for name, items in values.items()} if scored else {}}


def run_case(case, fixture, store, repeats, diagnose):
    from server.design import _sources
    from server.search import search_all
    from server.retrieval_terms import query_terms, term_count
    from server.chapters import meaningful_text
    query = ' '.join(case['request'][key] for key in ('title', 'scenario', 'requirements'))
    effective = ' '.join(query.split())[:2000]
    expected = [keys(fixture['topics'][topic]['pages']) for topic in case['knowledge']]
    direct = set().union(*expected) if expected else set()
    samples = []
    for _ in range(repeats):
        start = time.perf_counter()
        sources = _sources(store, query)
        samples.append((time.perf_counter() - start) * 1000)
    ranked = search_all(store, effective, 10000).results
    assert [(x.chapterId, x.slide) for x in ranked[:8]] == [
        (x['chapterId'], x['slide']) for x in sources]
    judgments = fixture.get('judgments', {}).get(case['id'], {})
    rows = []
    for source in sources:
        key = (source['chapterId'], source['slide'])
        slide = store.read(key[0]).slides[key[1] - 1]
        usable = bool(meaningful_text(slide.text).replace(slide.title, '').strip()
                      or slide.notes.strip() or (slide.ocrText or '').strip())
        grade = 'direct' if key in direct else 'unjudged'
        if not usable:
            grade = 'unusable'
        grade = judgments.get(f'{key[0]}:{key[1]}', {}).get('grade', grade)
        rows.append({'key': list(key), 'title': source['title'], 'grade': grade,
                     'traceable': slide.number == key[1] and slide.title == source['title'],
                     'excerptCharacters': len(source['source'])})
    score = metrics(rows, expected, fixture['k'])
    score.update(warmMedianMs=statistics.median(samples), warmSamplesMs=samples,
                 contextCharacters=len(json.dumps(sources, ensure_ascii=False)))
    result = {'id': case['id'], 'split': case['split'], 'scorable': case['status'] != 'unscorable',
              'query': query, 'effectiveQuery': effective, 'sources': rows, 'metrics': score}
    if diagnose:
        terms = query_terms(effective)
        result['terms'] = terms
        result['ranking'] = [{'rank': i + 1, 'key': [x.chapterId, x.slide],
                              'score': x.score, 'title': x.slideTitle}
                             for i, x in enumerate(ranked)]
        result['expectedRanks'] = [[{'key': list(key), 'rank': next(
            (i + 1 for i, x in enumerate(ranked) if (x.chapterId, x.slide) == key), None)}
            for key in sorted(pages)] for pages in expected]
        result['topContributions'] = []
        for item in ranked[:8]:
            slide = store.read(item.chapterId).slides[item.slide - 1]
            fields = [slide.title, meaningful_text(slide.text), slide.notes, slide.ocrText or '']
            weights = [3, 1, 1, 1]
            contributions = {term: sum(term_count(term, field.lower()) * weight
                             for field, weight in zip(fields, weights)) for term in terms}
            result['topContributions'].append({'key': [item.chapterId, item.slide],
                'terms': {term: score for term, score in contributions.items() if score}})
        result['controlTop8'] = [{'key': [x.chapterId, x.slide], 'score': x.score}
            for x in search_all(store, case['control'], 8).results] if case['control'] else []
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', type=Path, default=Path('.'))
    parser.add_argument('--cases', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--repeats', type=int, default=3)
    parser.add_argument('--regrade-from', type=Path,
                        help='Reuse immutable retrieval/timing outputs; change annotations only')
    args = parser.parse_args()
    if args.repeats < 2:
        parser.error('Use at least two warm repetitions')
    if args.output.exists():
        parser.error('Output already exists; choose a new run directory')
    repo = args.repo.resolve()
    sys.path.insert(0, str(repo))
    from server.chapters import ChapterStore
    fixture = json.loads(args.cases.read_text(encoding='utf-8'))
    assert fixture['k'] == 8
    if args.regrade_from:
        report = json.loads((args.regrade_from / 'summary.json').read_text(encoding='utf-8'))
        rows = []
        for split in ('dev', 'holdout'):
            old = json.loads((args.regrade_from / f'{split}.json').read_text(encoding='utf-8'))
            for row in old:
                case = next(c for c in fixture['cases'] if c['id'] == row['id'])
                assert row['query'] == ' '.join(case['request'][key] for key in
                                               ('title', 'scenario', 'requirements'))
                expected = [keys(fixture['topics'][t]['pages']) for t in case['knowledge']]
                direct = set().union(*expected) if expected else set()
                judgments = fixture.get('judgments', {}).get(case['id'], {})
                for source in row['sources']:
                    key = tuple(source['key'])
                    if source['grade'] != 'unusable':
                        source['grade'] = 'direct' if key in direct else 'unjudged'
                    source['grade'] = judgments.get(f'{key[0]}:{key[1]}', {}).get('grade', source['grade'])
                row['metrics'].update(metrics(row['sources'], expected, fixture['k']))
                row.pop('expectedRanks', None)  # Old annotation ranks are no longer authoritative.
            rows.extend(old)
        report.update(fixtureSHA256=digest(args.cases), annotationStatus=fixture['annotationStatus'],
                      regradedFrom=str(args.regrade_from), regradeCommand=sys.argv,
                      regradeUTC=datetime.now(timezone.utc).isoformat())
        report['summary'] = {split: aggregate([r for r in rows if r['split'] == split])
                             for split in ('dev', 'holdout')}
        args.output.mkdir(parents=True)
        (args.output / 'summary.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
        for split in ('dev', 'holdout'):
            (args.output / f'{split}.json').write_text(json.dumps(
                [r for r in rows if r['split'] == split], ensure_ascii=False, indent=2), encoding='utf-8')
        print(json.dumps(report['summary'], ensure_ascii=False, indent=2))
        return
    ids = [case['id'] for case in fixture['cases']]
    assert len(ids) == len(set(ids))
    store = ChapterStore(repo / 'book', repo / 'data/slides')
    start = time.perf_counter()
    chapters = [store.read(cid) for cid in store.files()]
    cold = (time.perf_counter() - start) * 1000
    for topic in fixture['topics'].values():
        for cid, n in keys(topic['pages']):
            assert 1 <= n <= store.read(cid).slideCount
    rows = [run_case(case, fixture, store, args.repeats, case['split'] == 'dev')
            for case in fixture['cases']]
    groups = {split: aggregate([row for row in rows if row['split'] == split])
              for split in ('dev', 'holdout')}
    paths = sorted((repo / 'book').glob('*.pptx')) + sorted((repo / 'data/ocr').rglob('*.txt'))
    manifest = {p.relative_to(repo).as_posix(): digest(p) for p in paths}
    report = {'createdUTC': datetime.now(timezone.utc).isoformat(),
              'head': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=repo, text=True).strip(),
              'python': platform.python_version(), 'platform': platform.platform(),
              'command': sys.argv, 'fixtureSHA256': digest(args.cases),
              'sourceCodeSHA256': {name: digest(repo / name) for name in
                  ('server/design.py', 'server/search.py', 'server/retrieval_terms.py',
                   'server/chapters.py', 'server/tutor.py')},
              'corpusSHA256': manifest, 'chapterPages': {c.id: c.slideCount for c in chapters},
              'coldLoadMs': cold, 'repeats': args.repeats, 'summary': groups,
              'annotationStatus': fixture['annotationStatus'], 'rows': rows}
    args.output.mkdir(parents=True)
    (args.output / 'summary.json').write_text(json.dumps(
        {key: value for key, value in report.items() if key != 'rows'}, ensure_ascii=False, indent=2), encoding='utf-8')
    for split in groups:
        (args.output / f'{split}.json').write_text(json.dumps(
            [row for row in rows if row['split'] == split], ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(groups, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
