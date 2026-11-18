import importlib.util
import json
from pathlib import Path


def test_expansion_split_and_mechanism_annotation():
    root=Path(__file__).resolve().parents[1]
    f=json.loads((root/'docs/fixtures/iteration3-bv2-expansion-v2.json').read_text('utf-8'))
    assert len({c['id'] for c in f['cases']})==24
    assert sum(c['split']=='dev' for c in f['cases'])==14
    assert sum(c['split']=='holdout' for c in f['cases'])==10
    assert f['topics']['response_capacity']['pages']['chapter-8']==[28,29,30]
    assert next(c for c in f['cases'] if c['id']=='D03')['knowledge']==['rollback_checkpoint']
    for c in f['cases']:
        assert c['annotation']['required']==c['knowledge']
        assert all(topic in f['topics'] for topic in c['knowledge'])


def test_historical_first_trial_is_not_averaged_with_fresh_samples():
    path=Path(__file__).with_name('analyze-bv2-comparison.py')
    spec=importlib.util.spec_from_file_location('bv2analysis',path)
    m=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    d={'stage_times_ms':{},'mode':'baseline','llm_calls':0,'usage':{},'model_id':None}
    trial={'metrics':{'directPrecisionLowerBoundAt8':0.125,'knowledgeCoverageAt8':0.5,'unjudgedCount':7},
           'diagnostics':d,'wallMs':1,'validationMs':0,'status':'success','diversity':{'maximumTextJaccard':0}}
    row={'scorable':True,'trials':[trial,dict(trial,wallMs=99)]}
    assert m.summarize([row])['wallMeanMs']==1
