"""Build the Word evaluation report from measured JSON (no network)."""

import argparse
import json
from pathlib import Path

from docx import Document
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor

from eval_docx_plain import build_plain_intro

ROOT = Path(__file__).resolve().parents[1]
CATEGORY_LABELS = {
    "english_term": "英文术语", "chinese_nl": "中文自然语言",
    "mixed": "中英混合", "constraint": "约束型", "ALL": "全部",
}
STRATEGY_LABELS = {
    "baseline": "标准检索 baseline",
    "llm_assisted": "AI 增强 llm_assisted",
    "hybrid": "混合检索 hybrid",
    "translated_lexical": "翻译+词法（消融）",
}
CATEGORIES = ["english_term", "chinese_nl", "mixed", "constraint", "ALL"]


def set_east_asian(run, name="微软雅黑"):
    run.font.name = name
    run._element.get_or_add_rPr().get_or_add_rFonts().set(qn("w:eastAsia"), name)


def style_document(doc):
    normal = doc.styles["Normal"]
    normal.font.name = "Microsoft YaHei"
    normal.font.size = Pt(10.5)
    normal.element.get_or_add_rPr().get_or_add_rFonts().set(qn("w:eastAsia"), "微软雅黑")
    for level, size in ((1, 16), (2, 13), (3, 11.5)):
        style = doc.styles[f"Heading {level}"]
        style.font.name = "Microsoft YaHei"
        style.font.size = Pt(size)
        style.font.color.rgb = RGBColor(0x1F, 0x3A, 0x5F)
        style.element.get_or_add_rPr().get_or_add_rFonts().set(qn("w:eastAsia"), "微软雅黑")


def shade(cell, hex_color):
    element = OxmlElement("w:shd")
    element.set(qn("w:fill"), hex_color)
    cell._tc.get_or_add_tcPr().append(element)


def add_table(doc, headers, rows, widths=None):
    table = doc.add_table(rows=1, cols=len(headers))
    table.style = "Table Grid"
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    for index, text in enumerate(headers):
        cell = table.rows[0].cells[index]
        cell.text = ""
        run = cell.paragraphs[0].add_run(str(text))
        run.bold = True
        run.font.size = Pt(9)
        set_east_asian(run)
        shade(cell, "DCE6F1")
    for row in rows:
        cells = table.add_row().cells
        for index, text in enumerate(row):
            cells[index].text = ""
            run = cells[index].paragraphs[0].add_run(str(text))
            run.font.size = Pt(9)
            set_east_asian(run)
    if widths:
        for row in table.rows:
            for index, width in enumerate(widths):
                row.cells[index].width = Inches(width)
    doc.add_paragraph()


def add_figure(doc, path, caption, width=6.2):
    if not Path(path).exists():
        doc.add_paragraph(f"[缺图：{path}]")
        return
    doc.add_picture(str(path), width=Inches(width))
    doc.paragraphs[-1].alignment = WD_ALIGN_PARAGRAPH.CENTER
    para = doc.add_paragraph()
    para.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = para.add_run(caption)
    run.font.size = Pt(8.5)
    run.font.color.rgb = RGBColor(0x66, 0x66, 0x66)
    set_east_asian(run)


def add_bullets(doc, items):
    for item in items:
        para = doc.add_paragraph(style="List Bullet")
        run = para.add_run(item)
        set_east_asian(run)


def add_kv(doc, pairs):
    add_table(doc, ["项", "值"], pairs, widths=[1.4, 5.0])


def agg(results, level, strategy, category):
    return results.get("aggregates", {}).get(level, {}).get(f"{strategy}|{category}")


def value(results, level, strategy, category, metric="ndcg@k"):
    item = agg(results, level, strategy, category)
    return f"{item[metric]:.3f}" if item else "—"


def paired(stats, treatment, category):
    return stats.get("levels", {}).get("l2", {}).get("paired", {}).get(treatment, {}).get(category)


def verdict(entry):
    if not entry:
        return "无数据"
    if entry["ci95"][0] > 0:
        return "有证据更好"
    if entry["ci95"][1] < 0:
        return "有证据更差"
    return "未证明差异"


def build(results, stats, out_path, shots, ocr_effect=None):
    doc = Document()
    generated = (results.get("meta", {}).get("generatedAt", "") or "2026-11-27")[:10]
    images = len(list((ROOT / "data" / "slides").rglob("*.png")))
    ocr_files = len(list((ROOT / "data" / "ocr").rglob("*.txt")))
    style_document(doc)
    section = doc.sections[0]
    for attr in ("left_margin", "right_margin"):
        setattr(section, attr, Inches(0.9))

    # Cover
    title = doc.add_paragraph()
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = title.add_run("MAGA 检索策略评测报告")
    run.bold = True
    run.font.size = Pt(26)
    run.font.color.rgb = RGBColor(0x1F, 0x3A, 0x5F)
    set_east_asian(run)
    subtitle = doc.add_paragraph()
    subtitle.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = subtitle.add_run("标准检索 / AI 增强检索 / 混合检索 / 翻译消融")
    run.font.size = Pt(13)
    run.font.color.rgb = RGBColor(0x55, 0x55, 0x55)
    set_east_asian(run)
    doc.add_paragraph()
    add_kv(doc, [
        ("评测日期", f"{generated}（Asia/Shanghai；页图 + OCR 已启用）"),
        ("代码分支", "yjp/final_develop（基于 feature/mxl-hybrid-retrieval）"),
        ("大模型", "DeepSeek deepseek-flash"),
        ("嵌入", "Jina jina-embeddings-v3（真实 API，经本机代理）"),
        ("数据", "9 个课程概念 × 4 种问法 = 36 条人工标注 Query"),
        ("页图 / OCR", f"{images} 张页图；{ocr_files} 个 OCR 文本（默认仅稀疏页）"),
        ("运行规模", f"{len(results['rows'])} 行；{len([r for r in results['rows'] if r['error']])} 个执行错误"),
        ("回归", "268 后端 / 162 前端 / 27 E2E；构建与 500 行检查通过"),
    ])
    doc.add_page_break()

    # Plain-language front matter
    build_plain_intro(doc, results, stats, add_table, add_bullets, agg, paired,
                      verdict, ocr_effect)
    doc.add_page_break()
    doc.add_heading("附录 A：技术细节与证据", level=1)
    doc.add_paragraph("以下为公式、完整表格、置信区间、运行环境与复现命令；正文结论见前文。")

    # Appendix A1
    doc.add_heading("A1. 技术摘要", level=1)
    b = agg(results, "l2", "baseline", "ALL")
    h = agg(results, "l2", "hybrid", "ALL")
    l = agg(results, "l2", "llm_assisted", "ALL")
    t = agg(results, "l2", "translated_lexical", "ALL")
    hp = paired(stats, "hybrid", "ALL")
    lp = paired(stats, "llm_assisted", "ALL")
    add_bullets(doc, [
        f"标准检索在产品链路的总体 nDCG@8 为 {b['ndcg@k']:.3f}；中文自然语言仅 "
        f"{agg(results, 'l2', 'baseline', 'chinese_nl')['ndcg@k']:.3f}。",
        f"混合检索总体 nDCG@8 为 {h['ndcg@k']:.3f}，相对标准检索 "
        f"{hp['meanDelta']:+.3f}（95% CI {hp['ci95']}，{verdict(hp)}）。",
        f"AI 增强检索总体 {l['ndcg@k']:.3f}，相对标准检索 "
        f"{lp['meanDelta']:+.3f}（95% CI {lp['ci95']}，{verdict(lp)}）；"
        f"p50 延迟 {l['p50ms']:.0f} ms vs {b['p50ms']:.0f} ms。",
        f"翻译+词法消融总体 {t['ndcg@k']:.3f}；hybrid 比它再高 "
        f"{paired(stats, 'hybrid_vs_translated_lexical', 'ALL')['meanDelta']:+.3f}"
        f"（95% CI {paired(stats, 'hybrid_vs_translated_lexical', 'ALL')['ci95']}），"
        f"约束型高 {paired(stats, 'hybrid_vs_translated_lexical', 'constraint')['meanDelta']:+.3f}；"
        "消融只用于诊断，不是产品模式。",
        "初次直连 Jina 被校园 DNS 拦截；通过本机系统代理 127.0.0.1:7890 后成功建立 "
        "340 页索引并完成真实 hybrid 评测。",
        f"本轮已渲染 {images} 张页图并生成 {ocr_files} 个 OCR 文本；OCR 对检索指标的影响见 §3.6。",
        "教学流程只做了 1 案例 1 决策点的真实冒烟，不是 27 份答案的双人盲评。",
    ])
    doc.add_page_break()

    # 2. Method
    doc.add_heading("A2. 评测设计", level=1)
    doc.add_heading("A2.1 数据集", level=2)
    doc.add_paragraph(
        "9 个课程概念，每个概念 4 种问法：英文术语、中文自然语言、中英混合、约束型场景，"
        "共 36 条 Query；同一概念的四种问法共享人工标注相关页。相关度 2=直接定义/解释，"
        "1=例子/场景/总结/密切相关战术，未列出的页面按 0 计。单一标注者，无第二人盲审。")
    add_table(doc, ["概念", "英文术语示例", "标注页数"], [
        ["heartbeat", "heartbeat", "5"], ["availability", "availability", "5"],
        ["recovery", "recovery tactics", "7"], ["interoperability", "interoperability", "5"],
        ["service discovery", "service discovery", "6"], ["modifiability", "modifiability", "5"],
        ["coupling/cohesion", "coupling and cohesion", "7"],
        ["performance tactics", "performance tactics", "9"], ["scheduling", "task scheduling", "7"],
    ], widths=[1.7, 3.0, 1.2])
    doc.add_heading("A2.2 两层评测", level=2)
    add_table(doc, ["层", "输入", "比较", "目的"], [
        ["L1 检索器", "同一批人工英文 Query", "baseline vs hybrid", "隔离检索算法与语言因素"],
        ["L2 产品链路", "用户原始 Query", "baseline / llm_assisted / hybrid", "复现用户实际差别"],
        ["翻译消融", "用户原始 Query", "baseline / translated_lexical", "分离翻译与嵌入/规划"],
    ], widths=[1.0, 1.7, 2.2, 1.7])
    doc.add_paragraph("L1 的 K=10；L2 生产来源上限为 8，故 K=8。指标：nDCG@K、Recall@5、"
                      "Recall@K、MRR、Hit@5；宏平均；失败零填充；95% bootstrap CI（2000 次，种子 20261126）。")
    doc.add_heading("A2.3 判定规则", level=2)
    doc.add_paragraph(
        "运行前约定：某策略只有在目标类别 nDCG 绝对提升 ≥0.05、95% CI 不跨 0、"
        "且 p95 延迟不超过 baseline 的 2 倍时，才建议改变默认；否则只作为选项。"
        "CI 跨 0 一律写「未证明差异」。")
    doc.add_heading("A2.4 环境", level=2)
    add_kv(doc, [
        ("日期", f"{generated}（Asia/Shanghai；页图/OCR 后复跑）"),
        ("分支", "yjp/final_develop（含 feature/mxl-hybrid-retrieval 87 个提交）"),
        ("模型", "DeepSeek deepseek-flash；Jina jina-embeddings-v3"),
        ("网络", "直连 api.jina.ai 被校园 DNS 拦截；经本机 127.0.0.1:7890 代理可达"),
        ("索引", "data/retrieval/index.sqlite3，340 页"),
        ("课件", f"7 章 340 页 PPT 文本；页图 {images} 张；OCR {ocr_files} 个（默认稀疏页）"),
    ])
    doc.add_page_break()

    # 3. Results
    doc.add_heading("A3. 逐类结果与图表", level=1)
    doc.add_heading("A3.1 L1：相同英文 Query 下的检索器对比", level=2)
    add_table(doc, ["策略", "英文术语", "中文自然语言", "中英混合", "约束型", "全部"],
              [[STRATEGY_LABELS[s]] + [value(results, "l1", s, c) for c in CATEGORIES]
               for s in ("baseline", "hybrid") if agg(results, "l1", s, "ALL")],
              widths=[1.9, 0.9, 1.1, 0.8, 0.8, 0.9])
    add_figure(doc, shots / "charts" / "png" / "l1-ndcg.png",
               "图 1  L1 检索器 nDCG@10（相同人工英文 Query）")

    doc.add_heading("A3.2 L2：产品链路的真实差别", level=2)
    product = [s for s in ("baseline", "llm_assisted", "hybrid") if agg(results, "l2", s, "ALL")]
    add_table(doc, ["策略", "英文术语", "中文自然语言", "中英混合", "约束型", "全部", "p50 ms"],
              [[STRATEGY_LABELS[s]] + [value(results, "l2", s, c) for c in CATEGORIES]
               + [f"{agg(results, 'l2', s, 'ALL')['p50ms']:.0f}"] for s in product],
              widths=[1.7, 0.8, 1.0, 0.8, 0.8, 0.8, 0.7])
    add_figure(doc, shots / "charts" / "png" / "l2-ndcg.png", "图 2  L2 nDCG@8（按问法）")
    add_figure(doc, shots / "charts" / "png" / "l2-recall5.png", "图 3  L2 Recall@5（按问法）")
    add_figure(doc, shots / "charts" / "png" / "l2-latency.png", "图 4  L2 检索阶段延迟")
    if (shots / "charts" / "png" / "l2-hybrid-delta.png").exists():
        add_figure(doc, shots / "charts" / "png" / "l2-hybrid-delta.png",
                   "图 5  混合检索相对标准检索的 nDCG@8 差值")
    if (shots / "charts" / "png" / "l2-delta.png").exists():
        add_figure(doc, shots / "charts" / "png" / "l2-delta.png",
                   "图 6  AI 增强检索相对标准检索的 nDCG@8 差值")

    doc.add_heading("A3.3 翻译消融", level=2)
    ablation = [s for s in ("baseline", "llm_assisted", "translated_lexical")
                if agg(results, "l2", s, "ALL")]
    add_table(doc, ["策略", "英文术语", "中文自然语言", "中英混合", "约束型", "全部"],
              [[STRATEGY_LABELS[s]] + [value(results, "l2", s, c) for c in CATEGORIES]
               for s in ablation], widths=[2.1, 0.9, 1.1, 0.8, 0.8, 0.9])
    add_figure(doc, shots / "charts" / "png" / "l2-ablation.png",
               "图 7  翻译+词法消融（诊断用，不是产品模式）")

    doc.add_heading("A3.4 配对统计（同一 Query，bootstrap 95% CI）", level=2)
    rows = []
    for treatment in ("hybrid", "llm_assisted", "translated_lexical"):
        for category in CATEGORIES:
            entry = paired(stats, treatment, category)
            if entry:
                rows.append([STRATEGY_LABELS[treatment].split(" ")[0], CATEGORY_LABELS[category],
                             f"{entry['meanDelta']:+.3f}", str(entry["ci95"]),
                             f"{entry['wins']}/{entry['ties']}/{entry['losses']}", verdict(entry)])
    add_table(doc, ["对比 baseline", "类别", "Δ nDCG", "95% CI", "胜/平/负", "判读"],
              rows, widths=[1.2, 1.0, 0.8, 1.7, 0.9, 1.0])
    doc.add_paragraph(
        "9 条/类的样本很小，CI 很宽；「未证明差异」不等于「相同」。"
        "表中「有证据更好」只针对本课程、本夹具、本模型版本。")
    doc.add_paragraph("嵌入增量（hybrid − 翻译+词法，用来判断向量检索是否在翻译之外还有贡献）：")
    rows = []
    for category in ("ALL", "chinese_nl", "constraint"):
        entry = paired(stats, "hybrid_vs_translated_lexical", category)
        if entry:
            rows.append([CATEGORY_LABELS[category], f"{entry['meanDelta']:+.3f}",
                         str(entry["ci95"]), f"{entry['wins']}/{entry['ties']}/{entry['losses']}",
                         verdict(entry)])
    add_table(doc, ["类别", "Δ nDCG", "95% CI", "胜/平/负", "判读"], rows,
              widths=[1.2, 1.0, 2.0, 1.0, 1.2])

    doc.add_heading("A3.5 典型 Query 对照", level=2)
    cases = ["heartbeat-zh", "recovery-constraint", "service-discovery-mixed",
             "coupling-constraint", "coupling-zh"]
    rows_by_id = {}
    for row in results["rows"]:
        rows_by_id.setdefault(row["id"], {})[row["strategy"]] = row
    rows = []
    for case_id in cases:
        item = rows_by_id.get(case_id, {})
        rows.append([case_id] + [f"{item[s]['metrics']['ndcg@k']:.3f}" if s in item else "—"
                                 for s in ("baseline", "hybrid", "translated_lexical")])
    add_table(doc, ["Query", "baseline", "hybrid", "翻译+词法"], rows,
              widths=[2.8, 1.2, 1.2, 1.2])
    doc.add_paragraph(
        "翻译能救回完全无词可命中的中文问题，但会破坏混合 Query 里已有的英文术语；"
        "混合检索是否补上这一块，见表中 hybrid 列。")

    doc.add_heading("A3.6 页图与 OCR 补全", level=2)
    doc.add_paragraph(
        f"最终运行前已渲染 {images} 张原始课件页图（1600×1200），并为正文稀疏页生成 "
        f"{ocr_files} 个 OCR 文本。页图用于前端原始预览；OCR 文本会进入搜索、问答、自测和 "
        "hybrid 索引。OCR 只补文字，不理解箭头/布局/图形关系，且识别可能有误。")
    if ocr_effect:
        picks = [("baseline", "ALL"), ("hybrid", "ALL"), ("hybrid", "chinese_nl"),
                 ("hybrid", "constraint"), ("llm_assisted", "ALL"),
                 ("translated_lexical", "ALL")]
        rows = []
        for strategy, category in picks:
            item = ocr_effect["groups"].get(f"l2|{strategy}|{category}")
            if not item:
                continue
            rows.append([STRATEGY_LABELS[strategy].split(" ")[0], CATEGORY_LABELS[category],
                         f"{item['meanDelta']:+.3f}", str(item["ci95"]),
                         f"{item['wins']}/{item['ties']}/{item['losses']}", verdict(item)])
        add_table(doc, ["策略", "类别", "Δ nDCG", "95% CI", "胜/平/负", "判读"], rows,
                  widths=[1.4, 1.1, 0.8, 1.7, 0.9, 1.0])
        doc.add_paragraph(
            "正数表示开启 OCR 后同一 Query 的 nDCG 更高。若 CI 跨 0，只能写「未证明差异」；"
            "OCR 对图片型页面的真实收益还需要更大样本和人工核对。")
        doc.add_paragraph(
            "附带旧 20 条固定查询检查：当前含 OCR 环境 16/20 命中；无 OCR 历史记录 18/20，"
            "方向一致，但不是严格同一时点配对。")
    else:
        doc.add_paragraph("本次未生成 OCR 前后对比文件。")
    doc.add_page_break()

    # 4. Hybrid retest
    doc.add_heading("A4. 网络与索引补测", level=1)
    doc.add_heading("A4.1 网络与索引状态", level=2)
    doc.add_paragraph(
        "校园 DNS 对 api.jina.ai / r.jina.ai 返回非 Jina 地址（Meta/Dropbox/Verizon 网段），"
        "IPv4/IPv6 均 TCP 超时，索引 0 页。产品正确返回 503 并提示重试，没有静默回退。")
    add_figure(doc, shots / "screenshots" / "07-hybrid-index-state.png",
               "图 8  hybrid 索引就绪（340 页；legacy 界面）", width=5.6)
    doc.add_heading("A4.2 通过系统代理重试成功", level=2)
    doc.add_paragraph(
        "Windows 系统代理为 127.0.0.1:7890，但自动化 shell 未继承。设置 "
        "HTTPS_PROXY=http://127.0.0.1:7890 后：r.jina.ai 返回 200；api.jina.ai 返回 401"
        "（可达）；首次建索引 {'total': 340, 'updated': 340, 'deleted': 0}，"
        "生成 OCR 后增量更新 {'total': 340, 'updated': 82, 'deleted': 0}。"
        "本轮 hybrid 结果即为真实 Jina API + 真实 proxy 的结果。")
    add_figure(doc, shots / "screenshots" / "10-hybrid-ready.png",
               "图 9  混合检索索引就绪（340 页）", width=5.6)
    add_figure(doc, shots / "screenshots" / "11-hybrid-questions.png",
               "图 10  使用 hybrid 生成的真实决策问题", width=5.6)
    doc.add_paragraph(
        "直连失败时的 503 + 重试行为有日志证据（evidence/hybrid-network.txt）；图 8 是代理路径下的就绪状态，"
        "不是失败状态。hybrid 实践仍出现过一次 502（AI 输出无法识别），重试后成功。")

    # 5. Screenshots
    doc.add_heading("A5. 运行截图", level=1)
    add_figure(doc, shots / "screenshots" / "01-practice-cases.png", "图 11  案例选择")
    add_figure(doc, shots / "screenshots" / "02-case-selected.png", "图 12  选中案例，分析可跳过")
    add_figure(doc, shots / "screenshots" / "03-generated-questions.png", "图 13  真实生成的 3 个决策问题与课程引用")
    add_figure(doc, shots / "screenshots" / "04-answer-feedback.png", "图 14  首次作答、反馈与针对性追问")
    add_figure(doc, shots / "screenshots" / "05-citation-source.png", "图 15  点击引用打开真实课件页")
    add_figure(doc, shots / "screenshots" / "06-legacy-retrieval-selector.png", "图 16  旧版实践的检索策略选择")
    add_figure(doc, shots / "screenshots" / "08-home.png", "图 17  首页续学/续实践")
    add_figure(doc, shots / "screenshots" / "09-api-docs.png", "图 18  后端 OpenAPI 文档")
    doc.add_page_break()

    # 6. Conclusions
    doc.add_heading("A6. 技术结论与建议", level=1)
    hy = paired(stats, "hybrid", "ALL")
    lc = paired(stats, "llm_assisted", "ALL")
    tc = paired(stats, "translated_lexical", "ALL")
    h_cn = paired(stats, "hybrid", "chinese_nl")
    h_con = paired(stats, "hybrid", "constraint")
    lines = [
        f"1) 标准检索的中文短板明确：L2 中文自然语言 "
        f"{agg(results, 'l2', 'baseline', 'chinese_nl')['ndcg@k']:.3f}，"
        f"同一问题手写英文 Query（L1）为 {agg(results, 'l1', 'baseline', 'chinese_nl')['ndcg@k']:.3f}。",
        f"2) 混合检索整体相对 baseline {hy['meanDelta']:+.3f}"
        f"（95% CI {hy['ci95']}，{verdict(hy)}）；中文自然语言 "
        f"{h_cn['meanDelta']:+.3f}（{h_cn['ci95']}，{verdict(h_cn)}）；约束型 "
        f"{h_con['meanDelta']:+.3f}（{h_con['ci95']}，{verdict(h_con)}）。",
        f"3) AI 增强检索整体 {lc['meanDelta']:+.3f}"
        f"（{lc['ci95']}，{verdict(lc)}）；p50 延迟 "
        f"{agg(results, 'l2', 'llm_assisted', 'ALL')['p50ms']:.0f} ms，"
        f"约为 baseline 的 {agg(results, 'l2', 'llm_assisted', 'ALL')['p50ms'] / agg(results, 'l2', 'baseline', 'ALL')['p50ms']:.1f} 倍。",
        f"4) 翻译+词法整体 {tc['meanDelta']:+.3f}"
        f"（{tc['ci95']}，{verdict(tc)}）；它只用于诊断，不能写成已交付功能。",
        "5) 不要用「用了向量检索」代替质量结论：是否改变默认，按本报告的事先规则和 CI 判断。",
        "6) 引用页码真实不等于语义支持；建议补做引用语义抽查与教师 Rubric。",
    ]
    if ocr_effect:
        eb = ocr_effect["groups"].get("l2|baseline|ALL")
        eh = ocr_effect["groups"].get("l2|hybrid|ALL")
        ec = ocr_effect["groups"].get("l2|hybrid|constraint")
        if eb and eh and ec:
            lines.append(
                f"7) OCR 不是免费增益：82 个稀疏页开启 OCR 后，standard {eb['meanDelta']:+.3f}"
                f"（{eb['ci95']}，{verdict(eb)}），hybrid {eh['meanDelta']:+.3f}"
                f"（{eh['ci95']}，{verdict(eh)}），hybrid 约束型 {ec['meanDelta']:+.3f}"
                f"（{ec['ci95']}，{verdict(ec)}）。本夹具没有以图片页为相关页，"
                "OCR 对图片页的收益未被证明，且 OCR 噪声会扰动排序。")
    for line in lines:
        para = doc.add_paragraph(line)
        para.paragraph_format.space_after = Pt(4)
    doc.add_heading("A6.1 建议", level=2)
    add_bullets(doc, [
        "默认仍保持 baseline；是否把 hybrid 设为默认，取决于上表 CI 与延迟门槛，不能只看均值。",
        "如果 hybrid 只在中文/约束型有证据，建议做成「按语言/问法显式推荐」而不是全局默认。",
        "llm_assisted 定位为可选项：它对中文长描述可能有用，但整体未证明且延迟高。",
        "补第二标注者（至少 20% 盲审），并把每类样本扩到 ≥30 条后再下最终架构决策。",
        "OCR 先不要默认开启；如果目标是图片页，先构造 image-only 标注子集，确认 OCR 噪声与收益的边界。",
        "教学评测独立做 27 份答案的双人盲评；本次截图只证明流程可用。",
    ])

    # 7. Limitations
    doc.add_heading("A7. 局限", level=1)
    add_bullets(doc, [
        "每类 9 条、共 36 条；CI 很宽，结论只在本课程/本夹具内成立。",
        "单一标注者，无 κ；概念级标注，未列页面按 0 计。",
        "单模型、单次运行；LLM 规划/翻译有波动（预跑与正式跑回退次数不同）。",
        "hybrid 使用真实 Jina API，但只跑了一次；费用/限额/429 行为未系统测量。",
        "OCR 已生成 82 个稀疏页文本，但本次 OCR 版指标反而下降；OCR 噪声、识别错误和图片页收益仍未充分评估。",
        "L1 的英文 Query 是人工写的，接近上界，不是用户自然输入。",
        "教学评测只有 1 案例 1 决策点冒烟，不是 27 份答案的双人盲评。",
    ])
    doc.add_heading("A8. 复现", level=1)
    add_table(doc, ["步骤", "命令"], [
        ["页图", "powershell -NoProfile -STA -File scripts/render-slides.ps1"],
        ["OCR（Python 3.12 venv）", "python scripts/ocr-slides.py（默认仅稀疏页）"],
        ["建索引（需代理）", "HTTPS_PROXY=http://127.0.0.1:7890 python -m server.retrieval_index"],
        ["跑评测", "HTTPS_PROXY=... python scripts/evaluate_strategies.py --levels l1,l2 "
                  "--strategies baseline,llm_assisted,hybrid,translated_lexical"],
        ["统计/图表", "python scripts/eval_stats.py；python scripts/render_eval_charts.py"],
        ["截图", "node scripts/capture-evaluation-screenshots.mjs"],
    ], widths=[1.5, 5.0])
    doc.add_paragraph("完整方法、逐条结果与负面样本见 docs/evaluation/README.md、"
                      "results/retrieval-run-with-ocr.json、results/stats-with-ocr.json、results/ocr-effect.json。")

    out_path.parent.mkdir(parents=True, exist_ok=True)
    doc.save(str(out_path))
    print(out_path)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--results", type=Path,
                        default=ROOT / "data/evaluation/retrieval-run-with-ocr.json")
    parser.add_argument("--stats", type=Path,
                        default=ROOT / "docs/evaluation/results/stats-with-ocr.json")
    parser.add_argument("--shots", type=Path, default=ROOT / "docs/evaluation")
    parser.add_argument("--ocr-effect", type=Path,
                        default=ROOT / "docs/evaluation/results/ocr-effect.json")
    parser.add_argument("--out", type=Path,
                        default=ROOT / "docs/evaluation/MAGA_检索评测报告_通俗版_2026-11-27.docx")
    args = parser.parse_args()
    results = json.loads(args.results.read_text(encoding="utf-8"))
    stats = json.loads(args.stats.read_text(encoding="utf-8"))
    ocr_effect = (json.loads(args.ocr_effect.read_text(encoding="utf-8"))
                  if args.ocr_effect.exists() else None)
    build(results, stats, args.out, args.shots, ocr_effect)


if __name__ == "__main__":
    main()
