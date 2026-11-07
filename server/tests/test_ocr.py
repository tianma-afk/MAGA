from pathlib import Path

from fastapi.testclient import TestClient
from pptx import Presentation

from server.chapters import ChapterStore
from server.main import create_app
from server.quiz import _has_source_text
from server.search import search_all
from server.tutor import excerpt


def blank_deck(tmp_path) -> ChapterStore:
    book = tmp_path / "book"
    book.mkdir()
    presentation = Presentation()
    slide = presentation.slides.add_slide(presentation.slide_layouts[5])
    slide.shapes.title.text = "Checksum"
    presentation.save(book / "Chapter 5.pptx")
    return ChapterStore(book, tmp_path / "slides")


def write_ocr(tmp_path, text: str):
    target = tmp_path / "ocr" / "chapter-5"
    target.mkdir(parents=True)
    (target / "1.txt").write_text(text, encoding="utf-8")


def test_ocr_text_is_loaded_and_used_by_context_and_search(tmp_path):
    store = blank_deck(tmp_path)
    write_ocr(tmp_path, "校验和 Checksum 示例：0xA8 + 0x50 + 0x3F + 0x2D，最终结果 0x64。")
    chapter = store.read("chapter-5")
    assert chapter.slides[0].ocrText.startswith("校验和")
    assert "OCR 识别文本" in excerpt(chapter.slides[0])
    assert _has_source_text(chapter.slides[0])
    response = search_all(store, "校验和")
    assert response.results
    assert response.results[0].slide == 1
    assert "校验和" in response.results[0].snippet


def test_chapter_api_and_search_api_expose_ocr(tmp_path):
    blank_deck(tmp_path)
    write_ocr(tmp_path, "校验和 Checksum 示例：最终结果 0x64。")
    client = TestClient(create_app(
        book_dir=tmp_path / "book", slides_dir=tmp_path / "slides",
    ))
    detail = client.get("/api/chapters/chapter-5").json()
    assert detail["slides"][0]["ocrText"].startswith("校验和")
    results = client.get("/api/search", params={"q": "校验和"}).json()["results"]
    assert results and results[0]["slide"] == 1


def test_sparse_page_without_ocr_still_returns_fallback(tmp_path):
    store = blank_deck(tmp_path)
    chapter = store.read("chapter-5")
    assert chapter.slides[0].ocrText is None
    assert "图像内容尚未解析" in excerpt(chapter.slides[0])
    assert not _has_source_text(chapter.slides[0])
