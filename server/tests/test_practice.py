"""Deterministic practice workflow tests: no live model or Jina requests."""
import json

import httpx
from test_api import configure_ai, setup


CITE = {"chapterId": "chapter-2", "slide": 2, "title": "fictional title"}
QUESTIONS = [
    {"id": "capacity", "question": "并发报名时如何保证名额一致且不会发生重复报名？",
     "citations": [CITE]},
    {"id": "notification", "question": "通知服务故障后如何保证报名不受影响，同时使消息最终送达？",
     "citations": [CITE]},
    {"id": "evolution", "question": "热点报名导致性能下降时如何权衡扩容、排队与用户体验？",
     "citations": [CITE]},
]
PLAN = {"caseId": "campus-booking",
        "analysis": "需要保证超额报名与重复报名不出现，并考虑异步通知与性能瓶颈。",
        "retrievalStrategy": "baseline"}
FOLLOWUP = {"action": "followup", "feedback": "方案没有充分讨论数据库故障。",
            "followup": "如果名额已经扣减但报名记录写入失败，你准备如何处理一致性问题？",
            "citations": [CITE]}
COMPLETE = {"action": "complete", "feedback": "能够辨析事务和锁竞争之间的权衡。",
            "followup": None, "citations": [CITE]}
FINAL = {"summary": "独立回答已经考虑主要约束，后续修正进一步处理了故障恢复与权衡。",
         "strengths": ["能够辨析一致性"], "improvements": ["补充性能验证"],
         "referenceApproach": "优先以数据库事务保证名额一致性，再根据性能验证选择扩展策略。",
         "citations": [CITE]}


def mock_sequence(app, monkeypatch, outputs):
    iterator = iter(outputs)
    calls = []

    def handler(request):
        payload = json.loads(request.content)
        calls.append(payload)
        try:
            item = next(iterator)
        except StopIteration as exc:
            raise AssertionError("Unexpected extra model request") from exc
        return httpx.Response(200, json={
            "choices": [{"message": {"content": json.dumps(item, ensure_ascii=False)}}]})
    configure_ai(app, monkeypatch, handler)
    return calls


def query():
    return {"queries": ["availability heartbeat recovery"]}


def test_public_cases_hide_answer_rubrics(setup):
    client, _, _ = setup
    cases = client.get("/api/practice/cases").json()
    assert len(cases) == 3
    assert all("objectives" not in item for item in cases)
    assert cases[0]["id"] == "campus-booking"


def test_practice_plan_and_answer_with_verified_sources(setup, monkeypatch):
    client, app, _ = setup
    captured = mock_sequence(app, monkeypatch,
        [query(), {"decisions": QUESTIONS}, query(), FOLLOWUP, query(), COMPLETE])
    plan = client.post("/api/practice/plan", json=PLAN)
    assert plan.status_code == 200, plan.text
    result = plan.json()
    assert result["decisions"][0]["citations"] == [
        {"chapterId": "chapter-2", "slide": 2, "title": "Availability"}]
    assert result["knowledge"]["queries"] == ["availability heartbeat recovery"]
    assert len(captured) == 2
    request = {**PLAN, "decision": result["decisions"][0],
               "turns": [{"question": QUESTIONS[0]["question"],
                          "answer": "我会使用数据库事务和唯一索引控制名额及重复报名。"}]}
    first = client.post("/api/practice/answer", json=request)
    assert first.status_code == 200, first.text
    assert first.json()["action"] == "followup"
    request["turns"].append({"question": FOLLOWUP["followup"],
                             "answer": "将名额扣减和记录插入放在同一事务，回滚时一起撤销。"})
    second = client.post("/api/practice/answer", json=request)
    assert second.status_code == 200, second.text
    assert second.json()["action"] == "complete"
    assert len(captured) == 6
    assert all("Heartbeat detects failure" in json.dumps(call)
               for call in [captured[1], captured[3], captured[5]])


def test_rejects_forged_citation_and_unrelated_objectives(setup, monkeypatch):
    client, app, _ = setup
    bad = {"decisions": [dict(QUESTIONS[0], citations=[
        {"chapterId": "chapter-2", "slide": 998, "title": "fake"}]), *QUESTIONS[1:]]}
    mock_sequence(app, monkeypatch, [query(), bad])
    assert client.post("/api/practice/plan", json=PLAN).status_code == 502


def test_invalid_queries_are_not_used_as_retrieval(setup, monkeypatch):
    client, app, _ = setup
    mock_sequence(app, monkeypatch, [{"queries": ["第5章/心跳"]}])
    assert client.post("/api/practice/plan", json=PLAN).status_code == 502


def test_final_requires_three_completed_case_decisions(setup, monkeypatch):
    client, app, _ = setup
    records = [{"decision": q, "turns": [{
        "question": q["question"], "answer": "采用事务保证一致性，并明确故障重试与性能权衡。"
    }], "assessment": COMPLETE} for q in QUESTIONS]
    body = {**PLAN, "decisions": records}
    incomplete = {**body, "decisions": records[:2]}
    assert client.post("/api/practice/finalize", json=incomplete).status_code == 422
    mock_sequence(app, monkeypatch, [query(), FINAL])
    result = client.post("/api/practice/finalize", json=body)
    assert result.status_code == 200, result.text
    assert result.json()["citations"][0]["title"] == "Availability"


def test_last_answer_round_forces_completion(setup, monkeypatch):
    client, app, _ = setup
    mock_sequence(app, monkeypatch, [query(), FOLLOWUP])
    body = {**PLAN, "decision": QUESTIONS[0], "turns": [
        {"question": QUESTIONS[0]["question"],
         "answer": "第一轮使用关系数据库事务确保记录一致，并限制重复报名。"},
        {"question": FOLLOWUP["followup"],
         "answer": "第二轮讨论高并发性能和事务隔离，提供压测验证指标。"},
        {"question": "第三轮怎样权衡扩容成本和数据一致性，你会如何解释？",
         "answer": "第三轮优先保持一致性，然后用可观察的指标衡量优化效果。"},
    ]}
    result = client.post("/api/practice/answer", json=body)
    assert result.status_code == 200, result.text
    assert result.json()["action"] == "complete"
    assert result.json()["followup"] is None


def test_unknown_case_and_unconfigured_model(setup):
    client, _, _ = setup
    assert client.post("/api/practice/plan", json={**PLAN, "caseId": "missing"}).status_code == 404
    response = client.post("/api/practice/plan", json=PLAN)
    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "AI_NOT_CONFIGURED"


def test_optional_analysis_is_accepted_for_all_practice_stages(setup, monkeypatch):
    client, app, _ = setup
    minimal = {"caseId": "campus-booking", "retrievalStrategy": "baseline"}
    captured = mock_sequence(app, monkeypatch, [
        query(), {"decisions": QUESTIONS}, query(), COMPLETE, query(), FINAL])
    plan = client.post("/api/practice/plan", json=minimal)
    assert plan.status_code == 200, plan.text
    decision = plan.json()["decisions"][0]
    answer = client.post("/api/practice/answer", json={
        **minimal, "decision": decision, "turns": [{
            "question": decision["question"],
            "answer": "我会用数据库事务控制名额并保留唯一约束来防止重复报名。",
        }],
    })
    assert answer.status_code == 200, answer.text
    records = [
        {"decision": item, "turns": [{
            "question": item["question"],
            "answer": "先识别系统约束，再考虑事务一致性和错误恢复策略的权衡。",
        }], "assessment": COMPLETE}
        for item in plan.json()["decisions"]
    ]
    final = client.post("/api/practice/finalize",
                        json={**minimal, "decisions": records})
    assert final.status_code == 200, final.text
    assert len(captured) == 6
    assert "analysis" not in minimal
    # The skipped analysis is not silently replaced with invented learner content.
    assert any("NOT SUBMITTED" in call["messages"][0]["content"]
               for call in captured)
