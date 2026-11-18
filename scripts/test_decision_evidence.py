import importlib.util
from pathlib import Path


def test_sensitivity_preserves_original_and_does_not_turn_removed_page_irrelevant():
    spec = importlib.util.spec_from_file_location('review', Path(__file__).with_name('review-decision-evidence.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    fixture = {'topics': {'availability': {'pages': {'chapter-5': [6]}},
                          'response_capacity': {'pages': {'chapter-8': [20,29]}}},
               'cases': [{'id':'N14','knowledge':['response_capacity']}]}
    row = {'id':'N14','trials':[{'scoredSources':[{'key':['chapter-8',20],'grade':'direct'}]}]}
    assert module.regrade(row,fixture)['KC8'] == 1
    assert module.regrade(row,fixture,strict=True)['KC8'] == 0
    assert row['trials'][0]['scoredSources'][0]['grade'] == 'direct'
    assert fixture['topics']['response_capacity']['pages']['chapter-8'] == [20,29]


def test_map_acceptance_changes_only_requested_alternative():
    spec = importlib.util.spec_from_file_location('review', Path(__file__).with_name('review-decision-evidence.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    fixture = {'topics': {'availability': {'pages': {'chapter-5': [6]}}},
               'cases': [{'id':'N01','knowledge':['availability']}]}
    row = {'id':'N01','trials':[{'scoredSources':[{'key':['chapter-5',13],'grade':'unjudged'}]}]}
    assert module.regrade(row,fixture)['KC8'] == 0
    assert module.regrade(row,fixture,availability_pages=(13,)) == {'P8Lower':0.125,'KC8':1}
