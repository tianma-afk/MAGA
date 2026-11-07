## 做了什么

<!-- 1-3 句话说明问题、方案和用户可见变化。 -->

## 范围

- [ ] 新功能
- [ ] 缺陷修复
- [ ] 文档/CI
- [ ] 重构（无行为变化）

## 验证

- [ ] `python -m pytest server/tests -q`
- [ ] `npm --prefix web test`
- [ ] `npm --prefix web run build`
- [ ] `node --test scripts/check-file-lengths.test.mjs`
- [ ] `node scripts/check-file-lengths.mjs`
- [ ] `npm --prefix web run test:e2e`
- [ ] 真实模型手动冒烟（如适用，注明模型/服务商）

## 红线检查

- [ ] 无 Key 时仍返回 503，没有伪造回答
- [ ] 模型输出经过结构校验，引用页码在允许范围内
- [ ] 章节消息/自测/进度按 `chapterId` 隔离
- [ ] 没有提交 `.env`、真实 Key、`data/`、`node_modules/`、`dist/`
- [ ] 没有文件超过 500 行
- [ ] 文档/交接说明已更新（如适用）

## 截图或演示路径

<!-- UI 改动的桌面/移动端截图，或复现步骤。 -->
