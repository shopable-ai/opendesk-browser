# OpenDesk Browser React UI R33.3.6 · 正式同源离线预览（2026-10-17）

## 权威源码 / 并行资源
- 唯一 Git 分支 main。本文件属于 R33.3.6，禁止以独立 R23.9.2 HTML 覆盖正式 Workflow 业务。
- 正式 React JSX：src/ui/react/tabs/workflow.tsx；正式单 React Root：src/ui/react/main.tsx。
- 正式 HTML：src/ui/tool.html 中的五 Tab 导航与 workbench-workflow 节点。
- 唯一 CSS：src/ui/design-tokens.css、design-system.css、tool-shell.css。
- 离线 Preview Adapter：src/ui/react/preview/workflow-preview.tsx；只有显示场景，业务 RunHost、Provider、Browser SDK、Chrome 权限全部不可用。
- 生成器：scripts/preview/build-workflow-react-preview.mjs；来源校验包含以上路径以及 package/lock SHA256。
- 交付路径：prototypes/sidebar/workflow/react-preview/index.html；不得手改生成文件。

## 操作和证据
从仓库根目录：
1. node scripts/preview/build-workflow-react-preview.mjs
2. node scripts/preview/build-workflow-react-preview.mjs --check
3. node --test tests/environment/workflow-react-preview-contract.test.mjs
4. 使用 Chrome 打开生成 index.html；默认 360px，工具条可切换 420/520 与空/对话/规划/授权/未知/断线状态。

HTML 离线单文件包含编译的 React 19、正式生产 JSX、正式 CSS 和从 tool.html 实时提取的 DOM，不需要 Vite 服务或本地 Native Host。源码修改后必须重新生成，查看时无需构建。InputSHA256 用于检查资源漂移。

.github/workflows/workflow-react-preview-r3336.yml 构建和运行原有 Chromium 测试，上传离线 HTML 与真实 Chromium 截图，并打印已验证产物的 detached Git blob SHA。CI 不自动写 main，由本轮获授权集成者在核对最新 main、相关输入与 CAS 后提交该 blob，避免覆盖并行 Agent。

## 三 Tab 差异矩阵（真实边界）
| 页面 | 原型 | 正式 React / 业务 | 本轮处理与剩余 |
| --- | --- | --- | --- |
| 工作流 | prototypes/sidebar/workflow/index.html，R23.9.2 独立演示 | JSX 已接管 Header / Transcript / Bottom Sheet；业务状态由 WorkflowView 提供 | 生成真正正式同源 360px HTML；输入/步骤/结果仍是旧 DOM Owner，待完成真实 React 业务迁移 |
| 开发 | prototypes/sidebar/develop/index.html 与 r2-full-preview.html | JS/React/Vue、多文件、草稿、Run/Save/Stop 必须保留 | 复用正式 od-* 和 34px icon，未证明全页视觉差异清零，不迁移业务 |
| 扩展 | prototypes/sidebar/extension-center-r47-frequency-first-preview.html | 列表/详情/工具栏已有 React owner，原 Host 管理权限/安装 | 不做重复 Mock 改版；窄屏/键盘/释放要按实际包单独验收 |

历史原型不再作为正式生产预览。不应该为了视觉一致性机械地把三个 Tab 做成同一布局。

## 安全与本轮未完成
- Preview Adapter 不允许网络、storage、chrome API、RunHost、真实文档读取和真实 Provider；Native 状态永远为离线未连接。网页摘要审批仅为 UI 交互示例，不授予任何正式权限。
- 正式 HTTPS 每轮摘要披露需重新确认；批准摘要不代表运行网页填写/点击权限。
- Preview Chrome 只可记 SOURCE_BOUND_UI_PREVIEW_CHROMIUM；不能升级为 INSTALLED_EXTENSION_NATIVE_CHROME。
- 真实 Mac 两轮输入、RunId/ResultId/sourceHash、task retirement、三 Tab 完整视觉审计、Workflow 编辑/结果全 React Ownership 尚未通过此次离线预览证明；保留 PARTIAL/NOT_TESTED，不伪造 95+ 评分。
