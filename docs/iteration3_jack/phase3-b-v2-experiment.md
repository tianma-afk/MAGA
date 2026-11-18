# P3T4 B-v2 扩展实验与架构再评估

日期2026-11-17。状态：受控迭代与正式比较完成，结果不支持集成B-v2；ADR仍Proposed，等待人工B2。未Merge、Push或切换生产默认。

## 1. 动机与数据资产

主线执行前e66b317；原B4f878dc，Baseline c6fc185，B-v2 cf5ba925662183daa8bf643dabade9ac2ce9c359（独立experiment/iteration3-b-v2，父提交为原B）。A/C保持原样。

历史12开发（11评分）+4原保留（3评分）+6补充（6评分）共22条，均已被分析，不能冒充新测试。旧v3/v4及冻结结果不改；历史层保持各自原口径，不与新机制口径拼接宏平均。

新增24条：D01–D14开发14（13评分），T01–T10测试10（9评分）。覆盖可用性、性能、可修改性、安全边界、互操作性，多知识、跨属性、自然/明确术语及2个支持不足/歧义边界例。需求是AI构建而非真实学生随机样本；作者知悉旧集，不是人工盲测。每例含类别/属性/原需求/必要知识/依据/歧义/split/标注建议。

## 2. 机制性标注和冻结

topics.pages为机制直接支持的可接受替代页，basis给课程依据；每必要知识至少一页（OR），不同必要知识分别计覆盖（AND式完整要求）。不把概览词条当机制。weakSupport在case.annotation中明确；未审页仍unjudged，不当irrelevant。所有判断为Codex依据PPT/OCR的建议，不是独立人工金标准。

源文核对：5:29有限重试；5:27检查点回滚；7:26–28职责/内聚；6:3/39语义解释及6:40接口转换；8:23事件优先级；2:5访问边界原则。新response_capacity只接受8:28/29/30，排除概览20与仅争用诊断16。security需求仅原则，不声称课程提供密码算法证明。

初稿iteration3-bv2-expansion.json在实现前冻结。D03泛recovery无法精确覆盖回滚/检查点，在任何候选运行前另存v2，新增rollback_checkpoint=5:27；原初稿保留。变更仅开发D03，10条测试hash与实现前一致。

最终fixture SHA256：`eb42f3a6f0ef219f461791e16010dd18ec698baf01b41d4dd06fc0046d646c57`；测试JSON规范序列hash：`06cf1c30f9742ce3425d22a4dccdc529541891f843964e193c7e733458823189`。原冻结与v2冻结分别保存在p3t4-bv2-data-freeze.json / -v2.json。代码先提交cf5ba92，再执行测试结果；未据新测试调整Prompt或标签。

## 3. 原B阶段性失败归因

选择优化前依据已有计划和最终来源识别“概念正确但查询仍是自然业务句”的词法适配问题；本轮随后用保存计划作离线Top8池重放，进一步分解瓶颈，不发模型请求、不把重放当fresh。

|案例|已保存计划/池证据|主要分类|
|---|---|---|
|N01|识别availability/performance但实际查询长，所有路Top8均无已标可用性页|Lexical Recall Failure；规划查询适配不足|
|N03/N13|检测页6:17或6:19在各路池并集中，最终未选；恢复页在最终|Source Selection / Budget-Truncation|
|N14|唯一已标容量页8:20概览，严格机制解释不充分|Annotation Ambiguity，不应靠调Prompt补分|
|N15/S02|规划大体方向合理但Top8池无接口隔离/缓存目标页|Lexical Recall Failure|
|N06|invalid_plan回退，保存记录没有原始非法文本|Planning Failure（结构类别未知），非已证语义错误|
|S03|8:9优先级已入池但未进入最终|Source Selection / Budget-Truncation|
|N02/S01|机制/属性词命中5:6或5:17/18，合并后保留|成功反例：规划并非总失败|

该小批同时存在召回和选择问题，无法确认唯一主导瓶颈。选规划词法适配作为最小、低代码风险实验，而不是声称LLM理解是全部根因；不预设B+C，也不引入覆盖重排。完整查询/各池页/并集及最终交集见p3t4-bv2-history-diagnostic.json。

## 4. B-v2架构变化与验证

仅SYSTEM Prompt及PROMPT_VERSION变为iteration3-planner-v2-keywords：输出紧凑课程机制检索词、去业务名/问句、必要时标准中英术语、3意图内保留互补需求。课程concept目录、严格模型/evidence子串/禁额外字段、httpx协议、无重试、15秒/1024输出token、原query检索、轮转、Top8、真实性出口和最终生成完全不变。无A规则映射/C重排/Embedding/新依赖。

相对原B提交仅3文件：server/design_planner.py、server/tests/test_design_planner_v2.py、docs/iteration3_jack/phase3-prototype-b-v2.md。新增2针对测试；B-v2完整后端+工具228通过，1既有警告，37.13秒；103手写文件无超限。主线新增数据/工具后206通过，1既有警告，31.71秒；行数器自身2通过，113文件检查无超限（后新增只读诊断脚本再次门禁见交付）。

## 5. 同轮新数据对照

P8是部分标注下界；KC按评分例宏平均。遗漏比例为1−KC，不称完整回答失败率。wall对全部例（含边界）取单次均值，含候选出口校验，不含评分/额外复核。没有足够重复测量支持生产P95。

|集合|方案|P8下界|KC8|必要知识遗漏|平均wall秒|回退/例|
|---|---|---|---|---|---|---|
|new-dev|baseline|17.31%|65.38%|34.62%|2.072|0/14|
|new-dev|b|18.27%|73.08%|26.92%|6.256|0/14|
|new-dev|b-v2|20.19%|69.23%|30.77%|7.270|4/14|
|new-test|baseline|15.28%|66.67%|33.33%|3.057|0/10|
|new-test|b|20.83%|66.67%|33.33%|8.104|2/10|
|new-test|b-v2|19.44%|55.56%|44.44%|9.334|4/10|

## 6. 历史层回归（原B为保存的历史online，非本轮fresh）

|集合|Baseline KC|原B KC|B-v2 KC|B-v2相对原B 升/降/平|
|---|---|---|---|---|
|history-dev|50.00%|63.64%|68.18%|2/1/8|
|history-holdout|33.33%|50.00%|33.33%|1/1/1|
|history-s|58.33%|66.67%|66.67%|0/0/6|

历史B-v2平均wall旧dev6.994秒、旧holdout5.973秒、旧S11.194秒，但原B异日测量，不据此宣称提速。历史KC/P8逐例与全部指标保存在summary.json。

## 7. 所有成对升降与案例

|集合|对照|ΔKC百分点|升/降/平|退化ID|
|---|---|---|---|---|
|new-dev|b-baseline|+7.69|1/0/12|无|
|new-dev|b-v2-baseline|+3.85|2/1/10|D06|
|new-dev|b-v2-b|-3.85|1/1/11|D06|
|new-test|b-baseline|+0.00|0/0/9|无|
|new-test|b-v2-baseline|-11.11|0/1/8|T03|
|new-test|b-v2-b|-11.11|0/1/8|T03|
|history-dev|b-baseline|+13.64|2/0/9|无|
|history-dev|b-v2-baseline|+18.18|3/0/8|无|
|history-dev|b-v2-b|+4.55|2/1/8|N02|
|history-holdout|b-baseline|+16.67|1/1/1|N13|
|history-holdout|b-v2-baseline|+0.00|0/0/3|无|
|history-holdout|b-v2-b|-16.67|1/1/1|N14|
|history-s|b-baseline|+8.33|1/0/5|无|
|history-s|b-v2-baseline|+8.33|1/0/5|无|
|history-s|b-v2-b|+0.00|0/0/6|无|

成功：D01、N03、N04、N13等存在改善；N13由0.5到1，标准化故障检测/heartbeat词有效。失败/回归：新D06、测试T03各相对原B−1；历史N02丢原收益，N14也下降。S02即使产生cache/consistency词仍KC0，规划关键词不保证Top8保留；不能把失败都归因模型理解。

独立测试阶段已冻结，看到结果后没有再次调参。测试9评分例B-v2对原B 0升1降8平；不是总体显著性证明，但足以否定“本版在该集稳定改善”的主张。完整需求、真实页排序/标题/grade在all-query-audit.md及原始rows.jsonl，未隐藏退化。

## 8. 性能、模型与费用

|集合|方案|规划秒|检索合并秒|校验秒|调用|输入/输出Token|
|---|---|---|---|---|---|---|
|new-dev|baseline|0.000|1.313|0.759|0|0/0|
|new-dev|b|2.931|2.672|0.651|14|3910/5841|
|new-dev|b-v2|4.277|2.368|0.624|14|5534/8640|
|new-test|baseline|0.000|1.955|1.101|0|0/0|
|new-test|b|3.096|3.899|1.107|10|2790/4436|
|new-test|b-v2|4.058|3.974|1.301|10|3950/6420|

本轮70次真实规划=原B新24+B-v2新24/历史22，无重试、无最终生成，模型请求/实际均deepseek-flash。输入24913、输出37752，总62665 Token；全部usage可得，货币费用null。旧B历史22次不重复计入本轮账本。输出最大1024，未超预算；不是费用为0。

原B新集回退2/24（invalid_plan1、uncertain1）；B-v2新集8/24（invalid_plan6、uncertain2），B-v2历史3/22，共11/46。全部8次invalid_plan恰好completion_tokens=1024，提示预算/输出结构敏感性；由于候选没有保存非法正文或finish_reason，不能断言都是截断或指定schema错误。没有为修复坏结果追加采样或放宽token上限。

这次Prompt更长、规划时间与Token增加，且schema有效性更差；测试Mock验证结构/故障，不保证真实Prompt遵从。B-v2对D14/T10表示uncertain是边界行为，不进质量宏平均。主批0错误、0真实timeout/HTTP故障不证明上游可靠性；原B完整故障/取消/API断言随B-v2228项回归执行。

## 9. 轻量ATAM：场景、战术与敏感点

|Driver/质量属性场景|机制与观察|权衡/风险|
|---|---|---|
|适用性：学生多知识需求→检索在8页内给机制依据|职责分离与规划Prompt；N13改善，新测试T03退化|关键词集中可能挤出其他知识，覆盖收益不稳定|
|性能：一次来源请求→校验后返回|有界3意图/8页，15秒规划timeout；新测试9.334秒高于原B8.104|不额外调用仍可能更慢；生产P95/吞吐未测|
|可靠性：模型非法/超时/取消→保留原语义|Input Validation、Timeout、原query回退、取消传播；真实invalid_plan增加|Graceful Degradation恢复可用路径但不保证知识充分；真实取消计费未证|
|可修改性：调整规划策略→公共检索/API不变|Encapsulation of Change，只有Prompt/版本；框架/依赖不变|代码少不等于行为风险低，Prompt也需版本/独立测试|
|可测试性/成本：同数据可追溯|保存commit/Prompt/hash/usage，Mock故障与fresh分开|同作者标注、单次模型采样；货币成本仍未知|

实测敏感点：v4概览/机制口径改变结论（前轮证据）；本轮Prompt版本与回退/Token/覆盖变化共现，8次非法输出达1024上限。不能单凭关联分离Prompt长度、模型随机性和schema失败的独立因果。候选敏感点：轮转意图顺序、原query名次、术语语言、意图粒度、重复章节读取；本轮未做多参数消融，不声称已证最优。

Non-risks（限定）：共同源校验与Top8/原需求/503/422/502通过回归，主批来源出口均合法；这不涵盖最终教学充分性或所有用户任务。Risks：更多结构回退、已知收益丢失、原轮转仍会遗漏；新增Prompt复杂度/Token不值得本轮所见收益。不是B+C：没有加重排、宽池或确定性映射。

## 10. 决策与有效性

Observation：独立新测试Baseline=原B 66.67%，B-v2 55.56%；B-v2更慢且更易回退。Interpretation：该有限规划改进只解决部分词法落点，未消除合并预算和语料问题。Recommendation：维持Baseline默认，不集成本版B-v2；原B保留后备但该新测试覆盖也未优于Baseline，不因P8下界高就默认采用。ADR仍Proposed，最终B2由人工决定。

Uncertainty：数据AI构建/标注同源，测试9评分、非随机且每属性例数少，单次模型采样；未审来源较多。未测最终教学效果、生产P95、真实取消生命周期。历史异日参考不得当同轮性能胜负；新测试不再用于调参，若未来开发需新验证。无需为了本轮完工再造第四候选。

## 11. 复现与Git交接

数据生成脚本prepare-bv2-data.py仅初次冻结，拒覆盖；主实验直接读取已提交v2 fixture。正式命令：

```powershell
& 'D:/app_install/miniconda/envs/maga/python.exe' scripts/run-bv2-comparison.py --output data/verification/p3t4-bv2-comparison-20261117-v1
& 'D:/app_install/miniconda/envs/maga/python.exe' scripts/analyze-bv2-comparison.py --run data/verification/p3t4-bv2-comparison-20261117-v1 --output data/verification/p3t4-bv2-analysis-20261117-v1
& 'D:/app_install/miniconda/envs/maga/python.exe' scripts/diagnose-design-plans.py --output data/verification/<新离线诊断>.json
```

重跑全部需换新output且重新确认真实预算，不删除旧结果。冻结协议phase3-b-v2-protocol.md。run freeze.json含完整命令、版本、工具/数据/协议/89项PPT-OCR原字节hash；各worker manifest含环境/包版本/源码hash/模型/时间。fixture/测试hash上文可核验。B-v2资源为独立副本且与基线一致；生产主线未混入候选。

预算worker由旧worker复制仅将许可上限30改80；旧worker和旧评分不改，variant=b表示同一网络注入方式，B与B-v2身份由目录和commit区分。历史保存online不是新replay。原始记录、诊断、summary及逐query审计在data/verification忽略目录，未提交大量结果或凭据。

B-v2分支提交cf5ba925仅3文件；主线提交本轮数据/工具/报告和Proposed ADR增补。A/B/C和独立Baseline保持原提交；没有合并、推送、删除worktree或接受生产选型。前端/最终生成无变化，本轮未重复构建/E2E/真实生成，不把旧通过当本轮新验收。完成后停止，等待人工B2。
