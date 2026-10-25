# OpenDesk Extension UI 参考入口（R2.3 → R2.4 → R2.5）

> **用途：设计与交互审阅；不代表正式安装、Host、Chrome 或 React 运行验收。** 此目录不是新 UI 框架、组件包或第二个 React Root。

## 直接打开哪一个？

| 入口 | 角色 | 真实性 |
| --- | --- | --- |
| [R2.5 Layout Pattern / Group 互动参考](./r25-layout-patterns.html) | 16 个布局模式、6 个真实业务映射、右侧源码摘录，支持 320/360/400/440/960px、主题、长文案与恢复状态 | **`CHAT_ADAPTER_NOT_SOURCE_HTML`**；源码已保存、JS 语法解析 PASS；真实浏览器交互 `NOT_TESTED` |
| [正式 React 同源 Showcase 外壳](./index.html) | 装载现有 [React 离线预览产物](../react-preview/index.html)，作为真实源码对照 | `UI_PREVIEW_ONLY`；需先由既有构建流程生成/更新产物 |
| [R2.4 业务导向交互预览](./r24-business-review.html) | 开发、扩展管理、Prompt Shortcuts、书签、Cookie、语言及输入细节；含独立子页/错误状态 | **`CHAT_ADAPTER_NOT_SOURCE_HTML`**，独立内存模拟，不是 React 构建 |
| [R2.3 六场景聊天适配预览](./archive/r23-web-chat-adapter.html) | 历史控件行为、语言、资源、FormRow、菜单、状态对照 | **`CHAT_ADAPTER_NOT_SOURCE_HTML`**；保留用于比较，不推荐作为新 UI 基准 |
| [R2.3 固定 blob 获取器](./archive/r23-source-html-loader.html) | 获取历史 Git blob `e2796f4…` 对应的原始 React 离线 HTML | 历史固定 SHA 与大小；**不是最新 `main`**，首次使用需要 GitHub 网络连接 |

### 直接可用与不可证明的事项

- R2.4 文件为单文件 HTML，内嵌样式、交互与**演示数据**；本轮保存的是此前生成并审阅过的字节，并未修改正式功能。
- R2.4 演示不能读写 Chrome 权限、正式工具存储、Host 或安装器；模拟“保存”“授权”“导入”“运行”只改变预览数据或状态。
- 同源 React Showcase 仅证明对应构建候选的 React UI 行为；没有当前候选浏览器证据时，视觉 / 键盘 / 200% / Mac Chrome 均记 `NOT_TESTED`。
- R2.3 和 R2.4 均是**归档，不相互覆盖**。未来设计迭代另建版本化预览并按证据晋升，不能把 R2.4 适配器直接替换正式 React 入口。

## 原始目标与 R2.5 补足方向

核心目标不是“更多控件”，而是**让独立扩展开发者利用现有 UI 契约，快速选到合适的布局、组件组合和完整交互代码**，并与正式 OpenDesk 的五个 React Tab 保持一致的视觉语言；保留 HTML/React/Vue 旧扩展和 SDK/Host/Installer 兼容。

R2.4 的业务布局已有价值；缺口是 **Group/Section/Form/Toolbar/List/Detail/Action/State 等可复用组合模式的有组织索引、真实源码示例和开发选型说明**。

R2.5 新增参考成果：
1. [完整可点击 HTML（版本化，不覆盖 R2.4）](./r25-layout-patterns.html)
2. [按业务找 Pattern / 真实源码索引](./r25-source-index.zh-CN.md)
3. [16 Pattern、Group 选型与可复用源码 Recipe](../../../docs/framework/extension-ui-layout-recipes-r25.zh-CN.md)

历史设计入口（保留供对照）：[R2.5 原设计矩阵](../../../docs/framework/extension-ui-reference-patterns-r25.zh-CN.md)、[前一轮 R2.5-WEB 执行提示词](../../../docs/framework/prompts/goal-extension-ui-pattern-library-r25-web-20261026.zh-CN.md)。正式 React/Chrome 验收及任何生产修复尚未执行。

### 源码真相和所有权

- 统一 Tokens：[design-tokens.css](../../../src/ui/design-tokens.css)；宿主样式：[design-system.css](../../../src/ui/design-system.css)。
- 正式可信 React：[src/ui/react/](../../../src/ui/react/)；真实 UI 组件：[components/ui/](../../../src/ui/react/components/ui/)。
- 主业务参考：[开发](../../../src/ui/react/tabs/develop.tsx)、[扩展中心](../../../src/ui/react/tabs/tools.tsx)、[ToolHost](../../../src/ui/react/tabs/tool-host.tsx)、[语言管理](../../../src/ui/react/tabs/locale-manager.tsx)。
- 独立扩展示例：[Prompt Shortcuts](../../../examples/sidebar-tools/prompt-shortcuts/)、[Bookmark Manager](../../../examples/sidebar-tools/bookmark-manager/)、[Cookie Editor](../../../examples/sidebar-tools/cookie-editor/)。
- **不可把 `design-tokens.css` 当成允许注入独立 iframe / 网页的公共全局 stylesheet。** 沙箱工具只复用获批准的扩展样式契约或自身受限样式。
