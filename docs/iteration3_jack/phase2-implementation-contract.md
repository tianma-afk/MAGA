# Phase 2 / Task 4：架构约束、开发契约与实施准备

日期：2026-11-15。状态：**供B1审批的工程契约草案，尚未批准启动实验，未实现任何候选。** 用户已确认三个独立竞争原型及B使用LLM规划；具体模型、费用、参数和共同提交范围仍待确认。约束在B1批准后成为Phase 3开发依据，不代表最终选型。

沿用 [实验设计](phase2-experiment-design.md)，不重写 [根因/方案比较](phase2-analysis.md)、[Phase 1范围](phase1-task-definition.md)和 [基线](phase1-baseline.md)。评分限制见 [协议](phase2-evaluation-protocol.md)、[复核记录](phase2-baseline-review.md)。本次不创建约束检查器；下文区分现有检查入口和Phase 3需要补充的检查。

## 1. 共同架构约束

违反表中约束时默认处理为：记录约束ID及证据、停止将该版本列为合格候选，修正并复验；确需偏离按第9节先获批准，不能以高分抵销。表中“变更审批”不是允许开发者自行扩大范围。

| ID | 可检查约束 | 架构依据/范围 | 验证方式 | 违反时处理 |
| --- | --- | --- | --- | --- |
| G01 | 保留FastAPI模块化单体；不新增服务、数据库、队列、Embedding基础设施或插件框架；不做无关重构 | ADR-001/002、主任务边界；全部候选 | diff文件/依赖清单、启动命令审查；检查新增网络入口 | 撤回越界部分或先申请范围变更 |
| G02 | 依赖沿实践协调→来源策略→检索/仓储；通用检索和仓储不依赖实践策略、前端或评估fixture；不新增循环依赖 | 现有模块职责；全部候选 | 新模块import图审查、导入冒烟；静态import扫描结合人工确认 | 消除反向/循环依赖，再跑导入和集成 |
| G03 | 来源必须从ChapterStore真实页读取；chapterId/整数页号/标题/摘录一致，禁止模型页码或补写课件 | ADR-003/004、引用契约；全部输出 | 逐来源与仓储/excerpt比较；非法ID/越界/伪标题测试 | 视为硬性失败，不送最终模型 |
| G04 | 最终来源0–8页，按(chapterId,slide)去重；不凑页，保留共同excerpt上限；记录页数和sources字符数 | Top-8比较条件；共同适配输出边界 | 0/1/8/>8、重复和长页测试，运行时边界检查 | 拒绝策略违约，不静默扩大预算或截断掩盖bug |
| G05 | 对外请求/响应/引用、前端和存储保持；输入422、缺配置503、无来源422、最终生成错误502语义保持 | 现有API/Pydantic/状态测试；全部分支 | API契约、无配置保护、草稿/版本/导出测试 | 阻止候选验收，恢复兼容或先申请变更 |
| G06 | 公共搜索默认排序/词项和问答自测行为不改；只允许显式实践策略采用新行为 | 公平控制/共享回归风险；全部分支 | 同语料默认查询快照/契约、共享文件hash与diff；受影响回归 | 分支不得自行改公共默认；协调共同修订后全候选重验 |
| G07 | 原需求不可被规划覆盖；模型/资料不可信，不执行生成代码或工具动作；Key仅服务端且不入日志 | ADR-003/004、现有配置保护；全部分支 | 输入快照、注入/伪来源测试、日志脱敏审查 | 停止运行并修复；秘密泄漏按实际事件处理，不继续产出报告 |
| G08 | 同运行器、评分、语料和样本版本；不读保留逐例结果调参；不修改旧集/旧结果 | 评估独立性；代码与报告 | manifest签名/文件范围、保留访问与调试记录；抽查生产未加载fixture | 该比较无效；版本化纠正或披露污染，必要时换新保留样本 |
| G09 | 最终生成Prompt/配置不因A/B/C改变；规划调用和生成调用分开；不伪造离线教学 | 原生成边界/实验控制；全部分支 | Prompt/配置签名、捕获请求、调用账本 | 排除混合条件结果，按共同配置重测 |
| G10 | 手写源码/测试≤500行；复用现有类型/校验和测试习惯；不新增依赖 | CONTRIBUTING/CI；新增与改动文件 | 现有行数脚本、Python/TS相关测试、构建、diff检查 | 修正超限/校验缺失，依赖需求先报批 |
| G11 | 候选只写自己worktree和新run目录，不覆盖历史、他人修改或跨分支资源 | Git隔离和证据连续性；全部操作 | cwd/branch/HEAD/status检查，输出目录必须不存在 | 停止写入，保全现场并报告；不得自行清理补救 |
| G12 | baseline/实现/在线/replay/Mock/最终生成补测分别标记；失败/回退不删样本，费用未知为null | 质量属性测量真实性；全部结果 | 统一报告校验、请求账本与汇总数核对 | 撤回错误结论，保留原件另出修正版 |

这些约束不要求三个方案拥有相同内部模块数量；允许新增小型逻辑职责，必须标明输入输出和依赖。遵守约束不等于保证教学效果，适用性和语义相关性仍需评估。

## 2. 模块职责、文件边界与统一接口

### 2.1 责任与依赖方向

- [design.py](../../server/design.py)：实践业务流程、配置前置require、阶段请求、sources送入生成、输出/引用检查；不得同时承载全部新算法或自行认证LLM页码。
- [search.py](../../server/search.py)/[retrieval_terms.py](../../server/retrieval_terms.py)：通用默认词法匹配与排序；不导入实践规划、重排、浏览器状态或评分答案。
- [chapters.py](../../server/chapters.py)：PPT/OCR读取、缓存与来源事实；不理解用户业务、不访问模型。
- [tutor.py:excerpt](../../server/tutor.py)：共同摘录；不由某候选自行加长内容。
- 方案专属来源逻辑：A实践词法策略，B规划/合并，C候选选择；只经明确的函数边界访问检索和仓储，不导入`search._score`等私有实现复制隐含契约。
- B网络适配：复用 [config.py](../../server/config.py)配置和httpx transport模式；规划deadline、输出和usage专门封装。不得为B重构 [llm.py](../../server/llm.py)、quiz或最终生成调用。
- 来源合法性：共同适配出口核对仓储与预算，design既有引用检查继续执行；规划器不拥有此责任。

共同准备建议使用以下**拟新增文件**（不是当前已存在）：`server/design_source_contracts.py`（内部类型）、`server/design_sources.py`（一个统一入口与原查询兼容路径）。A/B/C可各加`design_lexical.py`、`design_planner.py`、`design_rerank.py`，小型策略不必机械拆文件；实际文件清单P3T1记录并冻结。禁止创建动态插件注册框架。

为避免循环导入：共同准备可把现有_sources函数体等价移到design_sources中的`legacy_sources`，保留design._sources为兼容薄委托；design依赖design_sources，后者不得反向导入design。现有评估旧入口仍可调用，原query规范、截断、排序、来源顺序/excerpt不变。**这是P3T1待验证的结构准备，不是本次已完成重构。** 若不作提取，则必须另给无循环且等价的路径，不用延迟import掩盖循环。

### 2.2 最小函数契约

沿用项目函数与Pydantic风格，不另建Protocol层级。下面仅为待实现签名/语义：

```python
async def select_sources(store, request, *, stage, transport=None) -> SourceSelection:
    ...
```

- `request`是已经验证的DesignScenarioRequest、DesignTacticRequest或DesignReviewRequest；`stage`是`scenarios|tactics|review`，必须与请求类型匹配，不凭字段形似猜阶段。类型不匹配属内部契约错误，不修改对外请求模型。[实际模型](../../server/models.py)中tactics无title，不新增必填字段或伪造标题。
- `store`为同快照ChapterStore；`transport`仅供B真实调用/替身注入，A/C不得使用它发请求。不把评估器或Storage传给策略。
- `SourceSelection`为内部严格Pydantic模型，字段为`sources`与`diagnostics`；sources各项保持`chapterId/slide/title/source`。公共模型放内部contracts文件，不更改对外Design*Response。
- `diagnostics`至少有stage、status（`ok|empty`）、mode（`baseline|normal|fallback|replay`）、reason、实际查询/页ID、分段耗时与调用计数；B另有计划/usage/Prompt版本，C另有M和选择理由，A另有扩展与计分策略版本。不得将自由异常文本或Key放入reason。
- 预算与合法性在来源适配返回前检查；strategy返回>8/重复/非真实页是实现违约，应让测试和内部错误可见，不悄悄截断或回退掩盖。业务收到合法空来源后沿用现有422。
- 用户取消传播取消异常，不返回fallback、不继续生成。A/C同步扫描通过既有threadpool模式执行，不阻塞事件循环、不添加人工sleep；异步接口不代表新增网络依赖。
- 三阶段生成请求仅消费selection.sources，不暴露diagnostics到前端；现有配置require仍先于真实生成路径，未配置API继续503。离线来源评估可单独调用此内部函数，不启动生成。

共同基点默认实现必须与旧_sources逐页等价。各候选在自己worktree实现同一入口，实验驱动从该工作目录加载，不通过公开API选择variant；固定后续阶段输入作集成，防止不同模型生成结果成为来源比较的混杂因素。

## 3. 各方案专属开发契约

以下允许文件均指共同基点冻结后；未列文件需要先说明必要性并登记变更。测试文件可新增，不改弱旧断言；只对新统一运行器移除旧管线假设，不改评分公式。

### 3.1 A：确定性词法优化

| 项目 | 契约 |
| --- | --- |
| 目标与核心 | 在现有链路内用有限表达扩展、通用词影响控制与词法排序改善两类根因；算法细节允许比较合理实现，不事先固定词权重公式 |
| 允许修改 | design_sources的A策略绑定、拟新增design_lexical及相关测试；复用公共query_terms/term_count/仓储；必要通用小工具须显式策略入口且默认行为不变 |
| 不应修改 | 前端、公开模型/路由、LLM/quiz、ChapterStore语义、最终生成Prompt、评估和标注；不得分支单改search或retrieval_terms默认规则 |
| 输入输出 | 第2节统一契约；确定性同输入/同语料输出一致，记录扩展查询和排序版本，最多8个真实页 |
| 功能/异常 | 自然改写、通用词与专业词共存、空词项、否定表达、长输入、无来源、重复页与预算；未知表达不编造知识，原输入不丢 |
| 禁止机制 | 任何额外LLM/Embedding/向量服务、宽候选后二次完整重排、案例ID/整句/期望页硬编码 |
| 测试与符合性 | A策略单测、共享默认快照、零远端调用替身计数、改写/反例和来源边界；审查规则来自课程/表达类别而非fixture |
| 代价/假设 | 额外词匹配和规则维护；常见表达可改善仍属待测，未知语义与多知识选择可能不足 |

若确需改变公共默认词法实现，先停下该改动，记录影响搜索/问答/自测的范围并走共同变更；不能只给A改默认后仍称其他实验条件完全一致。

### 3.2 B：LLM辅助需求规划

| 项目 | 契约 |
| --- | --- |
| 目标与核心 | 真实LLM只提出课程检索方向，基点词法检索获得真实页，最多3意图+1原查询，有界轮转合并 |
| 允许修改 | design_sources的B绑定、拟新增design_planner（网络/规划严格模型/合并）；内部contracts的B诊断扩展、对应测试；配置只复用read_ai_config |
| 不应修改 | 公共检索计分/分词、前端/公开API/存储、课件、其他AI调用、共同摘录；不得默认加入A优化或C完整重排 |
| 来源责任 | 规划不产生/认证页码，不写课件，不执行模型动作；concept目录来自课程，不从评估答案/保留案例加载 |
| 原输入 | 保留请求验证后的原始字段和阶段输入快照；规划不覆盖它们，后续模型仍收到原需求 |
| 专属测试 | 严格字段/类型、引用伪造、原文依据、未知/否定/冲突、多属性、轮转去重、调用上限、整体deadline、取消、所有回退、日志脱敏；真实效果另跑批准在线实验 |
| 代价/假设 | 串行远端延迟、费用、非确定性与共享上游故障；规划语义收益未被Mock或temperature=0证明 |

**规划契约与边界：** 沿实验设计使用`status: ready|uncertain`与intents；ready为1–3条，uncertain为空。每意图仅concept（冻结允许ID）、query（1–120字符）、evidence（1–160字符原始字段连续片段）。Pydantic禁止多余字段/强制类型转换；重复意图、空ready、过多/超长、未知概念、来源URL/路径/页码指令、非原文evidence均使整个规划无效。**不接受部分合法规划**，统一回退，不静默裁剪或修补；子串匹配不是语义正确性证明，必须另测否定与不合理意图。

**网络与预算（仍待B1批准）：** 复用现有服务配置；规划temperature=0、输出上限1024token、内容8000字符、整体可取消deadline15秒；每次来源选择至多1次规划尝试、无自动重试。输出token字段须核对供应商支持；不支持则先记录并重冻配置，不能偷偷更换参数。不得直接沿用最终生成60秒/50000字符限制冒充规划预算。具体模型/服务未确定，Key不得硬编码或记录。

**合并：** 沿实验设计，每意图及原query各取基点Top-8；按意图序轮转，每轮再考虑一张原查询页，按真实ID去重直至8页/耗尽。规则是有限合并，不把跨query分数相加当置信度，不加载金标准补缺。若计划合法但无来源，回原query；有少量来源时允许不足8，不凑页。

| 失败条件 | 处理/暴露方式 |
| --- | --- |
| 配置缺失 | 离线来源运行可mode=fallback并记录not_configured；真实生成API前置require仍503，不得绕过 |
| 超时、连接/HTTP错误、限流 | 一次尝试后回原始query基点Top-8，计入已用时间/可得费用；diagnostics给稳定原因码，不抛原始上游秘密内容 |
| JSON/结构/原文/目录校验失败、空ready、过多意图、uncertain | 整体回原query，不接受部分结果，记录具体类别；显式未知和歧义可单独reason |
| 已知概念但明显不合理/无法匹配 | 可检查的长度/证据/目录/来源空等失败按规则回退；语义误解若结构合法不得宣称已自动识别，作为真实效果失败记录，不能用答案表修正 |
| 原query也无来源 | status=empty，业务沿用422，不编内容 |
| 用户取消 | 传播取消，不继续fallback或生成；远端是否取消计费未知 |
| 最终生成失败 | 保持原502/旧成果保护；规划回退不代表生成成功，不重跑规划掩盖错误 |

意外代码错误、仓储异常、策略越界不包装成“正常回退”，保留原有可见失败与诊断，避免过宽except隐瞒bug。B结果按normal/fallback/replay分层；Mock仅验结构/故障；3次fresh真实规划观察波动，固定计划重放独立记录在线run ID。实际模型、Prompt/hash、参数、时间、调用次数、usage/费用（缺失null）分别记录，规划与最终生成调用单列。48次正式规划上限（16×3）及开发额外调用/货币预算均待批准，不自动授权真实运行。

### 3.3 C：宽候选与任务相关重排

| 项目 | 契约 |
| --- | --- |
| 目标与核心 | 原始query基点词法Top-32候选，实践任务相关重排与可解释去冗余，最终≤8 |
| 允许修改 | design_sources的C绑定、拟新增design_rerank与对应测试；通过公共search_all/ChapterStore取得候选和内容 |
| 不应修改 | 原query词项/同义词/基点默认计分、课件、前端/公开API、模型调用、共同评估；禁止B规划及额外LLM |
| 输入输出 | 候选真实ID/基础score/原排名/所需正文特征+原需求→选页ID/选择理由；最终共享仓储/excerpt重建来源 |
| 功能与异常 | 同章不同知识、跨章内容重复、近似但互补页、少于8、空候选、M边界、稳定同分、重排失败回原序前8；实现越界bug不能静默掩盖 |
| 专属测试 | 固定候选池的确定性选择、去冗余理由、0/8/32预算、候选知识完全缺失、原查询不变、0外部调用；记录M/候选处理/选择耗时 |
| 代价与假设 | 增加候选正文/OCR处理与选择成本；原query零召回的知识仍可能缺失，不能声称独立解决语义召回 |

M=32是待批准主实验起点，不是已证最优；M=16仅允许开发集有限敏感性对照。特征/权重/同分/相似阈值必须有实现前版本说明和理由，再用开发集有限迭代；P2T4不指定唯一算法公式。禁止按章硬配额代替内容覆盖，禁止为固定案例补术语。规则变化要升版本，不看保留结果调阈值。

## 4. 架构符合性检查矩阵

“现有”入口可复用；“新增”测试/自动检查须在P3T1/P3T2实现，本次不虚构其已通过。人工审查项须附diff/依赖图/规则说明而非只打勾。

| 检查/ID | 分支 | 方式 | 通过条件/证据 |
| --- | --- | --- | --- |
| API与配置 G05/G09 | 全部 | 现有test_design/test_config；新增适配后端契约，api.test与DesignStudio测试 | 原请求/响应有效，503/422/502及旧成果保护不漂移 |
| 真实来源 G03 | 全部 | 新增仓储对照与伪页测试；既有引用范围测试 | 每页可定位且标题/excerpt一致，伪造ID不能通过 |
| 预算/去重 G04 | 全部 | 新增边界测试 | 0–8不同ID，违约可见，少来源不凑数 |
| 原输入与阶段 G05/G07 | 全部 | 新增输入快照、类型匹配和三阶段请求捕获 | tactics无title也有效；原需求未被计划/生成内容覆盖，sources进入正确阶段 |
| 默认路径 G06 | 全部 | 共同基点旧_sources等价测试、公共查询快照 | 默认来源序列/内容及原搜索行为一致；候选差异仅在显式入口 |
| 依赖 G01/G02 | 全部 | import导入冒烟、静态图/diff、requirements/package文件对照 | 无逆向/循环/前端依赖、无新增设施；人工看调用方向，不把rg当证明 |
| 模型调用 G07/G09 | A/C与B | transport调用计数、新增静态调用点审查 | A/C来源选择0远端；B至多1规划尝试，生成调用分列 |
| B严格规划/回退 | B | 新增MockTransport故障表与deadline/取消测试 | 合法才检索意图；非法整体回退，取消不回退；真实API缺配置仍503 |
| 候选/选择边界 | C | 新增固定候选、内容去重和耗时诊断测试 | 可区分召回与选择，未出现零召回知识“凭空补回” |
| 确定性/无硬编码 | A/C、B确定性部分 | 同输入重复输出、改写/反例测试；人工规则来源审查 | 可重现；不导入fixture、不按ID/完整评估句或页号返回 |
| 评分独立 G08/G12 | 全部 | 运行器/fixture/语料hash、run ledger、结果审核 | 同版、失败不删；未审/费用未知清楚标记；保留未用于调参 |
| 工程 G10/G11 | 全部 | 行数、构建、测试、diff与输出目录检查 | 无超限/未授权改动；本分支本run且不覆盖历史 |

可执行的现有检查（以下是Phase 3指令计划，本次不运行测试）：

```powershell
python -m pytest server/tests -q
python -m pytest scripts/test_evaluate_design_needs.py -q
npm.cmd --prefix web test
npm.cmd --prefix web run build
node --test scripts/check-file-lengths.test.mjs
node scripts/check-file-lengths.mjs
$env:PLAYWRIGHT_CHANNEL='chrome'
npm.cmd --prefix web run test:e2e
git diff --check
git diff --name-only "$experimentBase...HEAD"
git diff --name-only
git ls-files --others --exclude-standard
```

使用maga；无模型测试子进程禁dotenv并清模型变量，不改.env。pytest默认临时目录受限时使用已创建父目录下的全新GUID basetemp，不指向历史目录。最后三项分别检查已提交、未提交、未跟踪改动，不能只看git diff漏掉未跟踪策略文件。

依赖/模型调用可先用 `rg -n 'httpx|requests|AsyncClient|read_ai_config' server` 定位，再审查实际调用；`rg`无命中退出1不等于工具失败，命中也不自动代表违规。新增自动依赖检查可用标准库AST分析新增模块和允许边界，必须连同动态import人工核对；本次不引入新linter。新增测试具体文件名应在共同基点/分支任务清单登记，不能只在文档假设检查存在。

## 5. Git当前实况与共同基点

只读核对结果：`iteration/jack`，HEAD `b000353fbafb8fc2a545ac30808ae4ab739cf2b3`；暂存区为空；.gitignore有已有修改；本轮docs、v1/v2/v3自然需求数据、评估脚本与测试仍未跟踪，另有未跟踪历史架构审计。未发现experiment/iteration3-a/b/c本地分支，只有当前worktree。

**修正资源认识：** 7份PPT及教材PDF已由Git跟踪，正常worktree会从共同commit检出，不需当作未跟踪素材重复复制。`data/`、.env、AGENTS和iteration3_plan.md被忽略；OCR/页图和原始评估输出不会随Git出现。共同实验不能直接从旧HEAD开始，也不能假定仅git clone就有相同OCR。

### 5.1 建立基点的顺序

1. B1确认文件清单和操作范围；记录PROD_BASE=上述真实HEAD及原工作区状态。旧.ignore/审计/个人文件保持不动，不全局stash或清理。
2. P3T1先形成经批准的文档/工具准备提交，再在共同准备上下文新增内部适配/统一运行器和必要测试；默认行为等价、签名、协议冻结验收后提交，实际完整hash为EXPERIMENT_BASE。中间提交不冒充最终共同基点。
3. 基点应包含全部已确认Phase 1–2材料、评估器和测试、完整标注历史与当前冻结评分集、P2T4契约、公共适配/运行器。公共准备只做等价结构/观测，不实现A/B/C机制；检查生产差异并记录允许的等价变更。
4. PPT按commit固定；OCR按逐文件SHA-256和相对路径固定；页图仅需要浏览器验收时准备。记录Python/前端锁文件及安装依赖清单；requirements是范围约束，不能仅凭相同文件就断言实际包版本一致。
5. 在共同基点实际跑默认来源与旧结果对照；评分标签仍可能待审，结构结果必须一致。签名或来源变化先解释，不将环境差异误算候选收益。
6. 全候选从同一EXPERIMENT_BASE创建；后续公共修复由协调登记为相同补丁/共同准备版本，所有候选重验，不能分支独自改评分工具。

### 5.2 文件级staging建议（仅计划）

以下**现有文件**应逐项审查后纳入共同材料提交：

```text
docs/iteration3_jack/phase1-baseline.md
docs/iteration3_jack/phase1-task-definition.md
docs/iteration3_jack/phase2-analysis.md
docs/iteration3_jack/phase2-evaluation-protocol.md
docs/iteration3_jack/phase2-baseline-review.md
docs/iteration3_jack/phase2-experiment-design.md
docs/iteration3_jack/phase2-implementation-contract.md
docs/fixtures/iteration3-design-needs.json
docs/fixtures/iteration3-design-needs-v2.json
docs/fixtures/iteration3-design-needs-v3.json
scripts/evaluate-design-needs.py
scripts/test_evaluate_design_needs.py
```

示例只为说明逐文件stage方式，不在本任务执行：`git add -- docs/iteration3_jack/phase2-implementation-contract.md`。每批后用`git diff --cached --name-status`和`git diff --cached --check`核对；已有他人暂存内容时不直接commit混入。未来新增的共同适配/运行器/测试/冻结标注另列实际存在的精确路径并审核，不用目录通配把未审文件带入。

`.gitignore`已有修改、`docs/architecture-evidence-audit.md`归属由人工单独决定，默认不夹带；AGENTS是本地忽略协作信息，关键约束已写入可跟踪本文，不强制add -f；.env、data原件、截图、依赖、生成dist不入提交。保留当前旧集/历史产物，不通过删除旧版本简化staging。不使用未经审查的全量add、hard reset、clean或强制切换。

## 6. worktree安全执行流程（仅计划）

推荐独立worktree，避免当前未提交/忽略文件随分支切换混用。分支按用户指定experiment/iteration3-a/b/c；推荐同级目录MAGA-iteration3-a/b/c，若名称/路径已存在采用一致-r2后缀并记录，不复用旧实验目录。当前权限未必允许写父目录，执行前核对可写范围，不擅自升级权限或把嵌套worktree带进源码扫描。

```powershell
# P3T1获得批准、共同准备提交已完成后才能执行；以下不是本次操作。
$experimentBase='<已核验的EXPERIMENT_BASE完整hash>'
git show --no-patch $experimentBase
git status --short
git worktree list
git branch --list 'experiment/iteration3-*'
Test-Path ../MAGA-iteration3-a
Test-Path ../MAGA-iteration3-b
Test-Path ../MAGA-iteration3-c
# 只有分支不存在、路径不存在且获准可写才执行；任一冲突先换名，不覆盖。
git worktree add -b experiment/iteration3-a ../MAGA-iteration3-a $experimentBase
git worktree add -b experiment/iteration3-b ../MAGA-iteration3-b $experimentBase
git worktree add -b experiment/iteration3-c ../MAGA-iteration3-c $experimentBase
```

创建后逐目录核对pwd、branch、HEAD=EXPERIMENT_BASE、status及PPT hash；一实例只写一个目录，协调实例负责公共修改和结果汇总，不交叉stage/commit。共用Git对象/引用，不在另一个worktree操作同一分支。主目录已有修改不动。

资源：只读复用同一个现成maga解释器，禁止并发修改conda包；PPT由Git检出。每worktree复制冻结的82份OCR等必要小资源到独立data/ocr，再按清单hash对照；实际数量以冻结manifest为准，不覆盖已有文件、不重新OCR。页图体积较大，纯来源实验不必复制；浏览器验收按需准备冻结图片。默认不建需要额外权限的符号链接/junction，也不共享可写缓存。模型凭据使用各进程既有安全环境，不复制进可提交文件或日志。

前端未改的来源评估无需每目录重装Node依赖；需要该目录构建/E2E时按相同lock准备依赖，复用npm下载缓存，不将一个node_modules/dist软链给多个可写worktree。避免重复成本不等于省略最终候选的必要检查。多服务人工演示分配独立端口/代理，正式性能测试串行；确认Chrome E2E未误连另一个Vite实例。

结果独立保存为`data/verification/iteration3-competition/<variant>/<UTC-shortHEAD-GUID>/`，目录必须不存在，分支/HEAD/工具签名进manifest。保留评估明细只在协调上下文读取，原型开发上下文不读取；worktree不自动实现数据保密，需靠执行纪律与审计记录。不得自动删除worktree、清数据或关闭用户服务。

## 7. Phase 3任务分解

| 任务 | 输入与主要步骤 | 产出/完成标准 | 证据与人工点 |
| --- | --- | --- | --- |
| P3T1 共同准备 | B1记录、本文/实验设计、当前工作区；审核精确文件提交，准备等价适配/运行器、冻结评分/语料/环境，验证后固定EXPERIMENT_BASE，再创建worktree | 共同hash、默认来源等价、运行器可测、三目录资源与接口一致；生产无候选机制 | status/diff/精确staging记录、准备测试、签名与路径；提交范围、目录权限和模型预算须已批准 |
| P3T2-A | 共同基点+A契约；仅A词法策略，单测/来源边界、公共默认对照，开发集有限调试 | 机制符合A，零新增LLM、确定性、相关测试通过、干净可追溯候选commit | 关键Prompt、规则来源/策略版本、diff/检查矩阵、测试日志；越界先登记批准 |
| P3T2-B | 共同基点+B契约+已批准模型/Prompt/预算；严格规划/合并/回退，先Mock再有限真实调用 | 结构与异常表覆盖、调用预算/脱敏可测、三阶段不破API；真实模型未具备时只完成可测部分，不假称B效果完成 | Prompt/模型/参数、故障结果、ledger、diff与候选commit；追加付费/模型变更须重新确认 |
| P3T2-C | 共同基点+C契约；固定M/特征规则、候选与选择分层、去冗余/稳定性测试 | 无规划/额外LLM、原query不变、最多8真实页、候选耗时可观测、候选commit | 特征说明/版本、固定候选测试、默认行为对照、diff；机制混入需批准 |
| P3T3 统一实验 | 三个冻结commit/签名、同评分；串行跑开发集、有限消融后重冻，再按批准协议一次保留评估，汇总质量/成本/失败 | 同条件结果可复算，normal/fallback/replay/Mock分表，无隐删失败/费用，架构符合性清楚 | 输入/命令/分段耗时/计划与来源/测试/异常/限制；保留口径先审核，最终评估后不得暗调参 |
| P3T4 决策与集成 | P3T3报告；人工比较产品/质量属性和复杂度，选择或明确批准组合，写最终ADR，再Merge指定commit并回归 | 只有B2通过才合并；冲突修复后行为与证据一致，最终架构和交接可用 | B2选择/接受代价/允许Merge清单、ADR、合并hash、完整回归与必要补测、文档 |

P3T2可由三个独立Codex任务按worktree顺序或在获准后并行编码，正式性能评估仍串行。本次不启动实例、不生成全部实现Prompt、不创建代码提交。任何未满足完成条件的部分单独交接，不将“有代码”写成“通过实验”。

## 8. 统一验证、冻结与证据

快速开发只跑相关测试；分支完成与Merge后再做完整后端/前端、构建、行数/检查器、Chrome E2E、旧20条术语兼容评测。既有178/149等数量是历史结果，不是未来必然数量或本次新验收。公共默认改变属于例外，回归要覆盖搜索、问答和自测，而非只测实践。

来源指标沿实验设计：v3开发暂定50%覆盖、11.36%直接相关下界；未审不能当无关，标签变化不是效果变化。原v1/v2/v3及旧结果保留。正式评估前由协调按原需求/课程统一保留粒度，不读取旧保留失败，另升标注版本并冻结；审核者和争议理由明确。用户可继续委托Codex证据复核，但报告不得伪称独立人工金标准。

候选冻结后由协调一次执行保留批次，预定三次重复用于B波动观察，不是三轮调参；开发和保留分表。保留4例且约3例可评分，不作微小差异的普遍性/显著性结论；若据此改规则，记录污染并另找独立验证样本，不重复使用旧保留证明泛化。

性能同机/同conda/同语料、显式冷加载与3次暖测、分段与总wall时间；最终sources字符（非token）、页数、调用、可得usage/费用及失败全量保存。B实际在线规划、回退和计划重放分别报告；A/C零规划费用不代表最终生成免费。未知费用null，不因失败删样本或自动追加付费重试。LLM生成质量的有限端到端补测与检索主指标分开。

统一运行器要适配新select_sources，保留旧evaluate-design-needs入口，旧“等于原queryTop-8”断言仅属于旧基线。评估器不得决定生产策略；`--regrade-from`只能复核标注，不能评测新实现。新run实际调用候选来源选择并记录新耗时；无需为了实验建立完整服务或前端开关。

每run至少包含：

```text
run_id / experiment_type(baseline|implementation|online|replay|mock|generation)
variant / variant_version / branch / PROD_BASE / EXPERIMENT_BASE / result_commit
dirty_state / tool_hash / protocol_hash / annotation_hash / corpus_manifest_hash
environment / command / UTC_start_end / case_id / split / repetition
model_requested_actual / prompt_hash / parameters / plan_parent_run(重放时)
queries / candidate_ids_ranks / selected_ids / quality / unknown_annotations
stage_times / wall_total / source_count / context_chars / calls / usage / cost_currency
error_category / fallback_reason / cancelled / tests / constraint_results / limitations
```

缺失信息明确null/unknown；Result commit须对应实际执行代码。干净候选commit用于正式比较；未提交探索可带patch/hash保存，但不冒充冻结结果。摘要/差异/判断放本轮Markdown目录，data原始文件保持忽略，提供复现命令和可提交摘要，不能只给个人绝对路径。保留秘密、不保存Authorization。

## 9. 架构偏离与变更管理

每分支交接记录一张小表：`偏离ID | 约束ID/原定行为 | 实际差异 | 原因 | 质量/成本/回归影响 | 审批人/时间/状态 | 修正或接受方式 | 验证run/commit`。放本轮分支实施记录，不新增复杂系统。

发现关键偏离先记录并停止该越界改动；已授权范围内的命名/文件拆分等实现细节可说明后继续。改变机制、公共默认/API、模型/付费预算、评分/保留协议或共同代码必须先由人工/实验协调批准；不能以“效果更好”自行接受。修复后重验关联矩阵；共同修复同版传播所有候选，审批缺失的结果不得参加正式比较。历史文件不覆盖，修正版关联旧run。

## 10. 人工检查点与启动清单

**B1：实验设计与开发契约批准（Phase 2末）。** 仅批准开展实验，不批准最终生产架构。需记录明确答复与时间：

- [ ] A/B/C机制边界、默认公共行为和第2节接口/模块边界。
- [ ] B实际服务/模型、Prompt/概念目录、参数/deadline、结构校验与整批回退；48次正式规划上限、开发额外调用与货币预算。
- [ ] 当前v3或后续审核评分版本、保留粒度统一流程、未审/争议标注和质量门槛。
- [ ] 可接受的延迟/成本代价；不预设提升百分比或精确总评分权重。
- [ ] 共同提交的精确文件、历史.ignore/审计归属、共同适配的等价验证与EXPERIMENT_BASE生成流程。
- [ ] worktree路径权限/命名/资源同步、单实例单目录、结果隔离和Phase 3分解。

B1可批准离线公共准备而暂缓真实模型预算，但须写清可执行子范围；未批准部分保持待办，不能把本次编写契约视作B1已通过。

**B2：最终架构选择（P3T3之后）。** 人工查看产品效果、知识/相关性、溯源、延迟/费用/失败、职责与维护、回归证据，决定A/B/C或证据支持的组合；说明新增复杂度为何值得及接受什么局限。记录选定commit/组合范围、ADR及允许Merge内容；只有B2通过才正式合并，后续执行仍遵守授权范围。没有方案在本文获胜。

**Phase 3启动前：** B1范围明确、共同文件已审、冻结评分/语料/工具可复算、原工作区受保护、共同默认等价测试与适配待P3T1落实、模型预算分开、目录权限可用。未具备的项列为阻碍而非假造完成。

## 11. 本次工作边界

仅新增本契约并只读核对必要源码、文档、Git与忽略状态。未修改生产代码、API、测试、评估数据/规则、Prompt或.gitignore；未运行真实模型或保留逐例评估；未安装依赖、创建/切换分支/worktree，未stage/commit/merge/push。原有未提交修改保留。完成后等待B1人工审查，不开始Phase 3。
