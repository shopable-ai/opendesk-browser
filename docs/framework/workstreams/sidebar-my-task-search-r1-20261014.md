# 「我的」单列表任务搜索与计划隔离（2026-10-14）

- 本轮 ChatGPT Web / GitHub connector；唯一写入分支 `main`，基线 `bb3d955a0cf4ba688b9d79d8379be21e713917a2`。当前无法访问用户 Mac 工作树、真实 Chrome Profile、现有 watcher、dist 或 ZIP，不能读取本地未提交修改；远端写入采用原子提交与分支 HEAD 校验，不改其他来源。
- 写入范围：`src/ui/tool.html`、`src/ui/task-workbench.js`、`src/ui/tool-shell.css`、`tests/environment/task-workbench.test.mjs`、`tests/environment/sidebar-product-contract.test.mjs`、`tests/environment/sidebar-ui-preview.test.mjs`、`tests/environment/extension-center-r4.test.mjs`、`tests/environment/scheduled-task-ui-r1.test.mjs`、`docs/product/sidebar-ui-spec.zh-CN.md` 和本文。
- 真实缺陷：旧 `#task-local-discovery` 位于 `.tasks-surface` 之外；打开定时计划只隐藏后者，导致检索区泄漏到计划列表/创建/编辑页；旧 `#local-discover-cards` 重复已安装任务列表与导入操作。
- 实施：搜索图标按需展开、默认全部、当前网页/已停用筛选与搜索统一过滤 `#task-installed-cards`。停用与精确 origin 安全逻辑不变；已安装身份、未保存参数、执行/停止归属、Task Catalog/Authority、Schedule 数据合同不变。定时计划复用原有独立二级视图。
- 组件目标：0/1/多任务、当前网页受限、已停用、搜索空结果、切换/焦点/参数、明确导入、计划视图隔离、300/320/360/420/520px 和 125%/200% 缩放。
- 完成状态：源码补丁已编排；组件与 CI 证据需关联实际合入候选，真实 Mac Chrome、原生交互、静态宽度/溢出截图及产品 95+ 均为 `NOT_TESTED`，不可自动升级。保留全部历史证据与失败结果，未触及 AGENTS、旧工作流、公共验收账本、dist/ZIP。
