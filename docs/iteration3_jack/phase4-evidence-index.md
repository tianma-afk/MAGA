# P4T1：素材审计与架构证据索引

审计日期：2026-11-17。现场基线：`iteration/jack` / `f58b6c9caa88a24643886f1fc4e1f1e26e4e20c3`，开始时工作区干净。
当前事实：**Phase 3 已完成；最终 Gate PASS（人工裁定与复验后）；ADR Accepted；Baseline 默认＋原始 B 显式可选。**

P4T2增补（2026-11-17）：[架构设计与视图](./phase4-architecture-design-and-views.md)已整理6个Drivers、6个六要素QAS、Module/C&C及机制映射；该阶段仅文档静态核对，不增加运行证据，当时正式文档导航为原34份＋主文档1份。

P4T3增补（2026-11-17）：[回顾性ATAM与决策复盘](./phase4-atam-and-decision-review.md)已复用D1–D6/QAS-01–06，核对四组实验/验收原始指标，整理6个敏感点、5个Tradeoff、8项风险/4项限定Non-risk/4个Risk Themes和最终ADR依据。它是回顾性归纳，不是历史正式workshop；当前导航为P4T1原34份＋P4T2/P4T3各1份。

## 1. 用途、范围与阅读规则

这是P4T2–P4T5共用的证据入口，不是最终报告、PPT或新一轮研究。定向盘点 **34份文档**：本目录已有P1–P3文档24份、实验Worktree独有原型说明5份、背景/交接文档5份；另核对7份自然需求fixture的结构与样本数、关键源码/测试入口、Git历史及本地原始结果摘要。计数不包含本文，不把同一文件重复链接算作新增材料。

本次执行的是文件/内容/链接/Git/机器结果的只读审计；下面测试、模型和Chrome数字均来自已存在的明确运行记录，**本轮没有重新测试产品、调用模型或重跑实验**。

证据使用顺序：当前行为看源码；最终决策看[Accepted ADR](./phase3-final-architecture-decision.md)；最终验收看[验收报告第11节](./phase3-final-acceptance.md)；历史实验看各自冻结协议及原结果。不能用旧Proposed、待验收或阶段建议覆盖后来的人工决定。

表中“可证明”均有边界：文件存在/静态符合≠运行通过；Mock通过≠真实模型成功；真实单次成功≠总体可靠性；来源真实≠结论语义充分。
路径相对本文目录。标为“本地证据”的data文件被忽略，不随clone；标为“Worktree”的链接依赖同级实验目录，移机使用第4节Git命令取回，不当成主线文件。

## 2. 核心必读材料（原11份＋P4T2/P4T3主说明）

|阅读主题|核心入口|优先提取|
|---|---|---|
|质量权衡与决策复盘（P4T3）|[回顾性ATAM与决策复盘](./phase4-atam-and-decision-review.md)|候选/最终集成分层、同批原始指标、敏感点置信度、Tradeoff、Risk Themes及B2复盘|
|理论表达与架构视图（P4T2）|[架构设计与视图](./phase4-architecture-design-and-views.md)|Drivers/约束、6个QAS、实际文件与运行时边界、战术代价；区分I/M/E|
|Problem & Requirements|[任务定义](./phase1-task-definition.md)、[根因与候选分析](./phase2-analysis.md)|唯一主任务、召回不足与Top8截断两种机制；Drivers/QAS草稿|
|Architecture Design|[实施契约](./phase2-implementation-contract.md)|共同接口、机制隔离、依赖与预算、来源校验要求|
|Architecture Experiments|[正式协议](./phase3-evaluation-protocol.md)、[统一结果](./phase3-evaluation-results.md)|公平条件、v4口径、成对升降及延迟边界|
|后续探索及反证|[B-v2实验](./phase3-b-v2-experiment.md)、[Coverage实验](./phase3-b-coverage-experiment.md)|Prompt敏感性、固定候选对照、退化和代理指标上限|
|Architecture Decisions|[P3T3权衡](./phase3-architecture-tradeoffs.md)、[最终ADR](./phase3-final-architecture-decision.md)|从阶段建议到人工双策略决策；不全面替换的理由|
|Implementation & Evolution|[双策略集成](./phase3-dual-strategy-integration.md)|最终Module/C&C图、API与选择性移植|
|Validation & Acceptance|[最终验收及裁定](./phase3-final-acceptance.md)|原始FAIL→人工裁定→复验PASS，真实2增强/1降级/0失败|

## 3. 分阶段正式材料盘点

以下24份均在主线存在；每行路径即实际文件名。状态/数字按当时口径阅读。

### P1：Problem & Requirements

|文件|实际内容与可证明事项|架构知识点|PPT用途|局限/版本|
|---|---|---|---|---|
|[phase1-baseline.md](./phase1-baseline.md)|原系统、测试快照、自然需求与术语查询来源差异|Baseline、Architectural Drivers|问题案例＋原架构图|部分终端原件未另存；原_sources调用图是历史|
|[phase1-task-definition.md](./phase1-task-definition.md)|人工选定自然需求→课程来源匹配，明确In/Out Scope|Requirements、Scope|任务聚焦页|初始验收不是最终方案承诺|

### P2：Architecture Design

|文件|实际内容与可证明事项|架构知识点|PPT用途|局限/版本|
|---|---|---|---|---|
|[phase2-analysis.md](./phase2-analysis.md)|N01零召回、N02定义页排名12、通用词贡献；Q1–Q3六要素、A/B/C设计及轻量ATAM|Drivers、QAS、Sensitivity/Tradeoff|根因对照＋候选机制|v2数字为历史；早期B为确定性规划建议，后续改LLM|
|[phase2-evaluation-protocol.md](./phase2-evaluation-protocol.md)|初始16例划分、覆盖和相关性下界、冷暖计时规则|Measurement、Validity|指标定义页|v1/v2草案，正式对比用P3T3/v4|
|[phase2-baseline-review.md](./phase2-baseline-review.md)|依据PPT/OCR收紧必要知识，保留旧源重评分为v3|Evidence Review、Traceability|“改标注≠算法提升”反思|Codex代审；开发/保留粒度当时未统一|
|[phase2-experiment-design.md](./phase2-experiment-design.md)|冻结竞争机制、B的LLM职责、共享契约和故障/计时设计|Alternative Design、QAS|三方案并列框图|是实施前草案，旧48次建议不是实际调用|
|[phase2-implementation-contract.md](./phase2-implementation-contract.md)|模块职责、统一入口、G约束矩阵、B严格计划/回退、Git隔离|Conformance、Interface Contract|受约束AI开发页|草案时审批状态保留；实际执行看P3记录|

### P3：Architecture Experiments / Decisions / Evolution / Acceptance

|文件|实际内容与可证明事项|架构知识点|PPT用途|局限/版本|
|---|---|---|---|---|
|[phase3-baseline-preparation.md](./phase3-baseline-preparation.md)|未提交材料清单、两阶段建基点与Worktree安全计划|Configuration Management|实验准备小时间线|“只有主目录、尚无分支”等是执行前快照|
|[phase3-experiment-base.md](./phase3-experiment-base.md)|共同c6fc185、统一来源入口、等价性和89项语料签名、Worktree实际准备|Experiment Isolation、Conformance|公平对照基础页|共同基点不是后续文档提交f240ab7|
|[phase3-evaluation-protocol.md](./phase3-evaluation-protocol.md)|v4、12开发/4保留、计分11/3、候选冻结、重复与17次B规划安排|Architecture Evaluation|实验矩阵＋指标公式|不是最终答案评价；小保留集、AI标注|
|[phase3-evaluation-results.md](./phase3-evaluation-results.md)|四方案指标、六组成对差值、计时/调用、候选上限与故障|Quality Attribute Tradeoff|质量/延迟表＋升降图|P8为下界；B单采样；N10仅预检|
|[phase3-case-audit.md](./phase3-case-audit.md)|逐查询来源排序、成功/失败/退化及未审队列|Traceability、Qualitative Evaluation|N02/N03/N13等案例|N13解释须结合Coverage后续6:15修正|
|[phase3-architecture-tradeoffs.md](./phase3-architecture-tradeoffs.md)|Observation/Interpretation/Recommendation/Uncertainty分层权衡|轻量ATAM、Tradeoff|性能/可靠性/复杂度权衡矩阵|阶段建议“B优先补验”，不是最终Accepted选择|
|[phase3-reproduction.md](./phase3-reproduction.md)|冻结hash、目录、真实运行与离线汇总入口、重现边界|Reproducibility、Handoff|证据链/复现附页|真实调用需新预算；耗时/LLM不能逐值保证|
|[phase3-decision-supplement-protocol.md](./phase3-decision-supplement-protocol.md)|S01–S06事前规则、同批四方案及6次B规划预算|Controlled Validation|补验设计附页|知悉旧集设计，不是独立人工盲测|
|[phase3-decision-evidence-review.md](./phase3-decision-evidence-review.md)|8:20等争议审核、标签敏感性重评分、六例补验及待人工表|Sensitivity、Evidence Validity|指标对口径敏感的案例页|原始v4不改；N13检测遗漏表述后被限定|
|[phase3-integration-plan.md](./phase3-integration-plan.md)|B2批准前按可能选型列文件边界、Git集成与验收准备|Architecture Evolution、Handoff|计划/落地区分|未执行历史计划；当前行为以P3T5集成为准|
|[phase3-b-v2-protocol.md](./phase3-b-v2-protocol.md)|24新例、机制标签、Prompt单变量及新旧集合分离|Hypothesis、Sensitivity|受控Prompt探索设计|测试后已观察，不再是未来独立验证集|
|[phase3-b-v2-experiment.md](./phase3-b-v2-experiment.md)|新测试B-v2覆盖下降、回退增多；原B失败分类与成本|ATAM、Architecture Experiment|负面实验＋维护风险|不得拼接历史异日B与fresh B成同条件均值|
|[phase3-b-coverage-protocol.md](./phase3-b-coverage-protocol.md)|固定池选择比较、参数、最多8次规划上限及停止规则|Controlled Comparison|隔离选择贡献的方法图|协议上限不是实际次数，实际6次|
|[phase3-b-coverage-experiment.md](./phase3-b-coverage-experiment.md)|46条重建池、42评分0升2降40平、6次fresh规划及6:15审核|Coverage Proxy、Sensitivity、Tradeoff|代理失效、负例、召回上限|已观察样本；意图覆盖≠知识覆盖；6:15未重标|
|[phase3-final-architecture-decision.md](./phase3-final-architecture-decision.md)|人工B2批准默认Baseline＋可选原B，Accepted及后果/历史|ADR、Decision Drivers|最终决策页|不意味着B总体更优或标签获人工金标准认证|
|[phase3-dual-strategy-integration.md](./phase3-dual-strategy-integration.md)|选择性移植、默认API兼容、Module/C&C、瞬时UI状态|Module/C&C Views、Evolution|最终结构＋请求时序|包含P3T5历史测试与待办；当前状态看开头|
|[phase3-final-acceptance.md](./phase3-final-acceptance.md)|三种浏览器证据、原FAIL、真实回退与人工裁定、复验PASS|Reliability、Conformance、Acceptance|故障演示＋验收时间线|第1–10节历史FAIL；当前第11节PASS；取消后台可能继续|

### Worktree原型说明（5份，非主线文件）

|文件（本机可点击）|阶段/实际机制与可证明事项|知识点 / PPT用途|局限|
|---|---|---|---|
|[phase3-prototype-a.md](../../../MAGA-exp-a/docs/iteration3_jack/phase3-prototype-a.md)|P3T2：有限扩展、通用词0.1、字段命中饱和，一次扫描稳定Top8|职责隔离 / A机制图|207项是原型测试，不是质量优胜|
|[phase3-prototype-b.md](../../../MAGA-exp-b/docs/iteration3_jack/phase3-prototype-b.md)|P3T2：原LLM Planner、严格验证、各路Top8轮转、失败回退|Planner边界 / B数据流|226项及一次真实规划冒烟不等于正式对比|
|[phase3-prototype-c.md](../../../MAGA-exp-c/docs/iteration3_jack/phase3-prototype-c.md)|P3T2：原query Top32、覆盖贪心与Jaccard、最多8|候选/选择分工 / C机制图|207项、N10冒烟；不能补零召回|
|[phase3-prototype-b-v2.md](../../../MAGA-exp-b-v2/docs/iteration3_jack/phase3-prototype-b-v2.md)|P3T4：仅Prompt词法适配，保持原B其他机制|变更约束 / 单变量图|228项；最终不集成|
|[phase3-prototype-b-coverage.md](../../../MAGA-exp-b-coverage/docs/iteration3_jack/phase3-prototype-b-coverage.md)|P3T4：仅替换最终选择，意图增益/冗余惩罚|Modifiability / 新增职责图|232项；代理不认证知识；最终不集成|

主线没有以上5个同名说明，不能链接成 `./phase3-prototype-*.md`。本机5条链接已核对存在；跨机器先确认实验commit可达，使用下一节的只读Git入口。

### Project Handoff与基础架构背景（5份）

|文件|内容/可证明事项|知识点 / PPT用途|局限|
|---|---|---|---|
|[README.md](../../README.md)|真实启动、配置、资料、手动增强说明|Deployment / 演示准备|“待验收范围”措辞滞后，最终状态看P3T6|
|[FEATURES_AND_INTERFACES.md](../FEATURES_AND_INTERFACES.md)|功能/API与旧快照，P3T5增补|Interface / 系统范围页|首部仍写P3T6未完成；不是当前Gate|
|[HANDOFF.md](../hgj交接文档/HANDOFF.md)|前轮功能和迁机交接|Evolution / 历史交接|11-10的main、无OCR等是历史；10/20→18/20不能替代本轮8/20→16/20|
|[architecture.md](../archive/spec/architecture.md)|基础架构和ADR-001–004：模块化单体、轻检索、结构化教学动作、真实课件|Patterns、历史ADR / 原架构|archive快照；章节内检索描述不是当前全部能力|
|[architecture-evidence-audit.md](../architecture-evidence-audit.md)|11-14前三轮回顾性审计、历史证据成熟度|Evidence Audit / 演进背景|“未见第三轮证据”仅当时成立；不替代本索引|

### P4T2新增规范材料（1份）

|文件|内容与可证明事项|架构知识点 / PPT用途|局限|
|---|---|---|---|
|[phase4-architecture-design-and-views.md](./phase4-architecture-design-and-views.md)|以真实代码规范6个Drivers、约束/目标、6个QAS、Module uses与运行时两模式及回退、8项战术/机制|Drivers、QAS、Module/C&C、Tactics；作为理论与架构图主入口|是总结性表达与静态核对，不是新增实验，也未完成P4T3 ATAM复盘|

### P4T3新增评估材料（1份）

|文件|内容与可证明事项|架构知识点 / PPT用途|局限|
|---|---|---|---|
|[phase4-atam-and-decision-review.md](./phase4-atam-and-decision-review.md)|从原始机器结果核对四组对照，复用Driver/QAS，区分观察、机制、解释与人工决策；形成Sensitivity/Tradeoff及风险/Non-risk/Themes|回顾性轻量ATAM、ADR Review；质量/延迟表、D03案例、2/1/0验收时间线|非正式workshop或新B2；未扫参数的因素仍为候选敏感点，不新增实验或改旧数据|

## 4. Git、数据、代码与测试证据入口

### 4.1 Git版本与只读定位

|角色|分支/工作区|完整Commit|
|---|---|---|
|MATERIAL_BASE|材料归档|`2c4c834341d9d8319a0822760b6c19df415555f1`|
|EXPERIMENT_BASE / Baseline|MAGA-exp-baseline，detached|`c6fc1857928468030e6a030b13a146300bf93304`|
|A|experiment/iteration3-a|`ef7d2993ce31c02751df576ba9cc9b5307a3f1ad`|
|B|experiment/iteration3-b|`4f878dcaa14a6d62a7f0506b866afe5fcd17f68d`|
|C|experiment/iteration3-c|`a467ab17cbf0f13e347b348008bb3ed3385dcf0a`|
|B-v2|experiment/iteration3-b-v2|`cf5ba925662183daa8bf643dabade9ac2ce9c359`|
|B-Coverage|experiment/iteration3-b-coverage|`b07392bbfa49fbdaea3935bd6099a5e0d4c78894`|
|双策略生产集成|iteration/jack，P3T5|`0a91d63973706d79671f3842175d0ba8ee273b66`|
|原始验收FAIL|iteration/jack，P3T6首次|`9b6b1ea6f6ef14729def6475a55f4626aad2d053`|
|裁定复验PASS|iteration/jack，P3T6收尾|`f58b6c9caa88a24643886f1fc4e1f1e26e4e20c3`|

本次只读核对上述提交对象和主线日志，未修改任何实验分支。以下命令在仓库根目录运行，不切换、不合并、不重跑模型：

```powershell
git worktree list --porcelain
git show 4f878dc:docs/iteration3_jack/phase3-prototype-b.md
git show ef7d299:docs/iteration3_jack/phase3-prototype-a.md
git show a467ab1:docs/iteration3_jack/phase3-prototype-c.md
git show cf5ba92:docs/iteration3_jack/phase3-prototype-b-v2.md
git show b07392b:docs/iteration3_jack/phase3-prototype-b-coverage.md
git show --stat 0a91d63
git show 9b6b1ea:docs/iteration3_jack/phase3-final-acceptance.md
git show f58b6c9:docs/iteration3_jack/phase3-final-acceptance.md
```

Commit不是普通文件链接。原B选择性移植不等于整体Merge；A/C/B-v2/Coverage仍是独立实验。复现具体策略须按冻结commit，不用当前主线冒充旧Baseline。

### 4.2 数据集与评分工具

|实际文件|作用/可证明|限制与PPT用途|
|---|---|---|
|[初稿](../fixtures/iteration3-design-needs.json)、[v2](../fixtures/iteration3-design-needs-v2.json)、[v3](../fixtures/iteration3-design-needs-v3.json)、[v4](../fixtures/iteration3-design-needs-v4.json)|16例的版本链；v4正式12开发/4保留、11/3评分|v2→v3是标注修正；v4统一保留粒度，不跨版本混均值；用于评估口径页|
|[补验S集](../fixtures/iteration3-decision-supplement.json)|6例S01–S06|知悉旧集设计，单独报告，不称独立盲测|
|[扩充初稿](../fixtures/iteration3-bv2-expansion.json)、[机制修订v2](../fixtures/iteration3-bv2-expansion-v2.json)|24例，14开发/10测试，13/9评分；D03事前细化检查点|T集后来已观察，Coverage阶段只能作探索分析|
|[evaluate-design-needs.py](../../scripts/evaluate-design-needs.py)、[评分测试](../../scripts/test_evaluate_design_needs.py)|KC8必要知识替代页、P8下界、unjudged等评分边界|不是完整Recall/nDCG或教学质量；用于指标解释|
|[run-design-experiment.py](../../scripts/run-design-experiment.py)、[运行器测试](../../scripts/test_run_design_experiment.py)|来源统一入口、签名和分集门禁|variant只是标识，实际实现来自Worktree|
|[run-design-comparison.py](../../scripts/run-design-comparison.py)、[worker](../../scripts/compare-design-worker.py)、[分析器](../../scripts/analyze-design-comparison.py)、[比较测试](../../scripts/test_design_comparison.py)|受控调用、批次执行、配对分析和预算/未审保护|执行真实批次有费用；P4只读，不复制命令直接再跑|

### 4.3 关键原始证据（本机存在，被Git忽略）

|文件入口|能核对什么|不可误用|
|---|---|---|
|[P3T3 freeze.json](../../data/verification/p3t3-comparison-20261116-v1/freeze.json)|协议、语料、工具hash及冻结条件|不是后续版本签名；移机需另交付产物|
|[P3T3 comparison.json](../../data/verification/p3t3-analysis-20261116-v1/comparison.json)、[per-query.csv](../../data/verification/p3t3-analysis-20261116-v1/per-query.csv)|四方案宏均值与配对；可追到每查询|dev和holdout分表，不能从均值推显著性|
|[未审来源清单](../../data/verification/p3t3-analysis-20261116-v1/unjudged-audit.md)|待独立人工审核页|unjudged不是irrelevant|
|[标签敏感性review.json](../../data/verification/p3t4-review-20261117-v1/review.json)|strict_capacity等情景下同一来源重评分|不是重写v4正式结果|
|[B-v2 summary.json](../../data/verification/p3t4-bv2-analysis-20261117-v1/summary.json)|新/旧集合、Baseline/B/B-v2及成对结果|新测试与历史B异日层次分开|
|[Coverage summary.json](../../data/verification/p3t4-coverage-analysis-20261117-v1/summary.json)、[fixed.jsonl](../../data/verification/p3t4-coverage-20261117-v1/fixed.jsonl)|同计划/同池轮转对照、46例重放与42例评分|不能把fresh计划变化算成选择器收益|
|[原FAIL manifest](../../data/verification/p3t6-acceptance-20261117-v1/manifest.json)、[原真实脚本结果](../../data/verification/p3t6-acceptance-20261117-v1/chrome-real/results.json)|旧Gate和失败强断言确实保留|不能单独当当前最终Gate|
|[真实调用summary](../../data/verification/p3t6-acceptance-20261117-v1/real-summary.json)、[真实事件](../../data/verification/p3t6-acceptance-20261117-v1/real-server/events.jsonl)|6次HTTP、25,853 Token、normal/空输出回退及阶段耗时|3个业务阶段≠6次Planner；成本null；勿公开密钥/原始敏感载荷|
|[裁定adjudication.json](../../data/verification/p3t6-adjudication-20261117-v1/adjudication.json)、[verification-summary.json](../../data/verification/p3t6-adjudication-20261117-v1/verification-summary.json)|当前PASS、2增强/1降级/0失败、历史哈希、新调用0|是历史真实记录复验，不是新鲜模型采样|
|[复验conformance.json](../../data/verification/p3t6-adjudication-20261117-v1/conformance.json)、[Chrome复验结果](../../data/verification/p3t6-adjudication-20261117-v1/chrome-mock/results.json)|17项静态检查、26次来源复验，以及17组浏览器Mock模型验收|这里两个“17”是不同计数，不是17次真实模型|

### 4.4 生产代码和测试（静态入口，本次未运行）

|入口|职责/可证明事项|对应知识点与使用边界|
|---|---|---|
|[models.py](../../server/models.py)、[main.py](../../server/main.py)|三阶段枚举默认baseline、路由和响应契约|API兼容；非法策略422|
|[design_sources.py](../../server/design_sources.py)、[内部契约](../../server/design_source_contracts.py)|显式分派、原legacy、真实内容/唯一/Top8出口|Module边界、策略隔离；仓储违约不伪装降级|
|[design_planner.py](../../server/design_planner.py)、[config.py](../../server/config.py)|原B严格Planner、一次/15秒/1024Token/最多3意图、轮转与回退|Reliability、预算敏感点；目录合法不认证教学充分性|
|[design.py](../../server/design.py)|配置require、三阶段最终生成、Pydantic、引用规范化|503/422/502语义；基线无Planner但仍有最终模型生成|
|[search.py](../../server/search.py)、[retrieval_terms.py](../../server/retrieval_terms.py)、[chapters.py](../../server/chapters.py)|词法评分、中英词项、真实PPT/OCR仓储|原召回机制；无向量库/PDF全书索引|
|[DesignStudio.tsx](../../web/src/DesignStudio.tsx)、[DesignRetrievalMode.tsx](../../web/src/DesignRetrievalMode.tsx)、[api.ts](../../web/src/api.ts)|手动选择、loading/迟到保护、旧成果与安全回退标记|UI/服务边界；临时策略不写入持久化偏好|
|[test_design_strategy.py](../../server/tests/test_design_strategy.py)、[test_design_sources.py](../../server/tests/test_design_sources.py)、[test_design_planner.py](../../server/tests/test_design_planner.py)|默认/增强、预算、真实内容拒绝、规划故障与取消|Conformance；Mock不是线上教学效果|
|[test_acceptance_adjudication.py](../../server/tests/test_acceptance_adjudication.py)、[判定规则](../../scripts/acceptance-verdict.mjs)、[判定测试](../../scripts/acceptance-verdict.test.mjs)|增强/降级/失败分类；回退/生成/来源失败不算成功|Acceptance与人工裁定；保留反例|
|[Chrome验收脚本](../../scripts/acceptance-browser.mjs)、[受控后端](../../scripts/acceptance-server.py)、[离线复验](../../scripts/replay-acceptance.mjs)、[静态复验](../../scripts/acceptance-conformance.py)|真实前后端＋可控上游，或既有真实记录重放|三类证据必须分层；真实模式不得未经预算再执行|

## 5. 架构知识点反向索引与成熟度

Ready=已可引用的限定证据；Needs Refinement=信息已有但需规范化/汇总；Missing=缺少所需证据，不能凭图或测试补称已有。
P4T2将Drivers、QAS、视图及战术标为Ready，指该阶段范围内的**素材/表达已规范**，不等于所有质量属性收益都已实测达标；每个QAS仍附限制。当时ATAM及综合Sensitivity/Tradeoff分析留给P4T3。
P4T3现已完成上述回顾性分析；相应Ready只指课程项目材料成熟，不能把所有候选敏感点都称为实证确认，也不等于有正式ATAM会议证据。

|架构知识点|已有材料|成熟度|后续最小补充|
|---|---|---|---|
|Architectural Drivers|[P4T2 §2–3](./phase4-architecture-design-and-views.md)、[P1范围](./phase1-task-definition.md)、[ADR驱动](./phase3-final-architecture-decision.md)|Ready|6个Driver及优先级依据；总结性归纳与历史批准区分，转为汇报表|
|Quality Attribute Scenarios|[P4T2 §4](./phase4-architecture-design-and-views.md)、[P2 Q1–Q3](./phase2-analysis.md)、[验收](./phase3-final-acceptance.md)|Ready|6个完整六要素，附Driver/机制/测试/实测/限制；提炼场景卡，不虚构SLA|
|Module Structure / Module View|[P4T2 §5](./phase4-architecture-design-and-views.md)、[来源模块](../../server/design_sources.py)|Ready|按实际文件表达import/uses；回调与同文件职责已说明，可用于制图|
|Component-and-Connector Structure|[P4T2 §6](./phase4-architecture-design-and-views.md)、[真实阶段记录](./phase3-final-acceptance.md)|Ready|运行时组件/资源、两模式时序及回退齐备；制图保留HTTP/进程内边界|
|Architectural Patterns|[P4T2概念及Strategy讨论](./phase4-architecture-design-and-views.md)、[历史ADR](../archive/spec/architecture.md)|Ready|限定模块化单体与策略式函数分派，不冒称完整GoF框架或新架构模式|
|Architectural Tactics|[P4T2 §8映射](./phase4-architecture-design-and-views.md)、[Planner](../../server/design_planner.py)|Ready|8项机制关联属性/实现/验证/代价；P4T3再综合权衡，不新增战术|
|ATAM|[P4T3完整复盘](./phase4-atam-and-decision-review.md)、[最终ADR](./phase3-final-architecture-decision.md)|Ready|回顾性轻量方法，含Risk/Non-risk/Theme；提炼展示，不冒充完整正式workshop|
|Sensitivity Points|[P4T3 §6](./phase4-atam-and-decision-review.md)、[B-v2](./phase3-b-v2-experiment.md)、[Coverage](./phase3-b-coverage-experiment.md)|Ready|6项按已确认局部/部分支持/候选假设分层；另列评价敏感性；未经扫描不宣称最优参数|
|Tradeoff Points|[P4T3 §7](./phase4-atam-and-decision-review.md)、[ADR](./phase3-final-architecture-decision.md)|Ready|5项具体机制与多属性因果、证据及限制；提炼图表，不跨批比较wall|
|Risks / Non-risks / Risk Themes|[P4T3 §8](./phase4-atam-and-decision-review.md)、[P3T6剩余限制](./phase3-final-acceptance.md)|Ready|8项风险、4项限定已缓解事项、4主题；Non-risk不是绝对不会失败|
|ADR|[最终Accepted ADR](./phase3-final-architecture-decision.md)、[人工裁定](./phase3-final-acceptance.md)|Ready|提炼汇报级Context/Decision/Consequences，不改历史决策|
|Architecture Conformance|[契约矩阵](./phase2-implementation-contract.md)、[集成](./phase3-dual-strategy-integration.md)、[复验](../../data/verification/p3t6-adjudication-20261117-v1/conformance.json)|Ready|带上commit、静态/Mock/真实的证据标签|
|Architecture Evolution|[共同基点](./phase3-experiment-base.md)、[最终集成](./phase3-dual-strategy-integration.md)、第4节Git链|Ready|制作选择性集成时间线，保留未采纳分支|
|Graceful Degradation / Business Continuity|[ADR](./phase3-final-architecture-decision.md)、[裁定报告](./phase3-final-acceptance.md)、[故障测试](../../server/tests/test_acceptance_adjudication.py)|Ready|明确Enhanced与Degraded的分母，不把回退算增强成功|
|独立人工金标准与长期教学/可靠性效果|[评估限制](./phase3-evaluation-results.md)、[剩余风险](./phase3-final-acceptance.md)|Missing|本轮只披露缺口，不补造认证、负载/长期结果或启动新实验|

## 6. Presentation Material Map

本节只导航，不制作PPT或完整讲稿。图中的模块名和箭头应回到代码核对，引用数据始终附集合/标签版本/样本数。

|汇报主题|推荐材料|可提取关键事实|页面类型|避免的表述|
|---|---|---|---|---|
|1 产品问题及原架构|[P1基线](./phase1-baseline.md)、[根因](./phase2-analysis.md)|N01零召回与N02第12名截断是不同机制|前后查询对照＋原架构图|“所有自然需求都失败”“模型必然答错”|
|2 质量属性与目标|[P4T2 Drivers与QAS](./phase4-architecture-design-and-views.md)、[任务定义](./phase1-task-definition.md)|6个Driver/6个QAS，适用性优先、溯源必保留、延迟/成本权衡|Drivers表＋六要素场景卡|虚构提升目标、把历史延迟当SLA|
|3 A/B/C候选|[实验设计](./phase2-experiment-design.md)、[实施契约](./phase2-implementation-contract.md)、第3节原型说明|A词法；B规划；C原query宽池重排，机制隔离|三列结构/流程图|把A规则/C重排说成原B生产能力|
|4 统一实验和结果|[P3协议](./phase3-evaluation-protocol.md)、[结果](./phase3-evaluation-results.md)|KC开发50/31.82/63.64/50%；保留33.33/16.67/50/16.67%（Baseline/A/B/C）|按集分表＋成对升降|P8下界=完整Precision；N10=全开发集|
|5 补充发现|[B-v2](./phase3-b-v2-experiment.md)、[Coverage](./phase3-b-coverage-experiment.md)|新测试KC原B66.67% vs B-v2 55.56%；Coverage固定池0升2降40平|负面实验表＋代理指标案例|B-v2总体更好、Coverage有稳定净收益、T集仍未观察|
|6 ATAM权衡|[P4T3敏感点/Tradeoff/风险主题](./phase4-atam-and-decision-review.md)、[阶段权衡](./phase3-architecture-tradeoffs.md)、[审核](./phase3-decision-evidence-review.md)|局部覆盖收益vs同批延迟，严格校验vs增强可用性，D03代理反例；确认与假设分层|质量属性矩阵＋风险主题表＋同池案例|只按均值排名、把所有因素当已确认SP、声称正式完整ATAM|
|7 B2最终决策|[Accepted ADR](./phase3-final-architecture-decision.md)、[P4T3 §9复盘](./phase4-atam-and-decision-review.md)|Baseline默认＋用户主动原B，不全面替换；验收限定支持，不是数学最优|决策卡＋备选排除依据|“证明B无效”“B全面胜出”或把本次归纳说成历史会议|
|8 双策略实现|[P4T2规范Module/C&C及机制](./phase4-architecture-design-and-views.md)、[集成](./phase3-dual-strategy-integration.md)、[分派代码](../../server/design_sources.py)|实际文件依赖、同进程职责、显式枚举、共同出口及共享最终生成|静态图＋运行时序＋战术映射|整个实验分支Merge、Planner直接认证页码、函数画成独立服务|
|9 故障与验收|[报告第11节](./phase3-final-acceptance.md)、[原FAIL](../../data/verification/p3t6-acceptance-20261117-v1/chrome-real/results.json)、[裁定结果](../../data/verification/p3t6-adjudication-20261117-v1/adjudication.json)|原FAIL未删；2增强/1降级/0失败，最终PASS，裁定无新增真实调用|失败→裁定→复验时间线＋演示|三阶段都增强成功、Mock冒充真实、Abort保证上游停止|
|10 反思与局限|[Coverage 6:15更正](./phase3-b-coverage-experiment.md)、[验收风险](./phase3-final-acceptance.md)|代理与知识不同；冻结标签可能漏页；费用未知与有限样本|证据边界/反思页|隐去负例、AI标注冒充独立人工、引用存在=语义充分|

## 7. 证据一致性审计与版本裁定

本次核对文档、fixture结构、关键源码及本地机器摘要；不是重新跑数或逐页独立标注。以下不改旧文档和冻结数据。

|位置/冲突|审计判断|汇报应采用的依据|
|---|---|---|
|P2分析v2 KC68.18% vs v3复核50%|同一保存来源，标签必要性/粒度改变，非算法退化|[复核](./phase2-baseline-review.md)；正式四方案用v4协议|
|P2 §7.4确定性规划B vs P2实验设计/P3原型LLM B|早期建议被用户后续设计决定替代|[实验设计](./phase2-experiment-design.md)、原B4f878dc、当前Planner|
|P2草案48次建议 vs P3T3 17次实际安排|预算版本不同；P3T3为N10预检1＋开发12＋保留4|[P3协议](./phase3-evaluation-protocol.md)及实际账本；不把上限当已用量|
|P3T3保留B领先 vs 后续新测试B与Baseline同66.67%|不同查询/标签/时间条件；不是自相矛盾|分别引用[统一结果](./phase3-evaluation-results.md)和[B-v2新测试表](./phase3-b-v2-experiment.md)，不合并均值|
|旧N13“没检测” vs Coverage发现6:15含检测机制|冻结fault_detection漏列6:15，原B和Coverage都已选它；旧0.5只表示未命中冻结标签|[Coverage第4节](./phase3-b-coverage-experiment.md)是最新课件审核限定；未获独立人工确认，未重标旧结果|
|旧N14 8:20算容量 vs 新测试只接受8:28/29/30|方向概览与机制充分性口径不同|[敏感性审核](./phase3-decision-evidence-review.md)；引用各批标签，不追改旧v4|
|B-v2/Coverage文首ADR Proposed、集成计划B2未批准|均为当时状态，不代表当前|[最终ADR](./phase3-final-architecture-decision.md) Accepted及P3T5选择性集成|
|README“待验收”、FEATURES首部“P3T6尚未完成”|外部导航措辞滞后；本文标记，不静默改写旧快照|[最终验收第11节](./phase3-final-acceptance.md)为当前状态；P4T5必要时轻量修正文档入口|
|验收第1–10节FAIL vs 第11节PASS|有明确用户裁定与新复验，不是删除失败|9b6b1ea原FAIL；f58b6c9当前PASS；旧29文件哈希保留|
|真实3阶段成功 vs 只有2次Enhanced Success|第三次Planner耗尽Token后Degraded Success；业务成功与增强成功分母不同|[adjudication.json](../../data/verification/p3t6-adjudication-20261117-v1/adjudication.json)：2/1/0|
|Chrome25项、17组、真实流程混用风险|25项是API替身；17组是真后端Mock模型；真实模型为历史一工作流|[验收三类证据](./phase3-final-acceptance.md)，不得混算验证真实性|
|Module/C&C文档 vs 当前源码|策略只在实践路径，原B SYSTEM/轮转保留，共享出口必经，最终生成仍独立|[集成图](./phase3-dual-strategy-integration.md)、[源码](../../server/design_sources.py)和已有conformance；本轮静态确认|

### 尚未解决或不可伪造的材料缺口

- 本机原型说明与data产物可访问，但不都在主线Git树；迁机须另有Worktree/commit对象和脱敏产物包。仅有索引不能恢复被忽略的日志。
- 完整页级相关性、争议页独立人工裁决及学习效果金标准缺失；尤其6:15、8:20等不要以Codex审核冒充人工认证。
- P4T1时P2已有QAS六要素，仍需补可靠性/修改性场景和规范视图层级；P4T2已完成这一表达性缺口，见主说明。各QAS的长期效果/性能等验证限制仍在，Ready不代表全部质量收益达标。
- 上游长期稳定性、浏览器断连后的远端取消/计费、生产负载与吞吐、可靠单价/总费用未证明。P4只披露，不扩大成新实验任务。
- 原型/集成/验收中的测试数量对应不同提交和范围；本轮不把178、197、207、226、259、68等相加当产品测试总数，也不声称当前远端CI通过。

## 8. Phase 4 Remaining Work

|后续任务|有依据的优先工作|输入与完成边界|
|---|---|---|
|P4T2（已完成）|Drivers/边界、6个QAS、Module/C&C、8项机制及理论—实现—证据映射已整理|[P4T2主说明](./phase4-architecture-design-and-views.md)；只静态核对，无新增实验；保留质量收益验证限制|
|P4T3（已完成）|回顾性Drivers/QAS映射、同批指标核对、6敏感点/5Tradeoff、Risk/Non-risk/Themes、B2复盘及5条课堂结论|[P4T3主文档](./phase4-atam-and-decision-review.md)；保留候选SP置信度及评价限制，不新增实验、不改ADR|
|P4T4|按第6节及P4T3结论组织报告/PPT；优先同批质量/延迟、D03固定池、2/1/0与FAIL→裁定→PASS；准备默认/增强/回退/引用/恢复演示和答辩问题|[P4T3 §11素材建议](./phase4-atam-and-decision-review.md)；标清Mock/真实，保存素材/Mock优先，不当作新真实调用授权|
|P4T5|重验最终文档链接、代码/数据/commit一致性；修正仍滞后的入口措辞；确认脱敏证据和Worktree迁机可用性；检查最终Git/团队交接及合并准备|当前任务不Merge或Push；是否团队合并另按授权；不得删除实验分支/历史FAIL|

## 9. 本轮交付与文档验证

P4T1唯一新增交付为本文；P4T2/P4T3各新增一份主说明并更新本文，不重复建立导航。历史architecture-evidence-audit仅作背景关联。
验证对象是本文全部Markdown文件链接：以本文目录解析、核对存在及真实文件名大小写、禁止本机绝对路径、Git hash保留为代码和只读命令；Worktree/data链接明确标注迁机限制。
P4T1历史验证：173条相对文件链接、88个去重目标全部有效。P4T2再次核对本文及新主说明的全部链接，当前计数见交付记录；不声称修复或验证所有历史文档内部链接。
P4T2当前验证：索引178条链接/89个去重目标、主说明146条链接/43个去重目标均有效且大小写匹配，无本机绝对路径；主说明6个QAS六要素和4个Mermaid块静态结构检查通过，未作图形渲染。
P4T3当前验证：索引181条链接/90个去重目标、ATAM复盘109条链接/39个去重目标均有效且大小写匹配，无本机绝对路径。本轮只修改本文及ATAM复盘文档，不改生产/测试/fixture/历史结果或既有ADR，不新增模型调用，不执行P4T4。提交可由 `git log -1 --format=%H -- docs/iteration3_jack/phase4-evidence-index.md` 取得；工作区状态见交付记录。
