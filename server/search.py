from fastapi import HTTPException

from .chapters import meaningful_text
from .models import SearchResponse, SearchResult
from .retrieval_terms import query_terms, term_count, term_matches


def _score(title: str, body: str, notes: str, ocr: str, terms) -> int:
    score = 0
    for term in terms:
        score += term_count(term, title) * 3
        score += term_count(term, body)
        score += term_count(term, notes)
        score += term_count(term, ocr)
    return score


def _snippet(title: str, body: str, notes: str, ocr: str, terms) -> str:
    for source in (body, notes, ocr, title):
        if not source:
            continue
        # lower() can change a string's length (e.g. "İ"), so locate the hit
        # in the original string: slicing must use the same coordinates.
        positions = [match.start() for term in terms
                     for match in term_matches(term, source)]
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
    terms = query_terms(query)
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
