# P3T1：统一实验基础设施与共同基点交接

日期：2026-11-16。用户本次明确授权公共代码、测试、开发集核对、精确提交、三分支/worktree创建及OCR独立副本；未授权本任务调用真实模型或实现A/B/C优化。

## 1. 基点和提交顺序

- MATERIAL_BASE：`2c4c834341d9d8319a0822760b6c19df415555f1`。
- EXPERIMENT_BASE：**待公共验证完成后提交填入**；三个分支将继承此提交，而不是后续记录hash的文档提交。
- 后续文档提交：待记录。主仓库始终在`iteration/jack`，不推远端。

## 2. 公共实现（无候选优化）

| 文件 | 内容 |
| --- | --- |
| [design_source_contracts.py](../../server/design_source_contracts.py) | 内部Source、SourceDiagnostics、SourceSelection严格模型；不strip摘录空白，不改变对外模型 |
| [design_sources.py](../../server/design_sources.py) | legacy_sources等价迁移；三阶段build_query；异步select_sources；仓储/内容/去重/预算校验 |
| [design.py](../../server/design.py) | 保留_sources兼容委托；三个实践生成阶段在配置require后调用统一来源入口，原Prompt/HTTP调用/输出引用校验不变 |
| [run-design-experiment.py](../../scripts/run-design-experiment.py) | 默认仅开发集、统一来源调用、原评分函数复用、逐次结果/错误/回退与环境签名；原脚本不修改 |
| [适配测试](../../server/tests/test_design_sources.py)、[运行器测试](../../scripts/test_run_design_experiment.py) | 原提交函数等价、三阶段、空/异常/取消、伪来源/预算、输出隔离、保留显式门禁和失败脱敏 |

统一调用：`await select_sources(store, request, stage='scenarios'|'tactics'|'review', transport=None)`。request使用现有各阶段模型，tactics无需title；返回SourceSelection.sources供原AI上下文，diagnostics不进前端。当前mode=baseline、llm_calls=0，transport不用；不是已实现B规划。

输入类型/阶段不匹配明确报错；真实生成缺配置仍503，无来源422，最终生成结构/上游错误仍502。取消不转fallback。原_sources仍可被历史脚本调用。来源有重复、超过8或与仓储内容不符时拒绝，不悄悄修正；记录空结果不等于成功生成教学。

没有修改search、retrieval_terms、chapters、tutor、公开models、路由、前端、Prompt、原评测/评分或fixture。没有需求扩展、LLM规划、宽候选重排；公共代码不从评估答案生成生产规则。

## 3. 验证与证据

- 全后端+原评分测试+新运行器测试：**197 passed**，1条既有Starlette/httpx弃用警告。
- 500行检查器自身测试：2项通过；100个手写文件，无超限；git diff --check通过。
- 首轮真实开发集12例×3次：36次无错误，与`git show 2c4c834:server/design.py`中的原_sources逐次完整dict比较一致，含顺序、页号、标题和excerpt。测试另覆盖空结果、三阶段和异常；未改原有测试断言。
- 最终冻结代码重跑：`data/verification/p3t1-common-baseline-final/`，12开发例×3次，36次success、0 error、0外部调用；全部与原提交完整来源一致，12例逐项质量指标与既有v3结果一致。warm中位数的案例宏平均5621.43ms、sources平均4737.82字符，记录额外校验成本，不当作检索优化收益。最终代码签名已核对。中间开发记录位于`p3t1-common-baseline/`，不作为最终源码签名记录。
- 资源：原89项manifest（7个PPT+82个OCR）全部hash一致，fixture v3签名一致。未读取holdout逐例结果，未运行holdout，未调用真实模型。

开发评分沿v3复核：覆盖50%，Precision@8下界11.36%，不是完整准确率；必要来源未审和保留粒度不一致的限制仍在。新的公共适配增加真实来源检查，运行器也独立校验；总wall包含这些成本，不能直接用旧_sources计时宣称性能改善。冷加载和每次暖测保存在summary/dev JSON，非生产性能承诺。

运行器错误行保留失败类别但不序列化上游异常原文；未知调用计数为null并计未知行，不把异常当0费用。SourceDiagnostics预留model_id、prompt_version、usage、cost及分段计时；本次均无真实规划值。后续B实现需要填实际诊断，不能由框架猜测费用。

## 4. 使用命令

从所属worktree根目录、现成conda maga运行；不要使用系统默认Python。配置dotenv禁用只作用当前进程，不覆盖.env。

```powershell
$env:PYTHON_DOTENV_DISABLED='1'
python -m pytest server/tests scripts/test_evaluate_design_needs.py scripts/test_run_design_experiment.py -q --basetemp <全新临时目录>
python scripts/run-design-experiment.py --output data/verification/<全新run-id> --variant baseline --repeats 3 --compare-material 2c4c834
```

`--compare-material`只用于当前基线，候选优化实现后不应再要求与旧来源完全一致。`--variant a|b|c`是结果方案标识，不是生产策略开关；运行器加载该worktree中的统一入口，尚未实现方案时诊断仍baseline，不能仅改标识就称已实现候选。

默认split=dev；保留需要同时显式`--split holdout --allow-holdout`，仅在未来正式获准且口径冻结后使用。`--case-id N10 --repeats 1`可做独立环境冒烟，不能当完整评估。输出目录已存在就拒绝，不能覆盖历史。新结果复用旧scoring.metrics/aggregate，规则签名和fixture/生产源码/语料manifest入summary；无自动调用最终生成。

## 5. 三个实验目录（创建验证后填实况）

| 方案 | 分支 | 相对主目录路径 | HEAD/状态 |
| --- | --- | --- | --- |
| A | experiment/iteration3-a | ../MAGA-exp-a | 待创建/核验 |
| B | experiment/iteration3-b | ../MAGA-exp-b | 待创建/核验 |
| C | experiment/iteration3-c | ../MAGA-exp-c | 待创建/核验 |

PPT随Git检出；OCR复制到各自data/ocr，不入Git；纯来源实验不复制70MB页图，因此imageUrl展示可与主目录不同，不影响检索来源/摘录。三个独立输出目录位于各自data/verification，Python解释器共用只读maga，不并发改依赖。

## 6. P3T2边界与限制

各分支遵守 [开发契约](phase2-implementation-contract.md)：A只做确定性词法；B只做LLM规划+基点检索+有界合并；C只做宽候选与任务重排。对外API/最终生成/共享默认检索/标注不变。未来分支只改来源策略与专属测试，公共运行器不按方案私自改评分。

本次不选择获胜方案。B真实模型、token/费用预算和Prompt仍待具体确认；公共准备成功不构成真实LLM调用授权。保留集细粒度统一、完整相关性标注和独立人工验证仍待最终比较前处理。只验证后端/来源实验能力，不声称每个worktree已配置前端依赖、页图、真实模型或完整浏览器联调。
