# P3T6：双策略独立集成验收

日期：2026-11-17。**原始 Gate：FAIL（9b6b1ea，历史记录保留）**。
**当前最终 Gate：PASS（人工裁定及针对性复验后）；ADR：Accepted；Phase 3 完成。**
本文第1–10节保留原始验收经过与当时结论；当前裁定和复验见第11节，不追溯改写历史结果。
本轮没有修改生产代码、Planner Prompt、来源算法、历史实验或评估标注。

## 1. 范围与基线

验收主线 `iteration/jack`，起始 HEAD `0a91d63973706d79671f3842175d0ba8ee273b66`，开始时干净。
交付提交为包含本文的 P3T6 本地提交，可用 `git log -1 --format=%H -- docs/iteration3_jack/phase3-final-acceptance.md` 获取。
不把提交后的文档 HEAD 当作真实模型运行时版本。

实验 Worktree 均只读核验且干净：

|目录（主仓库同级）|HEAD|
|---|---|
|MAGA-exp-baseline|c6fc1857928468030e6a030b13a146300bf93304|
|MAGA-exp-a|ef7d2993ce31c02751df576ba9cc9b5307a3f1ad|
|MAGA-exp-b|4f878dcaa14a6d62a7f0506b866afe5fcd17f68d|
|MAGA-exp-b-v2|cf5ba925662183daa8bf643dabade9ac2ce9c359|
|MAGA-exp-b-coverage|b07392bbfa49fbdaea3935bd6099a5e0d4c78894|
|MAGA-exp-c|a467ab17cbf0f13e347b348008bb3ed3385dcf0a|

验收目标是默认兼容、显式增强、真实来源、浏览器消费和失败保护，不重新评价算法优劣。
人工批准的架构仍是 Baseline 默认＋原始 B 可选，不集成其他候选。

## 2. 环境与证据目录

仓库绝对路径：`D:/Jack_s_file/learning/课内学习/大三上课内/软件体系结构/体系结构大作业/MAGA`。
下文产物路径均相对该目录；根目录 `data/verification/p3t6-acceptance-20261117-v1/`，被 Git 忽略。

- Windows 10.0.26200，Python 3.11.18，解释器 `D:/app_install/miniconda/envs/maga/python.exe`。
- FastAPI 0.162.7、httpx 0.28.1、Pydantic 2.14.3、python-pptx 1.0.2、uvicorn 0.54.0。
- Node 22.17.1、npm 10.9.2；实际构建 Vite 6.4.5、Vitest 3.2.7。
- Chrome 157.0.8103.51，Playwright 显式 `channel: chrome`，headless。
- 7 份 PPT、82 份 OCR；89 项原始字节 SHA256 记录在 `baseline.json`，验收后再次核验无变化。
- 真实模型 `deepseek-flash`，目的主机 `api.deepseek.com`，复用现有 `.env` 和兼容 chat/completions 配置；未覆盖配置、打印密钥或请求头。

独立前端 5186→Mock 模型后端 8016，5187→真实模型后端 8017；均使用真实前端代码、`create_app()`、真实课件和生产业务路由。
后端替身仅注入 `app.state.llm_transport`，来源接口仅增加观测包装；生产启动不导入验收脚本。
验收专用控制路由仅出现在脚本启动的 loopback 应用，真实模型模式不提供故障控制入口。

## 3. 验收矩阵

|项目|本次证据|状态|
|---|---|---|
|默认及显式 Baseline|三阶段 API 测试、真实课件来源对照、Chrome 默认流程 0 Planner|通过|
|只有显式增强触发 B|Chrome 增强 3 Planner，baseline→B→baseline 仅 1 Planner|通过|
|原 B 真实正常链路|场景分析、战术推荐均 normal，真实最终生成及前端消费成功|通过（2 阶段）|
|真实评审链路|Planner 空输出→invalid_plan→Baseline→真实最终评审成功|回退成功，正常规划未通过|
|真实模型脚本全阶段 normal 断言|`chrome-real/results.json`，进程退出 1|**失败，未删改断言**|
|Chrome 默认/增强三阶段|真实后端 Mock 模型均完成；真实模型三阶段页面、引用、恢复均完成|通过，须保留上述断言失败|
|来源真实性/Top-8|26 次选择全部重新验证；每次 8 个不同真实页；15 次默认/回退与 legacy 完整字典相同|通过|
|Planner 故障|非法 JSON/结构/空意图/未知概念/连接错误/超时与 UI 回退提示|通过|
|最终生成故障|HTTP 500、超时、非法 JSON、非法结构、越界引用均 502，旧成果不变|通过|
|取消/重复/迟到/模式切换|Chrome 真实后端验证，晚到任务完成后新成果不变|通过（后台可能继续）|
|原有回归|后端及脚本 259、前端 152、Chrome API 替身 25、构建、行数器|通过|
|架构符合性|17 项离线断言、真实来源复验；无其他策略进入生产|通过|

**判定解释：**业务契约允许规划失败回退，任务要求至少一次有效真实增强业务流程；前两阶段已提供该证据。
本轮真实验收脚本额外要求三次选择全部 normal，这比业务契约更强，评审阶段违反该断言。
这不是“整个业务失败”，也不是已经证明生产存在集成缺陷。为遵守本轮“不降低断言、不跳过失败”的要求，保留失败脚本和 FAIL Gate，不用其余通过项抹去失败。
本次不放宽断言、不修改原 B、不重新采样；人工收尾时应明确裁定该额外条件是否属于阻塞验收条件，而不据此开启算法优化。

## 4. 默认不变性与架构符合性

`scripts/acceptance-conformance.py` 比较 c6fc185 的 AST/文本：

- `_sources`、`_canonical_citations`、`_complete_json`、三个最终生成 Prompt 函数未变。
- `legacy_sources`、`build_query`、`validate_selection` 未变。
- search、retrieval_terms、chapters、tutor、quiz、llm 文件未变。
- 原 B 与 4f878dc 全文相同，仅将请求控制字段 retrievalStrategy 从模型输入中排除，符合 P3T5 隔离要求。
- Prompt `iteration3-planner-v1`，SHA256 `920b836978fea8455fce4463861410c72585364928576173f30f5524c832b8b6`。

现有三阶段参数化测试覆盖默认/显式baseline来源等价、零Planner、旧返回不包含新字段、非法策略422、缺配置503且不规划。
Chrome 默认请求确实省略策略字段；增强请求携带 llm_assisted；策略不写入 localStorage，刷新恢复 baseline。
普通问答、自测和全书搜索没有策略入口或依赖变化；其自动化测试随全量回归执行。
旧20条术语评测本次为 8/20→16/20，与此前条件记录一致，只是固定集合 Top-5 命中，不是回答质量。

## 5. 真实模型业务记录

构造需求：设备运行监测；多个采集节点周期性上报状态，节点停止响应时需要检测并切换备用处理；目标为故障检测和恢复服务，说明资源开销与恢复时间的权衡。
未发送个人资料或历史对话。最终生成收到检索选择的真实课件摘录，这是现有生成流程的正常输入。

预算采用更保守解释：全轮最多 **6 次外部 HTTP 请求**，实际正好 6 次，无重试；三个 Planner＋三个最终生成。没有追加采样。
Planner 保持 temperature=0、max_tokens=1024、15 秒 deadline、最多3意图；最终生成保持原 temperature=0.2、60秒超时及原 Prompt。

|阶段|Planner 秒|规划状态|最终生成秒|业务 API 总秒|来源数|HTTP|
|---|---:|---|---:|---:|---:|---|
|场景分析|3.035|normal，3 意图|16.786|35.232|8|200|
|战术推荐|4.330|normal，3 意图|10.439|29.737|8|200|
|AI评审|5.748|invalid_plan→fallback|27.897|40.373|8|200|

API 总时间包含规划、本地检索/合并、真实来源校验及最终生成；网络时间是 transport 观测边界。不是纯检索延迟或总体 P95。
本地检索/合并时间保留在 `real-summary.json` 的 stage_times_ms；校验未独立计时，不将差额当成精确校验耗时。

|调用|输入Token|输出Token|合计|
|---|---:|---:|---:|
|场景 Planner|295|502|797|
|场景生成|2748|3172|5920|
|战术 Planner|1098|781|1879|
|战术生成|3011|1690|4701|
|评审 Planner|1880|1024|2904|
|评审生成|4991|4661|9652|
|总计|14023|11830|25853|

实际响应模型均 deepseek-flash；使用量来自上游，含其报告的推理Token，未当作可见回答长度。
评审 Planner `finish_reason=length`，completion_tokens=1024、reasoning_tokens=1024、content 长度0，符合预算耗尽导致无合法JSON的观测；未改变 max_tokens 或 Prompt。
规划回退1/3仅是本次样本描述，不是总体故障率。费用 **null**，未查单价、未将未知费用记零。

## 6. Chrome、故障、恢复与来源

三类证据分别保存：

1. Chrome＋Mock API：现有25项 E2E 全通过，`e2e.log`/`e2e-results/`。不证明真实来源或真实模型。
2. Chrome＋真实后端＋Mock 模型：`chrome-mock/results.json`，17组通过；default/enhanced/switch/fallback 截图与 trace，三阶段响应、原始事件保留。
3. Chrome＋真实后端＋真实模型：`chrome-real/` 三阶段响应、截图、trace、事件、失败断言；`real-server/events.jsonl`/`real-summary.json` 提供完整调用证据。

默认三阶段只有3次最终生成；增强有3次Planner及3次最终生成。混合流程策略序列 baseline→llm_assisted→baseline，与服务器请求完全一致。
请求期间策略选择和生成按钮禁用；强制重复点击 disabled 按钮没有增加调用。引用按钮打开真实章节页预览；刷新恢复相同旧成果且不新增模型调用。
已完成成果格式无需迁移；旧无策略格式恢复由既有Chrome E2E验证。策略和回退元数据均未进入保存的成果。

Planner 六类故障通过真正的业务 HTTP API和真实检索执行，均返回200且 retrievalFallback=true；浏览器可见降级提示。
最终生成五类故障均通过浏览器重新生成操作执行，返回502并显示错误，localStorage中的完整旧成果逐字节未变；不把规划回退解释为最终生成成功。
超时故障由 transport 抛出 ReadTimeout，属于模拟超时；15秒 deadline与取消传播另有现有单元测试，未伪称等待了真实网络超时。
`test_design_sources` 覆盖重复、伪造内容、非法页码、超过8页、空结果以及取消不转成回退；本轮完整测试通过。

取消时UI立即解锁，旧成果保留；新Baseline请求完成后释放被挂起的旧增强请求，等待服务器确认旧任务完成，再核对新成果未被覆盖。
**限制：浏览器Abort不等于上游取消**，本次观察到后端仍可完成旧任务和后续生成，可能继续消费模型额度。这是已存在的请求生命周期边界，不声称已解决服务端停止/计费。
本轮只在Mock上验证取消，未为此消耗真实调用；现有 asyncio 任务取消传播测试也不等于浏览器断连能取消整个服务器任务。

## 7. 质量属性与轻量ATAM

|场景/Driver|本次观察|限定|
|---|---|---|
|普通请求低额外成本 / Performance|默认无Planner，来源完全等价|最终生成仍需模型；未测负载或总体P95|
|用户主动增强 / Functional Suitability|三阶段可显式选择，两个真实正常规划成功|评审一次触及1024Token上限；不证明效果优于默认|
|规划异常降级 / Reliability|Mock六类及真实空输出均回退且业务成功|回退不能保障最终生成一定成功|
|来源可替换 / Modifiability|select_sources统一结果契约，最终Prompt不变|静态及契约测试证据，不是所有未来策略都可安全替换|
|旧调用兼容 / Maintainability|默认请求、旧返回/存储、问答等回归通过|无独立代码评审或远端CI证据|

敏感点：输出Token预算、输入长度和推理Token竞争；15秒deadline；Top8来源预算；浏览器与服务器取消边界。
权衡点：增强额外延迟和外部依赖换取局部语义规划；严格校验拒绝不可用输出而牺牲正常规划率，换取真实来源和可靠降级。
风险：单次真实样本不代表长期可靠性；回退可能隐藏增强不可用，需现有提示；后台取消不保证节省费用。
限定的Non-risk：本次原Prompt/轮转/默认来源/最终生成未改变、真实引用规范化未绕过。
Module/C&C View沿用P3T5集成文档，与当前源码相符；没有新增生产跨层依赖或公共搜索污染。

## 8. 问题、处理与复测

- 真实脚本的“三阶段全部normal”强断言失败：保留原始 `results.json` 和退出1，不修改断言或候选；本轮Gate保守FAIL。其他业务断言已先执行到页面恢复和来源观测。
- 旧术语脚本默认临时目录 PermissionError：首次失败保留在工具记录，改用项目内 TEMP/TMP后同脚本成功，未改评测代码。
- 25项E2E断言结束后Playwright创建的Vite子进程清理挂起：只读核对PID/父进程/命令后仅停止本轮Vite子进程，测试随后正常退出并输出25 passed。6.5分钟总时长含清理等待，不当作业务性能。
- 一次临时汇总命令重复传入stage字段而失败，修正汇总命令后生成 `real-summary.json`，没有重跑模型或覆盖原始结果。
- 无已证实的P3T5生产集成缺陷，本轮生产修复0。没有放宽模型校验、改变预算或删除负面证据。

## 9. 实际命令与复现

在仓库根目录；每个进程使用独立终端，所有输出/临时目录必须为新名字。验收脚本不由pytest自动执行，也不被生产导入。

```powershell
$env:PYTHON_DOTENV_DISABLED='1'
$env:PYTHONIOENCODING='utf-8'
Remove-Item Env:LLM_API_KEY,Env:LLM_MODEL,Env:LLM_BASE_URL -ErrorAction SilentlyContinue
& 'D:/app_install/miniconda/envs/maga/python.exe' -m pytest server/tests scripts -q --basetemp data/verification/<全新pytest目录>
npm.cmd --prefix web test
npm.cmd --prefix web run build
$env:PLAYWRIGHT_CHANNEL='chrome'
npm.cmd --prefix web run test:e2e -- --output ../data/verification/<全新E2E目录>
node --test scripts/check-file-lengths.test.mjs
node scripts/check-file-lengths.mjs
git diff --check
```

实际结果：259 passed（58.23秒，1条既有Starlette/httpx警告）；152 passed；build通过；25 passed；行数器2项通过、所有手写文件≤500行。

离线/Mock集成复现，不需要真实服务密钥：

```powershell
& 'D:/app_install/miniconda/envs/maga/python.exe' scripts/acceptance-server.py --output data/verification/<全新Mock后端目录>
node scripts/acceptance-vite.mjs 5186 8016
node scripts/acceptance-browser.mjs http://127.0.0.1:5186 http://127.0.0.1:8016 data/verification/<全新浏览器目录>
$env:TEMP=(Resolve-Path data/verification).Path
$env:TMP=$env:TEMP
& 'D:/app_install/miniconda/envs/maga/python.exe' scripts/evaluate-retrieval.py --repo . --cases docs/fixtures/retrieval-terms.json --output data/verification/<全新术语结果>.json
& 'D:/app_install/miniconda/envs/maga/python.exe' scripts/acceptance-conformance.py --evidence data/verification/p3t6-acceptance-20261117-v1
```

最后一条复验读取已有baseline/events并拒绝覆盖已有conformance.json，重新复验须复制证据到新目录并将原conformance作为历史保留在别处。
本次实际conformance输出：17项检查、26次来源校验、15次legacy对照。

真实运行实际命令（**本轮6次预算已用尽，不再执行**；仅供后续获得新预算后复现）：

```powershell
# 独立终端保留既有.env，不设置PYTHON_DOTENV_DISABLED，不修改密钥。
& 'D:/app_install/miniconda/envs/maga/python.exe' scripts/acceptance-server.py --real --port 8017 --output data/verification/<全新真实后端目录>
node scripts/acceptance-vite.mjs 5187 8017
node scripts/acceptance-browser.mjs http://127.0.0.1:5187 http://127.0.0.1:8017 data/verification/<全新真实浏览器目录> real
```

真实模型输出非确定，不能承诺重跑同样规划/回退；启动新进程会有新计数器，调用者须遵守任务总预算，不能通过重启规避预算。
原始事件和trace可能包含构造输入、课件摘录及模型回答，仅保留在忽略目录；提交仅含脚本和文档，无.env、密钥、Authorization或大型产物。

## 10. 收尾与Phase 4交接

Gate FAIL；保留条件ADR。所有候选Worktree/历史结果保留，无Merge、Push、Reset或Clean。
Git变更仅四个验收脚本、本报告和两份状态文档，精确提交；本地提交hash以本报告所属提交索引取得，最终工作区状态见交付消息。

最小剩余事项是**人工裁定额外全阶段normal断言的验收地位**：如果接受原ADR规定的合法回退，应显式记录该裁定；如果要求全阶段正常规划，本次样本未满足，不能靠本轮放宽Prompt/预算或继续优化获得通过。
服务端断连后上游生命周期、费用未知以及教学语义充分性是透明保留的限制，不假装已经解决。停止继续架构或算法优化。

Phase 4材料索引：

|材料|现有证据/待整理|
|---|---|
|Architectural Drivers|phase2-analysis、最终ADR、本文质量属性表；提炼答辩页|
|Quality Attribute Scenarios|phase2实验设计、P3T5集成、本文场景验收与限制|
|Module/C&C Views|phase3-dual-strategy-integration中的实际集成图|
|ATAM|phase3-architecture-tradeoffs、本文敏感点/风险；保留负面结果|
|ADR|phase3-final-architecture-decision，Conditional未解除|
|实验/评价|P3T3及B-v2/Coverage报告、本文三类验收证据；非独立人工金标准|
|产品演示|默认/增强截图、Mock回退截图和真实回退trace可用于演示，须注明Mock/真实区别|
|答辩收尾|先明确Gate裁定，不能在演示中声称已无条件完成Phase 3或B整体更优|

## 11. P3T6 Acceptance Adjudication / 人工验收裁定

### 11.1 人工决定与契约核对

2026-11-17，项目架构决策人（用户）明确裁定：允许 Planner 失败后正确回退 Baseline 并完成业务；“三阶段 Planner 全部成功”不属于业务连续性必要条件。降级成功不得计入增强成功率。

原始断言位于9b6b1ea的 `scripts/acceptance-browser.mjs`：每个真实selection均必须 `mode === 'normal'`。其余业务响应、引用预览、刷新恢复、预算和来源数量检查均独立存在；该断言没有承担其他独立约束。
`phase2-implementation-contract.md`的B失败矩阵明确规定：JSON/结构校验失败整体回原query，原query无来源沿用422，最终生成失败沿用502，仓储/策略违约不能伪装回退。
最终ADR亦保留规划失败回退。没有发现要求三个阶段必须全部增强成功的独立契约；本次裁定适用。

原始FAIL及空输出/length/1024 Token记录不删除。旧产物目录 `data/verification/p3t6-acceptance-20261117-v1/` 完全不写入；旧manifest仍为FAIL。
旧manifest SHA256：`63e8456f9de43bae2f644e6caa523f1ddbf1588761b0e2871d7d8b8d11741b8c`。离线重放逐一验证其列出的29个证据文件哈希。

### 11.2 修订判定与实现边界

|结果|必要条件|
|---|---|
|Enhanced Success|业务200、合法最终结果、normal且ready/1–3意图、一次Planner、retrievalFallback=false、真实唯一Top8来源、引用属于来源、旧成果保护|
|Degraded Success|业务200、fallback且明确原因、一次Planner、retrievalFallback=true、Baseline回退成功，其余来源/引用/旧成果条件不变|
|Failure|业务/回退/最终生成失败、来源或引用不可信、预算违约、破坏旧成果或诊断与公开回退标记矛盾|

工作流必须三阶段业务都成功、至少一次实际增强成功，Failure=0。全部降级的记录仍不能单独满足真实增强验收条件。
每阶段分别分类，不能以normal来源选择掩盖随后最终生成失败，也不能以HTTP200忽略伪造来源或隐藏的回退。

改动仅在验收设施：

- `acceptance-verdict.mjs`集中分类和工作流判定，`acceptance-verdict.test.mjs`验证正反例。
- `acceptance-browser.mjs`仅替换全阶段normal强断言，其他原断言保留，新增公开回退标记、逐请求调用数和引用归属一致性检查。
- `replay-acceptance.mjs`读取原始真实记录、验证历史哈希、调用真实课件复验，输出到全新目录；没有模型或HTTP客户端调用。
- `acceptance-conformance.py`仅增加可选 `--output`，将复验结果写到新目录，仍拒绝覆盖已有文件。
- `test_acceptance_adjudication.py`通过真实API与明确Mock上游注入五类结果，不修改生产实现。

这是用户明确批准的验收标准修正，保留负面事件并分层统计；没有将真实失败的Planner重新标为成功。

### 11.3 针对性复验及可复现命令

本次起始主线 HEAD `9b6b1ea6f6ef14729def6475a55f4626aad2d053`，工作区干净。
新产物目录 `data/verification/p3t6-adjudication-20261117-v1/`，与原验收目录分离。

```powershell
# 离线读取历史真实证据，复验真实PPT/OCR；NEW_OUTPUT必须尚不存在。
node scripts/replay-acceptance.mjs data/verification/p3t6-acceptance-20261117-v1 data/verification/<全新裁定目录>
node --test scripts/acceptance-verdict.test.mjs
$env:PYTHON_DOTENV_DISABLED='1'
$env:PYTHONIOENCODING='utf-8'
Remove-Item Env:LLM_API_KEY,Env:LLM_MODEL,Env:LLM_BASE_URL -ErrorAction SilentlyContinue
& 'D:/app_install/miniconda/envs/maga/python.exe' -m pytest server/tests/test_acceptance_adjudication.py server/tests/test_design_strategy.py server/tests/test_design_sources.py server/tests/test_design_planner.py -q --basetemp data/verification/<全新pytest目录>
node --test scripts/check-file-lengths.test.mjs
node scripts/check-file-lengths.mjs
git diff --check
```

结果：判定规则9项通过；后端针对性68项通过（含新增5类API故障/成功测试），1条既有Starlette/httpx警告。
离线重放输出 `adjudication.json`：PASS；架构复验 `conformance.json`：17项检查、26次真实来源校验、15次Baseline/回退完整字典对照均通过。
五类API测试中：增强成功1、降级成功1、预期Failure3（回退仓储异常500、最终生成502、伪造来源被校验阻止500）；失败用例均未被误判为成功，仓储/来源失败没有继续生成。
Node反例还覆盖全降级、阶段不全、隐藏回退、重复规划、旧成果丢失、越界/重复/空来源及伪造引用。

修订后的浏览器脚本另在5186→8016上运行，模型为Mock、后端和课件真实；启动方式沿用第9节，输出改到新裁定目录的 `mock-server/` 和 `chrome-mock/`。
本轮Chrome 157.0.8103.51结果：17组全部通过，包括默认/增强三阶段、模式切换、五类最终生成故障、取消/重复/迟到、六类规划故障、回退UI及非法输入。原先的来源/预算/旧成果断言均执行；增强流程新增逐阶段分类也通过。
不将本轮Mock调用当作新增真实模型验证；历史Chrome＋真实模型、历史完整259/152/25回归和构建证据继续引用原记录，不声称本轮重新执行这些全量门禁。

### 11.4 真实样本重新分类

|历史真实业务阶段|Planner|业务|裁定结果|
|---|---|---|---|
|场景分析|normal，3意图|200，8个真实来源|Enhanced Success|
|战术推荐|normal，3意图|200，8个真实来源|Enhanced Success|
|AI评审|空输出，invalid_plan，回退|200，8个真实来源|Degraded Success|
|合计|增强2、降级1|3/3成功|Enhanced Success 2；Degraded Success 1；Failure 0|

增强成功2/3（66.67%），降级成功1/3（33.33%），业务连续性3/3（100%），仅描述同一个历史工作流的3个阶段，不能外推总体稳定性。
本轮新增真实调用 **0**，历史仍为6次HTTP请求、25,853 Token，费用null。评审Planner失败和其消耗Token仍保留，不计为增强成功。

### 11.5 剩余风险与Phase 4边界

仍保留：推理Token耗尽导致无合法规划；增强额外延迟、未知费用和外部服务依赖；浏览器Abort后后台任务可能继续；少量样本不证明长期可靠性；来源存在不代表结论语义充分；评估标注不是独立人工金标准。
本次裁定仅关闭“不允许合法回退”的额外验收门槛，不消除这些风险，不证明B整体优于Baseline。
Baseline默认、原始B显式可选的生产行为完全不变。不重跑优化、不改变Prompt/算法、不增加真实调用、不Merge/Push或删除Worktree。
Phase 4只整理Drivers、质量属性场景、Module/C&C图、ATAM、最终ADR、分层实验/验收证据及产品演示答辩材料，不新增检索优化。

### 11.6 最终Gate、ADR与Git收尾

**最终Gate：PASS（裁定与复验后的当前结果）**；原始Gate FAIL保持历史原貌。没有其他阻塞性验收缺陷。ADR更新为Accepted，Phase 3标记完成。
用户关于合法降级的裁定是依据，历史真实证据重验及本轮确定性故障注入是复验；不是新增真实模型成功，也不是删除失败样本。
本轮9项Node判定测试、68项相关后端测试、17组Chrome真实后端Mock模型验收均通过；行数器自身2项通过，130个手写文件无超限，语法与diff检查通过。
生产代码未变；本地提交仅验收脚本、测试与三份状态文档。新提交hash用 `git log -1 --format=%H -- docs/iteration3_jack/phase3-final-acceptance.md` 获取，9b6b1ea及旧产物完整保留。
不Merge、Push、Reset/Clean或删除Worktree。全量前后端和API替身E2E沿用第9节历史记录；本轮重新运行范围如实限定于以上复验。
