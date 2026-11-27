"""Render static SVG charts and Markdown tables from an evaluation result JSON."""

import argparse
import html
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CATEGORY_LABELS = {
    "english_term": "英文术语",
    "chinese_nl": "中文自然语言",
    "mixed": "中英混合",
    "constraint": "约束型",
    "ALL": "全部",
}
STRATEGY_LABELS = {
    "baseline": "标准检索 baseline",
    "llm_assisted": "AI 增强检索 llm_assisted",
    "hybrid": "混合检索 hybrid",
    "translated_lexical": "翻译+词法（消融）",
}
SERIES = [
    {"key": "baseline", "name": "标准检索", "light": "#2a78d6", "dark": "#3987e5", "cls": "s1"},
    {"key": "llm_assisted", "name": "AI 增强检索", "light": "#eb6834", "dark": "#d95926", "cls": "s2"},
    {"key": "hybrid", "name": "混合检索", "light": "#1baf7a", "dark": "#199e70", "cls": "s3"},
    {"key": "translated_lexical", "name": "翻译+词法（消融）", "light": "#6250d6", "dark": "#9085e9", "cls": "s4"},
]
SERIES_BY_KEY = {item["key"]: item for item in SERIES}


def series_for(keys):
    return [dict(SERIES_BY_KEY[key]) for key in keys if key in SERIES_BY_KEY]

STYLE = """
  .surface { fill: var(--surface, #fcfcfb); }
  .ink { fill: var(--ink, #0b0b0b); }
  .secondary { fill: var(--secondary, #52514e); }
  .muted { fill: var(--muted, #898781); }
  .grid { stroke: var(--grid, #e1e0d9); stroke-width: 1; }
  .axis { stroke: var(--axis, #c3c2b7); stroke-width: 1; }
  .s1 { fill: var(--s1, #2a78d6); }
  .s2 { fill: var(--s2, #eb6834); }
  .s3 { fill: var(--s3, #1baf7a); }
  .s4 { fill: var(--s4, #6250d6); }
  .neg { fill: var(--neg, #d03b3b); }
  .pos { fill: var(--s1, #2a78d6); }
  .zero { stroke: var(--axis, #c3c2b7); stroke-width: 1; }
  text { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
  @media (prefers-color-scheme: dark) {
    .surface { fill: #1a1a19; } .ink { fill: #f0efec; }
    .secondary { fill: #c3c2b7; } .muted { fill: #898781; }
    .grid { stroke: #2c2c2a; } .axis { stroke: #383835; }
    .s1 { fill: #3987e5; } .s2 { fill: #d95926; } .s3 { fill: #199e70; } .s4 { fill: #9085e9; }
  }
"""


def esc(value):
    return html.escape(str(value), quote=True)


def bar_path(x, y, width, height, radius=4):
    if height <= 0:
        return ""
    radius = min(radius, height, width / 2)
    return (f"M{x:.1f},{y + height:.1f} V{y + radius:.1f} "
            f"Q{x:.1f},{y:.1f} {x + radius:.1f},{y:.1f} "
            f"H{x + width - radius:.1f} Q{x + width:.1f},{y:.1f} "
            f"{x + width:.1f},{y + radius:.1f} V{y + height:.1f} Z")


def bar_path_down(x, y, width, height, radius=4):
    """Negative bar: square at the baseline (top), rounded data-end (bottom)."""
    if height <= 0:
        return ""
    radius = min(radius, height, width / 2)
    return (f"M{x:.1f},{y:.1f} V{y + height - radius:.1f} "
            f"Q{x:.1f},{y + height:.1f} {x + radius:.1f},{y + height:.1f} "
            f"H{x + width - radius:.1f} Q{x + width:.1f},{y + height:.1f} "
            f"{x + width:.1f},{y + height - radius:.1f} V{y:.1f} Z")


def svg_frame(width, height, title, subtitle, body, legend):
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" '
        f'viewBox="0 0 {width} {height}" role="img" aria-label="{esc(title)}">'
        f'<style>{STYLE}</style>'
        f'<rect class="surface" x="0" y="0" width="{width}" height="{height}" rx="10"/>'
        f'<text class="ink" x="28" y="30" font-size="16" font-weight="600">{esc(title)}</text>'
        f'<text class="secondary" x="28" y="50" font-size="12">{esc(subtitle)}</text>'
        f'{legend}{body}</svg>')


def legend_block(items, x=28, y=66):
    parts = []
    cursor = x
    for item in items:
        parts.append(f'<rect class="{item["cls"]}" x="{cursor}" y="{y - 9}" width="10" height="10" rx="2"/>')
        parts.append(f'<text class="secondary" x="{cursor + 16}" y="{y}" font-size="12">{esc(item["name"])}</text>')
        cursor += 28 + len(item["name"]) * 12
    return "".join(parts)


def grouped_bars(title, subtitle, groups, series, values, y_max, ticks,
                 out, fmt, label_all=False, group_labels=None):
    width, height = 780, 390
    left, right, top, bottom = 62, 24, 96, 62
    plot_w, plot_h = width - left - right, height - top - bottom
    n_groups, n_series = len(groups), len(series)
    group_w = plot_w / n_groups
    bar_w = min(24, (group_w - 36 - 2 * (n_series - 1)) / n_series)
    body = [f'<line class="axis" x1="{left}" y1="{top + plot_h}" x2="{left + plot_w}" y2="{top + plot_h}"/>']
    for tick in ticks:
        y = top + plot_h - tick / y_max * plot_h
        body.append(f'<line class="grid" x1="{left}" y1="{y:.1f}" x2="{left + plot_w}" y2="{y:.1f}"/>')
        body.append(f'<text class="muted" x="{left - 8}" y="{y + 4:.1f}" font-size="11" text-anchor="end">'
                    f'{tick:g}</text>')
    for gi, group in enumerate(groups):
        gx = left + gi * group_w
        start = gx + (group_w - (bar_w * n_series + 2 * (n_series - 1))) / 2
        for si, item in enumerate(series):
            value = values.get((item["key"], group), 0.0)
            bar_h = max(0.0, value / y_max * plot_h)
            x = start + si * (bar_w + 2)
            y = top + plot_h - bar_h
            cls = item["cls"]
            tip = f'{item["name"]} · {group_labels.get(group, group) if group_labels else group}: {fmt(value)}'
            body.append(f'<g><title>{esc(tip)}</title>'
                        f'<path class="{cls}" d="{bar_path(x, y, bar_w, bar_h)}"/></g>')
            if label_all and group == "ALL":
                # Stagger labels so adjacent series values never collide.
                body.append(f'<text class="secondary" x="{x + bar_w / 2:.1f}" '
                            f'y="{y - 5 - 10 * si:.1f}" font-size="11" text-anchor="middle">'
                            f'{fmt(value)}</text>')
        label = group_labels.get(group, group) if group_labels else group
        body.append(f'<text class="secondary" x="{gx + group_w / 2:.1f}" y="{top + plot_h + 22}" '
                    f'font-size="12" text-anchor="middle">{esc(label)}</text>')
    legend = (legend_block([{"name": item["name"], "cls": item["cls"]} for item in series])
              if len(series) > 1 else "")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(svg_frame(width, height, title, subtitle, "".join(body), legend), encoding="utf-8")


def diverging_bars(title, subtitle, groups, values, y_max, out, group_labels):
    width, height = 780, 360
    left, right, top, bottom = 62, 24, 96, 62
    plot_w, plot_h = width - left - right, height - top - bottom
    zero_y = top + plot_h / 2
    body = [f'<line class="zero" x1="{left}" y1="{zero_y}" x2="{left + plot_w}" y2="{zero_y}"/>']
    for tick in (-y_max, -y_max / 2, y_max / 2, y_max):
        y = zero_y - tick / y_max * (plot_h / 2)
        body.append(f'<line class="grid" x1="{left}" y1="{y:.1f}" x2="{left + plot_w}" y2="{y:.1f}"/>')
        body.append(f'<text class="muted" x="{left - 8}" y="{y + 4:.1f}" font-size="11" '
                    f'text-anchor="end">{tick:+.2f}</text>')
    group_w = plot_w / len(groups)
    bar_w = min(48, group_w * 0.4)
    for gi, group in enumerate(groups):
        value = values.get(group, 0.0)
        x = left + gi * group_w + group_w / 2 - bar_w / 2
        h = abs(value) / y_max * (plot_h / 2)
        y = zero_y - h if value >= 0 else zero_y
        cls = "pos" if value >= 0 else "neg"
        label_y = y - 6 if value >= 0 else y + h + 16
        path = bar_path(x, y, bar_w, h) if value >= 0 else bar_path_down(x, y, bar_w, h)
        body.append(f'<g><title>{esc(group_labels[group])}: {value:+.3f}</title>'
                    f'<path class="{cls}" d="{path}"/></g>')
        body.append(f'<text class="secondary" x="{x + bar_w / 2:.1f}" y="{label_y:.1f}" '
                    f'font-size="11" text-anchor="middle">{value:+.3f}</text>')
        body.append(f'<text class="secondary" x="{x + bar_w / 2:.1f}" y="{top + plot_h + 22}" '
                    f'font-size="12" text-anchor="middle">{esc(group_labels[group])}</text>')
    legend = legend_block([{"name": "增强更好", "cls": "pos"}, {"name": "增强更差", "cls": "neg"}])
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(svg_frame(width, height, title, subtitle, "".join(body), legend), encoding="utf-8")


def agg(results, level, strategy, category):
    return results["aggregates"][level][f"{strategy}|{category}"]


def fmt3(value):
    return f"{value:.3f}"


def nice_max(value, steps=4):
    """Round a chart maximum up to a clean step (1/1.5/2/2.5/3/4/5/10)."""
    if value <= 0:
        return 1.0
    raw = value / steps
    exponent = 10 ** int(math.floor(math.log10(raw)))
    for multiplier in (1, 1.5, 2, 2.5, 3, 4, 5, 10):
        if raw <= multiplier * exponent:
            return multiplier * exponent * steps
    return 10 * exponent * steps


def md_table(results, level, categories, strategies):
    lines = ["| 策略 | 类别 | n | 错误 | nDCG@k | Recall@5 | Recall@k | MRR | Hit@5 | p50 ms | p95 ms | 规划回退 |",
             "|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|"]
    for strategy in strategies:
        for category in categories:
            item = agg(results, level, strategy, category)
            lines.append(
                f'| {STRATEGY_LABELS.get(strategy, strategy)} | {CATEGORY_LABELS.get(category, category)} | '
                f'{item["count"]} | {item["errors"]} | {item["ndcg@k"]:.3f} | {item["recall@5"]:.3f} | '
                f'{item["recall@k"]:.3f} | {item["mrr"]:.3f} | {item["hit@5"]:.3f} | '
                f'{item["p50ms"]:.0f} | {item["p95ms"]:.0f} | {item["fallbacks"]} |')
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--results", type=Path,
                        default=ROOT / "data/evaluation/retrieval-run-with-hybrid.json")
    parser.add_argument("--out-dir", type=Path, default=ROOT / "docs/evaluation")
    args = parser.parse_args()
    results = json.loads(args.results.read_text(encoding="utf-8"))
    levels = [level for level in ("l1", "l2") if level in results["aggregates"]]
    categories = ["english_term", "chinese_nl", "mixed", "constraint", "ALL"]
    strategies_l1 = [s for s in ("baseline", "hybrid")
                     if "l1" in levels and f"{s}|ALL" in results["aggregates"]["l1"]]
    strategies_l2 = [s for s in ("baseline", "llm_assisted", "hybrid")
                     if "l2" in levels and f"{s}|ALL" in results["aggregates"]["l2"]]
    ablation = [s for s in ("translated_lexical",)
                if "l2" in levels and f"{s}|ALL" in results["aggregates"]["l2"]]
    charts = args.out_dir / "charts"
    tables = ["# 自动生成的评测表格", "",
              "由 `scripts/render_eval_charts.py` 从当前评测 JSON 生成。", ""]
    if "l1" in levels and strategies_l1:
        tables += ["## L1 检索器对比（相同英文 Query，K=10）", "",
                   md_table(results, "l1", categories, strategies_l1), ""]
        values = {(s, c): agg(results, "l1", s, c)["ndcg@k"] for s in strategies_l1 for c in categories}
        grouped_bars("L1 检索器 nDCG@10（按问法）",
                     "同一批英文问题，只换检索器；纵轴 0–1，柱子越高=越常把相关页排进前 10",
                     categories, series_for(strategies_l1), values, 1.0,
                     [0, 0.2, 0.4, 0.6, 0.8, 1.0],
                     charts / "l1-ndcg.svg", fmt3, label_all=True, group_labels=CATEGORY_LABELS)
    if "l2" in levels and strategies_l2:
        tables += ["## L2 产品链路（K=8，生产来源上限）", "",
                   md_table(results, "l2", categories, strategies_l2), ""]
        values = {(s, c): agg(results, "l2", s, c)["ndcg@k"] for s in strategies_l2 for c in categories}
        grouped_bars("L2 nDCG@8（按问法）",
                     "模拟真实使用；纵轴 0–1，柱子越高=前 8 个来源里越常出现相关课件页",
                     categories, series_for(strategies_l2),
                     values, 1.0, [0, 0.2, 0.4, 0.6, 0.8, 1.0],
                     charts / "l2-ndcg.svg", fmt3, label_all=True, group_labels=CATEGORY_LABELS)
        values = {(s, c): agg(results, "l2", s, c)["recall@5"] for s in strategies_l2 for c in categories}
        grouped_bars("L2 Recall@5（按问法）",
                     "前 5 个结果覆盖了多少必看页；0–1，越高越好；不是“回答正确率”",
                     categories, series_for(strategies_l2),
                     values, 1.0, [0, 0.2, 0.4, 0.6, 0.8, 1.0],
                     charts / "l2-recall5.svg", fmt3, group_labels=CATEGORY_LABELS)
        lat_values = {}
        lat_groups = []
        for strategy in strategies_l2 + ablation:
            lat_groups.append(strategy)
            lat_values[("p50", strategy)] = agg(results, "l2", strategy, "ALL")["p50ms"]
            lat_values[("p95", strategy)] = agg(results, "l2", strategy, "ALL")["p95ms"]
        lat_series = [{"key": "p50", "name": "p50", "cls": "s1"},
                      {"key": "p95", "name": "p95", "cls": "s2"}]
        y_max = nice_max(max(lat_values.values())) if lat_values else 1
        grouped_bars("L2 检索阶段延迟（毫秒）",
                     "一次检索要等多久（毫秒）；越矮越快；它不是质量分",
                     lat_groups, lat_series, lat_values, y_max,
                     [y_max * f / 4 for f in range(5)],
                     charts / "l2-latency.svg", lambda v: f"{v:.0f}",
                     group_labels=STRATEGY_LABELS)
        if ablation:
            ablation_strategies = [s for s in ("baseline", "llm_assisted", "translated_lexical")
                                   if f"{s}|ALL" in results["aggregates"]["l2"]]
            tables += ["## 翻译消融（不是产品模式）", "",
                       "`translated_lexical` 只复用 hybrid 的英文翻译步骤，然后走词法检索，"
                       "用于分离「翻译」与「向量嵌入」的贡献。", "",
                       md_table(results, "l2", categories, ablation_strategies), ""]
            values = {(s, c): agg(results, "l2", s, c)["ndcg@k"]
                      for s in ablation_strategies for c in categories}
            grouped_bars("翻译消融：nDCG@8（按问法）",
                         "只翻译 vs 完整 hybrid，用来看翻译贡献了多少；越高越好",
                         categories,
                         series_for(ablation_strategies),
                         values, 1.0, [0, 0.2, 0.4, 0.6, 0.8, 1.0],
                         charts / "l2-ablation.svg", fmt3, label_all=True,
                         group_labels=CATEGORY_LABELS)
        if all(s in strategies_l2 for s in ("baseline", "llm_assisted")):
            deltas = {c: agg(results, "l2", "llm_assisted", c)["ndcg@k"]
                      - agg(results, "l2", "baseline", c)["ndcg@k"] for c in categories}
            span = max(0.02, max(abs(v) for v in deltas.values()) * 1.2)
            diverging_bars("AI 增强检索相对标准检索的 nDCG@8 差值",
                           "高于 0=比标准检索好，低于 0=更差；看 AI 增强是否值得",
                           categories, deltas, span, charts / "l2-delta.svg", CATEGORY_LABELS)
        if all(s in strategies_l2 for s in ("baseline", "hybrid")):
            deltas = {c: agg(results, "l2", "hybrid", c)["ndcg@k"]
                      - agg(results, "l2", "baseline", c)["ndcg@k"] for c in categories}
            span = max(0.02, max(abs(v) for v in deltas.values()) * 1.2)
            diverging_bars("混合检索相对标准检索的 nDCG@8 差值",
                           "高于 0=比标准检索好，低于 0=更差；看混合检索是否值得",
                           categories, deltas, span, charts / "l2-hybrid-delta.svg", CATEGORY_LABELS)
    (args.out_dir / "generated-tables.md").write_text("\n".join(tables) + "\n", encoding="utf-8")
    print(json.dumps({"charts": [str(p) for p in sorted(charts.glob("*.svg"))],
                      "tables": str(args.out_dir / "generated-tables.md")},
                     ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
