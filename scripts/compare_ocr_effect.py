"""Compare two paired evaluation runs (e.g. no-OCR vs with-OCR)."""

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(Path(__file__).resolve().parent))

from eval_stats import bootstrap_ci, mean

CATEGORIES = ["english_term", "chinese_nl", "mixed", "constraint", "ALL"]


def index_rows(results):
    rows = {}
    for row in results["rows"]:
        rows[(row["level"], row["strategy"], row["id"])] = row
    return rows


def compare(before, after):
    before_rows, after_rows = index_rows(before), index_rows(after)
    shared = sorted(set(before_rows) & set(after_rows))
    groups = {}
    for level, strategy, query_id in shared:
        old = before_rows[(level, strategy, query_id)]
        new = after_rows[(level, strategy, query_id)]
        for category in (old["category"], "ALL"):
            groups.setdefault((level, strategy, category), []).append(
                new["metrics"]["ndcg@k"] - old["metrics"]["ndcg@k"])
    output = {}
    for (level, strategy, category), deltas in sorted(groups.items()):
        wins = sum(delta > 1e-9 for delta in deltas)
        losses = sum(delta < -1e-9 for delta in deltas)
        output[f"{level}|{strategy}|{category}"] = {
            "level": level, "strategy": strategy, "category": category,
            "n": len(deltas), "meanDelta": round(mean(deltas), 4),
            "ci95": bootstrap_ci(deltas),
            "wins": wins, "ties": len(deltas) - wins - losses, "losses": losses,
        }
    return output


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--before", type=Path,
                        default=ROOT / "docs/evaluation/results/retrieval-run-with-hybrid.json")
    parser.add_argument("--after", type=Path,
                        default=ROOT / "docs/evaluation/results/retrieval-run-with-ocr.json")
    parser.add_argument("--output", type=Path,
                        default=ROOT / "docs/evaluation/results/ocr-effect.json")
    args = parser.parse_args()
    report = {"before": str(args.before), "after": str(args.after),
              "note": "Positive delta means the with-OCR run ranked the labeled pages higher.",
              "groups": compare(json.loads(args.before.read_text(encoding="utf-8")),
                                json.loads(args.after.read_text(encoding="utf-8")))}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")
    for key, item in report["groups"].items():
        if item["level"] == "l2" and item["category"] in ("ALL", "chinese_nl", "constraint"):
            print(f'{key:38} Δ={item["meanDelta"]:+.3f} CI={item["ci95"]} '
                  f'W/T/L={item["wins"]}/{item["ties"]}/{item["losses"]}')


if __name__ == "__main__":
    main()
