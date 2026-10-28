"""Deterministic navigation metadata, independent of AI teaching configuration."""

import hashlib
import json
from pathlib import Path

from .models import ChapterDetail


_DATA = Path(__file__).with_name("outlines") / "roadmaps.json"


def _signature(chapter: ChapterDetail) -> str:
    # Bind ranges to every extracted page, not a chapter number or page count.
    # Images are not interpreted: these roadmaps summarize source text only.
    payload = [[slide.number, slide.title, slide.text, slide.notes]
               for slide in chapter.slides]
    return hashlib.sha256(json.dumps(
        payload, ensure_ascii=False, separators=(",", ":"),
    ).encode("utf-8")).hexdigest()


def _curated_groups(chapter: ChapterDetail):
    data = json.loads(_DATA.read_text(encoding="utf-8"))
    roadmap = data.get(chapter.id)
    if roadmap is None or roadmap["signature"] != _signature(chapter):
        return None
    groups = []
    start = 1
    for end, title, summary in roadmap["stages"]:
        if not start <= end <= chapter.slideCount:
            return None
        groups.append((title, summary, list(range(start, end + 1))))
        start = end + 1
    return groups if start == chapter.slideCount + 1 else None


def _title_groups(chapter: ChapterDetail):
    groups = []
    summary = (
        "按当前课件标题自动分组，尚未人工核对学习主题；"
        "仅用于页码导航，不推断图像内容。"
    )
    for slide in chapter.slides:
        title = " ".join(slide.title.split())
        title = title or f"第 {slide.number} 页（无可用标题）"
        if groups and groups[-1][0] == title:
            groups[-1][2].append(slide.number)
        else:
            groups.append((title, summary, [slide.number]))
    return groups


def build_outline(chapter: ChapterDetail) -> dict:
    """Return Chinese learning stages or honest, contiguous title navigation.

    Curated signatures cover ordered numbers, titles, body text and notes from
    ChapterStore. Any extracted-content change falls back to current titles.
    Re-rendered image URLs do not affect matching; image-only edits cannot be
    detected from ChapterDetail and no roadmap claims to interpret those images.
    """
    if chapter.slideCount != len(chapter.slides) or [
        slide.number for slide in chapter.slides
    ] != list(range(1, chapter.slideCount + 1)):
        raise ValueError("Chapter slides must match slideCount and be numbered from 1")
    groups = _curated_groups(chapter)
    if groups is None:
        groups = _title_groups(chapter)
    nodes = [
        {"id": f"step-{i}", "title": title, "summary": summary, "slides": pages}
        for i, (title, summary, pages) in enumerate(groups, 1)
    ]
    return {
        "chapterId": chapter.id,
        "title": chapter.title,
        "nodes": nodes,
        "edges": [{"source": a["id"], "target": b["id"]}
                  for a, b in zip(nodes, nodes[1:])],
    }
