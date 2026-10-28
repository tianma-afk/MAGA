import httpx
import pytest
import json
import sys
from types import ModuleType

from test_api import setup, configure_ai, ai_payload


@pytest.mark.parametrize("base", [
    "not-a-url", "ftp://private.example/v1", "https://", "https://host:bad/v1",
    "https://user:password@private.example/v1", "https://private.example/v1?key=secret",
    "https://private.example/v1#fragment",
    "https://private.example:99999/v1", "https://private.example:0/v1",
])
def test_invalid_base_is_configuration_error(setup, monkeypatch, base):
    client, app, _ = setup
    def unexpected(request):
        pytest.fail("Invalid configuration must not call upstream")
    configure_ai(app, monkeypatch, unexpected)
    monkeypatch.setenv("LLM_BASE_URL", base)
    assert client.get("/api/health").json() == {
        "status": "ok", "mode": "unconfigured", "missing": ["LLM_BASE_URL"],
    }
    response = client.post("/api/chat", json={
        "chapterId": "chapter-2", "message": "guide", "slide": 1,
    })
    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "AI_NOT_CONFIGURED"
    assert "LLM_BASE_URL" in response.json()["detail"]["message"]
    assert base not in response.text


def test_configured_health_exposes_only_field_names(setup, monkeypatch):
    client, app, _ = setup
    configure_ai(app, monkeypatch, lambda request: httpx.Response(500))
    assert client.get("/api/health").json() == {
        "status": "ok", "mode": "ai", "missing": [],
    }


def test_chat_schema_only_allows_ai(setup):
    client, _, _ = setup
    schema = client.get("/openapi.json").json()
    assert schema["components"]["schemas"]["ChatResponse"]["properties"]["mode"]["const"] == "ai"


def test_outline_route_and_current_node_context(setup, monkeypatch):
    client, app, _ = setup
    node = {"id": "overview", "title": "Overview", "summary": "Source overview",
            "slides": [1, 2]}
    outline = {"chapterId": "chapter-2", "title": "Second chapter",
               "nodes": [node], "edges": []}
    module = ModuleType("server.outline")
    module.build_outline = lambda chapter: outline
    monkeypatch.setitem(sys.modules, "server.outline", module)
    response = client.get("/api/chapters/chapter-2/outline")
    assert response.status_code == 200
    assert response.json() == outline
    assert client.get("/api/chapters/unknown/outline").status_code == 404
    captured = []
    def handler(request):
        captured.append(json.loads(request.content))
        return httpx.Response(200, json={"choices": [
            {"message": {"content": json.dumps(ai_payload())}}]})
    configure_ai(app, monkeypatch, handler)
    response = client.post("/api/chat", json={
        "chapterId": "chapter-2", "message": "latency", "slide": 1,
    })
    assert response.status_code == 200
    context = json.loads(captured[0]["messages"][-1]["content"])
    assert context["currentOutlineNode"] == node
