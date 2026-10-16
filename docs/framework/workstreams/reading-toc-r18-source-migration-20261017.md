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

## 新固定集合修订

为适配正式源码候选 1.0.8，最新 reading-kit 集合添加 **revision 7**；revision 1–6 原内容保留且不得改写。发行摘要、真实安装包与 Catalog 一致性必须以打包后 CI/晋升证据为准。

## R1.8.1 · CI 修复进度与真实候选证据（2026-10-17）

### 已提交、已通过的部分

1. `tests/environment/sidebar-tool-localization-r12.test.mjs` 已把源码包版本断言从 1.0.7 调整到真实源码候选 1.0.8；保留对**唯一根目录正式 JSON 字节相等**的严格断言，正式晋升前这项仍预期失败，不绕过、不伪造。
2. 官方生成器已在 GitHub hosted Ubuntu（[成功运行 #38959360526](https://github.com/shopable-ai/opendesk-browser/actions/runs/38959360526)）输出新候选 JSON 与 Side Panel / Page Overlay 两份同源 HTML。已保存 HTML 正式来源摘要、CSS、JS 和可信 Overlay 验证逻辑不变；`reading-toc-r17-ai-desktop-preview.html` 是冻结的 R1.7.4 视觉基准，未作为正式业务 Mock。
3. GitHub Actions R1.8.1 候选构建：19/19 定向 Node PASS，`npm run check`、`npm run build`、`npm run build:dev`、`npm run verify` PASS。CI 运行环境是 Linux，不得作为 macOS Chrome 原生报告。
4. 本地隔离 **Chromium 144 Linux** 离线沙箱真实运行工具包 JS/CSS 的 HTML，矩阵 320/360/420/520px × 中英 × CSS zoom 100/125/150/200% × 概览/当前/完整/AI，修复前 120/128，窄屏 320px、200% zoom 有 11px 溢出；正式 `src/style.css` 加入仅约束工具栏自身的横向滚动后，不注入补丁重跑 **128/128 PASS**、页面脚本错误 0。验证 AI 假章节 0、会员入口禁用、默认合作招募、英语切换、ArrowLeft 返回完整目录；网页 Overlay 只保留三个免费模式。
5. 之前 [专项 CI #38958020901](https://github.com/shopable-ai/opendesk-browser/actions/runs/38958020901)：67 项 65 通过 2 失败（老同源预览未同步、稳定 JSON 与源码 1.0.8 不同），既有 Sidebar 97/97；全量 3,448 项中 3,385 通过、51 失败、12 跳过，很多 `dist` 错误是专项在 `npm run build` 之前失败造成，需先完成真实构建再评价。修复预览后须检查新提交的新 CI 结果，不能沿用历史失败数宣称转绿。

### 文件身份（R1.8.1 CSS 修复后的已验证候选）

| 文件 | 版本 / UTF-8 bytes | SHA-256 |
| --- | --- | --- |
| `artifacts/sidebar-tools/reading-toc/1.0.8/reading-toc.opendesk-tool.json`（未发行） | 1.0.8 / 27,778 | `7cb40e48d3e9f5f801f9fd8e181fa7ab15d030cfc15e62585d706579d041be0d` |
| `preview/reading-toc-r12-interactive-preview.html` | 1.0.8 / 211,846 | `753089d037a8ba407c614f137984017bd3e536294af2593e99cd1d5a5bd52e1c` |
| `preview/reading-toc-r12-overlay-preview.html` | 1.0.8 / 220,396 | `54066ea520a09626fecba64f06a70d13d397022ec7c68125690130119a0a5e32` |
| 根目录 `reading-toc.opendesk-tool.json`（唯一已发行） | **1.0.7 / 17,574** | `3d5ac0b4ca7bace06c4d4c013e5366b6e21ccc71c6ce92558a191ccd1f7a4573` |

### 严格未通过的发布门槛（不可推定完成）

- `USER_MAC_CHROME_INSTALL_UPGRADE=NOT_TESTED`：用户真实 Mac Chrome 旧版 1.0.7 安装、点击确认升级 1.0.8、用户偏好保留、旧 iframe 撤权、重启恢复、失败回滚、卸载与回收均无 Mac Profile / 操作录屏证据。
- `GITHUB_HOSTED_MACOS=NOT_TESTED`：当前成功候选为 hosted Ubuntu；独立 macOS runner 未验收。
- `RELEASE_JSON_PROMOTION=BLOCKED`：**不得提前通过 `--promote-from` 覆盖根目录 1.0.7**。必须完成用户 Mac Chrome 真实升级与安全回滚，再晋升同 SHA 候选，重新运行源包字节一致性与 Catalog、reading-kit revision 7 全套校验；历史 revision 1–6 不动。
- `AI_PROVIDER / PAID_MEMBERSHIP / CHECKOUT=NOT_IMPLEMENTED`：只有安全降级 UI、会员卡和默认合作招募；无真实模型调用、正文上传、会员数据、充值接口或自动真实广告脚本。
- `UX_95_PLUS=NOT_SCORED`：产品逻辑、视觉一致性、窄屏密度、会员招募、导航恢复、安全安装升级六维分别需要可靠人工与原生证据；当前 Linux 预览不能伪装成六位独立专家实际 ≥95 分。

**下一阶段仅在 Mac 本地执行（必须保留原有安全 main 策略）**：隔离 Chrome Profile，使用 `tests/framework/reading-toc-native-r41.test.mjs` 与现有真实安装升级驱动，从 1.0.7 显式升级 1.0.8 并核对旧数据、撤权、回滚。通过后晋升候选、完整构建/`npm test`/Catalog 核对，记录版本和 SHA、截图，再安全提交 push；不得自动静默升级或跳过失败断言。
