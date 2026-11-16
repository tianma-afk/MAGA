"""Read-only candidate worker; the coordinator owns all output and annotations."""
import argparse
import asyncio
import hashlib
import importlib.util
import json
import os
import platform
import re
import subprocess
import sys
import time
from datetime import datetime, timezone
from importlib.metadata import version
from pathlib import Path


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def tokens(text):
    text = text.lower()
    out = set(re.findall(r'[a-z0-9]{2,}', text))
    for run in re.findall(r'[一-鿿]+', text):
        out.update(run[i:i + 2] for i in range(len(run) - 1))
    return out


def diversity(sources):
    sets = [tokens(s['source']) for s in sources]
    pairs = [len(a & b) / len(a | b) if a or b else 0
             for i, a in enumerate(sets) for b in sets[i + 1:]]
    ids = {(s['chapterId'], s['slide']) for s in sources}
    return {'uniqueRatio': len(ids) / len(sources) if sources else None,
            'maximumTextJaccard': max(pairs, default=None),
            'chapters': sorted({s['chapterId'] for s in sources})}


def reserve_attempt(path, limit, query_id):
    # The coordinator serializes workers. Reserve before network, never retry.
    previous = path.read_text('utf-8').splitlines() if path.exists() else []
    if len(previous) >= limit:
        raise RuntimeError('Real planning budget exhausted')
    with path.open('a', encoding='utf-8') as stream:
        stream.write(json.dumps({'attempt': len(previous) + 1, 'query_id': query_id,
                                 'utc': datetime.now(timezone.utc).isoformat()}) + '\n')


async def run(args):
    repo, main = args.repo.resolve(), Path(__file__).resolve().parents[1]
    args.output.mkdir(parents=True, exist_ok=False)
    sys.path.insert(0, str(repo))
    from server import design_sources as ds
    from server.chapters import ChapterStore
    from server.config import read_ai_config
    from server.models import DesignScenarioRequest
    from server.search import search_all
    import httpx

    if args.variant == 'b':
        from dotenv import load_dotenv
        load_dotenv(main / '.env', override=False)
    else:
        for key in ('LLM_API_KEY', 'LLM_MODEL', 'LLM_BASE_URL'):
            os.environ.pop(key, None)
    config = read_ai_config()
    head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=repo, text=True).strip()
    status = subprocess.check_output(['git', 'status', '--short'], cwd=repo, text=True)
    if head != args.expected_head or status:
        raise ValueError('Candidate version or clean-worktree precondition failed')
    fixture = json.loads(args.fixture.read_text('utf-8'))
    cases = [c for c in fixture['cases'] if c['split'] == args.split
             and (not args.case_id or c['id'] == args.case_id)]
    if not cases or fixture['k'] != 8:
        raise ValueError('Invalid case selection')
    if args.variant == 'b' and args.repeats != 1:
        raise ValueError('Fresh B is single-sampled')
    runner = load(main / 'scripts/run-design-experiment.py', 'shared_runner')
    scoring = runner.load_scoring(main)
    corpus = sorted((repo / 'book').glob('*.pptx')) + sorted((repo / 'data/ocr').rglob('*.txt'))
    manifest = {'variant': args.variant, 'head': head, 'gitStatus': status,
                'createdUTC': datetime.now(timezone.utc).isoformat(), 'command': sys.argv,
                'python': platform.python_version(), 'platform': platform.platform(),
                'packages': {p: version(p) for p in ('httpx', 'pydantic', 'fastapi', 'python-pptx')},
                'fixtureSHA256': sha(args.fixture), 'protocolSHA256': sha(args.protocol),
                'sourceSHA256': {p.name: sha(p) for p in sorted((repo / 'server').glob('*.py'))},
                'toolSHA256': {p.name: sha(p) for p in (Path(__file__), main / 'scripts/run-design-experiment.py',
                                                       main / 'scripts/evaluate-design-needs.py')},
                'corpusSHA256': {p.relative_to(repo).as_posix(): sha(p) for p in corpus},
                'requestedModel': config.model if args.variant == 'b' else None,
                'configurationMissing': list(config.missing) if args.variant == 'b' else [],
                'split': args.split, 'repeats': args.repeats,
                'budgetLimit': args.budget, 'experimentType': 'online' if args.variant == 'b' else 'offline'}
    (args.output / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), 'utf-8')
    store = ChapterStore(repo / 'book', repo / 'data/slides')
    start = time.perf_counter()
    for cid in store.files():
        store.read(cid)
    manifest['coldLoadMs'] = (time.perf_counter() - start) * 1000
    validation_times = []
    original_validate = ds.validate_selection

    def timed_validate(*values):
        start = time.perf_counter()
        try:
            return original_validate(*values)
        finally:
            validation_times.append((time.perf_counter() - start) * 1000)
    ds.validate_selection = timed_validate

    class CountedTransport(httpx.AsyncBaseTransport):
        def __init__(self, query_id):
            self.inner = httpx.AsyncHTTPTransport(retries=0)
            self.query_id = query_id
            self.calls = 0

        async def handle_async_request(self, request):
            reserve_attempt(args.ledger, args.budget, self.query_id)
            self.calls += 1
            return await self.inner.handle_async_request(request)

        async def aclose(self):
            await self.inner.aclose()

    for case in cases:
        request = DesignScenarioRequest.model_validate(case['request'])
        before = request.model_dump()
        trials = []
        for repeat in range(args.repeats):
            validation_times.clear()
            transport = CountedTransport(case['id']) if args.variant == 'b' and not config.missing else None
            selection = None
            start = time.perf_counter()
            utc = datetime.now(timezone.utc).isoformat()
            try:
                selection = await ds.select_sources(store, request, stage='scenarios', transport=transport)
                error = None
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                error = type(exc).__name__
            wall = (time.perf_counter() - start) * 1000
            internal_validation = sum(validation_times)
            start = time.perf_counter()
            if selection is not None:
                original_validate(store, selection)
            independent_ms = (time.perf_counter() - start) * 1000
            if before != request.model_dump():
                raise ValueError('Request mutation')
            sources = [s.model_dump() for s in selection.sources] if selection else []
            diagnostic = selection.diagnostics.model_dump() if selection else None
            rows, metrics = runner.score_sources(sources, case, fixture, store, scoring)
            covered = [topic for topic in case['knowledge'] if any(
                tuple(row['key']) in scoring.keys(fixture['topics'][topic]['pages'])
                and row['grade'] == 'direct' for row in rows)]
            judged = [r for r in rows if r['grade'] in ('direct', 'irrelevant', 'background')]
            metrics['judgedDirectRatio'] = sum(r['grade'] == 'direct' for r in judged) / len(judged) if judged else None
            trials.append({'repeat': repeat + 1, 'utc': utc, 'status': 'error' if error else 'success' if sources else 'empty',
                           'errorCategory': error, 'sources': sources, 'scoredSources': rows,
                           'metrics': metrics, 'coveredKnowledge': covered, 'diversity': diversity(sources),
                           'diagnostics': diagnostic, 'wallMs': wall,
                           'validationMs': internal_validation, 'independentValidationMs': independent_ms,
                           'observedNetworkCalls': transport.calls if transport else 0})
        candidate_ids, candidate_coverage = [], None
        if args.variant == 'c':
            query = ' '.join(ds.build_query(request, 'scenarios').split())[:2000]
            pool = search_all(store, query, 32).results
            candidate_ids = [[r.chapterId, r.slide] for r in pool]
            # Use the same usability/grade conditions as final coverage.
            from server.tutor import excerpt
            expanded = []
            for result in pool:
                slide = store.read(result.chapterId).slides[result.slide - 1]
                expanded.append(dict(chapterId=result.chapterId, slide=result.slide,
                                     title=slide.title, source=excerpt(slide)))
            candidate_coverage = runner.score_sources(expanded, case, fixture, store, scoring)[1]['knowledgeCoverageAt8']
        row = {'id': case['id'], 'split': case['split'], 'request': before,
               'scorable': case['status'] != 'unscorable', 'knowledge': case['knowledge'],
               'head': head, 'fixtureSHA256': manifest['fixtureSHA256'],
               'trials': trials, 'deterministic': all(t['sources'] == trials[0]['sources'] for t in trials)
               if args.repeats > 1 else None, 'candidateTop32': candidate_ids,
               'candidateKnowledgeUpperBound': candidate_coverage}
        with (args.output / 'rows.jsonl').open('a', encoding='utf-8') as stream:
            stream.write(json.dumps(row, ensure_ascii=False) + '\n')
        print(json.dumps({'variant': args.variant, 'id': case['id'],
                          'status': [t['status'] for t in trials]}, ensure_ascii=False), flush=True)
    manifest['finishedUTC'] = datetime.now(timezone.utc).isoformat()
    (args.output / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), 'utf-8')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', type=Path, required=True)
    parser.add_argument('--expected-head', required=True)
    parser.add_argument('--variant', choices=['baseline', 'a', 'b', 'c'], required=True)
    parser.add_argument('--fixture', type=Path, required=True)
    parser.add_argument('--protocol', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--split', choices=['dev', 'holdout'], required=True)
    parser.add_argument('--case-id')
    parser.add_argument('--repeats', type=int, required=True)
    parser.add_argument('--ledger', type=Path, required=True)
    parser.add_argument('--budget', type=int, default=30)
    args = parser.parse_args()
    if args.repeats < 1 or not 1 <= args.budget <= 30:
        parser.error('Invalid repetition or budget')
    asyncio.run(run(args))


if __name__ == '__main__':
    main()
