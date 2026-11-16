import asyncio
import importlib.util
import json
from pathlib import Path

import pytest

spec = importlib.util.spec_from_file_location('runner', Path(__file__).with_name('run-design-experiment.py'))
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)


def test_default_case_filter_never_selects_holdout():
    fixture = {'cases': [{'id': 'D', 'split': 'dev'}, {'id': 'H', 'split': 'holdout'}]}
    assert runner.choose_cases(fixture, 'dev') == [fixture['cases'][0]]
    with pytest.raises(ValueError):
        runner.choose_cases(fixture, 'dev', ['H'])


def test_output_directory_is_never_overwritten(tmp_path, monkeypatch):
    marker = tmp_path / 'keep.txt'
    marker.write_text('keep')
    monkeypatch.setattr('sys.argv', ['runner', '--output', str(tmp_path)])
    with pytest.raises(FileExistsError):
        asyncio.run(runner.main())
    assert marker.read_text() == 'keep'


def test_holdout_requires_explicit_opt_in(tmp_path, monkeypatch):
    target = tmp_path / 'new'
    monkeypatch.setattr('sys.argv', ['runner', '--output', str(target), '--split', 'holdout'])
    with pytest.raises(SystemExit):
        asyncio.run(runner.main())
    assert not target.exists()


@pytest.mark.parametrize('failing', [False, True])
def test_runner_records_empty_and_error_without_secret_text(tmp_path, monkeypatch, failing):
    from server import design_sources
    from server.design_source_contracts import SourceSelection, SourceDiagnostics
    async def select(*args, **kwargs):
        if failing:
            raise RuntimeError('secret-upstream-detail')
        return SourceSelection(sources=[], diagnostics=SourceDiagnostics(
            stage='scenarios', status='empty', mode='fallback', reason='fixture'))
    monkeypatch.setattr(design_sources, 'select_sources', select)
    case = {'id': 'D', 'split': 'dev', 'status': 'provisional', 'knowledge': ['topic'],
            'request': {'title': 'x', 'scenario': 'y', 'requirements': ''}}
    fixture = {'version': 1, 'k': 8, 'annotationStatus': 'test',
               'topics': {'topic': {'pages': {}}}, 'cases': [case]}
    fixture_path = tmp_path / 'cases.json'
    fixture_path.write_text(json.dumps(fixture))
    original = fixture_path.read_bytes()
    output = tmp_path / ('error' if failing else 'fallback')
    monkeypatch.setattr('sys.argv', ['runner', '--repo', str(Path(__file__).resolve().parents[1]),
        '--cases', str(fixture_path), '--output', str(output), '--repeats', '1'])
    if failing:
        with pytest.raises(SystemExit):
            asyncio.run(runner.main())
    else:
        asyncio.run(runner.main())
    report = json.loads((output / 'summary.json').read_text(encoding='utf-8'))
    assert report['counts']['error' if failing else 'empty'] == 1
    assert report['llmCalls'] is None if failing else report['llmCalls'] == 0
    assert report['summary']['macro']['knowledgeCoverageAt8'] == 0
    assert fixture_path.read_bytes() == original
    assert 'secret-upstream-detail' not in (output / 'dev.json').read_text(encoding='utf-8')
