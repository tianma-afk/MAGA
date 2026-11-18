# P4T4：双策略架构产品演示脚本

2026-11-18。命令已对照[README](../../README.md)、[Vite配置](../../web/vite.config.ts)、[验收工具](../../scripts/acceptance-server.py)及[历史验收](./phase3-final-acceptance.md)核对；**本轮没有启动产品、重跑业务或真实模型**。下述为可复用操作脚本，不是新增成功记录。

## 1. 准备与事实标签

|方式|展示什么|真实模型/预算|
|---|---|---|
|正常产品|真实需求、PPT来源及最终业务|标准每阶段1次最终生成；增强每阶段最多1次规划＋1次生成。现场运行前另行安排调用，不把本任务当授权|
|受控故障工具|真实前后端/PPT＋可重复规划失败与回退|外部模型完全Mock，无真实调用；必须在屏幕/讲稿标注“故障注入”|
|历史证据|已发生的真实三阶段2/1/0、截图/trace|不新增调用；标注2026-11-17历史运行，不能称现场成功|

运行前确认工作目录为MAGA根，`git branch --show-current`、`git rev-parse HEAD`、`git status --short`；最终决策为[Accepted ADR](./phase3-final-architecture-decision.md)。检查8000/5173或8016/5186端口身份，不停止未知进程；勿为演示清空用户localStorage，用Chrome独立演示配置/窗口，勿展示.env或请求Authorization。

数据为7份 `book/*.pptx`、82份本地 `data/ocr/`；OCR不是安装运行依赖但复现实验需同快照。页图在 `data/slides/`，缺图可用明确文本预览，不声称模型理解布局；迁机核对[证据索引](./phase4-evidence-index.md)。

## 2. 正常产品启动（仅未来演示执行）

使用已有maga环境，不新建/替换依赖。根目录两个独立PowerShell终端：

```powershell
# 终端A：复用既有.env，勿设置PYTHON_DOTENV_DISABLED=1。
& 'D:/app_install/miniconda/envs/maga/python.exe' -m uvicorn server.main:app --host 127.0.0.1 --port 8000
```

```powershell
# 终端B：现有前端依赖就绪。
npm.cmd --prefix web run dev -- --port 5173 --strictPort
```

Chrome访问 `http://127.0.0.1:5173/#/studio`，API文档 `http://127.0.0.1:8000/docs`。后端默认代理8000，别只改后端端口。[配置代码](../../server/config.py)读取 `LLM_API_KEY`、`LLM_MODEL`、`LLM_BASE_URL`，兼容chat/completions及JSON object；缺配置503，不能离线伪造教学回答。保留既有.env，需更改由配置持有人处理。

历史验收服务为api.deepseek.com / deepseek-flash，仅说明历史，不能保证当前配置/服务可用。先看页面配置状态，不打印密钥；当前任务不再次发模型测试。

## 3. 标准检索场景（完整演示约1–2分钟，非保证耗时）

推荐固定构造需求，来自[验收浏览器脚本](../../scripts/acceptance-browser.mjs)：

|实际输入标签|内容|
|---|---|
|设计标题|设备运行监测|
|场景描述|多个采集节点周期性上报状态，节点停止响应时需要检测并切换备用处理。|
|需求与约束|目标为故障检测和恢复服务，说明资源开销与恢复时间的权衡。|

1. 打开“架构实践”，检查“课程来源检索”为“标准检索（默认）”。
2. 填写三个字段，点击“生成质量属性与场景”，只提交一次，等待响应。
3. 查看属性/六要素场景，点击一条课程页引用打开预览，核对章节页码/摘录；页图缺失时展示文本。
4. 时间允许时点击“推荐架构战术”，勾选一项后“生成 AI 评审”；三阶段全部执行会产生3次最终生成。
5. 显示已保存结果；刷新恢复旧成果，并说明模式恢复Baseline。不要在用户原窗口演示覆盖旧草稿。

讲稿：“默认路径使用原有词法来源选择，没有额外Planner；最终分析仍需要模型。页码可信是结构溯源要求，不能单凭引用存在证明每句教学结论充分。”

## 4. 增强检索场景

1. 独立演示草稿中保留同一构造需求，主动选择“AI 增强检索”。选择只影响后续生成，不会自动更新旧结果。
2. 提交一次生成；观察加载时模式/生成禁用。不要重复点击或靠刷新重试。
3. 查看业务结果和来源。若显示“增强规划不可用，已使用标准检索。”，明确说明为降级；不把它当增强成功。
4. 解释完整路径：一次结构化规划→最多3意图原词法检索＋原查询→轮转去重→真实来源出口→原最终生成。内部诊断不在公开API中；需要说明normal证据时使用已脱敏历史日志，勿在普通UI凭200推断Planner成功。

讲稿：“增强让自然表达多一步需求规划，也增加等待和模型依赖。它不保证优于标准模式。15秒只限制Planner，不能承诺整个分析15秒返回。”

完整两套三阶段真实流程通常需要9次HTTP（Baseline3、增强最多6），不适合15分钟主线且本轮不执行。推荐现场只展示一次状态切换，结果用历史证据解释；不假装两次模型采样是固定候选公平比较。

## 5. 可重复故障回退（优先方案，无真实模型）

根目录三终端，输出使用GUID新目录，拒绝覆盖历史：

```powershell
# 终端A：工具自身设置虚构配置并禁用dotenv；生产代码不变。
$demoOutput = 'data/verification/p4t4-demo-' + [guid]::NewGuid().ToString('N')
& 'D:/app_install/miniconda/envs/maga/python.exe' scripts/acceptance-server.py --port 8016 --output $demoOutput
```

```powershell
# 终端B：隔离前端代理，不修改web/vite.config.ts。
node scripts/acceptance-vite.mjs 5186 8016
```

```powershell
# 终端C：先核实harness=p3t6且real=False，然后只向该本地工具注入。
Invoke-RestMethod http://127.0.0.1:8016/__acceptance__/identity
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8016/__acceptance__/control -ContentType 'application/json' -Body '{"fault":"json"}'
```

Chrome访问 `http://127.0.0.1:5186/#/studio`；填上述需求、选增强、生成。看到回退提示及Mock业务结果，打开真实PPT引用。工具故意让Planner输出非法JSON，Baseline取源及最终生成Mock继续，验证的是故障语义，不是模型语义质量。

讲稿：“这部分是受控故障注入：规划失败被识别，回到标准来源，业务继续。最终生成也是替身；真实业务连续性另由历史验收2增强/1降级支持。”

展示后将工具恢复为正常Mock，不操作生产服务：

```powershell
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8016/__acceptance__/control -ContentType 'application/json' -Body '{"fault":"none"}'
```

可选离线终端验证（不打开模型服务），在独立子进程禁用配置：

```powershell
node --test scripts/acceptance-verdict.test.mjs
$env:PYTHON_DOTENV_DISABLED='1'
Remove-Item Env:LLM_API_KEY,Env:LLM_MODEL,Env:LLM_BASE_URL -ErrorAction SilentlyContinue
$demoTestTemp = 'data/verification/p4t4-demo-test-' + [guid]::NewGuid().ToString('N')
& 'D:/app_install/miniconda/envs/maga/python.exe' -m pytest server/tests/test_acceptance_adjudication.py -q --basetemp $demoTestTemp
```

五类API测试分别验证增强、降级、回退失败、最终生成失败、伪造来源失败。[测试源码](../../server/tests/test_acceptance_adjudication.py)。后三类不得说成可成功回退；讲稿：“Planner降级只是局部保障，生成失败仍报错，旧成果应保留。”历史通过数见[验收§11](./phase3-final-acceptance.md)，本轮未重跑。

## 6. 历史真实证据与90秒备用片段

打开[真实摘要](../../data/verification/p3t6-acceptance-20261117-v1/real-summary.json)与[裁定](../../data/verification/p3t6-adjudication-20261117-v1/adjudication.json)，不直接投影可能含完整输入的原始事件。三阶段业务200，Planner normal/normal/invalid_plan，结果2/1/0；历史6HTTP、25,853Token、费用null。原[FAIL](../../data/verification/p3t6-acceptance-20261117-v1/chrome-real/results.json)保留。

90秒建议：20秒默认按钮与需求；20秒手动增强/加载提示；30秒受控回退及来源预览；20秒历史2/1/0及FAIL→裁定→PASS说明。截图/trace先从本地验收目录挑选并脱敏，若无现成录屏就展示原图/摘要，不称已经制作视频。

## 7. 失败预案与结束检查

|情况|行动与准确说法|
|---|---|
|模型不可达/配置缺失|停止现场模型请求，转受控工具或历史记录；标准最终生成也需要模型，不能宣称离线AI可用|
|网络慢|等待一次、说明总耗时含检索/生成；必要时停止UI并转历史，不承诺上游已取消/不计费|
|浏览器状态异常|换独立演示配置/页面；保留用户草稿，不清全局localStorage|
|PPT/OCR缺失|先核对数据路径；不能以Mock伪造课件。切回已保存来源预览并说明迁机数据尚未就绪|
|增强已回退|按Degraded Success解释，业务失败则如实Failure；不重试直到出现normal|
|时间不足|用上述90秒或30秒历史片段，省略完整业务链；明确历史日期/Mock标识|

结束仅在自己终端Ctrl+C停止自己启动的工具，保留新结果；检查未改生产配置/用户成果。P4T5需由另一成员彩排命令、端口、数据、预览和时间；本轮不声称已现场彩排。
