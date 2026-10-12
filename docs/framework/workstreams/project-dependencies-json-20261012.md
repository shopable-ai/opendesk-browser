# 项目依赖与 JSON 分发收敛 · 2026-10-12

## 本轮范围与状态

用户指定 `examples/programs/page-ui-react-direct/package.json`，要求重新判断第三方网络依赖、JSON 工具安装、油猴兼容与目标网页注入的关系。

源码核对基线：`b77a2a80ae026c30746ab0329f957d467fddb72e`。仅在远端 `main` 写入设计文档及示例 README；没有创建分支、Worktree、PR，没有改运行代码、权限、包格式或旧冻结产物。

- 架构结论：项目/标准 import/锁与 JSON 分发为主；@require 仅保留原兼容边界，不集成上一轮尚未提交的依赖审批面板。
- 实际冲突：`execution-source.js` 明确禁止 @opendesk-lib 与 @require 混用；恢复面板不能使固定 React + 外部库自动工作。
- 实际格式：sidebar-tool.v2 已存在，其 requires 只接受 browserSdk=1.0.0，不是通用 CDN 依赖列表。
- 加载设计：在准备/安装阶段固定依赖字节；在消费者同一 USER_SCRIPT 或同一工具 sandbox 中初始化；不向网页 MAIN 插入 CDN 标签作为默认实现。
- 原生与供应链边界：JSON、缓存、哈希不会自动授予特权或保证商店通过；复用字节不共享授权；Stop 不承诺撤回第三方所有副作用。

## 已写入

- [设计与实施合同](../../architecture/browser-framework/project-dependencies-json-and-execution.zh-CN.md)，提交 `aa72f6dfa5d51514e947d77a72bda07bb38e6f6e`。
- [React Direct README](../../../examples/programs/page-ui-react-direct/README.md)，新增项目依赖/JSON/执行世界说明，提交 `1a2eabf398750f8a40719e033df7f30d5f684172`。更新使用原文件 blob SHA，保留其他 Agent 已有内容。

## 验证与复用

本轮为文档修改和只读源码核查，没有执行产品测试、构建、CDN 下载或 Chrome 驱动；没有占用 Mac Chrome profile、端口、dist、数据库。容器尝试只读克隆公开仓库时 DNS 解析失败；实际核查与写入通过 GitHub 连接器完成，不代表访问过用户 Mac 工作区。

React/Vue 既有回执仍只属于其原候选，本轮不重跑、不改写、不提升为 ECharts 或外部依赖新能力证据。

## 后续仍须完成

1. 在现有 ESM/React 准备链测量真实 ECharts 最小模块构建、图/资源字节和最终 JSON/Native 报文；不预先放大上限。
2. 小依赖沿用现有固定包；若大型库需要独立运行资源，同时实现版本化 schema、构建、安装存储、哈希/授权、同世界装配和回收，不能只添加 JSON 字段。
3. 浏览器仅源码模式的新 npm/HTTPS 依赖准备仍需实现；不能要求使用者修改扩展，也不能用本地 CLI 演示冒充浏览器闭环。
4. 取得同一候选真实 ECharts 渲染、数据更新、resize、Stop、重跑、离线、撤权、导航和更新/卸载证据后才能关闭对应功能。

当前状态：`ARCHITECTURE_DOCUMENTED`；ECharts 与通用浏览器依赖准备仍为 `NOT_IMPLEMENTED_OR_NOT_VERIFIED`，不是 95+ 或生产 PASS。
