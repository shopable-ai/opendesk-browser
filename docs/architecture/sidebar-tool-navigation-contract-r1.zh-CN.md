# Sidebar Tool Navigation Contract R1 · 已安装可信框架上的最小层级协作

状态：R1.2 为 `web-markdown-clipper` 历史试点；R2.2 统一采用当前页短标题。权威产品与权限合同不变：`docs/product/sidebar-ui-spec.zh-CN.md` 与现有 Host/Sandbox 协议；不创建 Router 或第二条导航栏。

## R2.2 唯一可见当前页标题（现行，2026-10-26）

**原问题**：将父扩展名和子页名渲染为两个 flex span，导致「书签管理 / 设置」中间出现大片空白；「提示词快捷按钮 / 提示词详情」重复语义并挤占侧栏宽度。

| 实际视图 | 共享页头可见标题 | 完整悬浮提示与 ARIA |
| --- | --- | --- |
| 书签管理首页 | `书签管理` | `书签管理` |
| 书签管理可信设置 | `设置` | `书签管理 / 设置` |
| 书签/文件夹新建 Sheet | `新建` | `书签管理 / 新建书签` 等原业务名称 |
| 书签/文件夹编辑 Sheet | `编辑` | `书签管理 / 编辑书签` 等原业务名称 |
| 提示词详情 | `详情` | `提示词快捷按钮 / 提示词详情` |
| 提示词新建/编辑 | `新建` / `编辑` | 保留原完整业务路径 |
| 无准入的旧版/第三方工具 | 工具原名称 | 工具自己负责内部导航 |

- **唯一展示 owner**：`src/ui/sidebar-tools/title-path.js` 的 `formatSidebarToolHeading` 一次纯字符串计算返回 `{visible,context}`；已知词汇映射使用 `Object.hasOwn`，以免把 `constructor` / `toString` 等未知页名误判成继承属性。`src/ui/sidebar-tools.js` 仍从可信设置、活动业务导航和安装元数据取状态；`src/ui/react/tabs/tool-host.tsx` 仅渲染单段文本，`src/ui/tool-shell.css` 处理剩余空间及真正溢出时的省略。禁止父名和页名各自 flex 占宽、可见面包屑或第二条 Header。完整路径在 `title` 与 `aria-label` 中保留，悬浮提示还包含实际版本。
- **不粗暴删任意业务名称**：仅固定已知短语如「提示词详情」「摘录详情」「新建/编辑书签」「新建/编辑文件夹」「新建/编辑提示词」映射为简洁动作名；未知标题保持原文，确实空间不足才 CSS 省略。收到合法完整路径时，可见标题只取末级，悬浮和辅助技术仍可还原。业务 `setNavigation` 保留原有意义的标题与状态。
- **可信设置去重**：Header 已显示「设置」时，设置区域不再额外渲染「工具设置」H2，仍保留语义 `aria-label`。根页显示工具名；可信设置优先于编辑/详情，关闭设置恢复原子页；导航根状态 `home/index` 不追加「首页/列表」。
- **R2.2 实例生命周期**：导航的收取、呈现和动作发送均核对当前完整包及安装代际；收到代际撤销后立即清除导航提示。保留可复制草稿的旧沙箱也不能继续控制宿主页首或发送导航动作。同包、同代际、未处于设置的活动可信 UI 重复打开时复用原实例；异步初始化/恢复的失败只清理其捕获的旧 Host，核对 tool/instance 后才可改变共享工作区。书签编辑区域的无障碍名称与同一业务导航标题一致。
- **行为与安全不由标题决定**：共享 Back、书签 React Sheet 的 `requestCloseSheet()` 草稿/保存中/结果未知保护和提示词业务 Back 都不依赖短文字。只有经过官方完整包字节、活动实例、来源和安装代际核验的工具才能上报可信标题；未验真同 ID 和过期实例仍隔离。
- **短标题调整的交付边界**：只调整 Browser 共享 Host/React/CSS、规范和测试，不修改书签或提示词业务源码、版本、能力或正式 JSON 包；需在真实 Chrome 更新包含新 Host 的 Browser 才生效。定向测试 `tests/environment/sidebar-tool-header-title-r2.test.mjs`、`bookmark-manager-title-navigation-r1.test.mjs`、`sidebar-tool-hierarchical-back-r12.test.mjs`；Mac 原生未执行标 `NATIVE_NOT_TESTED`。

## 用户原则

顶部固定唯一 `←` 按钮：根页面回扩展列表，工具内子页面逐级返回；右侧按上下文保留最多必要操作，低频新标签页入口归入可信设置。最近摘录是网页剪藏首页内容，不是中间独立层级。设置由原页面进入时保留原页面实例，返回后恢复；未保存草稿先走原有安全保护。任何扩展未经显式适配，不擅自删掉自己的导航 UI。

R2.2 本地证据与验证缺口见[增量记录](../framework/workstreams/sidebar-tool-title-r22-local-20261026.md)。原生已安装业务操作、源码绑定布局夹具和 Node 安全测试分别记录，不能互相替代；用户最新要求只保留增量检查，不自动扩展完整验收。

## R1.2 历史试点的 owner 与消息边界

本节记录当时仅剪藏的试点，不是现行官方工具白名单或动作全集；现行有界导航以原 Bridge 的 `normalizeToolNavigation`、宿主准入和上方 R2/R2.2 为准。

- 业务 owner：`examples/sidebar-tools/web-markdown-clipper/src/notes.js`，负责 `home → library → reader → edit`、从 `recent → reader` 直返首页、编辑来源、搜索/筛选/滚动以及保存/取消。不得使用 `window.history.back()`。
- 可信呈现 owner：现有 `ToolHost` / `src/ui/sidebar-tools.js`，只绘制标题、左返回及当前上下文图标，根页面仍使用原关闭/生命周期。不得复制一套浏览历史。
- 原版 `src/sidebar-tools/bridge.js` 仍是隔离入口，不允许扩展代码直接修改可信 React DOM。所有消息沿 `SIDEBAR_TOOL_PROTOCOL`，必须通过 `event.origin==='null'`、实际 `event.source`、宿主活动 `instance` 与 `toolId` 验证。工具被关闭、切换或实例重新创建后清空显示提示，旧消息一律无效。
- 当前已验真官方工具沿原协议上报各自受约束的 `OpenDeskTool.setNavigation`；历史 `web-markdown-clipper` 页面 ID 为 `home | library | reader | edit | new`。Sandbox→Host 使用 `kind:'navigation-state'`；Host→Sandbox 使用 `kind:'navigation-action'` 且 `action` 仅 `back | primary`。宿主将页面 ID 映射为内置标题和图标，绝不接受扩展自填可信标题、HTML、URL、脚本或特权操作。
- `busy / dirty` 使用既有 `OpenDeskTool.setState` 与宿主原始生命周期。保存进行时禁止切换；编辑未保存时业务返回触发确认，打开设置前提示先保存或取消。根返回仍通过原有关闭保护。
- `primary` 行为由 `notes.js` 自己判断：资料库新建、阅读进入编辑、编辑/新建保存。显示提示不能代替业务端再次验证当前状态。
- 旧工具及独立标签页：没有 `setNavigation` 的工具保留既有内部页头与按钮。没有已验证活动子页时宿主根返回保持旧操作，不凭空推断历史。独立标签页不创建虚假的扩展列表路由。

## R1.2 兼容性调查（历史记录，不代表当前准入状态）

| 扩展 | 已检查的源码头部 | 本轮处理 |
|---|---|---|
| Bookmark Manager | `bm-head` 中含「书签管理」标题、刷新 | 候选重复标题；涉及现有 React 生命周期，需单独适配 |
| Reading TOC | `toc-head` / `CONTENTS`、目录模式 | 目录与网页锚点切换独立，本轮保持原 UI |
| Cookie Editor | `site-bar` 网站选择与状态 | 非产品标题重复；高权限网站状态保留 |
| Prompt Shortcuts | `ps-head` 含新建及辅助标题 | 高频操作保留，不重复添加框架新建 |
| AdBlock | React `App.jsx`，索引 HTML 仅根节点 | JSX 与规则编辑属于独立流程，待专项审查 |
| AI VIP Share | `ai-vip-brand` 中有 Logo + 产品标题 | 可能占用空间，待下一轮低风险减法评估 |

本轮优先正式剪藏，其他六款未声称全部已适配或已达到 UX 95。

## 可验证交付边界

源码级一致性/纯 JS 语法检查、内存级业务导航试验不代表已在真实 React 编译产物或 Chrome 通过。Node 测试、`node scripts/build-sidebar-tool.mjs examples/sidebar-tools/web-markdown-clipper --check-project`、同 ID 1.2.4 升级、浏览器 320/360/400/440px 和 200% 缩放及暗色、键盘触屏、真实存储读回是 Mac Codex 必须关闭的独立验收门槛。
