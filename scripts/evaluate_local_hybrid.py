"""Substitute hybrid evaluation with a local ONNX embedding model.

The shipped hybrid path calls the Jina API. When that host is unreachable,
this script runs the SAME fusion formula with a local FastEmbed model. It is
explicitly a substitute: results do not validate the Jina API path, only the
hybrid architecture and the chosen model on this machine.
"""

import argparse
import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from dotenv import load_dotenv

load_dotenv(ROOT / ".env")

from fastembed import TextEmbedding

import server.hybrid_search as hs
import server.retrieval_index as ri
from eval_metrics import hit_at_k, mean, ndcg_at_k, percentile, recall_at_k, reciprocal_rank
from server.chapters import ChapterStore

LEVEL_LIMITS = {"l1": 10, "l2": 8}
CATEGORY_ORDER = ["english_term", "chinese_nl", "mixed", "constraint", "ALL"]


def make_embedder(model_name, cache_dir):
    model = TextEmbedding(model_name=model_name, cache_dir=str(cache_dir))
    has_query = hasattr(model, "query_embed")
    has_passage = hasattr(model, "passage_embed")

    def embed(texts, task, **_):
        texts = list(texts)
        if task == "retrieval.query" and has_query:
            vectors = model.query_embed(texts)
        elif task == "retrieval.passage" and has_passage:
            vectors = model.passage_embed(texts)
        else:
            vectors = model.embed(texts)
        return [vector.tolist() for vector in vectors]

    return embed


def labels_of(case):
    return {(item["chapterId"], item["slide"]): item["grade"]
            for item in case["relevant"]}


def metrics(pages, relevant, limit):
    return {
        "recall@5": recall_at_k(pages, relevant, 5),
        "recall@k": recall_at_k(pages, relevant, limit),
        "mrr": reciprocal_rank(pages, relevant),
        "ndcg@k": ndcg_at_k(pages, relevant, limit),
        "hit@5": hit_at_k(pages, relevant, 5),
    }


def run_query(store, case, level, query, index, embed, strategy):
    last = {}
    limit = LEVEL_LIMITS[level]

    def translate(text):
        value = hs.english_query(text)
        last["translatedQuery"] = value
        return value

    start = time.perf_counter()
    try:
        result = hs.hybrid_search(query, limit, path=index, translate=translate, embed=embed)
        pages = [(item.chapterId, item.slide) for item in result.results]
        error = None
    except Exception as exc:  # record, never invent a ranking
        pages, error = [], f"{type(exc).__name__}: {exc}"[:200]
    elapsed = (time.perf_counter() - start) * 1000
    return {
        "id": case["id"], "level": level, "strategy": strategy,
        "category": case["category"], "concept": case["concept"],
        "query": query, "englishQuery": case["englishQuery"],
        "ranked": [{"chapterId": c, "slide": s} for c, s in pages],
        "latencyMs": round(elapsed, 1), "error": error,
        "diagnostics": {"local": True, "translatedQuery": last.get("translatedQuery")},
        "metrics": metrics(pages, labels_of(case), limit) if pages else {
            "recall@5": 0.0, "recall@k": 0.0, "mrr": 0.0, "ndcg@k": 0.0, "hit@5": 0.0},
    }


def aggregate(rows, level):
    groups = {}
    for row in rows:
        for key in ((row["category"],), ("ALL",)):
            groups.setdefault((row["strategy"], key[0]), []).append(row)
    output = {}
    for (strategy, category), items in sorted(groups.items()):
        ok = [item for item in items if not item["error"]]
        latencies = [item["latencyMs"] for item in ok]
        output[f"{strategy}|{category}"] = {
            "strategy": strategy, "category": category, "count": len(items),
            "errors": len(items) - len(ok),
            "recall@5": mean(item["metrics"]["recall@5"] for item in items),
            "recall@k": mean(item["metrics"]["recall@k"] for item in items),
            "mrr": mean(item["metrics"]["mrr"] for item in items),
            "ndcg@k": mean(item["metrics"]["ndcg@k"] for item in items),
            "hit@5": mean(item["metrics"]["hit@5"] for item in items),
            "p50ms": percentile(latencies, 0.5),
            "p95ms": percentile(latencies, 0.95),
            "k": LEVEL_LIMITS[level],
        }
    return output


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model", default="jinaai/jina-embeddings-v3")
    parser.add_argument("--cache-dir", type=Path,
                        default=ROOT / "data/evaluation/models")
    parser.add_argument("--index", type=Path,
                        default=ROOT / "data/evaluation/local-hybrid-index.sqlite3")
    parser.add_argument("--cases", type=Path,
                        default=ROOT / "docs/fixtures/retrieval-benchmark-v1.json")
    parser.add_argument("--output", type=Path,
                        default=ROOT / "data/evaluation/local-hybrid-run.json")
    parser.add_argument("--levels", default="l1,l2")
    parser.add_argument("--rebuild", action="store_true")
    parser.add_argument("--max-queries", type=int, default=0)
    args = parser.parse_args()

    fixture = json.loads(args.cases.read_text(encoding="utf-8"))
    cases = fixture["queries"][:args.max_queries or None]
    levels = [item.strip() for item in args.levels.split(",") if item.strip()]
    strategy = "hybrid_local"
    embed = make_embedder(args.model, args.cache_dir)
    # The index stores this tag; hybrid_search validates it against its own global.
    ri.MODEL = args.model
    hs.MODEL = args.model

    store = ChapterStore(ROOT / "book", ROOT / "data" / "slides")
    if args.rebuild or not args.index.is_file():
        print(f"[index] building {args.index} with {args.model}", flush=True)
        result = ri.rebuild(store, path=args.index, embed=embed)
        print(f"[index] {result}", flush=True)
    index_pages = 0
    import sqlite3
    with sqlite3.connect(args.index) as conn:
        index_pages = conn.execute("SELECT COUNT(*) FROM slides").fetchone()[0]

    rows = []
    for level in levels:
        for case in cases:
            query = case["englishQuery"] if level == "l1" else case["query"]
            row = run_query(store, case, level, query, args.index, embed, strategy)
            rows.append(row)
            print(f"[{level}] {case['id']:<32} {row['metrics']['ndcg@k']:.3f} "
                  f"{row['latencyMs']:>8.0f}ms {row['error'] or ''}", flush=True)

    report = {
        "meta": {
            "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
            "fixture": str(args.cases), "queries": len(cases),
            "provider": "fastembed local ONNX (substitute for Jina API)",
            "model": args.model, "index": str(args.index.relative_to(ROOT)),
            "indexPages": index_pages, "levels": levels,
            "limits": {level: LEVEL_LIMITS[level] for level in levels},
            "warning": "This does NOT validate the shipped Jina API path. "
                       "It measures the same fusion formula with a local model.",
        },
        "rows": rows,
        "aggregates": {level: aggregate([r for r in rows if r["level"] == level], level)
                       for level in levels},
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")
    summary = {key: {m: round(v[m], 3) for m in ("count", "errors", "ndcg@k", "recall@5", "p50ms")}
               for key, v in report["aggregates"].get("l2", {}).items() if v["category"] == "ALL"}
    print(json.dumps({"rows": len(rows), "indexPages": index_pages, "l2": summary},
                     ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
