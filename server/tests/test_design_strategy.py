import asyncio
import json

import httpx
import pytest

from test_api import setup, configure_ai
from test_design import endpoints, SCENARIO_ANSWER, TACTIC_ANSWER, REVIEW_ANSWER
from server.chapters import ChapterStore
from server.design_sources import select_sources, legacy_sources, build_query
from server.models import DesignScenarioRequest, DesignTacticRequest, DesignReviewRequest
from server.design_planner import PROMPT_HASH, validate_plan


@pytest.mark.parametrize('model,stage', [(DesignScenarioRequest,'scenarios'),
    (DesignTacticRequest,'tactics'), (DesignReviewRequest,'review')])
def test_implicit_and_explicit_baseline_equal_legacy_without_planner(setup, model, stage):
    _,_,root=setup
    store=ChapterStore(root/'book',root/'slides')
    payload={'scenario':'heartbeat availability','requirements':'latency'}
    if stage!='tactics': payload['title']='sample'
    def forbidden(request):
        pytest.fail('Baseline must not call planner')
    for addition in ({},{'retrievalStrategy':'baseline'}):
        request=model(**payload,**addition)
        selected=asyncio.run(select_sources(store,request,stage=stage,transport=httpx.MockTransport(forbidden)))
        assert [s.model_dump() for s in selected.sources]==legacy_sources(store,build_query(request,stage))
        assert selected.diagnostics.mode=='baseline'
        assert selected.diagnostics.llm_calls==0


@pytest.mark.parametrize('index',[0,1,2])
@pytest.mark.parametrize('strategy',[None,'baseline','llm_assisted'])
def test_three_stage_api_dispatch_and_public_metadata(setup,monkeypatch,index,strategy):
    client,app,_=setup
    calls=[]
    answer=[SCENARIO_ANSWER,TACTIC_ANSWER,REVIEW_ANSWER][index]
    def handler(request):
        body=json.loads(request.content)
        calls.append(body)
        if body.get('max_tokens')==1024:
            fields=json.loads(body['messages'][-1]['content'])
            assert 'retrievalStrategy' not in fields
            return httpx.Response(200,json={'choices':[{'message':{'content':json.dumps({
                'status':'ready','intents':[{'concept':'availability','query':'availability','evidence':'heartbeat'}]})}}]})
        assert 'retrievalStrategy' not in json.loads(body['messages'][-1]['content'])
        return httpx.Response(200,json={'choices':[{'message':{'content':json.dumps(answer)}}]})
    configure_ai(app,monkeypatch,handler)
    path,payload=endpoints()[index]
    payload=dict(payload)
    if strategy is not None: payload['retrievalStrategy']=strategy
    response=client.post(path,json=payload)
    assert response.status_code==200
    assert len(calls)==(2 if strategy=='llm_assisted' else 1)
    if strategy=='llm_assisted':
        assert response.json()['retrievalFallback'] is False
    else:
        assert 'retrievalFallback' not in response.json()
    assert 'prompt_hash' not in response.text and 'test-secret' not in response.text


@pytest.mark.parametrize('index',[0,1,2])
def test_invalid_strategy_rejected_before_model(setup,index):
    client,app,_=setup
    calls=[]
    app.state.llm_transport=httpx.MockTransport(lambda req:calls.append(req))
    path,payload=endpoints()[index]
    response=client.post(path,json={**payload,'retrievalStrategy':'auto'})
    assert response.status_code==422 and calls==[]


@pytest.mark.parametrize('failure',['invalid','timeout','http'])
def test_planner_failure_falls_back_and_still_generates(setup,monkeypatch,failure):
    client,app,_=setup
    calls=[]
    def handler(request):
        body=json.loads(request.content)
        calls.append(body)
        if body.get('max_tokens')==1024:
            if failure=='timeout': raise httpx.ReadTimeout('sensitive-upstream')
            if failure=='http': return httpx.Response(503,text='sensitive-upstream')
            return httpx.Response(200,json={'choices':[{'message':{'content':'{invalid'}}]})
        return httpx.Response(200,json={'choices':[{'message':{'content':json.dumps(SCENARIO_ANSWER)}}]})
    configure_ai(app,monkeypatch,handler)
    path,payload=endpoints()[0]
    baseline=client.post(path,json=payload)
    fallback=client.post(path,json={**payload,'retrievalStrategy':'llm_assisted'})
    assert baseline.status_code==fallback.status_code==200
    assert fallback.json()['retrievalFallback'] is True
    baseline_sources=json.loads(calls[0]['messages'][-1]['content'])['sources']
    fallback_sources=json.loads(calls[-1]['messages'][-1]['content'])['sources']
    assert baseline_sources==fallback_sources
    assert len(calls)==3
    assert 'sensitive-upstream' not in fallback.text


def test_request_control_cannot_be_used_as_planning_evidence():
    request=DesignScenarioRequest(title='x',scenario='y',retrievalStrategy='llm_assisted')
    raw=json.dumps({'status':'ready','intents':[{'concept':'availability','query':'availability','evidence':'llm_assisted'}]})
    with pytest.raises(ValueError): validate_plan(raw,request)
    assert PROMPT_HASH=='920b836978fea8455fce4463861410c72585364928576173f30f5524c832b8b6'


@pytest.mark.parametrize('index',[0,1,2])
def test_enhanced_unconfigured_api_keeps_503_without_planning(setup,index):
    client,app,_=setup
    calls=[]
    app.state.llm_transport=httpx.MockTransport(lambda req:calls.append(req))
    path,payload=endpoints()[index]
    response=client.post(path,json={**payload,'retrievalStrategy':'llm_assisted'})
    assert response.status_code==503
    assert response.json()['detail']['code']=='AI_NOT_CONFIGURED'
    assert calls==[]


def test_planning_fallback_does_not_mask_final_generation_failure(setup,monkeypatch):
    client,app,_=setup
    calls=[]
    def handler(request):
        body=json.loads(request.content)
        calls.append(body)
        if body.get('max_tokens')==1024:
            return httpx.Response(200,json={'choices':[{'message':{'content':'bad json'}}]})
        return httpx.Response(500,text='sensitive-provider-text')
    configure_ai(app,monkeypatch,handler)
    path,payload=endpoints()[0]
    response=client.post(path,json={**payload,'retrievalStrategy':'llm_assisted'})
    assert response.status_code==502 and len(calls)==2
    assert 'sensitive-provider-text' not in response.text
