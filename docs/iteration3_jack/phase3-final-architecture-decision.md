# ADR：Baseline 默认，原始 B 显式可选

状态：**Accepted**

2026-11-17人工验收裁定与复验：用户确认合法规划回退可构成Degraded Success，不要求三阶段Planner全部成功。历史真实记录重新分类为Enhanced Success 2、Degraded Success 1、Failure 0；29个历史文件哈希及真实来源重新核验通过。本轮9项判定规则、68项相关后端、17组Chrome真实后端Mock模型验收通过，新增真实调用0。**当前Gate PASS，Phase 3完成**。增强成功不包含降级成功；原始FAIL、Token耗尽和后台任务可能继续等限制仍保留。详见[人工验收裁定与复验](phase3-final-acceptance.md#11-p3t6-acceptance-adjudication--人工验收裁定)。

P3T6首次验收（2026-11-17，历史）：独立验收保守 Gate FAIL，条件当时不解除。[验收报告](phase3-final-acceptance.md)记录259项后端、152项前端、25项Chrome API替身回归通过；真实增强三阶段业务均完成，但评审Planner触及1024 Token上限返回空内容并回退，“三阶段全部normal”额外强断言失败。前两阶段正常增强成功，回退符合业务契约；当时未放宽Prompt/算法/预算，等待人工裁定。该历史FAIL及其原始证据保留；当前结论见上文裁定。

决策日期：2026-11-17。决策人角色：用户／项目架构决策人；依据P3T5明确授权及本次P3T6人工裁定。批准范围为架构实践三阶段双策略集成，P3T6裁定与复验已完成。不是宣称原B整体优于Baseline。

## 1. Context 与证据

自然需求到课程来源有词法召回、排序和Top8预算不足。A/B/C及B-v2/B-Coverage实验均已结束，不再优化。Baseline快且无额外规划；原B在部分需求提高覆盖，但新测试整体覆盖与Baseline同为66.67%，来源选择约8.10秒对3.06秒。B-v2新测试55.56%并增加回退；Coverage固定池0升2降40平。P8是不完整标注下界，AI标注未经独立人工认证；6:15检测机制遗漏揭示标签解释限制。最终教学质量未充分验证。

证据：[P3T3结果](phase3-evaluation-results.md)、[关键审核](phase3-decision-evidence-review.md)、[B-v2](phase3-b-v2-experiment.md)、[Coverage](phase3-b-coverage-experiment.md)。数字属于各自冻结条件，不当作普遍用户总体准确率或生产P95。

## 2. Decision Drivers

功能适用性需要允许尝试局部增强；交互延迟不应由全部用户承担；上游模型依赖须有输入校验、预算、超时与回退；策略职责隔离以便修改；集成和维护范围限于两条已验证链路，不增加更多生产策略。

## 3. Considered Alternatives

|选项|取舍|
|---|---|
|仅Baseline|成本最低但放弃原B局部收益，本轮不作为唯一能力|
|原B全面替换|证据不足且延迟/依赖代价需全量承担，不采用|
|Baseline默认＋原B可选|本次人工批准，用户显式接受下一次生成的额外代价|
|A/C/B-v2/B-Coverage|无稳定净收益或有退化，不进入生产|

## 4. Decision 与 Rationale

正式采用 **Baseline by Default, Optional LLM-Assisted Retrieval**。请求省略策略或显式baseline都走旧来源逻辑；只有llm_assisted触发原B。三阶段统一入口、不自动路由、不因AI功能已配置就自动增强。

使用手动选择隔离运行时质量属性代价；模式只影响后续生成，不修改已有成果或持久化全局偏好。接受维护一个有限双策略接口，避免引入未经验证的策略组合。原B的配置/Prompt/3意图/轮转/15秒/一次尝试及失败回退保持；规划失败不是最终生成成功保证。

## 5. 轻量ATAM与质量属性取舍

|场景/Driver|战术与敏感点|Tradeoff / Risk / 限定Non-risk|
|---|---|---|
|学生普通请求→来源→生成|默认策略、职责分离、向后兼容枚举|不增加规划调用；仍有已知召回不足，不是离线教学|
|学生主动增强→多意图来源|结构化规划/轮转/有界资源；意图粒度和原query名次敏感|局部收益可能换取延迟/费用，不能保证更准确|
|模型非法/超时→Baseline|Input Validation、15秒Timeout、无重试、Graceful Degradation|约15秒规划等待后仍需检索/校验；最终生成仍依赖同一上游|
|策略修改→其他功能不变|统一SourceSelection、内部诊断、业务范围封装|增加UI/API/Prompt/测试维护；公共问答/搜索/自测不受策略参数影响|

实证敏感点是概览/机制标注粒度与结果解释、Prompt/输出预算、已观察轮转遗漏；运行时开关是选择质量属性代价的显式策略选择，不是自动质量保证。真实取消后后台生命周期、上游计费和最终教学价值仍待验。

## 6. Consequences 与边界

正向：默认不变，旧客户端无需加字段；增强能力局部可用且有清楚退路；统一来源真实性/Top8/引用检查。代价：增强每阶段最多额外一次模型调用，三阶段均选增强最多三次规划，加原有三次最终生成；未知费用不可记0。需要维护版本化Prompt、严格校验和页面级选择状态。

API只接受baseline/llm_assisted；未知识别422，不暴露任意模型参数。增强成功响应提供安全retrievalFallback布尔，基线响应不增加该字段。内部queries/plan/usage/异常不送前端。所有模式仍需最终生成配置，缺配置503不伪造回答。

## 7. Validation Conditions — P3T6裁定与复验完成

独立核对默认无额外规划、原B Prompt/hash与轮转一致、真实PPT/OCR/来源标题摘录/Top8与引用；真实模型增强→分析→战术→评审及回退；Chrome全业务流程、加载/停止/迟到/失败/旧成果/保存失败保护；未配置503、无来源422、最终生成502；旧固定关键词、普通问答/自测/搜索不污染；端到端耗时/真实取消与费用记录；前后端全量门禁、构建与必要CI。

P3T5实际测试和范围见[集成记录](phase3-dual-strategy-integration.md)。P3T5测试通过本身不能关闭条件；本次以独立P3T6证据、人工裁定及针对性复验关闭条件。真实取消的后台生命周期、费用未知及有限样本等限制见[验收报告](phase3-final-acceptance.md)。不声称远端CI通过或真实增强长期可靠性已证实。

## 8. Human Approval Record

|事项|用户本轮批准|
|---|---|
|架构|Baseline默认＋原始B显式可选|
|延迟/费用/依赖|仅用户主动增强时承担，仍有模型/服务风险|
|范围|只在架构实践工作台三阶段；不引入A/C及B变体|
|集成方式|主线选择性移植必要实现，禁止直接Merge实验分支|
|验收|原P3T5附条件；本次用户裁定允许合法降级，P3T6复验PASS，条件关闭|

没有独立人工金标准标注批准；本次批准架构取舍不等于确认所有争议页标签，也不等于证明B整体更优。

## 9. Decision History 与保留材料

此前Codex在Proposed ADR中建议保留Baseline，不集成额外策略；关键页敏感性、B-v2退化、Coverage负面结果均保留。本次用户选择的是不同的有限双策略取舍，不改写那些实验事实。

|阶段|历史记录|
|---|---|
|P3T3|68d3f4f：B优先补验、Baseline保守默认|
|P3T4审核|e66b317：Proposed建议Baseline，费用/延迟及标注待人工|
|B-v2|e09517d：Prompt优化未获新测试净收益|
|Coverage|2de30e1：最后探索结束，0升2降40平；6:15标签解释更正|
|P3T5|2026-11-17用户批准默认Baseline＋可选原B，条件验收|
|P3T6首次|9b6b1ea：保守FAIL，额外全阶段normal断言失败，证据保留|
|P3T6裁定与复验|2026-11-17用户确认Enhanced/Degraded Success均满足业务连续性；复验PASS，ADR Accepted，Phase 3完成|

旧Proposed ADR完整文本仍在Git历史，可用`git show 2de30e1:docs/iteration3_jack/phase3-final-architecture-decision.md`复核；旧报告、标注、候选分支及原始数据不删除。[旧集成准备](phase3-integration-plan.md)是批准前历史计划，当前实施以本ADR和P3T5记录为准。
