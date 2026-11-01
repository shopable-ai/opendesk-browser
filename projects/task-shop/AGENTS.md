# Task Shop 项目维护约定

继承[仓库根 AGENTS.md](../../AGENTS.md)和[项目目录合同](../../docs/architecture/extension-project-layout.zh-CN.md)。本文件只保存 Task Shop 特有边界，不复制公共框架规则。

## 固定恢复入口

先读[README](README.md)、[产品合同](docs/product-contract.zh-CN.md)与[执行计划](docs/execution-plan.zh-CN.md)。固定检索词：`OD-TASK-SHOP`。

- 产品范围只在 `docs/product-contract.zh-CN.md` 维护；阶段、owner、当前断点和证据只在 `docs/execution-plan.zh-CN.md` 维护。
- 商业经济假设在 `docs/business-model.zh-CN.md`，网络/权限/身份合同在 `docs/architecture.zh-CN.md`，命名 SEO 决策在 `docs/naming-and-seo.zh-CN.md`；不得为每次新对话复制长期 GOAL。
- 不在 `projects/webflow/`、`src/`、`native-agent/`、公共安装器/RunHost/Authority、共享任务数据库上写 Task Shop 特有业务分支；需要跨项目共用功能时，先确认公开 API 和实际缺口，由原 owner 处理。
- 本项目任务市场的任务单（market job）**不是**已安装 Controller Task ID；市场上的金额/账号托管授权**不是** Chrome 网站许可或 Native 执行许可。
- 自动接单需清晰的用户选择、白名单、作用域、限额、撤销与审计。禁止把用户登录 Cookie、密码、好友列表或凭据交给市场发布方。不得通过脚本在未征得接收方许可时群发广告。
- 对网页写入、提交、资金转移、账号/权限变化实行独立审阅及未知副作用停止，不让远程任务文本直接执行为代码；任何任务恢复不自动重放 `UNKNOWN` 的副作用。
- 工作流产品、架构、市场、算法和评分均为`PROPOSED`，除非绑定该版本的真实 UI/浏览器/服务/支付回执。文档完成不提升业务状态。
- 暂不创建实际安装包、支付凭据、生产数据、假测试产物或未经审查的后台常驻程序；后续每阶段明确唯一文件 owner 和权限审查。
