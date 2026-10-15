# AI VIP Share R5.1 · Source-first 正式工具闭环
日期：2026-10-15。Owner：ChatGPT GitHub 连接；仅允许 main，其他 Agent 独立文件正常继续。
当前阶段：COMPLETE_WITH_BLOCKERS。起始远端 main：`0f620b94aa9c8875bf4a50a8a8b34e06c23d2611`。GitHub 远端操作不代表本地 Mac Git 状态已被检查。

## 本轮文件级所有权
- 独立工具：`examples/sidebar-tools/ai-vip-share/src/index.html`、`src/style.css`、`src/main.js`、`tool.config.json`、`README.zh-CN.md`。
- 定向测试：`tests/environment/ai-vip-share-r5-ui.test.mjs`；必要时单独的 R5.1 Node 测试。
- CI 受影响工具版本/测试：`.github/workflows/sidebar-tools-r1.yml` 内 AI VIP 专用任务块，仅作最小字符串变更。
- 本记录：`docs/framework/workstreams/ai-vip-share-r51-source-first-20261015.md`。
- 若需修复可信代理启停卡，仅在重新读取且无文件写入冲突后修改 `src/ai-smart-access/host-controls.js`，不改 Worker/Proxy/SDK/AdBlock。

## 可复用证据与边界
R5 基线工具 1.1.0、5 项定向 Node PASS（旧候选），宿主可信单按钮存在；历史 19 项红灯先于 R5。2026-10-15 读取正式 `AGENTS.md`、R5 工作流、正式源码、Browser SDK Registry 和 CI。
- Browser SDK `browser.tabs.create` / `browser.network.request` 已实现，但本工具当前仍是 v1 / `ai.access`，不能跳过 v2 安装审阅与所需授权。
- `src/sidebar-tools/sandbox.html` 的 CSP `connect-src 'none'`，沙箱内不能直接 `fetch` Provider。
- 商业账号、SKU、兑换、短效 ticket、可信商城 HTTPS URL 未见已批准生产配置；技术性 `aiAccess.activate` 不能充当会员消费。
- 受信代理 Host 的 `src/ai-smart-access/` 需保留，公共 Managed Proxy SDK 尚无已批准完整合同。
- 本对话没有 Mac / 真实 Chrome / watcher / 原生 Profile 访问；不会声称 Native 或下载安装成功，不生成用户下载工具包。

## 验证与交接
仅执行本轮受影响定向 Node / 工具包合同 / 安全静态检查；GitHub Actions 同候选证据优先。完整 Browser build 若仍被独立 AdBlock 可信摘要阻塞，原样记录，不绕过。写入后登记新文件 SHA、准确运行/阻塞证据、最终 commit 与并行漂移。

## 本轮实际交付与证据（同候选 b898d9b，2026-10-15）
- 主源码提交：[`b898d9b6292d0ef4ee4e26567587ef7fcf195a41`](https://github.com/shopable-ai/opendesk-browser/commit/b898d9b6292d0ef4ee4e26567587ef7fcf195a41)；正常 fast-forward 推送 `main`，未强推。工具 `1.1.0 → 1.1.1`。
- 实际改动：`examples/sidebar-tools/ai-vip-share/src/{index.html,style.css,main.js}`、`tool.config.json`、`README.zh-CN.md`；既有可信代理 UI `src/ai-smart-access/host-controls.js`；`tests/environment/{ai-vip-share-r5-ui,ai-vip-share-r51-member}.test.mjs` 与 `.github/workflows/sidebar-tools-r1.yml` 专项内容。9 个源码/测试/CI 文件；R5.1 本记录单独提交。
- 已实现：单主卡会员身份/有效性/权益列表/最近兑换记录；时间类使用服务端 `serverNow/expiresAt` 算剩余天数、非时间类展示实际额度或功能；错误/未登录/未配置不同状态；兑换码预检、与账号绑定的预览及确认、幂等键与回执约束、未知结果不重试；商品外链只能走 SDK 批准的 HTTPS 新标签页。
- 已实现：可信单按钮在 ENABLE 等待中提供 STOP；新 STOP 发起后，过时 ENABLE 回执不覆盖新的 UI 状态。后台 Web Lock、持久 STOP/所有权、原 Worker 和既有 Host 执行合同均未修改，不声称经过真实 Chrome 恢复/竞争验收。
- 生产配置：`BUSINESS_ENDPOINTS` 和 `PRODUCT_CATALOG_URL` 都为空，`ai.access` 保持 v1 原声明；**没有新加 `network` / `browser.tabs` 权限**。SDK Browser 网络/开标签页属于以后审核后的复用路径，不是当前生产 Provider。短效 ticket/install-resume 未部署，`SDK_BLOCKED / PROVIDER_BLOCKED`。
- 用户当前可看到 `1.1.1` 完整结构和所有诚实未配置态；单按钮的可信请求入口有真实接线，但代理真实启用依赖尚未配置的技术 Provider 和 Chrome 权限，不能声称网络已连通。会员消费与激活不可执行，不会伪造成功。

## 同候选 CI 实测
- GitHub Actions：[`38716165281`](https://github.com/shopable-ai/opendesk-browser/actions/runs/38716165281)，HEAD `b898d9b6292d0ef4ee4e26567587ef7fcf195a41`。
- AI VIP 专属任务：`R5.1 installed member UI, verified business state and trusted STOP`：**13 tests / 13 PASS / 0 FAIL**（旧 5 + 可信 STOP 1 + 本轮新增 7）。`Package exact v1.1.1 AI VIP Share official tool` PASS；`npm run check` PASS。
- **Browser production build 失败（BLOCKED）**：`[opendesk-fixed-sidebar-tool-host] Trusted AdBlock source changed; review and re-pin before fixed build: examples/sidebar-tools/adblock/trusted/host-controls.js`。未改 AdBlock 安全摘要/关闭校验。后续 `build:dev`、`verify` 和 Browser 同候选安装验证未执行，不能标记 BUILD_PASS。
- 同一 run 的综合任务 `sidebar-tool-contract-and-package`：**255 tests / 236 PASS / 19 FAIL**；18 个旧 R2.1 生命周期/Web Lock 场景失败、1 个 Cookie Editor 官方目录与源文本不一致（属于其他工具现状，不由 R5.1 本轮代码更改直接引起）。完整综合任务失败，不与定向 13 PASS 混同。
- 真实 Mac Chrome/CFT 的 320/360/390px、暗色、键盘焦点、实际安装升级、真代理网络、所有权竞争、断线/重启/撤权：**NOT_TESTED**；不能作为视觉/Native/安全完整 95 分依据。

## 后续依赖与验收优先级
1. 商业 Provider Owner 需交付已审定的 HTTPS 登录身份、会员 SKU/额度/时间、兑换预检、幂等事务及账本、商品目录与服务端短效 ticket 回跳合同；无此合同不擅自启用 UI 兑换。
2. SDK Owner 审核 Managed Proxy 全部所有权/STOP/撤权/重启/旧身份保护后才能迁移宿主代理模块；现阶段旧模块必须保留，不能抢占其他工具的代理资源。
3. AdBlock 负责人负责自身可信源码指纹审查并修复固定构建阻塞；R5.1 不篡改审计摘要。恢复后仅补同候选 Browser 构建和真实 CFT/Mac Chrome 安装、升级、状态/竞争与体验验收。

## 当前 Owner 状态
`COMPLETE_WITH_BLOCKERS`：独立源码变更、专项测试及 GitHub main 推送完成；释放本次源码文件与提交事务。**未占用** Mac watcher、`dist/development`、Chrome/CFT Profile 或 Native 连接。未发布、未收费、未配置代理服务。
