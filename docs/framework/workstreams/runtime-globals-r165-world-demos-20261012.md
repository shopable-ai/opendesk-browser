# R16.5 `src/libs` 跨世界可运行示例与零参数约束：实施记录

日期：2026-10-12。目标仓库 shopable-ai/opendesk-browser，唯一可写分支 main。本记录为本轮实际交付与验收边界，不能替代仓库唯一 Catalog。

## 为何不重写旧框架

R16.4 已经把零参数 `export default async function main()` 落到 Controller/Page 多文件示例，并有真实 ESM Webpack/Worker/Page 组件测试。Controller `page,params,axiosx` 是 Worker 词法能力，`_ / dayjs / OpenDeskLibs` 是受控内置 facade；Controller 多文件编译器仍保留历史 `main({page})` 的内部调用 ABI。Page USER_SCRIPT 有 DOM，但没有 Controller `page`。复核时不应因旧示例继续保留兼容而把“需要参数”写成新默认。

## R16.5 实际新增路径与职责

- `examples/libs/trusted-imports/{background,sidebar-host,extension-page}.mjs`：三种受信扩展环境的真实 npm ESM import 与纯函数调用。仅参考及 Node 测试，不增加 Chrome Extension 的生产入口；应由维护者在既有固定 `src/**` WXT 入口按需选取逻辑，不能绕过特权来源审计。
- `examples/sidebar-tools/runtime-globals-demo/`：完整 `tool.config.json` 与经典 HTML/CSS/JS，可经 `scripts/build-sidebar-tool.mjs` 输出用户审核安装的 JSON。独立 opaque iframe 只能使用 `OpenDeskTool.root/request`，需点击才读取当前网站标题；没有用户 Controller 或 Page 的全局变量。
- `examples/programs/single-file/page-globals-zero-arg.js`：普通 Sidebar Page / async-main 的 `main()`，不含 `export default`、不调用 Controller `page`。
- `tests/environment/runtime-libs-trusted-worlds.test.mjs`：实际从根 npm 锁导入主模块，在 Node 调用受信入口工具函数；通过正式 `createSidebarToolPackage()` 验证 JSON/HTML/CSS/JS；VM 中用有限 `OpenDeskTool` 桥检查明确点击/拒绝合成事件/只调用 `currentPage.info`；检查文档仍能正确指导各执行世界。
- `docs/api/runtime-globals-and-preinstalled-libraries.zh-CN.md`、`src/libs/{README,AGENTS}.md` 与 Demo 索引/原 R16.4 GOAL 添加“可执行路径 vs 构建/运行世界”链接，防止 AI/Codex 再推荐错误的 `main({page})`。

## 性能/权限/发布影响

本轮没有新增依赖、vendor 注册表、Chrome 许可、WXT 固定入口、SW 运行导入、CDN、动态执行、ABI 变更、预装库自动注入或修改 `scripts/build-contract.mjs`。独立工具的 JSON 只有用户审核确认后才能安装运行；可信模块在 `examples/` 中不自动进入生产 Chrome 包。

## 必须回读的证据

```sh
npm ci --ignore-scripts --no-audit --no-fund
node --test tests/environment/runtime-globals-zero-arg.test.mjs tests/environment/runtime-libs-trusted-worlds.test.mjs
node scripts/build-sidebar-tool.mjs examples/sidebar-tools/runtime-globals-demo
npm run check
npm test
```

构建/单元测试：只有实际完成并读取同 SHA 的 GitHub CI 结果后才记 `PASS`。用户手动在真正 Chrome 导入/打开新工具、Controller/Page 运行及断网/权限场景没有绑定真实原始回执时一律记 `NATIVE_UNVERIFIED`。用户工具桥本身的 VM 验证不能替代真实宿主身份/权限/文档/导航测试。

依照当前 Catalog，Socket.IO Client、用户 UI Tailwind 公共 CSS 和完整 Controller 真实 Axios Broker/取消等剩余目标不得写成已交付。本轮不因“展示四种 Demo”给整个公共库产品 95+ 满分。
