# AI VIP Share R5 · 正式工具 UI 接线与 Provider 缺席时的诚实降级 · 2026-10-15

## Owner / 并行约束
- Owner：ChatGPT GitHub 连接；唯一写入 `main`，不强推、不创建分支/worktree/PR。源码及契约的写入路径精确列于下节，变更以最新远端 HEAD 和 fast-forward 条件提交；不能覆盖其他 Agent 的写入。
- 未占用本机 watcher、`dist/development`、Chrome/CFT Profile、Native 配对、端口或生产基础设施。本网页对话没有 Mac 本地访问能力。
- 本轮不更新公共 SDK、Chrome 代理 Worker、Owner/STOP 安全状态机、权限清单或安装器。

## R5 写入范围
1. 独立工具：`examples/sidebar-tools/ai-vip-share/src/{index.html,style.css,main.js}`、`tool.config.json`、`README.zh-CN.md`。
2. 现有宿主的最小接线：`src/ui/sidebar-tools.js`、`src/ui/tool-shell.css`、`src/ai-smart-access/host-controls.js`；只有宿主可信静态 JS 操作 `aiAccess.enable/disable`，动态工具始终在 opaque-origin iframe。
3. 验证：新增 `tests/environment/ai-vip-share-r5-ui.test.mjs` 并加入 `.github/workflows/sidebar-tools-r1.yml`；本工作流文档。

## 实际设计与阻塞
- R4.2 原型保留；旧生产工具仅显示提示，且宿主代码主动隐藏其 iframe。现在正式可安装包展示会员主卡、兑换激活与商品入口；代理状态与按钮显示在隔离 UI 下方的唯一可信宿主卡片，无切换方式弹窗或重复开关。
- 正式 CSS 以 `/* @opendesk-shared-design */` 引入现有 Design System，不创建第二套 CSS Token，视觉皮肤由已审核公共组件处理。
- 真实商业 Provider 尚未部署：账号、权益、SKU、额度/到期日、兑换回执、目录价格/库存和短效 ticket 恢复均不可验证，生产页按未配置展示，禁用兑换与购买，没有假会员、假付款或假成功。旧 `aiAccess.activate` 是代理租约过渡流程，不能冒充会员 SKU 兑换。
- 「查看更多商品」设计为新浏览器标签页，**不是商品弹窗**。固定 `PRODUCT_CATALOG_URL` 为空。未来审核 HTTPS 商城域名与商品合同后，v2 工具单独审阅 `browser.tabs` 能力，通过既有 Browser SDK `browser.tabs.create` 发起受控打开；任何 HTTP 生产商城、长凭据 URL、沙箱 `window.open` 都不开放。
- Managed Proxy 公共 Browser SDK 未获批准，`aiAccess.*` 专用模块暂保留以维护可信状态/原归属与 STOP 保障；不能把技术过渡协议称为公有 SDK。此范围 `SDK_BLOCKED`。
- 真实 Mac Chrome/CFT 安装、升级、撤权、冲突、Worker 重启、停止失败、晚到回执、320/360/390px、暗色、焦点、外链以及正式会员 Provider：`NOT_TESTED / BLOCKED`，无同候选证据不得评分 95+。

## 核验与证据复用
- R4.2 旧离线原型：33 Node、30 Chromium；并非 R5 生产候选 PASS。
- R2.1 旧生命周期 Node 与 PAC fixture：历史有效性限定于各自候选，不提升为新 Native。
- R5 新定向：`node --test tests/environment/ai-vip-share-r5-ui.test.mjs`，CI 随 main 执行原定向及 `npm run check`/build/verify。真实结果以 CI workflow run/原生日志判定。
