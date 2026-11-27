"""Practice-only dispatch: baseline by default, original B explicitly selected."""
import json
import sqlite3
from time import perf_counter

import httpx
from fastapi import HTTPException

from starlette.concurrency import run_in_threadpool

from .design_source_contracts import SourceDiagnostics, SourceSelection
from .design_planner import plan_sources
from .hybrid_search import hybrid_search
from .models import DesignReviewRequest, DesignScenarioRequest, DesignTacticRequest
from .search import search_all
from .tutor import excerpt

MAX_SOURCES = 8


def legacy_sources(store, query):
    results = search_all(store, ' '.join(query.split())[:2000], MAX_SOURCES).results
    sources = []
    seen = set()
    for result in results:
        key = (result.chapterId, result.slide)
        if key in seen:
            continue
        seen.add(key)
        chapter = store.read(result.chapterId)
        slide = chapter.slides[result.slide - 1]
        sources.append({'chapterId': chapter.id, 'slide': slide.number,
                        'title': slide.title, 'source': excerpt(slide)})
    return sources


def build_query(request, stage):
    expected = {'scenarios': DesignScenarioRequest, 'tactics': DesignTacticRequest,
                'review': DesignReviewRequest}
    if stage not in expected or not isinstance(request, expected[stage]):
        raise ValueError('Request type does not match source-selection stage')
    if stage == 'scenarios':
        return ' '.join((request.title, request.scenario, request.requirements))
    if stage == 'tactics':
        return ' '.join((request.scenario, request.requirements,
                         ' '.join(item.name for item in request.qualityAttributes),
                         ' '.join(item.stimulus + ' ' + item.response for item in request.scenarios)))
    return ' '.join((request.title, request.scenario, request.requirements,
                     ' '.join(item.name for item in request.qualityAttributes),
                     ' '.join(item.name for item in request.tactics)))


def validate_selection(store, selection):
    """Reject strategy violations; never silently repair a candidate's output."""
    if not isinstance(selection, SourceSelection):
        raise ValueError('Expected SourceSelection')
    if len(selection.sources) > MAX_SOURCES:
        raise ValueError('Source budget exceeded')
    seen = set()
    for source in selection.sources:
        key = (source.chapterId, source.slide)
        if key in seen:
            raise ValueError('Duplicate source')
        seen.add(key)
        chapter = store.read(source.chapterId)
        if not 1 <= source.slide <= chapter.slideCount:
            raise ValueError('Source page outside chapter')
        slide = chapter.slides[source.slide - 1]
        if slide.number != source.slide or slide.title != source.title or excerpt(slide) != source.source:
            raise ValueError('Source content does not match course material')
    if (selection.diagnostics.status == 'empty') != (not selection.sources):
        raise ValueError('Source status does not match output')
    return selection


async def select_sources(store, request, *, stage, transport=None):
    query = build_query(request, stage)
    if request.retrievalStrategy == 'hybrid':
        start = perf_counter()
        try:
            result = await run_in_threadpool(hybrid_search, query, MAX_SOURCES)
        except (OSError, ValueError, KeyError, TypeError, sqlite3.Error,
                httpx.HTTPError, json.JSONDecodeError) as exc:
            raise HTTPException(503, {
                "code": "RAG_UNAVAILABLE",
                "message": "RAG 混合检索不可用；请检查 JINA_API_KEY、索引构建及英文查询模型配置。",
            }) from exc
        sources = []
        seen = set()
        for hit in result.results:
            key = (hit.chapterId, hit.slide)
            if key in seen:
                continue
            seen.add(key)
            chapter = store.read(hit.chapterId)
            slide = chapter.slides[hit.slide - 1]
            sources.append({"chapterId": chapter.id, "slide": slide.number,
                            "title": slide.title, "source": excerpt(slide)})
        selection = SourceSelection(sources=sources, diagnostics=SourceDiagnostics(
            stage=stage, mode="normal", status="ok" if sources else "empty",
            queries=[query], stage_times_ms={
                "hybrid_selection": (perf_counter() - start) * 1000}))
        return await run_in_threadpool(validate_selection, store, selection)
    if request.retrievalStrategy == 'llm_assisted':
        sources, info = await plan_sources(store, request, query, legacy_sources, transport)
        selection = SourceSelection(sources=sources, diagnostics=SourceDiagnostics(
            stage=stage, status='ok' if sources else 'empty', **info))
        return await run_in_threadpool(validate_selection, store, selection)
    start = perf_counter()
    sources = await run_in_threadpool(legacy_sources, store, query)
    elapsed = (perf_counter() - start) * 1000
    selection = SourceSelection(sources=sources, diagnostics=SourceDiagnostics(
        stage=stage, status='ok' if sources else 'empty', queries=[query],
        stage_times_ms={'legacy_selection': elapsed}))
    return await run_in_threadpool(validate_selection, store, selection)
