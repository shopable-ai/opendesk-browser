# ChatGPT 思维导图 R3 · 真实 XMind 预览已通过，正式安装仍阻塞

程序 ID：`opendesk.chatgpt-mindmap`；显示名称：**ChatGPT 思维导图**；版本 `0.2.0`。
运行目标仅为 `https://chatgpt.com/*` 顶层 `USER_SCRIPT`。

**真实 XMind 已在独立 Linux Chromium 的本地 DOM fixture 运行。R2 尚不能作为普通用户正式安装版使用。**
现有宿主没有经过审核的 XMind 固定资源准入；入口会在修改网页前报
`E_XMIND_RUNTIME_UNAVAILABLE`。构建的 `BUILT_UNVERIFIED / installable:false` 不是安装成功。
没有 SVG 替代、MAIN 世界加载、CDN、第二扩展或权限放宽。

## 独立真实 XMind HTML 预览（R2.1）

新增 [preview/index.html](preview/index.html) 与 [预览运行说明](preview/README.md)：它与正式程序**共享** `src/answer-registry.js`、`src/xmind-adapter.js`、`src/xmind-convert.js` 和 `assets/ui.css`，不会另造绘图器或复制一份可能漂移的业务源码。开发者检出最新 `main` 即可运行，四份真实 JS 已直接位于 `preview/` 并由 Git 跟踪，不再需要旧仓库绝对路径：

```sh
node examples/programs/chatgpt-mindmap/preview/serve.mjs
node examples/programs/chatgpt-mindmap/preview/verify-assets.mjs
node --test tests/environment/chatgpt-mindmap-preview.test.mjs
```

预览服务首先验证四个原始文件的 SHA-256、Git blob、大小和加载顺序，缺失立即失败；仅绑定本地回环地址，不使用 CDN。可以独立验证 A/B/C、320px、折叠/缩放、操作栏重建、流式后快照与 Stop 的全局样式残留。**预览页正向运行不代表生产 USER_SCRIPT 已安装、原 ChatGPT 已测试或分发许可已批准。** R2.1 的实现与下一环节在 [工作流记录](../../../docs/framework/workstreams/chatgpt-mindmap-r21.md)。

## 实际实现

单条 Answer DOM → HTML 语义 → MindNode → 原 Workbook / Topic / Dumper / JSZip →
原 `_SB_.createWorkbookEditor()` → 真实 XMind 只读画布。

- `xmind-convert.js` 移植原 `xmind/convert.ts` 的 Workbook 构造、备注、路径身份和 branch 状态，并合并原 `skin.ts` 的真实主题。补充根备注；删除按重复标题回退的状态；HTML 可见文字不再经过 Markdown 或任务标题重写。
- `xmind-adapter.js` 提取原 `xmind-renderer.ts` 的创建、staging mount、控制器替换、缩放/滚动恢复、原生折叠区域和 `close()`。不迁移 React、Next.js、编辑命令、账号、数据库和持久化。
- 该 SDK 没有原参考适配器尝试调用的 `fitMap/fit/center`。本版测量 SDK 实际节点，用 SDK `zoom()` 及其滚动容器适配；视觉定位仍未达验收标准。
- 该 SDK 的 `collapseBranch/extendBranch` 作用于选区。全分支工具栏还使用原转换器的 Workbook `branch` 状态重建，避免按钮切换而内容不折叠。真实 fixture 已观测 8 个可见主题折叠为 2 个并恢复。
- 每条回复独立创建控制器；同文同标题不共享状态。关闭和 Stop 等待初始化/命令队列，并关闭迟到的控制器。
- 正文始终保留原 DOM；只临时隐藏 `display` / `aria-hidden`，失败、关闭、导航和 Stop 恢复。
- 提取器保留开头裸文本、标题、段落、嵌套列表、表格、引用、代码及链接/加粗的可见文字；修复列表内表格和备注额度/emoji 截断。

## 文件审查与清理

| 文件 | 处理 |
| --- | --- |
| `src/main.js` | 保留受管 Page UI，增加缺少真实 SDK 时的失败门槛 |
| `src/chatgpt-adapter.js` | 保留；当前真实登录 ChatGPT 选择器未验证 |
| `src/answer-registry.js` | 保留并修复异步清理、迟到实例、复用 DOM 的消息身份及流式属性观察 |
| `src/extract.js` | 保留并修复 HTML 语义及额度 |
| `src/view.js` | 重构为唯一 XMind 入口，去掉品牌标题、重复说明及旧 SVG 操作 |
| `assets/ui.css` | 精简为按钮/工具栏/容器样式，删除旧节点/连线样式 |
| `src/mindmap-renderer.js` | 删除 |
| `src/mindbank-xmind-theme.js` | 删除；真实 Workbook 主题归入转换器 |
| `tests/layout.test.mjs`、`tests/xmind-theme.test.mjs` | 删除 SVG 布局/仿主题测试 |
| `tests/extract.test.mjs` | 保留并补充语义回归 |
| `src/xmind-convert.js`、`src/xmind-adapter.js` | 新增真实引擎最小适配 |

原算法来源为 `shopable-ai/shopable-station@b76abf4b95e34c1234a33927051ea13165d92715`；模块头部及
[`tests/xmind-provenance.json`](tests/xmind-provenance.json) 记录实际文件、Git blob、资源字节和 SHA-256。
这份 JSON 是审计/测试输入清单，不是第二份生产库注册表。

## 固定资源与实际阻塞

原资源目录：`apps/web/public/lib/xmind/`。四份原始字节均已读取并核对 Git blob 与 SHA-256：

| 资源 | 字节 |
| --- | ---: |
| `jszip.min.js` | 97,630 |
| `polyfill-45b9836beb.min.js` | 104,563 |
| `xmind-sdk.bundle.js` | 401,113 |
| `snowbrush-2c2b5d62b5.js` | 3,439,267 |
| 合计 | 4,042,573 |

**四份 vendor 字节已提交在本项目公开仓库的 `preview/` 中，但尚未纳入正式扩展的受信生产资源封装。公开存在不等于取得其完整生产再分发许可。** 以下缺口尚未关闭：

1. **许可/来源闭包**：参考目录没有附带完整许可证和可复现版本锁。JSZip 头部声明 MIT/GPL；XMind 官方 SDK、viewer 包装项目的 MIT 不能直接证明这个 Snowbrush 合并产物和其中全部第三方资源的再分发许可。Snowbrush 内含多个第三方许可头，需要将其与固定字节对应。没有证据宣称它禁止分发，也没有证据宣称已审核通过。
2. **现有资源合同装不下**：普通 Program builder 输出上限 100,000 B；linked Page 资源/compiled source 512 KiB；可选本地库单项 512 KiB，React/Vue 专用资源 256 KiB。Page assets 仅 CSS/JSON/图片，不能把 3.44 MB JS 冒充 JSON/CSS。未修改这些合同或以远端锁绕过。
3. **隔离与生命周期**：真实探针确认 Snowbrush 向文档插入全局样式；控制器全关后仍保留共享样式。直接把它载入 USER_SCRIPT 仍共享网页 DOM，Shadow DOM 不能解决 SDK 全局资源所有权。必须验证复用现有运行边界的最小可信本地资源/绘图隔离方案，再实施公共合同；本轮没有新建 iframe/RPC 框架。
4. **视觉及原生证据**：Linux 截图有字体缺失与画布定位/裁剪问题；不能声称与原 Mindbank 页面一致。暗色、真实 200%、触控板/拖动/备注、BFCache、内存、真实登录 ChatGPT、撤权/卸载即时清理和自动运行均未完成验收。

源码里的 `new Function` / `eval` 字样并不等于此只读路径一定失败：真实 Node 转换在禁止字符串代码生成时通过；独立 Chromium 使用 `script-src 'self'`（没有 unsafe-eval）渲染和操作通过。
**这不等于 Chrome USER_SCRIPT 或扩展 CSP 已验证。** 没有把原 SDK 注入 ChatGPT MAIN；探针仅在专属本地测试页面加载固定资源。

## 复现与证据等级

```sh
node scripts/validate-program-project.mjs examples/programs/chatgpt-mindmap
node --test tests/environment/chatgpt-mindmap-r1.test.mjs
npm run build:program -- examples/programs/chatgpt-mindmap
npm run check
```

保留历史 `r1` 测试命令作为 CI 入口，但不再导入 SVG 测试。
真实 SDK Node 测试需提供已经取得的固定资源目录（缺失时明确 SKIP，不能计为 SDK PASS）：

```sh
XMIND_REFERENCE_DIR=/absolute/audited/xmind node --test tests/environment/chatgpt-mindmap-r1.test.mjs
```

浏览器探针只用于开发者复现，不是普通安装者的额外安装步骤：

```sh
node tests/framework/chatgpt-mindmap-xmind-probe.mjs \
  --assets /absolute/audited/xmind \
  --browser /absolute/chromium \
  --playwright /absolute/playwright/index.mjs \
  --out /absolute/isolated-evidence
```

它校验固定 SHA、用独立 loopback 端口和临时浏览器加载真实四份库，记录实际节点、缩放、折叠、6 回复、同文隔离、全屏、操作栏重建、内容刷新、20 次切换、迟到控制器、SPA/Stop、网络请求和截图。
只读断言与 fixture 驱动不能代替真实 ChatGPT、原生权限或安装验证。

**正式状态：Source → Build 已完成；Candidate / Verification / Available / Installed 未完成。**
源码或远端提交不代表用户 Mac 的日常 `dist/development`、Chrome 扩展身份或安装状态发生变化。
下一步首先补齐固定资源的许可/隔离准入，再沿原 Page Authority 完成同候选验证与安装；不恢复 SVG。

## R3 原生安装链新增核查（2026-10-15）

现有 Page Program 宿主已具备真实 Candidate / Verified / Available / Install / Disable，
但 R2.4 原生安装尚缺正式 XMind Runtime 准入。R3 增加通用 Page Program
`uninstallPageProgram`：受宿主身份、安装版本和授权代数 CAS 约束，先撤销持久自动
运行授权、旋转引导 token，再等待 Chrome `userScripts.unregister` 和
`getScripts` 对账，成功才删除安装记录；失败保留禁用的可重试记录。
工具管理页同时增加需显式确认的「卸载程序」。这不等于思维导图已经可安装。

**特别注意：** 禁用和卸载尚不能可靠销毁已注入且仍然打开的文档中的
USER_SCRIPT 全部回调，也未解决 Snowbrush 全局样式残留。UI 会明确提示刷新原网页。
卸载接口的组件测试只是 Native 模拟测试，必须进一步由真实 Chrome
验收撤销、刷新、BFCache 和权限移除。许可证和可信绘图文档没有审批前，
本程序仍须保持不可安装，不能把通用卸载功能视为 XMind Runtime 接线完成。

### 本轮专项 CI 证据

[GitHub Actions #38756274935](https://github.com/shopable-ai/opendesk-browser/actions/runs/38756274935)：
新增原生安装管理回归 `41/41 PASS`，原 XMind 源码回归
`17/17 PASS`；Chromium 原始 HTML 绘图 Job 通过。
但整次 RUN 因并行 SDK `browser-schemas.js:56` 语法损坏导致
`npm run check` 失败。不能据此认定本轮产品安装完成或主仓 CI 全绿。

**R3 最新 CI：** [#38757685815](https://github.com/shopable-ai/opendesk-browser/actions/runs/38757685815) 在并行 SDK 修复后两项 Job SUCCESS（原生管理 41/41、XMind 源码 17/17、Build 和 `npm run check` PASS）。这是独立 HTML 引擎与通用安装链的验证，不等于 ChatGPT 自动运行版正式通过。
