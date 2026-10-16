# 开发页原型 · 审核记录

此目录保存 **OpenDesk Browser 五 Tab 中「开发」视图的离线交互原型**，并不包含可安装扩展的实际权限、运行器或真实 React 组件。

| 文件 | 作用 |
| --- | --- |
| `r2-full-preview.html` | R2 原始完整基线（保留旧的全部显式按钮和功能入口，用于回退与对照） |
| `index.html` | R2.1 最新精简审计版：完整功能保留，减少默认展示的执行概念与低频操作 |

## 设计原则与反方审计

- **不重复发明执行世界**：`Controller` 与 `Page` 是真实运行位置，不是两种并列的语言。默认只显示 `JS / React / Vue`；JS 可选「任务 / 网页」，React、Vue 属于网页组件，运行方式不在同一行重复出现。
- **不把 Git 当作运行发布器**：本地多文件源码版本由 Git 管理；浏览器端固定 `revision/sourceHash` 是任务运行、验证、安装和回执追溯所必需的快照，但不需要默认提供一套可见的“版本管理器”。高级入口在底部更多菜单；发布/安装始终要用户主动完成。
- **Page 自动安装不是日常编辑动作**：单次试运行 → 保存网页增强候选 → 检查并安装；只有候选存在才展示安装，只有安装后才展示启停与卸载；危险卸载有二次确认。已安装内容的日常管理应优先归于「扩展 → 网页增强」。
- **依赖/编译产物是技术证据，不是一个新功能入口**：自动处理 SDK/ESM 锁与 React/Vue 编译，平时不占编辑器首屏；需要排错时仍可从高级选项查看来源、校验、许可证与源码哈希。
- **SDK 不因开发者模式自动向网页越权**：开发者可信 Controller/Page 工作流尽量减少二次点击；网页 Main world 仍可能由第三方脚本调用 SDK。同源请求可用不代表跨站、持久存储、设备 ID 等权限自动授予。保留 exact Origin / documentId / Authority 执行时校验、撤销与不明状态只读检查。
- **间距符合现行宿主节奏**：相邻控件 8px，辅助说明紧邻 4px，独立章节 16px，卡片内部 12px；图标 34px，普通控件 36px，源码编辑区至少 216px，页面 gutter 单一所有者 11px。

## 离线交互证据与限制

R2.1 已在本次会话的 Chromium 静态页面环境做 **23 项交互断言全部通过**：默认单行切换、JS/React 模式回切、模拟 Run/Save/Page 发布阶段、撤销前确认、本地多文件预览、SDK origin 拒绝/审批/文档失效、Esc 关闭、420/360px 横向溢出等；该检查 **不是真实 Chrome 扩展 E2E**。

目前的 `index.html` 仍为原生 HTML/CSS/JS Mock。**不声称**它已通过 `scripts/sidebar-preview-kit.mjs check` 的正式模板合同，也不声称 React 19 / macOS Native 安装验收。下一轮需用仓库正式模板 / Skills 重建最终认可结构，并迁到既有 React 单一 Root / `od-*` 组件，不新增 React Root、不改授权 Authority 合同、不扩张业务范围。

执行参考：
- `.agents/skills/opendesk-extension-ui/SKILL.md`
- `.agents/skills/opendesk-ui-preview/SKILL.md`
- `docs/architecture/sidebar-design-system-r20.zh-CN.md`
- `src/ui/tool.html` / `src/ui/tool-shell.js` / `src/ui/sdk-approval.js`

## 下一步

1. 用户确认可见信息架构及截图；若有不满意，**只**修改 R2.1 对应区域。
2. 使用 `scripts/sidebar-preview-kit.mjs create/check` 或对应平台正式预览流程，通过既有浅色壳和设计 Tokens 输出来源可查、静态可 lint 的 UI。
3. 真正迁入已有 React 19 单一 Root；保留源码编辑器、RunHost、Page 运行、SDK Authority 和原有业务 DOM/事件语义，不用 Mock 覆盖真实操作。
4. CI Chromium + 本地 macOS Chrome 做 E2E；对任意未测试场景标注 NOT_TESTED，不伪造“95+ PASS”。
