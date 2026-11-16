"""Unified source experiment. Defaults to dev; no model generation is performed."""
import argparse
import asyncio
import hashlib
import importlib.util
import json
import platform
import statistics
import subprocess
import sys
import time
import types
from datetime import datetime, timezone
from pathlib import Path


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_scoring(repo):
    spec = importlib.util.spec_from_file_location('source_scoring', repo / 'scripts/evaluate-design-needs.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def load_material(repo, ref):
    code = subprocess.check_output(['git', 'show', f'{ref}:server/design.py'], cwd=repo)
    module = types.ModuleType('server.material_design')
    exec(compile(code, f'{ref}:server/design.py', 'exec'), module.__dict__)
    return module._sources


def choose_cases(fixture, split, case_ids=None):
    selected = [case for case in fixture['cases'] if case['split'] == split
                and (not case_ids or case['id'] in case_ids)]
    if not selected or (case_ids and {c['id'] for c in selected} != set(case_ids)):
        raise ValueError('Requested case IDs are missing from the selected split')
    return selected


def score_sources(sources, case, fixture, store, scoring):
    from server.chapters import meaningful_text
    expected = [scoring.keys(fixture['topics'][topic]['pages']) for topic in case['knowledge']]
    direct = set().union(*expected) if expected else set()
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
    return rows, scoring.metrics(rows, expected, fixture['k'])


async def evaluate_case(case, fixture, store, repeats, scoring, material=None):
    from server import design_sources
    from server.models import DesignScenarioRequest
    request = DesignScenarioRequest.model_validate(case['request'])
    snapshot = request.model_dump()
    trials = []
    for index in range(repeats):
        start = time.perf_counter()
        selection = None
        try:
            selection = await design_sources.select_sources(store, request, stage='scenarios')
            await asyncio.to_thread(design_sources.validate_selection, store, selection)
            sources = [item.model_dump() for item in selection.sources]
            diagnostic = selection.diagnostics.model_dump()
            status = 'empty' if not sources else 'success'
            error = None
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            # Never serialize arbitrary upstream exception text or HTTP headers.
            sources = []
            diagnostic = selection.diagnostics.model_dump() if selection is not None else None
            status, error = 'error', type(exc).__name__
        elapsed = (time.perf_counter() - start) * 1000
        if request.model_dump() != snapshot:
            raise ValueError('Source adapter mutated its request')
        rows, metrics = score_sources(sources, case, fixture, store, scoring)
        trials.append({'repetition': index + 1, 'status': status, 'errorCategory': error,
                       'sources': sources, 'scoredSources': rows, 'metrics': metrics,
                       'diagnostics': diagnostic, 'wallMs': elapsed,
                       'contextCharacters': len(json.dumps(sources, ensure_ascii=False))})
    if material:
        query = ' '.join(snapshot[key] for key in ('title', 'scenario', 'requirements'))
        original = await asyncio.to_thread(material, store, query)
        if any(t['status'] == 'error' or t['sources'] != original for t in trials):
            raise ValueError(f'Material baseline mismatch: {case["id"]}')
    metric_names = trials[0]['metrics']
    averages = {name: statistics.mean(t['metrics'][name] for t in trials
                 if t['metrics'][name] is not None) if any(t['metrics'][name] is not None
                 for t in trials) else None for name in metric_names}
    averages.update(warmMedianMs=statistics.median(t['wallMs'] for t in trials),
                    contextCharacters=statistics.mean(t['contextCharacters'] for t in trials))
    return {'id': case['id'], 'split': case['split'],
            'scorable': case['status'] != 'unscorable', 'metrics': averages, 'trials': trials}


async def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', type=Path, default=Path('.'))
    parser.add_argument('--cases', type=Path, default=Path('docs/fixtures/iteration3-design-needs-v3.json'))
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--variant', choices=['baseline', 'a', 'b', 'c'], default='baseline')
    parser.add_argument('--split', choices=['dev', 'holdout'], default='dev')
    parser.add_argument('--allow-holdout', action='store_true')
    parser.add_argument('--case-id', action='append')
    parser.add_argument('--repeats', type=int, default=3)
    parser.add_argument('--compare-material', help='Read-only original implementation equivalence check')
    args = parser.parse_args()
    if args.split == 'holdout' and not args.allow_holdout:
        parser.error('Holdout requires explicit --allow-holdout approval')
    if args.repeats < 1:
        parser.error('repeats must be positive')
    repo = args.repo.resolve()
    if args.cases.is_absolute():
        cases_path = args.cases
    else:
        cases_path = repo / args.cases
    # mkdir without exist_ok prevents overwriting another variant/run.
    args.output.mkdir(parents=True, exist_ok=False)
    sys.path.insert(0, str(repo))
    from server.chapters import ChapterStore
    fixture = json.loads(cases_path.read_text(encoding='utf-8'))
    if fixture['k'] != 8:
        raise ValueError('Expected fixed source budget 8')
    cases = choose_cases(fixture, args.split, args.case_id)
    scoring = load_scoring(repo)
    material = load_material(repo, args.compare_material) if args.compare_material else None
    store = ChapterStore(repo / 'book', repo / 'data/slides')
    start = time.perf_counter()
    for cid in store.files():
        store.read(cid)
    cold_ms = (time.perf_counter() - start) * 1000
    rows = [await evaluate_case(c, fixture, store, args.repeats, scoring, material) for c in cases]
    summaries = scoring.aggregate(rows)
    trials = [trial for row in rows for trial in row['trials']]
    paths = sorted((repo / 'book').glob('*.pptx')) + sorted((repo / 'data/ocr').rglob('*.txt'))
    code_paths = sorted((repo / 'server').glob('*.py')) + [Path(__file__),
                   repo / 'scripts/evaluate-design-needs.py']
    report = {'variant': args.variant, 'split': args.split,
              'head': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=repo, text=True).strip(),
              'gitStatus': subprocess.check_output(['git', 'status', '--short'], cwd=repo, text=True),
              'createdUTC': datetime.now(timezone.utc).isoformat(), 'command': sys.argv,
              'python': platform.python_version(), 'platform': platform.platform(),
              'fixtureVersion': fixture['version'], 'annotationStatus': fixture['annotationStatus'],
              'fixtureSHA256': sha(cases_path), 'protocolSHA256': sha(repo / 'docs/iteration3_jack/phase2-evaluation-protocol.md'),
              'codeSHA256': {p.relative_to(repo).as_posix(): sha(p) for p in code_paths},
              'corpusSHA256': {p.relative_to(repo).as_posix(): sha(p) for p in paths},
              'coldLoadMs': cold_ms, 'repeats': args.repeats, 'summary': summaries,
              'counts': {status: sum(t['status'] == status for t in trials)
                         for status in ('success', 'empty', 'error')},
              'fallbackCount': sum(bool(t['diagnostics']) and t['diagnostics']['mode'] == 'fallback' for t in trials),
              'llmCalls': (sum(t['diagnostics']['llm_calls'] for t in trials)
                           if all(t['diagnostics'] for t in trials) else None),
              'llmCallsUnknownTrials': sum(t['diagnostics'] is None for t in trials),
              'materialEquivalence': args.compare_material or None}
    (args.output / 'summary.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    (args.output / f'{args.split}.json').write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'summary': summaries, 'counts': report['counts'],
                      'materialEquivalence': report['materialEquivalence']}, ensure_ascii=False))
    if report['counts']['error']:
        raise SystemExit(1)


if __name__ == '__main__':
    asyncio.run(main())
