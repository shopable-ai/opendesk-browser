# OpenDesk AI Insight

**阶段：R5 数据合同与交互原型；尚未实现正式扩展业务代码。**

本扩展以真实问题（Problem）为中心，关联跨 AI 对话、尝试、执行时长、验证证据与成果，帮助用户减少重复工作并恢复任务。

- **唯一产品研究与 R5 续接合同：** [docs/product-research.zh-CN.md](docs/product-research.zh-CN.md)
- 本轮仅搬迁文档并建立项目发现入口，不代表数据合同、交互预览、Chrome 实测或生产代码已完成。
- 开始 R5 前先只读核对当前 main、已有模块、授权边界和并行修改，仅推进尚未完成的差量工作。

## R5 当前交付入口（2026-11-11）

- [统一数据合同与指标字典](docs/data-contract-r5.zh-CN.md) · [JSON Schema](contracts/insight-r5.schema.json) · [非私密 fixture](contracts/sample-envelope.json)
- [纯计算与关联模型](src/insight-core.js) · [20 项 Node 测试源码](tests/insight-contract.test.mjs)
- [PC / Side Panel / 网页轻提示交互预览](preview/index.html)：使用 `src/insight-core.js` 的同一演示状态，预览无网络、无真实采集。
- [R5 差量状态与后续验收操作](docs/r5-acceptance.zh-CN.md)

**真实验证等级**：GitHub 写入已完成；连接器 V8 独立断言 21 PASS；本机 Node/Codex、浏览器逐按钮验收、真实 AI 站点及正式权限/删除均未完成，不能声称 `NODE_PASS` / `CHROME_PASS`。正式安装包、正式工具配置和固定 Chrome 采集尚未创建，这属于 R5 刻意保持的开发边界。
