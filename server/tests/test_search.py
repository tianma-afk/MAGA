import importlib

from fastapi.testclient import TestClient
from pptx import Presentation

from test_api import setup


def test_search_finds_matching_slides_across_chapters(setup):
    client, _, _ = setup
    response = client.get("/api/search", params={"q": "heartbeat"})
    assert response.status_code == 200
    body = response.json()
    assert body["query"] == "heartbeat"
    assert {result["chapterId"] for result in body["results"]} == {"chapter-2", "chapter-10"}
    assert {result["slide"] for result in body["results"]} == {2}
    assert all("Heartbeat" in result["snippet"] for result in body["results"])


def test_title_matches_rank_above_body_and_notes(setup):
    client, _, _ = setup
    results = client.get("/api/search", params={"q": "Second chapter"}).json()["results"]
    assert results[0]["chapterId"] == "chapter-2"
    assert results[0]["slide"] == 1
    assert results[0]["score"] > results[-1]["score"]


def test_search_limit_no_results_and_unconfigured_mode(setup):
    client, _, _ = setup
    assert client.get("/api/health").json()["mode"] == "unconfigured"
    limited = client.get("/api/search", params={"q": "architecture", "limit": 1})
    assert limited.status_code == 200
    assert len(limited.json()["results"]) == 1
    assert client.get("/api/search", params={"q": "zzzz"}).json()["results"] == []


def test_search_query_validation(setup):
    client, _, _ = setup
    for params in (
        {"q": ""},
        {"q": "   "},
        {"q": "x" * 201},
        {"q": "architecture", "limit": 0},
        {"q": "architecture", "limit": 51},
    ):
        assert client.get("/api/search", params=params).status_code == 422


def test_chinese_bigram_search(tmp_path):
    book = tmp_path / "book"
    book.mkdir()
    presentation = Presentation()
    slide = presentation.slides.add_slide(presentation.slide_layouts[1])
    slide.shapes.title.text = "可用性"
    slide.placeholders[1].text = "心跳检测用于发现故障。"
    presentation.save(book / "Chapter 5.pptx")
    module = importlib.import_module("server.main")
    client = TestClient(module.create_app(book_dir=book, slides_dir=tmp_path / "slides"))
    response = client.get("/api/search", params={"q": "心跳检测"})
    assert response.status_code == 200
    results = response.json()["results"]
    assert results and results[0]["slide"] == 1
    assert "心跳" in results[0]["snippet"]
