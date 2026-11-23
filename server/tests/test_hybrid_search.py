"""Deterministic hybrid retrieval tests: no external API calls or credentials."""
import sqlite3

import httpx
import pytest

from server.hybrid_search import english_query, hybrid_search
from server.models import ChapterDetail, Slide
from server.retrieval_index import DIMENSIONS, rebuild


class FakeStore:
    def __init__(self):
        self.slides = [
            Slide(number=1, title="Availability", text="reliability fault detection",
                  notes="", ocrText=""),
            Slide(number=2, title="Performance", text="throughput and latency",
                  notes="", ocrText=""),
        ]

    def files(self):
        return {"chapter-5": "dummy.pptx"}

    def read(self, chapter_id):
        return ChapterDetail(id=chapter_id, title="Software Architecture",
                             filename="dummy.pptx", slideCount=len(self.slides),
                             slides=self.slides)


def vector(kind):
    values = [0.0] * DIMENSIONS
    values[kind] = 1.0
    return values


def fake_embed(texts, task):
    if task == "retrieval.query":
        return [vector(1)]
    return [vector(0 if "Availability" in text else 1) for text in texts]


def test_index_incremental_and_hybrid_ranking(tmp_path, monkeypatch):
    monkeypatch.setenv("JINA_API_KEY", "not-a-real-key")
    path = tmp_path / "index.sqlite3"
    store = FakeStore()
    assert rebuild(store, path=path, embed=fake_embed) == {
        "total": 2, "updated": 2, "deleted": 0}
    assert rebuild(store, path=path, embed=fake_embed)["updated"] == 0
    result = hybrid_search("reliability", path=path, embed=fake_embed)
    assert result.query == "reliability"
    assert len(result.results) == 2
    assert result.results[0].slide == 2  # 0.5 semantic exceeds 0.2 lexical.
    assert all(item.score >= 1 for item in result.results)
    store.slides.pop()
    assert rebuild(store, path=path, embed=fake_embed)["deleted"] == 1
    with sqlite3.connect(path) as conn:
        assert conn.execute("SELECT COUNT(*) FROM slides").fetchone()[0] == 1
        assert conn.execute("SELECT COUNT(*) FROM slides_fts").fetchone()[0] == 1


def test_english_query_passthrough():
    assert english_query("availability fault detection") == "availability fault detection"


def test_translation_uses_english_and_rejects_chinese(monkeypatch):
    from server.config import AIConfig
    monkeypatch.setattr("server.config.read_ai_config",
                        lambda: AIConfig("fake", "test", "https://example.com/v1", ()))

    def reply(content):
        return httpx.MockTransport(lambda req: httpx.Response(200, json={
            "choices": [{"message": {"content": content}}]
        }))

    assert english_query("可用性", transport=reply('{"query": "availability"}')) == "availability"
    with pytest.raises(ValueError, match="Invalid English"):
        english_query("可用性", transport=reply('{"query": "可用性"}'))


def test_search_fallback_without_jina(tmp_path, monkeypatch):
    from server.search import search_all
    monkeypatch.delenv("JINA_API_KEY", raising=False)
    result = search_all(FakeStore(), "reliability")
    assert result.results[0].slide == 1


def test_configured_but_missing_index_falls_back(tmp_path, monkeypatch):
    from server.search import search_all
    from server import hybrid_search as hybrid_module
    monkeypatch.setenv("JINA_API_KEY", "fake")
    monkeypatch.setattr(hybrid_module, "hybrid_search",
                        lambda *args, **kwargs: (_ for _ in ()).throw(ValueError("index missing")))
    result = search_all(FakeStore(), "availability")
    assert result.results[0].slide == 1


def test_incremental_update_after_content_change(tmp_path):
    path = tmp_path / "index.sqlite3"
    store = FakeStore()
    rebuild(store, path=path, embed=fake_embed)
    store.slides[0].notes = "updated material"
    assert rebuild(store, path=path, embed=fake_embed) == {
        "total": 2, "updated": 1, "deleted": 0
    }
