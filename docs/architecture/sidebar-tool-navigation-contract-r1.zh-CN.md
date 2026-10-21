# Sidebar Tool Navigation Contract R1 · 已安装可信框架上的最小层级协作

状态：R1.2 仅对 `web-markdown-clipper` 试点接入。唯一权威仍为 `docs/product/sidebar-ui-spec.zh-CN.md` 及已有 Host/Sandbox 协议；本文是实施边界，不创建新 Router/Host。

## 用户原则

顶部固定唯一 `←` 按钮：根页面回扩展列表，工具内子页面逐级返回；右侧按上下文保留最多必要操作，低频新标签页入口归入可信设置。最近摘录是网页剪藏首页内容，不是中间独立层级。设置由原页面进入时保留原页面实例，返回后恢复；未保存草稿先走原有安全保护。任何扩展未经显式适配，不擅自删掉自己的导航 UI。

## 单一 owner 与消息边界

- 业务 owner：`examples/sidebar-tools/web-markdown-clipper/src/notes.js`，负责 `home → library → reader → edit`、从 `recent → reader` 直返首页、编辑来源、搜索/筛选/滚动以及保存/取消。不得使用 `window.history.back()`。
- 可信呈现 owner：现有 `ToolHost` / `src/ui/sidebar-tools.js`，只绘制标题、左返回及当前上下文图标，根页面仍使用原关闭/生命周期。不得复制一套浏览历史。
- 原版 `src/sidebar-tools/bridge.js` 仍是隔离入口，不允许扩展代码直接修改可信 React DOM。所有消息沿 `SIDEBAR_TOOL_PROTOCOL`，必须通过 `event.origin==='null'`、实际 `event.source`、宿主活动 `instance` 与 `toolId` 验证。工具被关闭、切换或实例重新创建后清空显示提示，旧消息一律无效。
- 只对 `web-markdown-clipper` 暴露 `OpenDeskTool.setNavigation({page})`，`page` 仅允许 `home | library | reader | edit | new`。Sandbox→Host 使用 `kind:'navigation-state'`；Host→Sandbox 使用 `kind:'navigation-action'` 且 `action` 仅 `back | primary`。宿主将页面 ID 映射为内置标题和图标，绝不接受扩展自填可信标题、HTML、URL、脚本或特权操作。
- `busy / dirty` 使用既有 `OpenDeskTool.setState` 与宿主原始生命周期。保存进行时禁止切换；编辑未保存时业务返回触发确认，打开设置前提示先保存或取消。根返回仍通过原有关闭保护。
- `primary` 行为由 `notes.js` 自己判断：资料库新建、阅读进入编辑、编辑/新建保存。显示提示不能代替业务端再次验证当前状态。
- 旧工具及独立标签页：没有 `setNavigation` 的工具保留既有内部页头与按钮。没有已验证活动子页时宿主根返回保持旧操作，不凭空推断历史。独立标签页不创建虚假的扩展列表路由。

## R1.2 兼容性调查（未接入者不自动改写）

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
