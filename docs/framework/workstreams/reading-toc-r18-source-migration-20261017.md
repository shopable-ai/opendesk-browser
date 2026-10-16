# Reading TOC R1.8 · 正式源码迁移与验收门槛

日期：2026-10-17　仓库：shopable-ai/opendesk-browser　分支：main

## 产品事实和已保留的边界

- approved UI：`examples/sidebar-tools/reading-toc/preview/reading-toc-r17-ai-desktop-preview.html`，历史提交 `404ccc681f3c061218701258c8705d3d724fa3a7`。
- 正式源码：`examples/sidebar-tools/reading-toc/src/{index.html,style.css,main.js}`；第四个 AI 图标加入顶部单行，原始免费章节 UI 样式、来源自动跟随、刷新、滚动高亮、`toc.snapshot` 和 `toc.navigate` 仍由原代码管理。
- 会员身份、可用额度、AI 服务、支付入口尚未在此工具的受信合同中证实。因此默认显示服务未开放，AI 目录保持 0，会员与支付入口不可操作，广告默认**合作招募**。不可复制离线演示的 mockAIResult 或定时成功。
- `locales.json` 是双语唯一来源；受信副本 `src/reading-toc/locales.generated.js` 必须与 blob 摘要一致。
- 固定网页浮动目录仍只有三个免费模式；不更改 SDK、CSP、权限、安装器、reading-kit revision 6。

## 验收和发布清单

1. `npm ci --ignore-scripts`；`node scripts/generate-reading-toc-locales.mjs --write`；`npm run check`。
2. `npm run build:sidebar-tool -- examples/sidebar-tools/reading-toc` 生成 **1.0.8 候选**，`node --test tests/environment/reading-toc-*.test.mjs`，`npm run build && npm run build:dev && npm run verify`。
3. 使用 `scripts/preview/build-preview.mjs` 从当前候选生成和实查同源 HTML；对比已批准 R1.7.4 UI，验证 320/360/420/520px、中英、缩放、键盘与视觉。
4. 隔离 Chrome Profile 中，从正式 OpenDesk Browser **安装旧版再主动升级**，验收真实 DOM、三免费模式、撤权/重启/SPA/多来源、安装版本身份与用户数据、失败回滚。
5. 仅上述验证通过，调用 `node scripts/build-sidebar-tool.mjs examples/sidebar-tools/reading-toc --promote-from artifacts/sidebar-tools/reading-toc/1.0.8/reading-toc.opendesk-tool.json`。核对唯一正式包、SHA-256、Catalog 和官方资源；确需新固定集合则新建 revision，不覆写 revision 6。

## 证据状态

本轮 GitHub 连接具备源码读取与提交能力，但不能直接访问用户 Mac 的真实 Chrome Profile，也不能在远端 GitHub connector 中运行仓库的 Node 命令。虚拟 DOM 的交互检查与静态编译检查**不等于**生产构建、Chromium 和 Mac 原生验收。

提交前补充：候选包 SHA-256/字节、真实 CI、Chromium 截图、Chrome 原生安装升级结果、六维独立实评分与未完成项。未经证据不得标记 95+ 或 NATIVE_PASS。
