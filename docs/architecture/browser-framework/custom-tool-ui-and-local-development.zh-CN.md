# OpenDesk Browser：可选工具 UI 与本地开发接入框架

日期：2026-10-10。本文区分已实施和待实现，不是 macOS Chrome/Native 验收报告。

## 独立选择、共享业务能力

功能与数据为主体，UI 可选；经典 HTML/CSS/JS 与预构建 Vue/React 可复用同一安装包机制；Side Panel 和扩展标签页只是不同的容器。AI/工作流通过经授权的功能接口访问业务数据，不依赖知识库管理 UI 开启。客服自动监听属于 Task/RunHost，不能依赖工具 iframe 计时器。真实写入必须有权限、版本检查、日志及审核，不信任外部聊天内容产生的授权指令。

## 已实施：同一安装版 UI 可在侧栏与标签页打开

`src/ui/sidebar-tools.js` 继续作为唯一的安装版工具宿主。侧栏已安装工具列表和打开后标题栏提供 ↗，仅导航到固定扩展页 `ui/tool.html?toolId=<id>`。标签页复用 `createSidebarTools`：先读取已安装包及网站权限，随后创建 **`sidebar-tools/sandbox.html` opaque-origin iframe**，通过现有 postMessage 协议调用被批准的接口。工具 HTML/JS 不进入特权宿主 DOM。侧栏与全页面各有实例令牌，工具数据使用已有命名空间及 Chrome 锁；卸载/更新撤销过期实例。

新增 `src/ui/sidebar-tools/navigation.js` 限制路由为固定页面和严格工具 ID。URL 不传任意路径、脚本、密钥或授权令牌。无须新增 WXT 入口、MV3 Manifest 权限、第二个工具 schema 或宿主。旧 `opendesk.sidebar-tool.v1` 包和 Task/RunHost/R17 均保留。

## 已有开发入口：手动打包并导入

```bash
node /path/to/opendesk-browser/scripts/build-sidebar-tool.mjs /path/to/my-tool
```

`tool.config.json` 必须给出 HTML/CSS/经典 JS；生成 `.opendesk-tool.json` 后由用户审阅能力、安装并主动打开。简单 UI 不需要框架编译。Vue/React 需先经独立 Vite 项目构建成本地单 IIFE、CSS/HTML；动态分块、远端 CDN、服务端渲染默认不支持。现有预算为 HTML 64,000 字符、CSS 120,000、JS 220,000、总包 320,000 字节；不要把 gzip 大小当作原始包大小。浏览器工具 UI 编辑不要求重新编译浏览器扩展本身。

R17 `opendesk browser` 已能接入本地目录到 Workspace，但**不意味着 UI 包自动构建、同步或预览**。本阶段没有擅自执行 npm scripts、扩权或创建新 CLI。

## 待实现：自动同步、可选完整应用与 AI 数据操作

1. 已授权目录识别工具清单，用户明确启用开发预览并审批构建命令。原生 UI 直接打包，Vue/React 监听成功构建事件，不能使用 `vite build --watch && pack` 期待每轮构建。
2. 在现有 Native Provider / Workspace 授权上定义 `sourceId + toolId + buildId + SHA-256` 完整产物快照与分块校验。绑定真实目录/版本，不混读不同时间磁盘内容，不把 `sourceId` 当权限。
3. 开发预览与正式安装隔离：默认只读/Mock，不允许刷新 UI 就取得发送消息、写真实数据或运行 Task 的授权；更新时旧 token 失效。构建失败和断线必须准确显示旧预览状态。
4. Vue/React 各一个锁定版本的可构建模板与真实 Chrome 用例；确认 IIFE/CSS 文件大小。正式版本需人工核对权限后从完整快照安装，断开开发进程仍可运行纯本地 UI。
5. 受控业务 API 处理知识版本、审计、AI/UI 并发写入；UI 全部关闭时仍能经授权调用。不能以管理 UI/客户指令当作授权凭证。

## 验收与安全边界

本次增加 `tests/environment/tool-ui-tab.test.mjs` 和宿主测试。受影响的真实检查：

```bash
node --test tests/environment/tool-ui-tab.test.mjs tests/environment/sidebar-tools*.test.mjs
npm run check
npm run build
npm run verify
```

Mac Chrome 需核对已加载构建的扩展 ID/版本/路径，在 Side Panel 和标签页实际打开同一工具，检查独立会话、TOC 授权、卸载撤销、两个实例并发、窄屏、无代码自动执行以及原 Task/RunHost/Workspace 回归。**本次远端 GitHub 接入没有提供本机 Chrome/Go 真实验收，不宣称 95 分 PASS。**

参考：`docs/product/sidebar-custom-tools-r1.zh-CN.md`、`docs/framework/local-directory-cli-r17.zh-CN.md`。


## R1.6 设计决策：官方预编译 UI 与动态工具隔离并存（2026-10-13）

**状态：目标设计，尚未完成源码迁移或真实 Chrome 验收。** 当前 `src/ui/sidebar-tools.js:mountTool` 仍将所有安装版工具载入 `sidebar-tools/sandbox.html` 的 opaque-origin iframe。该机制对用户/AI 任意工具是合理的权限隔离，但不应不加区分地约束受审计、随扩展静态编译发布的官方界面。首个试点仅为 Time Review，其他官方应用保持现状，不能把提议写成既有产品实现。

### 按可执行代码的来源分类，不按名称或商店标签分类

| 可执行代码与 UI 来源 | 目标执行位置 | Chrome API 权限与身份约束 |
| --- | --- | --- |
| 受信任的**第一方、随扩展静态构建、经过源码审计并编译期登记**的 UI 组件（首个候选：Time Review） | 可直接挂载既有可信 `ui/tool.html` 内容区，不需要工具 iframe | 组件只可由扩展本身静态 import/固定入口加载；每次使用仍检查现有工具安装身份、启停、包版本/规范化 SHA、官方发行来源与撤权代际；特殊操作仍经现有可信 Host 的真实用户手势和权限边界 |
| 用户自己编写、AI 生成、导入、市场获取且**不在当前扩展构建内静态审计**的 HTML/CSS/JS 工具，即使 title/ID/描述与官方相同 | 继续使用现有 `sidebar-tools/sandbox.html` opaque-origin iframe 和 `OpenDeskTool` / `OpenDeskSDK` 消息桥 | 不能把工具包 `js/html/css` 或库源字符串插入可信页执行；无 `chrome.*` 直接权限，全部能力由唯一现有 Host 逐次判断 |
| 运行于目标网页的用户脚本 / Page 程序 | 现有 `chrome.userScripts` 的 `USER_SCRIPT` 执行世界（按当前 Controller/Page 合同） | 与 Side Panel UI 是不同执行世界，`worldId` 或隔离脚本不等于扩展侧栏 UI；保留精确目标、作用域、能力和撤权 |

**绝对边界：** `manifest.json` 的 `permissions/optional_permissions/host_permissions` 授权的是整个 OpenDesk Chrome 扩展，`package.json` 不负责 Chrome 授权。工具包 `capabilities`、网站 Origin 同意、浏览器 Native permission 是不同层级；`<all_urls>` 不意味着任意安装版工具或 Time Review 获准采集全部网站。SDK 检查只能限制**通过 SDK 的请求**；任意 JS 若进入有特权的扩展页面，可能绕开 SDK 调用 `chrome.*`、共享存储或篡改可信 DOM。ES Module 闭包只降低变量冲突，Shadow DOM 只降低 DOM/CSS 干扰；它们都**不是**针对不可信 JS 的权限沙箱。不得基于 `id==='time-review'`、官方目录展示标题、`time.review` 能力或单一 runtime SHA 就自动升格未知 JS。

**静态组件准入：** 只有扩展自身已打包的、编译时确定的可信组件可以直渲；安装包只作为是否可以展示/运行该组件的**授权与版本凭据**，不是将包中 JS 提权的代码来源。必须同时核对既有 `official-tools/catalog.json` 的来源和规范化包 SHA、版本、完整安装项/启用/撤权 epoch，且与当前扩展内置组件支持的确定版本一致；伪造来源、离线导入同名包、包摘要改变、版本不匹配及安装记录损坏均不得进入可信组件。对非正式包保持**现有沙箱路径或安全拒绝**，不能用运行时回退把该包 JS 放入可信页。准入失败时的界面应告知用户原因，不自动安装、补授网站权或继承之前的特权。

**一套工具生命周期：** 两种 UI 位置继续复用 `src/ui/sidebar-tools/installation.js`、现有安装注册表、Browser SDK/Host、时间后台 `src/time-review/service.js`、网站许可和卸载/清理事务，不新建第二套安装器、Tool Registry、Authority、调度器或权限库。用户界面的入口、列表、标题栏、卸载按钮一致。可信 UI 的发布/更新需要随浏览器扩展重新构建，不可承诺像沙箱动态工具一样只换 JSON 就能执行新代码。Time Review 迁移完成时**仅保留一份可维护的前端业务逻辑来源**，不能长期开两个状态不一致的 UI；如官方安装 JSON 仍需要元数据/小型静态入口，必须明示其无特权代码地位并同步调整测试与来源哈希。

**用户体验：** 安装≠网站采集同意。第一次需要独立确认网站范围、必要的 Chrome `idle` permission 和首次启动；之后有效同意范围内，用户从可信 UI 直接点击一次开始/恢复/暂停即可，避免无谓的“开始→再确认开始”双击，但不能自动扩大范围、静默请求 Chrome optional permission 或跳过危险清空/撤权确认。关闭 Side Panel 不停已被批准的后台计时；窗口焦点/Idle/Origin 失效时保守停算而不补造时长。显示状态、24h Canvas、六分类及导出维持现有产品功能。

**Tampermonkey 可借鉴边界：** `@match` 约束网站、`@grant` 声明能力、`@sandbox` 选择执行世界；这些概念可映射到 OpenDesk 已有的站点范围/能力/执行世界，而不能让 `@grant none` 被理解为“在扩展可信页获得所有 API”。Chrome 官方扩展 Sandbox 不能直接访问扩展 API，而 MV3 非沙箱扩展页的 CSP 不允许任意代码 `eval/new Function`。参考：
- [Chrome sandbox manifest](https://developer.chrome.com/docs/extensions/reference/manifest/sandbox)
- [Chrome MV3 CSP](https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy)
- [Chrome userScripts USER_SCRIPT](https://developer.chrome.com/docs/extensions/reference/api/userScripts)
- [Chrome 权限声明](https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions)
- [Tampermonkey @match/@grant/@sandbox](https://www.tampermonkey.net/documentation.php)

**试点实施门槛：** 先核查 WXT 严格 IIFE、自包含静态入口、生产 512 KiB 单入口预算、CSP/Manifest/正式工具包兼容性，再只迁 Time Review。定向测试必须覆盖同 ID 伪装、包版本与哈希错配、恶意 JS 不进入可信页、跨工具无法获权、完整授权/撤销、SW 与 Chrome 恢复、工具更新/卸载及真实 Side Panel 交互。若必须通过提高预算、削弱验证、复制并行安装器、动态提权等方式才可工作，则**不迁移**，维持现有已隔离工具路径并记为 BLOCKED。没有同候选真实 Chrome 证据，95+ 专家评分保持 `NOT_SCORED`。

实施和验收续接见 [Time Review 工作流](../../framework/workstreams/time-review-r15.md) 与 [R1.6 实施 GOAL](../../framework/prompts/goal-time-review-r16-trusted-native-ui-pilot.zh-CN.md)。
