"""Metric checks independent of current retrieval rankings."""
import importlib.util
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    'design_eval', Path(__file__).with_name('evaluate-design-needs.py'))
evaluation = importlib.util.module_from_spec(spec)
spec.loader.exec_module(evaluation)


def row(key, grade):
    return {'key': key, 'grade': grade, 'traceable': True}


def test_missing_slots_and_unknowns_are_not_relevant_or_irrelevant():
    result = evaluation.metrics([row(['a', 1], 'direct'), row(['b', 1], 'unjudged')],
                                [{('a', 1)}, {('a', 2)}], 8)
    assert result['directPrecisionLowerBoundAt8'] == 1 / 8
    assert result['knowledgeCoverageAt8'] == 1 / 2
    assert result['unjudgedCount'] == 1
    assert result['confirmedIrrelevantCount'] == 0


def test_alternatives_do_not_duplicate_coverage_and_unusable_cannot_cover():
    result = evaluation.metrics([row(['a', 1], 'direct'), row(['a', 2], 'direct'),
                                 row(['b', 1], 'unusable')],
                                [{('a', 1), ('a', 2)}, {('b', 1)}], 8)
    assert result['knowledgeCoverageAt8'] == 1 / 2
    assert result['unusableCount'] == 1


def test_no_output_does_not_claim_perfect_traceability():
    result = evaluation.metrics([], [{('a', 1)}], 8)
    assert result['traceability'] is None
    assert result['knowledgeCoverageAt8'] == 0
    result.update(warmMedianMs=1, contextCharacters=2)
    aggregate = evaluation.aggregate([{'scorable': True, 'metrics': result}])
    assert aggregate['macro']['traceability'] is None
    assert evaluation.aggregate([{'scorable': False, 'metrics': result}])['macro'] == {}
