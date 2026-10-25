# 章节助教

以一个章节 PPT 为一次持续学习对话的软件体系结构伴学工作台。
界面为可折叠章节目录、对话区，以及按需打开的原始课件/架构画布。

## 本地启动

需要 Python 3.11+、Node.js 22+。在项目根目录运行：

```powershell
python -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements.txt
npm --prefix web ci
.\.venv\Scripts\python -m uvicorn server.main:app --host 127.0.0.1 --port 8000
```

另一个终端启动前端：

```powershell
npm --prefix web run dev -- --port 5173
```

浏览器打开 `http://127.0.0.1:5173`。后端接口文档在
`http://127.0.0.1:8000/docs`。前端 `/api` 默认代理至 8000 端口。
若端口被占用，可更换前端端口；更换后端端口时同步修改
`web/vite.config.ts` 中的代理地址。

## 启用真实 AI

将根目录 `.env.example` 复制为 `.env`，填写：

```dotenv
LLM_API_KEY=your-provider-key
LLM_BASE_URL=https://your-provider.example/v1
LLM_MODEL=your-model-name
```

需要支持 `/chat/completions` 和 JSON object 输出的兼容服务。
重启后端后刷新浏览器。密钥仅在服务端读取，不会写入前端。
启用后会向所配置服务发送问题、部分对话历史和相关课件文字。
模型服务费由配置的账号承担。

未配置时可直接使用明确标注的**离线课件导读**：原稿阅读、按页继续、
关键词定位和自测提示。离线导读不是大模型问答，不会自动评价答案。
真实模型调用失败会报错，不会静默切换成伪 AI 回答。

## 课件

当前课件为 Chapter 1、2、4、5、6、7、8，共 340 页。系统读取
`book/*.pptx` 的标题、正文、表格和备注，按章节数字排序。
PDF 教材保留在 book 中，但当前未建立全书索引。

当前机器已生成 `data/slides/chapter-N/页码.png` 原稿图片。
这些生成文件被 Git 忽略；新电脑需要重新生成：

```powershell
pwsh -NoProfile -STA -File scripts/render-slides.ps1
```

渲染需要 Windows 桌面版 PowerPoint，运行前关闭已有 PowerPoint 窗口。
只重新渲染某章：

```powershell
pwsh -NoProfile -STA -File scripts/render-slides.ps1 -Chapter 5 -Overwrite
```

没有 PowerPoint 或未渲染时，前端显示明确标注的文本预览，并可下载
原始 PPT。原稿图片展示不等于模型已识别图中内容；当前模型上下文
主要来自可提取文本，图片型页面会提示信息不足。

## 使用

选择章节后可输入问题、继续学习或自测。打开课件可手动翻页，
点击回答中的引用可定位到来源页。请求图解时，支持的教学内容
可以生成节点/连线画布；图形为教学示意，不是原稿重绘或完整仿真。

每章的消息和当前页保存在当前浏览器本地；刷新后继续，章节之间隔离。
清空章节需要确认。浏览器清理站点数据会删除记录。

无需密钥的答辩演示路径：选择 Chapter 5，打开课件并选第 17 页，
输入“画个架构图”，即可同时展示真实心跳检测课件和可拖动的教学示意图。
离线图解目前只覆盖有文字依据的心跳监测场景；其他架构图需要模型生成。

## 模块与验证

| 目录 | 责任 |
| --- | --- |
| `server/` | 课件解析、教学策略、模型调用、API 与测试 |
| `web/src/` | 对话与状态、章节导航、课件、画布 |
| `scripts/` | 原稿渲染、500 行限制检查 |
| `docs/spec/` | 产品范围与体系结构说明 |
| `docs/plan/` | 实施与验收记录 |

```powershell
python -m pytest server/tests -q
npm --prefix web test
npm --prefix web run build
npm --prefix web run test:e2e
node --test scripts/check-file-lengths.test.mjs
node scripts/check-file-lengths.mjs
```

浏览器端验收脚本为 `tests/browser-smoke.mjs`，在前后端已启动且
未配置模型密钥时执行。需可用的 Playwright 与 Chromium；可通过
`PLAYWRIGHT_MODULE` 环境变量指定现有 Playwright 安装目录，然后运行
`node tests/browser-smoke.mjs`。截图写入 `data/verification/`。

手写代码文件限制为 500 行；依赖、生成资源和锁文件不参与该限制。
这是单用户本地项目，没有账号系统、云同步或正式成绩管理。
公网部署前需要补充认证、限流和隐私控制。
