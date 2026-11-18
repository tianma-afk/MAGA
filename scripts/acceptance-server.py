"""Loopback-only P3T6 harness; real app/data, injectable upstream, durable budget.

Never imported by production. Use a fresh --output directory for each process.
"""
import argparse
import asyncio
from contextvars import ContextVar
import json
import os
from pathlib import Path
import sys
from time import perf_counter
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
parser = argparse.ArgumentParser()
parser.add_argument('--real', action='store_true')
parser.add_argument('--port', type=int, default=8016)
parser.add_argument('--output', type=Path, required=True)
args = parser.parse_args()
args.output.mkdir(parents=True, exist_ok=False)
if not args.real:
    os.environ.update(PYTHON_DOTENV_DISABLED='1', LLM_API_KEY='acceptance-fake',
                      LLM_MODEL='acceptance-mock', LLM_BASE_URL='https://mock.invalid/v1')

import httpx
import uvicorn
from fastapi import Request
from server import design
from server.config import read_ai_config
from server.main import create_app

config = read_ai_config().require()
if args.real and (urlparse(config.base_url).hostname != 'api.deepseek.com'
                  or config.model != 'deepseek-flash'):
    raise RuntimeError('Unexpected destination/model: stop before any outbound call')
events = []
fault = 'none'
call_count = 0
request_id = ContextVar('acceptance_request', default=0)
counter = 0
release = asyncio.Event()


def record(kind, **fields):
    row = dict(kind=kind, request_id=request_id.get(), real=args.real, **fields)
    events.append(row)
    with (args.output / 'events.jsonl').open('a', encoding='utf-8') as stream:
        stream.write(json.dumps(row, ensure_ascii=False) + '\n')


def mock_answer(payload):
    src = payload['sources'][0]
    citation = dict(chapterId=src['chapterId'], slide=src['slide'], title='模型伪标题')
    if 'tactics' in payload:
        return dict(summary='验收替身评审完成', questions=['如何验证恢复时间？'], findings=[dict(
            area='可用性', finding='需要验证恢复时间', severity='medium',
            suggestion='实施故障演练', citations=[citation])])
    if 'qualityAttributes' in payload:
        return dict(tactics=[dict(name='心跳与冗余（验收替身）', rationale='检测并恢复故障',
                                 tradeoffs='增加资源开销', citations=[citation])])
    return dict(qualityAttributes=[dict(name='可用性', priority='high', reason='故障恢复要求')],
                scenarios=[dict(stimulus='节点停止响应', source='监控器', artifact='监测服务',
                    environment='正常负载', response='检测并恢复', measure='60秒内恢复',
                    citations=[citation])])


class Upstream(httpx.AsyncBaseTransport):
    async def handle_async_request(self, request):
        global call_count
        body = json.loads(request.content)
        planning = body.get('max_tokens') == 1024
        phase = 'planner' if planning else 'generation'
        selected_fault = fault
        if args.real and call_count >= 6:
            raise RuntimeError('Hard budget of six outbound HTTP attempts exhausted')
        call_count += 1
        record('upstream_attempt', number=call_count, phase=phase, model=body['model'],
               temperature=body.get('temperature'), max_tokens=body.get('max_tokens'),
               cost=None, fault=selected_fault)
        start = perf_counter()
        try:
            if args.real:
                # Each call gets its own transport, as production owns client lifecycle.
                async with httpx.AsyncHTTPTransport(retries=0) as remote:
                    response = await remote.handle_async_request(request)
                    await response.aread()
            else:
                if selected_fault == 'delay' and planning:
                    record('held')
                    await release.wait()
                if planning and selected_fault in ('connection', 'timeout'):
                    error = httpx.ConnectError if selected_fault == 'connection' else httpx.ReadTimeout
                    raise error('Injected acceptance failure', request=request)
                if not planning and selected_fault == 'generation_timeout':
                    raise httpx.ReadTimeout('Injected generation timeout', request=request)
                payload = json.loads(body['messages'][1]['content'])
                if planning:
                    answer = dict(status='ready', intents=[dict(concept='availability',
                        query='可用性 故障检测 故障恢复', evidence=payload['scenario'][:80])])
                    if selected_fault == 'schema':
                        answer = dict(status='ready', intents='invalid')
                    elif selected_fault == 'empty':
                        answer = dict(status='ready', intents=[])
                    elif selected_fault == 'unknown':
                        answer['intents'][0]['concept'] = 'not_in_catalog'
                else:
                    record('generation_context', sources=payload['sources'])
                    answer = mock_answer(payload)
                    if selected_fault == 'generation_schema':
                        answer = dict(invalid=True)
                    elif selected_fault == 'citation':
                        answer['scenarios'][0]['citations'][0]['slide'] = 99999
                raw = json.dumps(answer, ensure_ascii=False)
                if (planning and selected_fault == 'json') or selected_fault == 'generation_json':
                    raw = '{broken'
                response = httpx.Response(500 if selected_fault == 'generation_http' and not planning else 200,
                    json=dict(model='acceptance-mock', choices=[dict(message=dict(content=raw))]))
            try:
                envelope = response.json()
            except ValueError:
                envelope = {}
            # Contents are synthetic course requests/responses; never headers or keys.
            record('upstream_response', phase=phase, status=response.status_code,
                   elapsed_ms=(perf_counter()-start)*1000, model=envelope.get('model'),
                   usage=envelope.get('usage'), choices=envelope.get('choices'), cost=None)
            return response
        except BaseException as exc:
            record('upstream_error', phase=phase, error=type(exc).__name__,
                   elapsed_ms=(perf_counter()-start)*1000)
            raise


original_select = design.select_sources


async def traced_select(store, request, **kwargs):
    selection = await original_select(store, request, **kwargs)
    record('selection', strategy=request.retrievalStrategy, stage=kwargs['stage'],
           **selection.model_dump())
    return selection


design.select_sources = traced_select
app = create_app()
app.state.llm_transport = Upstream()


@app.middleware('http')
async def trace_request(request: Request, call_next):
    global counter
    if not request.url.path.startswith('/api/design/'):
        return await call_next(request)
    counter += 1
    token = request_id.set(counter)
    start = perf_counter()
    record('api_start', path=request.url.path, payload=await request.json())
    try:
        response = await call_next(request)
        record('api_end', status=response.status_code, elapsed_ms=(perf_counter()-start)*1000)
        return response
    finally:
        request_id.reset(token)


@app.get('/__acceptance__/identity')
def identity():
    return dict(harness='p3t6', real=args.real, model=config.model,
                host=urlparse(config.base_url).hostname, calls=call_count)


@app.get('/__acceptance__/events')
def get_events():
    return events


if not args.real:
    @app.post('/__acceptance__/control')
    async def control(request: Request):
        global fault
        command = await request.json()
        if command.get('release'):
            release.set()
        else:
            fault = command['fault']
            if fault == 'delay':
                release.clear()
        return dict(fault=fault)


if __name__ == '__main__':
    uvicorn.run(app, host='127.0.0.1', port=args.port, log_level='warning')
