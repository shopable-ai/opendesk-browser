# WebCodex 当前对话编辑 Demo R2

状态：IMPLEMENTED / COMPONENTS_PASS / BUILDS_PASS / NATIVE_CHATGPT_NOT_TESTED。日期：2026-10-10。写入负责人：本对话 root；三位子任务仅只读研究、审计。此状态不是正式 Native、Windows、F3 或 ZIP 安装验收关闭。

## 范围与资源

用户要求找回 Native Messaging / ChatGPT 网页读写本地文件的历史工作，确认可行性并直接推进 Demo。延续 R1 文件工作区，在现有 `native-agent/workspace.html` 增加单文件上下文导出、用户触发的 ChatGPT 回答读取、结构化提案预览、采用草稿和保存回执。此模式不是官方模型 MCP 工具注册。

- Browser 主分支：`main`；本轮目录 `/workspace/scratch/b6798df15a04/opendesk-browser`；基线 `646f02798a95d642f5d5b22af4d37d0025661166`。
- 不创建分支或 worktree；仅 root 写入当前目录，其他对话目录只读。
- OpenDesk `master` 只读，初始核查 `c82850a8`，最终远端复核 `5f09dc9d`；不接管其他对话正在做的 CLI / Dev / R16。
- 测试和构建仅使用本轮目录、专属 `docs/framework/evidence/webcodex-chat-edit-r2/`、新建临时 profile/端口；不接管旧进程或旧证据。
- resources.released: true；本轮没有启动真实 Chrome 或接管其他会话进程，构建子进程均已退出。

## 证据复用与必要验证

已读 `AGENTS.md`、`testing-guide.md`、`parallel-development.md`、`workstreams/webcodex-workspace-r1.md`。最新用户及 AGENTS 的主分支规则优先于历史默认分支说明。

R1 的 Native 文件协议、可信 workspace 顶层入口、Go SHA 保存与未知效果语义不变；既有组件记录作为原版本证据保留。R2 修改 workspace UI，新增回答文本适配，属于 AFFECTED_INPUTS；补上下文/提案绑定、多个 assistant 块、SPA URL、流式回复、重复导入、草稿保护和显式保存 UI 定向验证。重新生成同源内存 Demo、校验受影响构建。Native/MCP/Windows 实机不从内存或 DOM fixture 推导 PASS。

## 已确认的配套边界

`opendesk browser dev` 不是文件 Demo 前提；已有 `browser workspace add --path … --access read-write` 授权目录，文件协议为 `opendesk.local-files.v1`。本轮不扩大 `project.resolve`、R16 planner 或页面 SDK 的权限。

Chrome Native Messaging 本身支持 Windows，但当前 Go 与旧 Node Host 均只有 macOS/Linux 实现。Go `internal/browserbridge/unsupported.go` 在 Windows 返回 `E_PLATFORM`；Windows Native 平台移植与实机验收尚未交付，不是浏览器 UI 更新能够解决的问题。

## 实施与并行集成

- R2 实现本地提交 `e9cba891`；两轮 R17 相关集成分别为 `fb1d7d92`、`28cd671e`。
- `9aa80683` 修复 sourceId 导航：指定来源缺失时不加载历史或默认的其他项目，首次解析或用户明确选择后消费导航意图，刷新不再覆盖选择。
- R17 的离线草稿、目录历史、实时工作区身份、files.changed、多来源握手均保留；R2 只使用已连接且当前选择匹配的实时工作区，不把缓存作为授权。无效目录列表关闭实时访问；异步文件基线读取核对刷新代次。
- 内存 Demo 改用符合协议的 opaque workspace ID，解决 R17 严格列表校验后的初始化回归。
- 后续同步 `9df81513` 时，另一任务也修复了同一 Demo ID 问题。合并采用本轮已验证的统一 opaque ID 数据方案，保留严格列表验证和异常列表关闭访问；没有引入另一套宽松 Demo 列表规则。最终相关扩展源码仍与 `9aa80683` 一致。
- Go `5f09dc9d` 已提供 Dev 临时只读工作区与 sourceId 关联。已有正式目录可复用原读写权限；R2 不依赖整个 Dev 命令收尾。
- `f0927430` 只合入另一任务的 Node Dev CLI、npm 包和独立打包脚本；与 `9aa80683` 相比，扩展源码、manifest、依赖、WXT 配置、相关构建/校验/演示生成输入无变化，复用原构建，不声称在新提交重建。

## 实际验证

原始记录与哈希索引见 [专属证据](evidence/webcodex-chat-edit-r2/README.md) 和 [机器摘要](evidence/webcodex-chat-edit-r2/verification.json)。

| 层级 | 结果与边界 |
| --- | --- |
| 定向组件 | 同一执行的三个测试文件共 63 PASS / 0 FAIL / 0 SKIP；包含 18 个 R2 测试，其他为原文件/Native bridge 回归 |
| 完整工作区 DOM 模型 | 正式 HTML/UI + 内存后端：生成/审阅零写入，采用零写入，显式保存一次并读回，外部冲突保留磁盘与草稿 |
| R17 集成 DOM 模型 | 离线保留草稿、目录消失不替代、异常目录清空权限、排队刷新拒绝旧基线、sourceId 导航与手选保持 |
| 同源独立 Demo | 生成后的实际 bundle 在 DOM 模型中完成上下文、提案、采用、保存和 memory-only 回执；未进行 Chrome 渲染验收 |
| 源码/合同检查 | `9aa80683` 候选检查 276 个 source/test/build 文件，语法、固定入口、严格 CSP 与许可检查通过 |
| Production / Development | `release-builds` 两份回执均 passed，构建期间输入漂移为空 |
| 独立产物复核 | 双包各 15 个相关源输入与 settings.js 哈希一致；生产注入函数只有 location/document/globalThis 自由引用，可独立序列化 |
| ZIP | 正式生产包校验及确定性打包通过，安装验收 NOT_TESTED |
| 真实 Chrome / ChatGPT / Native | NOT_TESTED；当前环境 Unix Socket 探测 EPERM，未用模拟结果冒充真实页面或本机写盘 |
| Windows | NOT_IMPLEMENTED / NOT_TESTED；当前 Go 平台仍返回 E_PLATFORM |

构建候选（本地历史）：`9aa806835d6e1f6a0b02695f6ca2d82d575b8ee5`。首次无相关输入变化的集成提交：`f0927430d51583e9f365d5307393c54291f7b9b0`。

- Production packageHash：`2bf5c042a382775ba195a2be953ea3a14e8c0822da2b72222e73e3a9425052db`。
- Development packageHash：`41390858a85603a9eaedb95c2104a1ee71c35d510ba86d0debda2d152c4b15d4`。
- 生产 ZIP SHA-256：`ee926ef393bf71654100e62d450775f7b71c60823d65d6f02d8317aff57c5671`。

## 环境失败与传输说明

构建过程中保留了 PID 重用导致的旧锁拒绝记录。仅在确认本轮原构建已退出、锁 token/root 一致、该 PID 已变为环境同步进程、成功独占取得原输出端口后，清理本轮残留锁；没有停止其他进程或修改保护代码。最终双构建通过同一个监督进程依次调用原构建脚本完成，失败记录未覆盖。

普通 Git HTTPS 推送因缺少终端凭据失败；使用已连接 GitHub 接口提交相同文件树，以最新 main 为父提交并执行带 expected_sha 的非强制更新。远端提交身份以实际接口回读为准；上述本地提交用于构建追溯，不能假称它们具有相同远端 SHA。

## 剩余本机工作

按 [实际验收与修复任务](../prompts/goal-webcodex-chat-edit-r2-local-acceptance.zh-CN.md) 在用户真实环境验收。Windows 先实现平台 Host/安装/授权/文件适配，再验证同一网页对话的真实读取、审阅、保存和独立磁盘读回。正式模型工具接入仍是后续 MCP adapter 工作，R2 没有注册模型工具或自动发送消息。
