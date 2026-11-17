import importlib.util
from pathlib import Path


def test_same_pool_pair_counts_include_regressions_exclude_unscorable():
    path=Path(__file__).with_name('analyze-coverage-experiment.py')
    spec=importlib.util.spec_from_file_location('coverage_analysis',path)
    module=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    def row(key,old,new,scorable=True):
        return dict(id=key,scorable=scorable,selections={
            'b':{'metrics':{'knowledgeCoverageAt8':old}},
            'b-coverage':{'metrics':{'knowledgeCoverageAt8':new}}})
    result=module.paired([row('gain',0,1),row('loss',1,0),row('tie',0.5,0.5),row('skip',1,0,False)])
    assert result['meanDelta']==0
    assert (result['improved'],result['degraded'],result['tied'])==(1,1,1)
    assert result['deltas']['loss']==-1
