# 扩展开发怎么选：四类用户需求与一个项目多个 JS

> **普通开发者的第一入口**（2026-10-18；代码事实以最新 `main` 为准）。先问“要让用户完成什么”，再选代码执行环境、项目格式与 Skill。本页是**产品选型决策**，技术实现与授权仍以所链接的 API/Skill/源码为准。

## 1. 先选需求：普通开发者只需要理解四类

| 我想做什么 | 默认选择 | 典型使用 | 先到哪里开发 / 安装 |
| --- | --- | --- | --- |
| **1. 控制网页完成一系列操作** | **网页自动化（Controller）** | 自动填表、点击、等待元素、提取结果 | “开发”→运行草稿；本地 `controller` 项目；正式任务由“我的”管理 |
| **2. 给网页直接增加功能** | **网页增强（Page USER_SCRIPT）** | 页面悬浮按钮、DOM 修改、思维导图、React/Vue 页面组件 | “开发”→在当前网页试运行；本地 `page-userscript` 项目；安装后在“扩展→网页增强”管理 |
| **3. 做一个独立侧边栏管理工具** | **侧边栏应用（Sidebar Tool）** | 笔记、Cookie Editor、书签管理、配置表单 | 独立 `tool.config.json` 工具项目；以可审阅 JSON 安装到“扩展→应用” |
| **4. 做一个有 UI、网页功能和后台能力的完整应用** | **组合式扩展**（现有能力的组合，**不是第四种 JS World**） | Stay Focus、Time Review、Prompt Shortcuts、AdBlock 的不同组合 | 拆分为应用 UI、网页/Controller、必要的受信任后台模块；按各部分的现有安装/授权合同交付 |

**重要判断：** Controller/Page/Sidebar Tool 是有不同执行与安装合同的程序类型；“组合式扩展”是**一个产品有多个职责**，不是现已支持“一个动态 JSON 包直接安装任意后台 JS”的新包格式。React、Vue、JavaScript 是编写方式，**不是运行位置**。

已安装的成熟工具先保护其原类型与身份。例如 Prompt Shortcuts 是 Sidebar Tool v2 + 已审核网页适配器，不能仅凭“网页有按钮”就改成 Page Program。新建纯网页按钮通常优先考虑 Page。

## 2. 什么控制“哪个 JS 在哪里运行”？

**不是文件名，也不是 `document`、`page` 等关键字自动猜测。** 要查实际**声明/入口 → 构建/加载 → 权限准入 → 启动和收尾**：

| 代码类型 | 谁决定实际运行位置？ | 环境与能力 | 何时执行 / 结果 |
| --- | --- | --- | --- |
| Controller 单文件/项目 | “运行草稿”入口，或项目 `package.json` 的 `opendesk.runtimeKind: "controller"` | 受控 Worker；词法 `page`/Locator，没有目标网站 `document` | 显式 Run、或已授权任务/计划触发；`runId`/持久 `resultId` |
| Page 单文件/项目 | “在当前网页试运行”，或 `opendesk.runtimeKind: "page-userscript"` + `pageRules` | 目标网页的 `USER_SCRIPT` World；`document`/DOM，没有 Controller 的 `page` | 试运行用 `chrome.userScripts.execute` 和 `previewId`；正式安装验证后用 `chrome.userScripts.register` 匹配后续网页 |
| Sidebar Tool | `tool.config.json` 的 `files` + 原工具包构建与安装器 | 独立 opaque-origin iframe 内的自有 UI、`OpenDeskTool.request`/批准的 Browser SDK | 用户打开 UI 时运行；关闭 UI 不代表后台服务继续或获得 Chrome 权限 |
| 固定 Background（MV3 SW） | `wxt.config.mjs`、`src/entrypoints/background.js` → `src/sw.js` / Manifest | 经审核的扩展特权代码；Chrome Alarms、DNR、事件与存储等按具体权限使用 | Chrome 事件唤醒；**Service Worker 不是永久常驻线程** |
| 固定网页 Content Script | Manifest `content_scripts`、`src/entrypoints/page-relay.js` 等编译入口 | `ISOLATED` 世界的已审代码，可处理限定网页 DOM 和桥消息 | 获准网页加载/事件触发；不是普通用户的 `USER_SCRIPT` |
| 网站 MAIN / 扩展内可信页面 | 明确的固定入口和各自 Manifest/扩展页面加载 | 网站 JS 世界或特权扩展页面，彼此权限不同 | 不会因为同名变量、React Root 或文件位置而继承另一环境权限 |
| 本地 Native / Node Provider | 经授权的本地开发连接与项目 Resolver | 读取/准备获准的本机代码；不是 Chrome 网页或扩展后台 | 保存可准备源码；**保存不等于运行或安装** |

**单文件**以实际用户点击的 Run/Preview 入口选择；**多文件**以项目声明的 `runtimeKind`、`entry`、网站规则及真实导入链决定。已安装 Page 的“自动运行”还需验证、安装、启停及网站权限，不由 `runtimeKind` 单独授予。

看源码：
[Controller](controller.zh-CN.md) · [Page USER_SCRIPT](page-userscript.zh-CN.md) · [Program 项目格式](local-projects.zh-CN.md) · [Sidebar Tool 规范](sidebar-tool-development.zh-CN.md) · [各世界全局变量](runtime-globals-and-preinstalled-libraries.zh-CN.md)。

## 3. 一个扩展项目有很多 JS，应该怎样拆？

一个 JS 文件**只需一个明确职责**，但不要求每个文件都独立运行。纯模型模块可以被多个入口分别编译使用；**不同世界不会自动共享内存、`window`、全局变量或 Chrome 权限**。需要通信时通过已批准的 SDK、Host、消息桥和精确身份校验完成。

### Stay Focus：一个产品，多个文件和运行位置（R2 已提取）

```text
examples/sidebar-tools/stay-focus/
├── tool.config.json          # 仅声明工具可安装 UI 等文件
├── src/
│   ├── index.html            # 侧边栏界面
│   ├── style.css             # 工具自己的样式
│   └── main.js               # UI 交互，请求获准的工具服务
└── trusted/                  # 第一方受审源码，不能作为任意动态 JSON 特权代码
    ├── service.js            # SW 后台：计时、Alarms、DNR、重启对账
    ├── page-notice.js        # 固定 ISOLATED Content Script：网页提醒
    ├── host-controls.js      # 可信 Side Panel：Chrome 权限和敏感确认
    ├── tool-host.js          # 审阅过的工具请求适配
    ├── model.js / policy.js  # 业务模型、权限/站点规则（导入使用）
    ├── rule-host.js          # Chrome DNR 规则实现
    └── blocked-*.html        # 扩展内部限制说明页
```

**这几个文件为什么会运行？**
- `tool.config.json` 的 `files` 选择 `src/main.js` 等 UI 字节进入安装包；打开工具才挂载其隔离 UI。
- `src/sw.js` 固定 `import` `trusted/service.js`，接入后台事件；侧边栏关闭不终止已启用的限制策略。
- `src/entrypoints/page-relay.js` 固定 `import` `trusted/page-notice.js`，在获准网页显示提醒。
- 可信 Side Panel 的固定入口加载 `host-controls.js`，决定能否申请原生权限及确认危险操作。
- `model.js`、`policy.js` 等是业务依赖模块，**不代表独立的 JS 进程**。
- `src/stay-focus/*.js` 现为兼容转发，唯一实现已归本项目 `trusted/`；不要重新把业务写回通用框架。

用户流程：安装/打开 → 配额设置 → Chrome 权限与真实操作确认 → 后台事件结算/规则更新 → 网页提醒或阻止页 → 关闭侧边栏仍按已批准状态工作 → 停用/撤权/卸载时清理自有规则和状态。**安装 UI 不等于启动后台策略；SW 休眠后必须按持久状态恢复。**

**实际交付限制：** Stay Focus 的动态可安装 JSON 主要包含 UI，不自动包含具有特权身份的 `trusted/service.js`。变更后台/Content/可信 Host 必须进入经过审计的 OpenDesk 固定构建，并更新浏览器扩展；仅更新工具 JSON 不能独立升级这些后台能力。详见 [Stay Focus 产品说明](../../examples/sidebar-tools/stay-focus/README.zh-CN.md) 与 [R2 提取记录](../framework/workstreams/stay-focus-extraction-r2-20261018.md)。

### 其他例子：先识别现有身份，不重新分类

| 例子 | 分工关键点 |
| --- | --- |
| [Prompt Shortcuts](../../examples/sidebar-tools/prompt-shortcuts/README.zh-CN.md) | 独立侧边栏管理 UI + 经审核的网页适配器；不是每次插入都启动 Controller |
| [Time Review](../../examples/sidebar-tools/time-review/README.zh-CN.md) | UI 来源在工具项目；`src/time-review/service.js` 仍是可信后台计时服务，关闭 UI 后可继续按授权统计 |
| [AdBlock](../../examples/sidebar-tools/adblock/README.zh-CN.md) | 工具 UI + `trusted/` 后台服务 + Chrome DNR，用户包不能动态取得 DNR 特权 |
| [ChatGPT Mind Map](../../examples/programs/chatgpt-mindmap/README.zh-CN.md) | 以 Page Program 网页 UI 为主；无需仅因界面复杂就注入通用 Sidebar React Root |
| Cookie Editor / Bookmark Manager | 侧边栏工具通过已批准 SDK 调用浏览器能力，不应把业务写进通用 Host |

## 4. 怎样判断“真正独立”而不是“业务耦合在浏览器框架里”？

- **业务归产品**：列表、额度、计时模型、域名规则、网页 UI、私有状态放在自身工程；共用 Host/SDK 只保留安装、权限、通信、生命周期等公共职责。
- **信任归运行入口**：`examples/` 目录可能同时包含沙箱 UI 与第一方 `trusted/` 受审源码；`src/` 目录可能包含兼容转发。**只凭路径判断耦合/权限是错误的**，应反向追踪真实导入与执行消费者。
- **升级须分清两条路径**：改工具 UI → 工具包正常构建和安装更新；改特权后台/页面入口 → 整个浏览器的固定代码重新编译和验收。不要声称普通工具支持动态安装任意 Background JS。
- **多世界权限不互通**：工具安装、工具启用、网站权限、Chrome 可选权限、用户脚本许可、可信用户手势分别校验。主扩展具备某权限，不代表每个工具都自动拥有。
- **生命周期可恢复**：Page 的安装/匹配、Controller 的 Run/Stop、SW 的事件/Alarm、UI 的挂载/卸载各自管理；Unknown 效果只读对账，不盲目重放。
- **优先复用**：有公开 SDK 就用；没有时先证明跨工具的真实 SDK 缺口，不能为单一工具再建 Host、Runner、安装器或宽泛动态特权入口。

## 5. 下次开发可直接套用的最短判断

先只回答以下顺序，不要先推理八种 JS World：

1. **用户要完成什么？** 从上面的四类需求选择，可多选，但只对应一个清晰的产品目标。
2. **用户在哪里操作？** 侧边栏、网页按钮、任务执行或后台自动事件；是否关掉 UI 后仍需要工作？
3. **每个文件负责什么？** UI、网页效果、控制流、后台策略、纯业务模型、权限控制各自指定一个 owner。
4. **现有入口是否已经支持？** 找 `runtimeKind`、`tool.config.json`、Manifest/WXT 入口、固定 `import` 和真正的事件订阅者，而不是按 `.js` 文件名猜。
5. **能否独立安装/升级？** 分清 Sidebar Tool JSON、Page Program、Controller Task 与浏览器固定可信代码；不得把不同安装合同说成同一包。
6. **怎样证明生效？** 实际运行、后台事件、页面效果、权限与启停/重启/撤权；代码存在或测试文件存在不等于 Chrome 原生 PASS。

**维护规则：** 以上是可复用的稳定产品选型结论；每次只核查所改工具在最新 `main` 的源码、公开 SDK 能力及验证状态。别因新对话重写一套分类、第二套 Skill 或第二套 Host。只有官方运行模式/安装合同真实变更时，才更新本页对应结论。

AI/Codex 路由：[唯一创建工作流](../../.agents/workflows/extension-creation.md) · [Skill 路由](../../.agents/skills/README.md) · [脚本创作 Skill](../../.agents/skills/opendesk-script-authoring/SKILL.md) · [Sidebar Tool Skill](../../.agents/skills/opendesk-sidebar-tool-dev/SKILL.md) · [第一方可信功能 Skill](../../.agents/skills/opendesk-trusted-sidebar-feature/SKILL.md) · [扩展运行时 Skill](../../.agents/skills/opendesk-extension-runtime/SKILL.md)。

> **证据边界：** 本页总结现行项目声明/源码与规范，不是同版本真实 Mac Chrome 验收报告。针对具体修改，`SOURCE_CONFIRMED`、`BUILD_PASS`、`CHROME_PASS`、`NOT_TESTED` 必须独立标记。