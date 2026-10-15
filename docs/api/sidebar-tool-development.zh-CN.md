# 扩展中心「应用」（Sidebar Tool）：统一开发规范与交付流程

> 面向「扩展」中的**应用**（底层 `opendesk.sidebar-tool.v1/v2`）开发者和 AI/Codex；当前产品入口见 [R4 产品规格](../product/sidebar-ui-spec.zh-CN.md)。本文是共用的**开发方法**，不是阅读目录、网页笔记或知识收件箱的产品说明。
>
> 接口查询：[Side Panel 工具 API](sidebar-tools.zh-CN.md)；示例导航：[工具项目索引](../../examples/sidebar-tools/README.zh-CN.md)；AI 规则：[opendesk-sidebar-tool-dev Skill](../../.agents/skills/opendesk-sidebar-tool-dev/SKILL.md)；仓库安全规则：[AGENTS.md](../../AGENTS.md)。
>
> **合同优先级**：`src/ui/sidebar-tools/package.js`、`src/ui/sidebar-tools.js`、`scripts/build-sidebar-tool.mjs` 和实际测试 > 本文。本文标记的“当前支持”是源码事实；“必须/建议”是工程规范，不能被当作已经实现的自动校验。

## 产品设计与对话预览关卡（新建/显著改造 UI 时适用）

此关卡与下文的 **stage / STAGED_NOT_INSTALLED 只读运行预览**是两件事：前者用无权限模拟数据评审信息架构，后者检查真实可安装包能否在隔离文档中只读运行。不能用任一个替代另一个；纯错误修复可依据影响范围省略重画原型，但不能省略相关回归。

1. **需求与分类**：明确用户实际操作场景、P0/P1、动态沙箱还是经审计的第一方可信功能；需要全量 Chrome 私人数据的需求不得直接给任意动态工具赋权。
2. **仓库事实核对**：读取 AGENTS、对应 Skill、现有 Host/SDK、[R27](../architecture/ui-layout-conventions-r27.zh-CN.md) 和 [R28](../architecture/sidebar-multi-section-tab-contract-r28.zh-CN.md)，列出可复用能力、缺口及写入文件所有权。
3. **信息架构与用户旅程**：先确定 Index → Detail / Form / Management / Confirm 的视图和空态、失败态、撤权态、返回路径；**独立工具页标题默认只有一个标题**，不要跟静态用途描述、重复面包屑；集合“＋ 新建”贴近集合标题。
4. **HTML 交互原型（强制设计产物）**：创建独立、可打开、无网络/无真实权限副作用的 HTML + 模拟数据；在**当前对话的上下文可视区域直接呈现**可交互预览（不仅提供链接），同时提供完整 HTML 文件；若当前客户端无法嵌入交互内容，要明确说明并给出可打开的 HTML，不能谎称已经显示。
5. **独立设计评分与修订**：功能、操作可发现性、信息层级、320/360/420px、可访问性、安全/隔离、模块解耦、测试覆盖分别记录；每项设计目标 ≥95/100，未达标返回原型修改。原型评分不得冒充原生 Chrome 产品通过。
6. **源码实施**：用户确认交互后进入真实代码，以既有 Host/权限/注册与生命周期最小增量实现；不为一个工具另建通用安装器或 Browser SDK。
7. **定向测试与实际预览**：Node、构建、包 SHA、只读 stage、权限/撤权/跨工具负例及窄屏/键盘；保留实测输出和失败。
8. **Chrome 原生验收**：固定当前候选身份，验证真实 UI、权限、数据/生命周期、安装/更新及边界；按 PASS/FAIL/BLOCKED/NOT_TESTED 单独报告，没有同候选证据不计入 95+ 结论。

此工作流对普通工具和第一方可信工具共用**设计评审步骤**；最终代码运行世界、安全准入与打包方式仍按各自 Skill 区分，不因此统一成一种不安全的动态 UI。

## 1. 先分清项目类型和开发路线

| 目标 | 推荐开发路线 | 打包和运行 | 特别限制 |
| --- | --- | --- | --- |
| 常规笔记、格式转换、Markdown、个人信息面板 | **轻量工具**：HTML + CSS + 经典 JS | `tool.config.json` → `build-sidebar-tool.mjs` → 由用户导入并打开 | 不需要每个工具再建 Chrome 扩展或后台运行器 |
| 有组件/复杂 UI 的工具 | **预编译工具**：React/Vue/可选 Tailwind | 先用 Vite 产出单个 IIFE JS + 静态 CSS，再走相同工具打包器 | 框架代码计入包预算；不能在 sandbox 直接运行 JSX/TSX/.vue/ESM |
| 要在网页里固定插入按钮、读取完整内容、控制站点 | **可信扩展增强**：工具 UI + 经审查的 Content Script/宿主服务 | 改 `src/` 可信代码、授权合同与独立测试；再构建整个扩展 | 不能只在 JSON 中声明一个能力就获得任意 DOM/Chrome/Native 权限 |
| 运行网页 USER_SCRIPT 或 Controller 自动化 | **不是这种工具包** | 阅读 [Page USER_SCRIPT](page-userscript.zh-CN.md) 或 [Controller](controller.zh-CN.md) | 不把 `.opendesk-task.json`、`package.json.opendesk` 与 `.opendesk-tool.json` 混用 |

**默认从轻量工具开始**；出现确切组件复用需要时再选 React/Vue。既有 Side Panel 的工具宿主、RunHost、权限、Native 通道与 Design System 不重新搭建第二套。

**当前选型决定（2026-10-14）：保留同仓库的 `examples/sidebar-tools/<id>/` 独立工具项目，不迁出为 `opendesk-tools` 仓库。** 用户界面与发行源码归各自项目；确需特权的 Background、Content Script 或可信 Side Panel 代码继续在已有 `src/<feature>/` 静态模块中，由固定入口编译接入。目录外观与真正耦合度不能混为一谈，先治理依赖方向，再考虑移动文件。

## 2. 共用目录与源码组织

```text
examples/sidebar-tools/<tool-id>/            # 独立工具项目；官方工具的真实可发行 UI 源
  tool.config.json                            # 唯一打包清单
  src/
    index.html                                # 工具主体 HTML 片段
    style.css                                 # 工具作用域样式
    main.js                                   # 经典浏览器脚本
  assets/                                     # 可选：PNG、JPEG、WebP
  README.md 或 README.zh-CN.md                # 给使用者看的安装/操作/限制
  DEVELOPMENT.zh-CN.md                       # 可选：工具有特殊开发链路时
  AGENTS.md                                   # 可选：工具专属 AI 约束

official-tools/catalog.json                 # 官方可信源码登记，无版本/能力副本
src/sidebar-tools/                          # 框架 bridge/sandbox/可信目录解析
.wxt/public/official-tools/                  # WXT 暂存生成资源
dist/{production,development}/official-tools/ # 最终固定 Catalog + 按 ID 分目录的工具 JSON
src/<feature>/                               # 确需时才有：静态审计的产品服务/权限/页面适配
tests/environment/<feature>.test.mjs          # 组件/打包/权限/存储负例
tests/framework/<feature>-native*.test.mjs    # 需要 Chrome 原生验收时

artifacts/sidebar-tools/<tool-id>/<version>/  # 默认打包输出，本机产物
examples/sidebar-tools/<id>/.opendesk-preview # 可选只读开发快照，本机产物
dist/production/、dist/development/           # 整个 Chrome 扩展构建产物
```

### 一个项目，多种执行环境（不是多个插件）

`examples/sidebar-tools/<id>/` 是项目归属，**不代表所有代码在同一 JS World 中执行**。普通工具只需要可安装的沙箱 UI；Stay Focus 这类工具还需要浏览器预编译能力：

| 环境 | 对应职责 | 边界 |
| --- | --- | --- |
| 工具 Sandbox UI | `examples/sidebar-tools/<id>/src/` 生成的安装包 UI | `OpenDeskTool.root/request`；opaque origin；不能直接用 `chrome.*` |
| 扩展 MV3 Background | `src/<feature>/service.js` 等，经既有 SW 固定引用 | Alarm/DNR/存储由可信代码执行；SW 非常驻，恢复必须读取持久状态 |
| ISOLATED Content Script | `src/<feature>/page*.js` 等，经原 `page-relay` 审核接入 | 只在获准站点/文档运行；不把消息当作授权 |
| MAIN 网页世界 | 默认无需创建 | 若确需网站原生 JS，复用现有 Page/SDK 世界合同；不能沿用后台/宿主全局对象 |
| 可信 Side Panel | `src/<feature>/tool-host.js`、`host-controls.js` 等静态模块 | 真实点击、权限申请、当前包 hash/epoch/真实 document 二次复核 |
| 扩展阻止页 | 固定 HTML/CSS/JS 资源 | 由 manifest/WAR 和正式打包器限定；不得插入动态工具 JS |

具体例子：`examples/sidebar-tools/stay-focus/` 是官方真实 UI 源；`src/stay-focus/` 是经过审计的专属后台/受信任产品模块，不应因为位于扩展 `src/` 就误判为必须迁出。已完成的最小职责整理见 [Stay Focus 源码说明](../../src/stay-focus/README.zh-CN.md) 和 [测试证据](../framework/workstreams/stay-focus-boundary-r1-20261014.md)。**本阶段保持这两个路径，不重写打包器、Catalog、Host、DNR 或 Chrome 权限**。

平台依赖只能向通用能力流动：`工具 UI → 既有沙箱消息桥 → 可信宿主/授权 → 静态产品服务 → Chrome`。平台可在明示的编译期接入点引用特定产品，但通用安装器、UI Host、Bridge 不应内嵌某个产品的业务算法、策略文案、私有状态/规则清理。特权源码即使被移到 `examples/` 也**不能动态从可安装包提升权限**；必须先进入受审计的固定扩展构建闭包。

什么时候才考虑独立仓库？当工具确实需要独立版本发布、被其他产品消费、或多团队长期维护，且已证明跨仓库构建输入、版本锁、回滚、CI、真实 Chrome 验收与本地开发体验不降低时再决定。仅为目录整齐而立即搬走会牵动当前 Catalog 的 `project` 路径、`build-official-tools.mjs` 的安全 realpath 检查、`build-contract.mjs` 固定入口和 Verify 闭包，属于不必要的迁移风险。

- `src/index.html` 是**HTML 片段**，不要写 `script`、`style`、`iframe`、`link`、内联 `on*=` 或自带另一个文档外壳；`src/style.css` 仅影响隔离工具界面，不向宿主注入 CSS。
- `src/main.js` 中通过 `globalThis.OpenDeskTool` 获取 `root`、`request`。事件只绑定到自己的 `root`，使用 `textContent` 渲染未经信任的用户内容；不要假定能访问浏览器扩展全局 `chrome`。
- 共用的 `docs/api/` 不放某一个工具的业务指南；示例实现留在它自己的项目目录。工具包 JSON 是**构建结果**，不应成为手工维护的巨型源码文件。
- 官方候选在 `official-tools/catalog.json` 登记可信项目，构建复用现有打包器确定性生成发行清单、包大小和 SHA-256；不在源码目录维护生成 JSON。普通作者使用相同打包器分发经审阅的独立包，不需要进入官方目录。见 [官方 Catalog](official-tools-catalog.zh-CN.md)。
- 已有 React/Vue 项目示例见 [react-starter](../../examples/sidebar-tools/react-starter/README.md)、[vue-starter](../../examples/sidebar-tools/vue-starter/README.md)，它们的 `tool.config.json.files` 指向本地编译完成的 `dist/tool.js` 与 `dist/tool.css`。

## 3. 标准配置、版本和静态资源

最小 `tool.config.json`：

```json
{
  "id": "sample-notes",
  "version": "1.0.0",
  "title": "示例笔记",
  "description": "按用户操作保存个人笔记。",
  "capabilities": ["storage.local"],
  "files": {
    "html": "src/index.html",
    "css": "src/style.css",
    "js": "src/main.js"
  },
  "assets": []
}
```

- `id` 必须匹配源码中的 `^[a-z][a-z0-9-]{1,39}$`，发布后保持稳定；更改 ID 会形成另一个工具及数据命名空间。
- `version` 使用非负整数的 `major.minor.patch`（例如 `1.0.1`，不能带 `v`、预发布标签）；更新用户可见功能/权限/数据结构时明确升级版本、审查兼容性。版本号与代码哈希是不同维度。
- `title/description/capabilities/files/assets` 属于 **tool.config.json 源清单**；最终打包文件只包含 `format/id/version/title/description/capabilities/html/css/js`。不要给严格 JSON 加 `permissions`、`native`、`packageUrl`、`marketId` 等未实现的字段。
- `files` 的三个源路径均为项目根下的相对路径。打包器会检查路径穿越和软链接越界；`assets` 最多 16 个、每张不超过 96 KiB，允许 PNG/JPEG/WebP。通过 `{{asset:assets/icon.png}}` 引用，打包器嵌为 `data:` URL；不是 HTTP/CDN 资源。
- 当前合同：最终包最大 **320,000 UTF-8 字节**；HTML ≤64,000、CSS ≤120,000、JS ≤220,000 **字符**，打包器对输入源码还有字节预算。最多同时安装 12 个工具。以代码实时限制为准，不能为了通过校验任意放大预算。
- 改代码但不改变版本时可以生成不同的**开发快照**；正式安装/更新时要明确审查新包字节、所申请能力和升级策略，不把“相同版本”当“已审批”。

## 4. 唯一编程入口与能力规则

```javascript
(() => {
  'use strict';
  const {root,request} = globalThis.OpenDeskTool;
  const input = root.querySelector('#my-note');
  const save = root.querySelector('#my-save');
  const status = root.querySelector('#my-status');
  save.addEventListener('click', async () => {
    save.disabled = true;
    try {
      const old = await request('storage.get', {key:'note',withEtag:true});
      await request('storage.set', {
        key:'note', value:input.value, ifMatch:old.etag
      });
      status.textContent = '已保存';
    } catch (error) {
      status.textContent = '保存失败：' + String(error.message || error);
    } finally {
      save.disabled = false;
    }
  });
})();
```

配套 HTML 片段需包含 `#my-note`、`#my-save`、`#my-status`，并有 `label` 和 `role="status"`/`aria-live`。此示例只申请 `storage.local`；乐观并发 `ifMatch` 可以防止旧窗口覆写更新后的值。操作返回 Promise，必须处理拒绝、关闭或会话过期，不假定请求一定成功。

**普通工具可按实际需求申请的基础能力**：

| 工具声明 capability | 对应 request 操作 | 精确边界 |
| --- | --- | --- |
| `storage.local` | `storage.get`、`storage.set` | 工具 ID 专属存储，单项 JSON ≤8,192 bytes、最多 32 键、总 JSON ≤32,768 bytes；支持条件写入 `withEtag/ifMatch` |
| `currentPage.read` | `currentPage.info` | 当前可信目标的普通网页标题与 URL；不返回 DOM、Cookie、完整正文 |
| `tasks.open` | `tasks.open` | 导航到已安装且已启用任务的 UI；不等于启动任务 |
| `user.export` | `clipboard.writeText`、`file.download` | 用户操作后复制或下载纯文本；上限 150 KB，文件名仅允许安全的 `.md` / `.txt` / `.json`；浏览器可能拒绝剪贴板 |

**仅在已有官方可信服务存在、并取得额外授权时才可用的专项能力**：`page.toc`（目录服务）、`page.clip`（文章/选区剪藏）、`page.capture` 与 `knowledge.store`（知识收件箱官方专用）。这些名字即使在 schema 允许列表中，也**不代表第三方小工具可获得任意网页访问、后台调用、任意 Native 文件写入或通用数据采集**。扩展新 capability 需要先实现受信宿主、精确消息合同、用户批准、撤权和负向测试，不靠文档或 JSON 声明虚构运行能力。

所有工具都不能直接调用 `chrome.tabs`、`chrome.storage`、任意 Native Host、跨站 HTTP 代理或在网页中注入远端 JS。运行环境是 opaque-origin 沙箱，消息由可信宿主复核当前 iframe、session、工具包和权限。**安装 ≠ 打开 ≠ 当前网站已授权 ≠ 在后台持续运行**。

**Skill 路由（实施分工）**：独立工具的 UI/业务源码、交互设计与只读预览归 `.agents/skills/opendesk-sidebar-tool-dev/SKILL.md`；可导入 JSON、随目录构建副本、正式离线资源、版本/摘要及本地安装更新验收归 `.agents/skills/opendesk-sidebar-tool-package/SKILL.md`。两者共用下面的既有打包器和权限/安装服务，**不是两套构建实现**。线上第三方作者上传/审核/上架尚未实现，仅保留 `.agents/skills/opendesk-marketplace-publish/RESERVED.md`，不视为已经有市场发布 API。

## 5. 三种开发循环，避免每次都重编整个扩展

### A. 简单 HTML/CSS/JS 工具：最快的默认路线

在仓库根目录操作，并核对 `git status --short --branch` 及已有构建/Chrome 资源占用：

```sh
npm ci --ignore-scripts --no-audit --no-fund

# 打包当前工具；打印实际 output / bytes / version / installed:false
npm run build:sidebar-tool -- examples/sidebar-tools/<tool-id>

# 或明确选择临时导入包路径，便于审阅
node scripts/build-sidebar-tool.mjs \
  examples/sidebar-tools/<tool-id> \
  --out artifacts/sidebar-tools/review/<tool-id>.opendesk-tool.json
```

输出的 `artifacts/sidebar-tools/<id>/<version>/<id>.opendesk-tool.json` 是**用户可导入的工具包**。已有可用 OpenDesk 扩展时，Side Panel「扩展 → 更多操作 → 导入本地工具包」选择此 JSON → 阅读权限 → **确认安装/更新** → **主动打开**。常规独立工具修改无需重编整个扩展，但**每次安装/更新仍需用户确认**。注意这与修改扩展自身 `src/` 的工作流不同。

**可选：把已经构建好的安装包放在工具目录中。** 对希望其他开发者无需安装 Node.js 就能导入的工具，可提交 `examples/sidebar-tools/<id>/<id>.opendesk-tool.json`。只要它已经是常规文件，不带 `--out` 的默认打包命令就会从**同一份源码**同步刷新它，并继续输出到 `artifacts/`；未选择此方式的工具没有额外生成文件。首次生成可用 `npm run build:sidebar-tool -- examples/sidebar-tools/<id> --out examples/sidebar-tools/<id>/<id>.opendesk-tool.json`。显式 `--out` 只生成指定路径。维护这种预生成包时，添加测试逐字节比较 `serializeSidebarToolPackage(await createSidebarToolPackage(project))` 和发布文件，防止过期。**它是构建快照，不是第二份可编辑源码，也不等于已安装/授权。**

### B. 本地只读预览：改得勤但暂不安装

```sh
node scripts/stage-sidebar-tool.mjs examples/sidebar-tools/<tool-id>
# 报告 status: STAGED_NOT_INSTALLED
# 生成 .opendesk-preview/<id>/<sha256>.opendesk-tool.json
# 也生成受信 Native 读取用的分块快照 / latest.json
```

已连接相应本地 Workspace/Native 的情况下，用户仍须**明确点击「只读预览工具」**才能在受控 iframe 中预览。只读预览使用模拟读取，不允许真实存储写入、打开任务或控制网页，且**即使 ID 与已安装工具相同也不继承权限**。`STAGED_NOT_INSTALLED` 不代表“已经安装”或“已在页面自动运行”。

```sh
# 前台监听有变化的、已完成的源码快照；不会自行执行 npm 或安装工具
node scripts/watch-sidebar-tool.mjs examples/sidebar-tools/<tool-id>
```

### C. React / Vue / Tailwind：先编译，后共用打包器

首次使用 [react-starter](../../examples/sidebar-tools/react-starter/README.md) / [vue-starter](../../examples/sidebar-tools/vue-starter/README.md)，在模板自身目录执行 `npm install --ignore-scripts --no-audit --no-fund` 创建/审查 `package-lock.json`，后续用 `npm ci`。执行 `npm run build` 生成完整的本地 IIFE/CSS，再执行 `node ../../../scripts/stage-sidebar-tool.mjs "$PWD"` 产生快照。需正式导入时可用共用 `build-sidebar-tool.mjs` 打包；**它不负责 JSX/TSX/.vue 编译**。

频繁迭代可分别启动两个显式终端：

```sh
# 模板项目目录，终端一：Vite 编译
npm run build:watch

# 模板项目目录，终端二：仅检查已经发布的 build-ready.json + 源码指纹
node ../../../scripts/watch-sidebar-tool.mjs "$PWD"
```

`dist/build-ready.json` 的 `buildId`、JS/CSS SHA 和字节数与上次成功构建相符后，stage 才接受编译结果。watcher 不触发 npm、不会自动装到 Chrome、不会给网页增权；编译失败保留上一份快照。不要写一个不停重跑 `vite build --watch && pack` 或自动安装的“热更新”脚本。

### D. 官方可选工具 / 可信宿主修改：完整扩展链路

维护 `examples/sidebar-tools/<id>/` 中的配置、源码和声明图片；新官方候选在根目录 Catalog 登记，已有工具内容更新不必修改 UI 或资源路径映射。

```sh
# 可选：单独检查官方生成结果，不安装
node scripts/build-official-tools.mjs --out artifacts/official-tools-release
npm run check
npm run build
npm run build:dev
npm run verify
```

`prepare-public.mjs` 自动生成 `.wxt/public/official-tools/...`；最终包位于 `dist/production/official-tools/...` 或 `dist/development/official-tools/...`，目录、源码、大小和摘要必须一致。Chrome 加载整个 `dist/production/`；工具列表的官方入口按需读取 JSON，再经用户审核确认安装/更新。

持续开发复用 [扩展增量开发指南](../framework/extension-development-r131.zh-CN.md) 的 `npm run dev`，保存声明源码可重新生成资源；完整 Catalog 结构变化会刷新 WXT 资源清单。新资源不会自动替换用户安装的旧包、启动脚本或增加网站许可。不允许两个 Agent 抢占同一份 dist、Chrome Profile 或构建进程。

## 6. 统一 UI/UX 与代码质量规范

**推荐标准，不表示现有框架替你自动实现**：

- **信息架构**：单一主操作，必要的次级操作；标题/表单/反馈/内容分区明确；避免重复标题、重复状态文本和密集按钮。宿主已有返回/工具标题时，工具不要再复制一套宿主导航。
- **紧凑一致**：优先复用项目现有语义、圆角、间距、字体等级与浅色/深色方案；但沙箱 CSS 不自动继承宿主样式，需在工具自己的 CSS 显式定义统一 token 或使用本地构建出的静态样式。不新建第三套共享设计系统。
- **尺寸**：在侧栏约 360/400/600 CSS px 和窄屏/滚动、200% 缩放条件测试；不可依赖固定宽度。Chrome 的实际最小侧栏宽度以实测为准，不能声称所有设备能达到 320px。
- **无障碍**：表单 `label`，图标按钮 `aria-label`，键盘焦点/Enter/Escape，动态状态 `role=status`，足够对比度，不仅凭颜色表示状态；加载中、错误、无数据、权限不足、只读预览、保存成功都需明确反馈。
- **数据与性能**：不反复对整页做昂贵扫描，不在主工具 iframe 里执行持续后台任务；页面监听、定时器、Observer 应有销毁策略。处理长文本、超额/并发冲突时给错误和恢复路径，不静默截断或覆盖。
- **安全**：页面内容通过 `textContent` 或明确净化的数据模型展示；不要把不可信 HTML 直接插入。不能借助 DOM 字符串过滤代替真实 CSP、授权与消息校验。
- **依赖**：普通工具优先零运行时依赖。React/Vue/第三方库必须锁定版本、本地编译、遵守许可证与包预算；不假定宿主提供 React、Tailwind 或 CDN。

## 6A. 可安装工具的信息架构与交互基线（知识收件箱 R24 验证经验）

适用于 quick-notes、reading-toc、web-markdown-clipper、markdown-workbench 及 React/Vue 预编译工具；这是共用设计规则，**不是**第三套组件框架，也不会使普通工具获得宿主权限。

- **先内容后操作**：列表优先标题、摘要、状态与更新时间，搜索和常用筛选位于同一清晰区域；备份、删除等低频/危险动作使用次级入口。工具 iframe 不重复宿主已有的页级导航和标识。
- **阅读与编辑分离**：默认阅读内容；点击编辑才显示表单。保存按钮由与已提交值比较的 dirty 状态控制，不能仅因进入编辑模式而标记已修改。保留取消与修订冲突反馈。
- **安全内容展示**：用户 Markdown/网页正文为不可信文本。使用文本节点构建标题、列表、代码、引用等；不能将未经信任的文本赋给 innerHTML，不得自动执行 Markdown 内 HTML、远程脚本或加载远程图片。超长文档可以完整显示为纯文本回退，不得静默截断。
- **状态不占屏**：加载、空收件箱、搜索无结果、保存中/失败/成功、删除确认分别建模；成功反馈短暂出现，失败反馈保留；不要用常驻信息条代替主内容。
- **窄屏与宽布局共用语义**：360/400/600px 和独立标签页需检查按钮换行、筛选横向滚动、代码块独立横向滚动与正文的可读宽度。不得用外层整体横向滚动隐藏布局问题。
- **隔离样式映射**：在工具 CSS 内映射与宿主 R20/R21 相同的间距、圆角、焦点、字体与明暗语义；sandbox iframe 不会自动继承宿主 CSS 变量。不引入大体积 UI 依赖来解决少量局部控件。
- **焦点与数据安全**：列表打开详情、编辑切换、确认框关闭后，应合理恢复焦点；支持 Escape 与 Ctrl/Cmd+S，宿主 dirty 状态通知必须避免响应乱序。删除和覆盖仍通过已有权限/修订合同验证，不能用 UI 判断代替受信任服务校验。
- **原生键盘浏览**：记录列表用真正的 button/link 表达操作，保留 Tab 顺序与 Enter 激活；只有焦点处于列表项时才截获 ↑/↓、Home/End，不能抢占输入框、下拉选项或页面级快捷键。打开详情后焦点移至内容标题，返回列表后恢复原记录焦点；使用可被读屏读取、视觉上不占空间的快捷键说明。
- **逐层退出与聚焦可见**：Esc 优先关闭当前菜单、结构大纲或对话框；退出未保存编辑须走同一丢弃确认，普通阅读态才返回列表。不要以无条件 :focus{outline:none} 覆盖标题和控件的 :focus-visible；在 360px 宽屏和缩放后验证焦点始终可见。
- **验收证据**：至少以两条真实保存的记录触发 ↑/↓/Home/End/Enter/Esc，复核焦点恢复及拒绝丢弃编辑；网站授权撤销之后已保存的记录必须保留。Headless HTML 预览、受控 Chrome 扩展和用户真实站点/200% 缩放分别报告，不互相替代。
- **真实验收分级**：先检查工具源码与生成包一致、环境组件/安全负例；再用真实 Chrome 安装扩展、操控 sandbox iframe、检查 360/400/600px 明暗截图；实际在线 ChatGPT、macOS Native 文件落盘与系统剪贴板另列，不因 CFT 受控页面 PASS 冒充正式通过。

具体参考 examples/sidebar-tools/knowledge-inbox/src/ 与 tests/framework/knowledge-inbox-native-r1.test.mjs；其他工具只有在出现相同缺口时才按需迁移，不批量重写。

## 7. 最小测试矩阵与验收门槛

| 层级 | 每个工具至少覆盖 | 何时做 |
| --- | --- | --- |
| 合同与打包 | 有效/无效 config，未知 capability，恶意 HTML/CSS，路径逃逸，体积边界、无远端执行 | 新建、升级、加图片/依赖 |
| UI 与状态 | 首次打开、空列表/加载中/报错、保存及回读、切换/重开、键盘和窄屏、暗色主题 | 每次 UI 更改 |
| 权限与生命周期 | 导入不执行、确认安装不自动打开、预览不写入、撤权/更新/卸载、旧会话不能写新窗口 | 每次能力、宿主或持久化变更 |
| 受控 Chrome | 安装真实 JSON、交互事件、独立标签页差异、刷新/站点切换、权限拒绝、重复打开 | 需要浏览器证据时 |
| 真人网站和 Native | 真实目标站点、用户 Mac/系统权限、下载落盘、Native 文件创建及读回 | 只在具备真实环境时单独验收 |

基础命令（按本次修改选定定向测试，不捏造全量结果）：

```sh
npm run check
node --test tests/environment/sidebar-tools.test.mjs \
  tests/environment/sidebar-tools-host.test.mjs
# 需要覆盖全部源码回归时：
npm test
# 仅需验证单一 production 构建：
npm run build
node scripts/verify-package.mjs dist/production
# 需要双环境验证：
npm run build:dev
npm run verify
# 可选：完整扩展 ZIP
npm run pack
```

明确区分 `PASS / FAIL / BLOCKED / NOT_TESTED`；记录候选 commit、包 SHA-256、Chrome/OS、实际安装路径、权限和截图/日志。`STAGED_NOT_INSTALLED`、Node 单测成功、CI 受控 DOM 浏览器通过、生产打包成功，均**不能**自动升级成真实网站、Native 文件写盘或完整产品 F3/ZIP 验收。

## 8. 文档分层与交付清单（人看 / AI 看）

| 文档职责 | 规范位置 | 内容 |
| --- | --- | --- |
| **统一开发方法（人）** | `docs/api/sidebar-tool-development.zh-CN.md`（本文件） | 所有同类工具的开发循环、项目结构和验收 |
| **统一接口参考（人/AI）** | `docs/api/sidebar-tools.zh-CN.md` | schema、操作名、权限、边界；按源码维护 |
| **具体工具的用户手册（人）** | `examples/sidebar-tools/<id>/README[.zh-CN].md` | 安装、用法、支持/不支持 |
| **特殊工具补充说明（人）** | `examples/sidebar-tools/<id>/DEVELOPMENT.zh-CN.md`（按需） | 仅写与统一规范不同的可信逻辑/迁移/测试 |
| **仓库/工具 AI 限制（AI）** | 根 `AGENTS.md`、可选工具目录 `AGENTS.md` | Agent 只读/可写职责和禁止事项 |
| **复用执行流程（AI）** | `.agents/skills/opendesk-sidebar-tool-dev/SKILL.md` | 按任务类型选择修改、打包、测试、报告 |
| **需求与业务路线（人）** | `docs/product/` | 用户故事、产品优先级、未实施需求 |
| **工程验收与原始证据** | `docs/framework/workstreams/`、`evidence/` | 候选 SHA、包身份、原始日志和限制 |

**交付必须自检**：源码能单独维护；所生成 JSON 与授权声明一致；默认预览不执行写入；手动导入能审查并确认；官方发行由 Catalog 从可信源码生成并验证；UI 可访问/可用；权限/撤权/数据保留符合设计；测试结果及未测边界有证据；不修改无关工具或重建工具框架。

本规范不定义未来应用市场的远程安装协议，也不宣称公网安装交接、个人内容迁移、远端组件热更新、通用 Native 文件 API 已实现。这些独立于现有 `opendesk.sidebar-tool.v1` 的本地开发与导入闭环。

## R25.1：与本地开发选项卡的交付关系

Side Panel 工具继续以 `opendesk.sidebar-tool.v1` 包交付，使用现有打包校验、共享安装器和工具数据空间。**不要把运行成功的 Page USER_SCRIPT 或 Controller 代码直接包装成 Side Panel 工具 JSON**；它们已有独立冻结/授权/安装合同。开发选项卡「本地项目」的保存按钮仅对支持的 `page-userscript`、`controller` 项目开放，在按各自 Authority 完成正式安装后，分别于「扩展」统一列表中以「网页增强」标签管理，以及在「我的 → 已安装任务」管理；仅保存源码不等于安装完成。独立的 Side Panel 本地包应按照本文项目构建、审阅并安装，不存在自动转换器。在线市场上传、作者身份、草稿和版本托管接口尚未交付，不要在 UI 或文档宣称发布成功。
