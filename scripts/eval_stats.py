"""Bootstrap uncertainty for the retrieval evaluation; no network access."""

import argparse
import json
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CATEGORIES = ["english_term", "chinese_nl", "mixed", "constraint", "ALL"]
METRICS = ["ndcg@k", "recall@5"]
RNG = random.Random(20261126)


def mean(values):
    return sum(values) / len(values) if values else 0.0


def bootstrap_ci(values, resamples=2000, alpha=0.05):
    if not values:
        return [0.0, 0.0]
    means = []
    for _ in range(resamples):
        sample = [values[RNG.randrange(len(values))] for _ in values]
        means.append(mean(sample))
    means.sort()
    low = means[int((alpha / 2) * (len(means) - 1))]
    high = means[int((1 - alpha / 2) * (len(means) - 1))]
    return [round(low, 4), round(high, 4)]


def rows_for(rows, level, strategy, category):
    selected = [row for row in rows if row["level"] == level and row["strategy"] == strategy
                and (category == "ALL" or row["category"] == category)]
    return {row["id"]: row for row in selected}


def summarize(rows, level, strategies, categories):
    output = {}
    for strategy in strategies:
        for category in categories:
            items = list(rows_for(rows, level, strategy, category).values())
            entry = {"n": len(items), "errors": sum(bool(item["error"]) for item in items)}
            for metric in METRICS:
                values = [item["metrics"][metric] for item in items]
                entry[metric] = round(mean(values), 4)
                entry[f"{metric}_ci95"] = bootstrap_ci(values)
            output[f"{strategy}|{category}"] = entry
    return output


def paired(rows, level, treatment, control, categories, treatment_level=None):
    output = {}
    for category in categories:
        treated = rows_for(rows, treatment_level or level, treatment, category)
        controlled = rows_for(rows, level, control, category)
        shared = sorted(set(treated) & set(controlled))
        deltas = [treated[key]["metrics"]["ndcg@k"] - controlled[key]["metrics"]["ndcg@k"]
                  for key in shared]
        wins = sum(delta > 1e-9 for delta in deltas)
        losses = sum(delta < -1e-9 for delta in deltas)
        output[category] = {
            "n": len(shared),
            "meanDelta": round(mean(deltas), 4),
            "ci95": bootstrap_ci(deltas),
            "wins": wins, "ties": len(deltas) - wins - losses, "losses": losses,
        }
    return output


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--results", type=Path,
                        default=ROOT / "data/evaluation/retrieval-run.json")
    parser.add_argument("--output", type=Path,
                        default=ROOT / "docs/evaluation/results/stats-with-hybrid.json")
    args = parser.parse_args()
    results = json.loads(args.results.read_text(encoding="utf-8"))
    rows = results["rows"]
    strategies = sorted({row["strategy"] for row in rows if row["level"] == "l2"})
    l1_strategies = sorted({row["strategy"] for row in rows if row["level"] == "l1"})
    pairs = {treatment: paired(rows, "l2", treatment, "baseline", CATEGORIES)
             for treatment in strategies if treatment != "baseline"}
    if "translated_lexical" in strategies and "llm_assisted" in strategies:
        pairs["translated_lexical_vs_llm_assisted"] = paired(
            rows, "l2", "translated_lexical", "llm_assisted", CATEGORIES)
    if "hybrid" in strategies and "translated_lexical" in strategies:
        pairs["hybrid_vs_translated_lexical"] = paired(
            rows, "l2", "hybrid", "translated_lexical", CATEGORIES)
    if "hybrid" in strategies and "llm_assisted" in strategies:
        pairs["hybrid_vs_llm_assisted"] = paired(
            rows, "l2", "hybrid", "llm_assisted", CATEGORIES)
    report = {
        "seed": 20261126, "resamples": 2000,
        "note": "Percentile bootstrap over queries. With 9 queries per category the "
                "intervals are wide; overlapping intervals mean no demonstrated difference.",
        "levels": {
            "l1": {"strategies": summarize(rows, "l1", l1_strategies, CATEGORIES)},
            "l2": {
                "strategies": summarize(rows, "l2", strategies, CATEGORIES),
                "paired": pairs,
                "query_language_gap": paired(
                    rows, "l2", "baseline", "baseline", CATEGORIES, treatment_level="l1"),
            },
        },
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")
    print(json.dumps(report["levels"]["l2"]["paired"], ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
