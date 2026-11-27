"""Compare MAGA course retrieval strategies on a labeled query set.

Level 1 (retriever-only) feeds the same hand-written English query to lexical
search and to the hybrid SQLite+Jina retriever. Level 2 follows the actual
product pipeline: raw query for baseline, LLM query planning for
llm_assisted, and raw query (translated when needed) for hybrid.

No result is fabricated: failures are recorded with an empty ranking.
"""

import argparse
import asyncio
import json
import os
import sqlite3
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from dotenv import load_dotenv

load_dotenv(ROOT / ".env")

from eval_metrics import (hit_at_k, mean, ndcg_at_k, percentile, recall_at_k,
                          reciprocal_rank)
from server.chapters import ChapterStore
from server.design_planner import plan_sources
from server.design_sources import legacy_sources
from server.hybrid_search import english_query, hybrid_search
from server.models import DesignScenarioRequest
from server.search import search_all

LEVEL_LIMITS = {"l1": 10, "l2": 8}


def load_cases(path):
    data = json.loads(path.read_text(encoding="utf-8"))
    seen = set()
    for case in data["queries"]:
        if case["id"] in seen:
            raise ValueError(f"Duplicate query id: {case['id']}")
        seen.add(case["id"])
        if case["category"] not in data["categories"]:
            raise ValueError(f"Unknown category: {case['category']}")
        if not case.get("englishQuery") or not case.get("query"):
            raise ValueError(f"Missing query text: {case['id']}")
        if not case["relevant"]:
            raise ValueError(f"No labels: {case['id']}")
        for item in case["relevant"]:
            if item["grade"] not in (1, 2):
                raise ValueError(f"Invalid grade in {case['id']}")
    return data


def check_pages(store, cases):
    for case in cases:
        for item in case["relevant"]:
            chapter = store.read(item["chapterId"])
            if not 1 <= item["slide"] <= chapter.slideCount:
                raise ValueError(f"Bad label {case['id']}: {item}")


def labels_of(case):
    return {(item["chapterId"], item["slide"]): item["grade"]
            for item in case["relevant"]}


def pages_of(results):
    return [(item.chapterId, item.slide) for item in results]


def lexical(store, query, limit):
    start = time.perf_counter()
    response = search_all(store, query, limit)
    return pages_of(response.results), (time.perf_counter() - start) * 1000


def hybrid(query, limit):
    start = time.perf_counter()
    response = hybrid_search(query, limit)
    return pages_of(response.results), (time.perf_counter() - start) * 1000


def translated_lexical(store, query, limit):
    """Ablation only: isolate hybrid's English-translation step from embeddings."""
    start = time.perf_counter()
    english = english_query(query)
    pages, _ = lexical(store, english, limit)
    return pages, (time.perf_counter() - start) * 1000, {
        "translatedQuery": english, "fallback": False,
    }


async def llm_assisted(store, query, limit):
    request = DesignScenarioRequest(title="课程检索评测", scenario=query, requirements="")
    start = time.perf_counter()
    sources, info = await plan_sources(
        store, request, query, lambda s, q: legacy_sources(s, q), None)
    pages = [(item["chapterId"], item["slide"]) for item in sources][:limit]
    return pages, (time.perf_counter() - start) * 1000, {
        "fallback": info.get("mode") != "normal",
        "reason": info.get("reason"),
        "queries": info.get("queries"),
        "llm_calls": info.get("llm_calls"),
        "usage": info.get("usage"),
    }


def score(pages, relevant, limit):
    return {
        "recall@5": recall_at_k(pages, relevant, 5),
        "recall@k": recall_at_k(pages, relevant, limit),
        "mrr": reciprocal_rank(pages, relevant),
        "ndcg@k": ndcg_at_k(pages, relevant, limit),
        "hit@5": hit_at_k(pages, relevant, 5),
    }


def failed_row(level, case, strategy, error):
    return {
        "id": case["id"], "level": level, "strategy": strategy,
        "category": case["category"], "concept": case["concept"],
        "query": case["query"], "englishQuery": case["englishQuery"],
        "ranked": [], "latencyMs": 0.0, "error": error[:200],
        "diagnostics": {"fallback": None},
        "metrics": {"recall@5": 0.0, "recall@k": 0.0, "mrr": 0.0,
                    "ndcg@k": 0.0, "hit@5": 0.0},
    }


def make_row(level, case, strategy, pages, latency, diagnostics=None):
    return {
        "id": case["id"], "level": level, "strategy": strategy,
        "category": case["category"], "concept": case["concept"],
        "query": case["query"], "englishQuery": case["englishQuery"],
        "ranked": [{"chapterId": c, "slide": s} for c, s in pages],
        "latencyMs": round(latency, 1), "error": None,
        "diagnostics": diagnostics or {}, "metrics": score(pages, labels_of(case), LEVEL_LIMITS[level]),
    }


def run_level1(store, cases, strategies):
    rows = []
    for case in cases:
        query = case["englishQuery"]
        for strategy in strategies:
            if strategy not in ("baseline", "hybrid"):
                continue
            try:
                if strategy == "baseline":
                    pages, latency = lexical(store, query, LEVEL_LIMITS["l1"])
                else:
                    pages, latency = hybrid(query, LEVEL_LIMITS["l1"])
                rows.append(make_row("l1", case, strategy, pages, latency))
            except Exception as exc:  # record, never invent a ranking
                rows.append(failed_row("l1", case, strategy, f"{type(exc).__name__}: {exc}"))
            print(f"[l1] {case['id']:<32} {strategy:<13} "
                  f"{rows[-1]['metrics']['ndcg@k']:.3f} {rows[-1]['latencyMs']:>8.0f}ms",
                  flush=True)
    return rows


async def run_level2(store, cases, strategies):
    rows = []
    for case in cases:
        for strategy in strategies:
            try:
                if strategy == "baseline":
                    pages, latency = lexical(store, case["query"], LEVEL_LIMITS["l2"])
                    rows.append(make_row("l2", case, strategy, pages, latency))
                elif strategy == "llm_assisted":
                    pages, latency, info = await llm_assisted(
                        store, case["query"], LEVEL_LIMITS["l2"])
                    rows.append(make_row("l2", case, strategy, pages, latency, info))
                elif strategy == "translated_lexical":
                    pages, latency, info = translated_lexical(
                        store, case["query"], LEVEL_LIMITS["l2"])
                    rows.append(make_row("l2", case, strategy, pages, latency, info))
                else:
                    pages, latency = hybrid(case["query"], LEVEL_LIMITS["l2"])
                    rows.append(make_row("l2", case, strategy, pages, latency))
            except Exception as exc:
                rows.append(failed_row("l2", case, strategy, f"{type(exc).__name__}: {exc}"))
            print(f"[l2] {case['id']:<32} {strategy:<13} "
                  f"{rows[-1]['metrics']['ndcg@k']:.3f} {rows[-1]['latencyMs']:>8.0f}ms",
                  flush=True)
    return rows


def aggregate(rows, level):
    groups = {}
    for row in rows:
        for key in ((row["strategy"], row["category"]), (row["strategy"], "ALL")):
            groups.setdefault(key, []).append(row)
    result = {}
    for (strategy, category), items in sorted(groups.items()):
        ok = [item for item in items if not item["error"]]
        latencies = [item["latencyMs"] for item in ok]
        result[f"{strategy}|{category}"] = {
            "strategy": strategy, "category": category, "count": len(items),
            "errors": len(items) - len(ok),
            "recall@5": mean(item["metrics"]["recall@5"] for item in items),
            "recall@k": mean(item["metrics"]["recall@k"] for item in items),
            "mrr": mean(item["metrics"]["mrr"] for item in items),
            "ndcg@k": mean(item["metrics"]["ndcg@k"] for item in items),
            "hit@5": mean(item["metrics"]["hit@5"] for item in items),
            "ndcg@k_successOnly": mean(item["metrics"]["ndcg@k"] for item in ok),
            "fallbacks": sum(bool(item["diagnostics"].get("fallback")) for item in items),
            "p50ms": percentile(latencies, 0.5),
            "p95ms": percentile(latencies, 0.95),
            "k": LEVEL_LIMITS[level],
        }
    return result


def index_summary():
    path = ROOT / "data" / "retrieval" / "index.sqlite3"
    if not path.is_file():
        return {"path": str(path), "pages": 0, "model": None}
    with sqlite3.connect(path) as conn:
        count = conn.execute("SELECT COUNT(*) FROM slides").fetchone()[0]
        model = conn.execute("SELECT model FROM slides LIMIT 1").fetchone()
    return {"path": str(path.relative_to(ROOT)), "pages": count,
            "model": model[0] if model else None}


def build_report(rows, fixture_path, levels, fixture):
    return {
        "meta": {
            "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
            "fixture": str(fixture_path), "queries": len(fixture_queries(fixture)),
            "llmModel": os.getenv("LLM_MODEL"),
            "llmBaseHost": (os.getenv("LLM_BASE_URL") or "").split("/")[2]
            if "//" in (os.getenv("LLM_BASE_URL") or "") else None,
            "jinaConfigured": bool(os.getenv("JINA_API_KEY", "").strip()),
            "index": index_summary(), "levels": levels,
            "limits": {level: LEVEL_LIMITS[level] for level in levels},
            "notes": [
                "Level 1 isolates retrieval: same hand-written English query for baseline and hybrid.",
                "Level 1 does not include llm_assisted because it is a query planner, not a retriever.",
                "Level 2 follows product behavior: raw query for baseline, planner+lexical for llm_assisted, raw query for hybrid (CJK translated by the LLM).",
                "translated_lexical is an ablation, not a product mode: it applies hybrid's English-translation step and then uses lexical search, isolating translation from embeddings.",
                "Errors are zero-filled, not dropped; fallback counts are reported separately.",
                "Unlabeled pages count as grade 0 (concept-scoped judgments).",
            ],
        },
        "rows": rows,
        "aggregates": {level: aggregate([r for r in rows if r["level"] == level], level)
                       for level in levels},
    }


def fixture_queries(fixture):
    return fixture["queries"]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cases", type=Path,
                        default=ROOT / "docs/fixtures/retrieval-benchmark-v1.json")
    parser.add_argument("--output", type=Path,
                        default=ROOT / "data/evaluation/retrieval-run.json")
    parser.add_argument("--levels", default="l1,l2")
    parser.add_argument("--strategies", default="baseline,llm_assisted,hybrid")
    parser.add_argument("--max-queries", type=int, default=0)
    parser.add_argument("--replay", type=Path)
    args = parser.parse_args()

    fixture = load_cases(args.cases)
    levels = [item.strip() for item in args.levels.split(",") if item.strip()]
    strategies = [item.strip() for item in args.strategies.split(",") if item.strip()]
    for level in levels:
        if level not in LEVEL_LIMITS:
            raise SystemExit(f"Unknown level: {level}")

    if args.replay:
        saved = json.loads(args.replay.read_text(encoding="utf-8"))
        rows = saved["rows"]
        report = build_report(rows, args.cases, levels, fixture)
        report["meta"]["replayedFrom"] = str(args.replay)
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(report, ensure_ascii=False, indent=1),
                               encoding="utf-8")
        print(json.dumps({"replay": str(args.replay), "rows": len(rows)}))
        return

    store = ChapterStore(ROOT / "book", ROOT / "data" / "slides")
    cases = fixture["queries"][:args.max_queries or None]
    check_pages(store, cases)
    rows = []
    if "l1" in levels:
        rows.extend(run_level1(store, cases, strategies))
    if "l2" in levels:
        rows.extend(asyncio.run(run_level2(store, cases, strategies)))
    report = build_report(rows, args.cases, levels, fixture)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=1),
                           encoding="utf-8")
    summary = {key: {metric: round(value, 3) for metric, value in item.items()
                     if metric in ("count", "errors", "ndcg@k", "recall@5",
                                   "recall@k", "p50ms", "p95ms", "fallbacks")}
               for key, item in report["aggregates"].get("l2", {}).items()
               if item["category"] == "ALL"}
    print(json.dumps({"rows": len(rows), "l2": summary}, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
