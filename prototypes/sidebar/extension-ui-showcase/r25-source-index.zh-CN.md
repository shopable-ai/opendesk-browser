# R2.5 Layout Pattern / Group · 真实源码索引

**先点开 [R2.5 完整互动 HTML](./r25-layout-patterns.html)，选择模式，再从右侧“真实源码入口”打开对应代码。** 预览为 `CHAT_ADAPTER_NOT_SOURCE_HTML`，只展示可点击的设计模拟状态；不是已有 React 编译产物或浏览器安装结果。

[Group 决策与 16 Pattern 完整 Recipe](../../../docs/framework/extension-ui-layout-recipes-r25.zh-CN.md) · [前置 R2.5 设计基线](../../../docs/framework/extension-ui-reference-patterns-r25.zh-CN.md) · [R2.3/R2.4 历史版本](./README.zh-CN.md)

## 1. 按你要开发的功能找布局

| 用户任务 | 推荐 Pattern / 演示入口 | 从哪些真实文件阅读 |
|---|---|---|
| 做一个设置页，不想堆 Card | **P02** Section + Settings Group；P01 标题和操作 | `src/ui/design-system.css`、`src/ui/react/tabs/locale-manager.tsx`、`src/ui/react/tabs/tool-host.tsx` |
| 做搜索、筛选和列表 | **P03** Search Toolbar + **P04** List Row | `src/ui/react/tabs/tools.tsx`、`src/ui/extension-center.css` |
| 树形数据 + 详情/编辑 | **P05** Tree + **P06** List→Detail→Edit + **P15** Wide Inspector | `examples/sidebar-tools/bookmark-manager/src/react/App.jsx` |
| 紧凑文本表单、选填设置 | **P07** Form/Input Group + **P13** Recovery | `examples/sidebar-tools/prompt-shortcuts/src/index.html`、`src/style.css` |
| 代码编辑器 + 运行和回执 | **P08** Code Workbench | `src/ui/react/tabs/develop-editor.tsx`、`develop-execution.tsx` |
| Cookie 属性、权限及敏感值 | **P09** Dense Data + **P11** Permission | `examples/sidebar-tools/cookie-editor/src/index.html`、`src/react.css` |
| 导入、格式检查、权限确认 | **P10** Import + **P11** Permission + **P12** Dialog | `src/ui/react/tabs/tool-host.tsx`、`tools.tsx` |
| 更多菜单、删除、撤权 | **P12** Menu/Dialog + **P13** Feedback | `src/ui/react/tabs/tools.tsx`、`bookmark-manager/src/react/App.jsx` |
| 语言与翻译资源 | **P14** Locale Daily/Advanced | `src/ui/react/tabs/locale-manager.tsx` |
| 空态、无匹配、恢复入口 | **P16** Empty/Loading | `src/ui/extension-center.css`、`tools.tsx` |

## 2. 真实源码跳转（与 HTML 内 P01–P16 同一映射）

| Pattern | 源码 | 类型 | 当前事实 |
|---|---|---|---|
| P01 | [DevelopContextHeader](../../../src/ui/react/tabs/develop-editor.tsx) | SOURCE_HOST_REACT | 已有 Header/Action Group |
| P02 | [Design System](../../../src/ui/design-system.css) | SOURCE_HOST_CSS | 已有 `od-surface`、`od-stack` |
| P03 | [ExtensionToolbar](../../../src/ui/react/tabs/tools.tsx) | SOURCE_HOST_REACT | 已有 `ec-search` |
| P04 | [Extension rows](../../../src/ui/extension-center.css) | SOURCE_HOST_CSS | 已有 row 主体与 More 分组 |
| P05 | [Bookmark Tree](../../../examples/sidebar-tools/bookmark-manager/src/react/App.jsx) | SOURCE_TOOL_REACT | 已有树、虚拟化/键盘 |
| P06 | [Bookmark Inspector / draft](../../../examples/sidebar-tools/bookmark-manager/src/react/App.jsx) | SOURCE_TOOL_REACT | 已有 dirtyDraft/error |
| P07 | [Prompt Shortcuts HTML](../../../examples/sidebar-tools/prompt-shortcuts/src/index.html) | SOURCE_TOOL_HTML | 已有正文、选填设置 |
| P08 | [DevelopExecution](../../../src/ui/react/tabs/develop-execution.tsx) | SOURCE_HOST_REACT | 已有运行状态与诊断 |
| P09 | [Cookie Editor HTML](../../../examples/sidebar-tools/cookie-editor/src/index.html) | SOURCE_TOOL_HTML | 已有属性与权限状态 |
| P10 | [ToolHost ImportSheet](../../../src/ui/react/tabs/tool-host.tsx) | SOURCE_HOST_REACT | 已有可信导入入口 |
| P11 | [ToolHost capabilities](../../../src/ui/react/tabs/tool-host.tsx) | SOURCE_HOST_REACT | 已有能力预览 |
| P12 | [ExtensionRowMenu / UninstallDialog](../../../src/ui/react/tabs/tools.tsx) | SOURCE_HOST_REACT | 已有 Portal/焦点逻辑 |
| P13 | [Bookmark humanError](../../../examples/sidebar-tools/bookmark-manager/src/react/App.jsx) | SOURCE_TOOL_REACT | 已有未知结果处理 |
| P14 | [LocaleManager](../../../src/ui/react/tabs/locale-manager.tsx) | SOURCE_HOST_REACT | 已有日常与资源分层 |
| P15 | [Bookmark Inspector](../../../examples/sidebar-tools/bookmark-manager/src/react/App.jsx) | SOURCE_TOOL_REACT | 已有 Inspector，窄屏待验 |
| P16 | [Extension Center CSS](../../../src/ui/extension-center.css) | SOURCE_HOST_CSS | 已有空态样式入口 |

此表链接的是随 `main` 演进的真实源路径；HTML 中只是摘录。**具体可复制代码**详见 [Recipe](../../../docs/framework/extension-ui-layout-recipes-r25.zh-CN.md) 中的来源约束与代码块。演示页面本身不产生新的公共组件 API。

## 3. 设计模式与执行世界对应

- **可信 React 宿主**：优先复用 `src/ui/design-tokens.css`、`src/ui/design-system.css`、`src/ui/react/components/ui/` 和 React Aria 的已有实例。只能在当前 React Root 与原业务 Controller/Host 所有权下组合。
- **Sidebar Tool 独立 HTML**：参考 Prompt Shortcuts/Cookie Editor 的正式 HTML + 自己加载的 CSS + 已批准 Browser SDK；不能假设宿主 stylesheet 跨 iframe 生效。
- **Sidebar Tool React/Vue**：按现有 Tool 工程构建，保持 JS/CSS 作用域与工具身份。Bookmark Manager 的共享 UI 构建期导入是既有实现，不代表通用公共入口或受信任宿主权限。
- **默认 360px**；320、400、440 用于侧栏挤压与长文案；960 用于内容容器足够宽时评估 Tree/Inspector 并排。长文本与深色切换是参考页压力演示，非正式视觉验收。

## 4. 参考真实性

| 项目 | 状态 |
|---|---|
| R2.3 / R2.4 保存与历史入口 | `ALREADY_SAVED`，不覆盖 |
| R2.5 新 HTML 与此索引 | `GITHUB_MAIN_SAVED` |
| R2.5 16 Pattern / 6 Business 定义 | `STATIC_REVIEWED` |
| R2.5 内嵌 JavaScript 可解析 | `JS_PARSE_PASS` |
| 演示点击、菜单、Esc/Tab、移动视口和 200% | `NOT_TESTED` |
| 正式 React 编译、真实 Tool HTML/React/Vue 渲染 | `NOT_TESTED` |
| Chrome 存储、权限、安装、正式发布 | `NOT_TESTED` |

不要将“模拟保存成功”“JSON_PARSE_ONLY”“模拟撤权”写成正式功能测试通过。后续若有人修正式扩展，请先核对最新 `main` 与 Agent 文件所有权，只在被真实体验证明的差异点做最小修复。
