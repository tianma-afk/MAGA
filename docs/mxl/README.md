# MXL 工作文档导航

> MAGA / 软件体系结构章节助教，工作分支：`feature/mxl-hybrid-retrieval`。
> 本组文档依据 **2026-11-24 的代码快照 `dfdfd3c3`** 编写；后续变更应更新对应专题，而不是继续向单一大文件堆叠信息。

## 从这里开始

| 文件 | 主题 | 面向的问题 |
| --- | --- | --- |
| [repository-status.md](repository-status.md) | 当前仓库状况 | 当前功能、分支关系、技术栈、运行边界是什么？ |
| [work-summary.md](work-summary.md) | MXL 已完成工作与历史 | 本轮具体改过什么、为什么改、改在哪些文件？ |
| [retrieval-implementation.md](retrieval-implementation.md) | RAG 混合检索实现 | PPT 如何建索引、Jina/BM25 如何组合、哪里真正用了 RAG？ |
| [practice-teaching-design.md](practice-teaching-design.md) | 架构实践教学理念 | 为什么改教学方式，如何考察学习者的分析与决策能力？ |
| [practice-architecture.md](practice-architecture.md) | 实践流程的技术设计 | 固定工作流、LLM Query、阶段检索、API、状态和引用如何协作？ |
| [validation-and-risks.md](validation-and-risks.md) | 验证、证据与限制 | 哪些通过了自动化测试，哪些还未被实证？ |
| [handoff.md](handoff.md) | 下一轮交接 | 如何复现、优先检查什么、可从哪里继续开发？ |

## 已存在的原始设计/过程记录

- [retrieval-design-and-worklog.md](retrieval-design-and-worklog.md)：BatMem 参考、检索方案起点、实现顺序、索引自动准备的工作记录（**历史时间线**）。
- [architecture-practice-v2.md](architecture-practice-v2.md)：先文档后代码的架构实践 v2 设计契约、落地说明、开始按钮修复记录（**历史设计记录**）。

两份原始文档应保留：它们证明设计决策先于实现；与它们不同，上方新文档以当前代码为准，供新成员快速理解现状。若旧记录写着“计划”或“当时尚未实现”，请以当前现状和验证文档判断是否已落地。

## 文档维护约定

1. 新增或修改检索策略：先更新 [retrieval-implementation.md](retrieval-implementation.md)，同步对应设计日志，再写代码。
2. 调整教学流程或评分原则：先更新 [practice-teaching-design.md](practice-teaching-design.md)；改变 API/状态另更新 [practice-architecture.md](practice-architecture.md)。
3. 每个合并/交接节点：更新 [repository-status.md](repository-status.md)、[validation-and-risks.md](validation-and-risks.md)、[handoff.md](handoff.md)，注明真实测试来源。
4. 不将模型生成的建议、尚未运行的测试、外部服务可用性写成“已验证”。
5. 避免把课程 PPT 引用、学习者答复和 LLM 自行推理混成同一种证据。

项目通用安装与使用方式见仓库根目录 [README.md](../../README.md)；第三轮架构实验的决策依据见 [docs/iteration3_jack/](../iteration3_jack/)。
