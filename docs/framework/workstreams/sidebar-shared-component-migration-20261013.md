# Side Panel 公共组件外观迁移 — 2026-10-13

## 本轮目标与权限

仓库 `shopable-ai/opendesk-browser`，唯一集成分支 `main`。从用户交接快照 `f039d5f625212f6f5b6d8353d7898fa0522bbc0a` 读取最新主线后，直接迁移 **可信 Side Panel 宿主**（不改工具 iframe / 用户代码执行世界），尤其修复工作流首次点击“同意并生成”长按钮以及开发页普通组件观感割裂。

仅修改以下功能相关文件：

- `src/ui/design-tokens.css`：统一颜色角色、正文/说明/技术字号、34px 图标尺寸等。
- `src/ui/design-system.css`：公共按钮、图标按钮、表单字段、文字、说明、带框/无框折叠区、警告和结果展示的默认外观。
- `src/ui/tool-shell.css`：删除已被公共组件承担的 Developer/Workflow 外观覆盖；仅保留正常布局、源码编辑器等宽字体、控件排列。
- `src/ui/tool.html`：开发页/工作流静态 DOM 的公共角色迁移；我的、工具、目录、云控、诊断等现有按钮与字段复用；原 IDs/输入内容/ARIA 仍保持。
- `src/ui/workflow/workflow-view.js`：动态创建的步骤、参数、按钮复用公共角色；许可提示与窄图标拆开，继续调用原有授权流程。
- `tests/environment/sidebar-component-contract.test.mjs`：新增源码反退化测试（Node 内置测试 runner）。
- `docs/architecture/sidebar-design-system-r20.zh-CN.md`：在既有 R20 补充公共组件和例外，不新建另一套规范。
- 本文件：迁移及验证交接记录。

没有修改原生 Host、Task 执行、SDK、远端授权与工具安装逻辑，也没有修改 manifest、CSP、构建链、Node 依赖。

## 已实施功能树（源码级）

- **Workflow 消息发送**：`workflow-ai-plan` 从“首次许可自动加宽的图文按钮”恢复为 **固定 34px 图标**；文字节点保持隐藏；按钮 `aria-label`、`title` 根据许可状态更新，模型接收方/信息范围/网页读取的独立许可仍在旁边可见。保留 `isTrusted` 及 `modelConsent.approve` 的事件路径。
- **开发 — 直接编辑**：当前网页与源码操作栏、JS/React/Vue 类型选择、textarea、依赖高级区、结果、历史、技术身份、版本与目标高级设置使用公共按钮、输入及折叠类；编辑器等宽字体和高度是合理的业务几何例外。
- **开发 — 本地项目**：刷新、连接、固定版本确认、首次连接说明、高级诊断、项目参数使用同一组件契约。首次说明保持边框和可点击标题，正文不随标题一起染蓝。内部技术折叠不继续套一层卡片。
- **Workflow 其他控件**：静态与动态表单/按钮、危险移除、工作流卡片采用相同视觉原语；`od-surface--padded` 统一内部留白。
- **其他正式 Tab**：我的 / 工具 / 发现目录 / 云控的普通操作和基础表单接入 `od-button` / `od-field`；导航选项、类别筛选、工具 iframe 和业务专属组合继续隔离；这不表示已统一全部独立工具的内部 UI。

## 固定组件规则

- 普通容器边框 `--od-line`；表单边框 `--od-input-border`；主操作 `--od-brand`；焦点/错误/警告按明确角色切换。
- 普通正文 `--od-body-size` 13px；说明 `--od-note-size` 12px；技术数据 `--od-meta-size` 11px；段落内粗体只增加权重，不改变颜色或字号。
- 组件自己负责边框、内部 padding 和圆角；业务级 CSS 只定义 `gap`、`display`、宽度、必要的几何约束。
- 无需向 Side Panel 引入 Tailwind/Preflight，且不能把这些规则注入第三方 iframe。

## 证据与验收边界

| 项目 | 本轮状态 | 实际依据或阻塞 |
| --- | --- | --- |
| GitHub 主线源码读取、修改和提交 | **DONE** | GitHub 文件更新成功；每次修改都基于目标文件最新 SHA |
| 源码条件核对 | **PASS：13/13** | 本轮使用连接的 GitHub 实时文件内容检查静态 ID、组件角色、动态代码、授权调用、首次许可定宽规则与 token 入口；后补还核对 6 条业务规则不再负责普通组件外观 |
| Node 内置定向测试文件 | **CREATED / NOT_TESTED** | `tests/environment/sidebar-component-contract.test.mjs` 已写入；当前环境无法挂载用户 Mac 仓库，也未获得可执行的本仓库 Node 工作区 |
| `npm run check`、`npm run verify`、生产/开发构建 | **NOT_TESTED** | 当前会话没有挂载 `/Users/shopme/Documents/workspace/opendesk-browser`；没有用 Linux 空工作区冒充测试 |
| 320/360/420px computed styles 与屏幕截图 | **NOT_TESTED** | 既有 `scripts/tests/sidebar-r19-layout-visual.mjs` 可用于静态 Chrome，但本轮尝试调整该文件时因并行 SHA 漂移被远端 409 拒绝，**没有覆盖它** |
| 用户 Mac 真实扩展 Side Panel、真实 Run/Stop/授权 | **NOT_TESTED** | 尚无当前源码/打包候选绑定的用户 Mac Chrome 原生证据 |
| 产品视觉专家 95+ | **NOT_SCORED** | 缺最终真实渲染、原生及功能回归证据，不提前声称达到 95 分 |

### 遗留及后续最短路径

1. 由现有视觉测试文件的写入负责人核对其入口：`tool.html` 实际四份样式（包含 `cloud-hosting.css`），旧 R19 就绪断言仍使用 `styleSheets.length===3`；源码编辑器已按公共控件圆角 8px，不应继续无条件期望旧 12px；开发节间距需按当前 R27 `--space-3` 实测，而非强制沿用旧 8px 断言。补充“相同角色/相同状态” computed style 对比，再执行必要的一次真实静态 Chrome 测量。
2. 在有仓库与 Node 的工作环境运行新建定向测试、`npm run check`、必要构建与 `npm run verify`；对失败只修实际受影响内容，不扩大到无关 SDK/定时任务产品。
3. 用户 Mac Chrome 装载这次对应的构建候选，核对直接编辑、本地项目、首次说明、历史、错误/禁用、工作流发送，以及其他 Tab 的代表性组件；记录截图、computed style 和候选 SHA，再给 95+ 评分。

**并行协调**：本轮更新 `scripts/tests/sidebar-r19-layout-visual.mjs` 被 GitHub 以文件 SHA 冲突拒绝；没有强制重试、reset 或覆盖其他工作。保持该文件原状，并把待更新项列在本工作流，不把阻塞扩展到其他独立文件。
