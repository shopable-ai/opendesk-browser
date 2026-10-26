# 扩展导入审阅：信息层级收敛（2026-10-26）

- Owner / scope: OpenDesk Browser「扩展」安装审阅 UI；仅修改本次列出的五个文件及本记录；主分支 main。
- 原始目标：普通更新先显示产品、版本、权限变化、数据保留和操作；SHA-256、文件路径、规范序列化解释仅在默认收起的技术详情中展示。
- 不变合同：Tool / Page 唯一可信安装器、Host 核验、真实权限请求、二次校验和失败回执；不更改同 ID 替换、权限范围、数据保留规则。
- 风险提示：首次安装显示全部权限；新权限、新网站范围、版本回退和代码异常仍在主审阅中显示；本地安装包保留来源提示。
- 受影响文件：src/ui/sidebar-tools.js、src/ui/sidebar-tools-fields.js、src/ui/react/tabs/tool-host.tsx、src/ui/tool-shell.css、src/ui/extension-center.css。
- 验证：源码一致性检查已进行；真实 Chromium、键盘、移动宽度、构建和现有环境测试均待本地验收，不能标 PASS。

## 交互 HTML 预览及使用（2026-10-26）
- **唯一延续的交互预览**：`prototypes/sidebar/extension-center-r47-frequency-first-preview.html`（沿用既有文件，没有另建重复入口）。
- **查看方式**：将仓库以静态 HTTP 方式打开，在浏览器访问 `/prototypes/sidebar/extension-center-r47-frequency-first-preview.html`；样式直接引用仓库现有 `src/ui/design-tokens.css`、`design-system.css`、`tool-shell.css` 与 `extension-center.css`。普通文件本地打开也应能解析相对路径，前提是保留仓库目录结构。
- **默认展示**：书签管理 v0.3.11 → v0.3.12 正常更新的安装审阅弹层，权限未变化，SHA-256 技术详情默认折叠。
- **其他演示**：先关闭弹层，然后点击右侧「导入／更新审阅」按钮选择首次安装、新增权限、网页增强、新增网站、降级、同版本代码变化、官方更新受限。原扩展列表、搜索、筛选、更新、卸载等演示仍保留。
- **安全边界**：本 HTML 是 `SIMULATED_PREVIEW / NOT_NATIVE_CHROME`，可以切换、折叠、键盘操作及选择/拖入文件名，但从不解析、验证或执行安装包，不修改 Chrome 安装记录/网站授权。确认按钮仅模拟回显，不是真实安装。
- **来源边界**：本次增量以正式 `src/ui/react/tabs/tool-host.tsx` 结构和 `src/ui/sidebar-tools.js` 风险策略为基准，继续加载正式样式；正式 Host 不导入此原型 JavaScript。
- **验收**：源码关联和可见 DOM 结构检查已经核对；完整浏览器渲染、布局与 Mac 原生 Chrome 仍需实际验证，不能以模拟完成代替真实 PASS。
