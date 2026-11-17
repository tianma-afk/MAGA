"""Frozen three-version comparison, with a single shared 80-call ledger."""
import argparse
import hashlib
import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

VERSIONS = {'baseline':'c6fc1857928468030e6a030b13a146300bf93304',
            'b':'4f878dcaa14a6d62a7f0506b866afe5fcd17f68d',
            'b-v2':'cf5ba925662183daa8bf643dabade9ac2ce9c359'}


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output',type=Path,required=True)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    out = args.output.resolve()
    out.mkdir(parents=True,exist_ok=False)
    worker = root/'scripts/bv2-comparison-worker.py'
    protocol = root/'docs/iteration3_jack/phase3-b-v2-protocol.md'
    new = root/'docs/fixtures/iteration3-bv2-expansion-v2.json'
    old = root/'docs/fixtures/iteration3-design-needs-v4.json'
    supp = root/'docs/fixtures/iteration3-decision-supplement.json'
    assets = [Path(__file__),worker,protocol,new,old,supp,root/'scripts/run-design-experiment.py',
              root/'scripts/evaluate-design-needs.py']
    frozen = {p.relative_to(root).as_posix():sha(p) for p in assets}
    inventories = {}
    for v, head in VERSIONS.items():
        repo = root.parent/('MAGA-exp-'+v)
        if subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip()!=head:
            raise ValueError('Version mismatch')
        if subprocess.check_output(['git','status','--short'],cwd=repo,text=True):
            raise ValueError('Dirty candidate')
        paths = sorted((repo/'book').glob('*.pptx'))+sorted((repo/'data/ocr').rglob('*.txt'))
        inventories[v] = {p.relative_to(repo).as_posix():sha(p) for p in paths}
    if len(inventories['baseline'])!=89 or any(x!=inventories['baseline'] for x in inventories.values()):
        raise ValueError('Corpus differs')
    manifest = dict(createdUTC=datetime.now(timezone.utc).isoformat(),versions=VERSIONS,
                    frozenSHA256=frozen,corpusSHA256=inventories['baseline'],plannedCalls=70,
                    budget=80,commands=[],complete=False)
    env = os.environ.copy()
    env['PYTHONIOENCODING']='utf-8'
    env.pop('PYTHON_DOTENV_DISABLED',None)
    phases = [('new-dev',new,'dev',['baseline','b','b-v2']),
              ('history-dev',old,'dev',['b-v2']),('history-holdout',old,'holdout',['b-v2']),
              ('history-s',supp,'dev',['b-v2']),('new-test',new,'holdout',['b-v2','b','baseline'])]
    for phase,fixture,split,variants in phases:
        for v in variants:
            if any(sha(root/p)!=h for p,h in frozen.items()):
                raise ValueError('Frozen assets changed')
            command = [sys.executable,str(worker),'--repo',str(root.parent/('MAGA-exp-'+v)),
                       '--expected-head',VERSIONS[v],'--variant','baseline' if v=='baseline' else 'b',
                       '--fixture',str(fixture),'--protocol',str(protocol),'--output',str(out/phase/v),
                       '--split',split,'--repeats','1','--ledger',str(out/'real-attempts.jsonl'),'--budget','80']
            manifest['commands'].append(command)
            (out/'freeze.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),'utf-8')
            print(phase+'/'+v,flush=True)
            result = subprocess.run(command,cwd=root,env=env,capture_output=True,text=True,encoding='utf-8',timeout=1500)
            (out/(phase+'-'+v+'.log')).write_text(result.stdout,'utf-8')
            if result.returncode:
                raise RuntimeError('Worker failure, no retry: '+phase+'/'+v)
            rows = [json.loads(l) for l in (out/phase/v/'rows.jsonl').read_text('utf-8').splitlines()]
            if any(t['diagnostics'] and t['diagnostics']['usage'].get('completion_tokens',0)>1024
                   for r in rows for t in r['trials']):
                raise RuntimeError('Unexpected token usage; stopped')
            print('finished '+phase+'/'+v,flush=True)
    manifest.update(complete=True,finishedUTC=datetime.now(timezone.utc).isoformat())
    (out/'freeze.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),'utf-8')


if __name__ == '__main__':
    main()
