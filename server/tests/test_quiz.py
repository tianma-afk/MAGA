import importlib
import json

import httpx
import pytest
from fastapi.testclient import TestClient
from pptx import Presentation

from test_api import configure_ai, setup


def quiz_payload():
    return {"questions": [
        {
            "question": "What detects failure?",
            "options": ["Heartbeat", "Latency", "Throughput", "Coupling"],
            "correctIndex": 0,
            "explanation": "Heartbeat detects failure.",
            "citations": [{"slide": 2, "title": "untrusted title"}],
        },
        {
            "question": "What supports recovery?",
            "options": ["Redundancy", "Polling", "Caching", "Forking"],
            "correctIndex": 0,
            "explanation": "Redundancy supports recovery.",
            "citations": [{"slide": 2, "title": "untrusted title"}],
        },
        {
            "question": "What is latency?",
            "options": ["Time to respond", "Time to boot", "Time to compile", "Time to deploy"],
            "correctIndex": 0,
            "explanation": "Latency is the time to respond.",
            "citations": [{"slide": 3, "title": "untrusted title"}],
        },
    ]}


def with_first(**changes):
    payload = quiz_payload()
    payload["questions"][0].update(changes)
    return payload


def chapter_id(client):
    return client.get("/api/chapters").json()[0]["id"]


def test_unconfigured_quiz_does_not_call_provider(setup):
    client, app, _ = setup
    calls = []

    def handler(request):
        calls.append(request)
        return httpx.Response(500)

    app.state.llm_transport = httpx.MockTransport(handler)
    response = client.post("/api/quiz", json={"chapterId": chapter_id(client), "slide": 1})
    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "AI_NOT_CONFIGURED"
    assert calls == []


@pytest.mark.parametrize("change", [
    {"slide": 0},
    {"slide": 4},
    {"slide": True},
    {"chapterId": "../secret"},
    {"chapterId": "unknown"},
])
def test_bad_quiz_requests(setup, change):
    client, _, _ = setup
    payload = {"chapterId": chapter_id(client), "slide": 1}
    payload.update(change)
    assert client.post("/api/quiz", json=payload).status_code in (404, 422)


def test_quiz_grounding_canonical_citations_and_prompt(setup, monkeypatch):
    client, app, _ = setup
    captured = []

    def handler(request):
        captured.append(json.loads(request.content))
        return httpx.Response(200, json={"choices": [
            {"message": {"content": json.dumps(quiz_payload())}}]})

    configure_ai(app, monkeypatch, handler)
    response = client.post("/api/quiz", json={
        "chapterId": chapter_id(client), "slide": 2,
    })
    assert response.status_code == 200
    body = response.json()
    assert body["mode"] == "ai"
    assert len(body["questions"]) == 3
    assert body["questions"][0]["citations"] == [{"slide": 2, "title": "Availability"}]
    prompt = json.dumps(captured[0], ensure_ascii=False)
    assert "Heartbeat detects failure" in prompt
    assert "Speaker explanation for Availability" in prompt
    assert "test-secret" not in response.text


@pytest.mark.parametrize("body", [
    {"questions": quiz_payload()["questions"][:2]},
    {"questions": quiz_payload()["questions"] * 2},
    {"questions": "nope"},
    with_first(options=["only"]),
    with_first(options=["A", "B", "C", "D", "E", "F", "G"]),
    with_first(options=["A", "A", "B", "C"]),
    with_first(correctIndex=4),
    with_first(correctIndex=-1),
    with_first(correctIndex=True),
    with_first(correctIndex="1"),
    with_first(question=""),
    with_first(explanation=""),
    with_first(citations=[]),
    with_first(citations=[{"slide": 999, "title": "bad"}]),
    with_first(citations=[{"slide": 1, "title": "bad"}]),
])
def test_invalid_quiz_output_is_502(setup, monkeypatch, body):
    client, app, _ = setup
    configure_ai(app, monkeypatch, lambda request: httpx.Response(
        200, json={"choices": [{"message": {"content": json.dumps(body)}}]}))
    response = client.post("/api/quiz", json={
        "chapterId": chapter_id(client), "slide": 2,
    })
    assert response.status_code == 502


@pytest.mark.parametrize("body", [
    {}, {"choices": []}, {"choices": [{"message": {"content": "not json"}}]},
])
def test_malformed_quiz_upstream_is_502(setup, monkeypatch, body):
    client, app, _ = setup
    configure_ai(app, monkeypatch, lambda request: httpx.Response(200, json=body))
    assert client.post("/api/quiz", json={
        "chapterId": chapter_id(client), "slide": 2,
    }).status_code == 502


@pytest.mark.parametrize("status", [401, 429, 500])
def test_quiz_upstream_error_not_hidden(setup, monkeypatch, status):
    client, app, _ = setup
    configure_ai(app, monkeypatch, lambda request: httpx.Response(
        status, text="private upstream details"))
    response = client.post("/api/quiz", json={
        "chapterId": chapter_id(client), "slide": 2,
    })
    assert response.status_code == 502
    assert "private upstream details" not in response.text


def test_quiz_upstream_timeout_is_502(setup, monkeypatch):
    client, app, _ = setup

    def timeout(request):
        raise httpx.ReadTimeout("private diagnostic")

    configure_ai(app, monkeypatch, timeout)
    response = client.post("/api/quiz", json={
        "chapterId": chapter_id(client), "slide": 2,
    })
    assert response.status_code == 502
    assert "private diagnostic" not in response.text


def test_sparse_sources_do_not_call_provider(tmp_path, monkeypatch):
    monkeypatch.setenv("LLM_API_KEY", "test-secret")
    monkeypatch.setenv("LLM_BASE_URL", "https://llm.example/v1")
    monkeypatch.setenv("LLM_MODEL", "test-model")
    book = tmp_path / "book"
    book.mkdir()
    presentation = Presentation()
    slide = presentation.slides.add_slide(presentation.slide_layouts[5])
    slide.shapes.title.text = "Architecture"
    presentation.save(book / "Chapter 2.pptx")
    module = importlib.import_module("server.main")
    app = module.create_app(book_dir=book, slides_dir=tmp_path / "slides")
    client = TestClient(app)

    def unexpected(request):
        pytest.fail("Sparse sources must not call the provider")

    app.state.llm_transport = httpx.MockTransport(unexpected)
    response = client.post("/api/quiz", json={"chapterId": "chapter-2", "slide": 1})
    assert response.status_code == 422
    assert "文字不足" in response.json()["detail"]
