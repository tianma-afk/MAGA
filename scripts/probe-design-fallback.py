"""Offline fault injection on frozen B; never contacts a model service."""
import argparse
import asyncio
import json
import os
import sys
import time
from pathlib import Path


async def run(repo, output):
    output.mkdir(parents=True, exist_ok=False)
    sys.path.insert(0, str(repo.resolve()))
    import httpx
    from server import design_sources as ds
    from server.chapters import ChapterStore
    from server.design_planner import DEADLINE
    from server.models import DesignScenarioRequest
    os.environ.update(LLM_API_KEY='mock-only', LLM_MODEL='mock-only',
                      LLM_BASE_URL='https://mock.invalid/v1', PYTHON_DOTENV_DISABLED='1')
    store = ChapterStore(repo / 'book', repo / 'data/slides')
    request = DesignScenarioRequest(title='服务监控', scenario='availability heartbeat')
    query = ds.build_query(request, 'scenarios')
    start = time.perf_counter()
    expected = await asyncio.to_thread(ds.legacy_sources, store, query)
    legacy_ms = (time.perf_counter() - start) * 1000
    records = []
    for failure in ('invalid_json', 'unknown_intent', 'http_error', 'network_error', 'timeout', 'cancel'):
        calls = []

        async def handler(req):
            calls.append(1)
            if failure == 'timeout':
                await asyncio.Event().wait()
            if failure == 'cancel':
                raise asyncio.CancelledError()
            if failure == 'http_error':
                return httpx.Response(503)
            if failure == 'network_error':
                raise httpx.ConnectError('mock')
            plan = {'status': 'ready', 'intents': [
                {'concept': 'unknown', 'query': 'availability', 'evidence': 'availability'}]}
            return httpx.Response(200, json={'choices': [{'message': {
                'content': '{' if failure == 'invalid_json' else json.dumps(plan)}}]})

        start = time.perf_counter()
        try:
            selected = await ds.select_sources(store, request, stage='scenarios',
                                               transport=httpx.MockTransport(handler))
            row = {'mode': selected.diagnostics.mode, 'reason': selected.diagnostics.reason,
                   'exactLegacyEquality': [s.model_dump() for s in selected.sources] == expected,
                   'planningMs': selected.diagnostics.stage_times_ms['planning']}
        except asyncio.CancelledError:
            row = {'cancelPropagated': True}
        row.update(failure=failure, wallMs=(time.perf_counter() - start) * 1000,
                   mockCalls=len(calls), realCalls=0)
        records.append(row)
    report = {'type': 'mock-fault-injection', 'productionDeadlineSeconds': DEADLINE,
              'referenceLegacyMsIncludingColdLoad': legacy_ms, 'rows': records}
    (output / 'faults.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), 'utf-8')
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    asyncio.run(run(args.repo, args.output))
