# AI 知识问答 R1.2 · 实施与证据

更新：2026-10-26（Asia/Shanghai）。Owner：本对话；仅 main。原目标仍为知识维护 → Shared AI 有来源答案 → 后续授权网站回复。本轮不进入网站读取、草稿、自动发送或第二套队列。

## 2026-10-26 续接 · PACKAGE_PASS / NATIVE_NOT_TESTED

Owner：`01a173e2-8f28-77b1-a10d-0b09fd8b7989`。开始核对时 main 为 c32f39576，干净；已快进同步远端 24f5b8772。26bbc5c9f 的三个沙箱 UI 输入已变化，旧包证据不能覆盖它们。当前首条未完成用户操作仍是官方安装 → 保存重开 → 可信 Send；组件测试不是该原生链。

直接诊断 `--check-project` 失败 `E_PREVIEW_DESIGN: private design token, color or remote stylesheet`，尚未走到旧包比较。最小修复范围为工具样式/共享组件类、过时 AI 提示、PATCH 版本及精确准入版本，增加本次编辑器操作与打包的定向回归，再经原候选/晋升合同交付。

结果：R2 的问答／知识／编辑视图保持原结构，移除私有颜色回退与按钮外观覆盖，直接使用 canonical tokens、od-button/od-icon-button/od-field；查询提示指向官方实例上方的可信 AI 控件。工具版本和精确可信准入同步为 0.1.2，旧版本/改包/无官方 provenance 继续拒绝；不迁移或删除已有 library 数据，不增加权限。

本轮实际运行：

```sh
node --test tests/environment/ai-knowledge-answers-r1.test.mjs tests/environment/ai-knowledge-answers-ui-r2.test.mjs tests/environment/ai-knowledge-answers-provider-contract.test.mjs tests/environment/ai-knowledge-answers-admission.test.mjs tests/environment/ai-knowledge-answers-host.test.mjs
node --check examples/sidebar-tools/ai-knowledge-answers/src/main.js
node --check src/ui/trusted-knowledge-admission.js
```

合并前 54/54 PASS，日志 `artifacts/sidebar-tools/ai-knowledge-answers/core-r12.log`；第一次合并后 55/55 PASS，保留 `core-r12-integrated.log/json`。合入远端 306a8dcfd 后最终 **58/58 PASS**，日志 `artifacts/sidebar-tools/ai-knowledge-answers/core-r12-delivery.log`，摘要 `core-r12-delivery.json`；新增可信 Workspace JSX 转换检查通过，未构建整个扩展或执行网站功能。新增组件测试执行真实 main.js/model.js，内存 Host 保存 → 独立读回 → 重挂载 → 同义固定回答，核对保存时产生的知识 ID；非精确检索仅列候选，无依据返回 NO_MATCH。另测未保存返回取消、写入回执丢失后禁止第二次写入和导航、主动重新读取后恢复，以及修改问题清除准备后迟到回答失效。并行本地测试模块接线存在时，普通手动问答、取消、失效和关闭均不触发网站 IO。Provider/Host 集成仍为 fake transport；未重跑无变更的共享消费者整组或相同 backend 请求，复用下方原始证据。

唯一正式包按合并后源码经原构建器 `--out` → 相关门禁 → `--promote-from` → `--check-project` 均成功：版本 **0.1.2**，**51,906 字节**，SHA-256 `411a97befff3d26bb3b06fbc8a655a7b14f3bfb6baedc37d0b6100db2732ff41`。合并前 51,556 字节及 `cdee2f9b…cff08a4` 仅为历史证据，完整摘要保留在 `core-r12.json`，不再代表当前包。已有 watcher 自行生成的磁盘 Catalog/包已只读核对，版本、大小和摘要均一致；未由本轮另行写入 dist。Chrome 实际加载、serve 客户端连接和可信 bundle 生效仍未实读，不能从磁盘一致提升为原生 PASS。

持续开发输出仍为 `/Users/shopme/Documents/workspace/opendesk-browser/dist/development`，既有 writer PID 69819 存活；不启动第二 writer，不写其输出。Chrome 库存仅证明有对应 ID 的扩展标签页，不能证明加载路径、连接和安装；当前文档没有说明此前拒绝已解除，未再次访问受拒 URL，也不使用其他表面/CDP 绕过。Native 配对、其他工具和网站发送均不操作。新增 local-test-adapter 及 HTTP 原型保留，不用于替代原生闭环。

期间快进同步 dd0125e89，推送前依次合并远端 f2faa82ad、306a8dcfd：保留本地测试 Host 接线、未知写入恢复、初始视图提示修复，以及后续可信 Workspace/CSS、clearPrepared 和并行 UI 测试、参考原型与工作记录。仅文档历史 goal 描述冲突，保留本轮实读状态，并将旧 UI 证据标为历史观察。其网站操作不属本轮，未启动、未执行；只验证新增依赖在手动问答路径保持 idle。候选写入与组件验证资源已 released；没有取得或占用 Chrome Profile，原 watcher 保持原 owner。当前仍停在官方安装这一首个未验证步骤，后续真实保存重开、可信 Send 和原生取消/撤权/断线/知识更新保护均 NOT_TESTED。移交记录中的原对话 goal 实读为 blocked，本轮未迁移或更改它，也未创建并列总 GOAL。

## 用户操作与状态

| 操作 | 当前证据 |
|---|---|
| 固定/同义回答、相关问题检索、编辑启停删除、JSON/CSV | 定向领域测试 PASS；原生 UI 未实测 |
| 保存、ETag 写后读回、关闭重开 | 本轮编辑器组件（内存 Host）PASS；真实 Chrome 保存/重开 NOT_TESTED |
| 准备并审阅知识、原始 Send 进入 Shared Provider | 已接线；实际共享组件 + fake transport 集成 PASS；Chrome 原始事件链 NOT_TESTED |
| 非精确问题调用真实 Local Codex | 现有 Native browserai.Manager 的 backend 请求 PASS；完整 Shared runtime → Chrome 认证 Host 链 NOT_TESTED |
| 来源 ID、人工审阅、旧答案失效 | 实答领域校验通过；身份/撤权/ETag/取消/换 Provider/断线定向测试 PASS；原生行为 NOT_TESTED |
| 可安装候选 | 0.1.2 原打包器晋升及逐字节同源核对 PASS；实际导入/确认安装 NOT_TESTED |

**首个 Chrome 原生 MVP 闭环尚未完成，未达到 95+ 实施质量。** 自动审批拒绝浏览器工具访问 chrome-extension:，允许协议仅 HTTP/HTTPS，并明确禁止通过 CDP、其他浏览器表面等绕过。属于验证工具限制，不是产品故障证据；未更换 Profile、扩展 ID 或 Native 配对。

持续开发复用原 watcher PID 69819（本轮重查存活），输出 `/Users/shopme/Documents/workspace/opendesk-browser/dist/development`。磁盘官方 release 已为上方 0.1.2；Chrome 实际加载路径、开发客户端连接和当前候选绑定未实读。未执行 production 构建、重装或停止其他会话服务。

## R1.1 历史变更与所有权

R1 已由此前提交实现模型、沙箱编辑器、固定问答/检索、JSON/CSV 和 ETag 保存适配；本轮直接复用。

- 工具 `src/{model.js,main.js,style.css}`：复用 canonical button；归一合法数字空白，新增数字事实拒绝交付，AI 语义仍要求人工复核。
- `tool.config.json` 升为 0.1.1；`official-tools/catalog.json` 新增 optional 来源。权限仍仅 storage.local/user.export，不使用 ai.access。
- `trusted/ai-request.js`：预读冻结知识；原事件同步进入 conversation.request；取消、身份、授权及双次 ETag 回读。只返回有限证据标识，不透传 key/grant。
- `trusted/{host.js,Workspace.jsx,workspace.css}`：静态第一方知识业务适配、接收方/外发审阅、可信 Send、取消与结果展示；保留原管理 iframe。
- `src/ui/trusted-knowledge-admission.js`：精确官方版本/路径/字节摘要、安装内容、provenance、启用和撤权代际。普通同名或纯文件导入不获得可信 AI。
- `src/ui/{sidebar-tools.js,tool-shell.js,react/main.tsx}`：复用原 dispatcher、Shared runtime、真实 Native 状态通知及唯一 React root portal；不新建 Host/Provider/安装器。
- `src/ui/ai/provider-runtime.js` 与 `src/ui/conversation/provider-consumer.js`：knowledge 消费者实际使用 KNOWLEDGE_ANSWER_INSTRUCTIONS；相关权限通知复用原 origin/nativeMessaging 过滤。
- 四个 ai-knowledge-answers 专项覆盖领域、Provider 适配、官方准入及共享组件集成；official-tools-catalog-r45 测试仅同步新增工具名单/optional 预期。

并行会话在 e080939b4 保存了部分本轮准备改动；最终以本对话交付 SHA 和实际文件为准，不重做或回退。ChatGPT bridge、Send Queue、Reading TOC 和 Native workspace 的并行改动保留，本对话不拥有它们、不重复浏览器操作。

## 真实 Provider 证据

调用既有 Native browserai.Manager / default factory；task-local Go overlay 追加测试，不修改 sibling opendesk 源码、不创建第二个 Host、不伪造 Chrome registration。CLI 观察版本 0.162.1；Native 实现固定使用既有 openai Provider。本机配置观察模型 openai/gpt-6.1-sol，**实际响应模型名未捕获**，配置值不是响应证明。未更改认证、模型或路由。

使用实际静态知识 instructions，输入明确测试数据：

```json
{"request":"退款需要多少天？","context":{"scope":"","references":[{"id":"qa_test_refund01","question":"退款期限是多少","answer":"7 天内可退款","scope":""}]},"testData":true}
```

2026-10-25T16:03:25Z，终态 COMPLETED，inferenceVerified=true：

```json
{"answer":"资料仅说明“7 天内可退款”，未说明退款处理或到账需要多少天。","sourceIds":["qa_test_refund01"],"needsHuman":true}
```

关联 thread `01a173cd-3692-7a01-ac9a-0838235c9fab`，turn `01a173cd-3736-7d11-915b-63433487c25a`。实答回放原领域校验得到 REVIEW_REQUIRED / needsHuman=true / SEMANTIC_UNVERIFIED；回放不算新的 UI 推理。此前两次 backend 返回“7 天内可退款”、有效 ID、needsHuman=false，测试曾错误要求模型自行设 true；修正评估器，保留原响应事实，由应用强制审阅，没有放宽产品保护。

原始证据在忽略目录 `artifacts/sidebar-tools/ai-knowledge-answers/`：live-provider.log、live-provider.json、live-input.json、live-answer-validation.json、native-overlay.json 与测试副本。Native 源码观察提交 e7e6dd5c1de9a3cb022958d3a360ef9f2b56dfac。日志不含密钥。安装的 `opendesk browser ai doctor --json` 返回 E_CAPABILITY，未因此更新二进制或接管连接。

可复现命令（本机 overlay 存在时，在 sibling opendesk 根执行）：

```sh
OPENDESK_KB_EVIDENCE=/Users/shopme/Documents/workspace/opendesk-browser/artifacts/sidebar-tools/ai-knowledge-answers/live-provider.json /Users/shopme/.local/opt/go1.25.13-amd64/bin/go test -overlay /Users/shopme/Documents/workspace/opendesk-browser/artifacts/sidebar-tools/ai-knowledge-answers/native-overlay.json ./internal/browserai -run '^TestInstalledCodexKnowledgeAnswerR11$' -count=1 -v
```

本次 PASS，16.784 秒。续跑不反复发送已有有效证据的相同请求；先完成未验证的 Chrome 用户操作。

## 自动门禁与安装包

1. 用户指定的初始两个测试 14/14 PASS；随后按变更增加保护用例。
2. 四个知识专项最终 48/48 PASS，命令见工具 README；日志 knowledge-final.log。
3. 知识专项 + shared-ai-provider-runtime-r21、shared-ai-consumer-lifecycle-r211、sidebar-tools 最终一组 81/81 PASS，日志 targeted-final.log。Provider 集成使用 fake transport，不算真实 AI。
4. 受影响 JS node --check、JSX/TSX esbuild 语法转换、git diff --check PASS；完整类型诊断、production 构建及全仓回归 NOT_TESTED。
5. 完整官方 Catalog 检查 15/18 PASS，三个失败延期：Stay Focus 已提交旧包与新源码内容不一致、发行版本 1.0.10 与配置 3.0.0 不同、旧资源计数断言不含固定远端 descriptor。属于无关合同/测试漂移，不修改 Stay Focus、不放宽来源、不伪报全组 PASS。本工具实际源码与官方发行字节一致、optional 策略和可信准入由新增专项验证通过。日志 catalog-final.log。
6. 原 build:sidebar-tool --out → 相关门禁 → --promote-from → --check-project 均 PASS。

上轮正式文件 `examples/sidebar-tools/ai-knowledge-answers/ai-knowledge-answers.opendesk-tool.json` 为 0.1.1，40,093 字节，SHA-256 `153ca03e6b7baccd66b0980017a63aa082f092562f716d223a4bd2f33cf7eaf9`，本轮已由上方同源晋升的 0.1.2 替代。保留历史证据，不等于 production/Chrome 验收或线上发布。未修改原安装器。

## 独立复核与评分

独立原生子 agent 先提出 Native 断线接线、未展示 aliases 外发及无关权限撤销三项；最小修复后均复核关闭，未发现剩余 P0/P1/P2。复核者未独立重跑真实推理或 Chrome，结论 COMMENT，保留原生与类型诊断缺口。

| 维度 | 分数/100 | 主要限制 |
|---|---:|---|
| 业务目标 | 88 | 完整原生操作链未验证 |
| 技术可行性 | 91 | backend 实证，浏览器接线待实测 |
| 架构复用 | 93 | 原 Provider/Host/存储/React root |
| 开发成本 | 86 | 范围集中，仍有专属接线维护成本 |
| 安全 | 88 | 保护已修正，原生撤权/断线未验证 |
| 可测试性 | 87 | 定向证据充分，原生工具受阻 |
| 扩展性 | 78 | 固定版本准入及小知识库容量限制 |

算术平均 `(88+91+93+86+88+87+78)/7 = 87`，不宣称 ≥95。

## 下一条操作与边界

真实 Mac Chrome 中，通过扩展官方目录审阅并安装/更新本候选 → 新建测试知识并保存 → 关闭重开确认保留 → 同义固定回答 → 非精确问题准备并真实 Send → 核对 sourceIds/人工审阅及错误恢复。纯文件导入没有官方 provenance 时保持受限，不改写来源记录绕过。

只有该链及受影响的原生取消、撤权、更新、断线验证完成才可宣告 MVP。原始 Codex goal 移交时实读为 blocked，本轮未改变，未因交付候选伪报 complete。网站阶段还需站点许可、精确页面身份、读取/草稿/发送确认与未知结果保护的独立设计和实测；保留 answer/sourceIds/needsHuman/status、取消及会话身份合同，不复制队列。


## R2 UI 并行工作记录（2026-10-26）— 问答优先、知识列表/编辑互斥

以下为并行 UI 工作的原观察；当前完整 Node 结果、包身份和未验证操作以上方续接记录为准，不恢复已延期的网站操作或宽度专项。

本轮保留原产品目标：AI 依据真实知识回答，未来在获批准的站点自动回复。用户指出 R1 的查询、横向芯片、编辑大表单在同一侧栏纵向堆叠。参考 cool-admin-vue 的搜索工具栏/列表/upsert 信息架构，不引入 Vue、PC 表格、侧边抽屉或第二套 Host。

本轮修改的业务文件：
- examples/sidebar-tools/ai-knowledge-answers/src/index.html
- examples/sidebar-tools/ai-knowledge-answers/src/style.css
- examples/sidebar-tools/ai-knowledge-answers/src/main.js

分别建立：
- 默认「问答」：仅问题、可选范围、回答状态及来源。
- 「知识」：搜索、启停筛选、纵向摘要、点击条目进入编辑、导入导出次级入口。
- 「新建/编辑」：问题/答案优先，其余折叠；保存读回、返回未保存保护、删除确认。
- UNKNOWN 写入只能由显式刷新重新核对，不能通过切换视图清除或冒充核对。

新增：
- examples/sidebar-tools/ai-knowledge-answers/fixtures/sample-knowledge.json（14 条演示规则、每库低于 8 KiB）
- examples/sidebar-tools/ai-knowledge-answers/preview/index.html（经 HTTP 加载原正式 HTML/CSS/model/main，唯独模拟 Host Storage）
- tests/environment/ai-knowledge-answers-ui-r2.test.mjs（源码结构、调用和权限静态合同）

本轮事实级证据：V8 解析通过；48 个 DOM ID 无重复，业务代码引用均存在；测试知识经真实模型校验，固定问答与未知问题可区分。单文件聊天内独立 UX 演示在当前环境 Chromium 完成问答、搜索、模拟保存、未保存离开确认和 320/360/400/440 宽度无演示内容横向溢出。该独立 UX 演示不是 source-linked preview 的真实 Chrome 执行，更不是 Mac Chrome 正式安装测试。

该并行记录当时 NOT_TESTED：真实原源码加载及完整 Node 测试退出码、Mac Chrome 安装/重开、IME、暗色无障碍、Shared AI Provider、真实网页发送。完整 Node 结果已由上方本轮日志补证，其他边界保留。

R2 UI 不能代替自动问答闭环。并行实现的本地测试适配与可信控件已保留；网站真实触发和读回仍属延期阶段。本轮下一条未验证操作仍为官方安装 → 保存重开 → 可信 Send，不重做 R2 列表/编辑 UI。
