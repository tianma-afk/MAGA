import importlib.util
import json
from pathlib import Path

import pytest


def load_worker():
    path = Path(__file__).with_name('compare-design-worker.py')
    spec = importlib.util.spec_from_file_location('comparison_worker', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_persistent_budget_counts_failures_and_blocks_before_request(tmp_path):
    worker = load_worker()
    ledger = tmp_path / 'attempts.jsonl'
    worker.reserve_attempt(ledger, 2, 'first')
    worker.reserve_attempt(ledger, 2, 'failed')
    with pytest.raises(RuntimeError):
        worker.reserve_attempt(ledger, 2, 'must-not-send')
    assert len(ledger.read_text().splitlines()) == 2


def test_diversity_empty_duplicate_and_complement():
    worker = load_worker()
    assert worker.diversity([])['uniqueRatio'] is None
    source = {'chapterId': 'c', 'slide': 1, 'source': 'alpha beta'}
    result = worker.diversity([source, source.copy()])
    assert result['uniqueRatio'] == 0.5
    assert result['maximumTextJaccard'] == 1
    other = {'chapterId': 'd', 'slide': 1, 'source': 'gamma delta'}
    assert worker.diversity([source, other])['maximumTextJaccard'] == 0


def test_v4_changes_only_prespecified_holdout_knowledge():
    root = Path(__file__).resolve().parents[1]
    fixture_dir = root / 'docs/fixtures'
    old = json.loads((fixture_dir / 'iteration3-design-needs-v3.json').read_text('utf-8'))
    new = json.loads((fixture_dir / 'iteration3-design-needs-v4.json').read_text('utf-8'))
    assert old['judgments'] == new['judgments']
    assert old['k'] == new['k'] == 8
    assert len(new['cases']) == 16
    for before, after in zip(old['cases'], new['cases']):
        assert before['id'] == after['id']
        assert before['split'] == after['split']
        assert before['request'] == after['request']
        if before['split'] == 'dev':
            assert before == after
    assert all(new['topics'][name] == value for name, value in old['topics'].items())


def test_partial_labels_remain_lower_bound():
    worker = load_worker()
    scoring = worker.load(Path(__file__).with_name('evaluate-design-needs.py'), 'original_scoring')
    rows = [{'key': ['c', 1], 'grade': 'direct', 'traceable': True},
            {'key': ['c', 2], 'grade': 'unjudged', 'traceable': True}]
    values = scoring.metrics(rows, [{('c', 1)}], 8)
    assert values['directPrecisionLowerBoundAt8'] == 0.125
    assert values['knowledgeCoverageAt8'] == 1
    assert values['unjudgedCount'] == 1
    assert values['confirmedIrrelevantCount'] == 0


def test_paired_excludes_unscorable_and_rejects_mismatched_queries():
    worker = load_worker()
    module = worker.load(Path(__file__).with_name('analyze-design-comparison.py'), 'comparison_analysis')
    def row(key, value, scored=True):
        return {'id': key, 'scorable': scored, 'trials': [{'metrics': {'m': value}}]}
    left = [row('a', 0.5), row('b', 0), row('c', 0.1), row('x', 100, False)]
    right = [row('a', 0.25), row('b', 0.25), row('c', 0.1), row('x', 0, False)]
    result = module.paired(left, right, 'm')
    assert result['meanDelta'] == 0
    assert (result['improved'], result['degraded'], result['tied']) == (1, 1, 1)
    assert result['maximumIDs'] == ['a'] and result['minimumIDs'] == ['b']
    with pytest.raises(ValueError):
        module.paired(left, right[:-2], 'm')
