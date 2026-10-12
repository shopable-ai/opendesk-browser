# OpenDesk Native Workspace · 文件树优化 R1（2026-10-12）

## 范围与设计决策

真实页面源文件：`src/native-agent/workspace.html`；`native-agent/workspace.html` 是构建后扩展路径，不是仓库顶层源文件。
本轮仅在 `main` 集成。保留文件协议 `opendesk.local-files.v1`、Native 工作区身份/授权、读回核对、草稿、预览和 ChatGPT 编辑流程，不加权限、无网络上传、无额外依赖。

- **目录**：从单层“进入目录后整栏替换”改为常驻根节点 + 子目录按需展开。目录在当前树中展开和折叠，父目录及其余分支仍可见。
- **结构与导航**：文件树采用扁平、分级的 WAI-ARIA `tree/treeitem`，设置 `aria-level`、`aria-posinset`、`aria-setsize`、目录 `aria-expanded` 和当前文件 `aria-selected`，方向键左右折叠/展开、上下移动、Home/End 定位。按钮原生 Enter/Space 激活。
- **内容一致性**：展开仅请求该目录的 `files.list`，本工作区会话内缓存，再展开不重复请求；刷新会重新读取根目录及最多 24 个已展开目录并保留展开结构。新文件创建并读回后读取其父目录链使新文件可定位。
- **安全**：所有列表都核对 workspaceId、path、truncated、条目数量、单个子路径、扩展名及重复路径；异步返回之前比对 Native session、来源、授权和页面 revision。无权、断联或切换时清除目录树；当前未保存草稿仍保留，绝不把缓存当成访问授权。
- **性能边界**：Native 单目录上限 512 条；最多同时展开 40 个目录，主动刷新前 24 个，超限与截断提供可见状态。不跨工作区合并缓存，也不对所有子树执行递归扫描。
- **布局**：电脑端文件树独立垂直滚动，长路径换行并有完整 title，窄屏纵向排列但保留真实树层级，不再退化成可换行的“文件标签”。不新增弹窗。

## 定向检查与验收边界

新增 `src/native-agent/workspace-file-tree.js` 及 `tests/environment/workspace-file-tree.test.mjs`，强化 `tests/environment/workspace-integration.test.mjs` 的目录展开、缓存、刷新保留草稿、工作区隔离、恶意列表拒绝。同步更新 `tests/environment/workspace-style.test.mjs` 的结构与编译 CSS 检查。

建议在无其他 Agent 占用的 Mac `main` 工作目录执行：

```bash
git status --short --branch
npm ci
node --test tests/environment/workspace-file-tree.test.mjs tests/environment/workspace-integration.test.mjs
npm run check
npm run build && npm run build:dev && npm run verify
node --test tests/environment/workspace-style.test.mjs
```

受控 Chrome / Native 验收：确保实际扩展加载 SHA、`sourceId` 绑定工作区，展开多层目录，根目录文件保持可见；编辑草稿后刷新文件树，草稿不丢；创建嵌套文件后显示并读回；切换工作区、断联/撤权后旧树无可读写能力；只读目录、超时、文件冲突、截断、200% 缩放、360/390/768/1280px 宽度、键盘以及屏幕阅读器语义。内存 Demo/Node 测试不替代真实 Mac Chrome、Native 读写与可访问性验收。

## 独立评分门槛（均需实证达标方可标记 ≥95）

| 维度 | ≥95 的核定条件 | 当前证据级别 |
| --- | --- | --- |
| 信息架构 | 多目录同时展开、刷新后保持树结构、路径可辨、状态正确 | 已实现，等待实际浏览器核对 |
| 交互与易用性 | 单击展开、多层定位、明确的刷新/折叠、状态提示 | 已实现，等待实际浏览器核对 |
| 性能与可扩展性 | 惰性请求、有限展开、明确截断反馈、无过量读取 | 静态逻辑与待执行组件测试 |
| 权限与数据安全 | 不扩大 Native 授权、不泄露文件、不写入缓存结果、不误报保存 | 静态逻辑与待执行组件/Native 测试 |
| 可访问性与响应式 | 树键盘导航、语义正确、200% 和窄屏无控件消失 | 待真实 Chrome/人工验收 |
| 回归与可维护性 | 构建/定向 Node 回归及 Native 读写闭环同身份可复现 | 待 CI/本地验收 |

**不能仅凭源码变更宣称各维度达到 95 分或声称真实 Chrome PASS。** 分数应依上述相互独立的证据评定，并在实际验收后填入。
