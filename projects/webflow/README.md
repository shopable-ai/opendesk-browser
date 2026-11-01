# Web Flow

OpenDesk Browser 中的独立业务扩展应用：把网页操作、AI 对话输入输出、跨对话交接和任务恢复组织成可追溯的连续工作。

**唯一项目根：`projects/webflow/`。固定检索词：`OD-AI-WORKFLOW-BRIDGE`。**

## 当前状态

2026-11-01，按用户要求建立独立应用目录，并将原产品合同与执行记录迁入本项目。项目归属与文档整理已完成；主分支合并后也保留了并行开发的纯交接校验与单 owner 离线队列模块，详见[离线模块说明](docs/offline-modules.zh-CN.md)。这些模块尚未接实际存储、派发、聊天入口或 UI，Web Flow 仍无可安装应用包。

现有发送队列、计算接力样例和 Bridge 各有源码及不同范围的证据，详见执行计划的事实表。目录存在不代表这些组件已经接成完整产品。

## 从这里继续

| 要了解什么 | 唯一入口 |
| --- | --- |
| 产品目标、BR-01–12、架构与验收边界 | [产品合同](docs/product-contract.zh-CN.md) |
| 当前断点、五阶段、AWB-01–08、依赖与证据 | [执行计划](docs/execution-plan.zh-CN.md) |
| 本项目的代码与文档维护边界 | [AGENTS.md](AGENTS.md)，同时继承[仓库规则](../../AGENTS.md) |
| 公开 SDK、程序类型和安装流程 | [扩展创建工作流](../../.agents/workflows/extension-creation.md)、[项目目录合同](../../docs/architecture/extension-project-layout.zh-CN.md) |

旧的 `docs/product/ai-workflow-bridge.zh-CN.md` 和 `docs/framework/workstreams/web-flow-20261101.md` 仅保留迁移入口，不再维护第二份正文或进度。后续更新本项目内文档，不按聊天新建总 GOAL。

## 应用与框架的分工

**Web Flow 是框架的业务消费者。** 本项目承载工作流的业务规则、任务衔接、上下文交接与结果展示；OpenDesk Browser 保持通用浏览器能力、执行授权、生命周期、安装和存储职责。

| 所属 | 负责内容 | 边界 |
| --- | --- | --- |
| 本项目 Web Flow | 工作流定义与参数、步骤依赖、结果整理、交接包、恢复决策、应用界面与业务测试 | 新增业务实现归本目录；经公开 API 调用执行能力 |
| Browser Framework / SDK | 站点与安装权限、Task Catalog、Authority、RunHost、Controller、Page Session、Durable Result、通用存储/调度 | 不加入仅服务于 Web Flow 的站点选择或业务判断；公共缺口按原流程证明后最小补齐 |
| AI Send Queue | 既有 ChatGPT 单页面消息 FIFO 与发送状态机 | 保留原 owner 和安装身份，不复制一份到本项目 |
| 计算接力与既有 Bridge | 已有可行性样例、原聊天可信交付接线 | 先复用和核验；实际提取业务源码时同步消费者、构建来源与测试，不能只搬文件 |

现有复用入口：

- [AI Send Queue](../../examples/sidebar-tools/ai-send-queue/README.zh-CN.md)：唯一 owner 为 `examples/sidebar-tools/ai-send-queue/`。
- [ChatGPT 计算接力](../../examples/tasks/chatgpt-relay-calculator-r1.README.zh-CN.md)：已有 Controller + AppStorage 的固定 A→新对话 B 源码样例，真实 Chrome 仍按该 README 的证据等级。
- [公开 Sidebar API](../../docs/api/sidebar-tools.zh-CN.md)、[Page API](../../docs/api/page-userscript.zh-CN.md)、[Controller](../../docs/api/controller.zh-CN.md)：接入以真实公开能力与目标执行世界为准。

## 扩展类型与执行世界

本项目的产品形态为**组合式应用（Combined Application）**。一个产品入口可以组合多种执行职责，每种职责仍遵守自己的合同。

| 架构项 | 当前决定 |
| --- | --- |
| 产品/源码归属 | `projects/webflow/`；属于业务应用，不新增一个 Browser Framework |
| 应用界面 | 实现时按 Sidebar Tool 沙箱合同接入；不因目录归属取得可信 Host 权限 |
| 网页执行 | 使用原 Controller Task / 必要的 Page 程序；各自站点与安装身份独立 |
| 后台与恢复 | 使用已批准的持久化及调度能力；先完成能力探测，不预设任意后台 JS 可安装 |
| 当前主流程 | 目录与文档整理；进入应用 UI、脚本或打包阶段时按仓库现行 Skill 路由选择对应主 Skill |
| 框架改动 | 当前未证明需要；不足先记 `SDK_GAP_NOT_PROVEN`，保留可复现缺口后交原 owner |
| 安装包 | 尚未生成。Sidebar 按原工具打包合同；Page/Task 按原候选、验证与安装合同，不创建新格式 |
| 验收 | 文档结构、源码/组件、真实 Chrome、业务通过与正式发行分别记录 |

## 后续核心代码放在哪里

以下为**归属约定**，对应模块开始实现时再创建目录和文件；目前没有占位代码或空目录。

| 项目内路径 | 后续职责 |
| --- | --- |
| `src/workflow/` | 业务步骤、依赖、参数与推进规则；不实现第二套 RunHost 或执行权限 |
| `src/tasks/` | 确无现成任务可复用时的 Web Flow 专属 Controller 源码；仍走独立的原 Task 安装合同 |
| `src/handoff/` | 最小上下文交接、结果引用、目标仓库证据检查及接收状态 |
| `src/adapters/` | 通过已批准公开能力对接站点任务与产物；不直接导入宿主私有特权模块 |
| `src/ui/` | 工作流入口、队列/结果/阻塞的应用展示；展示状态来源于同一权威记录 |
| `tests/` | 本应用的业务与边界测试、必要 fixture；框架公共合同测试留原 owner |
| `docs/` | 本项目唯一产品合同、执行计划及确有需要的技术说明 |

`tool.config.json`、构建文件和正式包随实际运行入口及安装需求加入。当前无需预装依赖或先构造一个空的可安装应用。

## 下一步

从[执行计划第 6 节](docs/execution-plan.zh-CN.md#6-当前断点与下次续接提示)读取唯一下一条未完成操作。先验证原有能力与真实阻塞，再完成一项可核对的用户操作；新增 Web Flow 业务实现归本项目，既有模块的修复仍由原 owner 负责。

本次目录整理只改变文档和业务归属，不提升任何功能的完成状态。后续每次推进都在同一执行计划更新阶段、owner、已完成证据、阻塞、下一步和延期事项。
