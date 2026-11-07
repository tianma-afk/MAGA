import re

from fastapi import HTTPException

from .chapters import meaningful_text
from .models import SearchResponse, SearchResult

ENGLISH = re.compile(r"[a-z0-9]{2,}")
CJK_RUN = re.compile(r"[一-鿿]+")
STOPWORDS = {
    "the", "and", "for", "with", "what", "how", "why", "this", "that",
    "from", "are", "was", "were", "is", "of", "to", "in", "on", "a", "an",
}


def _terms(query: str):
    lowered = query.lower().strip()
    terms = [word for word in ENGLISH.findall(lowered) if word not in STOPWORDS]
    for run in CJK_RUN.findall(lowered):
        terms.append(run)
        if len(run) == 1:
            continue
        terms.extend(run[index:index + 2] for index in range(len(run) - 1))
    return list(dict.fromkeys(term for term in terms if term))


def _score(title: str, body: str, notes: str, ocr: str, terms) -> int:
    score = 0
    for term in terms:
        score += min(title.count(term), 3) * 3
        score += min(body.count(term), 3)
        score += min(notes.count(term), 3)
        score += min(ocr.count(term), 3)
    return score


def _snippet(title: str, body: str, notes: str, ocr: str, terms) -> str:
    for source in (body, notes, ocr, title):
        if not source:
            continue
        # lower() can change a string's length (e.g. "İ"), so locate the hit
        # in the original string: slicing must use the same coordinates.
        positions = [match.start() for term in terms
                     for match in re.finditer(re.escape(term), source, re.IGNORECASE)]
        if not positions:
            continue
        position = min(positions)
        start = max(0, position - 40)
        end = min(len(source), position + 110)
        text = source[start:end]
        if start:
            text = "…" + text
        if end < len(source):
            text += "…"
        return " ".join(text.split())
    return " ".join((body or notes or title)[:120].split())


def search_all(store, query: str, limit: int = 20) -> SearchResponse:
    terms = _terms(query)
    if not terms:
        return SearchResponse(query=query, results=[])
    results = []
    for chapter_id in store.files():
        try:
            chapter = store.read(chapter_id)
        except HTTPException:
            continue
        for slide in chapter.slides:
            title = slide.title.lower()
            body = meaningful_text(slide.text).lower()
            notes = slide.notes.lower()
            ocr = (slide.ocrText or "").lower()
            score = _score(title, body, notes, ocr, terms)
            if score <= 0:
                continue
            results.append(SearchResult(
                chapterId=chapter.id,
                chapterTitle=chapter.title,
                slide=slide.number,
                slideTitle=slide.title,
                snippet=_snippet(slide.title, meaningful_text(slide.text),
                                 slide.notes.strip(), slide.ocrText or "", terms),
                score=score,
            ))
    results.sort(key=lambda item: (-item.score, item.chapterId, item.slide))
    return SearchResponse(query=query, results=results[:limit])
