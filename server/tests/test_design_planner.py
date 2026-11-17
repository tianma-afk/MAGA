import asyncio
import json

import httpx
import pytest

from test_api import setup
from server.chapters import ChapterStore
from server.design_planner import validate_plan, merge_sources
from server.design_sources import select_sources, legacy_sources, build_query
from server.models import DesignScenarioRequest

REQUEST = DesignScenarioRequest(title="availability", scenario="heartbeat", retrievalStrategy="llm_assisted")

def plan(**changes):
    value = {"status": "ready", "intents": [
        {"concept": "availability", "query": "availability", "evidence": "heartbeat"}]}
    value.update(changes)
    return value

@pytest.fixture
def configured(monkeypatch):
    monkeypatch.setenv("LLM_MODEL", "mock")
    monkeypatch.setenv("LLM_API_KEY", "test-only")
    monkeypatch.setenv("LLM_BASE_URL", "https://mock.invalid/v1")

@pytest.mark.parametrize("value", [
    {}, plan(status="unknown"), plan(intents=[]),
    plan(intents=plan()["intents"] * 4),
    plan(intents=plan()["intents"] * 2),
    plan(intents=[{"concept": "invented", "query": "x", "evidence": "heartbeat"}]),
    plan(intents=[{"concept": "availability", "query": "page 5", "evidence": "heartbeat"}]),
    plan(intents=[{"concept": "availability", "query": "https://fake", "evidence": "heartbeat"}]),
    plan(intents=[{"concept": "availability", "query": "x", "evidence": "invented"}]),
    plan(intents=[{"concept": "availability", "query": 42, "evidence": "heartbeat"}]),
    plan(intents=[{"concept": "availability", "query": "x"*121, "evidence": "heartbeat"}]),
    plan(extra="forged"),
])
def test_reject_invalid(value):
    with pytest.raises(ValueError):
        validate_plan(json.dumps(value), REQUEST)

def test_evidence_respects_fields_and_semantics_not_certified():
    # Exact evidence can still be a semantic mistake; do not claim certification.
    request = DesignScenarioRequest(title="x", scenario="不需要可用性，优先性能")
    value = plan(intents=[{"concept": "availability", "query": "可用性",
                           "evidence": "不需要可用性"}])
    assert validate_plan(json.dumps(value), request).intents
    assert validate_plan(json.dumps(plan(status="uncertain", intents=[])), request).status == "uncertain"

def test_merge():
    source = lambda n: {"chapterId": "c", "slide": n}
    result = merge_sources([[source(n) for n in range(1, 9)],
                            [source(n) for n in range(1, 12)]])
    assert len(result) == 8
    assert len({r["slide"] for r in result}) == 8
    assert merge_sources([]) == []

@pytest.mark.parametrize("failure,reason", [
    ("badjson", "invalid_plan"), ("envelope", "invalid_plan"), ("empty", "invalid_plan"),
    ("uncertain", "uncertain"), ("http", "http_error"),
    ("timeout", "timeout"), ("connection", "connection_error"),
    ("unknown", "invalid_plan"), ("nohits", "no_planned_sources"),
])
def test_failures_fallback(setup, configured, failure, reason):
    _, _, root = setup
    store = ChapterStore(root / "book", root / "slides")
    calls = []
    def handler(req):
        calls.append(req)
        if failure == "http":
            return httpx.Response(429)
        if failure == "timeout":
            raise httpx.ReadTimeout("secret")
        if failure == "connection":
            raise httpx.ConnectError("secret")
        if failure == "envelope":
            return httpx.Response(200, json=[])
        value = plan()
        if failure == "uncertain":
            value = plan(status="uncertain", intents=[])
        if failure == "unknown":
            value["intents"][0]["concept"] = "imaginary"
        if failure == "nohits":
            value["intents"][0]["query"] = "zzqqzzqqzzqq"
        raw = ("{" if failure == "badjson" else "" if failure == "empty"
               else json.dumps(value))
        return httpx.Response(200, json={"choices": [{"message": {"content": raw}}]})
    result = asyncio.run(select_sources(store, REQUEST, stage="scenarios",
                                       transport=httpx.MockTransport(handler)))
    assert [s.model_dump() for s in result.sources] == legacy_sources(store, build_query(REQUEST, "scenarios"))
    assert result.diagnostics.mode == "fallback"
    assert result.diagnostics.reason == reason
    assert result.diagnostics.llm_calls == len(calls) == 1
    assert result.diagnostics.cost is None
    assert "secret" not in result.model_dump_json()

def test_normal(setup, configured):
    _, _, root = setup
    store = ChapterStore(root / "book", root / "slides")
    before = REQUEST.model_dump()
    def handler(req):
        body = json.loads(req.content)
        assert body["max_tokens"] == 1024
        assert body["temperature"] == 0
        return httpx.Response(200, json={"model": "actual-mock",
            "usage": {"prompt_tokens": 20, "completion_tokens": 12},
            "choices": [{"message": {"content": json.dumps(plan())}}]})
    result = asyncio.run(select_sources(store, REQUEST, stage="scenarios",
                                      transport=httpx.MockTransport(handler)))
    assert result.diagnostics.mode == "normal"
    assert result.diagnostics.model_id == "actual-mock"
    assert result.diagnostics.usage["prompt_tokens"] == 20
    assert 0 < len(result.sources) <= 8
    assert REQUEST.model_dump() == before

def test_deadline_and_cancel(setup, configured, monkeypatch):
    from server import design_planner
    _, _, root = setup
    store = ChapterStore(root / "book", root / "slides")
    async def handler(req):
        await asyncio.Event().wait()
    monkeypatch.setattr(design_planner, "DEADLINE", 0.01)
    result = asyncio.run(select_sources(store, REQUEST, stage="scenarios",
                                       transport=httpx.MockTransport(handler)))
    assert result.diagnostics.reason == "timeout"
    async def cancel_handler(req):
        raise asyncio.CancelledError()
    with pytest.raises(asyncio.CancelledError):
        asyncio.run(select_sources(store, REQUEST, stage="scenarios",
                                  transport=httpx.MockTransport(cancel_handler)))


def test_round_robin_distinct():
    def src(n):
        return {"chapterId": "c", "slide": n}
    result = merge_sources([[src(1), src(2)], [src(3), src(4)],
                            [src(5), src(6)]])
    assert [s["slide"] for s in result] == [1, 3, 5, 2, 4, 6]


@pytest.mark.parametrize("stage", ["scenarios", "tactics", "review"])
def test_ready_all_stages(setup, configured, stage):
    from server.models import DesignTacticRequest, DesignReviewRequest
    _, _, root = setup
    store = ChapterStore(root / "book", root / "slides")
    model = {"scenarios": DesignScenarioRequest, "tactics": DesignTacticRequest,
             "review": DesignReviewRequest}[stage]
    payload = {"scenario": "heartbeat", "retrievalStrategy": "llm_assisted"}
    if stage != "tactics":
        payload["title"] = "availability"
    request = model(**payload)
    before = request.model_dump()
    transport = httpx.MockTransport(lambda req: httpx.Response(200, json={
        "choices": [{"message": {"content": json.dumps(plan())}}]}))
    result = asyncio.run(select_sources(store, request, stage=stage, transport=transport))
    assert result.diagnostics.mode == "normal"
    assert result.sources
    assert result.diagnostics.llm_calls == 1
    assert request.model_dump() == before
