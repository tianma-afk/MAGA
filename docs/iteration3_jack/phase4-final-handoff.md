# P4T5：最终交付核查与团队交接

日期：2026-11-18（Asia/Shanghai）。起始分支 `iteration/jack`，HEAD `c4bca68fdc2e267b7913760fb55ca16093719da3`，工作区干净。本文为独立交付就绪审查记录，不替代用户或团队最终批准。

## 1. Executive Handoff Summary

**P4T5 Readiness：READY WITH LIMITATIONS。** 文档、关键证据、双策略实现及本轮工程回归相符；真实浏览器＋真实后端＋Mock模型彩排通过，无已知生产阻塞缺陷。现场真实模型未重新采样、跨机器执行和正式PPT导入未验证，团队签字仍待完成。

最终生产架构为 **Baseline by Default, Optional LLM-Assisted Retrieval**：Baseline默认；用户手动启用原始B；A/C/B-v2/B-Coverage只保留实验分支。原B经选择性集成进入主线，没有整体Merge实验分支，也没有自动路由。ADR **Accepted**，Phase3最终Gate **PASS（人工裁定与针对性复验后）**。它们是既有架构决定与验收状态，不等于本次用户已批准最终团队交付。

历史真实三阶段仍为 **2 Enhanced Success / 1 Degraded Success / 0 Failure**。原FAIL、空规划/Token耗尽证据保留；本轮离线重验旧29文件哈希、课程来源及裁定规则，没有将降级改称增强成功。本轮新增真实模型/业务请求均 **0**，没有使用任务允许的最多2次真实业务预算；Mock及历史证据已足以核查交互，未为成功截图新增采样。

## 2. Deliverable Navigation

|材料|内容简介与使用场景|
|---|---|
|[最终架构实践报告](./phase4-final-architecture-report.md)|独立阅读的问题→设计→实验→取舍→集成验收案例，课程报告主入口|
|[Evidence Index](./phase4-evidence-index.md)|历史过程、代码、分支及本地原件总导航，复核与迁机盘点入口|
|[Drivers / QAS / Views](./phase4-architecture-design-and-views.md)|D1–D6、QAS-01–06、真实文件/运行时关系及机制，用于理论答辩|
|[回顾性ATAM](./phase4-atam-and-decision-review.md)|敏感点置信度、权衡、风险及ADR复盘，解释决策依据|
|[最终ADR](./phase3-final-architecture-decision.md)|Accepted决策、人工批准范围与接受代价，团队集成约束|
|[双策略集成记录](./phase3-dual-strategy-integration.md)|选择性移植边界、接口与前端开关，供代码审查|
|[12页PPT规划](./phase4-presentation-outline.md)|主线10分40秒、10/15分钟安排、逐页证据和追问，制作展示用|
|[演示脚本](./phase4-demo-script.md)|标准/增强/受控回退、启动和备用方案，彩排执行用|
|[20题答辩Q&A](./phase4-defense-qa.md)|理论、ATAM、实验及可靠性短答，成员备答用|
|[4图资源与渲染说明](./assets/p4t4/README.md)|SVG/PNG/mmd与复现脚本，制作图表及核查源图用|
|[最终验收第11节](./phase3-final-acceptance.md)|原FAIL、裁定PASS、增强/降级分层及风险，避免错误宣称|

## 3. Verification Matrix

本轮新证据统一存于被忽略的 `data/verification/p4t5-readiness-20261118-v1/`。下表均区分实际运行、静态核对与历史重放，不把不同证据数量相加。

|检查项|状态|证据与方法|限制|
|---|---|---|---|
|最终架构、Drivers/QAS、ATAM/术语|PASS / Static Inspection|通读最终材料；`review-inventory.json`；代码与既有conformance对应|轻量回顾性ATAM；不证明长期质量收益|
|历史实验数字与标签口径|PASS / Saved Evidence Inspection|只读P3T3 comparison、B-v2 summary、Coverage summary/fixed及裁定原件|不重跑质量实验、不重标；AI标签非独立金标准|
|全部迭代文档及外部入口相对链接|PASS / Automated Check|35份文档、734条相对文件链接、135个去重目标，全部存在且大小写匹配；`final-doc-check.json`|外部Worktree及忽略data不随主线clone；检查文件目标，不保证所有历史标题锚点在各Markdown渲染器一致|
|4图资产及源块|PASS / Static Inspection + Visual Preview|4组SVG/PNG/mmd存在；mmd与P4T2源块规范换行后一致；打开4张PNG检查|宽Module与长时序须放大/分段；本轮未重新生成图片|
|正式PPT导入、最终投影可读性|NOT VERIFIED|没有创建或导入正式PPTX；现有SVG含foreignObject，PNG为兼容备用|由制作者在实际PPT/投影环境确认|
|正常启动命令、代理及默认UI|PASS / Real Browser + Real Backend（无模型调用）|`startup-smoke.json`：8000真实uvicorn、5173真实Vite、7章、Chrome默认baseline、无配置生成禁用|启动子进程禁dotenv并清模型变量，不代表上游连通性|
|标准/增强/回退与成果保护彩排|PASS / Real Browser + Real Backend + Mock Model|`chrome-mock/results.json` 17组；8016→5186，真实课件；独立浏览器context|Mock最终内容不代表真实教学效果；未操作用户已有浏览器草稿|
|API替身Chrome E2E|PASS / Real Browser + Mock API|`e2e.log` 最终25 passed、进程exit0；输出 `api-e2e/`|运行器收尾曾停滞，身份核实后停止其自建Vite子进程；总11.3分钟不能当业务耗时|
|后端＋评估工具回归|PASS / Automated Test|`backend.log`：264 passed，55.04秒，1条既有Starlette/httpx弃用警告|独立子进程禁dotenv/清模型变量；不安装新依赖|
|前端回归、生产构建|PASS / Automated Test / Build|`frontend.log`：21文件、152 passed；`build.log`：tsc＋Vite build通过|本地结果，不声称远端CI通过|
|裁定规则及行数器|PASS / Automated Test|`node-tests.log`：9项裁定＋2项行数器=11 passed；131个手写文件无超限|无新增产品测试或实现|
|来源契约/原B/共享生成架构符合性|PASS / Automated Conformance|历史重放17项，26次来源、15次legacy对照；本轮Mock轨迹另17项、23次来源、14次legacy对照，见`current-conformance.json`|原B仅排除策略控制字段；结构溯源不等于结论语义认证|
|原FAIL与最终裁定|PASS / Offline Historical Revalidation|`historical-replay/adjudication.json`：旧29文件哈希不变、原FAIL、当前PASS、2/1/0|仍是一个历史真实工作流，无新增真实成功样本|
|当前模型配置|PASS / Configuration Inspection|`model-config-summary.json`：配置字段齐全，api.deepseek.com / deepseek-flash|未输出密钥，未验证当前服务连通/余额/价格；实时代码路径不作新Real Model验收|
|本轮真实模型彩排|NOT RUN|新增真实规划0、最终生成0，保留历史6HTTP/25,853 Token/cost=null|用户仍需亲看或另安排真实演示|
|Git共同基点/引用/分支保留|PASS / Read-only Git Review|`review-inventory.json`：候选commit可解析、共同基点存在、7个Worktree起始干净|无Fetch，远程跟踪引用可能陈旧|
|跨机器执行|NOT VERIFIED|Repository-level portability checked; cross-machine execution not verified.|当前解释器绝对路径、OCR与忽略证据需迁机准备|

### 实验数字的独立核对摘要

|批次与评分分母|核对值|解释边界|
|---|---|---|
|P3T3开发11、保留3|开发KC Baseline/A/B/C=50/31.82/63.64/50%；保留33.33/16.67/50/16.67%；B开发wall11.207秒对4.259秒|B保留1升1降1平，非稳定整体领先；wall只到已校验来源|
|扩充新测试9|Baseline/B/B-v2 KC=66.67/66.67/55.56%，wall3.057/8.104/9.334秒|同一新批内部比较，不跨批拼墙钟；T集后续已观察|
|Coverage固定计划同候选42|0升2降40平；D03原B含5:27、新选择丢失；纯选择0.012/4.462毫秒|意图代理不等于知识覆盖；N13漏列6:15，不据旧标签断言没有检测知识|

P8始终为不完整标注下界，未知来源保留unjudged；不报告缺乏完整相关页全集的Recall或生产P95。上述局限在报告、PPT规划、Q&A与ATAM中一致。

### 本轮文档修正范围

只修正README“待验收”和FEATURES首部“P3T6尚未完成”的当前导航措辞，增加Accepted/裁定PASS及交接入口；功能快照正文仍保留历史日期。最终报告仅增补P4T5核查导航，索引更新状态与已解决项。未改原始FAIL、历史实验/标注、ADR、生产源码、Prompt或候选原型。

## 4. Demo Readiness

实际环境为现成maga Python 3.11.18、Node22.17.1/npm10.9.2、Vite6.4.5、Chrome157.0.8103.79；7份PPT、82份OCR、340张页图。无账号或初始化数据库要求。本轮正常启动用独立子进程禁用模型配置；已存在.env不覆盖。Mock harness自行用acceptance-mock/mock.invalid，所有新事件 `real=false`，没有外部模型请求。

|场景|结果|本轮实际行为|
|---|---|---|
|标准检索三阶段|PASS / Real Browser + Real Backend + Mock Model|默认baseline；3次原最终生成Mock、Planner0；真实PPT引用预览和刷新恢复|
|增强三阶段|PASS / 同上|请求均llm_assisted；Planner3次Mock且normal，业务完整，loading时模式禁用；不计入历史真实2/1/0|
|标准→增强→标准|PASS / 同上|Planner仅1次，控制字段只在增强请求携带；模式刷新复归baseline|
|规划六类故障及回退UI|PASS / 同上＋故障注入|json/schema/empty/unknown/connection/timeout继续业务；公开retrievalFallback和回退提示成立|
|最终生成五类故障|PASS / 同上＋故障注入|502可见，旧成果不变；不是降级成功|
|停止/重复/重试/迟到|PASS / 同上|UI旧/新成果保护通过，同时观察后台可继续；不声称远端立即停计费|
|当前真实服务正常增强|NOT RUN / Real Model|只安全确认配置；链路真实性依历史P3T6，未以Mock补造真实验收|

当前Mock17组结果、截图、trace在 `chrome-mock/`，原始事件在 `mock-server/events.jsonl`；其中API fault条目是同一真后端的HTTP检查，不冒称每项都有浏览器点击。截图 `fallback.png` 为内滚动区当前可视状态，不一定同时显示顶部回退提示；提示可见性已由浏览器断言验证，展示时应滚到顶部，不能拿截屏裁切证明提示不存在。

模型/网络异常时切到明确标注的Mock故障注入或历史真实记录；不反复请求追求normal。15秒仅Planner deadline，标准模式仍需要最终模型。演示时保留旧成果、不清用户localStorage、不把前端停止当服务端取消。现场计时及组员口述/操作配合仍需人工彩排；自动化脚本通过不代替用户观看。

本轮所有自行启动的8000/5173与8016/5186服务在检查后停止，未停止已存在的用户服务；清理只涉及已核实身份的本轮进程，产物保留。

## 5. Git Handoff

### 分支关系与版本

|引用|审查起始值与含义|
|---|---|
|iteration/jack|`c4bca68fdc2e267b7913760fb55ca16093719da3`；本文提交后新增1个P4T5文档提交|
|main / origin/main / merge-base|均为 `b000353fbafb8fc2a545ac30808ae4ab739cf2b3`|
|origin/iteration/jack|本地跟踪引用仍为b000353；起始 `main...HEAD` 与上游比较均0/14，P4T5提交后0/15|
|原B选择性生产集成|`0a91d63973706d79671f3842175d0ba8ee273b66`|
|原FAIL / 裁定PASS|`9b6b1ea6f6ef14729def6475a55f4626aad2d053` / `f58b6c9caa88a24643886f1fc4e1f1e26e4e20c3`|

**未Fetch；以上远程跟踪引用不是远端即时状态。** 当前已知main是本分支祖先，main侧自共同祖先后无提交/文件变化，所以此快照中没有双侧修改文件、没有已确认文本冲突，具备快进关系。不据此保证组员最新远端main也无冲突。

最终交接commit用 `git log -1 --format=%H -- docs/iteration3_jack/phase4-final-handoff.md` 获取，最终工作区状态见交付消息；避免把本文起始hash误当本次提交hash。当前P4T5只改文档，整个迭代相对main则包含生产改动，不能按“纯文档PR”审查。

起始相对main共100文件：后端生产6、前端生产5、后端测试4、前端测试1、工具28、fixtures7、文档/图形48、配置1（.gitignore）。P4T5新增本文后共101文件；没有依赖清单/lock、数据库或新基础设施变化。完整路径在本轮 `review-inventory.json`，最终以 `git diff --name-status main...iteration/jack` 为准。

### 明确需要协调的文件

以下是本分支真实修改路径，也是团队若有同期改动必须核对的接线处；**不是声称已发现冲突**：

|区域|文件与冲突时应保留的行为|
|---|---|
|API装配/模型|`server/main.py`、`server/models.py`；baseline默认、合法枚举、旧请求兼容及可选回退字段|
|来源/生成边界|`server/design.py`、`server/design_sources.py`、`server/design_source_contracts.py`、`server/design_planner.py`；统一校验、原B Prompt/轮转、仅规划已知异常回退，原生成错误语义不变|
|前端状态/API|`web/src/DesignStudio.tsx`、`web/src/api.ts`、`web/src/types.ts`、`web/src/DesignRetrievalMode.tsx`、`web/src/studio.css`；显式增强、临时模式、取消/迟到及旧成果保护|
|交接及忽略规则|README、FEATURES、`.gitignore`；别恢复“待验收”旧状态，别把.env/大型原件意外纳入提交|
|回归与证据|上述对应新增测试、scripts、fixtures及docs；不能以解决冲突为由删失败用例、改冻结标签或覆盖历史FAIL|

共享 `server/search.py`、`retrieval_terms.py`、`chapters.py`、`tutor.py`、`quiz.py`、`llm.py` 与实验基点相同；conformance复核通过。不要把组员独立修改误判成应被本分支覆盖；接收后重新审查双方意图。

### 实验分支保留

|分支/同级Worktree|HEAD|
|---|---|
|experiment/iteration3-a / MAGA-exp-a|`ef7d2993ce31c02751df576ba9cc9b5307a3f1ad`|
|experiment/iteration3-b / MAGA-exp-b|`4f878dcaa14a6d62a7f0506b866afe5fcd17f68d`|
|experiment/iteration3-c / MAGA-exp-c|`a467ab17cbf0f13e347b348008bb3ed3385dcf0a`|
|experiment/iteration3-b-v2 / MAGA-exp-b-v2|`cf5ba925662183daa8bf643dabade9ac2ce9c359`|
|experiment/iteration3-b-coverage / MAGA-exp-b-coverage|`b07392bbfa49fbdaea3935bd6099a5e0d4c78894`|
|detached / MAGA-exp-baseline|`c6fc1857928468030e6a030b13a146300bf93304`|

六个实验Worktree及主目录起始均干净，候选共同包含c6fc185，Git对象可解析；本轮无修改或删除。**原B已在iteration/jack选择性集成，不需要再Merge原B实验分支，更不能顺手Merge其他候选。**

### 推荐团队接收顺序（仅建议，本轮不执行）

1. 用户阅读报告/残余风险，前后端维护者分别确认上述接线，main负责人协调合并时间。
2. 获明确授权后，由负责人更新远端信息并重新比较main与iteration/jack；若出现双侧修改，逐文件解决并保留兼容/回退/成果保护。当前本地快进关系仅作参考。
3. 评审并接收**完整iteration/jack最终提交链**，保留实验/裁定历史；采用团队批准的合并方式，不在旧main上重新拼装原B。验收后才按授权推送。
4. 接收后重跑后端264项所在入口、前端测试/构建、Chrome API替身E2E、17组真后端Mock模型彩排、来源/conformance、链接/diff检查。确认默认0Planner、增强字段/原B、合法回退/最终失败区分，不能只看静态冲突消失。

## 6. Evidence Portability & Residual Risks

**Repository-level portability checked; cross-machine execution not verified.**

- tracked报告、协议、7份fixtures、源码、测试及4组图像随当前分支交接。AGENTS.md为本机被忽略协作资料，环境命令已在演示/本文解释，不能假定新clone带有该文件。
- 初查134个去重链接目标中，109个为仓库目标、20个为忽略本地证据、5个为同级Worktree原型说明。初查34文档715条链接存在；本文/导航增补后为35文档734条链接、135目标，新增目标即本文。有效本地链接不等于可迁移证据包。
- `data/verification/` 中原始计划、完整排序、manifest、Token、原FAIL/裁定及本轮日志没有随Git提交；按索引列出的目录另行准备**经人工脱敏确认**的证据包与SHA256清单，保留原件不覆盖。本轮只盘点和校验，没有打包/上传或替用户批准外发。
- 82份OCR、340张页图被忽略，PPT由Git跟踪；复现实验须带匹配OCR，演示无页图可降级文本。Python路径是本机示例，新机需相同依赖并替换为实际解释器，不复制.env；配置持有人自行安全提供模型服务设置。
- 5份原型说明只在实验分支；团队只接收iteration/jack不自动取得未推送候选对象。原型可用索引中的 `git show <commit>:docs/iteration3_jack/phase3-prototype-*.md` 读取，前提是对象已由授权的分支/离线Git包交接。main接收不要求把候选算法合并。
- 本轮为20个本地证据目标及5个原型说明记录路径/大小/SHA256，收尾核对未改；旧FAIL manifest SHA256仍为 `63e8456f9de43bae2f644e6caa523f1ddbf1588761b0e2871d7d8b8d11741b8c`，29个清单文件重验。清单在本轮忽略目录，迁机时需一并交接，不声称Git已包含它。

仍保留：原B收益不稳定；AI标注/小样本及N13漏页；LLM输出随机和增强延迟；货币成本未知；取消后后台可能继续及计费；无长期服务可靠性、生产负载或教学收益证明。用户手动选择是否有效也未测。严格来源定位校验不等于语义充分性。

## 7. Reproduction & Final Checks

以下是本轮实际执行入口（根目录，输出只用本轮全新目录；复跑必须改新名字，不能覆盖现有证据）：

```powershell
# 独立测试终端：不改已有.env。
$env:PYTHON_DOTENV_DISABLED='1'
$env:PYTHONIOENCODING='utf-8'
Remove-Item Env:LLM_API_KEY,Env:LLM_MODEL,Env:LLM_BASE_URL -ErrorAction SilentlyContinue
& 'D:/app_install/miniconda/envs/maga/python.exe' -m pytest server/tests scripts -q --tb=short --basetemp data/verification/p4t5-readiness-20261118-v1/pytest-temp
npm.cmd --prefix web test
npm.cmd --prefix web run build
$env:PLAYWRIGHT_CHANNEL='chrome'
npm.cmd --prefix web run test:e2e -- --output ../data/verification/p4t5-readiness-20261118-v1/api-e2e --reporter=list
node --test scripts/acceptance-verdict.test.mjs scripts/check-file-lengths.test.mjs
node scripts/check-file-lengths.mjs
node scripts/replay-acceptance.mjs data/verification/p3t6-acceptance-20261117-v1 data/verification/p4t5-readiness-20261118-v1/historical-replay
git diff --check
```

Mock彩排实际命令分别在独立终端执行，旧目录不得重用：

```powershell
& 'D:/app_install/miniconda/envs/maga/python.exe' scripts/acceptance-server.py --port 8016 --output data/verification/p4t5-readiness-20261118-v1/mock-server
node scripts/acceptance-vite.mjs 5186 8016
node scripts/acceptance-browser.mjs http://127.0.0.1:5186 http://127.0.0.1:8016 data/verification/p4t5-readiness-20261118-v1/chrome-mock
```

正常启动另实际运行演示脚本中的uvicorn8000/Vite5173命令，在禁模型配置的子进程访问health、Vite代理的chapters和Chrome工作台；`startup-smoke.json`记录结果。配置检查另在只读子进程加载既有.env，仅保存configured/model/host，无密钥；无真实连接尝试。

只读核查脚本 `review-inventory.py`、`startup-smoke.mjs` 及JSON清单仅在本轮忽略目录，未作为新增生产工具纳入分支；其作用/检查范围已在本文披露。当前来源复验使用新的 `current-conformance-input/`（复制历史89项corpus签名＋本轮Mock事件），执行已有 `acceptance-conformance.py --evidence ... --output .../current-conformance.json`；不向原始验收目录写入。截图、trace和日志均保留，未清理历史资料。

## 8. Human Sign-off Checklist

以下保持未勾选，必须由用户或团队实际确认：

- [ ] 人工阅读最终报告，认可事实与结论边界。
- [ ] 确认12页PPT故事线及课程时间安排。
- [ ] 观看或执行一次真实演示，明确历史/本轮/Mock区别与新增调用安排。
- [ ] 在最终PPT与投影设备上确认图表可读，无裁切或过小字号。
- [ ] 确认延迟、费用未知、取消及长期可靠性等剩余风险可以接受。
- [ ] 确认脱敏证据包、OCR/图像、候选对象的团队可访问性；新机器实际验证仍待执行。
- [ ] 与组员协调main最新改动、合并时间及上述接线文件的处理。
- [ ] 明确授权后续Merge / Push及最终团队交付。

本轮技术核查结束后停止。没有Fetch、Merge、Rebase、Push、删除Worktree或最终人工交付批准；本地仅提交上述必要文档修正与本文/索引。
