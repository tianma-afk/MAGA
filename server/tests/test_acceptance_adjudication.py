"""Real API/frozen business chain with explicitly simulated upstream failures."""
import copy
import json

import httpx
import pytest
from fastapi.testclient import TestClient

from test_api import setup, configure_ai
from test_design import SCENARIO_REQUEST, SCENARIO_ANSWER
from server import design_sources


@pytest.mark.parametrize('case,expected_status,expected_fallback', [
    ('enhanced', 200, False), ('degraded', 200, True),
    ('fallback_failed', 500, None), ('generation_failed', 502, None),
    ('source_failed', 500, None),
])
def test_adjudicated_outcomes_keep_business_and_source_failures_visible(
        setup, monkeypatch, case, expected_status, expected_fallback):
    _, app, _ = setup
    calls = []

    def upstream(request):
        body = json.loads(request.content)
        planning = body.get('max_tokens') == 1024
        calls.append('planner' if planning else 'generation')
        if planning:
            raw = json.dumps(dict(status='ready', intents=[dict(
                concept='availability', query='availability', evidence='heartbeat')]))
            if case in ('degraded', 'fallback_failed'):
                raw = '{invalid'
        else:
            if case == 'generation_failed':
                return httpx.Response(500, text='private upstream text')
            raw = json.dumps(copy.deepcopy(SCENARIO_ANSWER))
        return httpx.Response(200, json={'choices': [{'message': {'content': raw}}]})

    configure_ai(app, monkeypatch, upstream)
    legacy = design_sources.legacy_sources
    if case in ('fallback_failed', 'source_failed'):
        def broken(store, query):
            if case == 'fallback_failed':
                raise RuntimeError('Injected unavailable baseline repository')
            sources = legacy(store, query)
            sources[0]['source'] = 'Injected forged content'
            return sources
        monkeypatch.setattr(design_sources, 'legacy_sources', broken)
    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.post('/api/design/scenarios', json={
            **SCENARIO_REQUEST, 'retrievalStrategy': 'llm_assisted'})
    assert response.status_code == expected_status
    assert calls.count('planner') == 1
    if expected_status == 200:
        answer = response.json()
        assert answer['retrievalFallback'] is expected_fallback
        assert answer['scenarios'][0]['citations'][0]['title'] != 'untrusted'
        assert calls == ['planner', 'generation']
    else:
        assert 'retrievalFallback' not in response.text
        assert 'private upstream text' not in response.text
        if case in ('fallback_failed', 'source_failed'):
            assert calls == ['planner'], 'No generation after failed fallback/source validation'
