import importlib

from fastapi.testclient import TestClient
from pptx import Presentation

from server.models import ChapterDetail, Slide
from server.retrieval_terms import SYNONYM_GROUPS, expand_terms, query_terms
from server.search import _score, _snippet, search_all
from server.tutor import relevant_slides

from test_api import setup


def test_synonym_expansion_is_symmetric_and_deduplicated():
    assert expand_terms(["心跳"]) == ["heartbeat", "心跳"]
    assert expand_terms(["heartbeat"]) == ["heartbeat", "心跳"]
    assert expand_terms(["心跳", "heartbeat"]) == ["heartbeat", "心跳"]
    assert expand_terms(["未知词"]) == ["未知词"]


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


def test_chinese_query_finds_english_heartbeat_slides(setup):
    client, _, _ = setup
    results = client.get("/api/search", params={"q": "心跳"}).json()["results"]
    assert {result["chapterId"] for result in results} == {"chapter-2", "chapter-10"}
    assert {result["slide"] for result in results} == {2}
    assert all("Heartbeat" in result["snippet"] for result in results)


def test_english_query_finds_chinese_heartbeat_slide(tmp_path):
    book = tmp_path / "book"
    book.mkdir()
    presentation = Presentation()
    slide = presentation.slides.add_slide(presentation.slide_layouts[1])
    slide.shapes.title.text = "可用性"
    slide.placeholders[1].text = "心跳检测用于发现故障。"
    presentation.save(book / "Chapter 5.pptx")
    module = importlib.import_module("server.main")
    client = TestClient(module.create_app(book_dir=book, slides_dir=tmp_path / "slides"))
    results = client.get("/api/search", params={"q": "heartbeat"}).json()["results"]
    assert results and results[0]["slide"] == 1
    assert "心跳" in results[0]["snippet"]


def test_tutor_retrieval_reads_ocr_and_expands_synonyms():
    chapter = ChapterDetail(
        id="chapter-5", title="Availability", filename="chapter5.pptx", slideCount=3,
        slides=[
            Slide(number=1, title="Intro", text="", notes=""),
            Slide(number=2, title="Detect Faults", text="",
                  notes="", ocrText="heartbeat resets the watchdog timer"),
            Slide(number=3, title="Performance", text="latency budget", notes=""),
        ],
    )
    assert [slide.number for slide in relevant_slides(chapter, "心跳")] == [2]
    assert [slide.number for slide in relevant_slides(chapter, "heartbeat")] == [2]
    assert [slide.number for slide in relevant_slides(chapter, "延迟")] == []


def test_bilingual_queries_share_terms_and_mixed_queries_do_not_add_weight(setup):
    client, _, _ = setup
    for group in SYNONYM_GROUPS:
        expected = query_terms(group[0])
        assert all(query_terms(alias) == expected for alias in group)
        assert query_terms(" ".join(group * 2)) == expected
    expected = client.get("/api/search", params={"q": "heartbeat"}).json()["results"]
    for query in ("心跳", "HEARTBEAT", "heartbeat 心跳 heartbeat"):
        assert client.get("/api/search", params={"q": query}).json()["results"] == expected
    assert "heartbeat" in query_terms("请解释心跳检测")
    assert "modifiability" in query_terms("解释可修改性")


def test_english_terms_do_not_match_inside_other_words():
    assert _score("default heartbeats", "", "", "", query_terms("fault heartbeat")) == 0
    assert _score("FAULT", "", "", "", query_terms("故障")) == 3
    assert _score("fault fault fault fault", "", "", "", query_terms("故障")) == 9
    assert "fault" not in query_terms("default")
    assert "heartbeat" not in query_terms("preheartbeat")
    assert _snippet("", "default " + "x" * 140 + " fault found", "", "", ["fault"]) \
        .endswith("fault found")
    chapter = ChapterDetail(
        id="a", title="a", filename="a.pptx", slideCount=2,
        slides=[Slide(number=1, title="default", text="preheartbeat", notes=""),
                Slide(number=2, title="faults", text="heartbeat", notes="")],
    )
    assert [s.number for s in relevant_slides(chapter, "故障 心跳")] == [2]


def test_tutor_and_search_use_the_same_bilingual_vocabulary():
    chapter = ChapterDetail(
        id="a", title="a", filename="a.pptx", slideCount=2,
        slides=[Slide(number=1, title="Modifiability", text="", notes=""),
                Slide(number=2, title="可修改性", text="", notes="")],
    )

    class Store:
        def files(self):
            return {chapter.id: None}

        def read(self, chapter_id):
            return chapter

    english = search_all(Store(), "modifiability").results
    chinese = search_all(Store(), "可修改性").results
    assert english == chinese
    assert [s.number for s in relevant_slides(chapter, "modifiability")] \
        == [s.number for s in relevant_slides(chapter, "可修改性")]


def test_snippet_positions_survive_length_changing_lowercase():
    # "İ".lower() grows the string, so hit positions must come from the
    # original text that the snippet is sliced from.
    body = "İ" * 50 + " target term here " + "y" * 30
    snippet = _snippet("t", body, "", "", ["term"])
    assert "term" in snippet
