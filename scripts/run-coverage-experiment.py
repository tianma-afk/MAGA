"""Same-pool replay, then six bounded fresh planning calls; no candidate edits."""
import argparse
import hashlib
import importlib.util
import json
import os
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

COVERAGE = 'b07392bbfa49fbdaea3935bd6099a5e0d4c78894'


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load(path, name):
    spec = importlib.util.spec_from_file_location(name,path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def groups(root):
    data=root/'data/verification'
    old=data/'p3t3-comparison-20261116-v1'
    expanded=data/'p3t4-bv2-comparison-20261117-v1'
    return [
        ('old-dev',root/'docs/fixtures/iteration3-design-needs-v4.json',old/'dev/b'),
        ('old-holdout',root/'docs/fixtures/iteration3-design-needs-v4.json',old/'holdout/b'),
        ('supplement',root/'docs/fixtures/iteration3-decision-supplement.json',data/'p3t4-supplement-20261117-v1/b'),
        ('observed-new-dev',root/'docs/fixtures/iteration3-bv2-expansion-v2.json',expanded/'new-dev/b'),
        ('observed-new-test',root/'docs/fixtures/iteration3-bv2-expansion-v2.json',expanded/'new-test/b')]


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output',type=Path,required=True)
    parser.add_argument('--offline-only',action='store_true')
    args=parser.parse_args()
    root=Path(__file__).resolve().parents[1]
    repo=root.parent/'MAGA-exp-b-coverage'
    output=args.output.resolve()
    output.mkdir(parents=True,exist_ok=False)
    if subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip()!=COVERAGE:
        raise ValueError('Candidate version mismatch')
    if subprocess.check_output(['git','status','--short'],cwd=repo,text=True):
        raise ValueError('Dirty candidate')
    sys.path.insert(0,str(repo))
    from server.chapters import ChapterStore
    from server.design_sources import legacy_sources, validate_selection
    from server.design_source_contracts import SourceSelection, SourceDiagnostics
    from server.design_planner import merge_sources, CONCEPTS, PROMPT_VERSION, PROMPT_HASH
    from server.design_coverage import select_coverage
    runner=load(root/'scripts/run-design-experiment.py','shared_runner')
    scoring=runner.load_scoring(root)
    original=ChapterStore(repo/'book',repo/'data/slides')
    chapters={cid:original.read(cid) for cid in original.files()}

    class FrozenStore:
        # Evaluation only: immutable course snapshot, no retrieval ranking changes.
        def files(self): return original.files()
        def read(self,cid): return chapters[cid]

    store=FrozenStore()
    protocol=root/'docs/iteration3_jack/phase3-b-coverage-protocol.md'
    resources=sorted((repo/'book').glob('*.pptx'))+sorted((repo/'data/ocr').rglob('*.txt'))
    corpus={p.relative_to(repo).as_posix():sha(p) for p in resources}
    files=[Path(__file__),protocol,root/'scripts/compare-design-worker.py',
           root/'scripts/evaluate-design-needs.py',root/'scripts/run-design-experiment.py']
    manifest=dict(createdUTC=datetime.now(timezone.utc).isoformat(),head=COVERAGE,
                  originalB='4f878dcaa14a6d62a7f0506b866afe5fcd17f68d',promptVersion=PROMPT_VERSION,
                  promptHash=PROMPT_HASH,corpusSHA256=corpus,
                  assetsSHA256={p.relative_to(root).as_posix():sha(p) for p in files},groups=[],complete=False)
    fixtures={}
    originals={}

    def evaluate(case,fixture,pools,info,historical=None):
        start=time.perf_counter()
        rotated=merge_sources(pools)
        rotate_ms=(time.perf_counter()-start)*1000
        if info['mode']=='normal':
            covered,details=select_coverage(pools,info['plan']['intents'],CONCEPTS)
        else:
            covered,details=rotated,{'version':'fallback-original','selection_ms':0,'candidate_count':len(rotated)}
        union={}
        for pool in pools:
            for s in pool: union.setdefault((s['chapterId'],s['slide']),s)
        selections={'baseline':pools[-1] if pools else [],'b':rotated,'b-coverage':covered}
        grades={}
        for name,sources in selections.items():
            validate_selection(store,SourceSelection(sources=sources,diagnostics=SourceDiagnostics(
                stage='scenarios',status='ok' if sources else 'empty')))
            rows,metrics=runner.score_sources(sources,case,fixture,store,scoring)
            grades[name]=dict(sources=sources,scoredSources=rows,metrics=metrics)
        oracle=runner.score_sources(list(union.values()),case,fixture,store,scoring)[1]['knowledgeCoverageAt8']
        return dict(id=case['id'],request=case['request'],scorable=case['status']!='unscorable',
                    knowledge=case['knowledge'],mode=info['mode'],reason=info['reason'],plan=info.get('plan'),
                    queries=info['queries'],pools=pools,selections=grades,selectionDetails=details,
                    roundRobinMs=rotate_ms,candidateKnowledgeUpperBound=oracle,
                    historicalRoundRobinEquality=rotated==historical if historical is not None else None)

    for label,fixture_path,history_dir in groups(root):
        fixture=json.loads(fixture_path.read_text('utf-8'))
        history=json.loads((history_dir/'manifest.json').read_text('utf-8'))
        if history['corpusSHA256']!=corpus or history['fixtureSHA256']!=sha(fixture_path):
            raise ValueError('Historical inputs differ')
        saved=[json.loads(l) for l in (history_dir/'rows.jsonl').read_text('utf-8').splitlines()]
        manifest['groups'].append(dict(label=label,fixtureSHA256=sha(fixture_path),history=str(history_dir)))
        for old in saved:
            case=next(c for c in fixture['cases'] if c['id']==old['id'])
            fixtures[case['id']]=fixture
            originals[case['id']]=case
            trial=old['trials'][0]
            info=trial['diagnostics']
            pools=[legacy_sources(store,q) for q in info['queries']]
            row=evaluate(case,fixture,pools,info,trial['sources'])
            if not row['historicalRoundRobinEquality']:
                raise ValueError('Historical B output failed exact reproduction')
            row.update(group=label,experimentType='offline-fixed-pool',realCalls=0)
            with (output/'fixed.jsonl').open('a',encoding='utf-8') as stream:
                stream.write(json.dumps(row,ensure_ascii=False)+'\n')
        print('replayed '+label,flush=True)
    smoke=json.loads((root/'docs/fixtures/iteration3-bv2-expansion-v2.json').read_text('utf-8'))
    smoke.update(version='coverage-online-v1',annotationStatus='六条已观察需求；非独立验证',judgments={})
    smoke['cases']=[]
    for key in ('N13','S01','S02','D06','T03','T06'):
        case=dict(originals[key])
        case['historicalSplit']=case['split']
        case['split']='dev'
        smoke['cases'].append(case)
    smoke_path=output/'online-fixture.json'
    smoke_path.write_text(json.dumps(smoke,ensure_ascii=False,indent=2),'utf-8')
    manifest['onlineFixtureSHA256']=sha(smoke_path)
    (output/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),'utf-8')
    if args.offline_only:
        manifest.update(offlineComplete=True,onlineStatus='not_attempted',
                        finishedUTC=datetime.now(timezone.utc).isoformat())
        (output/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),'utf-8')
        return
    command=[sys.executable,str(root/'scripts/compare-design-worker.py'),'--repo',str(repo),
             '--expected-head',COVERAGE,'--variant','b','--fixture',str(smoke_path),'--protocol',str(protocol),
             '--output',str(output/'online'),'--split','dev','--repeats','1',
             '--ledger',str(output/'real-attempts.jsonl'),'--budget','6']
    env=os.environ.copy()
    env.pop('PYTHON_DOTENV_DISABLED',None)
    env['PYTHONIOENCODING']='utf-8'
    manifest['onlineCommand']=command
    print('online: six attempts maximum',flush=True)
    result=subprocess.run(command,cwd=root,env=env,capture_output=True,text=True,encoding='utf-8',timeout=600)
    (output/'online.log').write_text(result.stdout,'utf-8')
    if result.returncode: raise RuntimeError('Online worker failed; no retry')
    for line in (output/'online/rows.jsonl').read_text('utf-8').splitlines():
        live=json.loads(line)
        case=next(c for c in smoke['cases'] if c['id']==live['id'])
        trial=live['trials'][0]
        info=trial['diagnostics']
        if not info: raise ValueError('Missing online diagnostic')
        pools=[legacy_sources(store,q) for q in info['queries']]
        row=evaluate(case,smoke,pools,info)
        if row['selections']['b-coverage']['sources']!=trial['sources']:
            raise ValueError('Fresh same-pool coverage reproduction failed')
        row.update(experimentType='fresh-plan-fixed-pool',liveTrial=trial)
        with (output/'online-comparison.jsonl').open('a',encoding='utf-8') as stream:
            stream.write(json.dumps(row,ensure_ascii=False)+'\n')
    manifest.update(complete=True,finishedUTC=datetime.now(timezone.utc).isoformat())
    (output/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),'utf-8')


if __name__=='__main__': main()
