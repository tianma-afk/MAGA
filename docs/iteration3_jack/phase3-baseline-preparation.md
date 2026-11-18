# P3T1A：共同实验基点审查与Worktree准备

审查完成日期：2026-11-16（Asia/Shanghai）。状态：**仅审查与计划；所有提交、目录创建、资源复制和真实调用均待人工明确批准。** 本文不是已创建环境的验收记录。

依据：[Phase 1基线](phase1-baseline.md)、[任务定义](phase1-task-definition.md)、[P2分析](phase2-analysis.md)、[评分协议](phase2-evaluation-protocol.md)、[复核](phase2-baseline-review.md)、[实验设计](phase2-experiment-design.md)、[开发契约](phase2-implementation-contract.md)。保留三机制边界，不重复根因实验；B1批准状态和B模型参数不能由“进入Phase 3准备”推定。

## 1. 本次只读Git实况

| 项目 | 已核对事实 |
| --- | --- |
| 分支/HEAD | `iteration/jack` / `b000353fbafb8fc2a545ac30808ae4ab739cf2b3` |
| 本地分支 | `iteration/jack`、`main`；未发现`experiment/iteration3-a/b/c` |
| 暂存区 | `git diff --cached --name-status`为空 |
| 已跟踪未提交修改 | 只有`.gitignore`，新增忽略`AGENTS.md`、`iteration3_plan.md`及空行；不推定修改作者/团队归属 |
| 未跟踪 | 本轮7份既有文档、3份自然需求fixture、评估脚本/测试，以及`docs/architecture-evidence-audit.md`；本次本文新增后另多1份 |
| worktree | 只有当前MAGA工作目录，HEAD为上述commit |
| 中间操作 | MERGE_HEAD、CHERRY_PICK_HEAD、REVERT_HEAD、rebase-merge、rebase-apply、sequencer、index.lock均不存在 |
| 生产代码 | `git diff --name-only -- server web`为空；当前HEAD并未包含本轮文档/工具 |
| 忽略资源 | `.env`、AGENTS、iteration3_plan.md、data/ocr、data/slides、data/verification均被忽略；本轮docs/fixtures/scripts未被忽略 |

没有正在进行的Git操作，不代表可无授权提交。当前最大风险是漏带未跟踪实验工具，或把个人/历史文件一并提交。未检查远端实时状态、未fetch，不将本地分支表当远端全貌。

## 2. 精确文件归属与Staging清单

### 清单A：建议纳入共同材料提交（13项，全部待批准）

下列当前均**未跟踪**。这些是本轮已明确要求产生的材料；建议不等于已获提交授权。检查列只描述已有证据，不冒充本次重跑或独立人工验收。均是小型文本，不含必要的大体积产物；提交前仍需看完整暂存diff，不能仅凭扩展名断言无敏感信息。

| 精确路径 | 用途/推荐理由 | 检查与剩余条件 |
| --- | --- | --- |
| `docs/iteration3_jack/phase1-baseline.md` | 保存真实工程和历史验证 | 已有链接/事实核对；历史测试不当新结果 |
| `docs/iteration3_jack/phase1-task-definition.md` | 人工主任务、边界、验收依据 | 内容保留人工决定与待验证区别 |
| `docs/iteration3_jack/phase2-analysis.md` | 根因、质量场景、候选比较 | v2历史数字有v3指引，不表示方案已接受 |
| `docs/iteration3_jack/phase2-evaluation-protocol.md` | 评分/计时/保留规则 | 原口径和版本修正均保留；待正式冻结 |
| `docs/iteration3_jack/phase2-baseline-review.md` | Codex复核及v3粒度解释 | 非独立人工金标准，限制需一起提交 |
| `docs/iteration3_jack/phase2-experiment-design.md` | A/B/C实验设计 | 模型/参数/预算及B1仍待批准 |
| `docs/iteration3_jack/phase2-implementation-contract.md` | 约束、接口、符合性与任务拆解 | 拟新增检查/接口不能写成已实现 |
| `docs/iteration3_jack/phase3-baseline-preparation.md` | 本次状态、清单和执行交接 | 本文只读审查；纳入后需按实际执行补新记录而非改写历史 |
| `docs/fixtures/iteration3-design-needs.json` | v1原标注历史 | JSON可解析；保留版本可解释指标变化 |
| `docs/fixtures/iteration3-design-needs-v2.json` | OCR补查标注历史 | 不作为当前开发口径，不删除凑简洁 |
| `docs/fixtures/iteration3-design-needs-v3.json` | 开发暂定评分与复核映射 | SHA匹配reviewed结果；保留粒度尚未统一 |
| `scripts/evaluate-design-needs.py` | 旧来源实测/重评分入口 | 历史3项边界测试通过；尚不支持新候选适配 |
| `scripts/test_evaluate_design_needs.py` | 评分边界测试 | 历史3项通过，本次只核对依赖和文件存在 |

不提交这些文件会使从HEAD新建的worktree缺失本轮任务/评估依据。历史源码、README、CI、依赖声明、前端锁文件和book已跟踪，未改时无需重复stage。

### 清单B：保留、不纳入本次共同提交

| 路径 | 当前状态/原因 | 不提交时的复现安排 |
| --- | --- | --- |
| `.env` | 已忽略，模型凭据；本次未读取内容 | 后续每进程安全注入，禁止把真实Key写入命令或记录 |
| `AGENTS.md` | 已忽略，本地协作指南 | 关键共同约束已在可提交契约中，不依赖各worktree隐含继承 |
| `iteration3_plan.md` | 已忽略，本地计划；未展开读取内容 | 以已审本轮文档为共同依据，若内容需归档由人工另审 |
| `data/ocr/` | 已忽略，检索实际依赖 | 按冻结manifest复制必要小文件并核hash，不能重生成当同条件 |
| `data/slides/` | 已忽略，大体积页图 | 纯来源实验不需要；UI验收按需准备 |
| `data/verification/` | 已忽略，含历史/当前结果及保留明细 | 原件原地保留，用已提交摘要/协议/脚本复算；需要迁移仅复制明确批准的manifest/开发结果，不分发保留失败 |
| `web/node_modules/`、`web/dist/`、缓存/截图 | 依赖或生成物，不作为源码基点 | 按lock准备、复用下载缓存，独立可写构建目录 |

### 清单C：人工决定归属，不混入清单A

| 精确路径 | 事实与争议 | 推荐/其他选择 |
| --- | --- | --- |
| `.gitignore` | 唯一已有tracked修改，忽略两个个人文件；不是本次写入 | 推荐留在原工作区、不纳本次提交；也可人工审查后单独提交，不能擅自撤回 |
| `docs/architecture-evidence-audit.md` | 未跟踪历史回顾审计，日期2026-11-14；不是本轮新评测 | 推荐暂留不提交；如人工确认归属/分享意愿，可单独文档提交，不与实验准备捆绑 |

本次status未发现其他未忽略修改；不保证其他机器或被忽略个人目录无材料。清单B内容若有归档需求须另审，不能把隐私文件临时force-add。

## 3. 评估资产、资源和入口

### 3.1 资产准备情况

- 自然需求集位于清单A的v1/v2/v3 JSON；开发12/保留4、2例暂不评分的历史状态保留。本次未读取保留逐例输出，也未调整标注。
- 当前采用的修正结果目录：`data/verification/iteration3-design-needs-baseline-v3-reviewed/`，含summary.json、dev.json、holdout.json。本次只读取summary签名、列文件，不读取holdout明细。
- 开发v3覆盖50%、相关下界11.36%为既有暂定结果，不是完整准确率；评分解释和复现命令在[协议](phase2-evaluation-protocol.md)及[复核](phase2-baseline-review.md)。
- summary引用的89项语料签名（7个PPT+82个OCR）本次逐项核对：缺失0、改变0；v3 fixture SHA与结果一致。这是**资源一致性检查，不是重新评估**。
- 统一旧评估脚本与测试已存在，尚未跟踪，清单A提交后各分支才会取得；默认来源结果可复算，历史data不会自动检出。

**实际缺口：** `server/design_sources.py`和`server/design_source_contracts.py`均不存在；新候选统一运行入口尚未实现，旧脚本仍断言_sources等于原query Top-8。契约已设计接口不等于代码已就绪。因此材料提交hash只能先记`MATERIAL_BASE`，完成并验证公共适配/运行器后的hash才是`EXPERIMENT_BASE`。两个hash可能不同，不能把旧HEAD或仅文档提交称最终实验基点。

推荐P3T1B先获准提交现有共同材料，再以单独明确授权完成共同准备实现、默认等价与工具测试，冻结最终EXPERIMENT_BASE后才创建候选worktree。如果P3T1B只获Git操作授权，则只提交材料，暂停创建“已可开工”的实验分支；也可人工批准先建准备目录，但必须标记接口未就绪并在实现开始前统一更新到同一最终hash，不采用强制reset覆盖工作。推荐前一种，避免基点多次同步。

### 3.2 课程与本地资源

| 资源 | 当前数量/大小 | Git与worktree安排 |
| --- | --- | --- |
| `book/*.pptx` | 7份，共34,689,966字节 | 已跟踪，会按共同commit检出；无需额外复制 |
| book教材PDF | 已跟踪 | 随commit检出，但未纳入现检索，不用它补评分知识 |
| `data/ocr/**/*.txt` | 82份，共54,450字节 | 被忽略；推荐各worktree复制冻结文本，核对逐文件hash |
| `data/slides/**/*.png` | 340张，共70,012,126字节 | 被忽略；纯来源阶段暂不复制，UI验收再按批准方案准备 |

低成本默认是复制约54KB OCR到独立目录而非链接，避免共享可写资产和Windows链接权限。只读共享可作为备选，但当前默认路径与data布局固定，不能不配置就声称共享已生效；需经过显式路径适配/验证或批准创建目录链接。链接目标可能可写，不能仅因名为“只读共享”就断言已权限隔离。本次未复制、移动、链接或删除任何素材。

### 3.3 环境与测试入口（只确认，未重跑）

| 项目 | 本次事实/入口 |
| --- | --- |
| Python | `D:/app_install/miniconda/envs/maga/python.exe`，3.11.18；不依赖系统默认Python |
| 后端包 | metadata确认FastAPI0.162.7、httpx0.28.1、pytest9.2.0、Pydantic2.14.3、python-pptx1.0.2、python-dotenv1.2.4、uvicorn0.54.0 |
| Node/npm | v22.17.1 / 10.9.2；web/node_modules存在，不代表新worktree已有 |
| 浏览器 | `C:/Program Files/Google/Chrome/Application/chrome.exe`，157.0.8103.51；本次未启动 |
| 后端测试 | `python -m pytest server/tests -q`；脚本测试`python -m pytest scripts/test_evaluate_design_needs.py -q` |
| 前端 | `npm.cmd --prefix web test`、`npm.cmd --prefix web run build` |
| E2E | 设置`$env:PLAYWRIGHT_CHANNEL='chrome'`后`npm.cmd --prefix web run test:e2e`；默认配置可复用已有Vite，须核实服务属于正确worktree |
| 检索入口 | `python scripts/evaluate-design-needs.py --repo . --cases docs/fixtures/iteration3-design-needs-v3.json --output <全新run目录> --repeats 3`；新候选不能直接依赖旧断言，待公共运行器 |
| 模型配置 | .env存在，仅核存在/元数据；config.py读取LLM_API_KEY/MODEL/BASE_URL，未检查真实值、额度或连通性 |

共用现有maga可减少安装，但运行期间不改包；冻结pip metadata/依赖清单，避免同环境并行安装污染。npm下载缓存可共用，各worktree node_modules/dist保持独立，不共享可写构建产物。正式性能串行，不能将同时运行三个进程的竞争当算法差异。后续必要安装须另获任务范围授权，本次没有安装。

## 4. Branch/Worktree规划

| 方案 | 建议分支 | 相对主仓库路径 | 当前冲突检查 |
| --- | --- | --- | --- |
| A | `experiment/iteration3-a` | `../MAGA-exp-a` | 分支/目录均不存在 |
| B | `experiment/iteration3-b` | `../MAGA-exp-b` | 分支/目录均不存在 |
| C | `experiment/iteration3-c` | `../MAGA-exp-c` | 分支/目录均不存在 |

上述目录的绝对路径前缀为本仓库父目录，即`D:/Jack_s_file/learning/课内学习/大三上课内/软件体系结构/体系结构大作业/`，三个完整目录路径各60字符；较短，但依赖的深层路径仍可能遇到Windows工具限制。`core.longpaths`本次查询未配置，未改变系统/Git设置。父目录存在，但未通过写入测试核实权限；同级目录超出本次已给Codex写入根范围，D2/D6须明确授权并在执行时满足实际工具权限，不绕过沙箱。

冲突时不覆盖，统一换`-r2`等后缀并记录。普通分支切换不推荐：未跟踪/忽略文件会留在目录造成条件混杂。worktree共享Git对象/引用，不能让多个进程checkout同一分支；每个Codex实例只写自己的目录，公共准备由协调执行。

所有源码/工具/样本从EXPERIMENT_BASE检出；OCR按manifest同步，Key以各进程安全环境提供，不打印、不自动复制.env；页图按需。正式结果写各自`data/verification/iteration3-competition/<variant>/<UTC-shortHEAD-GUID>/`，目录存在即拒绝，不覆盖旧run。保留评估仅在协调上下文执行，开发上下文不读失败明细。

源评估不需端口。浏览器/真实API集成若同时演示，建议A后端8101/前端5174、B8102/5175、C8103/5176，**仅候选分配，须先检查端口占用并明确代理配置方式**；不能擅改生产代理或停止已有服务。最简单的正式验证是同一时刻只运行一个worktree服务，复用标准8000/5173前先确认用户服务归属。

## 5. 人工决策表

以下全部为**待批准**，本次请求只授权审查，不自动通过任何行。

| ID | 决策问题/事实 | 推荐默认值 | 其他选择与后果 | 阻塞范围 | 状态 |
| --- | --- | --- | --- | --- | --- |
| D1 | 13项材料均未跟踪；另有.ignore和审计 | 批准清单A精确提交；清单C留原处不夹带 | 单独批准.ignore/审计需另审；有争议则先暂停该批提交，不提交他人文件 | P3T1B提交 | 待批准 |
| D2 | 3分支/目录无冲突，父目录未获写入许可验证 | 采用上表分支与同级目录，允许经工具权限核准后创建；先顺序执行 | 另指定可写根/后缀；未批准多实例则不并行；嵌套worktree须防主目录扫描污染 | worktree创建 | 待批准 |
| D3 | PPT已跟踪，OCR约54KB、图约70MB被忽略 | 各目录复制冻结OCR并核hash；页图按需；不建链接 | 批准链接/共享要处理路径和权限；无资源则先准备，不能用缺OCR成绩比较 | 资源就绪/实验 | 待批准 |
| D4 | v3开发可用但初标，保留粒度未统一 | v3开发暂定冻结，公共运行器同版；正式保留前独立于失败结果统一粒度并记新版本 | 暂不完成标注时只能探索，不称正式优胜；新返回页仍unjudged | 正式比较，不必阻止材料提交 | 待批准 |
| D5 | .env存在，不知道模型/额度/费用；旧设计正式48次规划 | 优先复用授权服务；P3T2开发先Mock，真实冒烟建议开发每例最多1次，预选N01/N06/N10各再2次，总≤18次；另批货币上限。正式实验仍16×3≤48次独立预算 | 仅Mock可先做B结构，不能比较真实语义收益；改正式重复次数须重新批准协议。模型ID、费用预算需用户确认，不猜测 | B真实调用/完整比较，不阻材料或A/C开发 | 待批准 |
| D6 | 本次无Git写授权，原则支持实验不等于允许提交 | P3T1B明确授权精确Stage/审查/Commit/指定分支worktree创建，范围写明 | 可只批准材料提交而暂缓环境；缺授权不执行任何写操作 | 所有Git写操作 | 待批准 |
| D7 | 需保护历史改动、预防冲突/资源或模型阻碍 | 争议暂停提交、冲突换名、缺OCR先准备；B未配时可先A/C及B Mock，但不宣布正式比较完成 | 人工可要求全条件齐备再开始；不reset/clean/stash补救，不关闭用户服务 | 对应风险项 | 待批准 |
| D8 | 公共来源适配/新运行器不存在 | 先材料commit，再单独批准公共准备实现/等价测试，固定EXPERIMENT_BASE后建3 worktree | 提前建目录只能称准备状态，原型启动前仍须同步同一最终hash，增加协调成本 | 真正共同实验基点/P3T2 | 待批准 |

D5的18次是本次提出的**开发预算建议**，不是调用记录或已授权预算；正式48次依旧待批准，不能把开发调用隐藏到正式批次，取消/失败尝试也计ledger。Prompt/模型实际版本、temperature、token上限、整体deadline、usage/费用、normal/fallback/replay分别记录，执行参数沿既有实验设计待确认，不在本次改规则。

## 6. P3T1B可执行交接（批准后才执行）

### 6.1 材料提交：本仓库根目录PowerShell

先核对决策D1/D6，确认仍在iteration/jack，暂存区为空，文件hash/内容无新增变化。以下所有写命令仅供后续授权任务，不是本次执行：

```powershell
$prodBase='b000353fbafb8fc2a545ac30808ae4ab739cf2b3'
git branch --show-current
git rev-parse HEAD
git status --short --untracked-files=all
git diff --cached --name-status
# 任一与获批快照不同则先核对，不擅自还原；暂存已有他人内容时停止。
$commonFiles = @(
 'docs/iteration3_jack/phase1-baseline.md',
 'docs/iteration3_jack/phase1-task-definition.md',
 'docs/iteration3_jack/phase2-analysis.md',
 'docs/iteration3_jack/phase2-evaluation-protocol.md',
 'docs/iteration3_jack/phase2-baseline-review.md',
 'docs/iteration3_jack/phase2-experiment-design.md',
 'docs/iteration3_jack/phase2-implementation-contract.md',
 'docs/iteration3_jack/phase3-baseline-preparation.md',
 'docs/fixtures/iteration3-design-needs.json',
 'docs/fixtures/iteration3-design-needs-v2.json',
 'docs/fixtures/iteration3-design-needs-v3.json',
 'scripts/evaluate-design-needs.py',
 'scripts/test_evaluate_design_needs.py'
)
foreach ($commonFile in $commonFiles) {
 if (-not (Test-Path -LiteralPath $commonFile -PathType Leaf)) { throw "Missing approved file: $commonFile" }
}
git add -- $commonFiles
git diff --cached --name-status
git diff --cached --check
git diff --cached
# 人工/执行者核对暂存文件严格等于获批列表、未混秘密和历史改动后，再执行：
git commit -m 'docs: freeze iteration3 experiment preparation assets'
$materialBase=(git rev-parse HEAD).Trim()
git show --stat --oneline $materialBase
git status --short
```

逐条检查退出码，命令失败就停止，不继续commit。不要使用commit -a（会夹带.ignore）或任何全量add；不得为修正staging执行全局reset/clean。此时MATERIAL_BASE是真实产生的hash；它不是预先虚构的commit，且还不是接口就绪保证。

### 6.2 公共准备门槛

若D8尚未授权实现，**在材料提交后停止**，不把材料hash标EXPERIMENT_BASE。后续公共准备任务落实内部来源适配、统一候选运行器/诊断、接口/默认等价测试和同版评分资产；不实现A/B/C机制。精确新增/改动路径、测试和提交另行审核，不能把尚不存在的文件预先stage。完成后记录最终实际`EXPERIMENT_BASE`与工具/语料/评分签名。

这一步是既有P2T4契约要求，不是重新选择架构或本次提前实现。如果人工选择在P3T1B只建worktree、共同代码后补，应在授权中明确仍为准备状态及全分支一致更新的流程，禁止用强制reset覆盖候选工作。

### 6.3 创建实验worktree

在D2/D6和实际目录权限满足、D8共同准备已验证后，从主仓库执行：

```powershell
$experimentBase='<已核验的最终EXPERIMENT_BASE完整hash>'
git show --no-patch $experimentBase
git worktree list
git branch --list 'experiment/iteration3-*'
foreach ($targetDir in @('../MAGA-exp-a','../MAGA-exp-b','../MAGA-exp-c')) {
 if (Test-Path -LiteralPath $targetDir) { throw "Target exists: $targetDir" }
}
# 再确认三个分支都不存在；若冲突，重新批准统一替代命名。
git worktree add -b experiment/iteration3-a ../MAGA-exp-a $experimentBase
git worktree add -b experiment/iteration3-b ../MAGA-exp-b $experimentBase
git worktree add -b experiment/iteration3-c ../MAGA-exp-c $experimentBase
foreach ($worktreeDir in @('../MAGA-exp-a','../MAGA-exp-b','../MAGA-exp-c')) {
 git -C $worktreeDir rev-parse HEAD
 git -C $worktreeDir branch --show-current
 git -C $worktreeDir status --short
}
git worktree list
```

每条创建失败即停，保留已创建目录记录，不自动删除回滚；三个HEAD须严格等于同一experimentBase，分支名分别匹配。之后才按D3批准方式提供OCR/配置，核对fixture/运行器/依赖/语料签名，保存独立实验元数据。复制动作必须明确源目标、目标不存在或比对一致，不覆盖不明内容；不在本文给默认执行的大目录复制命令。

## 7. P3T2启动条件与证据

- [ ] D1/D6提交范围与Git写操作已明确批准，原.ignore/审计及个人资料保全。
- [ ] 材料提交与真正EXPERIMENT_BASE均有实际hash；公共适配/运行器存在并完成默认来源等价测试。
- [ ] A/B/C worktree已创建、HEAD一致、分支/路径正确、无未完成Git操作；没有候选尚未开始就漂移的工具/标注。
- [ ] 7份PPT与必要OCR签名一致，依赖版本固定，原始data/Key未泄漏或被覆盖。
- [ ] [开发契约](phase2-implementation-contract.md)和各方案允许文件/机制边界获批准，新增工作明确只在所属目录。
- [ ] 正式评分冻结/保留粒度尚未完成的部分显式标记；不运行保留调参。
- [ ] B真实模型条件与预算已批准，或明确仅开发Mock/回退而暂缓真实效果；A/C先启动不等于实验已完成。
- [ ] 多Codex并行是否获准明确；默认顺序启动，每实例固定目录，正式性能测量串行。

每目录元数据保存：PROD_BASE、MATERIAL_BASE、EXPERIMENT_BASE、branch、HEAD、工具/评分/语料hash、Python/Node/包版本、资源同步方式、批准记录、未完成事项；各run另记命令、时间、方案版本、模型/Prompt（适用）、质量/延迟/usage/费用、故障回退、符合性检查。结果对应具体代码commit；资料在本机存在不等于已进入共同基点。

本次仅新增本文并执行只读检查，未进行Git写操作、环境创建、测试/评估重跑、模型调用、资源复制/删除或依赖安装。结束后等待人工确认，再进入P3T1B。
