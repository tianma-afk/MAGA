"""Plain-language front matter for the Word evaluation report."""

from docx.shared import Pt


def _query_value(results, query_id, strategy):
    for row in results["rows"]:
        if (row["level"] == "l2" and row["id"] == query_id
                and row["strategy"] == strategy):
            return row["metrics"]["ndcg@k"]
    return 0.0


def build_plain_intro(doc, results, stats, add_table, add_bullets, agg, paired,
                      verdict, ocr_effect=None):
    b = agg(results, "l2", "baseline", "ALL")
    h = agg(results, "l2", "hybrid", "ALL")
    l = agg(results, "l2", "llm_assisted", "ALL")
    t = agg(results, "l2", "translated_lexical", "ALL")
    b_zh = agg(results, "l2", "baseline", "chinese_nl")
    h_zh = agg(results, "l2", "hybrid", "chinese_nl")
    t_zh = agg(results, "l2", "translated_lexical", "chinese_nl")
    hp = paired(stats, "hybrid", "ALL")
    lp = paired(stats, "llm_assisted", "ALL")
    ratio = l["p50ms"] / b["p50ms"]
    fb = l["fallbacks"]

    doc.add_heading("0. 先看 5 句话", level=1)
    add_bullets(doc, [
        f"混合检索最好：36 道题平均排序分 {h['ndcg@k']:.3f}，标准检索 {b['ndcg@k']:.3f}；"
        f"中文题 {h_zh['ndcg@k']:.3f} vs {b_zh['ndcg@k']:.3f}。",
        f"“先翻译再搜”有用但不够：只翻译的中文题 {t_zh['ndcg@k']:.3f}，"
        f"完整 hybrid {h_zh['ndcg@k']:.3f}。",
        f"“AI 增强检索”不值得默认：总体 {lp['meanDelta']:+.3f}，慢约 {ratio:.0f} 倍，"
        f"还有 {fb}/36 次退回普通搜索。",
        "OCR 不是免费加分：给 82 个稀疏页加 OCR 后，标准检索反而下降；"
        "OCR 会把 logo、页码、图注也读进来，干扰排序。",
        f"hybrid 很慢：95% 的请求约 {h['p95ms']/1000:.1f} 秒，"
        f"标准检索约 {b['p95ms']/1000:.2f} 秒。适合“中文长问题、愿意等”，不适合直接做全局默认。",
    ])

    doc.add_heading("1. 三种检索方案：一个真实问题看懂", level=1)
    doc.add_paragraph(
        "假设学生问：“热门活动三千人同时报名，怎么保证名额不超卖？”"
        "课程 PPT 是英文的，相关页在讲并发、事务、唯一约束。系统要从 340 页里挑 8 页给 AI，"
        "三种方案的区别就是“怎么挑”。")
    add_table(doc, ["方案", "一句话", "约束型平均分", "典型耗时"], [
        ["标准检索 baseline", "按字面关键词找", f"{agg(results, 'l2', 'baseline', 'constraint')['ndcg@k']:.3f}", "0.14 s"],
        ["AI 增强 llm_assisted", "先让 AI 列几个关键词，再按字面找", f"{agg(results, 'l2', 'llm_assisted', 'constraint')['ndcg@k']:.3f}", "3.0 s"],
        ["翻译+词法（消融）", "先把中文翻成英文，再按字面找", f"{agg(results, 'l2', 'translated_lexical', 'constraint')['ndcg@k']:.3f}", "1.5 s"],
        ["混合检索 hybrid", "翻成英文后，既看关键词，也看“意思像不像”", f"{agg(results, 'l2', 'hybrid', 'constraint')['ndcg@k']:.3f}", "2.6 s"],
    ], widths=[1.7, 3.2, 1.0, 0.8])
    doc.add_paragraph(
        "生活化类比：baseline 像按书名关键词找书；llm_assisted 像先让助手写几个关键词再找；"
        "翻译+词法 像先把问题翻成英文再找；hybrid 像翻成英文后，既看关键词，也看哪一页在讲同一个意思。")

    doc.add_heading("2. 同一个问题，实际分数差多少", level=1)
    doc.add_paragraph("下面是单条 Query 的 nDCG@8（0–1，越高越好），不是平均值：")
    cases = ["heartbeat-zh", "recovery-constraint", "coupling-constraint",
             "service-discovery-mixed"]
    rows = []
    for case_id in cases:
        rows.append([case_id] + [f"{_query_value(results, case_id, s):.3f}"
                                 for s in ("baseline", "llm_assisted", "hybrid",
                                           "translated_lexical")])
    add_table(doc, ["Query", "baseline", "AI 增强", "hybrid", "翻译+词法"], rows,
              widths=[2.4, 0.9, 0.9, 0.9, 0.9])
    doc.add_paragraph(
        "例如 `heartbeat-zh` 问“怎么检测一个服务是不是还活着”，中文口语里没有“心跳”二字；"
        "标准检索和 AI 增强都是 0，翻译+词法 0.263，hybrid 0.884。"
        "`coupling-constraint` 则说明翻译会丢术语，而 hybrid 的向量语义能把意思补回来。")

    doc.add_heading("3. 数据集为什么这样设计", level=1)
    doc.add_paragraph(
        "选了课程里 9 个核心概念，每个概念问 4 遍：英文术语、中文自然语言、中英混合、约束型场景，"
        "一共 36 条。以 heartbeat 为例：")
    add_table(doc, ["问法", "实际 Query", "想测什么"], [
        ["英文术语", "heartbeat", "只给术语，能不能找到定义页"],
        ["中文自然语言", "怎么检测一个服务是不是还活着", "不会说术语时还能不能找到"],
        ["中英混合", "服务存活检测 heartbeat 周期性消息", "半懂不懂、中英夹杂的真实问法"],
        ["约束型", "监控进程每隔几秒发消息，超时判故障，这属于什么战术", "只描述场景，不出现“心跳”"],
    ], widths=[1.1, 3.6, 2.0])
    add_bullets(doc, [
        "只测英文术语会高估 baseline，因为 baseline 就认这个词；只测中文会只看到 hybrid 的优势。",
        "同一概念的 4 种问法共用一组人工标注的“标准答案页”，这样才能测“换一种说法会不会失效”。",
        "相关度 2=直接定义/解释，1=例子/场景/总结/密切相关战术，没圈到的页按 0 计。",
        "本轮只有一位标注者，没有第二人盲审，也没有 κ；36 条、每类 9 条，区间会很宽，"
        "所以所有“更好/更差”都带 95% CI，跨 0 就写“未证明”。",
    ])

    doc.add_heading("4. 参数小抄", level=1)
    add_table(doc, ["名词", "人话解释", "怎么读"], [
        ["nDCG@8", "排序质量分，0–1，越高越好；只看前 8 个来源", "必看页排得越靠前分越高；不是“准确率”"],
        ["Recall@5", "前 5 个结果覆盖了多少必看页", "标准答案 4 页、前 5 找到 2 页 = 0.5"],
        ["MRR", "第一个正确页排第几的倒数", "第 1 名=1，第 2 名=0.5，第 5 名=0.2"],
        ["Hit@5", "前 5 个里有没有至少一个正确页", "有=1，没有=0"],
        ["p50 / p95", "一半 / 95% 请求的等待时间", "越小越快；p95 代表慢的时候"],
        ["95% CI", "换一批类似题，分数可能波动的范围", "跨 0 = 不能确定谁更好"],
        ["fallback", "AI 查询规划失败，退回普通关键词搜索", "回退越多，AI 增强越不稳定"],
        ["L1 / L2", "L1=同一道英文题只换检索器；L2=真实中文提问", "L1 看算法，L2 看真实使用"],
        ["K=8 / 10", "只看前 8 / 前 10 个来源", "应用最多喂 8 页；L1 用 10 页做诊断"],
        ["OCR", "把图片里的文字识别出来", "只补文字，不理解图；噪声会干扰搜索"],
    ], widths=[1.1, 2.7, 2.6])

    doc.add_heading("5. 图表怎么读", level=1)
    add_bullets(doc, [
        "读图三步：先看横轴（英文/中文/混合/约束型/全部），再看纵轴（nDCG 0–1 越高越好；延迟毫秒越低越好），"
        "最后看颜色（同一颜色=同一方案）。",
        "L1 图：同一批英文问题，只换检索器；柱子越高=越常把相关页排进前 10。",
        "L2 图：真实使用；柱子越高=前 8 个来源里越常出现相关课件页。",
        "差值图：柱子高于 0=比标准检索好，低于 0=更差；中文/约束型明显高于 0，英文接近 0。",
        "延迟图：越矮越快；它和质量不是一回事；hybrid 约 2.6 s，baseline 约 0.14 s。",
        "翻译消融图：只翻译 vs 完整 hybrid；翻译把中文从 0.025 提到 0.189，hybrid 再提到 0.428。",
        "OCR 表：数值是“开 OCR 后 − 开 OCR 前”；负数=开 OCR 后更差。",
    ])

    doc.add_heading("6. 结果说明什么", level=1)
    ocr_base = (ocr_effect or {}).get("groups", {}).get("l2|baseline|ALL")
    ocr_hyb_con = (ocr_effect or {}).get("groups", {}).get("l2|hybrid|constraint")
    lines = [
        f"1) hybrid 在中文和约束型上明显更好：中文 {b_zh['ndcg@k']:.3f}→{h_zh['ndcg@k']:.3f}，"
        f"约束型 {agg(results, 'l2', 'baseline', 'constraint')['ndcg@k']:.3f}→"
        f"{agg(results, 'l2', 'hybrid', 'constraint')['ndcg@k']:.3f}。",
        f"2) 翻译是必要一步但不是全部：只翻译中文 {t_zh['ndcg@k']:.3f}，完整 hybrid {h_zh['ndcg@k']:.3f}。",
        f"3) AI 增强不值得默认：总体 {lp['meanDelta']:+.3f}（CI {lp['ci95']}），"
        f"慢约 {ratio:.0f} 倍，回退 {fb}/36。",
        "4) OCR 不是免费加分：它会把 logo、页码、图注读进来，干扰关键词排序；"
        "本夹具没有图片页标准答案，OCR 对图片页的收益未被证明。"
        + (f" 标准检索 {ocr_base['meanDelta']:+.3f}，hybrid 约束型 {ocr_hyb_con['meanDelta']:+.3f}。"
           if ocr_base and ocr_hyb_con else ""),
        f"5) 质量提升用时间换：hybrid p95 {h['p95ms']:.0f} ms，baseline {b['p95ms']:.0f} ms；"
        "建议默认 baseline，中文/约束型显式推荐 hybrid。",
    ]
    for line in lines:
        para = doc.add_paragraph(line)
        para.paragraph_format.space_after = Pt(4)

    add_table(doc, ["这次能说明", "这次不能说明"], [
        ["本课程 36 条题、本模型版本下 hybrid 排序明显更好", "不能说明 hybrid 在所有课程/模型都更好"],
        ["中文自然语言/约束型是 baseline 的主要短板", "不能说明“中文一定比英文难”"],
        ["llm_assisted 没有稳定收益且明显更慢", "不能说明所有 AI 改写查询都没用"],
        ["OCR 在这套文本题上拉低了指标", "不能说明 OCR 对图片页没用"],
        ["延迟/回退/失败路径可量化、可复现", "不能说明生产 SLA、并发和费用"],
    ], widths=[3.2, 3.2])

    doc.add_heading("7. 一场架构实践到底检索几次 PPT", level=1)
    doc.add_paragraph(
        "核心流程：选案例/选策略 → 检索 PPT 出 3 个决策问题 → 学生答 → 再检索 PPT 评价并追问 → "
        "再答/再追问 → 3 个决策都完成后 → 再检索 PPT 做综合评审。")
    add_table(doc, ["阶段", "做了什么", "检索 PPT？", "产出"], [
        ["选案例/选策略", "锁定 baseline / llm_assisted / hybrid", "否", "整场不换策略"],
        ["出题 plan", "LLM 写 1–3 条 Query → 检索 → 前 8 页 → 出题", "是，1 次", "3 个问题 + 引用"],
        ["首次回答 answer", "按回答再写 Query → 检索 → 评价 + 决定是否追问", "是，1 次/轮", "反馈 + 可能追问"],
        ["追问回答", "带前几轮对话再检索", "是，1 次/轮", "反馈 + 最多 2 次追问"],
        ["第 2、3 题", "重复首次回答/追问", "每个决策 1–3 次", "逐点完成"],
        ["综合评审 finalize", "汇总 3 个决策 → 再检索 → 总结", "是，1 次", "总结 + 参考思路"],
    ], widths=[1.2, 2.8, 0.8, 1.8])
    doc.add_paragraph(
        "关键点：评价和追问是同一次检索、同一次 LLM 调用完成的；“3 个问题”是同一次出题检索生成的；"
        "综合评审会重新检索；索引构建不算在流程里（选 hybrid 时建一次 340 页，之后只增量更新）。")
    add_table(doc, ["情况", "回答轮数 A", "RAG 阶段数 A+2"], [
        ["每个决策一次答完", "3", "5 次"],
        ["每个决策各追问 1 次（最常见）", "6", "8 次"],
        ["每个决策追问满 2 次", "9", "11 次"],
    ], widths=[3.2, 1.3, 1.6])
    doc.add_paragraph(
        "每次 RAG 阶段内部按策略发 1–3 条 Query：baseline 只用第 1 条（整场 5–11 次底层检索）；"
        "llm_assisted / hybrid 用全部 Query（整场 5–33 次）。hybrid 的 Jina 查询向量次数与 Query 数相同。")

    doc.add_heading("8. 三种检索方案什么时候用", level=1)
    add_table(doc, ["方案", "最适合", "不适合"], [
        ["baseline", "英文术语、课件原词、已带英文关键词的中英混合；要快/要稳/无 Jina Key",
         "中文口语、只描述场景不出现术语"],
        ["llm_assisted", "理论上适合长需求、多角度拆词；实测没有证明更好",
         "日常默认、延迟敏感、追求稳定"],
        ["hybrid", "中文自然语言、约束型、同义改写、跨语言、中英混合",
         "只问英文术语、无 Key/索引未就绪、不能等 2–4 秒"],
    ], widths=[1.3, 3.0, 2.3])
    add_bullets(doc, [
        "问 heartbeat / tactic / coupling and cohesion → baseline；英文术语它已经很好。",
        "问“怎么检测一个服务是不是还活着” → hybrid；baseline 0.000，hybrid 0.884。",
        "问“报名成功、候补、通知的职责边界” → hybrid；约束型关键词对不上英文课件。",
        "没有 Jina Key、索引没建、演示不能等 → baseline，0.14 秒出结果。",
        "翻译+词法只是评测消融，不是 UI 里的第四个选项。",
    ])

    doc.add_heading("9. 我们凭什么说谁更好", level=1)
    doc.add_paragraph(
        "每题先人工标相关页：2=直接定义/解释，1=例子/场景/总结/密切相关战术，0=没标注。"
        "nDCG@8 同时奖励“找到”和“排得靠前”：grade 2 折算 3 分，grade 1 折算 1 分；"
        "第 1 名权重 1，第 2 名 0.63，第 8 名 0.315；最后除以理想排序分，压到 0–1。")
    add_table(doc, ["检索结果（标准答案 A=2, B=1）", "nDCG@8", "说明"], [
        ["A 第 1、B 第 2", "1.000", "完美"],
        ["B 第 1、A 第 2", "0.797", "顺序反了，扣分"],
        ["A 第 8、B 没进前 8", "0.261", "找到了但太靠后"],
        ["两页都没进前 8", "0.000", "没找到"],
    ], widths=[3.2, 1.0, 2.2])
    doc.add_paragraph(
        "36 条题用同题差值比较：hybrid − baseline 平均 +0.290，95% bootstrap CI [0.195, 0.394]，"
        "胜/平/负 31/1/4。不是只看平均分，还看换一批类似题是否大概率仍为正。")
    add_table(doc, ["判定门", "规则", "为什么"], [
        ["质量够大", "目标类别 nDCG 绝对提升 ≥ 0.05", "太小可能只是噪声"],
        ["CI 不跨 0", "95% CI 整体 >0 或 <0", "跨 0 就写“未证明差异”"],
        ["延迟可接受", "p95 不超过 baseline 的 2 倍", "质量再好也不能默认等 20 倍"],
    ], widths=[1.4, 2.6, 2.5])
    add_table(doc, ["对比", "Δ", "95% CI", "延迟门", "判定"], [
        ["hybrid − baseline", "+0.290", "[0.195, 0.394]", "否（约 22×）", "质量更好，不做全局默认"],
        ["llm_assisted − baseline", "−0.004", "[−0.038, 0.026]", "否（约 21×）", "未证明更好"],
        ["翻译+词法 − baseline", "+0.092", "[0.035, 0.157]", "否（约 13×）", "有提升，但只是消融"],
        ["hybrid − 翻译+词法", "+0.198", "[0.114, 0.293]", "—", "嵌入有独立增量"],
        ["OCR 后 baseline", "−0.064", "[−0.110, −0.029]", "—", "有证据更差"],
        ["OCR 后 hybrid 总体", "−0.045", "[−0.107, 0.019]", "—", "未证明差异"],
        ["OCR 后 hybrid 约束型", "−0.108", "[−0.191, −0.011]", "—", "有证据更差"],
    ], widths=[1.4, 0.8, 1.7, 1.4, 1.4])
    doc.add_paragraph(
        "这套规则评的是检索排序，不是 AI 生成的问题好不好、反馈有没有教学价值；"
        "36 条、每类 9 条，样本小，必须看 CI；只有一个标注者；引用页码真实不等于语义支持。")

    doc.add_heading("10. 给产品的建议", level=1)
    add_bullets(doc, [
        "默认保持 baseline：最快、最稳、英文术语题不差。",
        "hybrid 做成显式高质量选项：中文长描述/约束型问题推荐使用，并提示延迟。",
        "llm_assisted 不设为默认，保留为对照/研究模式。",
        "OCR 先不默认开启；先补 image-only 标注子集，确认噪声与收益的边界。",
        "补第二标注者（至少 20% 盲审），每类扩到 ≥30 条后再做最终架构决策。",
        "教学评测独立做 27 份答案的双人盲评；本次截图只证明流程可用。",
    ])
