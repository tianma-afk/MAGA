# P4T3：Retrospective ATAM-Based Architecture Evaluation & Decision Review

日期：2026-11-17。审阅基线：`iteration/jack` / `4386a65cd221a5d90032d6402a11f4be689deca0`，开始时干净。本轮只读核对文档、代码/测试入口与已保存机器结果，不新增运行实验、模型调用或生产修改。

## 1. Executive Summary

**回顾性结论：已有证据支持本课程项目采用“Baseline默认＋原始B手动增强”的有限取舍，不支持宣称B整体最优或原始匹配问题已解决。**

- 原B有局部知识覆盖收益，但额外调用/延迟明确；原P3T3开发集KC8由50.00%到63.64%，扩充新测试Baseline/B同为66.67%。[原始对比](../../data/verification/p3t3-analysis-20261116-v1/comparison.json)、[扩充对比](../../data/verification/p3t4-bv2-analysis-20261117-v1/summary.json)。
- B-v2的Prompt改变没有稳定净收益，且新集invalid_plan由原B的1/24增为6/24；Coverage同池42个评分例0升2降40平。复杂度增加未换来足够收益。[B-v2记录](./phase3-b-v2-experiment.md)、[Coverage记录](./phase3-b-coverage-experiment.md)。
- 原B作为可选能力，让用户显式承担额外规划代价；统一契约/校验、超时和合法回退限制变化及故障影响。它没有消除最终模型依赖，也不能保证增强更准确。[Accepted ADR](./phase3-final-architecture-decision.md)。
- 集成与验收支持默认兼容、显式选择、真实来源和降级行为：历史真实工作流**2 Enhanced Success、1 Degraded Success、0 Failure**；原FAIL证据保留，经人工裁定与复验最终PASS。[裁定原始结果](../../data/verification/p3t6-adjudication-20261117-v1/adjudication.json)。

## 2. 评估范围与方法边界

### 两个评估层次

|层次|对象|本次评估问题|
|---|---|---|
|候选架构|Baseline、A、原B、C；从原B派生的B-v2及B-Coverage|不同机制对覆盖、相关性、时间、调用与维护代价的影响；不假定原型已生产集成|
|最终集成架构|Baseline默认、原B手动可选、共用真实来源校验及原最终生成|是否兑现既定决策的隔离与故障语义，哪些长期性质仍缺证据|

本轮采用**轻量、回顾性ATAM思路**组织Drivers→QAS→Approaches→Sensitivity/Tradeoff→Risks/Non-risks/Themes→决策复盘。
没有正式ATAM工作坊、外部专家、利益相关者投票、utility tree投票或历史场景优先级会议；本文的分类/编号是事后归纳。D1适用性优先及溯源必须保持有历史依据，其余优先级沿用[P4T2](./phase4-architecture-design-and-views.md)的总结性归纳，不重新批准一套优先级。

证据标签：**O（Observation）**是已有实验/测试观察；**M（Mechanism）**是代码静态确认；**I（Interpretation）**是本次解释或预期；**H（Human Decision）**是用户真实批准。可追到事实不代表独立人工认证。
本文不重做B2，不实现组合或自动路由，不用事后分析修改冻结标签；Structure/View/Pattern/Tactic含义沿用[P4T2概念与视图](./phase4-architecture-design-and-views.md)。

## 3. Drivers与QAS映射

完全复用P4T2的D1–D6、QAS-01–06，不新增平行分类。详见[P4T2 §2–4](./phase4-architecture-design-and-views.md)。

|Driver（原ID）|QAS|相关架构机制|评估证据及边界|
|---|---|---|---|
|D1 自然需求匹配 / Functional Suitability|01自然知识匹配；03显式增强|原查询、LLM意图、多路词法检索及最多8页合并|[统一实验](./phase3-evaluation-results.md)、[新测试](./phase3-b-v2-experiment.md)：局部收益，非普遍优势|
|D2 默认性能与低额外开销|02默认性能；03增强预算|默认baseline、手动开关，规划不强加于普通请求|[来源分派](../../server/design_sources.py)、[P3T6](./phase3-final-acceptance.md)：零额外Planner不等于零最终模型|
|D3 可信来源与业务连续性|01真实知识；04故障降级；06成果保护|严格计划/来源/引用校验、错误分类、Baseline回退、迟到保护|[故障测试](../../server/tests/test_acceptance_adjudication.py)、[真实裁定](./phase3-final-acceptance.md)：回退仍依赖来源及最终模型|
|D4 变化局部化 / Modifiability|05修改局部化；06旧业务兼容|统一SourceSelection、实践专属分派，不改公共检索|[集成](./phase3-dual-strategy-integration.md)、[conformance](../../data/verification/p3t6-adjudication-20261117-v1/conformance.json)：本次受控，不证明任意未来修改零传播|
|D5 可维护/可测试|05修改局部化；06保护|小模块、独立分支、transport注入、明确测试矩阵|[开发契约](./phase2-implementation-contract.md)、[Planner测试](../../server/tests/test_design_planner.py)：维护工时未实测|
|D6 外部LLM依赖与调用成本|02默认；03预算；04降级|一次无重试、15秒规划、1024输出Token/3意图、usage与原因码|[Planner](../../server/design_planner.py)、[真实使用量](../../data/verification/p3t6-acceptance-20261117-v1/real-summary.json)：费用null，无总业务SLA|

## 4. Architectural Approaches：候选机制与实测落点

|方案/版本|核心架构机制|Design Intent|实际观察（O）|主要代价/边界|
|---|---|---|---|---|
|Baseline c6fc185|原需求词法检索、按原排名Top8|低额外成本、保留原业务|固定集存在召回不足和排名截断；也是可用的可靠回退基点|不能自然理解所有需求；最终业务仍需模型|
|A ef7d299|有限表达扩展、通用词降权、字段命中饱和|改善词法落点/排序，无额外模型|开发KC下降，N03/N09局部改善；更高P8不等于更全知识|规则边界/误匹配、维护词表；不与B或C组合|
|B 4f878dc|LLM严格意图规划→各路原检索→轮转|把自然表达转换成可检索意图|部分需求新增知识；新测试总体KC未超Baseline|规划延迟/Token、多个检索、本地IO与输出不确定性|
|C a467ab1|原query Top32→任务相关覆盖/冗余重排→Top8|缓解召回后截断|开发KC持平，保留下降；无已测稳定净收益|不能补零召回；特征构造/重排增加本地成本|
|B-v2 cf5ba92|仅优化Planner Prompt为课程机制关键词|改善规划到词法检索的适配|新测试覆盖下降、invalid_plan增加|Prompt/版本虽小改，行为风险及Token代价不小|
|B-Coverage b07392b|保留原B规划/有界池，仅替换最终选择为意图增益/冗余惩罚|提高互补知识保留|同池0升2降40平，N08/D03退化|意图支持代理不等于必要知识支持，需维护权重/锚点|

原型实现/版本定位见[索引原型与Git入口](./phase4-evidence-index.md)；三候选机制契约见[实施约束](./phase2-implementation-contract.md)。当前生产代码是0a91d63选择性移植原B后的双策略实现，不是任一实验Worktree直接合并，也不是原始c6fc185全文件快照。

## 5. 关键实验对照：分批、分层、分计时边界

共同解释：KC8=冻结必要知识的可用替代页命中比例；P8=已标direct页数/8的**下界**；未审页不算已知无关。标注为Codex依据课程材料构建/复核，不是独立人工金标准。相关性/覆盖不等于最终答案教学效果。

### 5.1 原始P3T3：Baseline/A/B/C

原16例：开发12运行/11评分，保留4运行/3评分；N10另有预检，不混入汇总。正式比较冻结v4，候选同语料。Baseline/A/C每查询两次且完整来源稳定；质量取首遍，延迟取每查询两遍中位数后宏平均，B为一次fresh规划/查询，无重试。
原B全轮17次真实规划含N10预检1次；下面正式dev/holdout分别12/4次。只评来源，不执行最终生成。[冻结协议](./phase3-evaluation-protocol.md)、[机器comparison.json](../../data/verification/p3t3-analysis-20261116-v1/comparison.json)。

|集合|方案|KC8|P8下界|平均来源选择秒|规划回退/运行例|
|---|---|---:|---:|---:|---:|
|开发（11评分）|Baseline|50.00%|11.36%|4.259|0/12|
|开发|A|31.82%|12.50%|2.412|0/12|
|开发|B|63.64%|13.64%|11.207|1/12|
|开发|C|50.00%|11.36%|8.444|0/12|
|保留（3评分）|Baseline|33.33%|8.33%|3.969|0/4|
|保留|A|16.67%|16.67%|2.356|0/4|
|保留|B|50.00%|8.33%|9.464|1/4|
|保留|C|16.67%|4.17%|7.324|0/4|

同批B−Baseline：开发KC **+13.64个百分点**、2升0降9平，平均来源选择 **+6.948秒**；保留KC **+16.67个百分点**，却是1升1降1平，不代表跨需求一致优越。原始未四舍五入值和六对delta见[机器结果](../../data/verification/p3t3-analysis-20261116-v1/comparison.json)。
wall边界是统一入口到候选自带出口校验，不含独立额外复验/评分、最终生成；冷加载另记。小样本不报告生产P95；零规划费用的A/C/Baseline不意味着整个产品免费。[计时解释](./phase3-evaluation-results.md)。

### 5.2 扩充数据：Baseline/B/B-v2

新增24例：开发14运行/13评分，测试10运行/9评分；测试在代码/数据冻结后执行，未用本轮测试结果再调Prompt。它是事前分出的新测试层，但仍为知悉旧集的同作者AI构建，**非独立人工样本或盲测**；在Coverage阶段已经观察过，不能再次称全新验证。
三方案新数据是同轮比较；另列的历史22例使用保存的原B旧online，不能当作同日期fresh B或混入新集均值。[B-v2协议](./phase3-b-v2-protocol.md)、[原始summary](../../data/verification/p3t4-bv2-analysis-20261117-v1/summary.json)。

|集合|方案|KC8|P8下界|平均来源选择秒|回退/运行例|
|---|---|---:|---:|---:|---:|
|新开发（13评分）|Baseline|65.38%|17.31%|2.072|0/14|
|新开发|原B|73.08%|18.27%|6.256|0/14|
|新开发|B-v2|69.23%|20.19%|7.270|4/14|
|新测试（9评分）|Baseline|66.67%|15.28%|3.057|0/10|
|新测试|原B|66.67%|20.83%|8.104|2/10|
|新测试|B-v2|55.56%|19.44%|9.334|4/10|

同轮新测试B-v2−原B：KC **−11.11个百分点**，0升1降8平（T03退化）；原B−Baseline为0升0降9平。新开发中原B相对Baseline+7.69个百分点，也不应顶替新测试结论。wall为全部运行例单次来源选择均值，不能与P3T3异日墙钟值作提速对照。

直接读取原始rows的diagnostics：原B新集normal22、invalid_plan1、uncertain1；B-v2新集normal16、invalid_plan6、uncertain2。B-v2的6个非法例D04/D07/D08/T02/T08/T09均报告completion_tokens=1024，但**未保存非法正文/finish_reason，不能断言全是截断或同一种schema错误**。
该次B-v2实验共70次真实规划（原B新24＋B-v2新24/历史22），62665 Token，费用null；不是本次P4T3新增调用。[B-v2 §8与局限](./phase3-b-v2-experiment.md)。

### 5.3 B-Coverage：固定计划与固定候选池

复用46条已观察原B计划，42条评分；历史池未全保存，按保存queries、相同检索和89项课程签名确定性重建。46/46原轮转与历史完整来源字典一致，再让两选择器共享同一份池；隔离选择机制，不额外采样LLM。[实验方法](./phase3-b-coverage-experiment.md)、[逐例fixed.jsonl](../../data/verification/p3t4-coverage-20261117-v1/fixed.jsonl)。

|分层（评分例）|原B KC8|Coverage KC8|Coverage−B 升/降/平|
|---|---:|---:|---:|
|旧开发（11）|63.64%|54.55%|0/1/10|
|旧保留（3）|50.00%|50.00%|0/0/3|
|S补验（6）|66.67%|66.67%|0/0/6|
|已观察新开发（13）|73.08%|65.38%|0/1/12|
|已观察新测试（9）|66.67%|66.67%|0/0/9|
|合计仅计数（42）|不合并异口径均值|不合并异口径均值|**0/2/40**|

明确反例：D03要求回滚/检查点，原轮转保留5:27，新选择丢失，KC1→0；泛恢复页5:26不能替代检查点机制。N08接口隔离中丢7:30而优先选择宽泛接口支持页，KC1→0。[案例及机制解释](./phase3-b-coverage-experiment.md)。
同池本地选择均值原轮转0.012毫秒、Coverage4.462毫秒，覆盖46条含回退；额外开销小但覆盖收益仍不足。它不含规划/召回/最终生成，不可冒充生产端到端提速。[机器summary](../../data/verification/p3t4-coverage-analysis-20261117-v1/summary.json)。
另有6例一次fresh规划链路（5 normal、1回退），同一fresh池原B/Coverage KC均83.33%、0升0降6平；实际6次规划4621 Token，费用null。它不包含最终教学生成，也不是未观察的独立样本。[有限online验证](./phase3-b-coverage-experiment.md)。

### 5.4 最终集成的P3T6：真实业务与故障验证

对象切换为生产双策略架构，**不与只测来源的实验wall混算**。一次Chrome＋真实后端＋真实模型的三阶段流程，共6次HTTP（3 Planner＋3最终生成），不是6次Planner。[真实summary](../../data/verification/p3t6-acceptance-20261117-v1/real-summary.json)。

|真实阶段|Planner秒|生成秒|业务API总秒|规划/业务分类|
|---|---:|---:|---:|---|
|场景分析|3.035|16.786|35.232|normal，Enhanced Success|
|战术推荐|4.330|10.439|29.737|normal，Enhanced Success|
|AI评审|5.748|27.897|40.373|空规划→Baseline，Degraded Success|

三个业务均200、8个真实唯一来源，2增强/1降级/0失败；25853 Token，费用null。评审Planner的直接证据是finish_reason=length、completion_tokens=1024、reasoning_tokens=1024、content长度0，而不是只看到Token等于上限就推断截断。[真实事件](../../data/verification/p3t6-acceptance-20261117-v1/real-server/events.jsonl)。
9b6b1ea原FAIL为“三阶段必须全部normal”的额外强断言；用户裁定允许合法Degraded Success，保留旧29个证据文件后以f58b6c9复验PASS/ADR Accepted。裁定复验没有新增真实模型调用。[原FAIL](../../data/verification/p3t6-acceptance-20261117-v1/chrome-real/results.json)、[当前裁定](../../data/verification/p3t6-adjudication-20261117-v1/adjudication.json)。
证据分层：历史Chrome API替身25项；Chrome真实后端Mock模型17组；真实模型仅上述一工作流。裁定新增判定规则9、相关后端68项与17组Chrome Mock模型复验通过，包含回退失败、最终生成失败和来源校验失败。[验收第11节](./phase3-final-acceptance.md)。不相加成独立真实样本数或长期可用率。

## 6. Sensitivity Points：已确认局部影响与候选点分开

Sensitivity Point指某架构元素/参数对质量属性响应敏感。未扫描参数并不禁止分析机制，但不能宣称已确定响应曲线、最佳阈值或独立因果。下面“已确认”都限定具体案例/机制；部分支持项是候选敏感点，不冒称全面确认。

|ID / Element或Parameter|影响的质量属性|Mechanism|Evidence|Confidence|Limitation|
|---|---|---|---|---|---|
|S1 Top8预算与排序截断|D1覆盖；D2上下文开销|同一排名中第12名定义页无法进入8页；预算同时限制可供下游的证据规模|[N02根因贡献/排名](./phase2-analysis.md)、[逐例来源](./phase3-case-audit.md)|已确认局部截断；K变化的净收益为候选假设|没做K扫描或生成Token曲线；零召回N01不能靠扩大K保证解决|
|S2 Planner SYSTEM Prompt版本|D1适用性；D3增强可用性；D6成本|更紧凑关键词的指令也改变模型输出及遵从负担，覆盖/回退/usage共变|[B-v2同轮结果](../../data/verification/p3t4-bv2-analysis-20261117-v1/summary.json)、[原始新集B-v2行](../../data/verification/p3t4-bv2-comparison-20261117-v1/new-dev/b-v2/rows.jsonl)|部分支持：Prompt候选敏感点|单次随机模型输出，无重复/交叉采样，不能分离Prompt长度、服务随机性等独立因果|
|S3 max_tokens=1024输出预算|D3正常规划；D6费用/延迟|输出与推理共享服务预算时可耗尽而无可解析内容，严格校验转降级|[P3T6 length空内容](../../data/verification/p3t6-acceptance-20261117-v1/real-summary.json)、[B-v2回退](./phase3-b-v2-experiment.md)|已确认单次耗尽机制；调大预算的收益仍是假设|B-v2达到1024只证明相关性；未扫预算，不能断言提高必修复或一定多花多少费用|
|S4 15秒规划deadline|D2等待；D3降级时机|到期停止规划并回原query，减少无限等待；仍有本地检索/校验及生成|[故障原始记录](../../data/verification/p3t3-faults-20261116-v1/faults.json)、[deadline测试](../../server/tests/test_design_planner.py)|行为已验证；阈值敏感性仅部分支持|Mock规划15009ms、来源总18408ms；未比较不同deadline，非业务SLA|
|S5 最终合并/选择机制|D1互补覆盖/相关性；D5维护|轮转或代理增益/冗余惩罚决定固定池中谁占Top8；代理可先被泛概念满足|[fixed逐例](../../data/verification/p3t4-coverage-20261117-v1/fixed.jsonl)、[D03反例](./phase3-b-coverage-experiment.md)|已确认固定池选择差异及两例退化|没有单独扫描权重/相似阈值；知识oracle依赖不完整标签，不能解释成真实最优覆盖|
|S6 新增外部规划依赖|D1能力；D2时延；D3连续性；D6成本|一次网络/JSON依赖增加失败点；局部回退只能绕过Planner，不绕过最终生成模型|[真实2/1/0](./phase3-final-acceptance.md)、[HTTP/连接故障测试](../../server/tests/test_design_planner.py)|依赖行为已有支持；服务可用率敏感性为候选|未测供应商/故障率扫描、长期分布；不是证明服务整体不可靠|

**N13归因限定：**保存池确有6:19而轮转未保留，能证明已标页选择遗漏；但后续发现实际已选6:15也描述心跳超时检测，旧fault_detection漏列它。故不能用旧KC0.5断言原B或Coverage完全没有检测知识，更不能声称Coverage“救回N13”。D03检查点页丢失是更清晰的机制反例。[后续课程审核](./phase3-b-coverage-experiment.md)。
另列**评价口径敏感性E1**：N14概览/机制标签及N13漏标会改变分数解释；这是测量有效性问题，不把标签参数冒充生产架构Sensitivity。[情景重评分](./phase3-decision-evidence-review.md)保持原v4不变。

## 7. Tradeoff Points：一个具体选择如何牵动多个属性

Tradeoff Point须指向同一设计选择的多属性影响，而非并列两个抽象质量词。下表解释为本次归纳，不声称历史进行了量化效用评分。

|ID / 具体机制或决策|同时影响的属性及因果|证据|决策后果|限制|
|---|---|---|---|---|
|TP1 在来源前加入一次LLM规划及多路原检索|D1部分覆盖增加；D2/D6网络等待、Token及重复本地检索开销增加|P3T3开发KC+13.64pp、wall+6.948秒；[机器对比](../../data/verification/p3t3-analysis-20261116-v1/comparison.json)|保留默认低额外成本，增强由用户主动选择|开发收益不足以决定全面替换；新增本地时间的唯一根因未独立消融|
|TP2 严格计划/证据/目录校验＋整体回退|D3阻止不合法计划进入检索；D1增强路径可能不可用而降级，D6已花规划预算不退回|B-v2 invalid_plan6/24；[真实空规划降级](../../data/verification/p3t6-acceptance-20261117-v1/real-summary.json)|保留校验并透明回退，不修补计划来提高“成功率”|没测试宽松校验方案；不声称严格校验降低真实语义错误的定量幅度|
|TP3 以意图增益/冗余惩罚分配固定8页|希望互补性增加，却可优选泛化支持页并挤掉机制页；增加解释字段/维护职责|[Coverage同池0/2/40、D03](./phase3-b-coverage-experiment.md)|不采纳Coverage；保留原轮转，透明承认其上限|是代理优化偏离真实目标，不宣称教学多样性曾实际提升；单独权重作用未测|
|TP4 统一契约下保留两条显式路径与UI/API枚举|D4封装策略变化；D5同时增加模式、回退元数据、版本Prompt和测试组合|[Module/C&C与机制映射](./phase4-architecture-design-and-views.md)、[P3T5差异](./phase3-dual-strategy-integration.md)|接受有限双策略维护，未采用更多候选/框架|修改传播较小有静态支持；长期维护成本只有结构性推断，没有工时测量|
|TP5 原B手动可选＋15秒一次尝试＋Baseline降级|D1保留局部能力；D3/D6引入外部失败/费用，再用默认隔离、预算和回退缓解|[Accepted ADR](./phase3-final-architecture-decision.md)、[真实及故障验收](./phase3-final-acceptance.md)|手动开关而非自动路由；可靠性按增强/降级/失败分层|回退只绕过新增Planner，最终生成共用同一配置，不能声称实现供应商容灾|

TP2是格式可信边界与增强可用性的取舍，不等于“越严格总越好”；TP3相关性/互补性是功能适用性的两个方面，不硬套成不同标准质量属性。TP4的可修改性与可维护性也有关联，不假装二者完全独立。

## 8. Risks、限定Non-risks与Risk Themes

### 8.1 风险与剩余风险

|ID / 风险|事实或推断依据|已缓解什么|剩余风险及决策关系|
|---|---|---|---|
|R1 非法计划/预算耗尽|[真实length空内容](../../data/verification/p3t6-acceptance-20261117-v1/real-summary.json)，B-v2非法回退增加（O）|校验＋原因码＋原query回退|正常增强仍会失败；主动选择接受降级，不修改Prompt/预算再追结果|
|R2 来源选择延迟增加|[同批B wall更高](./phase3-evaluation-results.md)（O）|默认零Planner、一次/有界deadline|增强仍更慢，本地多检索/校验成本仍在；不承诺总业务15秒|
|R3 召回/知识选择不充分|[N01/N06共同未改善](./phase3-case-audit.md)、[D03退化](./phase3-b-coverage-experiment.md)（O）|真实来源/引用合法性边界|真实性不能修复语义充分性；Baseline默认保守但原问题仍存在|
|R4 评估口径与样本不确定|[v3/v4修正](./phase2-baseline-review.md)、[N13/14审核](./phase3-decision-evidence-review.md)（O）|版本冻结、unjudged、分层报告、原结果保留|无独立人工金标准，小保留集/单采样限制结论；不能按最高均值强行选型|
|R5 浏览器停止后后台继续|[P3T6取消/迟到观察](./phase3-final-acceptance.md)（O）|request身份/Abort/旧成果保护|只保护UI，不保证远端停止或停止计费；没有用Mock取消传播替代浏览器生命周期证据|
|R6 货币费用无法量化|usage有记录、cost=null（O：已知缺口）|一次/Token参数、用户手动选择|没有可靠单价/总费用SLA；未知不能填0，Baseline最终生成仍有成本|
|R7 双策略长期维护负担|[枚举/UI/回退/测试矩阵](./phase3-dual-strategy-integration.md)（M＋I）|局部模块/稳定契约/不加入更多策略|工时和长期故障未量化，属于有实现依据的推断；接受有限复杂度|
|R8 长期外部服务与教学效果未验证|[验收只有一真实工作流](./phase3-final-acceptance.md)（O：证据边界）|Mock故障及有限真实验收|不能推出长期可用率或学习收益；本轮不扩大成负载/长期实验|

### 8.2 Non-risks / 已缓解事项（仅限定验证范围）

|ID|有明确证据的事项|适用环境与证据|不可扩张的结论|
|---|---|---|---|
|NR1 默认兼容且不额外规划|省略/显式baseline行为一致，非法枚举422|[三阶段API测试](../../server/tests/test_design_strategy.py)、[Chrome默认验收](./phase3-final-acceptance.md)|不是任何未来接口都兼容，也不是整个业务零模型|
|NR2 已知规划异常可以合法降级|非法JSON/结构、连接/超时等回退；真实空规划业务成功|[故障API测试](../../server/tests/test_acceptance_adjudication.py)、[裁定2/1/0](../../data/verification/p3t6-adjudication-20261117-v1/adjudication.json)|只在Baseline有源且最终生成可用时构成Degraded Success；回退失败仍Failure|
|NR3 本次来源出口与引用预算有效|26次选择复验，真实页/标题/摘录/唯一/Top8；伪造被拒|[conformance](../../data/verification/p3t6-adjudication-20261117-v1/conformance.json)、[来源测试](../../server/tests/test_design_sources.py)|不认证教学结论语义充分性或未来任意资料|
|NR4 已测异常下旧成果保护|失败/取消不覆盖旧成果，旧请求晚到不污染新结果|[Chrome真后端Mock模型17组](../../data/verification/p3t6-adjudication-20261117-v1/chrome-mock/results.json)、[工作台测试](../../web/src/DesignStudio.test.tsx)|不证明跨设备、所有存储故障或服务器后台任务都被取消|

Non-risk是有条件、可复核的已缓解事项，不是绝对不可能失败，也不与R1/R5/R8相矛盾。

### 8.3 Risk Themes及决策关联

|主题|聚合风险|为何形成共同架构问题|最终决策如何应对|
|---|---|---|---|
|RT1 External AI Dependency|R1/R2/R6/R8|能力、结构不确定性、等待和费用来自新增规划依赖，且最终生成也依赖上游|默认不引入新增Planner；用户显式增强；超时/无重试/校验/回退；剩余模型依赖接受并披露|
|RT2 Retrieval Quality Uncertainty|R3及R1的语义面|计划概念、词法召回、Top8选择及论据充分性是连续但不同责任|不全面替换Baseline，不集成无净收益变体；保留真实页与失败样例，不宣称问题已根治|
|RT3 Evaluation Evidence Limitations|R4/R8|不完整标签、小样本/已观察测试和单次模型限制架构排名可信度|保留版本和配对证据；以限定可选取舍而非普遍最优结论支持ADR|
|RT4 Operational & Evolution Complexity|R5/R7并关联R6|异步生命周期、模式组合和观测/维护责任随双策略增加|临时模式、迟到/成果保护、统一契约与限定生产策略数；后台继续/计费缺口如实保留|

这些主题是本次回顾性聚类，不是历史专家投票结果。未来未验证项目只作为交接边界，不在P4T3启动新实验或算法迭代。

## 9. 最终ADR复盘：解释人工决定，不重新选型

### 9.1 选项与理由

|已有选项|可支持的优点|拒绝或接受的理由|证据/身份|
|---|---|---|---|
|完全保留Baseline|最小复杂度、无新增规划成本|仍是合理保守选择；但会放弃原B部分已见收益，用户没有选择它作为唯一能力|[阶段建议与最终ADR](./phase3-final-architecture-decision.md)（O/H）|
|原B全面替换|开发集局部改善，无需手动选择|新测试KC未超Baseline、明确额外延迟/依赖，不足以要求全部用户承担|第5节同批证据（O），不是证明B完全无效|
|Baseline默认＋原B可选|默认风险较小，局部增强可达，共享后续契约|用户接受有限维护与增强代价，策略只影响后续生成，允许合法降级|[B2 Accepted ADR](./phase3-final-architecture-decision.md)、[集成](./phase3-dual-strategy-integration.md)（H/M）|
|A/C/B-v2/Coverage进入生产|各自机制可能解决部分瓶颈|冻结版本没有稳定净收益或存在退化，不增加生产策略/框架，保留实验分支|[P3T3](./phase3-evaluation-results.md)、[B-v2](./phase3-b-v2-experiment.md)、[Coverage](./phase3-b-coverage-experiment.md)（O/H）|

不选择最高局部开发成绩，是因为质量属性取舍需要新测试、退化查询、成本及证据有效性，不能从均值推出对所有用户的效用。
允许用户手选B，是保留局部能力并隔离新增代价；这不是预测用户一定能选对最优模式。手动开关在代码中明确，没有自动质量判别/路由器；没有证据支持自动选择规则，用户批准范围也限于显式选择，因此不新增自动路由。
不再优化是用户在最后探索后的明确范围和B2决定，而非数学上证明没有更好算法。既有反证不足以支持纳入B-v2/Coverage，也不授权第四种组合。[停止与范围记录](./phase3-b-coverage-experiment.md)、[ADR](./phase3-final-architecture-decision.md)。

### 9.2 最终实现/验收是否支持决策理由

|决策理由→Driver/QAS|实验直接支持|架构推导/实现|集成验收支持|仍未证明|
|---|---|---|---|---|
|保留默认低额外代价→D2/D6，QAS02|B同批来源耗时较高|[Module分派、C&C默认路径](./phase4-architecture-design-and-views.md)，baseline无Planner|默认三阶段0 Planner、旧来源字典相同|最终生成便宜或固定秒内响应|
|保留局部增强→D1，QAS01/03|原B部分查询增覆盖，新测试总体持平|显式枚举/原B严格规划/多路轮转|真实场景和战术阶段Enhanced Success|任一用户开启必改善答案|
|合法降级→D3，QAS04|模型不确定且有实际空规划|已知规划异常回原query、共同校验，最终错误不掩盖|真实评审Degraded Success；故障正反例通过|上游整体故障时仍可最终生成、长期可用率|
|局部变化与状态保护→D4/D5，QAS05/06|原型独立，固定池可比|[统一契约及前端保护](./phase4-architecture-design-and-views.md)|静态conformance、API/Chrome及旧成果保护通过|任意未来修改零传播、服务端取消即时终止|

结论为**限定支持**：当前机制和验收兑现了人工决策的默认/可选/回退/兼容理由；长期维护、可靠性与教学价值仍是剩余风险。无需改变原ADR状态或重做B2，Accepted与Gate PASS保持。

## 10. 架构演进与验收的可追溯故事

Product Problem（P1自然需求来源缺失）→ Architecture Drivers（P2适用性/溯源/性能约束）→ Candidate Approaches（A/B/C独立）→ Controlled Experiments（P3T3及补验/变体）→ Sensitivity/Tradeoff Evidence（标签、Prompt、选择反证）→ B2 Human Decision（默认Baseline＋原B可选）→ Selective Integration（P3T5）→ Validation（P3T6及裁定）。
这里的“Sensitivity/Tradeoff Evidence”指当时逐步积累的分析事实，不声称当时已经进行本文形式的正式ATAM会议。

|里程碑|Git证据（代码而非伪文件链接）|阅读入口|
|---|---|---|
|共同实验基点|`c6fc1857928468030e6a030b13a146300bf93304`|[公共接口与等价性](./phase3-experiment-base.md)|
|统一对比/阶段权衡|`68d3f4f`|[统一结果](./phase3-evaluation-results.md)、[早期权衡](./phase3-architecture-tradeoffs.md)|
|B-v2 / Coverage反证|`e09517d` / `2de30e1`（主线报告提交）|[B-v2](./phase3-b-v2-experiment.md)、[Coverage](./phase3-b-coverage-experiment.md)|
|B2落地|`0a91d63973706d79671f3842175d0ba8ee273b66`|[选择性集成](./phase3-dual-strategy-integration.md)|
|首次验收|`9b6b1ea6f6ef14729def6475a55f4626aad2d053`|[保留FAIL原件](../../data/verification/p3t6-acceptance-20261117-v1/manifest.json)|
|人工裁定＋复验|`f58b6c9caa88a24643886f1fc4e1f1e26e4e20c3`|[最终验收第11节](./phase3-final-acceptance.md)|

只读追溯命令：`git show --stat 0a91d63`；`git show 9b6b1ea:docs/iteration3_jack/phase3-final-acceptance.md`；`git show f58b6c9:docs/iteration3_jack/phase3-final-acceptance.md`。不切换/重置分支，不把旧FAIL改成旧版本“本来就是PASS”。

## 11. 课堂可复用结论与PPT素材建议

|核心结论|支持证据|对最终架构的影响 / 页面建议|
|---|---|---|
|K1 覆盖收益是局部且有代价的|第5.1/5.2节：开发增益、新测试持平、延迟增加|解释默认保留，取同批KC＋wall表，不只展示最高分|
|K2 有效来源选择不能靠代理指标自证|第5.3节D03与0/2/40，S5/TP3|解释不集成Coverage，制作原池→两种选择→5:27丢失案例|
|K3 小Prompt改动也有架构质量风险|新集invalid_plan1→6，S2/S3/TP2|解释保留原B、版本/校验必要性；Token相关性与直接length证据分开|
|K4 可降级与增强成功是不同验收语义|第5.4节真实2/1/0、保留FAIL及人工裁定|展示可靠性案例/时间线；不把3次业务成功包装成3次增强成功|
|K5 架构选择是受约束取舍而非排行榜|6项Driver、TP1–TP5、B2人工决定及集成验证|最终ADR决策卡：默认/可选/共享出口/剩余风险|

推荐主展示：Driver→QAS映射简版、P3T3开发与保留分表、新测试KC/回退表、D03固定池反例、TP1/TP2/TP5、RT1–RT4、最终ADR与2/1/0验收时间线。
重点敏感点：S2 Prompt、S3真实Token耗尽、S5选择代理；S1用N02排名12演示，并用N13后续更正展示证据自我限定。
附录：完整P8下界/逐查询升降、六对比较、hash/commit/Token明细、协议与Mock测试入口、S4完整计时边界。技术答辩解释：同池隔离、evidence子串不认证语义、原B回调/轮转、为何不是完整GoF框架、浏览器Abort边界。
本轮不制作PPT、最终讲稿或产品演示脚本，交由P4T4。

## 12. 未解决问题、历史表述与解释限制

- P3T3保留B50%与扩充测试B66.67%来自不同数据/标签，不是前后优化收益；P8始终为不完整标注下界。新测试在后续探索中已观察，不重复称独立验证。
- 旧报告N13“丢检测知识”过强：应限定“丢已标检测页”，结合6:15审核；N14概览/机制敏感性只作独立情景分析，旧标签和结果保留。本次不确认争议页人工金标准。
- 原B全面更优、B-v2/Coverage稳定提升、长期模型可靠性、学习收益、生产负载/P95、可靠费用估计均无足够证据。单次成功与零主批HTTP错误不足以证明这些性质。
- 输出上限相关性与直接截断证据分开；15秒只约束规划，未知费用null。默认Baseline仍需最终生成模型，不是离线可用的完整AI教学流程。
- 可修改性收益有代码/契约证据，长期维护成本及用户能否有效选择模式尚属推断/未测。手动选择是限制新增代价的决策，不是新的质量保证算法。
- 局部Non-risk不覆盖真实上游取消/计费、任意存储故障或所有学生输入；已接受剩余风险不代表消除风险。

## 13. 关键过程材料与交接

|入口|实际内容及用途|
|---|---|
|[P4T1 Evidence Index](./phase4-evidence-index.md)|唯一总导航：正式材料、Worktree原型、代码/测试、原始产物及迁机限制|
|[P4T2理论与视图](./phase4-architecture-design-and-views.md)|6项Driver/6个QAS、Module/C&C、8项机制；本文直接复用编号|
|[P1主任务](./phase1-task-definition.md)、[P2根因](./phase2-analysis.md)|问题范围和两种已复现机制，不以事后选择改写初始意图|
|[P3T3协议](./phase3-evaluation-protocol.md)、[结果](./phase3-evaluation-results.md)、[复现](./phase3-reproduction.md)|冻结条件、质量/计时分母及查询级原件入口；本轮不执行真实重跑|
|[关键页复核](./phase3-decision-evidence-review.md)、[B-v2](./phase3-b-v2-experiment.md)、[Coverage](./phase3-b-coverage-experiment.md)|标签敏感性、Prompt反证、固定池反证和6:15更正|
|[Accepted ADR](./phase3-final-architecture-decision.md)、[集成](./phase3-dual-strategy-integration.md)、[验收](./phase3-final-acceptance.md)|人工决策、选择性实现、原FAIL/裁定PASS，当前生产状态的最终依据|

本轮本地文档提交只新增本文、更新索引；不修改生产、Prompt、历史标签/结果或旧ADR，不新增模型调用，不Merge/Push或删除Worktree。完成后停止P4T3，不直接执行P4T4。

文档检查：本文109条相对文件链接/39个去重目标、索引181条链接/90个去重目标均存在且大小写匹配，无本机绝对路径；6个S、5个TP、8个R、4个NR、4个RT编号完整。已只读提取原始JSON/JSONL核对第5节指标、B-v2新集原因码与D03来源，不重算/覆盖历史评估。Git diff空白检查通过，未运行产品测试或新模型实验。
