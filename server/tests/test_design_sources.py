import asyncio
import subprocess
import types
from pathlib import Path

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from test_api import setup
from server.chapters import ChapterStore
from server.design_source_contracts import SourceSelection
from server.design_sources import build_query, select_sources, validate_selection
from server.models import DesignScenarioRequest, DesignTacticRequest, DesignReviewRequest


@pytest.fixture
def original():
    code = subprocess.check_output(['git', 'show', '2c4c834:server/design.py'])
    module = types.ModuleType('server.original_design')
    exec(compile(code, 'material:server/design.py', 'exec'), module.__dict__)
    return module._sources


@pytest.mark.parametrize('stage,model', [('scenarios', DesignScenarioRequest),
    ('tactics', DesignTacticRequest), ('review', DesignReviewRequest)])
@pytest.mark.parametrize('text', ['availability heartbeat', 'zzzzzzzzzzzz'])
def test_material_equivalence_all_stages(setup, original, stage, model, text):
    _, _, root = setup
    store = ChapterStore(root / 'book', root / 'slides')
    payload = {'scenario': text, 'requirements': '  latency  '}
    if stage != 'tactics':
        payload['title'] = 'sample'
    request = model.model_validate(payload)
    before = request.model_dump()
    selected = asyncio.run(select_sources(store, request, stage=stage,
                                         transport=object()))
    assert [s.model_dump() for s in selected.sources] == original(store, build_query(request, stage))
    assert request.model_dump() == before
    assert len(selected.sources) <= 8
    assert selected.diagnostics.llm_calls == 0


def test_stage_mismatch_and_query_fields():
    request = DesignScenarioRequest(title='x', scenario='y')
    with pytest.raises(ValueError):
        build_query(request, 'tactics')
    assert build_query(DesignTacticRequest(scenario='x'), 'tactics') == 'x   '


def test_validation_rejects_duplicate_forged_and_budget(setup):
    _, _, root = setup
    store = ChapterStore(root / 'book', root / 'slides')
    selection = asyncio.run(select_sources(store, DesignScenarioRequest(
        title='availability', scenario='heartbeat'), stage='scenarios'))
    dumped = selection.model_dump()
    source = dumped['sources'][0]
    for field, value in [('title', 'forged'), ('source', 'invented'), ('slide', 999)]:
        bad = selection.model_copy(deep=True)
        setattr(bad.sources[0], field, value)
        with pytest.raises(ValueError):
            validate_selection(store, bad)
    duplicated = selection.model_copy(deep=True)
    duplicated.sources = [selection.sources[0], selection.sources[0]]
    with pytest.raises(ValueError):
        validate_selection(store, duplicated)
    dumped['sources'] = [source] * 9
    with pytest.raises(ValidationError):
        SourceSelection.model_validate(dumped)


def test_store_exception_is_not_disguised_as_fallback(monkeypatch):
    from server import design_sources
    def fail(*args):
        raise HTTPException(500, 'fixture failure')
    monkeypatch.setattr(design_sources, 'legacy_sources', fail)
    with pytest.raises(HTTPException) as error:
        asyncio.run(select_sources(None, DesignScenarioRequest(title='x', scenario='y'), stage='scenarios'))
    assert error.value.status_code == 500


def test_empty_results_match_material(setup, original):
    _, _, root = setup
    store = ChapterStore(root / 'book', root / 'slides')
    request = DesignScenarioRequest(title='zzzzqqq', scenario='zzzzqqq')
    result = asyncio.run(select_sources(store, request, stage='scenarios'))
    assert original(store, build_query(request, 'scenarios')) == []
    assert result.sources == []
    assert result.diagnostics.status == 'empty'


def test_cancellation_is_not_converted_to_fallback(monkeypatch):
    from server import design_sources
    async def cancel(*args):
        raise asyncio.CancelledError()
    monkeypatch.setattr(design_sources, 'run_in_threadpool', cancel)
    with pytest.raises(asyncio.CancelledError):
        asyncio.run(select_sources(None, DesignScenarioRequest(title='x', scenario='y'), stage='scenarios'))


@pytest.mark.parametrize('stage,model', [('scenarios', DesignScenarioRequest),
    ('tactics', DesignTacticRequest), ('review', DesignReviewRequest)])
def test_hybrid_explicitly_selects_indexed_sources_in_each_stage(setup, monkeypatch, stage, model):
    from server import design_sources
    from server.search import search_all
    _, _, root = setup
    store = ChapterStore(root / 'book', root / 'slides')
    observed = []
    def retrieval(query, limit):
        observed.append((query, limit))
        return search_all(store, 'availability', limit)
    monkeypatch.setattr(design_sources, 'hybrid_search', retrieval)
    payload = {'scenario': 'heartbeat'}
    if stage != 'tactics':
        payload['title'] = 'availability'
    selected = asyncio.run(select_sources(
        store, model.model_validate({**payload, 'retrievalStrategy': 'hybrid'}), stage=stage))
    assert observed and observed[0][1] == 8
    assert selected.sources
    assert selected.sources[0].chapterId == 'chapter-2'
    assert selected.diagnostics.mode == 'normal'
    assert 'hybrid_selection' in selected.diagnostics.stage_times_ms


def test_hybrid_failure_is_reported_not_silently_downgraded(monkeypatch):
    from server import design_sources
    monkeypatch.setattr(design_sources, 'hybrid_search',
                        lambda *args: (_ for _ in ()).throw(ValueError('missing index')))
    request = DesignScenarioRequest(title='x', scenario='y', retrievalStrategy='hybrid')
    with pytest.raises(HTTPException) as captured:
        asyncio.run(select_sources(None, request, stage='scenarios'))
    assert captured.value.status_code == 503
    assert captured.value.detail['code'] == 'RAG_UNAVAILABLE'
    assert 'missing index' not in str(captured.value.detail)
