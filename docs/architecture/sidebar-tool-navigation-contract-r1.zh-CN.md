# Sidebar Tool Navigation Contract R1 · 已安装可信框架上的最小层级协作

状态：R1.2 是 `web-markdown-clipper` 的历史试点；R2 增加当前共享标题呈现规则。唯一权威仍为 `docs/product/sidebar-ui-spec.zh-CN.md` 与已有 Host/Sandbox 协议；不创建新 Router/Host。

## R2 单行动态标题（现行增量，2026-10-26）

**用户问题**：已安装应用进入宿主可信“设置”后仍只显示应用名；部分已接入官方导航的内部页面只显示「编辑」等短标题，缺少所属扩展上下文。不因此增加第二条导航栏。

| 真实当前页面 | 唯一页首标题 | 原返回按钮 |
| --- | --- | --- |
| 书签管理首页 | `书签管理` | 回扩展列表 |
| 书签管理可信设置 | `书签管理 / 设置` | 返回原工作区；从管理入口直接进入时正常打开工具 |
| 已验真官方工具编辑子页 | `工具名称 / 编辑` | 交给业务现有 `back` 与脏草稿保护 |
| 未接入官方导航的旧/第三方工具 | `工具名称` | 保留工具自身子页导航，不推断 iframe 历史 |

- **单一展示 owner**：`src/ui/sidebar-tools.js` 从现有 `tocSettingsOpen`、经过可信准入的业务 `navigation-state` 和安装元数据生成 `sidebar-tool-title`；仅抽出纯文本助手 `src/ui/sidebar-tools/title-path.js`。不新增 Nav、面包屑条、Router 或历史栈。完整文字与版本可从标题悬浮提示看到；小屏继续沿用既有截断布局，不压缩操作点击区域。
- **状态优先级**：可信设置高于业务子页显示；退出设置恢复此前有效业务标题；根页不追加「/ 首页」；工具自行上报完整路径时不重复前缀。视觉提示不能自动赋予一个子页面 Back 权限；业务动作 owner 不变。
- **信任边界**：只有与官方登记完整包字节一致、当前安装代际、iframe 实例和来源核对通过的沙箱才可用 `OpenDeskTool.setNavigation` 更新 Host 页名。手工同 ID、过期实例、未验真工具继续使用自己的 UI；绝不从任意 iframe 文本构造可信页头或修改权限。
- **不是路由的界面**：书签管理可信 React 的详情 PreviewPane、新建/编辑 Sheet、确认 Dialog 均保留自身标题及关闭事件。不得只因弹层出现就显示虚假「/ 编辑」并让全局返回退出整个扩展；若日后提升为真正全页子视图，需要同时接通真实业务返回和草稿保护。
- **发行边界**：本轮仅修改 Browser 共享 Host 源码；`bookmark-manager` 正式 JSON、配置版本、能力和业务 SDK 均不变。要在已安装浏览器看到变化，需要更新/重载包含新 Host 的 Browser。真实 Mac Chrome 未执行前标记 `NATIVE_NOT_TESTED`。
- **定向验收**：主界面 → 设置 → 返回原界面；已验真业务根页 → 子页 → 设置 → 原子页；旧/第三方沙箱不越权；标题窄屏完整提示与键盘可访问；脏草稿保存中返回不丢失。对应测试：`tests/environment/sidebar-tool-header-title-r2.test.mjs`、`sidebar-tool-hierarchical-back-r12.test.mjs`。

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
