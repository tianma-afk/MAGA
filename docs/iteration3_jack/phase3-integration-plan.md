# P3T4 集成与交接准备（未执行）

日期2026-11-17。人工B2未批准，不执行Merge/Cherry-pick，不改变生产默认。

## 现场提交图与文件边界

主分支执行前68d3f4f，B为4f878dc，共同祖先c6fc185。主线含f240ab7/68d3f4f，B在共同祖先另行提交，双方分叉，不能fast-forward。当前均干净；后续以当时现场为准。

B相对共同基点6文件：新增server/design_planner.py、server/tests/test_design_planner.py、docs/iteration3_jack/phase3-prototype-b.md；修改server/design_sources.py、server/design_source_contracts.py、server/tests/test_design.py。三个生产变更分别为策略绑定、内部诊断、专属规划；test_design.py仅将规划/生成Mock分流，原API断言保留。

主线自共同基点只改新增评估脚本/fixtures/文档，包括phase3-experiment-base.md；与上述B的变更路径交集为空。本轮新增审核/ADR/补验工具也不占B路径。静态预测无同路径内容冲突，但未做实际merge，不能保证未来HEAD/钩子/语义门禁无问题。

## 若人工选择Baseline

推荐路径：生产代码不合并任何候选；将ADR的选择、批准人、时间和接受的已知不足记录后改为Accepted；执行当前主线后端与前端门禁，确认默认仍为基点来源逻辑，保留所有worktree及忽略结果。文档提交不需要伪造“生产集成提交”。

## 若人工选择完整B

1. 复核分支/HEAD/status/暂存区、固定授权候选hash；有用户修改不stash/reset，停止相关写入并处理归属。
2. 保存两边diff与测试状态，确认公共评估工具、旧标注和历史记录不会被覆盖。建议显式非fast-forward merge保留实验历史，执行前再次核对B仍是已审版本。
3. 以下命令仅为B2批准后的示意，本轮未执行：

```powershell
git switch iteration/jack
git merge --no-ff --no-commit 4f878dcaa14a6d62a7f0506b866afe5fcd17f68d
git diff --cached --check
git diff --cached --stat
```

4. 对合并结果验证，再形成明确merge提交；不重写历史、不用全文件覆盖解决冲突，不顺带合入A/C。若解决冲突或优化改变来源行为，认定新实现版本，补跑受影响开发来源对照；不能套用原冻结结果。
5. 完整B无需新前端开关。保留三阶段API、配置前置503、空来源422、生成502、Top8/真实标题摘录/引用范围、输入和旧成果保护。限定启用或新配置开关需另获批准并限定验收，不自动增加。

## 若人工选择A、C或组合

同样按共同祖先检查差异、保持历史和门禁；A/C不是本轮推荐。组合需明确机制/预算、新版本和独立验证授权，不允许机械合并多个实验分支。

## 集成验收与留证（均为后续要求，未执行不写通过）

- 使用现成maga；独立子进程禁dotenv并清LLM变量，完整server/tests和评估脚本测试、策略故障/三阶段/API回归；全新basetemp。
- 前端npm.cmd --prefix web test与run build；Chrome关键实践E2E，运行前核对Vite服务身份，不停止用户服务。API替身E2E与真实后端联调分开。
- PPT/OCR签名、0–8唯一真实页、合法引用、原需求不变、B超时/非法规划/缺配置回退与取消；最终生成失败仍保留原语义。
- 原固定20条关键词集通过已有evaluate-retrieval.py在新结果目录对照；不把其结果当自然需求/教学质量。
- 若选B，安全复用现有配置核对模型，有限真实规划及最终生成联调需要计入明确的新调用预算。本轮6次规划不含最终生成，也不自动授权无限补测。
- node --test scripts/check-file-lengths.test.mjs、node scripts/check-file-lengths.mjs、git diff --check；与CI配置核对。无法运行的项列原因，本地通过不代表远端CI通过。
- 合并后记录实际hash、API/来源断言结果、模型Prompt/hash/usage/费用未知、前后端日志和人工验收，更新FEATURES_AND_INTERFACES/交接/Accepted ADR；无代码执行或密钥入Git。

## 本轮交接状态

仅完成证据审核、六例补验、敏感性分析、Proposed ADR及本计划。候选未修改；P3T3结果/冻结标注未改。补验/工具测试见phase3-decision-evidence-review.md；完整集成回归、真实生成与浏览器停止生命周期仍未执行。等待B2后再推进。

## 补验复核与将来重现

run-decision-supplement.py是本次首次写fixture并执行的一次性冻结脚本，拒覆盖已有fixture和结果；已提交fixture后不应直接再次运行它。离线敏感性可用review-decision-evidence.py指定新输出目录重算，不发模型请求。

若未来获得新的真实调用授权，使用已版本化fixture和原worker重现，而不是删除旧fixture绕过保护。示例为单方案，其他三个同参数换repo/variant/hash；每次指定新的输出路径，共用该次新账本且上限6。不得自动重复本轮已用完的6次：

```powershell
& 'D:/app_install/miniconda/envs/maga/python.exe' scripts/compare-design-worker.py --repo ../MAGA-exp-b --expected-head 4f878dcaa14a6d62a7f0506b866afe5fcd17f68d --variant b --fixture docs/fixtures/iteration3-decision-supplement.json --protocol docs/iteration3_jack/phase3-decision-supplement-protocol.md --output data/verification/<全新run>/b --split dev --repeats 1 --ledger data/verification/<全新run>/real-attempts.jsonl --budget 6
```

父输出目录先创建；上述路径以主仓库cwd执行，worker使用绝对导入目标worktree；B需该子进程允许dotenv（清除PYTHON_DOTENV_DISABLED或置0），不复制凭据。Baseline/A/C不需模型。耗时不保证逐值相同，Bfresh计划不保证再现。
