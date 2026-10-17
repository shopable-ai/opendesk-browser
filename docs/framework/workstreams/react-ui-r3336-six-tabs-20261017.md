# OpenDesk Browser React UI R33.3.6 · 六 Tab 源码同源预览与迁移审计（2026-10-17）

## 并行范围

- 负责：新增 src/ui/react/preview/sidebar-six-preview.tsx、scripts/preview/build-sidebar-six-react-preview.mjs、测试、专属 CI、本文档。正式业务 Owner/SDK/Installer/权限均未修改。
- Git 唯一可写分支 main。远端安全 CAS 快进提交；无法从云端检查 Mac 本地未提交文件、进程占用和已安装扩展身份。
- 正式产品维持五 Tab（我的 / 扩展 / 工作流 / 开发 / 云控）。调试属于开发构建，正式 tool.html 默认隐藏；统一预览显式显示调试，只允许只读。
- 正式 React 唯一 Root 仍为 src/ui/react/main.tsx。预览是另一个离线 HTML 文件自己的单 Root，不在正式扩展中增设 Root。

## 真实六 Tab 功能 / React 所有权矩阵（基于源码，非合格验收）

| Tab | 正式业务 Owner | 已迁移 React | 未迁移 | 预览 Owner | Mac Native |
| --- | --- | --- | --- | --- | --- |
| 我的 | task-workbench.js、scheduled-task-workbench.js | 无 | 任务列表/搜索/计划/运行/结果/历史 | 真实 DOM 快照，无 Host 数据 | NOT_TESTED |
| 扩展 | extension-center.js、sidebar-tools.js、installed-page-tools.js | tools.tsx：工具栏、列表、详情、空态/状态/恢复等 | 安装、导入、权限审阅、沙箱业务 | 正式 React 组件 + UI_PREVIEW_ONLY 样例 | NOT_TESTED |
| 工作流 | workflow-view.js 与 Provider/RunHost | workflow.tsx：Header、Transcript、Settings Sheet | 输入、规划步骤、执行、结果、取消等仍有旧 DOM | 正式 React 三组件 + 原 DOM | NOT_TESTED |
| 开发 | script-editor.js、local-project.js | develop.tsx：Framework、Dock、状态、结果、目标摘要 | 源码编辑、多文件、参数、草稿、历史 | React 局部控件 + 原 DOM | NOT_TESTED |
| 云控 | cloud-hosting.js、cloud-control-console.js | 无 | 配对、授权、队列、回执、撤权 | 真实 DOM 快照，无 Host | NOT_TESTED |
| 调试（开发专用） | debug-workbench.js | 无 | 只读诊断投影、复制反馈 | 真实 DOM 快照，不读 Host | NOT_TESTED |

离线快照不意味着业务正确水合。特别是我的、云控、调试，不得用示例数据冒充真实运行或授权。「完整六页 React 迁移」未完成，状态 PARTIAL。

## 预览生成与核验

从真实仓库根目录运行：

    node scripts/preview/build-sidebar-six-react-preview.mjs
    node scripts/preview/build-sidebar-six-react-preview.mjs --check
    node --test tests/environment/sidebar-six-react-preview-contract.test.mjs
    open prototypes/sidebar/react-preview/index.html

只用已跟踪的 tool.html 原始六页 DOM、正式 React 子组件、设计 token 和 CSS。禁手工编辑生成的 index.html；SRC checksum + --check 识别漂移。time-review.css 虽被原 HTML 引用，但仓库 src/ui 下没有它的源码，仅构建期样式，故不伪造该内容；正式页面其他五份受追踪 CSS 完整复用。

预览以 UI_PREVIEW_ONLY 标记，数据只在 Preview Adapter 产生。离线 IIFE 和严格 CSP 禁止网络、表单提交、真实 Chrome/Native/Provider/Installer、存储/授权/执行。顶部提供 360/420/520px 与普通/空/加载/运行/错误/拒绝/未知/断线场景。预览支持 ?tab=tasks、tools、workflow、develop、cloud、debug 直达六页。
CI 使用 .github/workflows/sidebar-six-react-preview-r3336.yml：打包单 HTML、校验来源、执行 Node 组件合同及 Chromium 六页截图，并上传 Action Artifact；绝不由 CI 自动改动 main。预览 Chromium 与真实已安装扩展 Mac Native 是不同等级。

## 工程预算审计

- 已审阅 scripts/build-contract.mjs：生产 SW 硬预算 1 MiB，正式 Side Panel ui/tool-shell.js 1 MiB，普通固定 JS 512 KiB，开发 SW 1.5 MiB。原 327680 B 历史 SW 上限已过时。各有不同软审阅线。
- 独立第三方 Sidebar Tool 包仍受 src/ui/sidebar-tools/package.js 与 scripts/build-sidebar-tool.mjs 的 320000 UTF-8 字节总限制、220000 JS 限制等；这不是可信主 Side Panel React 文件的大小阈值。
- native-agent/wire.mjs 的 60 KiB 完整 JSON 消息上限是独立安全协议边界，不随 JSX/React 增长而改变。
- 本轮未跑实际候选打包尺寸，不增加限额。仅在真实超限、证据充分、建包器与安装/存储/回读/恢复/校验链路全部适配并回归通过后考虑调整；优先分包或静态编译。

## 下一步真实阻塞

1. 同候选运行 Node、构建、Chromium 六页截图和 360/420/520、焦点、暗色/缩放、状态对比；无真实 CI 产物不评分。
2. 逐块将我的、云控、调试只读诊断迁给 src/ui/react/main.tsx 的同一 Root；正式业务、Host、Authority 继续旧唯一 Owner。每块单一 DOM writer、订阅清理和复原。
3. Mac 已安装扩展执行两轮标准 Demo Form、Return/RunId/ResultId/sourceHash、真实 Stop 与撤权；不能用 Mock Chromium 替代。
4. 在不占用其他 Agent 共享 dist 时完整运行 npm run check、npm run build、npm run build:dev、npm run verify、npm run build:size 和对应定向测试。

## 评分边界

React 六页完整迁移：PARTIAL；业务闭环：NOT_TESTED；同源预览与 Chromium：等待 CI；Mac Native：NOT_TESTED；专家独立评分：NOT_SCORED，不能以静态合约或截图自行补成 95+。
