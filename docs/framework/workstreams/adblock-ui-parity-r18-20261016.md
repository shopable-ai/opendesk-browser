# AdBlock UI Parity R1.8（2026-10-16）

## 当前工作范围与互斥资源
- Branch: `main`，只在本轮专属文件与核对后的 AdBlock 固定 DOM、CSS、生成器/定向测试写入；不触及其他工具业务及原生 DNR service/rules。
- 读取起点 main `cff9eff4a37c4e5cdd763c5b04edb3d35d704d2a`；原件 blob `f10b6f6671480b3ea4828a04541e7bffa4e4d58a`。
- 不使用用户 Mac `/Users/shopme/Documents/workspace/opendesk-browser` 的项目或 Chrome Profile：当前连接仅 GitHub，不能声称 Mac 本地原生验收。
- 初始问题：原文件路径缺失（历史 Blob 仍在）、可信控制只有两个普通设置行，沙箱例外常驻，来源驱动预览不代表生产 UI。
- 原始证据：R1.6 `5ca0876` CI 76/0 Node 但 production build failed；独立预览 `3fd457c` 74/0 Node、6 离线 Chrome 场景，均不可晋升当前候选的 NATIVE_PASS。
- 分工：`REQUIREMENTS.zh-CN.md` 负责设计与数据映射；`adblock-ui-parity-r18-20261016.md` 仅记本工作流候选/证据；不改既有 R1.4 记录。
- 应由实际产物的同一候选核实：完整构建/版本/安装包 SHA-256、Chrome ID、真实权限/DNR/HTTP/生命周期、320–480px 同视口截图；缺失保持 NOT_TESTED。

## 分阶段验收
- Original file exact blob and SHA-256: SOURCE_VERIFIED (GitHub SHA-1 可证，Node SHA-256 测试待 CI).
- Current formal UI: gaps identified; UI rewrite pending in this snapshot.
- Functional Native Chrome: NOT_TESTED for R1.8.
- Product acceptance 95+: NOT_SCORED; never report PRODUCT_ACCEPTED without screenshots/native requests.

## R1.9.1 · 实际源码恢复记录（2026-10-16）

- **已提交的源码恢复（不是产品验收）**：`21065ca1f6f97a5080b3674ccc12d378de6d7aa9`，提交到 GitHub `main` 的 16 个文件；R1.9 所列 15 个 Git Blob 均成功读回。共享 `src/ui/sidebar-tools.js`、`src/ui/tool-shell.css` 使用最新对应源码定点合并，保留 Extension Center 的卸载恢复增量和其他工具样式。首次 Git ref 因并行提交冲突未更新，已在更新后的父提交上安全重建并正常 fast-forward 推送；无强推/重置。
- **可信界面**：Fixed Host 维护 overview / exceptions / settings；两枚原生受信任开关、实时 hostname、真实例外数、空态、可信恢复确认链、独立产品设置和通用工具管理入口。移除 AdBlock 宿主重复标题/同时出现的两枚设置齿轮；例外从设置返回时恢复原入口焦点；保持 opaque sandbox 挂载，概览不展示例外列表或伪造统计。
- **安全边界**：不修改 AdBlock DNR service、Chrome rule policy、权限声明、Stay Focus 规则域、重启围栏或卸载清理。受信任固定源码 Blob 为 `38a0990f06d4cedded1063d42eff22934c1c26e4`，同步更新 `scripts/bundle-provenance.mjs` 精确来源锁。
- **原始 HTML**：在上述提交上读回不可变原型 Git Blob `f10b6f6671480b3ea4828a04541e7bffa4e4d58a`；独立 SHA-256 计算为 `c0a030441720ee74e599e47d9e61d7725b5f947aa62da9324e5ac5b56356c8b7`，与 R1.8 匹配，原始 `preview/adblock-r1-interactive-preview.html` 未改。
- **隔离逻辑自检（不能充当 Node PASS）**：由提交版可信工厂在 V8 兼容 DOM shim 中执行 R1.9 的 13 项测试，13 项均完成；使用同一工厂与当前 `tool.html`、`tool-shell.css` 构成 7 状态×3 视图、21 份惰性快照，无演示统计。此检查没有执行官方 Node 运行器、npm 构建、截图或真实 Chrome。
- **同提交 CI**：[AdBlock R1.2 workflow](https://github.com/shopable-ai/opendesk-browser/actions/runs/38779603559)、[Sidebar Preview Contract](https://github.com/shopable-ai/opendesk-browser/actions/runs/38779603168)。本次记录时 `queued`；结果必须以后续同 SHA 原始 job/log 为准，不能预报成功。
- **版本与安装包门禁**：`tool.config.json` 由 `1.0.0` 增至 `1.1.0`；正式 `examples/sidebar-tools/adblock/adblock.opendesk-tool.json` 在恢复阶段尚不存在。未手造、未晋升历史 JSON Blob。只有 Node、标准打包器、完整安全来源和 CI 门禁成功后才能晋升，并更新本记录中的安装包 SHA-256。
- **证据状态（此提交）**：`SOURCE_VERIFIED`（源码/原型 Git 身份）；`NODE_PASS=NOT_TESTED`、`BUILD_PASS=NOT_TESTED`、`CI_PASS=PENDING`、`PREVIEW_BROWSER_PASS=NOT_TESTED`、`NATIVE_CHROME_PASS=NOT_TESTED`、`PRODUCT_ACCEPTED=NOT_SCORED`。目前 GitHub 网页连接不等同于访问 Mac 正在运行的 Chrome/Profile；不能报告实际 HTTP DNR 拦截、360px 同视口截图或 95+。
