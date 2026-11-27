"""API contract for automatic RAG index preparation."""
import pytest

from test_api import setup


def test_prepare_index_when_selected(setup, monkeypatch):
    from server import main
    client, _, _ = setup
    monkeypatch.setenv("JINA_API_KEY", "mock-only")
    calls = []
    def fake_rebuild(store):
        calls.append(store)
        return {"total": 2, "updated": 2 if len(calls) == 1 else 0, "deleted": 0}
    monkeypatch.setattr(main, "rebuild", fake_rebuild)
    first = client.post("/api/retrieval/index/ensure")
    second = client.post("/api/retrieval/index/ensure")
    assert first.status_code == second.status_code == 200
    assert first.json() == {"status": "ready", "total": 2, "updated": 2, "deleted": 0}
    assert second.json()["updated"] == 0
    assert len(calls) == 2


def test_prepare_index_requires_jina_key(setup, monkeypatch):
    from server import main
    client, _, _ = setup
    monkeypatch.delenv("JINA_API_KEY", raising=False)
    monkeypatch.setattr(main, "rebuild", lambda store: pytest.fail("must not build"))
    response = client.post("/api/retrieval/index/ensure")
    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "RAG_INDEX_UNAVAILABLE"


@pytest.mark.parametrize("reason", ["upstream failed", "no slides"])
def test_prepare_index_failure_does_not_claim_ready(setup, monkeypatch, reason):
    from server import main
    client, _, _ = setup
    monkeypatch.setenv("JINA_API_KEY", "mock-only")
    def fail(store):
        if reason == "no slides":
            return {"total": 0, "updated": 0, "deleted": 0}
        raise ValueError(reason)
    monkeypatch.setattr(main, "rebuild", fail)
    response = client.post("/api/retrieval/index/ensure")
    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "RAG_INDEX_UNAVAILABLE"
    assert "upstream failed" not in response.text
