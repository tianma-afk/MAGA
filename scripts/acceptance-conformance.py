"""Offline assertions for frozen baseline/B and real-source acceptance traces."""
import argparse
import ast
import hashlib
import json
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from server.chapters import ChapterStore
from server.design_source_contracts import SourceSelection
from server.design_sources import validate_selection, legacy_sources


def git_file(ref, path):
    return subprocess.check_output(['git', 'show', f'{ref}:{path}'], cwd=ROOT).decode('utf-8')


def functions(text):
    return {n.name: ast.dump(n, include_attributes=False) for n in ast.parse(text).body
            if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--evidence', type=Path, required=True)
    args = parser.parse_args()
    result = dict(checks=[], source_counts=[], legacy_comparisons=0)
    base = 'c6fc185'
    old = functions(git_file(base, 'server/design.py'))
    current = functions((ROOT / 'server/design.py').read_text(encoding='utf-8'))
    for name in ('_sources', '_canonical_citations', '_complete_json', '_scenario_prompt',
                 '_tactic_prompt', '_review_prompt'):
        assert old[name] == current[name], name
        result['checks'].append(f'unchanged {name}')
    old_sources = functions(git_file(base, 'server/design_sources.py'))
    new_sources = functions((ROOT / 'server/design_sources.py').read_text(encoding='utf-8'))
    for name in ('legacy_sources', 'build_query', 'validate_selection'):
        assert old_sources[name] == new_sources[name], name
        result['checks'].append(f'unchanged {name}')
    for path in ('server/search.py', 'server/retrieval_terms.py', 'server/chapters.py',
                 'server/tutor.py', 'server/quiz.py', 'server/llm.py'):
        assert git_file(base, path) == (ROOT / path).read_text(encoding='utf-8'), path
        result['checks'].append(f'unchanged {path}')
    original = git_file('4f878dcaa14a6d62a7f0506b866afe5fcd17f68d', 'server/design_planner.py')
    integrated = (ROOT / 'server/design_planner.py').read_text(encoding='utf-8')
    assert integrated.replace('request.model_dump(exclude={"retrievalStrategy"})',
                              'request.model_dump()') == original
    result['checks'].append('original B identical except excluding strategy metadata from LLM input')
    store = ChapterStore(ROOT / 'book', ROOT / 'data/slides')
    for kind in ('mock-server', 'real-server'):
        log = args.evidence / kind / 'events.jsonl'
        if not log.exists():
            continue
        rows = [json.loads(line) for line in log.read_text(encoding='utf-8').splitlines()]
        for row in rows:
            if row['kind'] != 'selection':
                continue
            selection = SourceSelection(sources=row['sources'], diagnostics=row['diagnostics'])
            validate_selection(store, selection)
            result['source_counts'].append(dict(run=kind, request_id=row['request_id'],
                                               count=len(selection.sources), mode=selection.diagnostics.mode))
            if selection.diagnostics.mode in ('baseline', 'fallback'):
                assert row['sources'] == legacy_sources(store, selection.diagnostics.queries[-1])
                result['legacy_comparisons'] += 1
    result['corpus_hashes'] = json.loads((args.evidence / 'baseline.json').read_text(encoding='utf-8'))['corpus']
    for path, digest in result['corpus_hashes'].items():
        assert hashlib.sha256((ROOT / path).read_bytes()).hexdigest() == digest
    result['checks'].append('PPT/OCR bytes unchanged since acceptance start')
    output = args.evidence / 'conformance.json'
    if output.exists():
        raise FileExistsError(output)
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(dict(checks=len(result['checks']), validated=len(result['source_counts']),
                          legacy_comparisons=result['legacy_comparisons'])))


if __name__ == '__main__':
    main()
