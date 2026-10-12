
# GOAL：OpenDesk Browser R4 Seller Payout Closed-Loop MVP 实施

日期 2026-10-13，默认中文。

**目标：直接在现有 OpenDesk Browser 代码中实现真正可使用的卖家结算异常核对业务工作流**：Chrome Side Panel「工具」用户点击 → 打开受信扩展完整工作页 → 手动上传合法 Shopify Payments CSV → 字段确认 → 解释异常 → 实际导出 .csv 差异清单和 .json 证据 → 本地清除。不是另画一套 HTML，不能用下一份提示词代替源码修改和真实验证。

仓库 https://github.com/shopable-ai/opendesk-browser
本地 /Users/shopme/Documents/workspace/opendesk-browser
唯一允许写入 main。遵守 AGENTS.md：先检查 git status、最新 HEAD、并行 Agent / WXT/Chrome 资源，禁止新分支/Worktree/PR、强推、reset/clean、覆盖别人的未提交修改；有写入冲突只读说明，不擅自修改。安全且授权满足才提交推送 main。

## 先读完整权威计划及真实源码

- docs/product/browser-extension-ecosystem/commercial-mvp-workflow-r4-20261013.zh-CN.md（唯一完整业务和技术任务树）
- docs/product/browser-extension-ecosystem/high-value-user-opportunities-r3-20261012.zh-CN.md
- docs/product/browser-extension-ecosystem/opportunity-register.json、commercial-experiments.json、product-priorities.zh-CN.md
- docs/api/sidebar-tool-development.zh-CN.md、sidebar-tools.zh-CN.md
- src/ui/tool.html、src/ui/tool-shell.js、src/ui/sidebar-tools.js、src/ui/sidebar-tools/package.js、src/sidebar-tools/bridge.js
- src/ui/design-tokens.css、docs/architecture/ui-layout-conventions-r27.zh-CN.md
- wxt.config.mjs、scripts/build-contract.mjs、manifest.json、docs/framework/testing-guide.md

## P0 源码实际任务

1. 不改 84 OPP、8 EXP、R8 188 能力和 E01–E40。EXP-005 原本是 Listing QA，不能偷换成 Seller Payout 已经立项/成交。Page QA Inspector 继续 DEPRECATED。
2. 冻结合法数据边界：用户自己的 Shopify Payments 官方 CSV（或者取得明确委托），不读取 Cookie/站点内部数据/第三方账号，不新增 host permissions、网站脚本、OAuth 或云后端。
3. 先查是否已有 CSV/货币工具，能复用就复用。分离纯函数 import-csv、money、Shopify source profile、reconcile、evidence/export；金额精确十进制或本币最小单位。遇到缺列、不同币种、跨期/退款、重复候选、状态不确定必须解释或明确 UNKNOWN。未取得银行流水不能说银行已到账。
4. 真正 CSV 处理/下载在受信任扩展 full-tab 工作页，侧边栏只做启动。**普通 Sidebar 工具只有约 32KB storage、150KB 文本 file.download 和 .md/.txt/.json，不支持大型 .csv 导出**，不可简单冒用或扩大所有工具权限。
5. WXT 固定输出需要同步审查 PACKAGE_ENTRIES、FIXED_OUTPUTS、Manifest、CSP、包体与校验器；按需打开 business workbench，不把解析/界面全部放到 SW。UI 必须基于既有 tool.html/design-tokens，不新建第二套 SDK、Task Runner、Authority、Marketplace 或全套 Sidebar。
6. UI 四步：① 上传及校验 CSV、② 确认日期/状态/币种/列映射、③ 筛选差异并点击原行证据、④ 真实 .csv + .json 导出与清除。实际失败/未知清楚显示，不自动抓取或上传敏感明细。
7. 合成固定 fixtures：正常、多笔同订单、退款负值、跨期 pending、不同币种、缺列、BOM/引号/换行、公式注入、极大文件、同额不同交易和文件重叠。对齐预计金额零偏差、不得静默丢数据，记录性能真实结果。
8. 运行定向 node --test、npm run check/build/build:dev/verify，比较 bundle 增量；在真实 Chrome 同一包上从原有「工具」启动，导入/映射/解释/导出真实 .csv/.json 文件落盘并删除，保留 SHA、输入/包身份、原生测试证据。并行 Agent 占用测试资源时不争抢、不重跑无关全量测试。
9. 保存真实修改文件、SHA、测试结果、未测场景与剩余困难到既有 workstream。没有客户访谈、实付订单、自然留存就标 NOT_TESTED/NOT_MEASURED，不能说商业已通过。

## 后续阶段不提前开发

P1：真实数据、Excel/Shopify/A2X 对照和自然复用成立后选择 SKU/成本利润、跨期/多店或合法的创作者佣金适配器。P2：确有购买者和付款、API 数据许可时再接入支付、OAuth、多账号/团队及 SaaS；独立 Chrome 产品需另过商店许可与隐私硬门。用户购买软件是为了可解释异常/节省人工核对，不是另一个通用流量仪表盘。

**完成定义：**已在 OpenDesk 现有插件真实完成“点击入口→导入官方 CSV→正确解释异常→导出真实差异 CSV/证据 JSON→删除”的闭环，完成独立的金额正确性、隐私/权限、资源预算、UI 可用性和 Chrome 原生验收。不可用静态原型、空 SDK、文档或付款假数据冒充完成。
