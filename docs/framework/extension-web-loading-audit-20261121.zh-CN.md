# 扩展网页加载与状态盘点（2026-11-21，开发阶段）

本轮确认了一个同类诊断缺陷：Chrome 的「允许用户脚本」关闭、站点访问仍获准时，阅读目录的侧栏可以打开，「网页功能设置」也显示待开启，但 1.1.13 的工具正文却提示注册失败、将自动重试并建议刷新。1.1.14/r14 保留动态 Page 模块，提示从「扩展 → 网页功能设置」开启并检查，等待用户操作时停止重复读取。对照其他官方工具，未发现第二个固定网页功能在源码中依赖该开关的证据。

## 怎么核对

以 [Sidebar 官方目录](../../official-tools/catalog.json)、各项目配置（下表给出项目目录）及 [独立 Page 来源](../../official-pages/sources.json) 为索引；实际执行以生成 Manifest、入口和运行分支为准。持续开发目录 `dist/development` 的官方 Sidebar 目录有 18 项，只有阅读目录和队列带 `pageModule`。生成 Manifest 有三条固定 Content 入口：

- [ChatGPT 固定 Bridge](../../src/entrypoints/chatgpt-fixed-bridge.js)：仅 `https://chatgpt.com/*`，顶层、ISOLATED、document_idle。
- [Page Relay](../../src/entrypoints/page-relay.js)：HTTP(S)、各帧、ISOLATED、document_start。部分消费者另限顶层或已授权站点。Relay 能加载不代表任一工具获权。
- `framework/sdk-main.js`：HTTP(S)、各帧、MAIN、document_start。它是框架入口，不是某个工具的安装或执行凭据。

状态分开看：目录发行状态、当前安装与启停、Chrome 站点访问、注册回执、当前文档是否已挂载，以及实际操作回执。固定入口可在用户脚本开关关闭时工作，但仍受当前安装、权限、文档和功能各自的操作条件约束；动态代码要受开关约束。具体规则见[网页功能的加载与授权](../architecture/browser-framework/site-permission-onboarding.zh-CN.md)。早期资料中把阅读目录描述成固定入口，本轮以现有包和调用路径为准。

## 官方 Sidebar 工具（18 项）

以下「源码」表示核对了配置、入口与使用分支，没有本轮原生操作证据；「不依赖」表示关闭用户脚本开关不应改变该入口的资格，并不等同于网站实测。项目业务与共享宿主各守原授权边界。

| 工具与业务 owner | 网页入口、站点与文档 | 授权与操作条件 | 开关关闭时的预期 / 本轮证据 |
| --- | --- | --- | --- |
| 阅读目录 · `projects/reading-toc` | 内嵌动态 Page；允许的 HTTP(S) 顶层，idle，USER_SCRIPT | 合法 Side Panel 安装仍可打开；真实启停、网站访问、模块注册与当前文档分别验证 | 预期侧栏可开、页面不挂载、明确指引。旧版原生复现正文错误；1.1.14/r14 源码、Node、包和开发构建已核对，原生结果见下。 |
| AI 消息发送队列 · `projects/ai-send-queue` | 已审阅安装走固定 ChatGPT Bridge；仅 ChatGPT 顶层，idle。包内保留模块元数据 | 安装身份、启停、Chrome 站点访问、当前文档，以及用户实际入队和原发送条件；侧栏状态只读 | 不依赖。0.1.35/r34 的固定协议在开发构建 SW 和 Content 均存在。原生 Chrome 关闭开关时，在获准的隔离 ChatGPT 顶层文档观测到固定组件挂载，侧栏已读回输入框不可用；未入队或发送。 |
| 提示词快捷按钮 · `projects/prompt-shortcuts` | 固定 Relay 顶层；ChatGPT、DeepSeek、Gemini 及已配置匹配的站点 | 已审阅安装、启停、站点访问、可用编辑区与可信点击；只填草稿 | 不依赖；源码、生成 Manifest；本轮原生草稿操作未验证。 |
| 网页 Markdown 剪藏 · `projects/web-markdown-clipper` | 固定 Relay 的页面采集入口；当前获准 HTTP(S) 顶层 | 已审阅安装及当前站点、文档、用户发起采集/保存 | 不依赖；源码。 |
| 知识收件箱 · `projects/knowledge-inbox` | 固定 Relay；ChatGPT 受准顶层的采集/保存入口 | 已审阅安装、目标文档、站点访问及可信保存操作 | 不依赖；源码。 |
| Stay Focus · `projects/stay-focus` | 固定 Relay；启用策略的 HTTP(S) 顶层提醒 | 启用的策略、Chrome 站点访问和现有提醒条件 | 不依赖；源码。 |
| 广告拦截 · `projects/adblock` | 固定 Relay 顶层外观规则；网络侧是 DNR | 已审阅安装、启停、规则和适用站点；网络与外观路径各自取证 | 不依赖；源码。 |
| 视频倍速 · `projects/video-speed-controller` | 固定 Relay 各帧；精确到当前 `documentId` 的媒体操作 | 合法安装、可用视频、可访问站点/帧和可信操作 | 不依赖；源码。 |
| 视频 VIP · `projects/video-svip` | 固定代码经受控 `chrome.scripting` 进入已识别站点/目标文档 | 安装审阅、站点访问、受支持站点/帧与原可信操作 | 不依赖；源码。 |
| 视频下载 · `projects/video-downloader` | 固定代码经受控 `chrome.scripting` 在当前站点候选帧探测媒体 | 安装审阅、站点与精确目标，用户明确发起探测/下载 | 不依赖；源码。 |
| WebFlow · `projects/webflow` | 固定 ChatGPT Bridge；固定 Web Task 按已准 Profile/站点注册。任意用户 Controller 代码仍走动态执行入口 | 固定功能核对 Profile、站点、当前文档、对应的可信操作；动态任务继续原运行与授权合同 | 固定功能不依赖；动态 Controller 仍应受开关约束。两路径源码分别核对，未原生运行任务。 |
| 时间回顾 · `projects/time-review` | 无自有网页挂载；前台标签、idle 事件 | 原统计、启停和站点范围授权 | 不受此开关控制；源码。 |
| AI 知识问答 · `projects/ai-knowledge-answers` | 无自有 Page 模块或固定 Content 挂载 | 原侧栏、知识和受控 AI 能力 | 不适用；源码。 |
| 快捷笔记 · `projects/quick-notes` | 无自有网页挂载 | 原侧栏存储与操作 | 不适用；源码。 |
| Markdown 工作台 · `projects/markdown-workbench` | 无自有网页挂载 | 原工作台和文档操作 | 不适用；源码。 |
| AI VIP Share · `projects/ai-vip-share` | 无自有 Page 模块或固定 Content 挂载 | 原侧栏/服务能力 | 不适用；源码。 |
| Cookie Editor · `projects/cookie-editor` | 无自有网页挂载；通过受信宿主读写当前站点 Cookie | 真实安装、Cookie 与站点权限、可信操作和撤权按旧合同 | 不适用；源码。 |
| 书签管理 · `projects/bookmark-manager` | 无自有网页挂载 | 原书签权限和操作 | 不适用；源码。 |

## 目录外动态 Sidebar 与独立 Page

| 工具与 owner | 入口、范围和操作条件 | 开关关闭时的预期 / 证据 |
| --- | --- | --- |
| 自由复制 · `projects/free-copy`，0.1.1/r2 | 内嵌 Page USER_SCRIPT，获准 HTTP(S) 顶层、idle；真实安装、启停与站点授权 | 侧栏安装与打开不应被开关阻断，网页效果不可用。源码显示保存偏好后刷新页面模块失败可被忽略，保存成功并不证明生效；未做原生复现或修改。 |
| 鼠标手势 · `projects/mouse-gestures`，0.3.5/r9 | 内嵌 Page USER_SCRIPT，获准 HTTP(S) 顶层、document_end；真实安装、启停、站点与有效手势 | 同上。网页回读与设置保存分开；未做原生复现或修改。历史右键菜单问题属另一机制。 |
| AI 对话滚动导航 · `projects/ai-scroll-navigation`，0.4.24/r27 | 独立 Page USER_SCRIPT；ChatGPT、DeepSeek、Gemini 顶层、idle，独立安装审阅和站点授权 | 关闭后不应运行。官方来源与生成目录均为发行 `blocked`。源码显示已启用独立 Page 可回读原生 `blocked`，侧栏可能只给通用 Chrome 限制提示。未通过现有入口复现该条诊断，不改发行或运行路径。 |
| AI 回复思维导图 · `projects/ai-reply-mindmap`，本地候选 0.2.8/r5 | 独立 Page USER_SCRIPT；ChatGPT 顶层、idle，独立安装审阅、站点授权与用户操作 | 关闭后不应运行。官方记录仍是 0.2.7/r1、发行 `blocked`；本地候选不是官方发行或已安装证据。与导航共用独立 Page 状态投影，本轮未原生复现。 |

独立 Page 仍留在「扩展 → 网页功能」，与内嵌模块使用的「网页功能设置」区分。已知 Authority 可识别 `E_USER_SCRIPTS_UNAVAILABLE`；[独立 Page 的状态投影](../../src/ui/extension-center-model.js)未将其与其他 Chrome 限制做专门区分。这是下次可用已审阅 Page 重查的候选，发行阻断不拿来当作运行复现，也不把这两项转为固定可信代码。

## 阅读目录的改动与验证

- [Authority](../../src/scripting/user-scripts/installed-programs.js) 只把宿主已确认的 `waiting-user-scripts` 映射为 `E_APP_PAGE_ACTIVATION_REQUIRED`；不改变注册、站点限制、安装身份、精确文档和未知结果的处理。[工具正文](../../projects/reading-toc/src/main.js)显示对应中、英、日指引；旧文档仍沿用单独的刷新理由。
- Node：`node --test projects/reading-toc/tests/dynamic-page.test.mjs tests/environment/app-page-deferred-activation.test.mjs` 为 **73/73**，覆盖待开启与安装失败区分、固定队列只读、限权、旧文档和未知结果。补充的安装/目录测试 **75/78**；失败为 Clipper 发行锁、首次安装的构建接线及目录版本对照，上次对照旧包也有同样三项。没有修改这些无关合同。
- 包：正式 JSON **1.1.14/r14** 通过同源检查，SHA-256 `a36de8ae4e517a90e6597a9813e62eb68a58637256fd366ba082c9522dd56e06`。生成的开发官方目录为 1.1.14，SW 已包含新错误码。
- 原生：Chrome for Testing 155.0.8059.39，专用临时 Profile，读取已有 `dist/development`，应用 revision `1e17c8ac0fbeaa657383794ebb12bc13f02b90316b95b787dd6629024637fcaa`。场景一：隔离站点权限为 true、开关为 false；「扩展 → 网页功能设置」显示待开启，页面未挂载；从「扩展 → 阅读目录」打开，正文显示先开启再检查的指引。场景二：用原生开关开启后，在同一产品设置点「检查网页功能」，状态为 ready；只刷新测试页，点击目录「Audit section」后页面滚动到目标标题（scrollY 1320）。再次关闭开关并刷新同一测试页，新文档不再挂载。另在 Chrome 开关仍开启时，从阅读目录行菜单选择「停用」，当前目录消失，测试页的新文档也不再挂载。Chrome 单独撤销站点访问和旧文档身份由定向 Node 检查覆盖，本轮未做相应原生组合。没有刷新用户原页、重放发送或更改共享安装。生产验收、全量矩阵、评分均未执行。

- 固定路径对照：相同开发 revision、另一个隔离 Profile；访问 ChatGPT 公开入口，Chrome 网站访问为 true、用户脚本为 false。访客页没有可用编辑器。从「扩展 → AI 消息发送队列」打开后，侧栏读回「输入框暂不可用」，页面出现 `app.ai-send-queue.lifecycle`。此证据只覆盖挂载和只读状态，不覆盖编辑器、入队或发送。
- 本地原始记录：[新版侧栏正文](../../artifacts/sidebar-tools/loading-audit/native-6RThZJ/results.jsonl)、[开关与章节跳转](../../artifacts/sidebar-tools/loading-audit/native-dVUHct/results.jsonl)、[产品停用](../../artifacts/sidebar-tools/loading-audit/native-8v4IHX/results.jsonl)、[固定队列只读状态](../../artifacts/sidebar-tools/loading-audit/native-n5NdFp/results.jsonl)、[Node 定向结果](../../artifacts/sidebar-tools/loading-audit/targeted.tap)、[补充测试结果](../../artifacts/sidebar-tools/loading-audit/package-tests.tap)。
