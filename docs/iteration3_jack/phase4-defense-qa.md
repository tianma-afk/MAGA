# P4T4：课堂答辩 Q&A（20题）

2026-11-18。回答区分代码机制、历史观察、解释与人工决策；完整主线见[最终报告](./phase4-final-architecture-report.md)，不把有限证据说成普遍证明。

## 一、架构基本概念

### 1. 为什么是架构问题，而不只是检索算法问题？

**答：**算法是局部机制，但引入Planner会改变需求转换职责、外部依赖、等待与故障边界；最终还需决定默认路径、来源契约和修改传播范围。我们用多个机制的质量属性代价支持架构决策。
证据：[Drivers与边界](./phase4-architecture-design-and-views.md)、[ADR](./phase3-final-architecture-decision.md)。避免：“任何排序改动都是全系统架构重构”。

### 2. Module View 与 C&C View 有什么区别？

**答：**Module表达源码单元及静态依赖，C&C表达运行中组件及连接。Planner是后端文件/职责，不是独立部署服务；浏览器与后端之间是HTTP连接，不是源码import。
证据：[P4T2 §5–6](./phase4-architecture-design-and-views.md)、[预览](./assets/p4t4/README.md)。避免：“一个模块必对应一个微服务”。

### 3. 这里完整实现了 Strategy Pattern 吗？

**答：**准确说是Strategy-like函数分派：请求枚举选择两个来源路径，共同返回SourceSelection。没有策略接口类、对象注册器或完整GoF类族；这一轻量实现已足够本轮两条路径。
证据：[来源分派](../../server/design_sources.py)、[理论说明](./phase4-architecture-design-and-views.md)。避免：“用了if分支就证明完整架构模式”。

### 4. Tactic、Pattern、Structure、View 如何区分？

**答：**Structure是元素关系，View按关注点表达结构；Pattern是可复用组织方案，Tactic是影响质量属性响应的选择。这里超时/降级是具体机制，模块化单体是组织方式，不能把每张图都称新模式。
证据：[概念与T1–T8映射](./phase4-architecture-design-and-views.md)。避免：把三阶段业务流程叫作新架构模式。

## 二、质量属性与 ATAM

### 5. 知识覆盖为什么与性能存在权衡？

**答：**在来源前增加网络规划和多次本地检索，可能获得互补知识，也增加等待与Token。P3T3同批开发B比Baseline KC高13.64个百分点、来源wall多6.948秒；新测试覆盖又没有领先，不能只看开发均值。
证据：[TP1](./phase4-atam-and-decision-review.md)、[统一结果](./phase3-evaluation-results.md)。避免：“覆盖越高，任何延迟都值得”。

### 6. 如何识别 Sensitivity Point，与 Tradeoff Point 有何不同？

**答：**前者关注元素/参数对某属性的敏感响应；后者是同一选择牵动多个属性。真实1024预算耗尽是局部机制证据；严格校验同时保护边界并增加降级，是权衡。没做参数扫描就不能宣称最佳阈值。
证据：[S1–S6 / TP1–TP5](./phase4-atam-and-decision-review.md)。避免：“一切参数都已实验证明敏感”“两个属性并列就是权衡”。

### 7. 为什么采用回顾性轻量 ATAM？

**答：**我们依据已发生的方案、实验和人工决策复盘质量属性冲突，用ATAM思路组织风险。没有外部专家、正式工作坊或投票，所以不能声称完整正式ATAM；分类编号是事后归纳。
证据：[方法范围](./phase4-atam-and-decision-review.md)。避免：虚构效用树投票、利益相关者会议。

### 8. QAS 的 Response Measure 怎么定？

**答：**来自现有契约与可测证据，例如每阶段Planner≤1、真实唯一来源≤8、默认零Planner、故障分层统计。覆盖与wall可测，但没有历史批准的普遍改善阈值或全业务秒级SLA，不事后补阈值宣布成功。
证据：[六要素QAS-01–06](./phase4-architecture-design-and-views.md)。避免：“15秒内所有业务必须返回”。

### 9. 哪些质量属性还未充分验证？Non-risk 是无风险吗？

**答：**长期模型可靠性、生产负载/P95、学习收益、货币总成本、上游真实取消及用户正确选模式都不足。Non-risk仅指特定条件下已有证据支持的行为，例如已测默认兼容和合法回退，不是普遍无风险。
证据：[R/NR/RT](./phase4-atam-and-decision-review.md)、[验收风险](./phase3-final-acceptance.md)。避免：“Gate PASS证明所有质量目标达成”。

## 三、实验与决策

### 10. 质量分数可信吗，为什么不报告完整 Precision / Recall？

**答：**分数在冻结AI标注口径下可复现，但不是独立人工金标准。KC用必要知识的允许替代页；P8下界只计算已标直接相关页/8，未审页不当成已知无关。缺少完整相关页全集，不能冒称完整Recall。
证据：[正式协议](./phase3-evaluation-protocol.md)、[案例局限](./phase3-case-audit.md)。避免：“P8下界低证明其他页全部无关”。

### 11. B保留集领先，为什么不直接选B替换？

**答：**原保留只有3评分例，B相对Baseline1升1降1平；后续新测试9评分例二者KC都66.67%。局部收益加上额外延迟/依赖，不足以支持全部请求切换。
证据：[统一结果](./phase3-evaluation-results.md)、[扩充结果](./phase3-b-v2-experiment.md)。避免：“B完全无效”或“B已全面胜出”。

### 12. B-v2 为什么没有提升？

**答：**同轮新测试KC由原B66.67%变为55.56%，T03退化；新24例invalid_plan由1增为6。Prompt改变可能改变查询落点和遵从负担，但单次采样不能分离各原因；达到1024Token不独自证明所有非法输出均截断。
证据：[B-v2实验](./phase3-b-v2-experiment.md)、[S2/S3证据强度](./phase4-atam-and-decision-review.md)。避免：“已经证明只要调大Token就解决”。

### 13. B-Coverage 为什么失败？N13能作为证据吗？

**答：**同计划同候选42评分例0升2降40平，D03丢失检查点页，说明意图增益代理可挤掉必要机制。N13旧标签漏列已选6:15，不能说完全无检测知识；更清楚的反例是D03。固定候选控制了Planner随机性。
证据：[同池方法与D03/N13](./phase3-b-coverage-experiment.md)。避免：“意图覆盖等于知识覆盖”“新选择救回N13”。

### 14. B没有稳定优势，为什么仍集成？

**答：**用户批准的是保留局部增强能力，并让主动选择者承担额外代价；默认仍Baseline。这是有限功能与成本隔离的架构取舍，未证明用户能总选对，也不是实验自动得出唯一最优解。
证据：[人工批准ADR](./phase3-final-architecture-decision.md)。避免：“可选所以完全没有成本或风险”。

### 15. 双策略是否增加维护成本？为什么不自动路由？

**答：**会增加UI/API、诊断与测试组合；统一来源契约把变化限制在实践路径，但未来工时未测。自动路由没有实现和验证证据，本轮只保留有限显式选择，避免再引入未验证决策器。
证据：[TP4/TP5](./phase4-atam-and-decision-review.md)、[集成边界](./phase3-dual-strategy-integration.md)。避免：“封装后零维护”“系统会自动选最优模式”。

## 四、工程与可靠性

### 16. Planner失败怎么办，最终生成失败也能回退吗？

**答：**已知规划超时、网络、非法计划等回原query，并标记降级；仍须有合法来源且最终模型成功。缺配置503、无来源422、最终生成502继续可见，仓储/来源违约不能包装成功。降级不计增强成功。
证据：[Planner](../../server/design_planner.py)、[五类API结果](../../server/tests/test_acceptance_adjudication.py)。避免：“任何LLM失败都可离线成功”。

### 17. P3T6最初FAIL，后来PASS，是不是掩盖失败？

**答：**原额外断言要求三次Planner全normal，但契约本来允许合法回退。用户明确裁定三阶段业务成功、至少一次真实增强、正确回退/来源/旧成果条件保留；原29文件哈希和失败事件不变。真实仍2增强1降级0失败，离线重放和故障注入支持最终PASS，没有新增真实成功冒充。
证据：[验收§11](./phase3-final-acceptance.md)、[裁定原件](../../data/verification/p3t6-adjudication-20261117-v1/adjudication.json)。避免：“修正后Planner三次都成功”。

### 18. 如何证明引用真实？是否意味着结论正确？

**答：**出口核对真实章节/页、标题、摘录、去重和预算；最终引用必须属于本次sources，标题由真实来源规范化。这阻止伪造定位，但不能证明该页充分支持每句结论，语义溯源仍需独立审核。
证据：[来源校验](../../server/design_sources.py)、[生成引用校验](../../server/design.py)。避免：“页码合法=教学内容必然正确”。

### 19. 默认Baseline真没变吗？用户取消后会立即停模型吗？

**答：**省略策略/显式Baseline走legacy，历史完整来源等价和默认零Planner通过；最终生成仍存在。取消及请求身份保护阻止旧响应覆盖成果，但不保证后端/供应商立即停止或不再计费，历史已观察后台任务继续。
证据：[策略测试](../../server/tests/test_design_strategy.py)、[QAS-02/06](./phase4-architecture-design-and-views.md)、[验收限制](./phase3-final-acceptance.md)。避免：“标准模式零模型费用”“点停止绝不再计费”。

### 20. 为什么没直接Merge B？Git分支对架构实践有什么意义？

**答：**共同基点使三原型可追溯、机制独立；冻结commit和原始结果支持复核与反证。生产只移植原B必要实现和有限接线，避免带入实验产物或其他策略；保留分支不等于它们已部署。历史FAIL/未采纳变体也是证据，不删除。
证据：[实验基点](./phase3-experiment-base.md)、[Git索引](./phase4-evidence-index.md)、[选择性集成](./phase3-dual-strategy-integration.md)。避免：“三个候选已合并成最优组合”“本地测试通过即远端CI通过”。

迁机时data/Worktree链接可能缺失，应先按[证据索引](./phase4-evidence-index.md)核对；主线讲述与时间安排见[逐页规划](./phase4-presentation-outline.md)，现场失败应按[演示预案](./phase4-demo-script.md)如实切换证据。
