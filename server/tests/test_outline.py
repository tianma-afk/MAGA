import importlib
import re
from pathlib import Path

import pytest

from server.chapters import ChapterStore
from server.models import ChapterDetail, Slide


ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture(scope="module")
def store():
    return ChapterStore(ROOT / "book", ROOT / "data" / "slides")


def build(chapter):
    module = importlib.import_module("server.outline")
    return module.build_outline(chapter)


def assert_navigation(outline, chapter):
    assert set(outline) == {"chapterId", "title", "nodes", "edges"}
    assert outline["chapterId"] == chapter.id
    nodes = outline["nodes"]
    assert [page for node in nodes for page in node["slides"]] == list(
        range(1, chapter.slideCount + 1)
    )
    assert len({node["id"] for node in nodes}) == len(nodes)
    for node in nodes:
        assert set(node) == {"id", "title", "summary", "slides"}
        assert node["title"] and node["summary"]
        assert node["slides"] == list(range(node["slides"][0], node["slides"][-1] + 1))
    assert outline["edges"] == [
        {"source": a["id"], "target": b["id"]}
        for a, b in zip(nodes, nodes[1:])
    ]


@pytest.mark.parametrize("number,count,anchor,topic", [
    (1, 85, 36, "视图"),
    (2, 22, 6, "变更"),
    (4, 32, 9, "场景"),
    (5, 39, 17, "心跳"),
    (6, 41, 22, "发现"),
    (7, 62, 45, "发布"),
    (8, 59, 48, "调度"),
])
def test_real_roadmaps_cover_every_page_with_semantic_stages(
    store, number, count, anchor, topic
):
    chapter = store.read(f"chapter-{number}")
    assert chapter.slideCount == count
    outline = build(chapter)
    assert_navigation(outline, chapter)
    assert 5 <= len(outline["nodes"]) <= 12
    assert all(re.search(r"[\u4e00-\u9fff]", node["title"]) for node in outline["nodes"])
    node = next(node for node in outline["nodes"] if anchor in node["slides"])
    assert topic in node["title"] + node["summary"]
    assert not any("自动" in node["summary"] for node in outline["nodes"])


def synthetic(titles, chapter_id="chapter-new"):
    return ChapterDetail(
        id=chapter_id, title="Replacement", filename="Chapter 5-zikun.pptx",
        slideCount=len(titles),
        slides=[Slide(number=i, title=title, text=title, notes="")
                for i, title in enumerate(titles, 1)],
    )


def test_unknown_deck_groups_only_adjacent_matching_titles():
    chapter = synthetic(["Intro", "Storage", "Storage", "Network", "Storage"])
    outline = build(chapter)
    assert_navigation(outline, chapter)
    assert [node["slides"] for node in outline["nodes"]] == [[1], [2, 3], [4], [5]]
    assert [node["title"] for node in outline["nodes"]] == [
        "Intro", "Storage", "Network", "Storage",
    ]
    assert all("标题" in node["summary"] for node in outline["nodes"])


@pytest.mark.parametrize("field", ["title", "text", "notes"])
def test_same_identity_and_page_count_with_changed_content_falls_back(store, field):
    chapter = store.read("chapter-5")
    setattr(chapter.slides[16], field, "Replacement deck content")
    outline = build(chapter)
    assert_navigation(outline, chapter)
    assert all("自动" in node["summary"] for node in outline["nodes"])
    assert not any("心跳" in node["title"] for node in outline["nodes"])


@pytest.mark.parametrize("change", ["append", "remove", "reorder"])
def test_structural_deck_changes_cannot_reuse_curated_ranges(store, change):
    chapter = store.read("chapter-2")
    if change == "append":
        chapter.slides.append(Slide(number=23, title="New topic", text="", notes=""))
    elif change == "remove":
        chapter.slides.pop()
    else:
        chapter.slides[3], chapter.slides[4] = chapter.slides[4], chapter.slides[3]
        for i, slide in enumerate(chapter.slides, 1):
            slide.number = i
    chapter.slideCount = len(chapter.slides)
    outline = build(chapter)
    assert_navigation(outline, chapter)
    assert all("自动" in node["summary"] for node in outline["nodes"])


def test_sparse_pages_do_not_invent_visual_content():
    chapter = synthetic(["", "Slide 2", "Software Architecture", "Actual topic"])
    outline = build(chapter)
    assert_navigation(outline, chapter)
    assert outline["nodes"][0]["title"] == "第 1 页（无可用标题）"
    assert all("图像" in node["summary"] for node in outline["nodes"])


def test_empty_deck():
    chapter = synthetic([])
    assert_navigation(build(chapter), chapter)


def test_results_are_independent_and_image_urls_do_not_change_text_signature(store):
    chapter = store.read("chapter-5")
    first = build(chapter)
    chapter.slides[0].imageUrl = "/new-render/1.png"
    second = build(chapter)
    assert first == second
    first["nodes"][0]["slides"].clear()
    assert build(chapter) == second


def test_page_count_mismatch_is_rejected():
    chapter = synthetic(["A"])
    chapter.slideCount = 2
    with pytest.raises(ValueError, match="slide"):
        build(chapter)


def test_noncontiguous_slide_numbers_are_rejected():
    chapter = synthetic(["A", "B"])
    chapter.slides[1].number = 4
    with pytest.raises(ValueError, match="slide"):
        build(chapter)
