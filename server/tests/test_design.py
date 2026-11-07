import json

import httpx
import pytest

from test_api import configure_ai, setup

CITATION = [{"chapterId": "chapter-2", "slide": 2, "title": "untrusted"}]
SCENARIO_REQUEST = {
    "title": "在线考试系统",
    "scenario": "heartbeat availability for an online exam system",
    "requirements": "考试期间必须高可用",
}
SCENARIO_ANSWER = {
    "qualityAttributes": [{
        "name": "可用性", "priority": "high", "reason": "考试期间不能中断",
    }],
    "scenarios": [{
        "stimulus": "组件故障", "source": "监控器", "artifact": "考试服务",
        "environment": "正常运行", "response": "检测并恢复",
        "measure": "故障在 5 分钟内恢复", "citations": CITATION,
    }],
}
TACTIC_REQUEST = {
    "scenario": SCENARIO_REQUEST["scenario"],
    "requirements": SCENARIO_REQUEST["requirements"],
    "qualityAttributes": SCENARIO_ANSWER["qualityAttributes"],
    "scenarios": SCENARIO_ANSWER["scenarios"],
}
TACTIC_ANSWER = {
    "tactics": [{
        "name": "心跳检测", "rationale": "及时发现组件故障",
        "tradeoffs": "增加周期消息开销", "citations": CITATION,
    }],
}
REVIEW_REQUEST = {
    "title": SCENARIO_REQUEST["title"],
    "scenario": SCENARIO_REQUEST["scenario"],
    "requirements": SCENARIO_REQUEST["requirements"],
    "qualityAttributes": SCENARIO_ANSWER["qualityAttributes"],
    "scenarios": SCENARIO_ANSWER["scenarios"],
    "tactics": TACTIC_ANSWER["tactics"],
}
REVIEW_ANSWER = {
    "summary": "方案覆盖了可用性，但恢复策略还需要细化。",
    "findings": [{
        "area": "可用性", "finding": "缺少恢复措施", "severity": "high",
        "suggestion": "补充冗余和恢复流程", "citations": CITATION,
    }],
    "questions": ["心跳停止后如何恢复？"],
}


def handler_for(captured):
    payloads = iter([SCENARIO_ANSWER, TACTIC_ANSWER, REVIEW_ANSWER])

    def handler(request):
        captured.append(json.loads(request.content))
        payload = next(payloads)
        return httpx.Response(200, json={"choices": [
            {"message": {"content": json.dumps(payload)}}]})
    return handler


def endpoints():
    return [
        ("/api/design/scenarios", SCENARIO_REQUEST),
        ("/api/design/tactics", TACTIC_REQUEST),
        ("/api/design/review", REVIEW_REQUEST),
    ]


def test_design_unconfigured_returns_503(setup):
    client, app, _ = setup
    calls = []
    app.state.llm_transport = httpx.MockTransport(lambda request: calls.append(request))
    for path, payload in endpoints():
        response = client.post(path, json=payload)
        assert response.status_code == 503
        assert response.json()["detail"]["code"] == "AI_NOT_CONFIGURED"
    assert calls == []


def test_design_happy_path_canonical_citations_and_prompt(setup, monkeypatch):
    client, app, _ = setup
    captured = []
    configure_ai(app, monkeypatch, handler_for(captured))
    scenarios = client.post("/api/design/scenarios", json=SCENARIO_REQUEST)
    tactics = client.post("/api/design/tactics", json=TACTIC_REQUEST)
    review = client.post("/api/design/review", json=REVIEW_REQUEST)
    assert scenarios.status_code == 200
    assert tactics.status_code == 200
    assert review.status_code == 200
    assert scenarios.json()["mode"] == "ai"
    assert scenarios.json()["scenarios"][0]["citations"][0]["title"] == "Availability"
    assert tactics.json()["tactics"][0]["citations"][0]["chapterId"] == "chapter-2"
    assert review.json()["findings"][0]["severity"] == "high"
    prompt = json.dumps(captured, ensure_ascii=False)
    assert "Heartbeat detects failure" in prompt
    assert "Speaker explanation for Availability" in prompt
    assert "test-secret" not in scenarios.text


@pytest.mark.parametrize("path,payload", [
    ("/api/design/scenarios", {"title": "", "scenario": "x"}),
    ("/api/design/scenarios", {"title": "x", "scenario": ""}),
    ("/api/design/tactics", {"scenario": ""}),
    ("/api/design/review", {"title": "", "scenario": "x"}),
])
def test_bad_design_requests(setup, path, payload):
    client, _, _ = setup
    assert client.post(path, json=payload).status_code == 422


def test_design_without_course_sources_is_422(setup, monkeypatch):
    client, app, _ = setup
    configure_ai(app, monkeypatch, lambda request: pytest.fail("must not call provider"))
    response = client.post("/api/design/scenarios", json={
        "title": "不存在的主题", "scenario": "zzzzqqq", "requirements": "zzzz",
    })
    assert response.status_code == 422
    assert "课件" in response.json()["detail"]


@pytest.mark.parametrize("path,payload,bad", [
    ("/api/design/scenarios", SCENARIO_REQUEST, {
        **SCENARIO_ANSWER,
        "scenarios": [{**SCENARIO_ANSWER["scenarios"][0],
                       "citations": [{"chapterId": "chapter-2", "slide": 999, "title": "bad"}]}],
    }),
    ("/api/design/tactics", TACTIC_REQUEST, {
        **TACTIC_ANSWER,
        "tactics": [{**TACTIC_ANSWER["tactics"][0], "citations": []}],
    }),
    ("/api/design/review", REVIEW_REQUEST, {
        **REVIEW_ANSWER,
        "findings": [{**REVIEW_ANSWER["findings"][0],
                      "citations": [{"chapterId": "chapter-2", "slide": 1, "title": "bad"}]}],
    }),
])
def test_invalid_design_output_is_502(setup, monkeypatch, path, payload, bad):
    client, app, _ = setup
    configure_ai(app, monkeypatch, lambda request: httpx.Response(200, json={
        "choices": [{"message": {"content": json.dumps(bad)}}]}))
    assert client.post(path, json=payload).status_code == 502


def test_design_upstream_failure_is_502(setup, monkeypatch):
    client, app, _ = setup
    configure_ai(app, monkeypatch, lambda request: httpx.Response(500, text="private"))
    response = client.post("/api/design/scenarios", json=SCENARIO_REQUEST)
    assert response.status_code == 502
    assert "private" not in response.text


def test_design_timeout_is_502(setup, monkeypatch):
    client, app, _ = setup

    def timeout(request):
        raise httpx.ReadTimeout("private diagnostic")

    configure_ai(app, monkeypatch, timeout)
    response = client.post("/api/design/scenarios", json=SCENARIO_REQUEST)
    assert response.status_code == 502
    assert "private diagnostic" not in response.text
