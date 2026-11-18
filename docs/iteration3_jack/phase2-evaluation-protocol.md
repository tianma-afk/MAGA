# 自然需求来源评估 v1：执行前规则与审核入口

> 更新：开发集已完成一轮Codex代审，知识粒度与必要性修正见 [复核记录](phase2-baseline-review.md)。后续开发使用v3复核标注，v1/v2保留；保留集粒度尚待统一，不能将旧汇总直接当最终验收。

日期：2026-11-15。任务边界见 [Phase 1 定义](phase1-task-definition.md)。这是离线证据供给评估，不评价模型生成；未修改生产查询、排序、Prompt或原20条术语集。

## 样本与冻结

[新样本](../fixtures/iteration3-design-needs.json) 16条：开发 N01–N12，保留 N13–N16。开发含可用性3条、恢复1条、性能3条、可修改性2条、安全概述1条、互操作性1条，以及超出资料的安全证明1条；N01/N02为同场景自然表述/显式术语变体，不是独立用户样本。保留集覆盖不同场景与属性，包含1条歧义样本。N12、N16不评分，其余14条仅作待人工审核的诊断评分。

所有预期知识与替代页在运行前依据实际PPT正文整理；`topics`保存页集合和依据。它们由Codex初标，不冒充人工金标准；安全仅能评价第2章5页概述，不推断存在安全专章或密码算法支持。

v1固定K=8，与实际 `_sources` 预算一致；query为请求三个字段按空格拼接，再沿用生产空白规范与2000字符截断。只评初始场景阶段，不用模拟生成的属性当作真实后续阶段输入。

保留集是流程隔离，不是加密隐藏：完整样本在仓库可读，结果独立保存为 `holdout.json`；只查看其汇总，不查看逐条失败、不做术语对照或贡献分解。未来开发仅查看开发集；如读取保留失败并用于调试，必须披露污染并补充新保留案例。Codex为建集已接触题目，不宣称第三方双盲。

基线保存fixture、生产源码、PPT与OCR的SHA-256、commit和命令。冻结的是样本、规则与此次语料快照，不是禁止纠正错误；人工修改标注需升版本、记录理由，保留旧结果并对新旧实现使用同版重算，不按排名挑页凑分。

## 评分定义

1. **direct**：命中该例预先定义的知识替代页，且有正文、备注或OCR可用依据。多个替代页只覆盖同一知识点一次。
2. **background**：经显式审核，仅背景相关，不能覆盖关键知识。
3. **irrelevant**：经显式审核确认为与任务无关；不能仅因不在预期页表就判无关。
4. **unusable**：只有标题/页脚，缺少可供模型使用的正文、备注、OCR。仍可追溯但不能覆盖知识；不代表原稿图片没有内容。
5. **unjudged**：未完成相关性判定；既不当相关，也不当无关。

初版采用保守部分标注，未穷举全课程与每例所有合理关联；没有显式无关标注时，confirmedIrrelevant=0仅是下界，不代表没有无关页面。新增返回页默认待审核，不能据此宣称失败或优势。

**标注修正记录：** v1运行后补查开发返回页OCR，确认原标注漏了真实有效证据（第5章26页冗余恢复、第7章21页可修改性场景、第8章9页性能场景等）。因此新增 [v2样本](../fixtures/iteration3-design-needs-v2.json)，保留v1；修正的是证据覆盖遗漏，不改需求、K、split、匹配算法、评分公式或历史输出。同时给N01第1章5页“考试与成绩”作显式无关标注。v2仅重新评分已保存来源，耗时仍为原测量，不声称性能复测。保留集未查看逐条输出；知识表统一修正同样作用于保留集汇总。两版都保留，不能把v1→v2数字变化作为产品改进。v2为后续人工审核入口。

- `directPrecisionLowerBoundAt8` = 已确认direct数量/8。缺少返回的槽位仍计入分母；这是精确率下界，不是完整Precision@8。
- `knowledgeCoverageAt8` = 至少有一个可用direct页的预期知识点数/预期知识点数。替代页不重复计数；当前performance/modifiability等有较粗粒度定义，未逐项评价所有适用战术，人工需审核粒度。
- 分别记录unjudged、unusable、已确认无关来源数量；不把待审数换算成无关数。
- `traceability` = 实际章节页码、页标题一致数/返回数；无返回记null，不算100%。只证明定位，不证明语义支持。
- 各split对可评分案例宏平均，每例等权；不同知识点数不会额外加权。未评分样本不进质量宏平均，仍保存输出和成本。整体返回有效性可从逐例结果复算，开发和保留汇总分开，不将holdout结果用于调优。

正式相关性等级与无关率结论需人工审核；当前不把下界当准确率，不承诺提升百分比。知识表中未列出的合理来源和争议页应补充依据，而非强行评分。

## 执行与性能口径

使用已有conda `maga`，无需服务、密钥或网络：

```powershell
$env:PYTHON_DOTENV_DISABLED='1'
python scripts/evaluate-design-needs.py --repo . --cases docs/fixtures/iteration3-design-needs.json --output data/verification/iteration3-design-needs-baseline-v1 --repeats 3
python -m pytest scripts/test_evaluate_design_needs.py -q
node scripts/check-file-lengths.mjs
```

重现v2标注修正（新目录不得已存在）：

```powershell
python scripts/evaluate-design-needs.py --cases docs/fixtures/iteration3-design-needs-v2.json --output data/verification/iteration3-design-needs-baseline-v2 --regrade-from data/verification/iteration3-design-needs-baseline-v1
```

从干净机器直接重跑v2时，改用v2的 `--cases`、新的 `--output` 并省略 `--regrade-from`；它将执行生产检索并测新耗时。比较前须核对语料和源码签名。重评分模式只用于既有输入的标注复核，不能作为新实现的检索评测。

输出目录必须不存在，防止覆盖。脚本独立导入现有 `design._sources` 和 `search_all`；旧脚本仅支持Top-5期望页命中及Git历史对照，不能给出实践Top-8、上下文成本和多知识点覆盖，因此保留旧入口，新增小型评估入口，未引入框架。

先记录一次全课件冷加载，再每例执行3次真实 `_sources`，报告预热后中位数与每次值。缓存仅PPT解析，OCR读取、遍历、排序、摘录仍在计时内。诊断用完整候选排序和术语对照不进入计时。运行顺序固定、非并行，只有一次进程；不能解释为生产P95或稳定服务承诺。

上下文成本是 `sources` 序列化后的Unicode字符数（不是字节或token），另保存各页摘录字符；不含system prompt、用户字段、HTTP开销。零外部模型调用，不能估算真实模型费用。后续若候选方案使用外部模型，应单独记录调用数、实际延迟及可测费用。

结果目录中 `summary.json` 含环境与签名，`dev.json`含查询、所有正分候选、排名、命中词贡献、期望页排名、最终来源和术语对照；`holdout.json`仅留逐例必要结果，不在开发报告展示详情。结果被Git忽略，提交摘要见 [分析文档](phase2-analysis.md)。

评估脚本3项测试覆盖缺失槽位、未审页不混作无关、替代页不重复覆盖、无内容页不覆盖、无输出不声称完美溯源；它们验证评分边界，不验证教学效果。
