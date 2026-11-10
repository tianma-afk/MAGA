"""Evaluate local PPT retrieval without starting a server or calling an LLM."""

import argparse
import importlib.util
import json
import subprocess
import sys
import tempfile
from pathlib import Path


def baseline_search(repo, ref):
    result = subprocess.run(
        ["git", "-C", str(repo), "show", f"{ref}:server/search.py"],
        check=True, capture_output=True, encoding="utf-8",
    )
    with tempfile.TemporaryDirectory(prefix="maga-search-baseline-") as directory:
        source = Path(directory) / "search_baseline.py"
        source.write_text(result.stdout, encoding="utf-8")
        spec = importlib.util.spec_from_file_location("server.search_baseline", source)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
    return module.search_all


def measure(search, store, cases):
    rows = []
    for case in cases:
        sources = case["expectedSources"]
        expected = {(item["chapterId"], item["slide"]) for item in sources}
        for chapter_id, slide in expected:
            chapter = store.read(chapter_id)
            if not 1 <= slide <= chapter.slideCount:
                raise ValueError(f"Invalid expected page: {chapter_id}:{slide}")
        for query in case["queries"]:
            results = search(store, query, 5).results
            rows.append({
                "query": query,
                "expectedSources": sources,
                "hit": any((item.chapterId, item.slide) in expected for item in results),
                "top5": [{"chapterId": item.chapterId, "slide": item.slide,
                          "title": item.slideTitle, "score": item.score} for item in results],
            })
    return {"hits": sum(row["hit"] for row in rows), "total": len(rows), "rows": rows}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, required=True)
    parser.add_argument("--cases", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--baseline-ref", default="44a1e3f")
    args = parser.parse_args()
    sys.path.insert(0, str(args.repo.resolve()))
    from server.chapters import ChapterStore
    from server.search import search_all

    fixture = json.loads(args.cases.read_text(encoding="utf-8"))
    store = ChapterStore(args.repo / "book", args.repo / "data" / "slides")
    before = measure(baseline_search(args.repo, args.baseline_ref), store, fixture["cases"])
    after = measure(search_all, store, fixture["cases"])
    report = {
        "metric": "Top-5 contains at least one expected (chapterId, slide)",
        "cases": str(args.cases), "baselineRef": args.baseline_ref,
        "before": before, "after": after,
        "limitations": "Small fixed course fixture, not general retrieval or AI quality accuracy.",
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"before": {"hits": before["hits"], "total": before["total"]},
                      "after": {"hits": after["hits"], "total": after["total"]}},
                     ensure_ascii=False))


if __name__ == "__main__":
    main()
