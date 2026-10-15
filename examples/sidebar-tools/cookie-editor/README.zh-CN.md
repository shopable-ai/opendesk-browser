# Cookie Editor · 正式 Cookies SDK 安装工具

**入口：** Side Panel「扩展」→ 查找官方候选「Cookie Editor」→ 审阅安装 → 打开；也可将本目录源码打包为 JSON 后手动导入。默认中文，官方目录仍为 `installationPolicy: optional`；工具包 **2.0.6 / opendesk.sidebar-tool.v2**。**历史 2.0.4 隔离 CFT 候选**曾通过真实发现、安装、授权、读取、编辑、新建、保存回读和精确删除；该记录仅适用于当时的工具包。**当前 2.0.6 的 Mac Chrome 安装/导入/导出/缩放矩阵仍为 NOT_TESTED**；不能将历史截图、回执或分数延用为当前版本的 PASS/95+。所有 Cookie 修改均从已安装工具 UI 发起。

## 快速开始：使用已安装扩展，或编译本地 JSON

**路径 A：安装官方候选，不需要单独编译本工具。** 使用包含当前 Cookie Editor 官方发行和 Cookies SDK 的 OpenDesk Browser 扩展，打开 Side Panel →「扩展」→ 通过添加/搜索官方应用找到「Cookie Editor」→「安装」→ 阅读能力申请 → **确认安装** → 在已安装列表中 **主动打开**。本工具在 `official-tools/catalog.json` 中的策略是 `optional`，不是自动预装；**如果旧扩展内没有该候选，更新扩展构建后再找，单独修改源码并不会自动更新运行中的扩展**。

**路径 B：安装本地正在开发的版本（推荐用于修改 UI、JS、CSS）。** Node.js 要求 **≥22.12.0**；在仓库根目录运行：

```bash
npm ci --ignore-scripts --no-audit --no-fund  # 初次准备依赖；已有依赖可省略
npm run build:sidebar-tool -- examples/sidebar-tools/cookie-editor
# 生成：artifacts/sidebar-tools/cookie-editor/2.0.6/cookie-editor.opendesk-tool.json
```

然后在当前 Chrome 的 OpenDesk Side Panel →「扩展」→ **更多操作 → 导入本地工具包**，选择上面的 `.opendesk-tool.json` → 核对 ID `cookie-editor`、版本、文件来源和 Cookies 敏感能力 → **确认安装/更新** → 在已安装列表中点击 **打开**。如果原有同 ID 工具已经安装，应走“更新”而不是先卸载（卸载会清除工具本地数据及授权）。每次改完本工具的 `src/...` 后重新执行上述打包并**明确导入确认**；正式发布更新时同步评审并提高 `tool.config.json` 版本。导入动作本身不运行代码，也不自动授予某个网站的 Cookie 访问权限。

**为什么源码目录没有可导入 JSON？** `tool.config.json` 是构建输入，不能直接导入；唯一可导入文件由现有 `scripts/build-sidebar-tool.mjs` 生成到 `artifacts/sidebar-tools/<id>/<version>/`。这些生成文件不作为第二份手工维护源码提交。该工具是 **OpenDesk Sidebar App**，不是能通过 `chrome://extensions`「加载已解压的扩展程序」直接安装的 Chrome Manifest 扩展。

**什么时候才需要编译整个 OpenDesk Browser？** 如果刚修改了 `src/` 中的可信 Cookies Host、Browser SDK、权限或 Catalog，或者当前安装的旧扩展缺少相应能力，须在独立开发 Chrome Profile 中从仓库根目录执行 `npm run build:dev`，用 `chrome://extensions`「加载已解压的扩展程序」加载 `dist/development/`，重新打开 Side Panel。**只有本目录 UI/JS/CSS 变化时，不需要重编整个扩展**。验证真实 Cookie 读写前先打开普通 HTTP(S) 网站，并在已安装工具的可信「设置」中按网站和能力分别授权；不要把“工具已安装”误当作“已经有 Cookie 权限”。

用于不安装的只读预览：`node scripts/stage-sidebar-tool.mjs examples/sidebar-tools/cookie-editor`。它会生成 `STAGED_NOT_INSTALLED` 快照，**不能**替代正式安装、授权或真实 Chrome 验收。

## 用户能完成什么

1. 在实际 Chrome 打开要授权的网站 → 已安装工具「设置」→ 按网站分别授权 `browser.cookies.read / values / write / observe / clear`。安装或选择网址不自动授权；第一次授权需该站点处于活动标签页。授权后普通读取可以在其他网站仍活跃时重复使用。
2. `OpenDeskSDK.browser.cookies.getAll({url})` 读取真实 Chrome Cookie 元数据，显示 Cookie 名称、Domain/Path、Secure/HttpOnly/SameSite、Session/Expiration、Store/Partition。真实值默认隐藏；独立 `values` 网站授权后才可按需显示或导出。
3. `cookies.set/remove` 实际新增、编辑、精确删除；受信 Side Panel 每次要求用户明确确认。原生回读和结果未知不自动重试。Name 可直接修改，并按先新建核验再精确删除旧名称执行（非原子）。未改动的隐藏 Value 仅在获准独立敏感值权限后临时读取保留；也可主动提供新 Value。未授权时绝不静默写空值。
4. `clearSite` 只清理选定主机的 Host-only Cookie、批准的 Store/Partition、最多 50 条。先生成含 **60 秒、一次性 `previewRef`** 的预览；清理前核对精确 Cookie 身份集合，数量相同而内容改变也拒绝。实际删除仍需可信点击；Worker 重启、撤权会使旧预览不可用。
5. `observe.start/getStatus/read/stop` 手动启动最长 15 秒的有界脱敏变化观察，携带 cursor/gap。事件不传 Cookie 值。
6. 「离线工作区」仍支持 JSON、Cookie Header、Netscape 读取/编辑/导出，绝不冒充真实 Chrome；真实导入每批至多 10 条，预览并逐条经 Chrome SDK 与用户确认。真实含值导出需要主动触发本地保存和额外敏感值授权。

## 唯一架构及授权边界

```text
已安装的普通 Sidebar Tool (不可信 sandbox)
  → OpenDeskSDK.browser.cookies.*
  → 原 Sidebar Tool Bridge
  → Side Panel 真实安装身份/包摘要/Install Epoch/用户逐站授权
  → 原 Browser Dispatcher / Host
  → 原 createTrustedCookieHost / createCookieService
  → Chrome Native Cookies API
```

任何声明 Cookie Capability 的普通已安装工具都使用同一受信工具设置入口，不因 Cookie Editor 官方来源获得 BUILTIN_TRUSTED 特权。Host 校验真实 Sender、Chrome Cookies + Host Permission、明确 Origin、Store、Partition、Capability、版本/包摘要/Epoch；Page SDK、开发预览和跨工具不得继承授权。敏感值只在当前用户请求中临时显示，不自动写入工具 Storage、草稿、遥测或云端。

**旧内置可信 Cookie 管理 UI 尚保留。** `browser.cookies.approve/execute` 只供历史可信 UI 内部防重放使用，不是工具 SDK；正式 Cookie Editor 在真实 Chrome 通过正反向与生命周期验收后再迁移和去除重复产品入口，避免现有原生 Cookie 功能倒退。

## 验收（真实结果与缺口）

| 项目 | 当前等级 |
| --- | --- |
| 11 项公开 SDK、Schema、Host 与 Tool Capability | SOURCE_WIRED |
| 真实读/值/写/删/清理/观察的 UI 调用 | SOURCE_WIRED |
| V8 JavaScript 语法检查 | PASS（仅语法，不是功能或 Chrome） |
| Cookie/SDK Node 专项测试 | **2.0.6 CI 148/148 PASS**（[原始运行](https://github.com/shopable-ai/opendesk-browser/actions/runs/38566962748)）；旧版通过记录按旧候选保留 |
| 官方工具打包、Check | **2.0.6 CI PASS**；工具包 SHA-256 `4c33f88df17b92331dba197cc4c63535940e6117647267458a7fc1024b5284e9`（CI 候选，不是 Mac 已安装包） |
| Build、Build:dev、Verify | **2.0.6 CI PASS**（未替换或验收 Mac 日常扩展） |
| 完整 npm test | **2.0.6 CI FAIL：2418 PASS / 1 FAIL / 9 SKIP（共 2428）**；唯一失败为旧 Time Review R1.5.1 静态断言，不属于 Cookie Editor；不删除/降低断言 |
| Mac Chrome 安装、真实授权、核心操作/导入导出/清理/观察/撤权/启停/卸载/升级 | **2.0.6 NOT_TESTED**。历史 2.0.4 隔离 CFT 核心流程为 PASS_SCOPED，但不能升级为本版结论 |
| 宽度与 Zoom | **2.0.6 NOT_TESTED**：300/320/360/420/520 CSS px、Side Panel 自身 Zoom、明暗模式均需同包原生截图；旧版 360 px 记录仅供历史参考 |
| 八项产品级专家评分 | NOT_SCORED |

可在真实 Mac 工作区运行：

```bash
node --test tests/environment/browser-sdk-r9-installed-cookies.test.mjs tests/environment/browser-sdk-r7-trusted-cookies.test.mjs tests/environment/browser-sdk-r8-cookies.test.mjs tests/environment/cookie-editor-ui.test.mjs
node scripts/build-sidebar-tool.mjs examples/sidebar-tools/cookie-editor
node scripts/build-official-tools.mjs --out artifacts/official-tools-release
npm run check && npm test && npm run build && npm run build:dev && npm run verify
```

测试只使用虚构 Cookie。运行命令及真实 Chrome GUI/CFT 证据必须绑定对应源码输入、工具包 SHA-256 和扩展构建 Hash；不能用 DevTools 直接调用 `chrome.cookies` 冒充用户安装路径验收。R2/R2.1 历史阻塞与组件冒烟保留在原工作流中，不替代 2.0.4 的同候选原生报告。

R3.3 新候选：授权变化后经已有 Bridge 自动检查当前网站；拒绝与读取失败显示独立状态；未完成 Host 操作期间锁定网站与模式控件；普通确认不再采用危险操作红色样式。正式产品默认不进入离线工作区。历史 1.0.0 官方发行仍是离线包，已安装用户必须在「发现工具」明确升级；不能静默同版本替换。

2026-10-14：上述核心旅程、导入导出、清理、观察、升级和生命周期已取得隔离 CFT 的限定原生证据；宽度、Side Panel 自身 Zoom、真实跨 Store/Partition、F3/ZIP 等缺口与全仓 FAIL 继续保留。当前核心、Path 隔离及部分重命名绑定身份保护修复后的候选；未受影响项保留前一候选身份限定复用。本轮原始证据和 Git/CI 状态见原工作流 `r33Local` 与 [续接提示词](../../../docs/framework/prompts/cookie-editor-r33l-core-first-handoff-20261014.zh-CN.txt)。
