# P3T3 复现实验

## 冻结资产与目录

主协调工作区为MAGA，执行前HEAD f240ab7；候选版本见协议。独立基线为同级MAGA-exp-baseline，detached c6fc185，不是主仓库后续版本。各候选仍在MAGA-exp-a/b/c；没有合并或修改候选。

原始运行：`data/verification/p3t3-comparison-20261116-v1/`；`freeze.json`含协议/标注/工具hash、确切命令、版本、语料89项hash与执行顺序。每批`manifest.json`含Python、平台、实际包版本、冷加载、源码hash、模型请求名及时间；`rows.jsonl`逐query保存完整原需求、排序来源/摘录、诊断、评分与计时；`real-attempts.jsonl`是真实网络尝试账本，失败也占预算。数据被忽略，不随Git提交。

冻结SHA256：

|资产|SHA256|
|---|---|
|phase3-evaluation-protocol.md|5cd8cf9188a1ef9f78716a8c4f9b41d067e9505ab33dbecbeab197338d25db5d|
|iteration3-design-needs-v4.json|7a080b49f5e08a5449349c649f84395fcd02054009fb49ea8f2296f38e142da1|
|compare-design-worker.py|3f9c41a810bbc1ac21534ccd3b5fc55463ff035208966bfd1e85dc1d60a756f1|
|run-design-comparison.py|e704ebc2773fc18fb702a6d6d29f464fcb50f6278ef5e99158ac8a80496454fc|

文件按本次实际字节hash；Windows换行转换可能改变字节，需区分与内容变更，不能直接声称同hash。

## 真实执行命令

使用现成`D:/app_install/miniconda/envs/maga/python.exe`；不更新依赖。不在shell命令、报告或日志写凭据。

```powershell
$env:PYTHONIOENCODING='utf-8'
& 'D:/app_install/miniconda/envs/maga/python.exe' scripts/run-design-comparison.py --output data/verification/p3t3-comparison-20261116-v1
```

输出必须全新，重跑请换目录名；不要覆盖本次结果。协调器在每个子进程加载目标worktree的server，评估脚本从主协调目录统一加载，未复制补丁到候选。基线OCR从主目录复制至新目录，运行前所有语料hash一致。主进程串行，不同时测试/跑其他候选。

B子进程显式load_dotenv主目录已有.env（override=False），优先已有环境变量；其余子进程清模型变量。未调用最终生成。B额外真实费用可能产生，重跑前仍需确保本轮预算；同一个输出账本累计上限30，不通过新目录规避用户预算。主批预计17次：预检1+开发12+保留4。无需新服务配置，现有配置缺失时B只能回退，必须将真实语义验证标incomplete。

## 离线汇总与验证

```powershell
& 'D:/app_install/miniconda/envs/maga/python.exe' scripts/analyze-design-comparison.py --run data/verification/p3t3-comparison-20261116-v1 --output data/verification/p3t3-analysis-20261116-v1
$env:PYTHON_DOTENV_DISABLED='1'
Remove-Item Env:LLM_API_KEY,Env:LLM_MODEL,Env:LLM_BASE_URL -ErrorAction SilentlyContinue
& 'D:/app_install/miniconda/envs/maga/python.exe' -m pytest scripts/test_design_comparison.py scripts/test_evaluate_design_needs.py scripts/test_run_design_experiment.py -q
node --test scripts/check-file-lengths.test.mjs
node scripts/check-file-lengths.mjs
git diff --check
```

汇总输出`comparison.json`（六对绝对差值及查询ID）、`per-query.csv`、`unjudged-audit.md`。它只读已冻结标签，不做事后自动重标。工具测试的pytest临时目录若受限，改用全新data/verification目录作为--basetemp，不指向已有结果。

原始四版本回归测试在对应目录执行；先禁dotenv并清模型变量，使用独立新basetemp。不会发真实规划请求；B测试使用Mock。完整实际测试结果见结果报告及data/verification日志。

本轮独立Mock故障实测命令（真实调用0）：

```powershell
& 'D:/app_install/miniconda/envs/maga/python.exe' scripts/probe-design-fallback.py --repo ../MAGA-exp-b --output data/verification/p3t3-faults-20261116-v1
```

该工具显式注入MockTransport及假配置，不加载.env，不改变候选deadline；含一次15秒挂起。首次基线pytest因新worktree缺临时父目录发生setup错误，后创建data/verification并以新GUID重跑197通过；失败原日志与baseline-pytest-retry.log分别保留在p3t3-regression-20261116-v1。不要把已有结果目录当basetemp。

## 可复现范围

Baseline/A/C同语料来源顺序可离线复现；本次逐查询重复检查完整字典。墙钟耗时受机器负载、磁盘/OCR读取、缓存影响，不能保证逐值相同。B模型别名、服务版本及单次采样不保证重现；temperature0不等于确定性。保存的计划是线上证据，不将离线重放称为新的真实模型结果。本轮没有增加重放产品能力。

不完整标注下的下界和覆盖只在v4定义内成立。复核新增来源必须另出标签版本并对全部候选同口径重算，不能改写本次冻结结果或据此调候选后继续使用原保留集宣称独立验证。
