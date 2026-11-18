"""Serial frozen four-version comparison; never edits candidate worktrees."""
import argparse
import hashlib
import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

VERSIONS = {'baseline': 'c6fc1857928468030e6a030b13a146300bf93304',
            'a': 'ef7d2993ce31c02751df576ba9cc9b5307a3f1ad',
            'b': '4f878dcaa14a6d62a7f0506b866afe5fcd17f68d',
            'c': 'a467ab17cbf0f13e347b348008bb3ed3385dcf0a'}


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    main_repo = Path(__file__).resolve().parents[1]
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=False)
    fixture = main_repo / 'docs/fixtures/iteration3-design-needs-v4.json'
    protocol = main_repo / 'docs/iteration3_jack/phase3-evaluation-protocol.md'
    worker = main_repo / 'scripts/compare-design-worker.py'
    tools = [Path(__file__), worker, main_repo / 'scripts/run-design-experiment.py',
             main_repo / 'scripts/evaluate-design-needs.py']
    frozen = {str(p.relative_to(main_repo)): sha(p) for p in tools + [fixture, protocol]}
    repositories, inventories = {}, {}
    for variant, commit in VERSIONS.items():
        repo = main_repo.parent / ('MAGA-exp-' + variant)
        head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=repo, text=True).strip()
        dirty = subprocess.check_output(['git', 'status', '--short'], cwd=repo, text=True)
        if head != commit or dirty:
            raise ValueError('Candidate version/clean state mismatch: ' + variant)
        subprocess.run(['git', 'merge-base', '--is-ancestor', VERSIONS['baseline'], head], cwd=repo, check=True)
        paths = sorted((repo / 'book').glob('*.pptx')) + sorted((repo / 'data/ocr').rglob('*.txt'))
        inventories[variant] = {p.relative_to(repo).as_posix(): sha(p) for p in paths}
        repositories[variant] = repo
    if len(inventories['baseline']) != 89 or any(i != inventories['baseline'] for i in inventories.values()):
        raise ValueError('Corpus mismatch')
    manifest = {'startedUTC': datetime.now(timezone.utc).isoformat(), 'versions': VERSIONS,
                'frozenSHA256': frozen, 'corpusSHA256': inventories['baseline'],
                'command': sys.argv, 'realCallBudget': 30, 'plannedRealCalls': 17,
                'sequence': [], 'completed': False}
    (output / 'freeze.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), 'utf-8')
    env = os.environ.copy()
    env['PYTHONIOENCODING'] = 'utf-8'
    # load_dotenv is explicit inside B worker only; all other workers clear AI vars.
    env.pop('PYTHON_DOTENV_DISABLED', None)
    phases = [('precheck', 'dev', ['baseline', 'a', 'b', 'c']),
              ('dev', 'dev', ['baseline', 'a', 'b', 'c']),
              ('holdout', 'holdout', ['c', 'b', 'a', 'baseline'])]
    for phase, split, variants in phases:
        for variant in variants:
            if any(sha(main_repo / path) != digest for path, digest in frozen.items()):
                raise ValueError('Frozen evaluation assets changed during execution')
            command = [sys.executable, str(worker), '--repo', str(repositories[variant]),
                       '--expected-head', VERSIONS[variant], '--variant', variant,
                       '--fixture', str(fixture), '--protocol', str(protocol),
                       '--split', split, '--repeats', '1' if variant == 'b' or phase == 'precheck' else '2',
                       '--ledger', str(output / 'real-attempts.jsonl'),
                       '--output', str(output / phase / variant)]
            if phase == 'precheck':
                command += ['--case-id', 'N10']
            manifest['sequence'].append({'phase': phase, 'variant': variant, 'command': command})
            (output / 'freeze.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), 'utf-8')
            print(phase + '/' + variant, flush=True)
            completed = subprocess.run(command, cwd=repositories[variant], env=env,
                                       capture_output=True, text=True, encoding='utf-8', timeout=900)
            (output / (phase + '-' + variant + '.log')).write_text(completed.stdout, 'utf-8')
            # Unknown exception text can contain credentials; preserve only safe status.
            if completed.returncode:
                (output / (phase + '-' + variant + '-failure.json')).write_text(
                    json.dumps({'exitCode': completed.returncode, 'stderrSaved': False}), 'utf-8')
                raise RuntimeError('Worker failed: ' + phase + '/' + variant)
            rows = [json.loads(line) for line in (output / phase / variant / 'rows.jsonl').read_text('utf-8').splitlines()]
            if phase == 'precheck' and any(t['status'] == 'error' for r in rows for t in r['trials']):
                raise RuntimeError('Measurement precheck failed; no automatic retry')
            print('finished ' + phase + '/' + variant, flush=True)
    manifest['completed'] = True
    manifest['finishedUTC'] = datetime.now(timezone.utc).isoformat()
    (output / 'freeze.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), 'utf-8')


if __name__ == '__main__':
    main()
