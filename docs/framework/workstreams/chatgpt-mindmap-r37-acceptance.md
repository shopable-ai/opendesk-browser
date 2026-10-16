# ChatGPT Mind Map R3.7 · Chromium、Program 构建与 Native 分层验收

> 2026-10-16 · 已按 GitHub main 实际源码与 Actions 原始 Job/Artifact 复核。**不是生产安装批准单**。设计保持 `PENDING_USER_CONFIRMATION`。

## 1. 一句话产品结论

| 层次 | 当前可证状态 | 证据范围 |
| --- | --- | --- |
| 独立 Program 源码 | `SOURCE_VERIFIED` | `examples/programs/chatgpt-mindmap/` 内七个业务 JS + CSS |
| 本地 HTML 原始 XMind | `PREVIEW_PASS` | Git-tracked 四份 vendor JS，真实 Linux Chromium |
| 交互及几何 | `CHROMIUM_PASS`（固定模拟页） | 真实 Topic、画布、缩放、根节点、横向滚动、菜单 |
| PNG 生成 / 人工视觉 | `PNG_HASH_VERIFIED`；`SCREENSHOT_NOT_VERIFIED`（机器字段） | 逐张生成、聚合审阅与重点 PNG 人工核查；未声称用户批准 |
| Program 构建候选 | `BUILD_PASS` / `BUILT_UNVERIFIED` | 源/构建 SHA-256 相同，`installable:false` |
| Mac Browser dist / 正式安装 | `NOT_TESTED` | 本环境不接入用户 Mac；未取 Mac `dist`、Profile 或 Chrome 安装库 |
| 生产 XMind Runtime | `BLOCKED` | `E_XMIND_RUNTIME_UNAVAILABLE`、资源/许可证与样式隔离 |

**不因 Preview 或 Build 通过而更改 `installable` 或宣称 95 分正式产品。**

## 2. Git SHA、CI 与真实修复范围

- 旧 320px 可见性失败：[Actions #38864663581](https://github.com/shopable-ai/opendesk-browser/actions/runs/38864663581)。
- 首次绿色证据：[Actions #38865072908](https://github.com/shopable-ai/opendesk-browser/actions/runs/38865072908)，SHA `691ffa15a35b1a487cdb92f7c0cccb24e25ad5f6`。
- 更新响应式断言意外让折叠的预览实验台按钮不可定位：[Actions #38865992280](https://github.com/shopable-ai/opendesk-browser/actions/runs/38865992280)，属于**测试状态恢复缺口**，不能当作生产 SDK 故障。
- `ce0e448bb73d6f8574c8d9dd4b7bf18c6e395354`：先恢复 desktop viewport、重新打开实验台，再取消强制 320px 模式；增加 400/440 容器响应式断言。[Actions #38866604870](https://github.com/shopable-ai/opendesk-browser/actions/runs/38866604870) 两个 Job 成功。
- `aaccbf608b0b2c98d13074158f4404cae73bd598`：逐 PNG 加真实 geometry；修复响应式截图上方 toolbar 裁切；完整补充更多菜单 Up/End/Space/外部点击。[Actions #38867300512](https://github.com/shopable-ai/opendesk-browser/actions/runs/38867300512) 两个 Job 成功。
- `862eef6c24c6af3046cec8792c7c0fc0d69d1071`：新增 320px **浏览其他分支后点击适配应恢复真实根节点**的浏览器断言。[Actions #38867753856](https://github.com/shopable-ai/opendesk-browser/actions/runs/38867753856)，最终结果以该次 Actions 为准；未取到结果时不可写 PASS。

上述本轮源码变化仅在 `tests/framework/chatgpt-mindmap-chatgpt-probe.mjs`；**没有改仓库根 `src/`**。后续单独文档提交不应被描述为 Program 业务迁移。

## 3. 旧失败与新可测几何（Chromium 真实 Topic）

| 指标 | 旧失败 #38864663581 | 新成功 #38867300512 |
| --- | ---: | ---: |
| 强制内容容器 | 320px | 320px |
| 真实 XMind Canvas | 318px | 318px |
| B 根节点实际宽 | 180px | 180px |
| **根节点与 Canvas 的可见交集** | **31px** | **180px** |
| B `.topic` 数 | 6 | 6 |
| 真实 `.workbook-item` scrollWidth | 2021px | 2021px |
| 真实 `.workbook-item` scrollLeft | 827px | 660px |
| 页面整体水平溢出 | 未核实 | 无 |

320px **整窗**：内容容器 296px、XMind Canvas 294px；鼠标水平滚轮使真实 `.workbook-item.scrollLeft` 从 176px 变为 411px，证明用户能浏览被遮挡的其他分支；PNG 记录动作前后。新加的「滚动后适配复位」必须再看 `862eef6c` 的真实 Job，不在此凭推论盖章。

宽度审计（取对应 CI `chatgpt-result.json`，非设计稿）：

| 浏览器宽 | 内容宽 | XMind Canvas | 根节点可见宽 | Toolbar | 页面水平滚动 |
| ---: | ---: | ---: | ---: | --- | --- |
| 375 | 351 | 349 | 180 | 移动更多菜单 | 无 |
| 390 | 366 | 364 | 180 | 移动更多菜单 | 无 |
| 400 | 376 | 374 | 180 | 移动更多菜单 | 无 |
| 440 | 406 | 404 | 180 | 桌面图标模式 | 无 |
| 768 | 734 | 732 | 189 | 桌面图标模式 | 无 |
| 1220 | 780 | 778 | 201.6 | 桌面图标模式 | 无 |
| 1440 | 780 | 778 | 201.6 | 桌面图标模式 | 无 |

以上单位均为 px；响应模式严格依据真实 `.odmm-shell` 容器宽度，不根据窗口宽度硬判断。

## 4. 浏览器、测试数量、截图 Artifact

通过的全套 CI：[**#38867300512**](https://github.com/shopable-ai/opendesk-browser/actions/runs/38867300512)：

- `offline-source-contract` **PASS**：Preview + Program Node 环境检查 21/21；Page Native 管理/生命周期组件测试 41/41；`validate-program-project`、`build:program`、`audit-build`、`npm run check` 均成功。
- `real-local-xmind-html` **PASS**：原始 SDK 实测 XMind 探针和正式 Answer Registry 的 ChatGPT 模拟页；A 真实 10 Topics、B 真实 6 Topics；C 表格、代码、引用与 HTML 无损恢复、A/B 独立 Zoom/折叠、全屏/退出、深浅主题、20 次开合、操作栏重建、内容更新提示、320px 与全响应尺寸、Stop。
- Chromium 版本由 PNG 清单记录为 `155.0.8059.39`，实验页是本地 loopback `chatgpt.html`，**不是登录 ChatGPT**。
- [真实 Chromium PNG / JSON Artifact](https://github.com/shopable-ai/opendesk-browser/actions/runs/38867300512/artifacts/12032061309)（GitHub ZIP SHA-256 `5659e60c2159480813e6c375eaa40d18bf80032fc431592d97c00a16561c610c`）。机器清单 `screenshot-evidence.json` 包含 19 次 capture，每项的 Git SHA、实际 URL、浏览器、视口、回复 Topic 数、Canvas/根节点/Toolbar/Scrollbar 几何、截图本地路径、单张 PNG SHA-256、时间、CI Run；单张 SHA 在审阅环境独立核对一致。
- 实际打开审阅：初始聊天、A/B/C、浅色深色、全屏、320px 内容容器、320px 整窗/横向滚动、菜单展开、375/390/400/440/768/1220/1440、原文恢复。上轮 400/440 截图因未恢复 transcript 滚动位置，工具栏被顶部裁切；R3.7 捕获前显式回到 Viewer，并断言真正可见高度 ≥36px，新 PNG 已人工检查。视觉确认仅对离线 fixture 负责；机器仍标 `SCREENSHOT_NOT_VERIFIED`，不能写未取得的逐维 95 分。

## 5. 编译产物真实性

[**独立 Program 构建候选 Artifact**](https://github.com/shopable-ai/opendesk-browser/actions/runs/38867300512/artifacts/12031672012)；源码 SHA `aaccbf608b0b2c98d13074158f4404cae73bd598`，CI runner 绝对产物目录：

```text
/home/runner/work/opendesk-browser/opendesk-browser/artifacts/programs/opendesk.chatgpt-mindmap/0.2.0/r31-production/e17e473394c6b826-98444e05e46f
```

| 真实字段 | 结果 |
| --- | --- |
| `programId` | `opendesk.chatgpt-mindmap` |
| `version` / `runtimeKind` | `0.2.0` / `page-userscript` |
| `sourceBytes` | 53,841 |
| `sourceHash` = `buildHash` = `program.js` SHA256 | `e17e473394c6b8269277ff1373c831346706d03f6bbfb912c759767194f25799` |
| `program.opendesk-draft.json` SHA256 | `e44eae02bf790ec8a4a0811e809ff2e76b8d013d8b8d69895dd40e2faa94546a` |
| `artifact.json` SHA256 | `98790b297745590b4378dbc52fe625224912fe3fb2dfce4b673fc87f6d3803aa` |
| `status` / `installable` | `BUILT_UNVERIFIED` / `false` |
| 源码新鲜度 | `MATCHES_CURRENT_PROJECT_SOURCE`（仅 CI Checkout） |

七个业务 JS 位于 `examples/programs/chatgpt-mindmap/src/`，官方 `@opendesk/ui` 框架 helper 通过已有构建映射引入；正式 Program 仅引用 `assets/ui.css`，**没有**把四份原始 XMind vendor JS 声明成正式产品资源。这里只是 Linux CI 构建路径，Mac 本地路径未执行/未核对。

## 6. SDK/Browser/安全与 Native 依旧阻塞

- 四份原始 JS 精确字节共 4,042,573（参照 `examples/programs/chatgpt-mindmap/tests/xmind-provenance.json`）；已在预览中 Git-tracked、受 SHA 校验，但正式 `USER_SCRIPT` 缺可信资源准入。框架资产总量 60KiB、linked Page 资源 512KiB 等限制不能悄悄扩大；`E_XMIND_RUNTIME_UNAVAILABLE` 必须 fail closed。
- 原始 Snowbrush 会向页面注入全局 `style#snowbrush_style`，Stop 后仍残留，真实探针报告 `BLOCKED_GLOBAL_STYLE_RESIDUE`；`remainingOwnNodes=0` 不代表第三方全局样式已隔离。
- JSZip、XMind SDK、Snowbrush 及 GSAP 传递依赖的授权和生产再分发证据不完整；这不是宣布许可证禁止分发，而是**尚未完成**合规验收。
- Chrome `userScripts` 正式注册、权限授予/撤销、Stop/卸载、SPA/BFCache、旧页面停机、同 ID 升级、`dist/development` 与 `dist/production` 是否实际包含 Program 均为 `NOT_TESTED`。没有 Mac 原生安装证据，不得填 `INSTALLED`。
- 不能引入 MAIN WORLD 注入、CDN、假 Canvas、额外安装器或 Mind Map 专用 Host API 绕过通用 SDK 限制。

## 7. 95+ 目标与如实打分

| 专家维度 | 可证状态 | 不能冒充的结论 |
| --- | --- | --- |
| 真实 XMind 结构和 A/B/C | `PASS`（固定 fixture） | 不是登录 ChatGPT |
| 320px 根节点及实际滚动 | `PASS`（旧/新比较） | 新增 Fit after pan 需看 #38867753856 |
| Responsive / Toolbar / ARIA / 菜单 | `PASS`（自动交互、几何） | 跨机型真实触屏/用户偏好仍需验收 |
| 视觉排版 | PNG 已实生成、抽检，`SCREENSHOT_NOT_VERIFIED` | 未完成用户批准与正式产品逐张质量打分 |
| 20 次开关与停止 | `PASS`（fixture） | Native stop/revoke/old-tab 未测试 |
| Program 模块/源码哈希 | `PASS` | 构建不等于安装 |
| 浏览器宿主业务隔离 | `PASS`（本轮改动范围） | 后续 Runtime 框架方案仍需单独安全评审 |
| 正式许可 / Resource / Style | `BLOCKED` | 不能宣称生产安全通过 |
| Mac Chrome Native 全流程 | `NOT_TESTED` | 不能打 95 分 |

**R3.7 是具备真实 Chromium/独立编译证据的预览产品候选，而不是可安装发布版。** 不给缺少证据的维度填写虚构分数，也不能把十个维度简单平均成 95/100。下一步应先关闭生产 Runtime/许可/全局样式隔离，再进入真实 Mac 开发环境 Chrome 原生用户脚本授权、撤权/卸载、BFCache 和真实 ChatGPT 页面验证。

## 8. 一致性规则与复现

```sh
node examples/programs/chatgpt-mindmap/preview/verify-assets.mjs
node --test tests/environment/chatgpt-mindmap-preview.test.mjs
node --test tests/environment/chatgpt-mindmap-r1.test.mjs
node scripts/validate-program-project.mjs examples/programs/chatgpt-mindmap
npm run build:program -- examples/programs/chatgpt-mindmap
node examples/programs/chatgpt-mindmap/scripts/audit-build.mjs
npm run check
```

真实浏览器探针：`tests/framework/chatgpt-mindmap-xmind-probe.mjs` 和 `tests/framework/chatgpt-mindmap-chatgpt-probe.mjs`，工作流：`.github/workflows/chatgpt-mindmap-preview.yml`。运行前检查 GitHub 最新 `main` SHA，不能复制本报告中的旧哈希冒充后来修改过的源码。**报告只列出已取得的 CI 证明；更晚的 CI 以 GitHub Job/Artifact 真实结果为准。**
