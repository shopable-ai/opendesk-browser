# OpenDesk AI Insight

**当前阶段：R5.5 指标体系与三端可点击模拟预览；尚未实现正式站点采集、持久化或生产业务代码。**

本扩展以真实问题（Problem）为中心，关联跨 AI 对话、尝试、执行时长、验证证据与成果，帮助用户减少重复工作并恢复任务。

- **唯一产品研究与 R5 续接合同：** [docs/product-research.zh-CN.md](docs/product-research.zh-CN.md)
- R4 产品研究、R5 Schema/计算核心已经存在；R5.5 只深化功能/指标/交互，不重写既有合同。文档和预览源码完成不代表本机/Chrome 或真实 AI 站点通过。
- 在本机执行测试或正式开发前先核对当前 main 和未提交/并行 Agent 修改，不覆盖独立工作。

## R5 当前交付入口（2026-11-11）

- [统一数据合同与指标字典](docs/data-contract-r5.zh-CN.md) · [JSON Schema](contracts/insight-r5.schema.json) · [非私密 fixture](contracts/sample-envelope.json)
- [纯计算与关联模型](src/insight-core.js) · [24 项 Node 测试源码](tests/insight-contract.test.mjs)
- [PC / Side Panel / 网页轻提示交互预览](preview/index.html)：使用 `src/insight-core.js` 的同一演示状态，预览无网络、无真实采集。
- [R5 差量状态与后续验收操作](docs/r5-acceptance.zh-CN.md)

**真实验证等级**：GitHub 写入已完成；连接器 V8 独立断言 21 PASS；本机 Node/Codex、浏览器逐按钮验收、真实 AI 站点及正式权限/删除均未完成，不能声称 `NODE_PASS` / `CHROME_PASS`。正式安装包、正式工具配置和固定 Chrome 采集尚未创建，这属于 R5 刻意保持的开发边界。

## R5.5 差量设计与预览入口（2026-11-12）

- [指标与三端交互详细设计](docs/metrics-and-experience-r55.zh-CN.md)：以 Bug 从 ChatGPT A → Claude B → ChatGPT C 的完整 Problem 为线索；9 个 P0 高价值功能、26 项带计算/隐私/误用/验收字段的指标（12 P0 / 9 P1 / 5 P2）、14 个跨端操作场景及平台能力的 UNKNOWN/NOT_TESTED 矩阵。
- [原有唯一可点击预览（已增量完善）](preview/index.html)：三端共用 [R5 Core](src/insight-core.js) 的脱敏内存状态；网页轻提示（展开/关闭/隐藏、模拟会话切换、关联候选审阅、观察授权控制）、Side Panel 当前/全部问题和折叠详情、PC 的 Problem→Conversation/Execution→Evidence 链路。独立 Attempt 演示数据与真实网站避让仍未实现；不能把会话数冒充 Attempt。
- [新增定向交互测试源码（6 项）](tests/insight-preview-r55.test.mjs)：使用 Node VM 的轻量 DOM shim 检查控制器状态，**尚无本机 Node 退出码，不能报 PASS**；原 [24 项合同测试](tests/insight-contract.test.mjs) 未改。
- **部署状态**：远端 GitHub `main` 可读回源码；本机 CodexPro、真实 Chromium 可点击/键盘/窄屏、实站授权和生产采集均未通过验收。预览使用零真实 AI 请求、零远程数据、零本地持久化。网页“暂停观察”当前是利用 R5 的**模拟撤权**演示事件阻断，不代表已实现正式独立的暂停/恢复权限合同。

### 如何本机验证这一次的差量

1. 在本机已有 `main` 工作树中先执行 `git status --short` 和 `git rev-parse HEAD`，核对其他 Agent 改动；不得使用重置覆盖。
2. `node --test projects/ai-insight/tests/insight-preview-r55.test.mjs projects/ai-insight/tests/insight-contract.test.mjs`，记录 Node 版本、exit code、实际 SHA。失败只修复 R5.5 新增的控制器与测试，不重跑无关的全仓流程。
3. `python3 -m http.server 8765 --bind 127.0.0.1`，访问 `http://127.0.0.1:8765/projects/ai-insight/preview/index.html`，在模拟站点切 Claude B → 确认关联：PC 显示 2→3 对话、65/40 分钟；撤销后 3→2、40/40。再测隐藏/重显、站点模拟撤权/重新许可、侧栏全部/当前问题、PC 拆分和模拟测试证据、无数据/部分/错误/隐私场景。
4. 分别在 1280px、360px、深浅主题与键盘 Tab/Enter/Escape 下观察站点模拟输入区是否被覆盖，保留截图与 DOM 结果；**正式 ChatGPT/Claude 等网站必须另行授权与真实观察，不由本预览推断兼容。**

