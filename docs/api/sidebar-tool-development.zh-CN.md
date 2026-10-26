# 扩展中心「应用」（Sidebar Tool）：统一开发规范与交付流程

> 面向「扩展」中的**应用**（底层 `opendesk.sidebar-tool.v1/v2`）开发者和 AI/Codex；当前产品入口见 [R4 产品规格](../product/sidebar-ui-spec.zh-CN.md)。本文是共用的**开发方法**，不是阅读目录、网页笔记或知识收件箱的产品说明。
>
> 接口查询：[Side Panel 工具 API](sidebar-tools.zh-CN.md)；示例导航：[工具项目索引](../../examples/sidebar-tools/README.zh-CN.md)；AI 规则：[opendesk-sidebar-tool-dev Skill](../../.agents/skills/opendesk-sidebar-tool-dev/SKILL.md)；仓库安全规则：[AGENTS.md](../../AGENTS.md)。
>
> **零技术用户的上游入口**：新建工具且需求尚未明确时，按[自然语言扩展开发工作流：需求推理与功能树先行](../../.agents/workflows/extension-creation.md)恢复/明确场景、功能树与需求关卡；已有工具的明确修复沿用已批准决定，不重走全部设计与验收。只进入当前任务需要的阶段，不新增另一套运行时或并列规范。
>
> **公开 SDK 优先**：第三方开发只需本开发规范、公开 API、配置示例与工具自身项目，不需要读取宿主 `src/`。平台维护者才按可复现缺口核对内部 Host/打包实现；文档列出的能力不等于已经获得用户安装/网站授权。

## 产品设计与对话预览关卡（新建/显著改造 UI 时适用）

按 [AGENTS.md 的开发阶段规则](../../AGENTS.md#开发阶段先完成核心需求与最小验证用户于2026-10-17明确)先完成当前核心功能。以下为现有各阶段的适用说明，不是每次依次完成的八步清单：用户要求设计预览或交互尚需明确时才做原型；完整矩阵、正式验收和独立评分仅由当前明确要求或适用正式交付合同触发。用户调整阶段后，不以旧 GOAL、计划或历史清单延续原完成条件。

**统一 HTML 起点**：对话原型优先使用 [离线预览套件](sidebar-preview-kit.zh-CN.md)，从当前 canonical token/组件生成 HTML、网页提示词和源 SHA；将真实附件内容交给网页模型，再检查返回文件。只说“遵守仓库 skill”不能替代上下文传递。模板属于独立设计文档，不把宿主 CSS 注入运行时工具 iframe。

此关卡与下文的 **stage / STAGED_NOT_INSTALLED 只读运行预览**是两件事：前者用无权限模拟数据评审信息架构，后者检查真实可安装包能否在隔离文档中只读运行。不能用任一个替代另一个；纯错误修复可依据影响范围省略重画原型，但不能省略相关回归。

1. **需求与分类**：明确用户实际操作场景、P0/P1、动态沙箱还是经审计的第一方可信功能；需要全量 Chrome 私人数据的需求不得直接给任意动态工具赋权。
2. **独立项目事实核对**：优先读取 AGENTS、对应 Skill、公开 SDK 与当前工具源码；只有已证实的通用平台缺口才由平台维护者检查 Host。界面规范可查 [R27](../architecture/ui-layout-conventions-r27.zh-CN.md) 和 [R28](../architecture/sidebar-multi-section-tab-contract-r28.zh-CN.md)，列出可复用能力、缺口及写入文件所有权。
3. **信息架构与用户旅程**：先确定 Index → Detail / Form / Management / Confirm 的视图和空态、失败态、撤权态、返回路径；**独立工具页标题默认只有一个标题**，不要跟静态用途描述、重复面包屑；集合“＋ 新建”贴近集合标题。
4. **需要交互原型时**：创建独立、可打开、无网络/无真实权限副作用的 HTML + 模拟数据；在客户端支持时直接呈现可交互预览，同时提供完整 HTML 文件。不支持嵌入时说明限制，不谎称已经显示；已有明确需求的修复不以重画原型为前置条件。
5. **要求独立设计评分时**：按当前要求/正式合同选择功能、可发现性、层级、可访问性、安全/隔离、解耦与验证等维度；适用 ≥95/100 目标时仍逐项达标，未达标修订。宽度/缩放专项须用户针对当前任务明确要求；原型评分不得冒充原生 Chrome 产品通过。普通开发不启动评分。
6. **源码实施**：交互要求明确后以既有 Host/权限/注册与生命周期最小增量实现；沿用已批准设计，不额外要求重复确认，不另建通用安装器或 Browser SDK。
7. **开发验证与按需预览**：修复核心操作后，选择能证明本次改动的定向检查和必要正常流程；安全相关改动保留受影响的权限/CSP/来源/身份/撤权/未知副作用及跨工具负例。需要编译、包或预览证据时才做对应产物检查/stage，不将 Node、构建、包和浏览器串成固定链。
8. **进入正式 Chrome 验收时**：按当前明确要求/适用合同固定候选身份，验证真实 UI、权限、数据/生命周期、安装/更新与边界。开发中确需浏览器证明的核心操作只做相关场景，不扩大成完整验收；按 PASS/FAIL/BLOCKED/NOT_TESTED 单独报告，无同候选证据不计入 95+ 结论。

普通工具和第一方可信工具需要设计评审时，复用上述适用步骤；最终运行世界、安全准入与打包方式仍按各自 Skill 区分，不因此统一成一种不安全的动态 UI，也不要求既有明确缺陷重走设计。

## 1. 先分清项目类型和开发路线

**还没确定要做 Side Panel 应用、网页增强、自动化还是混合功能？** 先看 [普通开发者的四类需求选择与多 JS 分工](extension-development-selection.zh-CN.md)。本规范只负责明确选择 Sidebar Tool 后的具体实现与打包；组合式扩展需要按实际运行位置拆分职责，不能由一个 JSON 自动取得任意后台权限。

| 目标 | 推荐开发路线 | 打包和运行 | 特别限制 |
| --- | --- | --- | --- |
| 常规笔记、格式转换、Markdown、个人信息面板 | **轻量工具**：HTML + CSS + 经典 JS | `tool.config.json` → `build-sidebar-tool.mjs` → 由用户导入并打开 | 不需要每个工具再建 Chrome 扩展或后台运行器 |
| 有组件/复杂 UI 的工具 | **预编译工具**：React/Vue/可选 Tailwind | 先用项目构建产出 IIFE JS + 静态 CSS，再走相同工具打包器；可显式选择已支持的 Shared UI | 自带依赖计入包预算；选择固定 `uiRuntime` 时按其外部依赖合同构建，不能在 sandbox 直接运行 JSX/TSX/.vue/ESM |
| 在网页插入按钮、访问 DOM、添加 React/Vue UI | **Page USER_SCRIPT / Page Program**，见 [公开规范](page-userscript.zh-CN.md) | `examples/programs/<id>/`；独立 Page 安装/权限合同 | 不把网页增强误当 Sidebar Tool，不默认修改 Host |
| 已确认为第一方可信特权功能 | **可信扩展增强**：经审查的固定 Content/后台或 Side Panel 功能 | 专属业务优先归已有项目 `trusted/`，或保留有必要职责的 `src/<feature>/`；固定入口审计、定向测试并重建整个扩展 | 普通第三方不能靠 JSON 声明获得任意 Chrome/Native 权限 |
| 运行网页 USER_SCRIPT 或 Controller 自动化 | **不是这种工具包** | 阅读 [Page USER_SCRIPT](page-userscript.zh-CN.md) 或 [Controller](controller.zh-CN.md) | 不把 `.opendesk-task.json`、`package.json.opendesk` 与 `.opendesk-tool.json` 混用 |

**默认从轻量工具开始**；出现确切组件复用需要时再选 React/Vue。既有 Side Panel 的工具宿主、RunHost、权限、Native 通道与 Design System 不重新搭建第二套。

**当前选型决定（2026-10-14）：保留同仓库的 `examples/sidebar-tools/<id>/` 独立工具项目，不迁出为 `opendesk-tools` 仓库。** 用户界面与发行源码归各自项目；经审计的第一方特权业务可以同项目独立保存于 `trusted/`，由已有 `src/entrypoints/` 和 `src/sw.js` 的固定入口预编译接入。尚未迁移且确需特权的业务仍可在 `src/<feature>/`，但通用 Host 不应拥有产品策略。目录外观与真正耦合度不能混为一谈，先治理依赖方向，再考虑移动文件。

**已有正式工具身份优先**：Prompt Shortcuts 已是 `examples/sidebar-tools/prompt-shortcuts/` 中的 `opendesk.sidebar-tool.v2`，同时复用现有 `trusted/page.js`、公开 [Browser SDK v2](browser-sdk.zh-CN.md) 和安装许可。为该工具增加其他网站双选择器应优先修改原业务目录与受审现有适配器，**不能仅因网页上显示按钮便自动迁移为 Page Program**；全新网页增强仍应优先判断 Page USER_SCRIPT。Cookie Editor/Bookmark Manager 也使用已审阅的 v2 工具与各自受控能力，不应因为要 React 重排就修改通用 Host/安装器。

**普通第三方最短流程（不读取内部 `src/`）**：确认真正需要的是 Sidebar Tool 而非 Page USER_SCRIPT → 创建 `examples/sidebar-tools/<id>/tool.config.json` 和自己的 `src/` → 按 [公开 API](sidebar-tools.zh-CN.md) 选择实际支持的 `OpenDeskTool.request` → 使用下文唯一打包器生成忽略目录临时候选 → 定向验证 → 显式晋升同源正式 JSON → 用户审阅安装/更新。Schema 中存在名称不等于通用权限；没有公开能力时保留复现，记 `SDK_GAP_NOT_PROVEN` 或对无法安全授权的操作记 `BLOCKED`，不能增加私有 Host API。

## 2. 共用目录与源码组织

```text
examples/sidebar-tools/<tool-id>/            # 独立工具项目；官方工具的真实可发行 UI 源
  tool.config.json                            # 唯一打包清单
  <tool-id>.opendesk-tool.json                # 仅已通过候选验收并交付的工具保留一份正式安装包
  src/
    index.html                                # 工具主体 HTML 片段
    style.css                                 # 工具作用域样式
    main.js                                   # 经典浏览器脚本
    background.js                             # 可选 v2 App Service 源码，由 files.background 选择，与 UI 独立
  assets/                                     # 可选：PNG、JPEG、WebP
  README.md 或 README.zh-CN.md                # 给使用者看的安装/操作/限制
  DEVELOPMENT.zh-CN.md                       # 可选：工具有特殊开发链路时
  AGENTS.md                                   # 可选：工具专属 AI 约束

official-tools/catalog.json                 # 官方可信源码登记，无版本/能力副本
src/sidebar-tools/                          # 框架 bridge/sandbox/可信目录解析
.wxt/public/official-tools/                  # WXT 暂存生成资源
dist/{production,development}/official-tools/ # 最终固定 Catalog + 按 ID 分目录的工具 JSON
examples/sidebar-tools/<id>/trusted/          # 受审业务源码；入口决定权限，纯模型可被明确选入沙箱
src/<feature>/                               # 兼容转发或尚未提取的必要受信产品服务
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
| 扩展 MV3 Background | 独立项目 `trusted/service.js` 或 `src/<feature>/service.js`，经既有 SW 固定引用 | Alarm/DNR/存储由可信代码执行；SW 非常驻，恢复必须读取持久状态 |
| ISOLATED Content Script | 独立项目 `trusted/page*.js` 或 `src/<feature>/page*.js`，经原 `page-relay` 审核接入 | 只在获准站点/文档运行；不把消息当作授权 |
| MAIN 网页世界 | 默认无需创建 | 若确需网站原生 JS，复用现有 Page/SDK 世界合同；不能沿用后台/宿主全局对象 |
| 可信 Side Panel | 独立项目 `trusted/tool-host.js` / `host-controls.js` 或 `src/<feature>/` 静态模块 | 真实点击、权限申请、当前包 hash/epoch/真实 document 二次复核 |
| 扩展阻止页 | 固定 HTML/CSS/JS 资源 | 由 manifest/WAR 和正式打包器限定；不得插入动态工具 JS |

具体例子：Stay Focus 已在 R2 将唯一受信业务源码抽至 `examples/sidebar-tools/stay-focus/trusted/`，可安装沙箱 UI 则位于同项目 `src/`；旧 `src/stay-focus/*.js` 只做兼容转发。AdBlock 已在自身项目 `trusted/` 维护可信后台；Time Review 仍由 `src/time-review/` 承担必要计时业务、独立项目保留 UI。参阅 [Stay Focus R2 提取记录](../framework/workstreams/stay-focus-extraction-r2-20261018.md)；对尚未提取的工具应按消费者逐项判断，**不借“独立”直接把 JSON 包脚本提升为 Background 或 Content Script**。

**复用模块不共享权限或内存。** `files` 明确选择包字节；当前 v2 支持最多 8 个有序且不重复的 Classic `files.dependencies`，构建时保留为包内固定 scripts，运行时按声明顺序在主 JS 前加载，不是扫描目录或任意 import loader。[Prompt Shortcuts](../../examples/sidebar-tools/prompt-shortcuts/tool.config.json) 实际选择 `trusted/model.js` 进入沙箱，其固定网页入口也导入该模型。目录名不产生特权，两个环境是独立实例；只升级 JSON 不更新已编译的网页副本，需保持数据合同兼容。

**打开、关闭、停用与卸载要分开设计。** 打开工具创建 UI 实例；文档卸载清理自己的 Root/监听/定时器；重开从获准存储恢复。关闭 UI 不会回滚已提交的 Cookie 操作或后台规则。可信后台通过 Chrome 事件和持久状态继续工作，停用/卸载按产品自身生命周期撤销规则并分别决定保留/删除数据；不能要求 iframe 常驻。Stay Focus 的实际五种停止操作及 JSON/固定后台升级边界见 [选型指南](extension-development-selection.zh-CN.md)，不在本规范复制产品细则。

**复杂 UI 仍归工具自己的文档。** 当前 AdBlock 已使用 `uiRuntime: "opendesk.react-ui.v1"`、独立 `src/App.jsx` 和固定 Shared UI，在沙箱中创建自己的 React Root；这不违背主工作台文档的单 Root 约束。工具组件、业务模型不能为了共享 React 就导入主工作台。是否使用固定 runtime 必须看具体配置，不能把任意宿主库当成默认全局。

平台依赖只能向通用能力流动：`工具 UI → 既有沙箱消息桥 → 可信宿主/授权 → 静态产品服务 → Chrome`。平台可在明示的编译期接入点引用特定产品，但通用安装器、UI Host、Bridge 不应内嵌某个产品的业务算法、策略文案、私有状态/规则清理。特权源码即使被移到 `examples/` 也**不能动态从可安装包提升权限**；必须先进入受审计的固定扩展构建闭包。

什么时候才考虑独立仓库？当工具确实需要独立版本发布、被其他产品消费、或多团队长期维护，且已证明跨仓库构建输入、版本锁、回滚、CI、真实 Chrome 验收与本地开发体验不降低时再决定。仅为目录整齐而立即搬走会牵动当前 Catalog 的 `project` 路径、`build-official-tools.mjs` 的安全 realpath 检查、`build-contract.mjs` 固定入口和 Verify 闭包，属于不必要的迁移风险。

- `src/index.html` 是**HTML 片段**，不要写 `script`、`style`、`iframe`、`link`、内联 `on*=` 或自带另一个文档外壳；`src/style.css` 仅影响隔离工具界面，不向宿主注入 CSS。
- `src/main.js` 中通过 `globalThis.OpenDeskTool` 获取 `root`、`request`。事件只绑定到自己的 `root`，使用 `textContent` 渲染未经信任的用户内容；不要假定能访问浏览器扩展全局 `chrome`。
- 共用的 `docs/api/` 不放某一个工具的业务指南；示例实现留在它自己的项目目录。工具包 JSON 是**构建结果**，不应成为手工维护的巨型源码文件。
- 官方候选在 `official-tools/catalog.json` 登记可信项目，由唯一打包器生成发行清单、包大小和 SHA-256；**需要安装验收或交付的项目**在测试通过后可且应保留工具根唯一 `<id>.opendesk-tool.json`，它是可再现构建产物而非第二份源码。官方浏览器的内置发行仍由 Catalog 从可信源码生成，不读取用户自编的未审阅包；不涉及本轮的历史示例无需批量创建 JSON。见 [官方 Catalog](official-tools-catalog.zh-CN.md)。
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
- `title/description/capabilities/files/assets` 属于 **tool.config.json 源清单**；最终包的基础字段为 `format/id/version/title/description/capabilities/html/css/js`；v2 的 `requires/contributes/scripts`、显式 `uiRuntime` 等受限字段按 [公开工具 API](sidebar-tools.zh-CN.md) 及当前 Schema 校验，不能将这份基础列表当作全部版本的字段全集。不要给严格 JSON 加 `permissions`、`native`、`packageUrl`、`marketId` 等未实现的字段。
- `files` 的 html/css/js 三个源路径均为项目根下的相对路径；v2 可选 dependencies 按上文受限顺序构建，v1 不接受该字段。打包器会检查路径穿越和软链接越界；`assets` 最多 16 个、每张不超过 96 KiB，允许 PNG/JPEG/WebP。通过 `{{asset:assets/icon.png}}` 引用，打包器嵌为 `data:` URL；不是 HTTP/CDN 资源。
- 当前合同：最终包最大 **320,000 UTF-8 字节**；HTML ≤64,000、CSS ≤120,000、JS ≤220,000 **字符**，打包器对输入源码还有字节预算。最多同时安装 12 个工具。以代码实时限制为准，不能为了通过校验任意放大预算。
- 改代码但不改变版本时可以生成不同的**开发快照**；正式包内容变化时，晋升要求版本高于已有正式包，同版本不同字节与降级都会拒绝。正式安装/更新仍审查新包字节、所申请能力和升级策略，不把“相同版本”当“已审批”。

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

在仓库根目录操作，先核对 `git status --short --branch` 和现有 watcher/Chrome；**默认构建只写忽略目录，不再自动刷新工具根的正式包**。

```sh
# ① 临时候选：每次覆盖同一稳定路径，不累积无意义的多个版本。
node scripts/build-sidebar-tool.mjs examples/sidebar-tools/<tool-id> \
  --out artifacts/sidebar-tools/<tool-id>/candidate.opendesk-tool.json

# ② 先执行受影响的真实代码、Node/包/权限测试。
node --test tests/environment/sidebar-tools.test.mjs
# 再执行该工具对应的专项测试；任何失败都保留原有正式 JSON。

# ③ 在上述门禁通过后，显式将已验证的候选原子更新到项目根目录。
node scripts/build-sidebar-tool.mjs examples/sidebar-tools/<tool-id> \
  --promote-from artifacts/sidebar-tools/<tool-id>/candidate.opendesk-tool.json

# ④ 校验项目根唯一正式 JSON 与当前源码规范打包结果逐字节相同。
node scripts/build-sidebar-tool.mjs examples/sidebar-tools/<tool-id> --check-project
git diff -- examples/sidebar-tools/<tool-id>/
```

**交付时的正式文件**是 `examples/sidebar-tools/<id>/<id>.opendesk-tool.json`，其文件名稳定、每工具只有一个；不存在自动生成 `r1.2`、`v1.3`、`final-2` 的同用途包。完整版本和变更记录保留在 JSON 的 `version` 和 Git 历史中。**只有需要用户安装、手工调试或正式交付的工具必须在测试门禁后把包和源码一起提交**；不触及的全仓旧示例无需集中补包。

普通 `npm run build:sidebar-tool -- examples/sidebar-tools/<id>` 仍能生成 `artifacts/sidebar-tools/<id>/<version>/` 下的临时可导入文件，但不会自动写入正式目录。`--out` 只能指定临时路径，**直接指定工具根 `<id>.opendesk-tool.json` 会被拒绝**，以免覆盖当前最后一个可用包。`--promote-from` 会拒绝缺失、损坏、陈旧/与当前源码不同的候选、符号链接目标及工具根多份正式包；失败不修改旧文件。`--check-project` 会校验一致性，但无论构建还是提交**都不代表已安装或真实 Chrome 测试通过**。在 OpenDesk Side Panel「扩展 → 更多操作 → 导入本地工具包」选择这个正式 JSON → 审阅权限/版本 → **用户确认安装/更新** → 主动打开。所有真实权限和旧数据都由原安装链处理。

### B. 本地只读预览：改得勤但暂不安装

```sh
node scripts/stage-sidebar-tool.mjs examples/sidebar-tools/<tool-id>
# 报告 status: STAGED_NOT_INSTALLED
# 生成 .opendesk-preview/<id>/<sha256>.opendesk-tool.json
# 也生成受信 Native 读取用的分块快照 / latest.json
```

已连接相应本地 Workspace/Native 的情况下，用户须明确点击 Workspace 的「只读预览工具」，或在现有「开发」Tab 选择本地项目后点击「实时开发预览 ↗」，才能在受控 iframe 中预览。后者通过短时、一次性的来源绑定意图交给原 Workspace，仍重新核对 Native 租约、目录配置与所选工具 ID。只读预览使用模拟读取，不允许真实存储写入、打开任务或控制网页，且**即使 ID 与已安装工具相同也不继承权限**。`STAGED_NOT_INSTALLED` 不代表“已经安装”或“已在页面自动运行”。

```sh
# 前台监听有变化的、已完成的源码快照；不会自行执行 npm 或安装工具
node scripts/watch-sidebar-tool.mjs examples/sidebar-tools/<tool-id>
```

监听启动后，在已授权来源的 Native Workspace 中明确点击「只读预览工具 ↗」一次。后续保存真实源码，原 watcher 完成校验并发布不可变快照；Workspace 复核同一来源与租约，再向同一个预览会话发布新快照，原沙箱 iframe 安全重新挂载。无需重复导入 JSON、安装或升级。预览页显示成功摘要、编译失败、旧快照及连接中断；失败保留上次成功画面，有未保存编辑时推迟替换。停止 watcher、关闭 Workspace 或来源撤销后不再接收更新。

AI 验证应直接修改当前业务项目：先保存一处真实 CSS 并观察同一预览，再保存 UI/JS 并观察第二次变化；故意制造一次可恢复的编译错误，核对旧画面与错误状态，随后恢复源码。必须记录实际预览身份及快照 SHA，不能用 stdout、Node PASS 或状态栏的新 SHA 代替真实画面。临时标记不晋升正式包。预览只执行受限 UI；保存源码不会重放网站、任务或正式存储操作。真实 SDK 业务调试需要单独的开发准入，不能关闭只读标志或继承同 ID 安装授权。

2026-10-25 的 Prompt Shortcuts 已在日常 Chrome 的 `dist/development` 持续开发环境完成上述两次更新和坏构建保留验证；正式包 SHA 与安装版原有 5 条列表未改变。这只证明该 HTML/CSS/JS 案例，React/Vue、业务保存和 production 验收不得据此写成 Chrome PASS。`opendesk-tool-preview/` 与 `.opendesk-preview/` 都是本机临时产物。

「开发」Tab 的本地项目入口也已在同一 Chrome 实测：恢复 Prompt Shortcuts 原目录，选择已安装工具，保存源码关联，再点击实时预览，原 Workspace 自动打开正确工具的只读预览。关联只记住所选目录和安装包摘要，不能证明该目录就是正式包的原始来源；包变化须再次确认，离线时不按名称替换目录。每次点击可以新开 Workspace；后续源码更新复用该 Workspace 拥有的同一预览。关闭 owner 后须重新明确打开。首次 React 项目继续使用下节的既有 starter；尚未增加浏览器内创建目录或自动执行 npm 的能力。

#### 受限存储业务调试：源码已接入，真实 Chrome 链待验证

只读预览默认仍返回模拟读取，不允许业务写入。带 `storage.local` 声明的当前快照新增可信按钮「批准隔离存储调试」：用户审阅工具、来源及 SHA 后点击，宿主重新挂载一个 iframe，先完成开发准入，再发送工具源码。该入口保持 `readOnly` 隔离，不借用同 ID 安装权限，也不开放 `files.*`。

实现沿用原链：**原 sandbox → 原预览 Host 的两项白名单操作 → 精确绑定的 Workspace owner → 原 Native authority 逐请求核验 → 隔离 session 存储**。窄 `runtime.Port` 只连接该预览的真实 tab/document/host，既有 Native 会话和开发租约必须有效；不是第二套 Authority 或安装流程。

- grant 只保留在 owner 内存，绑定准确 source/tool、snapshot SHA、真实 tab/document/host、新 iframe instance 与 Native 会话/租约，五分钟到期。previewId 仅是定位符，身份不采信动态代码自报。
- 仅允许 `storage.get/set`；测试数据位于 `opendesk.sidebar-tools.development-data.v1:<sourceId>:<toolId>`，与正式 local 数据分离，不读取或导入正式数据，不记录正式工具分析事件。关闭重开须重新批准，仍可读取同一浏览器 session 的测试数据；session 数据不承诺跨浏览器重启保留。
- 复用现有稳定 JSON 摘要、CAS/ETag、8 KiB 单项 / 32 KiB 总量 / 32 键上限及写后读回，显式传入 session area。写入必须带匹配 ETag；跨 owner 对同一数据身份使用同一个锁。
- 接受新 SHA 前先撤销旧 grant，再处理未保存草稿和挂载；保存源码不会自动批准或重放业务操作。批准等待期间来源、SHA、owner 或代际改变则失败。构建错误或连接恢复只恢复明确批准入口，不恢复 grant。
- 每次请求在数据身份锁内检查 grant、过期、owner 和 Native authority；异步核验后，在写入前同步复查代际。Stop、关闭、撤销、断连与过期拒绝未提交操作；已发出的写入不能承诺撤回，回执未知时重新批准后只读核对，禁止自动重放。被停止的 candidate 永久失效，迟到 iframe load 不能重新启动它。

2026-10-25 验证状态：`SOURCE_WIRED`、`NODE_PASS`。未改动的 Prompt Shortcuts 实际业务源码在 Node DOM fixture 中经既有 Host 完成「你好 → 保存 → 列表 → 新实例重开」，另以真实 owner/client 模块的双向 Port fixture 验证准入、租约、隔离和撤权；同 ID 正式数据未读写。当前浏览器工具拒绝访问 `chrome-extension://` URL，因此新增入口尚未构建/加载并执行真实 Chrome 操作，业务链仍为 `NOT_TESTED`，不能沿用前述纯 UI 热更新的 Chrome PASS。下一条未验证操作是加载本次可信宿主源码后，在既有实时预览点击「批准隔离存储调试」，完成同一条保存重开链；不因此启动 production 验收或正式包升级。

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
- **可信工具栏操作归属（R1.9.5）**：正式 Side Panel 工具详情应保持「返回图标 — 工具标题 — 设置图标 — 卸载图标」的同一水平行。返回到标题建议使用共享 8px 间距，标题不额外缩进；工具专属设置优先复用既有 `#sidebar-tool-settings-open`，由可信宿主调用工具已有设置视图，不在内容区增建一行浮动齿轮或 Logo 标题。侧边栏 320/360/400/480px 验证同排、可点击和焦点返回，不能用绝对定位覆盖。自定义 HTML/Vue/React 沙箱工具不因此取得 Host DOM 或新的权限。
- **紧凑一致**：优先复用项目现有语义、圆角、间距、字体等级与浅色/深色方案；但沙箱 CSS 不自动继承宿主样式，需在工具自己的 CSS 显式定义统一 token 或使用本地构建出的静态样式。不新建第三套共享设计系统。
- **尺寸**：在侧栏约 360/400/600 CSS px 和窄屏/滚动、200% 缩放条件测试；不可依赖固定宽度。Chrome 的实际最小侧栏宽度以实测为准，不能声称所有设备能达到 320px。
- **无障碍**：表单 `label`，图标按钮 `aria-label`，键盘焦点/Enter/Escape，动态状态 `role=status`，足够对比度，不仅凭颜色表示状态；加载中、错误、无数据、权限不足、只读预览、保存成功都需明确反馈。
- **数据与性能**：不反复对整页做昂贵扫描，不在主工具 iframe 里执行持续后台任务；页面监听、定时器、Observer 应有销毁策略。处理长文本、超额/并发冲突时给错误和恢复路径，不静默截断或覆盖。
- **安全**：页面内容通过 `textContent` 或明确净化的数据模型展示；不要把不可信 HTML 直接插入。不能借助 DOM 字符串过滤代替真实 CSP、授权与消息校验。
- **依赖**：普通工具优先零运行时依赖。React/Vue/第三方库必须锁定版本、本地编译、遵守许可证与包预算；只在明确声明且宿主支持 `uiRuntime` 时使用对应固定 Shared UI，不假定其他宿主库、Tailwind 或 CDN 自动可用。

## 6A. 可安装工具的信息架构与交互基线（知识收件箱 R24 验证经验）

适用于 quick-notes、reading-toc、web-markdown-clipper、markdown-workbench 及 React/Vue 预编译工具的相关交互；这是共用设计规则，不是每次开发的验收清单，也不会使普通工具获得宿主权限。只验证本次受影响的交互与保护，正式证据按当前适用合同处理。

- **先内容后操作**：列表优先标题、摘要、状态与更新时间，搜索和常用筛选位于同一清晰区域；备份、删除等低频/危险动作使用次级入口。工具 iframe 不重复宿主已有的页级导航和标识。
- **阅读与编辑分离**：默认阅读内容；点击编辑才显示表单。保存按钮由与已提交值比较的 dirty 状态控制，不能仅因进入编辑模式而标记已修改。保留取消与修订冲突反馈。
- **安全内容展示**：用户 Markdown/网页正文为不可信文本。使用文本节点构建标题、列表、代码、引用等；不能将未经信任的文本赋给 innerHTML，不得自动执行 Markdown 内 HTML、远程脚本或加载远程图片。超长文档可以完整显示为纯文本回退，不得静默截断。
- **状态不占屏**：加载、空收件箱、搜索无结果、保存中/失败/成功、删除确认分别建模；成功反馈短暂出现，失败反馈保留；不要用常驻信息条代替主内容。
- **窄屏与宽布局共用语义**：保留按钮换行、筛选和代码块的局部滚动及正文可读性，不用外层整体横向滚动隐藏问题。开发只修复当前入口实际受阻的布局；历史 360/400/600px 与独立标签页专项仅在本轮明确要求时执行。
- **隔离样式映射**：在工具 CSS 内映射与宿主 R20/R21 相同的间距、圆角、焦点、字体与明暗语义；sandbox iframe 不会自动继承宿主 CSS 变量。不引入大体积 UI 依赖来解决少量局部控件。
- **焦点与数据安全**：列表打开详情、编辑切换、确认框关闭后，应合理恢复焦点；支持 Escape 与 Ctrl/Cmd+S，宿主 dirty 状态通知必须避免响应乱序。删除和覆盖仍通过已有权限/修订合同验证，不能用 UI 判断代替受信任服务校验。
- **原生键盘浏览**：记录列表用真正的 button/link 表达操作，保留 Tab 顺序与 Enter 激活；只有焦点处于列表项时才截获 ↑/↓、Home/End，不能抢占输入框、下拉选项或页面级快捷键。打开详情后焦点移至内容标题，返回列表后恢复原记录焦点；使用可被读屏读取、视觉上不占空间的快捷键说明。
- **逐层退出与聚焦可见**：Esc 优先关闭当前菜单、结构大纲或对话框；退出未保存编辑须走同一丢弃确认，普通阅读态才返回列表。不以无条件 :focus{outline:none} 覆盖 :focus-visible；焦点行为改变时在正常使用条件下验证，360px 与缩放专项须本轮明确要求。
- **交互证据**：列表键盘、焦点或编辑退出受影响时，只验证相关按键、焦点恢复和拒绝丢弃编辑；撤权涉及数据保留时验证已保存记录仍在。进入适用正式验收时，沿用至少两条真实保存记录与 ↑/↓/Home/End/Enter/Esc 的既有门槛。Headless 预览、受控扩展和用户真实站点证据分级；历史 200% 缩放证据保留，不自动要求本轮重测。
- **真实验收分级**：当前任务进入正式安装验收时，按适用合同检查源码/生成包一致、安全负例、真实 Chrome 安装与 sandbox 交互；开发阶段仅选择能证明当前操作的场景。历史 360/400/600px 明暗截图矩阵仅在本轮明确要求时执行；实际在线 ChatGPT、macOS Native 落盘与系统剪贴板按当前任务所需分别取证，不因 CFT 受控页面 PASS 冒充正式通过，相关未测项标 `NOT_TESTED`。

具体参考 examples/sidebar-tools/knowledge-inbox/src/ 与 tests/framework/knowledge-inbox-native-r1.test.mjs；其他工具只有在出现相同缺口时才按需迁移，不批量重写。

## 7. 按改动选择验证；正式验收沿用适用合同

以下是验证入口，不是每次开发的最低全量矩阵。完整矩阵/正式包验收仅由用户当前明确要求或适用正式交付合同触发；保留现有标准与历史证据，未执行不标 PASS。

| 层级 | 可选场景 | 何时做 |
| --- | --- | --- |
| 合同与打包 | 有效/无效 config、未知 capability、恶意 HTML/CSS、路径逃逸、体积边界、无远端执行 | 改动对应配置/资产/依赖保护时选相关项；交付安装包时按原打包合同 |
| UI 与状态 | 首次打开、空态/加载/报错、保存回读、切换/重开、键盘、暗色 | 只检查本次改变的状态和操作；宽度/缩放专项须当前明确要求 |
| 权限与生命周期 | 导入不执行、确认安装不自动打开、预览不写入、撤权/更新/卸载、旧会话拒绝 | 对应能力、来源/身份、会话或数据保护受影响时选必要正负例；正式阶段按合同补全 |
| 受控 Chrome | 安装真实 JSON、交互事件、独立标签页差异、刷新/站点切换、权限拒绝、重复打开 | 当前行为必须由浏览器证明时选相关场景；完整安装验收由当前任务/正式合同触发 |
| 真人网站和 Native | 真实目标站点、用户 Mac/系统权限、下载落盘、Native 文件创建及读回 | 当前核心操作或正式合同需要该证据且环境/授权具备时执行；环境可用本身不触发验收 |

命令入口按需取用，不顺次执行；构建失败先定位相关入口、日志和现有定向检查，相关输入和诊断依据均未变化时不重复全量构建。日常源码迭代复用已有 watcher；纯文档/Skill 修改不运行以下产品命令。

```sh
# 选择本次受影响的检查/测试文件，公共合同与 Host 并非每次都改动：
npm run check
node --test tests/environment/sidebar-tools.test.mjs
node --test tests/environment/sidebar-tools-host.test.mjs
# 当前明确要求/适用正式合同需要全量源码回归时：
npm test
# 确需 production 产物证据时：
npm run build
node scripts/verify-package.mjs dist/production
# 当前交付合同需要双环境验证时：
npm run build:dev
npm run verify
# 当前任务需要交付完整扩展 ZIP 时：
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
| **需求与业务路线（人）** | 单工具自己的 `REQUIREMENTS/ROADMAP`；跨工具路线才归 `docs/product/` | 用户故事、产品优先级、未实施需求，避免在通用文档复制私有产品规格 |
| **工程验收与原始证据** | `docs/framework/workstreams/`、`evidence/` | 候选 SHA、包身份、原始日志和限制 |

**交付必须自检**：源码能单独维护；所生成 JSON 与授权声明一致；默认预览不执行写入；手动导入能审查并确认；官方发行由 Catalog 从可信源码生成并验证；UI 可访问/可用；权限/撤权/数据保留符合设计；测试结果及未测边界有证据；不修改无关工具或重建工具框架。

本规范不定义未来应用市场的远程安装协议，也不宣称公网安装交接、个人内容迁移、远端组件热更新、通用 Native 文件 API 已实现。这些独立于现有 `opendesk.sidebar-tool.v1` 的本地开发与导入闭环。

## R25.1：与本地开发选项卡的交付关系

Side Panel 工具继续以 `opendesk.sidebar-tool.v1` 包交付，使用现有打包校验、共享安装器和工具数据空间。**不要把运行成功的 Page USER_SCRIPT 或 Controller 代码直接包装成 Side Panel 工具 JSON**；它们已有独立冻结/授权/安装合同。开发选项卡「本地项目」的保存按钮仅对支持的 `page-userscript`、`controller` 项目开放，在按各自 Authority 完成正式安装后，分别于「扩展」统一列表中以「网页增强」标签管理，以及在「我的 → 已安装任务」管理；仅保存源码不等于安装完成。独立的 Side Panel 本地包应按照本文项目构建、审阅并安装，不存在自动转换器。在线市场上传、作者身份、草稿和版本托管接口尚未交付，不要在 UI 或文档宣称发布成功。

## 工具多语言：默认单语言，按需增量

应用 UI 本地化按唯一正式合同 [Sidebar Tool 本地化](sidebar-tool-localization.zh-CN.md) 实施。**默认只写源语言**，不需要自动翻译、`chrome.i18n` 或新的 Browser SDK 接口。用户提出增加语言时，在原项目增加受校验的 `locales.json` 和构建期 `tool.config.json.locales`，使用同一 `html/css/js` 受限工具包、相同工具 ID 升级，不改变能力与业务数据。Side Panel 沙箱仅通过 `OpenDeskTool.locale` / `OpenDeskTool.onLocaleChange` 获取展示语言；缺词条回退原文。对网页悬浮等可信 UI，复用受控资源但仍必须留在宿主可信代码内。具体原文指纹、占位符、离线、安全及证据等级见正式合同。
