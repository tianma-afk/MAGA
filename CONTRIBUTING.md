# 贡献指南

## 环境准备

- Python 3.11+
- Node.js 22 LTS（不要用 Node 26：其内置 `localStorage` 会与 jsdom 测试冲突）
- Windows 桌面版 PowerPoint 仅在重新渲染课件图片时需要
- Git

```powershell
python -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements.txt
npm --prefix web ci
Copy-Item .env.example .env
```

在 `.env` 中填写自己的模型配置。没有 Key 时仍可开发课件、大纲、导航和未配置状态，但 AI 问答/自测返回 503。

课件图片是本地产物，`data/` 已被 Git 忽略。需要时关闭 PowerPoint 后运行：

```powershell
powershell.exe -NoProfile -STA -ExecutionPolicy Bypass -File scripts/render-slides.ps1
```

## 本地验证

提交前必须运行：

```powershell
.\.venv\Scripts\python -m pytest server/tests -q
npm --prefix web test
npm --prefix web run build
node --test scripts/check-file-lengths.test.mjs
node scripts/check-file-lengths.mjs
npm --prefix web run test:e2e
```

真实模型冒烟需要自己的 `.env`，不要把 Key 写进命令、日志或截图。当前没有自动化的检索评测脚本；如后续需要，可先离线测 `relevant_slides` 的命中情况。

## 代码规则

1. 单个手写文件 ≤ 500 行（`.py`、`.ts`、`.tsx`、`.js`、`.mjs`、`.css`、`.ps1`）。
2. 不新增离线/伪造 AI 回答；未配置时服务端返回 `503 AI_NOT_CONFIGURED`。
3. 模型输出必须经过 Pydantic/TypeScript 双重校验；引用页码必须来自本次提供的课件来源。
4. 会话、自测、阅读进度必须以 `chapterId` 为命名空间隔离。
5. 课件、笔记、大纲均视为不可信资料，不得当作系统指令执行。
6. 不引入向量数据库、多 Agent、流式框架等大依赖，除非明确需要并评估过风险。
7. 生成数据、依赖锁文件不参与 500 行限制；手写代码参与。

## Git 工作流

- 本轮只有一名开发者修改代码，不强制多分支协作或多级 review。
- 建议仍在 `feat/<short-name>` 等分支开发，提交信息使用 `feat:`、`fix:`、`docs:`、`test:`、`chore:` 前缀，便于回看。
- 推送 GitHub 前先确认；不要提交 `.env`、真实 Key、`data/`、`node_modules/`、`dist/`、测试截图。

## 提交前自检

- [ ] 功能范围与提交说明一致，没有顺手重构无关代码。
- [ ] 新增/修改行为有测试覆盖。
- [ ] 无 Key 503、非法输出 502、引用越界被拒绝。
- [ ] 切换章节不串消息/不串自测记录。
- [ ] 500 行检查通过。
- [ ] 文档和交接说明已更新。
- [ ] 没有提交密钥或本地生成资产。

## 新增功能建议路径

- 后端：在 `server/models.py` 定义严格模型；在独立模块实现业务；在 `server/main.py` 装配路由；在 `server/tests/` 加测试。
- 前端：先在 `web/src/types.ts` 和 `web/src/api.ts` 定义契约；状态逻辑放独立模块；组件保持小而可测；样式跟随 `styles.css` 变量。
- AI 调用：当前 `server/llm.py` 和 `server/quiz.py` 各自处理上游错误映射；如果出现第三种 AI 功能，再考虑抽取共享 helper。
- 存储：使用独立 key 版本（如 `chapter-tutor:quiz:v1:<chapterId>`），严格校验后再使用。

## 交接状态记录

复制 `docs/HANDOVER_TEMPLATE.md` 到 `docs/handover/`，只记录：

- 当前 commit / 分支 / 日期
- 已完成内容
- 已设计但未完成的内容，以及对应文件和接口
- 验证结果、已知限制
- 可复用的接口或思路（不分配后续任务）
