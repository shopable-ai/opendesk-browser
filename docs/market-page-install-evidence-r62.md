# OpenDesk Browser R6.2 — 应用商店网页安装回归证据（增量）

日期：2026-10-26。仓库：`shopable-ai/opendesk-browser`，唯一修改分支 `main`。

## 原始目标（不另起一套）

复用 R5 的 `opendesk.market.intent.v1`、`PROBE / OPEN_INSTALL_REVIEW`、
可信审阅、原 Installer 与 Installed Authority。让用户在独立网页找到固定发行的
`markdown-workbench`，在可信扩展页确认后安装、打开、使用和保留正确状态。
普通网页的 `rel="opendesk-install"` 只是一条只读线索，不能从网页绕过权限审阅。

R6.1 已有市场首页 CTA、真实声明、`src/marketplace/discovery.js`、
扩展中心 React 上下文发现和既有原生 Chrome 测试。**不得重新开发第二个安装器、
Host、安装库或网页扫描体系。**

## 已实施的最小回归修复（以上游提交为实际证据）

1. `4eddaa04c5d804c30308ad95f8f441d2ba5c13a5`：
   `src/marketplace/discovery.js` 从 `link[rel][href]` 改为 `link[rel]`；
   缺少 href 的同名 rel 声明仍占用一个声明名额，杜绝与有效链接共存时误判唯一。
2. `4fe527ef2df55deb8c89d342c0911a2e6296e686`：
   在原 `tests/environment/market-page-discovery-r61.test.mjs` 增加对应组件回归。
3. `039937ca0996624069161ce9c40da29374c0f497`：
   `src/market-site/market.css` 从 R6.1 中误写入的 `undefined` 恢复原 R5
   7,186 字符单行市场样式（源自 `ac559863...` 的真实提交差异），再保留 R6.1 CTA
   补充规则；修复后读回为 7,616 字符，含完整 header/card/grid/详情/响应式规则。
4. `f5404eda3658950a9e0a6213b38c82ba3f85b90d`、
   `587de8f1d1a019785ca1e326bcc2b018a5c8b37d`：
   增加并修正 CSS 完整性测试，防止再次把样式表替换为字面量 undefined。
5. `0ca391d39d40af4fa8105acf87584b283418e659`：
   原 `tests/helpers/app-market-r5-native.mjs` 增加实际 HTTP 详情页的**唯一固定
   版本** link 断言与收据，并把首页测试断点扩展到
   320 / 360 / 400 / 440 / 520 / 960 / 1280px，不增加独立测试框架。

上述是**提交与远端源码读回**证据，不等于执行所有测试。

## 证据状态与不可虚构的门槛

| 检查项 | 本轮证据与状态 |
| --- | --- |
| 上游实际分支 | GitHub `main` 读回，补丁最新确认 `0ca391d39d40af4fa8105acf87584b283418e659`（后续以最新 HEAD 为准） |
| 正式源码 | 已读回修复文件的 Git blob；`EXISTING / PATCHED` |
| 扫描函数局部行为 | 执行从当时 GitHub 源码抽取的无特权函数，`[有效 href, null]` 返回两条声明；`MICROCHECK_PASS`，非完整项目测试 |
| 预设市场 CI | `40321189250` 的三个作业在本轮查验时均为 `queued`；`CI_QUEUED`，不标 PASS |
| `node --test` / `npm run check` / `npm run build:dev` / `npm run build:market-site` | 当前执行环境没有仓库工作树，`NOT_TESTED`；由已配置的 CI 执行 |
| 原生 Chrome 路径 A：市场首页 → 可信审阅 → 实际安装 → Markdown 使用 | 原测试代码已存在，本轮补充声明与断点；**本轮未运行**，`NOT_TESTED` |
| 原生 Chrome 路径 B：普通网页声明 → 扩展发现 → 可信详情 → 安装 | 组件与源码存在，但仍缺本轮实际 Chrome 收据；`NOT_TESTED` |
| Mac 用户本机 Chrome 持久化安装、卸载、重启 | `LOCAL_CHROME_NOT_TESTED` |
| 正式公众 HTTPS 来源 | `src/marketplace/channel-config.json` 的 production origin/extensionId/acquireUrl/verifiedAt 均为 null；`BLOCKED`，不得用开发 HTTP 配置替代 |

## 下一个对话只做剩余差量

先查最新 `main` 和真正新产生的市场 CI；若出现 FAIL，下载日志定位第一个
失败断言并最小修复。若 CI 全通过，核查官方构建 Catalog 内的
`markdown-workbench` 固定版本与摘要、核对 native receipts/screenshots，
再执行普通网页路径 B 的独立真实 Chrome 证据；最后才是用户 Mac 本机 Codex
安装、交互、恢复和持久化验收。直到全部 P0 门槛有收据，不宣布 95+ 正式交付。
