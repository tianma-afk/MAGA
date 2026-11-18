# P4T4 架构图实际渲染与复用

2026-11-18；源图为 [P4T2 §5–6四个Mermaid块](../../phase4-architecture-design-and-views.md)，审阅版本 `dd40c0597c3f3099e34c19eb2e39002ee45ca789`。未改源文档或架构语义，逐块原文导出为mmd。增强与回退本来就在同一张嵌套alt时序中，不虚构第五张独立源图。

## 实际结果

Mermaid **11.12.0** 本地浏览器bundle＋Playwright调用已安装 **Google Chrome 157.0.8103.79**，4/4实际渲染成功，生成SVG/PNG，逐图打开PNG核对。本轮只做图表检查，没有产品E2E或模型请求；Chrome版本与历史验收不同，不追改旧记录。

|图|预览与源文件|画布约像素|观察与展示建议|
|---|---|---|---|
|Module View|[SVG](./01-module-view.svg) / [PNG](./01-module-view.png) / [mmd](./01-module-view.mmd)|2670×866|文件名完整，静态箭头有少量交叉但可追；宽图不宜整张缩进主线PPT，放备用或按前/后端分区放大|
|C&C运行时|[SVG](./02-runtime-context.svg) / [PNG](./02-runtime-context.png) / [mmd](./02-runtime-context.mmd)|1212×258|适合主线；HTTP、Storage、本地文件连接可辨，外部模型没有被当成本项目源码模块|
|Baseline时序|[SVG](./03-baseline-sequence.svg) / [PNG](./03-baseline-sequence.png) / [mmd](./03-baseline-sequence.mmd)|1365×1138|字完整，合法非空/空来源分支可辨；总览后局部放大，不作为一页密集正文|
|增强＋回退时序|[SVG](./04-enhanced-fallback-sequence.svg) / [PNG](./04-enhanced-fallback-sequence.png) / [mmd](./04-enhanced-fallback-sequence.mmd)|1356×2018|Planner、ready/空池/失败回退、共同校验、原生成顺序清楚；长图应分段讲，非16:9一页直接缩放|

视觉检查：中文/英文标识未见截断；首次自动wrap把require和1024拆行，最终关闭sequence wrap并增大间距，避免标识被拆分。仅调整渲染配置，源mmd不变。Module框是代码分组，C&C只有浏览器、后端应用进程、外部模型及本地资源；threadpool/函数不是独立服务。序列自调用留在同一个FastAPI参与者上。

箭头/语义对照 [P4T2说明](../../phase4-architecture-design-and-views.md)、[来源分派](../../../../server/design_sources.py)、[Planner](../../../../server/design_planner.py)、[原生成](../../../../server/design.py)：默认不调用Planner；增强先规划和校验、取原query池再取意图池，已知规划失败回原池；空来源422、生成失败502仍可见。图是关键路径概览，仓储/来源违约不在图中逐项展开，不能据此当成可降级错误。

SVG含Mermaid内嵌样式/foreignObject，部分Office导入器对其支持不同；尚未在正式PPT中导入验收。优先用PNG保证版面，SVG保留缩放/后续转换选择。当前PNG仅静态架构预览，不是产品截图或新的运行证据。

## 复现

仓库已有 `web/node_modules/@playwright/test`，不修改package.json/lock或生产配置。Mermaid包只解压到被忽略的全新工具目录。npm包下载不涉及项目内容上传；渲染本身用本地bundle与本地字体，无远端图表服务。

从MAGA根目录执行（只在资源确需重新生成时，输出会更新本目录预览，先核对Git）：

```powershell
$renderTool = 'data/verification/p4t4-render-' + [guid]::NewGuid().ToString('N')
New-Item -ItemType Directory -Path $renderTool | Out-Null
npm.cmd pack mermaid@11.12.0 --pack-destination $renderTool --silent
tar -xf (Join-Path $renderTool 'mermaid-11.12.0.tgz') -C $renderTool
node docs/iteration3_jack/assets/p4t4/render.mjs (Join-Path $renderTool 'package/dist/mermaid.min.js')
```

实际本轮目录为 `data/verification/p4t4-docs-20261118-v1/`，运行命令为上述node命令、bundle参数指向该目录；初次渲染元数据 `render.json` 为忽略的本地产物。最终使用[随附渲染脚本](./render.mjs)复验。需要Node现有依赖、Chrome和中文字体；不同浏览器/字体可能改变像素，语义与源hash优先。

原mmd UTF-8 SHA256（保留源块换行；后续转换LF/CRLF会影响字节hash）：

```text
01 8c3e6b2c174300358fce6ed867f6a0e2aefcf965cb89271d62b4a5d5dcc1f922
02 c1b36a83d617f5a29ad6988de77258fe14684551dbc6e482bf17b6aa1465f3a4
03 d56171fc8047fb4686d97602e63ea8787fbfa5b1e11509332f9d89a54c0de30d
04 6a48547bb007628f15667ee30c21a61748868038a637630c38472f4167b57f30
```

P4T5只需核对附件可用及最终PPT导入（若另行制作），不因图形渲染通过而宣称新业务验收。主线使用见[逐页规划](../../phase4-presentation-outline.md)。
