# OpenDesk Browser R8 Engineering Program R1：执行计划与真实证据

> 审计日期：2026-10-09（Asia/Shanghai）。首轮源码审计基线：`main@945cf92726fcadcd60ecb3dc70729029fb9f28e6`；并行文档主线由 `main@0dcc23b6` 连续同步至 `main@36cdb63`，随后审查切片由 PR #25 合入 `70fb3449`；另一并行集成将 Native/HTTP/Program 经 PR #11 合入 `189a7037`。保留新的 PR 归属事实、35 项追溯和全部独立评分。保留该主线已建立的 E01–E40 稳定任务 ID，增量补齐字段、去重映射和验收，不覆盖为新的编号体系。本文件是唯一的 R8 **工程执行计划**；[188 项功能总目录](browser-automation-feature-catalog-r8.zh-CN.md) 继续作为唯一能力账本。这里把它们归并为 **40 个稳定工程任务（E01–E40）**，不复制第二份 188 行矩阵，不把规划、候选 PR 或测试数量当作产品完成率。

## OpenDesk UI Development R1 子切片（2026-10-09）

- **SOURCE_IMPLEMENTED**：E33 关联的 Page USER_SCRIPT 原生 UI（`src/scripting/user-scripts/page-ui.js`）、`@opendesk/ui` 固定本地构建别名、按需 CSS 与 JSON/PNG/JPEG/WebP 有界静态内嵌（`scripts/program-assets.mjs` / 两份既有项目校验和构建器）。
- **示例与接口**：`examples/programs/page-ui-basic/` 的多文件源码、独立 CSS/JSON/PNG、[UI API](../framework/ui-api.zh-CN.md)；沿用 Sidebar 原草稿包导入与「网页用户脚本 · 依赖与试运行」按钮，Task v1/正式 Page 安装合同未升级。
- **COMPONENT_TESTED / BUILD_VERIFIED**：以该提交关联的实际定向测试或 CI 结果为准；没有执行结果时不写 PASS。旧的 `sidebar-assets-contract` fail-closed 构建用例已更新为资源成功构建及非法输入负面测试。
- **CHROME_NATIVE_VERIFIED = NOT_TESTED**：需在本地 Mac 真 Chrome 用同一候选构建，分别检查导入、ShadowRoot、DOM/CSS 隔离、按钮状态、data 图片/CSP、离线、重复运行/关闭重开、200% 缩放、320/400/600 宽度及页面导航。不得将 Node 或 CI 的静态结果升级为原生证据。
- **后续独立范围**：React/Vue/JSX/TSX/Tailwind adapter、复杂 Sidebar sandbox 用户应用、正式 Page 安装与撤权信号桥、完整 GM/UserCSS 均不因本子切片而宣称完成。具体错误与 API 以已提交源码为准。

## R8.1 · E07.1 Page Candidate 持久身份（2026-10-09 增量）

- **范围与实际接线**：在现有 `src/scripting/user-scripts/dependency-manager.js` 的可信解析/哈希/锁/Host 事务中追加 E07.1 Candidate 操作，由 `src/platform/host/broker.js` 的已认证 Host 路由调用。复用 `frameworkKV`、`@match` D1 metadata 与 `loadForExecution`（不构建第二个 manager/DB/权限层）。此最小切片仅支持显式 `@match` 的元数据用户脚本，未来更广泛的 Page Program 来源/规则由后续 E07/E08 独立验证。保留 Controller Task v1、RunHost、Sidebar 三页签与网络服务。
- **API**：`importPageCandidate({programId,revision,sourceUtf8,entryFormat,importSourceUrl,lockId})`、`getPageCandidate({programId,revision})`、`listPageCandidates({})`。客户端不能传 `namespace/stage/verification/installed/authority/dependencyResolution`；真实 namespace 由活跃扩展 Host 决定，锁在受信管理器复核。相同 revision 冻结后不可替换，候选唯一 ID 绑定 namespace+manifestHash；读取时再次核查源码与 manifest。
- **仅 Candidate**：产品态固定 `Candidate` 与 `verification:null`，无 `makePageAvailable`、安装、启用、自动执行或注册路由。E09 的原生 Page 证明、E07.2 安装事务、E12 实例身份及 E10 的注册对账均保持 `MISSING/PARTIAL`，不能依据本地记录升级权限或宣称支持正式用户脚本安装。
- **验证**：新增 `tests/environment/page-candidate-service.test.mjs` 包括幂等并发、版本冲突、跨命名空间隔离、伪造 Available/源码篡改、依赖未审与 Host 过期等负例。此提交的组件/构建以实际 CI 为准，未执行之前标 `NOT_TESTED`；Chrome/Codex、真实安装、扩展/浏览器重启和 F3 全部 `NOT_TESTED`。工作流见 `docs/framework/workstreams/r8-e07-page-candidate-20261009-6c2a.json`。

## 1. 本轮结论与适用规则

正式定位为 **用户脚本管理器 + 现代 JavaScript 开发框架 + 浏览器自动化任务平台 + 可选 AI Agent**。现有 Controller、RunHost、Locator、Task 发布、单文件草稿、页面预览、ESM 构建和 SDK 是复用基座；正式 Page 安装、GM Facade、调度和跨浏览器适配存在独立缺口。现有 `background-services.js` 是 SDK 的时间、日志、固定资源服务，不能因文件名而被标为 Background Script 引擎。

本轮先核对 PR #11/#20/#22 的实际目标分支、候选及最新 main，再修复现有 Page 依赖审查的源码新鲜度问题，补足 `@antifeature` 风险披露。该修复属于 E08/E40 的可独立测试子切片；**正式 Page Candidate、安装和自动运行仍是后续任务**。只对同一候选的真实证据升级状态，不将 UI 审查正确等同于脚本已经安全、已验证或已安装。

| 用户 | 现有可复用入口 | 本计划补齐的产品结果 |
| --- | --- | --- |
| 普通用户 | 我的任务、已安装 Controller、发现中的本地查找与导入 | 安装受支持的网页增强脚本，知道来源、适用网站及状态，能启停、更新与恢复 |
| 用户脚本开发者 | `.user.js` 元数据解析、经典脚本预览、`@require` 审批与锁 | 明示兼容 profile、可信 GM 接口、匹配与生命周期行为，不被误导为全面油猴兼容 |
| 高级开发者 | Sidebar 单文件编辑器、`async function main()`、本地 ESM/package.json、Page API/Locator | 源码与产物分离、可读调试、统一发布入口、类型及项目模板 |
| AI 与自动化用户 | 现代观察/定位、Revision、Task Candidate/Verification、Agent→Task 合同 | 可选 Bridge 创作与验证，AI 退出后按冻结版本独立运行 |

### 1.1 决策与文档权威

- 任务来源只有功能总目录中的稳定功能 ID。工程任务可以合并重复能力、分批验收，但不能以新任务名称悄悄扩张产品范围。
- 本轮用户要求的 R8.0～R8.6 是**工程阶段**；旧 roadmap 的 P0～P4 是粗粒度产品候选阶段，不能当成一轮全部实施清单。其对应关系见第 6 节。
- 架构规范仍在 [R8 ADR](../architecture/browser-framework/plugin-capability-architecture-r8-adr.zh-CN.md)，API 语义仍在 [GM 兼容矩阵](../architecture/browser-framework/userscript-compatibility-matrix-r8.zh-CN.md)。本计划只记录任务、依赖、验收与证据。
- [UI 开发与样式隔离 R1](../architecture/browser-framework/ui-development-and-style-isolation-r1.zh-CN.md)记录用户后续明确提出的 UI 开发专项：原生默认、React/Vue 按项目选择、Tailwind 构建与样式容器。责任归入现有 E33 等任务的后续细化，不将新增设计计为本轮原 188 项的实现证据。
- 遵守 [AGENTS.md](../../AGENTS.md) 和 [多 Agent 协议](../framework/parallel-development.md)：写入 Agent 使用独立 worktree/短期分支，获授权的集成者串行更新 main。旧 roadmap 中“全程不新建分支”的历史措辞不能要求多个 Agent 共写 main；最终正式交付仍统一 main。禁止强推、硬重置、覆盖脏工作或为清理分支强合 Draft。
- 本地 Mac 路径只有实际可访问时才使用。受控 Chrome/CFT profile、固定端口、dist/ZIP 与 native 证据必须独占或明确隔离；云端源码及 Node 验证不能代签用户的 Chrome/Codex。

### 1.2 状态与证据口径

| 标签 | 允许表达的事实 | 不允许推导 |
| --- | --- | --- |
| `SOURCE_IMPLEMENTED` | 已定位实现及真实消费者；必须附源码路径 | 组件已通过、浏览器效果正确 |
| `COMPONENT_TESTED` | 同候选实际执行了定向协议、状态或组件验证 | 真实 Chrome/Codex 通过 |
| `BUILD_VERIFIED` | 同候选生产、开发构建及对应静态/产物校验有日志 | 用户安装、网页行为或重启正确 |
| `CHROME_NATIVE_VERIFIED` | 真实扩展、身份一致的浏览器和目标、原生输入/回执与网页效果有证据 | 其他版本/平台也通过；全部 F3 已完成 |
| `PARTIAL` | 有可复用实现，但该工程任务至少一个必要环节未闭合 | 安装主链完成 |
| `MISSING` | 在本次审计目录和真实消费链未找到目标实现 | 仓库中不存在任何可复用基础 |
| `NOT_TESTED` | 此候选缺少相应实际验证；也用于尚未逐项复现的高级能力 | FAIL 或 PASS |

各任务的“源码状态”和“验证证据”是独立字段。下文以 **E0** 表示默认验证状态：除第 10 节明确列出的本轮命令与结果外，组件、构建及 Chrome 原生均为 `NOT_TESTED`；“已有测试文件”只表示可复用测试入口。旧 CI、旧 SHA 和草稿 PR 的结果只能放在各自候选下。公开质量验收还须履行 AGENTS.md 的原始账本、最终 F3 与同产物 ZIP 安装门槛。

## 2. main 能力地图与复用边界

以下是按真实入口、消费者和状态审计的地图；不根据文档标题或文件名推定完成。

| 复用链 | 已定位源码 / 消费者 | 源码事实与任务归属 |
| --- | --- | --- |
| 可信消息与执行身份 | `src/platform/host/broker.js` → `authority.js` → `controller-methods.js` / `sdk-methods.js` | `SOURCE_IMPLEMENTED`。现有工具文档 sender、Host、运行与 SDK 准入；USER_SCRIPT 专用启动/GM sender 桥 `MISSING`。归属 E02/E12/E16 |
| Controller 运行与停止 | `src/ui/script-editor.js` → `src/run-host.js` → `src/scripting/sandbox/worker-runtime.js` | `SOURCE_IMPLEMENTED`。支持未保存草稿和 `async function main()`，有 Durable Run/Result/retirement。原生同候选闭环 E0。归属 E02 |
| 现代 Page API | `src/framework/ChromePage.js`、`src/framework/locator.js`、`src/scripting/packaged/locator-dom.js` | `SOURCE_IMPLEMENTED`。Locator、observe、目标与文档绑定存在；普通 DOM 操作不是完整 Playwright 可信键鼠/CDP。归属 E02/E33/E35 |
| Controller 发布与安装 | `src/platform/tasks/contract.js`、`service.js`；Broker `importTaskPackage/verifyTaskCandidate/makeTaskAvailable/installTask` | `SOURCE_IMPLEMENTED`。真实 Controller Result + commandJournal page-effect 证明，Available 后安装；单 HTTP(S) origin 的 Task v1 保持。归属 E02/E07 |
| 统一持久化 | `src/platform/storage/index.js`、`idb.js`；Task service 的 `frameworkKV`、`scriptHeads/scriptRevisions` | `SOURCE_IMPLEMENTED`。现有 IndexedDB v2；复用 namespace/record/CAS，不增加第二 DB，也不凭旧文档强做 v3 迁移。归属 E07/E18/E30 |
| 单文件 Page 预览 | `src/ui/page-dependencies.js` / `script-editor.js` → Broker `previewPageScript` → `src/scripting/user-scripts/preview.js` | `SOURCE_IMPLEMENTED`。当前主文档 `userScripts.execute`，不具有正式安装状态；本轮修复审查异步新鲜度。归属 E02/E08/E11 |
| 元数据、依赖与执行字节 | `dependency-metadata.js` → `dependency-manager.js` → `execution-source.js`，均在 `src/scripting/user-scripts/` | `SOURCE_IMPLEMENTED`。受限 D1 profile、显式拒绝不支持语义、审核哈希与锁、按顺序编译；正式注册消费者缺口。归属 E08/E11 |
| Page 固定合同与注册描述 | `src/scripting/user-scripts/page-program-contract.js`、`page-program-package.js` | 编译层 `SOURCE_IMPLEMENTED`，正式资产/权威发行/持久注册整链 `PARTIAL`；`preparePageProgramRegistration` 要求可信 `assertAvailable`，不能由 UI 填假 proof。归属 E07/E09/E10 |
| SDK HTTP 与资源服务 | `src/framework/sdk/http.js` / `entry.js` → `src/platform/host/sdk-broker.js` → `src/platform/chrome/network.js`、`background-services.js` | `SOURCE_IMPLEMENTED`。网络含 pre/post 授权、超时、大小、`credentials:omit`、`redirect:manual`；不是 GM XHR，也不是流量拦截。归属 E04/E20/E24/E25 |
| 多文件开发 | `scripts/validate-program-project.mjs`、`build-program-project.mjs`、`examples/programs/` | `SOURCE_IMPLEMENTED`。main 已有只读源码快照、固定 classic JS 产物、development 可读构建与本地 map，production 保持压缩；仍 `BUILT_UNVERIFIED`。运行时 map 消费和源码持久化/导出未闭。归属 E03/E33 |
| Sidebar 与独立目录 | `src/ui/tool.html`、`task-workbench.js`、`script-editor.js`，现有任务目录消费者 | `SOURCE_IMPLEMENTED`。我的任务/发现/开发和底栏动作保留；Page 安装卡片及复杂管理仍缺。归属 E14/E27 |
| Native Agent | `native-agent/{cli,native-host,install}.mjs` → `src/native-agent/` → `src/ui/tool-shell.js` 的原 `scriptEditor.host` | 源码/消费者 `SOURCE_IMPLEMENTED`，完整功能 `PARTIAL`；main 已有六方法 CLI 与 macOS Host，要求活跃 Sidebar，MCP/独立长任务与原生闭环未完成。归属 E05/E34 |
| Page UI 与资产 | `src/scripting/user-scripts/page-ui.js`、`scripts/program-assets.mjs`、原 Program builder | main576 已有按需 @opendesk/ui、Shadow DOM 与 CSS/JSON/本地图片固定内嵌；PARTIAL，非安全沙箱或完整生命周期/正式 Page 安装。E33/E40 |
| 本机 Sidebar 工具 UI | `src/ui/sidebar-tools{.js,/package.js}`、`src/sidebar-tools/`、`scripts/build-sidebar-tool.mjs` | main74 已有受限 UI 包/opaque sandbox/三能力桥；`PARTIAL`，仅 tasks.open 聚焦原任务、不执行；独立工具配置尚未统一 ProgramRef/安装代次/Authority。E39/E40 约束后续扩展 |
| GM、Cron、UserCSS、跨浏览器 | 对照 `src/scripting/user-scripts/`、`src/platform/host/`、`src/sw.js`、`manifest.json` | GM facade、USER_SCRIPT 专用 Broker、Alarms 调度、UserCSS 正式生命周期未接线；manifest 没有 `alarms`。Firefox/Safari 驱动 `MISSING`。归属 E16–E25/E29–E32/E37/E38 |

### 2.1 已有、部分与缺失的判定

**已有且必须保护**：三页签、Controller RunHost、Page API/Locator、Task Candidate/Verification/Available/Installed、直接编辑草稿、ESM 静态构建、axiosx/SDK、Page 即时预览和 D1 依赖锁。它们进入 R8.0 的回归保护，不能因能力目录为 P0 而重新开发。

**部分完成**：Page manifest/注册描述有实现，Page 发布、安装和运行证明没有完整可信消费者；元数据有描述性解析但审查 UI/授权身份尚未全面接线；Revision/结果/资源/日志可以复用，不能算 GM/备份/后台产品已完成；Native、HTTP 服务和多文件源码消费者已进入 main，但本机/原生与安装后用户链尚未验收。

**当前缺失**：正式 Page installed desired state、可信自动启动、`register/update/unregister/getScripts` 对账与回滚；GM 方法与 @connect；Background/Cron；基础 UserCSS；正式跨浏览器支持及可选生态。高风险扩展项记录为延期或不实现，不为凑数量制造实现。

## 3. PR 与主干整合计划

本轮保留了 `0dcc23b6` 至 `36cdb63` 的并行计划/评分以及最初 Native 草稿快照；PR #25 先于 `70fb3449` 交付本轮源码审查修复，随后**另一并行集成者**于 17:38:58 UTC 将 PR #11 合入 `189a7037`。当前表以已发生的真实合并为准，旧 CI/失败日志保留各自候选身份。源码合并不自动关闭 Native 或发布门槛。

| PR | 当前 main 归属 | 实际证据 | 当前门槛与处理 |
| --- | --- | --- | --- |
| [#11 Native Agent Bridge](https://github.com/shopable-ai/opendesk-browser/pull/11) | closed / merged=true / draft=false；head `f1ca724a52e3190447c9be93ed9b00b8a97b52fd`；合入 `189a7037afce89efe7fef7772e781fd70643143c` | main189、f1ca 和 HTTP CI 的 d0f64 完整 tree 一致。Native 47/47、shared 58/58、环境 272 PASS/4 SKIP、check 160、双构建/verify；最新 CFT 155 extension ID 超时 0/1 FAIL。详见 10.5 | 源码集成已完成；在最新 main 的固定候选继续真实 Chrome/Codex/Installed/Stop/重启验收，不再追已关闭草稿重复合并 |
| [#20 axiosx / HTTP](https://github.com/shopable-ai/opendesk-browser/pull/20) | 先于 17:04:34 UTC 合到 Native，merge `33a551a6f1d308e7c9593bfa5ee8b1baf5fad2fd`；已随 #11 进入 main | 同 tree HTTP/SDK/Network 88/88，但没有覆盖新增独立 Page draft，留下按钮/channel 失配；本轮另补真实草稿消费测试和修复 | 原服务、Worker SDK 与网络内核复用；Page fetch、MAIN SDK、Worker SDK 分开原生验收，不重开第二 HTTP 服务 |
| [#22 多文件源码与产物](https://github.com/shopable-ai/opendesk-browser/pull/22) | 先于 17:11:02 UTC 合到 Native，merge `a2e1bda59bf74fabfb9ae3cd2b882c483cdc1383`；已随 #11 进入 main | 原 `e5cd4b4` fixture 移动与后续改进均复用；当前 fixture 是 `tests/fixtures/program/d1-userscript.html`。main 多文件组件 37/37，开发 map/源码视图已有 | 不重复实现 builder、source viewer、map generator；补源码工程持久化/导出、运行时 map 消费及同 profile 保存/重启/Installed 原生验收 |
| [#25 本轮审查与执行计划](https://github.com/shopable-ai/opendesk-browser/pull/25) | head `a884942e`，合到 `70fb3449`，当前 main 完整保留 | 39 个 blob/完整 tree 与本地 ab89 相同；201 环境、71 定向及生产/开发/ZIP 证据见 10.2/10.4 | E08/E40 子切片已交付；它不代表 Page 安装、GM 或 Native 已完成 |

`main@70fb3449` 对 `Native@75e4cde` 的三方冲突只作为 10.4 的历史审计保留。main189 对 README、demo-form 和 basic-browser-page 三个冲突文件均采用原 main 内容，源码审查修复也完整保留；遗漏的独立 HTTP 草稿由本轮 E04 子切片修正。未来消费者/源码变动仍须按新候选验证，不能平移旧 Chrome 回执。

当前 E03/E04/E05 的**Git 源码集成依赖已经解决**，剩余是组合产品与本机原生门槛。Page 核心能力可沿 E07.1/E09 独立实施，不受 Agent 是否在线约束。同一个 Broker、Authority、schema 和执行入口接口仍由一个负责人串行接线；受控 Chrome/profile/端口、dist/ZIP 保持独占。已合且无独有工作的临时分支/worktree 由主集成者安全清理，原始验收证据和其他会话工作不得删除。

## 4. 五个正交产品维度与数据边界

| 维度 | 建议表达 | 不变量 |
| --- | --- | --- |
| 源码与开发方式 | `sourceFormat`：classic-user-js、single-js、async-main、esm-project；草稿来源可另记 `authoringOrigin=human/agent`；固定后引用不可变 artifact | AI 来源、单文件或多文件都不赋予额外执行权。源码已保存、构建产物已生成、执行已成功是不同事实 |
| 运行类型 | `runtimeKind`：page-userscript、controller-task、background-script、usercss；可选 Agent/Skill Adapter 只是已有 Task 的调用适配 | 每种类型有自己的验证器/驱动；身份、版本、存储和 Authority 共用。Agent Adapter 不获得第二执行内核 |
| 触发方式 | `TriggerDefinition`：manual、document-match、location-change、context-menu、command、browser-event、schedule、external-agent | trigger 指向已批准的 program/install 和 generation；每次触发重新检查安装、启用、目标与权限，不提升 grant |
| 发布与安装状态 | 源码资产 Draft/Candidate/Verified/Available/Retired；安装记录引用确定版本并独立记录 Installed、Enabled/Disabled；native registration 状态单独投影 | 同一个 Available 版本可以未安装；已安装可被浏览器开关阻断。`register()` 成功不是 Verified，更不是实际网页成功 |
| 能力与权限 | manifest 声明 ∩ 当前浏览器网站/API 授权 ∩ approved metadata/grants/connect ∩ 应用 capability ∩ 本次 identity/target | 由受信 Broker/Authority 求交集；不可信 JS 不能任意使用 `chrome.*`，不从 payload 读取“已授权”结论 |

共享引用建议为 `ProgramRef {namespace, programId, revision, runtimeKind, sourceHash, manifestHash}`；它是现有类型合同上方的适配接口，**不是要求重写 `opendesk.task.v1` 或 `opendesk.page-program.v1`**。PageInstallation、GM namespace、TriggerDefinition 和可选 plugin manifest 引用同一个 ProgramRef/安装代次。版本字段的含义只定义一次，GM 和插件不得各自复制第三套版本/权限模型。

安装/授权持久记录落在现有 `frameworkKV` 的受版本约束 namespace。与 Chrome registration 之间用期望状态、代次、持久 operationId、对账和补偿处理，不宣称跨 IndexedDB/Chrome 的原子提交。原始验证和运行回执保持不可变；变更 hash、依赖、站点或能力须重新经历相应审查与验证。

### 4.1 14 个架构问题的决策索引

本索引的规范正文与技术来源均在 [R8 ADR](../architecture/browser-framework/plugin-capability-architecture-r8-adr.zh-CN.md)；这里给出可落实到任务的结论。

| 决策 ID | 问题与结论 | 工程负责人 |
| --- | --- | --- |
| R8-EP-ADR-01 | GM 是 SDK/Host 服务的受限 facade；消息、权限、数据与网络副作用复用一个 Core | E12、E16–E25 |
| R8-EP-ADR-02 | Page 与 Controller 共用资产引用；Page 专属 Native proof，禁止借 Controller Result 过审 | E07、E09、E15 |
| R8-EP-ADR-03 | source/runtime/trigger/release/permission 五维独立；安装状态与原生注册另记 observed state | E07、E09、E30 |
| R8-EP-ADR-04 | `includeGlobs/excludeGlobs` 可作为受限 glob 兼容的候选，但不等同全部油猴正则/匹配语义；R8.1 默认继续拒绝，独立 profile 验证后 R8.2 扩展 | E22 |
| R8-EP-ADR-05 | 使用 USER_SCRIPT 专用原生消息；真实 sender 的 extension/tab/frame/document/origin 与另行证明的受控 world/实例绑定共同认证，不信 scriptId/grant/world payload；Chrome sender 没有 worldId/scriptId | E12 |
| R8-EP-ADR-06 | 每文档异步启动授权与严格同步 document-start 不能同时先验承诺；真实测量后明确选择受限时序或拒绝，不能静默延后仍称精确 start | E12、E15 |
| R8-EP-ADR-07 | 动态注册单 writer、desired/actual 对账、代次栅栏、撤权阻断及失败回滚；旧 ack 不覆盖新状态 | E07～E13 |
| R8-EP-ADR-08 | MV3 后台拆成短执行宿主与持久触发；Alarms+租约+misfire；不承诺关闭浏览器继续或远程副作用 exactly-once | E29、E30 |
| R8-EP-ADR-09 | fetch 保留标准 Web API；axiosx 保留既有 SDK；GM XHR 只增兼容签名、事件与投影，复用可信网络层 | E04、E24 |
| R8-EP-ADR-10 | 单文件与 ESM 构建共用发布入口与固定执行字节，不强制统一编辑器；Source Map 是调试资产，不是执行权限 | E03、E07、E33 |
| R8-EP-ADR-11 | Native 只适配已有 RunHost/Task；普通任务不依赖 Host/Agent 在线 | E05、E34 |
| R8-EP-ADR-12 | UserCSS 为独立 runtime kind，共用安装/版本/授权；不包装成特权 JS | E37 |
| R8-EP-ADR-13 | 当前默认全站与敏感 API 是开发基线，不是公开发布合规结论；公开渠道单独审查必要权限，不在本轮擅自改掉既有用户配置 | E40 |
| R8-EP-ADR-14 | Task、GM、plugin registry 共同引用 ProgramRef、capability descriptor、generation/receipt；无第二权限/数据库/版本权威 | E07、E16、E36、E39 |

## 5. 工程任务树与 15 个实施模块

任务编号稳定，不因阶段调整重新编号；跨任务复用用依赖表达，不重复登记功能 ID。已将 main `2a7a6f8` 追加的 35 项追溯补充归入下列唯一主责卡片，保留其处置边界：**保留回归**保护已有功能，**延期评估**不进入近期基础交付，**不实现**的普通 GM 能力继续明确拒绝；不保留第二份重复 owner 表。每个功能恰好一个主责工程任务，主责不代表它的全部工作必须在同一批上线。

| 实施模块 | 主责任务 | 交付边界 |
| --- | --- | --- |
| 1. 安装与发布 | E07–E10、E13、E26 | Page 身份/专属验证、显式安装、固定版本和回滚 |
| 2. 元数据兼容 | E08、E11、E22 | 受限 profile、匹配与依赖锁；危险指令 E40 |
| 3. GM API | E16–E23、E25 | 可信消息、基本方法、Promise、同步/批量独立准入 |
| 4. 网络与权限 | E04、E12、E24、E28、E40 | 复用 axiosx transport，独立 @connect/目标授权 |
| 5. Page 生命周期 | E10–E15、E22 | Frame、SPA、运行时机、重启与撤权 |
| 6. Controller 自动化 | E02、E33、E35 | RunHost/Locator、JS 组合、可选录制 |
| 7. 单/多文件开发 | E03、E11、E33 | 源码和产物分离、依赖、模板/调试 |
| 8. Background 与定时 | E29、E30、E32 | 宿主、持久调度、租约/并发/补偿 |
| 9. 触发器与事件 | E22、E31 | SPA 与浏览器入口不绕过安装许可 |
| 10. Agent/CLI/MCP | E05、E34、E36 | 原 PR 复用，可选工具、脱 AI 重跑 |
| 11. 更新、备份与同步 | E26、E27、E39 | 来源 diff/回滚、本机备份，后期同步 |
| 12. UserCSS | E37 | 基础 CSS 先行，复杂语法/同步后置 |
| 13. Sidebar/管理页 | E14、E21、E27 | 三页签不变，复杂设置放独立页 |
| 14. 安全/供应链 | E12、E16、E40 | 单 Authority、声明/实际权限、许可与取舍 |
| 15. 测试/可观测/跨浏览器 | E01、E06、E15、E23、E28、E32、E38 | 独立证据层、原生场景与各平台验证 |

### 5.1 可并行与必须串行

E01 先锁定当前 HEAD/PR/资源；E02 与 E06 分别守住既有运行链和 Browser Test Lab。E03/E04/E05 的测试可以按模块独立准备，不强制阻塞 Page 主链；E03/E04/E05 已随 #11 完成源码整合，组合原生验收仍按第 3 节协调；E08.1/E40.1 的现有 UI 审查修复可独立交付。共享 Chrome/profile/端口、dist/ZIP 仍须独占或明确隔离。

Page 接口顺序：E07 固定资产/安装身份 → E08 导入审查 → E09 Page 专属验证；在 E07/E09 稳定后先实现 E12 启动授权，再由 E10 对账器消费，避免为了演示注册而留下新文档越权窗口。E11 的纯规则/依赖合同和 E14 原型可并行开发；原生匹配要等 E10 接线。E13 回滚、E14 产品 UI 完成后 E15 统一原生签收。该顺序是对原 E10/E12 交叉依赖的澄清，保持任务 ID 不变。

E16 基于 E12 的真实 sender/安装身份扩展 GM；E17/E18/E20/E21 可按方法并行，E19 的 Promise 批量/监听可先交，传统同步不足则明确拒绝；E23 方法级验收只签实际支持 profile。E24 依赖 E04 网络方案，E28 签完整网络/更新用户链。Background E29–E32 可在 E12 合同稳定后独立，不强依赖 GM HTTP；E33/E34/E36 复用原 PR，不重新造 Editor/Bridge。E37–E39 依需求后置。

同一个 Broker/Authority/schema/源码入口接口由一个负责人定义，消费者在各自工作区实现，主集成者串行接线/合并；独立分支不等于可以覆盖共享 native 资源。任务卡前置图已检查无环，阶段验收引用不形成第二套能力 owner。对子切片先后另明确：E07.1（Candidate 身份/持久合同）→ E08 来源审查 → E09 类型证明 → E07.2（安装）；E08.1 当前预览审查修复可先交付。E27.1 基础事件在 E07/E10/E12 稳定后先交，E27.2 备份再等待 GM/更新合同。前置中的子切片指其合同已稳定，不要求整个父任务提前签收。

## 6. R8.0～R8.6 分期与签收关口

| 阶段 | 任务及切片 | 可向用户交付的结果 | 必须满足的阶段门槛 |
| --- | --- | --- | --- |
| R8.0 整合现有能力 | E01–E06；E08.1/E40.1 当前修复 | 保住现有开发与自动化入口，准确区分三个 PR 和 main；将能独立验证的审查修复交付 | 当前 diff 有源码/消费者检查和定向组件证据；生产/开发构建与打包校验分别记录；未验 Draft 留存，旧 CI 不能当最新 Native |
| R8.1 正式用户脚本 | E07–E15；E27 最小事件 | 无 GM 特权、受支持元数据与固定 `@require` 的脚本可经验证、安装、自动运行、停用/卸载/回滚 | 类型专属 Verified/Available；匹配新文档一次/nonmatch 零；frame、run-at、撤权与开关、重启/升级/SW 对账；同 hash 真实网页效果、权限与 UI 完整用户链 |
| R8.2 GM 基础兼容 | E16–E23 | 已公布 profile 的 GM 信息/样式/日志、Promise 值、资源与菜单；同步 API 明确支持或不支持 | 真实 sender 字段与独立证明的 world/实例/install/document 绑定准入；每方法类型/错误/权限/预算和原生测试；同步不能以异步 Promise 伪装 |
| R8.3 网络与成熟管理 | E24–E28；E40 公开发行检查 | 受控 @connect/GM XHR、下载/通知/标签、来源固定更新、差异审查、完整日志与本地备份 | 原 HTTP 服务上的 CORS/SDK/GM 分层证据，重定向与凭据不得放宽；更新损坏回滚、撤权、跨脚本隔离、备份恢复验证 |
| R8.4 Background 与 Scheduled | E29–E32 | 有明示宿主的后台短任务、时区/Cron、事件入口、暂停/停止和补偿 | Alarms 真实延迟/冷启动/重启；fireId 租约、并发、超时、错过策略；关闭浏览器无后台执行承诺；远程副作用 UNKNOWN 不自动重放 |
| R8.5 高级开发与 AI | E33–E36；原 PR 原生回归 | 可读多文件开发、模板、录制到 JS/Task、可选 Agent 工具和冻结发布 | 源码与执行字节可追溯；Locator 用户任务有效；Bridge 与 Task 证明正确；退出 AI/Host 后安装版独立运行及停止 |
| R8.6 生态与扩展 | E37–E39；E40 高敏再评估 | 基础 UserCSS、按需跨浏览器、订阅/同步及受限插件入口 | 各独立子项目有需求和权限/许可关口；每浏览器逐版本原生验收；未验平台不宣称支持，云账号/公开市场不是核心依赖 |

旧 P0 对应 R8.1（已有能力回归在 R8.0）；P1 拆为 R8.2/R8.3；P2 的调度进入 R8.4，基础 CSS/批量等可后移至 R8.6；P3 的可选 AI 进入 R8.5；P4 的平台生态进入 R8.6。**R8.6 表示评估和分批实施，不是承诺所有 LX/L3 必须上线。**

### 6.1 五类独立验证

1. **源码验证**：受信入口到实际消费者接线、当前 SHA、API/manifest/schema diff；纯编译模块必须注明没有产品消费者。
2. **组件验证**：协议、序列化、CAS、授权、撤权、匹配、预算、异常和幂等；用故障注入测试真实差异，不写只复述实现的测试。
3. **构建验证**：现有 `npm run check`、`npm run build`、`npm run build:dev`、`npm run verify`；有发布候选时按 `pack/pack:dev` 与同产物检查，不把构建哈希当用户验收。
4. **Chrome 原生验证**：新/既有 profile 的真实扩展、User Scripts 开关、实际网站权限、网页效果、原生注册、SW/扩展/浏览器重启。每条有准确 Chrome 版本、extensionId、documentId、artifact hash 与回执。
5. **用户任务验证**：由真实产品入口完成导入/审查/验证/安装/运行/停止/结果/恢复；AI 场景额外关闭 Agent 再独立运行。组件 PASS 不自动将本项改为完成。

统一人工入口仍为 `examples/tasks/demo-form.html` 与 `examples/tasks/README.zh-CN.md`，自动测试复用 `tests/environment/`、`tests/framework/`。专用 Page/GM/Cron 脚本样例可放 `examples/tasks/`；专用自动化 HTML 放 `tests/fixtures/` 等测试专属目录，人工 HTML 仍只保留 demo-form；不恢复历史临时 `/fixture` 手工入口，也不删除仍被运行器引用的 native fixture。网络复用 PR #20 的服务与 requestId 证据，禁止再开第二套互相冲突的测试服务。

## 7. 40 个可执行工程任务

字段约定：用户价值 V、产品契合度 F、复杂度 C、安全风险 R 均独立为 1～5，保留并行 main@36cdb63 新增的 40 组 V/F/C/R 评分；它们是规划估计，不是完成率，也不取平均。第 9 节的 11 个质量就绪度仍单独采用 /100。优先级 `A` 为当前关键链，`B` 为下一阶段，`C` 为需求驱动，`D` 为延期/否决评估；不是完成百分比。`前置` 只写必须先稳定的工程合同；后期原生签收还须满足第 6 节阶段 gate。拟新增文件均明确标“拟”，不冒充已有源码。

### E01 · 核查 HEAD/PR/Worktree/验收证据

- **功能映射**：PORT-005。
- **用户价值 / 契合度**：所有后续工作引用真实候选、回执与资源归属，避免重复开发和误合草稿；V=5，F=5。**优先级/阶段/复杂度/风险**：A；R8.0，持续更新；C=2，R=3。
- **源码与实际证据**：`PARTIAL`。本轮先读 main `945cf927`，同步新增计划的 `0dcc23b6`，随后主集成者核对到测试页变化的 `71fa54e`；真实 Git refs、AGENTS、PR head 和 CI/receipt 是证据来源。PORT-005 的主责涵盖这些结构化证据身份的统一索引；运行事件消费者仍由 E27 实施。Native 未验。
- **复用 / 必改范围**：复用 Git/既有 workstreams 和原机器账本，更新本计划与对应专属 `docs/framework/workstreams/`；只读审计不改历史 owner、receipt 或已有候选。保持最新 main 原有 E01–E40 稳定 ID。
- **API / 数据 / 生命周期**：审计记录 mainSha/prHead/mergeCandidate/changedFiles/testedSha、工作区/资源 owner、各证据级别与原始路径；PR 状态与 SOURCE/COMPONENT/BUILD/NATIVE 四层状态分开，推送前再次比较远端祖先与独有提交。
- **前置**：无。
- **独立验收**：可列出每个 PR 是否合 main、当前头提交、真实消费者/冲突和未关闭验收；旧 base CI 不升级当前状态；三方无冲突与 GitHub mergeable 标签区别；所有已合/待合工作可追溯，不丢并行成果。
- **本地 Chrome / Codex**：Git/源码审计不需；涉及原生证据身份时需实际操作者确认。**阻断 / 下一步**：远端并行推进会使快照失效，合入前再次 fetch；不为清理分支强合仍未验收的 Draft。

### E02 · 既有 RunHost/Controller/Locator/Task 回归

- **功能映射**：AUTO-001、AUTO-002、AUTO-003、AUTO-004、AUTO-005、AUTO-006、AUTO-012、TRG-001、TRG-002、DEV-001、INS-003、DEV-002。
- **用户价值 / 契合度**：保住已投入的 JS 自动化、Locator、参数/结果/停止和直接试运行；V=5，F=5。**优先级/阶段/复杂度/风险**：A；R8.0，后续持续回归；C=3，R=4。
- **源码与实际证据**：`SOURCE_IMPLEMENTED`，完整用户验收仍 `PARTIAL`。实际链见 `src/ui/script-editor.js`、`src/run-host.js`、`src/platform/host/controller-methods.js`、`src/platform/tasks/service.js`、`src/framework/{ChromePage,locator}.js`、`src/scripting/user-scripts/preview.js`；本候选验证 E0。
- **复用 / 必改范围**：先复用 `tests/environment/{controller-main-entry,sidebar-draft-runhost,page-script-preview,task-package-flow}.test.mjs`、`tests/framework/r5-modern-page-api.test.mjs` 和 `examples/tasks/`；只有可复现缺口才改原消费者，不重建执行器。
- **API / 数据 / 生命周期**：维持 source/revision/hash pin、exact window/tab/frame/document、paramsSchema、Durable Run/Result、retirement 与 Stop；Page preview 仅当前主文档一次，不产生正式 Installed。Locator 是受控 DOM 操作，不承诺任意网站可信键鼠。
- **前置**：E01。
- **独立验收**：原草稿无需保存运行；`main()` 一次调用；Locator fill/click/wait/observe 命中真实语义目标；navigation/timeout/Stop/撤权阻断；同源码 Task 独立验证与安装、结果持久化；Page preview 真 DOM 效果与隔离，不能以 ack 替代。
- **本地 Chrome / Codex**：Chrome 必需；Codex 可选作为驱动。**阻断 / 下一步**：未取得新候选全用户链证明；先对本轮影响点定向回归，在最终候选集中原生验收，避免反复无差异全量重跑。

### E03 · 验收集成 PR #22 ESM 源码/构建产物

- **功能映射**：DEV-003、DEV-004、DEV-011。
- **用户价值 / 契合度**：复杂项目可维护原源码，用户不会把压缩 bundle 当作日常编辑内容；V=4，F=5。**优先级/阶段/复杂度/风险**：A；R8.0 收敛 PR #22，R8.5 Source Map 消费增量；C=3，R=3。
- **源码与实际证据**：`PARTIAL`。main 已有 ESM/依赖固定构建、`src/ui/program-source.js` 与草稿 schema 消费者；development 为可读 JS 和本地 Source Map，production 压缩。运行时 map 消费、源码工程保存/恢复/导出及原生验证仍未闭；10.5 有同源码树组件/构建证据。
- **复用 / 必改范围**：沿 #11 中已合入的 PR #22 实现改 builder/validator、`src/ui/{program-source,script-editor,task-workbench}.js`、`schemas/opendesk-program-draft.v1.schema.json` 及其测试；原 Sidebar 编辑器与 `async-main` 入口不换。复用 `tests/fixtures/program/d1-userscript.html` 及现有 map generator，补调试资产身份和原生/运行时消费者。
- **API / 数据 / 生命周期**：源码工程、导入草稿与执行 artifact 分离；保存 entry/sourceFiles/dependencyLock，产物保留 sourceHash/buildDigest/entryFormat/`BUILT_UNVERIFIED`。本地 map 单独固定 hash，不允许运行时远端 map/import 或插件配置执行；源码改变后原 Candidate 不自动有效。
- **前置**：E01、E02；Git 集成已完成，共同用户/原生门槛继续协调 E05，代码/组件审计可独立。
- **独立验收**：single/ESM 均可构建、导入、预览；源码导出可重建相同执行字节；执行 hash/产物不可变；无额外网络和安装 hooks；编译错误能定位实际源码。原生同窗口导入、运行、保存、Stop 保留；调试资产不扩大权限。
- **本地 Chrome / Codex**：Chrome 必需于导入/运行验收；本地 Codex 必需于端到端开发样本。**阻断 / 下一步**：PR #22 及后续改进已在 main。优先补源码快照/映射的持久化与错误消费者、源码导出可重建和真实导入/保存/重启验收，不重新实现已存在的构建/查看入口。

### E04 · 验收集成 PR #20 axiosx 真实 HTTP

- **功能映射**：SEC-012。
- **用户价值 / 契合度**：开发者能分辨标准 fetch、Page SDK axiosx 和 Controller axiosx 的真实请求结果；V=5，F=4。**优先级/阶段/复杂度/风险**：A；R8.0；C=3，R=4。
- **源码与实际证据**：`PARTIAL`。main 的 `src/framework/sdk/http.js` → `src/platform/host/sdk-broker.js` → `src/platform/chrome/network.js` 已接线，限制凭据、重定向、头部与预算；PR #20 的服务和草稿已在 main。合并遗漏 Page draft 的旧按钮与错误 SDK channel；本轮修正为真实 fetch Page API 消费，并复用原服务验证 200/503。完整 CORS/MAIN SDK/Worker 原生验收仍未闭。
- **复用 / 必改范围**：沿 PR #20 的 `examples/tasks/http-test-server.mjs`、`http-axiosx-page-draft.js`、`http-worker-axiosx-draft.js`、`demo-form.html` 与 `tests/environment/basic-browser-http.test.mjs` 继续；只对已复现差异修改 network/SDK，禁止建立第二测试服务。
- **API / 数据 / 生命周期**：测试结果关联 client requestId、服务端收到的真实请求、SDK method/target、原生回执、网页结果；fetch 保持 Web API，axiosx 是受控 SDK，均不宣称完整 GM XHR。HTTP 非成功响应、timeout/abort/redirect 和授权失效分别归类。
- **前置**：E01、E02；HTTP 已进入 main，组合原生验收协调 E05；HTTP 组件审计可以独立。
- **独立验收**：同源/跨源 fetch 的正常 CORS 行为；经过真实 SDK 安装和授权的 GET/POST 与错误/超时；UI 结果和服务日志一致；敏感头、凭据、非法重定向不越界；重复或 UNKNOWN POST 不盲重发。
- **本地 Chrome / Codex**：Chrome 必需；Codex 用于本地驱动但不是产品运行依赖。**阻断 / 下一步**：当前 Page API 草稿明确输出 page-fetch-through-page-api；保留历史文件名但不当作 SDK 验收。按更新的原 HTTP GOAL 独立验证 MAIN SDK、Worker、真实 CORS/权限与请求证据，E04 整体仍 PARTIAL。

### E05 · 验收集成 PR #11 Native Agent

- **功能映射**：AI-003、AI-004、BG-010。
- **用户价值 / 契合度**：外部 Codex/CLI 安全复用已有任务和结果，普通用户可不安装 Host；V=4，F=4。**优先级/阶段/复杂度/风险**：A；R8.0 集成关口，R8.5 产品增强；C=5，R=5。
- **源码与实际证据**：`PARTIAL`。main 已有 `native-agent/`、`src/native-agent/`、独立设置及通往原 `scriptEditor.host` 的六方法接线。组件/构建证据见 10.5；最新 CFT 诊断仍 FAIL，本机完整验收 NOT_TESTED。Host 只是 IPC 适配，活跃 Sidebar 和 1–120 秒 deadline 不等于 BG-010 长任务合同。
- **复用 / 必改范围**：沿 PR #11 修改对应 native 文件、Options 设置和其 `tests/environment/native-agent-*.test.mjs`、`.github/workflows/native-agent-r1.yml`；保持原生失败使验收失败的门禁，并定位当前 CFT 阻断，不重新做 Bridge/RunHost/SDK。
- **API / 数据 / 生命周期**：保留 `bridge.status/target.current/run.start/run.get/run.stop/script.save`；绑定 registrationId、requestId+digest、精确 target、sourceHash 与原 runId。`PENDING` 仅准入，连接消失为 UNKNOWN；Host 启用不是网站授予，长任务须单独授权。
- **前置**：E01、E02。
- **独立验收**：真实启用 Bridge、正确 Host/扩展身份、原 RunHost 运行和持久结果；重复 requestId 不重复执行，异 digest 拒绝；stop/导航/撤权/断线与 ACK 丢失失败关闭，Agent 无权读其他运行；同候选 CI 不吞真实 Native 错误。
- **本地 Chrome / Codex**：Chrome 必需；真实 Codex/CLI 必需。**阻断 / 下一步**：源码已合 main，直接从最新主线固定后续验收候选；定位真实 CFT 扩展身份超时，完成本机 Host/Chrome/Codex/Installed/Stop/恢复和独立 F3，不重新开启已关闭 PR 或据此放宽权限。

### E06 · 验证已合入 Browser Test Lab 基线

- **功能映射**：DEV-012、UX-011。
- **用户价值 / 契合度**：开发与原生验收都有稳定、可理解的 Browser Test Lab 入口；V=5，F=5。**优先级/阶段/复杂度/风险**：A；R8.0，后续按类型补 fixture；C=2，R=2。
- **源码与实际证据**：`SOURCE_IMPLEMENTED`，完整原生覆盖 `PARTIAL`。已有 `examples/tasks/demo-form.html`、`examples/tasks/README.zh-CN.md`、`docs/framework/browser-test-lab-r8.zh-CN.md` 与 `tests/environment/basic-browser-page.test.mjs`；当前七组 Locator/HTTP/表单场景不可删除。E0。
- **复用 / 必改范围**：在既有测试页/运行器增加已确认缺口，复用 `tests/environment/`、`tests/framework/`；专用 Page/GM/Cron fixture 放示例/测试目录。PR #20 服务及 #22 的测试专属 fixture 不重复建设，不恢复历史手工 `/fixture`。
- **API / 数据 / 生命周期**：五类证据分别记录 SHA/artifact hash、Chrome/profile/extensionId、权限与 exact target、run/result/effect/registration/fireId 和原始日志；fixture 固定 ID/Locator 语义，UI 键盘/读屏/对比度单独验。
- **前置**：E01。
- **独立验收**：标准页组件和真实浏览器场景可复现；原 #name/#submit/#done 与七组新场景保留；没有旧链接误导；timeout/failure 不被吞；新类型的 fixture 身份可与产品日志核对，同一产物 F3/ZIP 单独签收。
- **本地 Chrome / Codex**：组件/构建不需 Chrome；原生与用户阶段必需，Agent 场景另需 Codex。**阻断 / 下一步**：先把当前切片和三个 PR 的证据身份列清楚，下一次 Page 开发同步定义 native fixture；不能先把全部 188 项写测试空壳。

### E07 · Page Revision/Installed 身份及持久资产

- **功能映射**：INS-007、META-002、SEC-005、INS-009。
- **用户价值 / 契合度**：Page 与 Controller 共用可追溯资产身份，用户启停/卸载的是确定版本；V=5，F=5。**优先级/阶段/复杂度/风险**：A；R8.1；C=4，R=5。
- **源码与实际证据**：`PARTIAL`。`page-program-contract.js`、`page-program-package.js` 已冻结 Page manifest/依赖/源码并生成 descriptor；`src/platform/tasks/service.js` 已有 Controller 安装/启停。Page Revision/Candidate 持久化和 Installed record 缺可信消费者；E07.1 先做身份/记录合同，E07.2 安装入口只能等待 E09 真实证明，不能自动跨级；E0。
- **复用 / 必改范围**：在拟 `src/platform/tasks/page-program-service.js` 增安装事务与读取，既有 Authority/Broker/Host client 薄接线；复用 `frameworkKV`、依赖引用与版本冻结。
- **API / 数据 / 生命周期**：共享 ProgramRef{namespace,programId,revision,runtimeKind,sourceHash,manifestHash} 适配原 Task v1/Page v1；新增 Page Candidate/import/get 与 Installed{approvedRef,rules,capabilities,generation,desiredState,registryHash,lastError}。E09 专属验证后才允许安装；启停/卸载递增 generation，退役留历史与依赖引用；不增加 DB/第三套版本。
- **前置**：E01、E02。
- **独立验收**：相同 Candidate 幂等导入、hash/来源/锁固定；跨 namespace/旧 revision/CAS 竞争和伪 Available 拒绝；Only E09 认可的 exact Available 版本可安装；启停/卸载/重启持久状态正确，不破坏既有 Controller。
- **本地 Chrome / Codex**：Chrome 必需于最后实际启停/卸载，组件可独立；Codex 可选。**阻断 / 下一步**：缺 Page 专属证明与 schema；先完成事务及拒绝越级，再接 E10/E12，不能将持久 enabled=true 直接作为原生执行许可。

### E08 · 经典脚本文件/HTTPS 来源与审核

- **功能映射**：INS-001、INS-002、INS-005、INS-006、INS-010、META-001、META-003、META-004、UX-008、ECO-002。
- **用户价值 / 契合度**：用户知道审核的真实源码、出处、版本、网站及风险；晚到的旧审查不能盖掉新源码的拒绝结论；V=5，F=5。**优先级/阶段/复杂度/风险**：A；R8.0 当前审查修复，R8.1 正式导入；C=3，R=4。
- **源码与实际证据**：`PARTIAL`。现有独立目录 JS 导入、`src/ui/page-dependencies.js` 与 D1 parser/manager 可复用；本轮曾发现异步旧 report admission 覆盖当前源码与 `@antifeature` 未展示，已由 PR #25 修复。第 10 节保留定向证据；完整安装审查仍缺，Native E0。
- **复用 / 必改范围**：当前切片改 `src/ui/page-dependencies.js`、`src/scripting/user-scripts/dependency-metadata.js` 及现有 UI/parser 测试；后续拟 `src/platform/tasks/page-import.js`，复用现有独立目录增加 Page 审查页面。完整 UI 先放 `examples/ui/` 原型，勿重做 Sidebar。 当前源码审查与依赖资产审批采用不同 fingerprint；正文改动可复用同一锁，批准前仍须重新审核当前执行语义。
- **API / 数据 / 生命周期**：真实导入 URL/本地文件摘要与源码字节固定；`@namespace`、名称或 `@downloadURL` 不能证明来源。source-review fingerprint 和 dependency fingerprint 分离；迟到资产信息可重用，但当前源码的 grants/rules/blockers 必须重新计算。风险文本用 textContent 等安全投影，披露不等于安全判定。
- **前置**：E07.1（Candidate 资产合同），不等待 E07.2 安装闭环；其中 E08.1 当前预览依赖/风险审查修复不依赖新增 Page 资产服务，可立即交付。
- **独立验收**：异步请求期间修改正文/`@grant`/`@match`/来源/依赖后不显示错误许可；审批重读当前源码，未知指令拒绝；恶意风险/作者文本不执行 HTML；本地/HTTPS 导入仅生成审查候选，同名异源不能静默覆盖；全部外部依赖和权限差异可核对。
- **本地 Chrome / Codex**：源码/组件不需；完整导入与审查 UI 需 Chrome，Codex 可选。**阻断 / 下一步**：本轮完成 E08.1 后继续 E07/E09 和真实来源获取合同；不以用户在依赖区点“批准”冒充正式安装授权。

### E09 · Page 类型专属 Verification/Available

- **功能映射**：INS-008、AI-002、SEC-006。
- **用户价值 / 契合度**：可用状态有真实 Page 类型证明，AI/Controller 文本结果不能越级发布；V=5，F=5。**优先级/阶段/复杂度/风险**：A；R8.1；C=5，R=5。
- **源码与实际证据**：`PARTIAL`。`page-program-contract.js` 冻结 Page kind/sourceHash/lock/rules，`page-program-package.js` 仅要求调用者提供可信 `assertAvailable`；`src/platform/tasks/service.js` 只有 Controller 专属可信验证。正式 Page Candidate/Verified/Available 服务 `MISSING`；E0。
- **复用 / 必改范围**：在 E07 的拟 `src/platform/tasks/page-program-service.js` 接类型验证与 Available 路由；复用现有 Authority/Broker、Journal、dependency manager 和 Page compiler；不改变 Controller Task v1 证明，不建第二 observer/executor。
- **API / 数据 / 生命周期**：拟 `verifyPageCandidate/makePageAvailable` 消费受信 Page proof，绑定同 sourceHash/manifestHash/依赖锁、world、精确文档与真实效果。预览 ack、安装注册 ack、自动匹配证明各自记录；Verified 不等于用户安装，变更源码/权限后需要重新审查/验证。
- **前置**：E07.1、E08、E02；仅依赖 Candidate 合同与来源审查，不等待 E07.2 安装。E07.2 在本任务的真实验证后才能完成。
- **独立验收**：字段或 hash 篡改、Controller Result 冒充 Page proof、伪 UI stage、跨 namespace、旧版本 proof 均拒绝；相同候选幂等导入；真实 Page proof 后才可 Available；重启读取同版本，不破坏既有 Controller installed/revisions。
- **本地 Chrome / Codex**：Chrome 必需于 Page verification；Codex 可选。**阻断 / 下一步**：可信观察器与 Candidate 验证入口尚未建立；先交付只读/持久 Candidate 与拒绝越级的切片，再接真实 proof，不创建自动批准的占位实现。

### E10 · 单 Writer userScripts 注册与状态对账

- **功能映射**：LIFE-001、LIFE-002、LIFE-003、LIFE-004、LIFE-015、SEC-008。
- **用户价值 / 契合度**：安装状态能在浏览器重启、扩展更新和 SW 休眠后恢复或准确报错；V=5，F=5。**优先级/阶段/复杂度/风险**：A；R8.1；C=5，R=5。
- **源码与实际证据**：`PARTIAL`。`page-program-package.js` 只生成 descriptor；main `broker.js/sw.js` 仅 Page preview/world 清理，无正式 `register/update/unregister` 调度链。`getScripts()` 在 preview 的用途是能力探测，不是安装对账。E0。
- **复用 / 必改范围**：拟 `src/scripting/user-scripts/registration-reconciler.js`，消费 E07 的 records 与原 compiler；在 `src/platform/host/broker.js` 和 `src/sw.js` 生命周期挂钩，复用日志/storage，不新建执行器。
- **API / 数据 / 生命周期**：按 registryId、manifestHash、规则、world、generation 比较 desired/actual；串行 register/update/unregister/getScripts，持久 operationId 与 expectedGeneration，旧 ack 不覆盖新状态。启动、update、permission change、enable/disable、资源损坏后对账；方法抛错时禁用且保留可恢复错误。
- **前置**：E07、E09、E12。
- **独立验收**：缺失补注册、漂移移除/修复、幂等重入；API 拒绝/超时/中途 SW 消失不生成假成功；扩展更新清空注册后按当前授权恢复；浏览器开关关闭或 host 撤销后后续文档不能启动；无第二 writer。
- **本地 Chrome / Codex**：Chrome 必需；Codex 可选驱动。**阻断 / 下一步**：E07/E12 的安装身份和启动授权必须先稳定；Node stub 只能验证状态机，原生 ID/运行效果在 E15 关闭。

### E11 · 站点匹配、runAt、frame、once 语义

- **功能映射**：META-005、META-006、META-009、META-010、META-011、META-014、DEV-005、LIFE-006、LIFE-009。
- **用户价值 / 契合度**：迁移脚本时准确知道哪些规则生效，未支持语义不会被静默忽略；V=5，F=5。**优先级/阶段/复杂度/风险**：A；R8.1 稳定 D1，R8.2 受限 glob；C=4，R=5。
- **源码与实际证据**：`PARTIAL`。`src/scripting/user-scripts/dependency-metadata.js` 有 bounded parser/assess/assert，`page-program-contract.js` 复用 nativeOptions；D1 拒绝 include/exclude、GM 与不受支持世界。`includeGlobs/excludeGlobs` 消费者缺；`tests/environment/dependency-metadata.test.mjs` 可复用，E0。
- **复用 / 必改范围**：改现有 parser/rules/package/compiler 及测试；需要 glob 时扩展显式版本 profile 与字段校验，不能偷偷改变既有 v1 hash/已批准范围，不新建第二 matcher。 复用 `dependency-manager.js/execution-source.js` 和现有 D1 tests，正式注册继续使用已批准 @require 顺序、离线锁与世界，不重新做下载器。
- **API / 数据 / 生命周期**：R8.1 固定 D1 HTTP(S) match/exclude-match、run-at、noframes、USER_SCRIPT grant-none；rules/manifest hash 与 metadata 一致。@require 按固定 order/source/hash/world 装载，锁缺失/损坏拒绝，旧引用未释放不得 GC。glob/正则扩展只由 E22 的独立 profile 开放。
- **前置**：E07、E06。
- **独立验收**：非法/重复/未知规则与头部欺骗、超限拒绝；metadata 与 frozen pageRules 不一致拒绝；真实主/同源/跨源/嵌套 frame、document-start/end/idle、nonmatch 零；依赖按序、离线、hash 篡改及跨脚本审批隔离；完整一次启动在 E15 签收。
- **本地 Chrome / Codex**：Chrome 必需于匹配/run-at/frame 语义；Codex 可选。**阻断 / 下一步**：官方字段存在并不证明完整油猴兼容；先保持严格 D1，再固定受限 glob 规范和 native 样本后开放。

### E12 · 撤权竞态/USER_SCRIPT 文档级授权

- **功能映射**：LIFE-005、LIFE-010、LIFE-011、LIFE-013、SEC-001、SEC-002。
- **用户价值 / 契合度**：已停用、已撤权或伪造身份的脚本不能启动或调用特权方法；V=5，F=5。**优先级/阶段/复杂度/风险**：A；R8.1 启动门槛，R8.2 GM 入口；C=5，R=5。
- **源码与实际证据**：`PARTIAL`。现有 `authority.js` 的 Host/SDK gate、`src/platform/chrome/permission-gate.js`、preview exact target 可复用；`onUserScriptMessage/onUserScriptConnect` 的已安装脚本消费链 `MISSING`。E0。
- **复用 / 必改范围**：拟 `src/scripting/user-scripts/message-bridge.js`，原 compiler 增受信 prelude，Broker/Authority 负责验证；`src/sw.js` 挂专用事件。不得用页面 CustomEvent、普通 `onMessage` 或 payload scriptId 代替原生身份。
- **API / 数据 / 生命周期**：Chrome USER_SCRIPT world 专用 messaging，真实 sender 的 extension/tab/frame/document/origin 与另行证明的受控 world/单脚本实例绑定互相核验；Chrome sender 不直接提供 worldId 或 scriptId；token 仅为关联，不是自签权限。启动前查 Installed+Enabled/current generation/source、网站/frame/world；每个 GM call 再查方法和目标。页面导航、卸载、撤权、开关关闭与 owner 变更立即失效。 严格同步 document-start 与异步授权先验不可同时承诺；原生测量后明确受限时序或拒绝。Chrome 开关不可用以实际 API 失败判定，不能只测属性；停用不回滚已发生 DOM/监听器/远端效果。
- **前置**：E07、E09。
- **独立验收**：恶意页/另一个脚本/另一个世界/旧文档/卸载后消息、伪 grant、过量 body/频率、重放均拒绝；在 unregister 完成前竞态打开的新文档仍不能越权启动。Chrome sender 字段本身不足以证明世界/脚本实例；独立实例认证未证明前，依赖即时启动围栏的 profile 和特权 GM 均不可用，不能降为信 payload。无逐次认证的受限无 GM profile 以原生注销对账完成为停用生效边界，此前明确 pending，不能承诺零窗口。
- **本地 Chrome / Codex**：Chrome 必需，真实 sender 与时序不可 mock 代验；Codex 可选。**阻断 / 下一步**：精确原生身份与 document-start 的授权时序必须实测；先只允许可证明的有限 profile，不以便利为由开放任意 chrome API。

### E13 · 版本切换与旧版回滚

- **功能映射**：INS-013、LIFE-012。
- **用户价值 / 契合度**：新脚本或依赖有错误时保住最后批准的版本；V=5，F=5。**优先级/阶段/复杂度/风险**：A；R8.1；C=4，R=5。
- **源码与实际证据**：`MISSING` 于 Page 安装版本切换；Controller revisions、依赖不可变锁和 `frameworkKV` CAS 可复用。`page-program-package.js` 的版本性 descriptor 不构成回滚服务。E0。
- **复用 / 必改范围**：在 E07 Page service 和 E10 reconciler 增 expectedGeneration/pendingVersion/lastGoodVersion；锁资产引用沿原 dependency manager；拟定向 `page-program-update.test.mjs`，不建立第二版本库。
- **API / 数据 / 生命周期**：先准备/审查/验证新 immutable version，再持久 CAS 切换 desired，原生 update/reconcile 失败则恢复已批准 lastGood 并记录补偿。权限新增未经确认不能保留旧许可；旧 native 回执按 operation/generation 拒绝，DOM 已发生效果不可倒带。
- **前置**：E07、E10、E12。
- **独立验收**：坏 hash、依赖丢失、权限扩大、register/update 拒绝、ack 丢失、存储失败/SW 终止、并发停用的所有切入点；最后状态只能是已批准旧版、新版或明确阻断，不静默混合版本；回滚后真实下一文档使用旧 hash。
- **本地 Chrome / Codex**：Chrome 必需；Codex 可选。**阻断 / 下一步**：缺 installed/reconciler 主链；R8.1 先做手动固定版本替换，R8.3 再接在线检查更新，不能用自动更新扩大本批范围。

### E14 · 三页签内 Page 最小管理 UI

- **功能映射**：UX-001、UX-002、UX-003、UX-004、UX-005、UX-006、UX-007、META-019。
- **用户价值 / 契合度**：普通用户能看到安装类型与真实状态，开发者继续直接写 JS；V=5，F=5。**优先级/阶段/复杂度/风险**：A；R8.1，当前站点汇总/多语言后续增强；C=3，R=3。
- **源码与实际证据**：`PARTIAL`。`src/ui/tool.html` 的三个 tab、`task-workbench.js` 的 Controller 卡片/发现、`script-editor.js` 原底栏已实现；Page Installed/registration 状态卡片与元数据多语言展示未接线。原生 a11y E0。
- **复用 / 必改范围**：现有 `src/ui/{tool.html,task-workbench.js,tool-shell.css,site-access.js}` 最小字段/入口；先在 `examples/ui/` 独立原型审查状态和复杂管理页，保持原真实 DOM/监听器/焦点与 RunHost 所有权。
- **API / 数据 / 生命周期**：只消费可信 installation/registration projection；区分 Draft、Preview、Verified、Installed、Enabled、permission-blocked、registration-failed。Page 主动作启停，Controller 主动作运行/停止；当前站点统计仅限已安装匹配集合，多语言只改展示不改身份。
- **前置**：E08、E10、E12。
- **独立验收**：我的任务/发现/开发恰好三个一级页签；旧编辑/运行/保存/停止流程完整；Page 卡片可查站点、版本、原因和启停；键盘、焦点恢复、读屏消息与窄宽度可用；preview 成功不会变 installed。
- **本地 Chrome / Codex**：Chrome 必需于实际 Side Panel/读屏路径；Codex 可选。**阻断 / 下一步**：等待可信安装投影接口；复杂审查、完整源码、GM 调试、Cron 配置放独立管理页，不把 Sidebar 改为复杂 IDE。

### E15 · 原生 Chrome P0 签收

- **功能映射**：LIFE-007、TRG-003。
- **用户价值 / 契合度**：普通用户能确认脚本何时/何站生效，开关或撤权问题可解释；V=5，F=5。**优先级/阶段/复杂度/风险**：A；R8.1；C=5，R=5。
- **源码与实际证据**：`PARTIAL`。现有 rules/allFrames/runAt、compiler 与 `src/ui/site-access.js` 有部分基础；once-token 是局部防重，不是安装级 exactly-once 证明；自动匹配完整 Native 尚缺。E0。
- **复用 / 必改范围**：以 E07～E12/E13/E14 实际消费者形成原生驱动；复用 `tests/framework/`、`examples/tasks/demo-form.html`，拟 Page 专用 frame/时序样本置 `examples/tasks/page-userscript/` 或测试 fixture 目录；不恢复历史手工 `/fixture`。
- **API / 数据 / 生命周期**：回执记录 exact document/frame/world、approved generation、sourceHash、实际 start/complete/error 与网页效果。document-start/end/idle 逐一声明支持范围；异步 guard 不伪装严格同步 start。停用阻止后续文档，现存 DOM/监听器只支持明示 cooperative cleanup。
- **前置**：E06、E10、E11、E12、E13、E14。
- **独立验收**：用户真实开关/网站授权→安装→匹配新文档一次/nonmatch 零；相同 URL 新 document、主/同源/跨源/嵌套/空白 frame、移除 frame、SPA 不重注入；撤权/停用/损坏依赖后新文档零；Browser/SW/扩展更新重启对账与失败回滚。
- **本地 Chrome / Codex**：Chrome 必需；本地 Codex 可作专用验收操作者。**阻断 / 下一步**：在安装链、真实 proof 和 guard 闭合前不得签 R8.1；先明确可验 run-at profile 和可复用 fixture，再集中验证同一候选。

### E16 · GM Facade 与可信专用 Script 消息桥

- **功能映射**：SEC-004、META-012。
- **用户价值 / 契合度**：GM 方法只能以真实已安装脚本身份进入唯一可信 Broker；V=5，F=4。**优先级/阶段/复杂度/风险**：B；R8.2；C=5，R=5。
- **源码与实际证据**：`MISSING` 于 GM facade/message dispatcher。可复用 E12 的 Page 启动身份、原 `src/platform/host/{broker,authority,sdk-broker,sdk-methods}.js`；现有非 none grant 拒绝基线必须保留到逐方法准入。E0。
- **复用 / 必改范围**：拟 `src/scripting/user-scripts/gm/{facade,contract}.js` 接 E12 的 USER_SCRIPT message-bridge；Host 以现有 capability registry 分派。无新网络、权限、DB或RunHost；不让第三方脚本任意调用 chrome.*。
- **API / 数据 / 生命周期**：GM request 投影 method/args/requestId，不承认 payload 身份；结合真实 sender 的 extension/tab/frame/document/origin、独立证明的受控 world/实例绑定与 installed generation 反查 ProgramRef/grants/target，每次调用重新授权和预算。配置 world messaging 只开启已批准脚本世界，NAV/uninstall/revoke/owner 变化使会话失效。
- **前置**：E07、E10、E12、E15。
- **独立验收**：假 scriptId/grant、跨 world/document/namespace、旧 generation、重复 requestId 不同 digest、消息超限与重放拒绝；真实 Chrome sender 与独立实例认证共同证明身份后才开放方法；专用消息通道本身不代表具体脚本身份；未实现 grant 清晰报错，绝不退回普通网页消息信任。
- **本地 Chrome / Codex**：Chrome 必需，真实 sender 与时序不可 mock 代验；Codex 可选。**阻断 / 下一步**：精确原生身份与 document-start 的授权时序必须实测；先只允许可证明的有限 profile，不以便利为由开放任意 chrome API。

### E17 · GM_info/addStyle/addElement/log G0

- **功能映射**：GM-001、GM-002、GM-003、GM-004。
- **用户价值 / 契合度**：常见脚本获得可查证的 GM_info/style/log 和类型提示，未支持 API 明确报错；V=5，F=5。**优先级/阶段/复杂度/风险**：B；R8.2；C=2，R=3。
- **源码与实际证据**：`MISSING` 于 GM facade。可复用 `src/framework/sdk/{registry,service,resources}.js`、Host 与 E12；现有 parser 对非 none grant 拒绝是安全基线，不能直接解除。E0。
- **复用 / 必改范围**：拟 `src/scripting/user-scripts/gm/{info,style,log}.js` 与受限 addElement，复用 E16 contract、原 SDK/DOM/日志能力；方法类型与错误进入 E23 验收。不得复制 ScriptCat GPL 实现或直接开放任意 DOM script URL。
- **API / 数据 / 生命周期**：`GM_info/GM.info` 为冻结已安装元数据快照；`GM_addStyle` 绑定文档，`GM_log` 预算/脱敏；GM_addElement 拒绝任意 script URL/扩展特权 URL。API profile 明示 Promise/callback/同步、返回值、错误码、grant、版本差异；grant 是申请，不是批准。
- **前置**：E16。
- **独立验收**：每个方法有类型/参数/异常/撤权/预算测试和真实 native 对照；安装身份不可改写，GM 对象污染不影响 Broker；不同脚本/frames 隔离；只有已验证 profile 的方法可公开，未知 GM 始终拒绝。
- **本地 Chrome / Codex**：Chrome 必需；Codex 可选。**阻断 / 下一步**：E12 未证明可信 sender 前不能开启任何特权 GM；先 info/style/log 三个小 API，GM_addElement 明确限域后再加。

### E18 · GM Promise KV 存储 G1

- **功能映射**：GM-005、GM-007。
- **用户价值 / 契合度**：脚本配置可持久保存，多个标签能得到一致的值变更通知；V=5，F=5。**优先级/阶段/复杂度/风险**：B；R8.2；C=4，R=4。
- **源码与实际证据**：`MISSING` 于 GM 命名空间/方法。现有 `src/framework/sdk/storage.js` 与 `src/platform/host/sdk-methods.js`、IndexedDB 可复用，但 AppStorage 不是 GM keyspace。E0。
- **复用 / 必改范围**：拟 `src/scripting/user-scripts/gm/values.js`，在原 storage/Authority 增 typed namespace access 与订阅记录；只复用现有 DB，不复制全部 SDK facade。
- **API / 数据 / 生命周期**：先 `GM.getValue/setValue/deleteValue/listValues` Promise；键域绑定稳定 ProgramRef/安装 owner，序列化/配额/默认值/undefined 明确，事务 revision 单调。批量、跨页 listener 与传统同步属于 E19，不能提前靠别名假装支持。
- **前置**：E16、E07。
- **独立验收**：跨脚本同名键隔离，undefined/默认值/不可序列化值、批量部分失败或原子语义明确；同脚本跨页 remote 与顺序正确；崩溃/重启/撤权后无未授权读写/广播；重复删除和监听移除幂等。
- **本地 Chrome / Codex**：Chrome 必需于跨文档与重启；Codex 可选。**阻断 / 下一步**：先固定值域、批量语义和消息预算，完成 Promise 版本，再评审 E19 的同步兼容，不能先套别名。

### E19 · GM 同步镜像、批量和变更事件

- **功能映射**：GM-006、GM-008、GM-009。
- **用户价值 / 契合度**：旧脚本同步行为、批量写与跨页事件各有可验证合同；V=4，F=4。**优先级/阶段/复杂度/风险**：B，传统同步为 C；R8.2 后段；C=5，R=4。
- **源码与实际证据**：`MISSING`。后台异步 Storage 没有可证明的同步 GM 本地镜像；已有 Promise facade 也不能直接更名成同步接口。E0。
- **复用 / 必改范围**：先在 [GM 兼容矩阵](../architecture/browser-framework/userscript-compatibility-matrix-r8.zh-CN.md) 固定 profile 与不兼容项；若通过评审，拟 `src/scripting/user-scripts/gm/sync-values.js`，复用 E18 的版本值与 E12 的启动快照。 批量与 listener 拟沿 E18 values.js 扩展，使用原 storage 订阅和有界消息，不新增值数据库。
- **API / 数据 / 生命周期**：只有启动前完成快照并定义缓存一致性、跨页更新、写失败可观测性时才开放 `GM_getValue/GM_setValue`。明确同步返回和异步落盘的差别；不得阻塞 RPC、轮询主线程或返回 Promise 冒充同步；冷启动/快照失效需明示拒绝。 Promise 批量接口明确原子/部分失败合同；listenerId、顺序、remote 标志及跨文档广播需验证，停用/撤权/导航/SW 重启清理或重建。批量/监听可独立交付，不为等同步镜像一起延期。
- **前置**：E18。
- **独立验收**：无缓存时不能给假默认值当真实读；断线写、配额失败、乱序广播、并发值更改、SW 重启和导航一致性经过真实浏览器验证；每个可观察差异在 profile 中明示。无法证明则以“不支持传统同步形式”验收该决策。 批量值边界/并发、跨脚本隔离、跨页 remote 语义、重复取消与重启订阅有独立组件和 native 证明。
- **本地 Chrome / Codex**：启用实现时 Chrome 必需；Codex 可选。**阻断 / 下一步**：严格同步与异步权限/存储时序成本高；默认延期实现，先提供迁移到 `await GM.*` 的诊断，不为“兼容数量”造假同步。

### E20 · @resource 与 GM Resource API

- **功能映射**：META-015、GM-010、GM-011。
- **用户价值 / 契合度**：脚本可离线访问已审查的文本/图片等资源，资源不随远程源悄然变化；V=4，F=4。**优先级/阶段/复杂度/风险**：B；R8.2；C=3，R=4。
- **源码与实际证据**：`MISSING` 于 @resource 执行语义和 GM 方法。可复用 `dependency-manager.js`、`src/framework/sdk/resource-contract.js` 与 `src/platform/chrome/background-services.js` 的固定资源校验；现有 packaged allowlist 不能直接开放全部扩展资源。E0。
- **复用 / 必改范围**：扩展原依赖资产模型的非执行资源类型，拟 `src/scripting/user-scripts/gm/resources.js`；Broker 通过原资源/存储服务读取授权资源，不新增 WAR 通配。
- **API / 数据 / 生命周期**：resourceName→真实 URL/hash/MIME/encoding/byteLimit 绑定固定版本；`GM_getResourceText/GM_getResourceURL` 与 Promise 命名按 profile 区分。同步文本需要启动前已载入；Blob/data URL 生命周期在 document/uninstall/资源退役时清理；不能把 resource 内容自动当 JS 执行。
- **前置**：E16、E07、E11。
- **独立验收**：未声明资源、名称冲突、超额、非法 UTF-8/MIME、损坏 hash、跨脚本访问拒绝；离线运行与 URL 清理有效；同步 API 不发异步 RPC 冒充结果；MAIN 看不到其他脚本或内部任意 WAR。
- **本地 Chrome / Codex**：Chrome 必需于资源 URL/世界/内存生命周期；Codex 可选。**阻断 / 下一步**：先明确资源类型、缓存与同步 preload 门槛，逐个开放 Text 和 URL，不直接复用无差别下载 URL。

### E21 · GM 菜单命令与脚本归属

- **功能映射**：GM-012、UX-010。
- **用户价值 / 契合度**：用户能从已安装脚本的菜单进入配置和显式动作；V=4，F=4。**优先级/阶段/复杂度/风险**：B；R8.2；C=3，R=3。
- **源码与实际证据**：`MISSING` 于 GM menu registry；可复用 `src/ui/task-workbench.js` 的任务卡片与既有可信 UI/Host 消息。E0。
- **复用 / 必改范围**：拟 `src/scripting/user-scripts/gm/menu.js` 与现有卡片详情/独立管理页受控入口；不增加 Sidebar 一级页签，不把此菜单混同浏览器 contextMenus trigger。
- **API / 数据 / 生命周期**：`GM_registerMenuCommand/unregisterMenuCommand` 返回脚本/文档受限 commandId；标签、accessKey、排序和重复注册行为按 profile 固定。点击来自可信 UI，callback 仅发至仍安装/获准的原脚本；导航、frame removal、停用和注销清理。 当前站点脚本数/状态只从可信已安装匹配集合派生，不能将未安装候选统计成运行中脚本。
- **前置**：E16、E14。
- **独立验收**：脚本不能修改他人菜单或伪造系统操作；恶意标签安全显示；重复注销幂等；刷新后旧 callback 不可执行；真实键盘/点击与焦点正常；callback 出错记录到原脚本日志。
- **本地 Chrome / Codex**：Chrome 必需；Codex 可选。**阻断 / 下一步**：等候可信 callback 身份桥；先实现当前文档最小菜单，跨 tab 聚合以明确目标为前提。

### E22 · @include/exclude 与 SPA urlchange 兼容

- **功能映射**：META-007、META-008、LIFE-008、TRG-004。
- **用户价值 / 契合度**：迁移常用 glob 和 SPA 脚本时兼容边界明确、不会重复整段注入；V=4，F=4。**优先级/阶段/复杂度/风险**：B；R8.2；C=4，R=4。
- **源码与实际证据**：`MISSING` 于正式 Page location-change subscription。Controller 有 document/target fences，不等同 SPA 事件 API；预览只执行一次。E0。
- **复用 / 必改范围**：拟 `src/scripting/user-scripts/location-events.js`，复用 E12 身份与解除订阅；扩展 `examples/tasks/demo-form.html` 的既有 SPA 样本或专用 fixture；不默认修改网页 MAIN 全局 history。 同时在现有 metadata/rules/compiler 增显式 glob profile，复用 Chrome includeGlobs/excludeGlobs；不建立第二匹配器，不偷偷扩大旧 v1 的批准范围。
- **API / 数据 / 生命周期**：按安装/文档登记 location-change listener，投影 previous/current URL 和事件 cause；pushState/replaceState/popstate 只通知获准脚本，新的 URL 不匹配时停止后续 callback 准入。重复订阅、导航、停用/撤权和 frame removal 清理；兼容 `window.onurlchange` 须有明确 profile。 Glob profile 明确 matches 底层范围与 include/exclude 过滤的组合、URL query/转义/大小写；不能覆盖的正则变体仍拒绝。
- **前置**：E11、E12。
- **独立验收**：hash/push/replace/back/forward 的监听次数与顺序，页面重复路由不重注入脚本；订阅回调/脚本状态隔离；停用或 scope 改变后无新特权事件；MAIN 与 USER_SCRIPT 边界真实验证。 对 glob 正/反样本和真实 native 匹配逐条比较；only include 的源脚本不得无审核变成任意全站授权。
- **本地 Chrome / Codex**：Chrome 必需；Codex 可选。**阻断 / 下一步**：先选择可证明的跨世界事件来源，不假装 isolated history wrapper 能观察全部 MAIN 操作；不支持的浏览器/路径明确显示限制。

### E23 · GM G0/G1 方法级兼容验收

- **功能映射**：GM-023。
- **用户价值 / 契合度**：以真实完整任务证据验证前置模块的合同，防止单组件通过被误标产品完成；V=5，F=5。**优先级/阶段/复杂度/风险**：B；R8.2；C=4，R=4。
- **源码与实际证据**：`PARTIAL`（既有测试/日志基础可复用）；本类型完整原生验收为 `NOT_TESTED`。现有 `tests/environment/`、`tests/framework/`、原机器账本与统一 demo-form 是真实入口，前置模块必须实际接线才能验收。E0。
- **复用 / 必改范围**：沿现有 tests/原生驱动加 GM 方法级 fixture 与类型合同检查；复用 E16–E22 原服务，不引入替代 GM runtime。类型声明由 E33 消费，不能复制竞品许可证不兼容实现。
- **API / 数据 / 生命周期**：compat record 固定 manager/profile/API/browser/version/sourceHash/permissions 与 Promise/同步/callback/错误期望和观察；每个方法独立报告，未支持同步明确拒绝不阻断已经通过的 Promise 子集。
- **前置**：E17、E18、E19、E20、E21、E22。
- **独立验收**：所选 info/style/log/values/resources/menu/SPA/glob 方法和失败路径有真实 Chrome 回执；跨脚本/文档/撤权隔离、异步/同步/事件差异和声明类型正确；输出经过验证的 profile 而非 fully compatible 营销。
- **本地 Chrome / Codex**：Chrome 必需；Codex 可选作为驱动。**阻断 / 下一步**：E16–E22 真实消费者及逐方法类型还未交付，先固化 G0/Promise 样本；同步 profile 不可证明时明确不支持，不能因此声称全部 GM 已验。

### E24 · @connect 与 GM_xmlhttpRequest 适配

- **功能映射**：META-013、GM-013。
- **用户价值 / 契合度**：迁移需要宿主 HTTP 的脚本，仍能精确限制目标网站与请求行为；V=5，F=5。**优先级/阶段/复杂度/风险**：B；R8.3；C=5，R=5。
- **源码与实际证据**：`MISSING` 于 GM XHR；`src/platform/chrome/network.js` 和 `src/framework/sdk/registry.js` 已有受控 text/JSON transport、大小/超时、pre/post 授权和 effect 记录。axiosx 的存在不是 GM 兼容证据。E0。
- **复用 / 必改范围**：拟 `src/scripting/user-scripts/gm/http.js` 做事件/响应投影，在原 Host/NetworkService 加必要窄接口与授权点；沿 PR #20 HTTP 服务扩展测试，保留原 axiosx 行为和所有预算。
- **API / 数据 / 生命周期**：`GM_xmlhttpRequest/GM.xmlHttpRequest` 分别定义 callback/Promise/abort handle、readyState 与 onload/onerror/ontimeout/onabort/onloadend。目标许可=浏览器实际 host∩脚本 @connect∩用户批准∩GM grant∩本次 identity；重定向逐跳重新审查或拒绝；首批 text/JSON、omit credentials，binary/stream/upload progress 后置。
- **前置**：E04、E16、E12、E23。
- **独立验收**：真实 HTTP 服务验证 callback 顺序、Promise 错误、取消和 timeout，目标/子域/IP/redirect/@connect 边界；页面 CORS 仍正常限制 fetch；撤权/导航/卸载使请求权限失效；UNKNOWN 副作用不自动重发；响应/header 不泄漏凭据。
- **本地 Chrome / Codex**：Chrome 必需；Codex 可选。**阻断 / 下一步**：兼容 profile 与 per-script connect 批准尚缺；先做最窄可证明请求子集，不通过“注入 axiosx”授予任意跨域权限。

### E25 · GM 下载/通知/新标签页受控适配

- **功能映射**：GM-014、GM-015、GM-016。
- **用户价值 / 契合度**：脚本可在显式批准的范围内保存文件、显示通知和打开网页；V=4，F=4。**优先级/阶段/复杂度/风险**：B；R8.3；C=3，R=5。
- **源码与实际证据**：`MISSING` 于 GM 形式；`src/platform/downloads/index.js`、`src/platform/chrome/{notifications,tabs}.js`、SDK notification facade 是现有底层。E0。
- **复用 / 必改范围**：拟 `src/scripting/user-scripts/gm/{download,notification,tabs}.js`，复用原服务、Authority、Journal 与 UI 授予；按方法逐个接线，不把整个 chrome.downloads/tabs 暴露给脚本。
- **API / 数据 / 生命周期**：GM_download 的 URL/文件名/MIME/手势/配额，notification 的隐私文案/速率/点击与完成回调，openInTab 的允许 URL/active/close 句柄分别冻结合同。Handle 绑定 install generation 和 owner，不枚举用户其他标签/下载。
- **前置**：E16、E12、E24。
- **独立验收**：真实浏览器权限取消/拒绝、后台消息/用户手势、下载失败/取消、通知关闭/点击、tab 关闭/导航/撤权；回调只能归属原脚本；恶意文件名、非 HTTP(S) 和大批 spam 被拒绝；重复 requestId 不重复副作用。
- **本地 Chrome / Codex**：Chrome 必需；Codex 可选。**阻断 / 下一步**：先逐 API 申请与原生验证，不因 manifest 已有敏感权限默认为全部第三方脚本获准。

### E26 · 脚本更新/权限差异/来源审批

- **功能映射**：INS-004、INS-011、INS-012、META-016、ECO-001、ECO-003。
- **用户价值 / 契合度**：用户可找到脚本并安全更新，知道新增的权限和来源变化；V=5，F=5。**优先级/阶段/复杂度/风险**：B；R8.3；C=4，R=5。
- **源码与实际证据**：`PARTIAL`。现有 parser 保存 update/download 信息但不执行更新；Revision 与依赖锁存在，Page 更新服务/权限 diff/来源变更审核 `MISSING`。E0。
- **复用 / 必改范围**：复用 E08 导入审查、E07 安装和 E13 回滚，拟 `src/platform/tasks/program-update.js`；独立管理页显示源码/依赖/网站/能力 diff。外部目录只加显式外链/候选导入入口，不新建在线市场。
- **API / 数据 / 生命周期**：更新源绑定真实已审来源；`checkForUpdate` 只生成 proposal，下载固定字节后比较 version/sourceHash/metadata/capability/dependency/source origin。`@updateURL/@downloadURL/@installURL` 为不可信声明，扩权/换域重新批准；回滚保留 lastGood 和历史验证。
- **前置**：E07、E08、E13、E23。
- **独立验收**：同名异源、来源重定向/域变更、版本回退、依赖篡改、新增 grant/connect/match、失败下载和并发停用；网页脚本链接不得自动执行；用户明确批准后固定版本切换；历史 diff 与实际安装字节一致。
- **本地 Chrome / Codex**：Chrome 必需于导入/更新完整用户链；Codex 可选。**阻断 / 下一步**：先手动检查更新和差异确认，周期订阅由 E39 按需求后置；不靠版本字符串自动信任发布者。

### E27 · 脚本日志/诊断/备份/恢复

- **功能映射**：INS-014、INS-015、INS-016、INS-017、DEV-009、UX-009、UX-012、SEC-011、LIFE-014、ECO-006、ECO-007。
- **用户价值 / 契合度**：用户能区分安装失败、注册成功、脚本启动和真实效果，开发者可按源码定位问题；V=4，F=4。**优先级/阶段/复杂度/风险**：B，R8.1 最小状态为 A；R8.1～R8.4 分批；C=4，R=4。
- **源码与实际证据**：`PARTIAL`。现有 runs/results/commandJournal、`src/ui/resource-diagnostics.js` 与 `task-workbench.js` 有 Controller 数据；Page/GM/Trigger 的完整来源及事件流缺。E0。
- **复用 / 必改范围**：复用当前 Journal/结果存储与诊断消费者，拟轻量 `src/platform/tasks/program-events.js`；独立管理页面呈现版本/日志/GM 诊断，原 Sidebar 只显示状态与跳转。 备份复用现有 storage/asset/download，拟 `program-backup.js`；批量启停/回收站先最小独立管理页，不延伸旧采集/模板业务；E27.1 为基础日志，E27.2 为 R8.3 本地备份，E27.3 批量/回收站延期到有真实规模需求后。
- **API / 数据 / 生命周期**：事件关联 ProgramRef/install generation、runId/fireId/effectId、document、phase、severity/errorCode；区分 desired/registered/started/effect-observed/finished 与 UNKNOWN。固定留存、大小和速率预算、脱敏，不保存默认全量页面/密码/cookie；依赖顺序可查，不能保证独立脚本绝不冲突。 版本化 JSON/ZIP archive 明示 source/dependency/config/hash 与敏感 GM 值是否包含；恢复到待核查资产，网站权限与原生 proof 不随包授予。回收站停准入并保留引用/配置，GC 有保留期。
- **前置**：E07、E10、E12（E27.1 基础日志，可在 R8.1 先交付）；E27.2 本地备份还须 E15、E18、E26；E27.3 批量/回收站另行需求确认，不能用后期前置阻塞早期最小状态。
- **独立验收**：失败事件能指向当前脚本/hash/目标，不串到另一运行；敏感字段脱敏且有留存策略；异常/取消/未知效果不显示成功；真实页面与日志一致；日志查询和导出不能跨 namespace。 干净 profile 导出/恢复需重新授权并实际运行；损坏包/path traversal/超限/来源冲突拒绝；批量单个失败不误报全部成功，历史版本和秘密字段处理可核对。
- **本地 Chrome / Codex**：Chrome 必需于实际网页/事件关联；Codex 可选。**阻断 / 下一步**：R8.1 先安装/注册错误与回执索引，后续随 GM/Cron 补事件，不为日志新建数据库。

### E28 · GM 网络和更新原生总体验收

- **功能映射**：SEC-003。
- **用户价值 / 契合度**：以真实完整任务证据验证前置模块的合同，防止单组件通过被误标产品完成；V=5，F=5。**优先级/阶段/复杂度/风险**：B；R8.3；C=5，R=5。
- **源码与实际证据**：`PARTIAL`（既有测试/日志基础可复用）；本类型完整原生验收为 `NOT_TESTED`。现有 `tests/environment/`、`tests/framework/`、原机器账本与统一 demo-form 是真实入口，前置模块必须实际接线才能验收。E0。
- **复用 / 必改范围**：必须复用 PR #20 的 HTTP 服务、requestId/日志和 Page SDK/Controller 对照；增加 GM/profile/更新/恢复用例到原 tests/驱动，网络服务与 UI 不重复建设。
- **API / 数据 / 生命周期**：@connect 目标授权交集、实际 HTTP request/effect、callback/Promise/abort 顺序、Installed generation、更新来源/权限 diff 和 lastGood hash 同时留证；register ack、网络收到、业务成功与用户流程分别判断。
- **前置**：E24、E25、E26、E27。
- **独立验收**：真实跨域拒绝/授权/撤销、redirect/凭据/timeout/错误，下载/通知/tab 副作用与 owner；更新扩权需确认、损坏版本回滚；关闭/重启与备份恢复不自动授予权限；未知请求不自动重发。
- **本地 Chrome / Codex**：Chrome 必需；Codex 可选。**阻断 / 下一步**：先关闭 E24–E27 实际消费者和组合候选身份；在原 HTTP 服务上收集独立 GM/更新/备份证据，不拿 axiosx 通过替 GM 签收。

### E29 · Background runtime 与隔离预算

- **功能映射**：BG-001、BG-008、BG-009。
- **用户价值 / 契合度**：不需要网页 DOM 的工作有独立运行类型，并能明确处理宿主退出；V=4，F=4。**优先级/阶段/复杂度/风险**：B；R8.4；C=5，R=5。
- **源码与实际证据**：`MISSING` 于 Background Script 正式类型/验证。`src/run-host.js`、sandbox/Worker 与 commandJournal 是可复用基础；`background-services.js` 只为 SDK 服务，不能当实现证据。E0。
- **复用 / 必改范围**：拟 `src/scripting/background/contract.js` 和现有宿主上的受限 adapter，修改 typed program service；先评估可见扩展文档/沙箱短执行，确需 Offscreen 再独立 permission/理由审查，不能搬 ScriptCat runtime。
- **API / 数据 / 生命周期**：Background kind 无 page DOM，能力通过同 Broker；固定 ProgramRef、deadline、预算、checkpoint format、host incarnation。`@background` 作为明示兼容 profile，不能把任意 JS 偷渡为 SW 代码；宿主失联进入明确停止/UNKNOWN/可续状态，不无限 keepalive。
- **前置**：E07、E12。
- **独立验收**：禁止 DOM/未授权 page/tabs/network，预算/停止/deadline/宿主销毁正确；checkpoint 与固定版本绑定，恢复不重复未知远程效果；Offscreen 的必要性和资源释放真实可查；没有浏览器退出后继续运行承诺。
- **本地 Chrome / Codex**：Chrome 必需；Codex 可选。**阻断 / 下一步**：先确定无 DOM 的短任务宿主及 typed verification，再给 E30 调度；Native 长任务归 E05 后续独立设计与授权，现有 IPC Host 不提供该执行合同。

### E30 · Cron/Alarms/fireId/错过策略

- **功能映射**：BG-002、BG-003、BG-004、BG-005、BG-006、TRG-008、PORT-004。
- **用户价值 / 契合度**：用户可配置低频定时任务并理解实际执行/错过记录；V=4，F=4。**优先级/阶段/复杂度/风险**：B；R8.4；C=5，R=5。
- **源码与实际证据**：`MISSING` 于持久调度与 Alarms driver；manifest 当前没 `alarms`。现有 RunHost/Journal 恢复只是可复用局部，不是 Cron 重启保证。E0。
- **复用 / 必改范围**：拟 `src/platform/tasks/{trigger-contract,scheduler}.js` 与 `src/platform/chrome/alarms.js`；复用现有 DB 事务/RunHost/Authority，按需要审计 manifest。Cron 配置先独立 HTML 原型，UI 不加第四 tab。
- **API / 数据 / 生命周期**：TriggerDefinition 保存 target ProgramRef、timezone、cron profile、nextDueAt、misfirePolicy(skip/coalesce/catch-up-one)、maxConcurrent/maxDuration、enabled/generation。Alarms 只唤醒，事务 claim fireId/lease；DST 跳过/重复时间、时区改动和 browser-start 补偿明示。Chrome 版本差异以实际能力探测/原生结果决定，不硬编码未来保证。
- **前置**：E29。
- **独立验收**：解析边界、无效时区/DST、时间前后拨、休眠、浏览器关闭/再开、SW 被杀、重复 alarm、并发/租约过期/暂停；一个 fireId 不重复准入，远程结果 UNKNOWN 不盲重发；运行和触发日志分开；实际触发允许延迟。
- **本地 Chrome / Codex**：Chrome 必需且按版本分组；Codex 可选驱动。**阻断 / 下一步**：先固定 `@crontab` 支持语法和 misfire，复用唯一调度权威；不得宣称 SW 常驻、普通扩展关闭浏览器继续、秒级准点或远程副作用 exactly-once。

### E31 · 快捷键/右键/启动事件触发

- **功能映射**：META-018、TRG-005、TRG-006、TRG-007、TRG-009、TRG-010。
- **用户价值 / 契合度**：用户从合适的交互入口触发已有程序，不必每次打开复杂编辑器；V=3，F=4。**优先级/阶段/复杂度/风险**：B；R8.4，网页 CustomEvent 默认延期；C=4，R=4。
- **源码与实际证据**：`MISSING` 于正式 installed program event triggers；`manifest.json` 有 optional contextMenus，但无对应受审程序触发链；现有 SW tab/navigation 事件用途是资源失效，不能视为用户触发功能。E0。
- **复用 / 必改范围**：拟 `src/platform/tasks/event-triggers.js`，复用 E30 通用 TriggerDefinition 合同和现有 Authority/RunHost；按需新增 commands/contextMenus wiring，不直接公开浏览器事件对象。
- **API / 数据 / 生命周期**：trigger 记录 program/install generation、允许事件/站点、参数投影、速率预算和真实 user gesture；`@run-at context-menu` 是非标准 Trigger 适配，不属于 document timing。网页 CustomEvent 只提出不可信请求，默认不能自动获得敏感运行资格。
- **前置**：E29、E30、E12；复用已稳定的 E30 TriggerDefinition，不复制第二触发合同。
- **独立验收**：停用/卸载/撤权后 menu/command 不启动；当前真实 target/gesture 不能由页面伪造；快捷键冲突和缺权限可解释；tab event 风暴去重/限速；源页面不能用 CustomEvent 跨站启动特权 Task。
- **本地 Chrome / Codex**：Chrome 必需；Codex 可选。**阻断 / 下一步**：先右键和快捷键两个显式入口，再按真实需求开放事件集合；高风险网页触发保持拒绝。

### E32 · 后台任务故障注入和原生验收

- **功能映射**：BG-007、BG-011。
- **用户价值 / 契合度**：以真实完整任务证据验证前置模块的合同，防止单组件通过被误标产品完成；V=4，F=5。**优先级/阶段/复杂度/风险**：B；R8.4；C=5，R=5。
- **源码与实际证据**：`PARTIAL`（既有测试/日志基础可复用）；本类型完整原生验收为 `NOT_TESTED`。现有 `tests/environment/`、`tests/framework/`、原机器账本与统一 demo-form 是真实入口，前置模块必须实际接线才能验收。E0。
- **复用 / 必改范围**：沿现有 CFT/原生运行器和 Journal 加 scheduler fault injection；复用 E29–E31 真实宿主与 alarms，不以 JS setTimeout mock 冒充浏览器休眠/关闭证据。
- **API / 数据 / 生命周期**：记录 TriggerDefinition generation、scheduled/fireAt、fireId、lease/host incarnation、run/effectId、并发预算/暂停/错误/重试决定；区分调度触发、DB 准入、执行与远端副作用，不作 exactly-once 远程承诺。
- **前置**：E29、E30、E31。
- **独立验收**：时区/DST/时钟跳变、browser/SW/Host 终止、alarm 重复与迟发、lease 过期、并发上限和暂停/撤权；misfire 策略与日志一致，恢复不重复 UNKNOWN 副作用；测试相应 Chrome 版本，不用旧版本推新保证。
- **本地 Chrome / Codex**：Chrome 按版本原生验证必需，Codex 可选。**阻断 / 下一步**：先落地持久 Trigger/lease 与真实宿主；按故障点逐个注入，区分报警到达、DB 准入和远程效果，未跑场景继续 NOT_TESTED。

### E33 · 成熟 ESM/类型/Source Map 开发体验

- **功能映射**：DEV-006、DEV-007、DEV-008、DEV-010、AUTO-007、AUTO-008、AUTO-009、AUTO-014。
- **用户价值 / 契合度**：开发者通过清晰 JS 示例完成条件/循环、表单/下载、数据与多目标任务；V=5，F=5。**优先级/阶段/复杂度/风险**：B；R8.5；C=4，R=3。
- **源码与实际证据**：`PARTIAL`。`examples/programs/`、`examples/tasks/`、Page/Locator、SDK/download/result 已有；多 Tab/frame/shadow 与资产格式需按真实 API 逐项验，不宣称全 Playwright 支持。E0。
- **复用 / 必改范围**：在既有示例目录加受版本控制的 JS/ESM 模板，按实测缺口增强现有 API/类型/错误定位；文件数据采用既有 Result/下载服务，保持 AGENTS 排除采集业务范围。 PR #22 源码快照/可读产物和本地 map 已在 main；在此基础补运行时 map 消费、调试资产身份、GM 类型声明/诊断及源版本/依赖 diff，不能在 E33 再做一套 Editor 或 map generator。 用户后续提出的原生/React/Vue/Tailwind UI 开发专项见第 12 节与 UI 专项设计；先闭合资产和原生容器，再增加编译适配，不将设计记为已实现。main576 已由并行 2530b90/5769730 交付 Page CSS/JSON/图片静态内嵌、@opendesk/ui Shadow DOM helper 与原生 UI 样例；复用这些组件继续验收，不重复实现或把 UI helper 等同正式安装/GM/UserCSS。
- **API / 数据 / 生命周期**：正常 JS 实现条件、循环和变量，模板显式 target/params/result/deadline；多 Tab/frame/shadow 必须精确身份与独立权限，文件资产固定 format/hash/大小。复杂工作发布为原 Task/Candidate，不创建图形 workflow/node engine。 sourceMap 固定 hash 并只指向实际源码/helper，不要求运行时远端加载；调试资产与 source/artifact/Installed 分开，单文件仍可直接输入运行。
- **前置**：E03、E23。
- **独立验收**：每模板可从干净源码构建、导入、运行、停止；结果与页面/文件可复核；循环/多目标不绕开预算或 owner；CSV/JSON 编码/注入边界明确；未知效果先观察再决策，不自动无限重试。
- **本地 Chrome / Codex**：Chrome 与本地 Codex 开发样本必需；普通运行不依赖 Codex。**阻断 / 下一步**：先覆盖用户高频完整任务，发现具体 API 缺口才修，避免做通用 IDE 或恢复已排除采集产品。

### E34 · Agent→验证 Task→无 AI 重跑

- **功能映射**：AI-001、AI-005、AI-006、AI-010。
- **用户价值 / 契合度**：AI 负责创作与验证，用户可在没有模型的情况下重复使用成果；V=5，F=5。**优先级/阶段/复杂度/风险**：B；R8.5；C=5，R=5。
- **源码与实际证据**：`PARTIAL`。Agent→Task 合同、`examples/tasks/agent-observe-draft.js`、`agent-modern-search.v1.opendesk-task.json`、原 Task service 和现代 observe 已有；实际 Agent-to-installed-task 原生闭环 `NOT_TESTED`，模型提供商适配未审全。E0。
- **复用 / 必改范围**：沿 E05 Native Bridge 和既有 Task/项目发布入口，按需添加薄工具 adapter/结构化诊断；不新增 Agent executor、Agent TaskDB 或强制模型订阅，不再建重复 observe RPC。
- **API / 数据 / 生命周期**：观察结果/网页文字/代码建议都是不可信数据；草稿→相同字节执行→Revision/Candidate→类型验证→Available→用户安装。Skill/Tool manifest 引用确定 Task/API 能力，不赋予额外权限；敏感动作独立用户意图，provider 切换不改变执行合同。
- **前置**：E05、E02、E15。
- **独立验收**：真实 Codex/CLI 观察、产生 JS、执行/核对、冻结 hash 与类型 proof；提示注入/伪 selector/异常结果不得变成授权；用户安装后关闭 AI/Native 连续两次运行并记录结果/Stop，离线任务不要求模型在线。
- **本地 Chrome / Codex**：Chrome 与真实 Codex/CLI 必需。**阻断 / 下一步**：E05 原生 gate 与可重复任务证据未闭；先固定现有 demo-form 的最小闭环，再加 MCP/Skill/provider 适配。

### E35 · 可选录制→Locator/JavaScript 草稿

- **功能映射**：AUTO-010、AUTO-011、AI-009。
- **用户价值 / 契合度**：开发者从真实操作生成可读、可审查的 JavaScript，提高任务创建效率；V=3，F=4。**优先级/阶段/复杂度/风险**：C；R8.5；C=5，R=5。
- **源码与实际证据**：`PARTIAL`。已有 `src/framework/ChromePage.js` 的 screenshot 经 `src/framework/control/native-driver.js` 到 `captureVisibleTab`，仅 viewport 图像能力；全页截图/OCR、录制→JS 正式消费者 `MISSING/NOT_TESTED`。Locator/observe 可复用，不能宣称完整视觉自动化。E0。
- **复用 / 必改范围**：拟受控 recorder adapter 与独立管理页，优先输出原 JS/Task；复用 Locator 语义/错误合同。视觉/CDP 只有独立需求与权限评审后接入，不默认增加 debugger 或桌面组件。
- **API / 数据 / 生命周期**：RecordedAction 为不可信草稿，记录 stable locator 建议、输入脱敏、target 身份、时间和动作，不录密码/隐私字段；selector 修复产生新 candidate/hash，不能静默替换已安装版本。截图/OCR 的范围与留存独立设限，默认不增加未明确授权的图像读取或外部分析能力。
- **前置**：E02、E34。
- **独立验收**：录制→可读 JS→真实重放→停止/结果→冻结；重复按钮/重绘/frame/导航下定位不误触；隐私输入不落盘；视觉降级不能绕权限或把猜测当成功；无需第二图引擎。
- **本地 Chrome / Codex**：Chrome 必需；Codex 建议用于源码审查/验证。**阻断 / 下一步**：先做录制常见 fill/click 到现有 API；截图/OCR/CDP 后置，成功率用真实任务数据，不能先承诺全站可靠。

### E36 · 可选 CLI/MCP/Skill Tool facade

- **功能映射**：AI-007、AI-008、AI-011、TRG-011、PORT-006。
- **用户价值 / 契合度**：可选 CLI/MCP/Skill 面向不同开发工具开放同一套受控 Task 能力；V=4，F=4。**优先级/阶段/复杂度/风险**：B；R8.5；C=4，R=5。
- **源码与实际证据**：`PARTIAL`。Agent→Task 合同、main 的六方法 Native/CLI 与原 Host/RunHost 可复用；完整 MCP/Skill/provider 切换工具链与脱 AI 验收未闭。`src/framework/sdk/registry.js` 是能力表基础，不等于正式第三方插件 SDK。E0。
- **复用 / 必改范围**：沿 E05 的 Native Host/CLI 增必要薄 tool facade/schema，复用现有 capability registry；Skill 只引用已有 Task/API，代码/类型由本地开发合同约束。第三方插件发行/云账户/商店归 E39，不新建平行 adapter 内核。
- **API / 数据 / 生命周期**：工具限定 approved methods/target/run ownership 与 requestId/digest；MCP/CLI/Skill 共享 ProgramRef/版本与错误合同，provider 切换不改变 grant；外部 Adapter 掉线不会使普通已安装 Task 失效。
- **前置**：E05、E34。
- **独立验收**：真实 tool 调用的参数与返回可追溯至原 run/result；不同客户端不能窃取他人 runId/target；未知请求效果不重发；工具退出后 Task 独立运行；未启用 Agent 的普通用户无额外 Host/网络依赖。
- **本地 Chrome / Codex**：Chrome 与真实 Codex/CLI 必需。**阻断 / 下一步**：E05 原生 gate 与可重复任务证据未闭；先固定现有 demo-form 的最小闭环，再加 MCP/Skill/provider 适配。

### E37 · 独立 UserCSS 样式安装和回滚

- **功能映射**：CSS-001、CSS-002、CSS-003、CSS-004、CSS-005、CSS-006、CSS-007。
- **用户价值 / 契合度**：网页样式可以按站点安装、启停和回滚，无需 JS 权限；V=3，F=3。**优先级/阶段/复杂度/风险**：C；R8.6；C=3，R=3。完整预处理若被选择仍需 C=5 的独立子任务评估。
- **源码与实际证据**：`MISSING` 于 UserCSS 独立程序合同；原 JS 安装/哈希/授权与有限样式操作只能作为基础，不算 UserStyle 完整支持。E0。
- **复用 / 必改范围**：拟 `src/scripting/usercss/{contract,driver}.js` 与 typed program service，复用 ProgramRef/installed records、版本和独立管理页。基础 CSS 不需要引入预处理依赖。
- **API / 数据 / 生命周期**：kind=usercss，sourceHash+styleRules、受限 UserStyle metadata、配置与插入 token；启停/卸载按明确注入句柄清理，样式 origin/顺序与冲突可查。CSS URL 的隐私/网络边界独立审；不获得 GM/JS capability。
- **前置**：E07、E13、E14。
- **独立验收**：仅匹配获准站点生效；停用/卸载/版本回滚去除正确样式；多样式优先级/页面 CSS 冲突有可解释规则；未知头部/外部资源限制明确；真实原生效果。@var、less/stylus/uso、订阅同步分别设子关口，基础版不可声称兼容它们。
- **本地 Chrome / Codex**：Chrome 必需；Codex 可选。**阻断 / 下一步**：先基础 CSS 与少量元数据；复杂变量/预处理/同步明确延期，只有真实需求才追加依赖和 API。

### E38 · Firefox/Safari 平台适配

- **功能映射**：PORT-001、PORT-002、PORT-003、PORT-009。
- **用户价值 / 契合度**：用户在其他浏览器获得经验证的功能范围，而非换个 manifest 就声称支持；V=3，F=4。**优先级/阶段/复杂度/风险**：C；R8.6；C=5，R=5。
- **源码与实际证据**：`PARTIAL`。Chrome 的平台边界和包结构可复用；Firefox MV3、Safari 驱动/构建/原生套件 `MISSING`。Chrome 名称或 API 同名不构成兼容。E0。
- **复用 / 必改范围**：先在原 platform driver 之上提取必要 BrowserUserScriptsDriver/PermissionDriver 能力表，拟 `src/platform/firefox/`；Safari 先独立 POC。按平台构建 manifest，不把 chrome.* 扩散到 GM 纯合同层。
- **API / 数据 / 生命周期**：每平台明确 supported runtime/messaging/permission/frame/runAt/lifecycle；Firefox optional userScripts 与 Chrome 安装期声明+开关分开，Safari 不假定 world/sender 等价；原 ProgramRef/版本/授权记录通过受审适配，未知能力 fail closed。
- **前置**：E15、E23、E32。
- **独立验收**：逐浏览器/版本新 profile 安装、授权、GM 子集、自动匹配、撤权、休眠/重启/更新、卸载；同一 fixture 对照预期；平台不支持字段明确拒绝；不搬用 Chrome receipt 为 Firefox/Safari 签收。
- **本地 Chrome / Codex**：Chrome 回归及对应 Firefox/Safari 原生环境必需；Codex 可选。**阻断 / 下一步**：先能力探测和 Firefox POC，待需求/验收环境再决定 Safari；未验平台一律不宣传正式支持。

### E39 · 按需求评估订阅/同步/市场/Plugin SDK

- **功能映射**：ECO-005、ECO-008、ECO-009、ECO-011、ECO-012、PORT-007、PORT-008。
- **用户价值 / 契合度**：平台扩展可复用统一能力，用户可按需订阅/迁移而无强制云账号；V=2，F=2。**优先级/阶段/复杂度/风险**：C；R8.6；C=5，R=5。
- **源码与实际证据**：`PARTIAL`。原 SDK registry/Authority/RunHost 可复用；main74 已有 sidebar-tool.v1、离线 packer、opaque UI sandbox 与 storage.local/currentPage.read/tasks.open 三能力白名单。只聚焦原任务 UI，不调用 RunHost 执行。通用插件 Registry、ProgramRef/安装代次适配、签名、云同步和企业分发仍 MISSING，原生 E0。
- **复用 / 必改范围**：先把已有 UI tool 局部 id/version/capabilities 与 installed.v1/data.v1 明确限制为 UI 资产/数据适配，不升级为第三套自动化权限或任务库；对接共享 ProgramRef/安装代次与原 Authority 后才扩充能力。再从现有方法表派生受限 capability descriptor，plugin adapter/manifest 仅引用原服务；订阅、同步、签名、企业投放分为独立子任务，未有需求不部署账号/商店后端。
- **API / 数据 / 生命周期**：共享 ProgramRef、capability 名称/版本/schema/error、安装 generation、配额与卸载；第三方扩展包不能注册任意 Chrome 方法。订阅只通知候选；同步使用 device/revision/conflict policy，不能复制设备网站授权/native proof；签名仅证明签署身份，不代替脚本审核。
- **前置**：E26、E27、E38。
- **独立验收**：未知 capability/版本/签名、跨 namespace、插件卸载/资源泄漏/超预算失败隔离；同步并发冲突不静默覆盖、不自动扩权；订阅更新仍经审查；企业策略不能成为绕开用户/平台权限的通道。
- **本地 Chrome / Codex**：被选中子项需相关浏览器/多设备原生验收；Codex 可选。**阻断 / 下一步**：默认延期云同步、公开 marketplace 和企业集中投放；现有 UI 工具先由 E40 限定边界，main407 已增加 storage.onChanged 关闭跨窗口失效实例和实际宿主消息负例；tasks.open 销毁 iframe 后 Promise 回执、排队后实例重验、跨窗口安装/卸载 CAS 和数据写入竞态仍需独立收敛。扩展执行/网络能力前必须复用 E07/E12 身份，不将整个生态工程作为 R8.1 前置依赖。

### E40 · 安全、隐私与发布约束

- **功能映射**：META-017、GM-017、GM-018、GM-019、GM-020、GM-021、GM-022、SEC-007、SEC-009、SEC-010、SEC-013、SEC-014、SEC-015、ECO-004、ECO-010、AUTO-013。
- **用户价值 / 契合度**：用户能信任程序来源和权限边界，维护者能撤回有问题版本；V=5，F=5。**优先级/阶段/复杂度/风险**：A；R8.0 基线，R8.3 公开发行前必过；C=4，R=5。
- **源码与实际证据**：`PARTIAL`。`manifest.json` 当前默认 `<all_urls>`、cookies/downloads/tabs/notifications，optional 多种敏感 API；`permission-gate.js`/Authority 约束应用调用，依赖锁/许可文件存在，但不是商店最小权限合规证明。E0。
- **复用 / 必改范围**：审计现有 manifest、build-contract/verify-package、依赖 manifest/LICENSE 与公开隐私文档；必要时提出独立渠道 manifest/按需权限补丁，先依据真实产品需求，不擅自改掉用户明确选择的开发权限基线。 本轮 E08.1 与 E40.1 共审当前源码新鲜度/风险披露；后续高敏兼容先更新诊断和 ADR，未授权不改变公开权限。
- **API / 数据 / 生命周期**：远程用户 JS 仅在许可的 userScripts 世界执行；静态 SDK/Host 必须是受审包内代码。main74 手工导入的固定离线 UI 包只在 opaque sandbox 展示，不能借此加载远程代码或获得自动化权限；manifest sandbox CSP 扩展需同时验证原 Controller sandbox 的约束和新 UI 桥。每依赖注明 origin/hash/license/允许使用方式；供应链告警、issue/反馈入口、撤回版本进入 Retired/disabled 的流程有身份记录，不删除旧证据。 常规 GM_audio/GM_webRequest 明确不实现；GM_cookie、unsafeWindow/MAIN、@sandbox/@unwrap/@run-in、私有 tab storage 和 HTTP 流量拦截延期，不能枚举其他脚本标签数据；clipboard 仅在真实手势/内容类型/目标权限可证明时单独开放，不能用 axiosx/GM XHR 名称偷渡。
- **前置**：E01。
- **独立验收**：每个声明权限都有实际消费者/用户价值/撤权路径；构建不夹带未审远程代码；GPL/闭源竞品实现不混入；含敏感信息的反馈/日志有脱敏；撤回后不新启动对应版本；公开发行政策按当前官方文档再核验。 未支持 metadata/GM 不因警告而继续执行；高敏项保持明确拒绝就是当前决策的完成条件。若未来启用，必须独立需求/威胁/权限/原生 negative tests，不为兼容数量自动实现。
- **本地 Chrome / Codex**：公开权限提示/升级迁移需 Chrome；许可静态审查不需 Codex。**阻断 / 下一步**：当前宽权限是明确发布风险，不能由高 UX/价值分抵消；先形成权限用途表与精确差异，再决定公开渠道，不执行未经请求的商店发布。

## 8. Sidebar 与管理页面的文字信息架构

| 产品入口 | 保留的内容 | 本计划允许增加的最小内容 |
| --- | --- | --- |
| 我的任务 | 已安装 Controller、参数、运行/停止、结果/历史、启停与管理 | Page/未来 Background/Style 类型标记、适用网站、确定版本、启用和真实注册状态、失败原因、详情入口；按类型显示运行或启停，不使用含糊的统一“成功” |
| 发现 | 已安装本地任务的查找、筛选与“导入”独立目录 | 导入受支持 `.user.js`/源码包/后期备份；外部目录只作为后续显式链接，不自动变成市场 |
| 开发 | 原 JS 编辑器、运行草稿/保存版本/停止、参数、Page 试运行/依赖折叠区 | 受审版本进入 Candidate 的轻量入口、源码/产物状态和诊断；单文件仍可直接输入，复杂 ESM 留本地项目 |
| 独立管理页面 | 原完整目录与 Task 详情 | 安装源码/权限/来源/风险审查、完整版本 diff、复杂源码、GM 调试/菜单、Cron、备份/恢复；先独立 HTML 原型后接实际服务 |

原型文件建议按具体任务放 `examples/ui/page-program-install-review.html`、`page-program-history.html`、`scheduled-task-settings.html`；这些是拟用位置，**本轮没有将原型冒充产品实现**。若现有目录已有对应文件，优先复用；入口/状态正确性、键盘焦点、窄宽度及错误恢复分别验收，原型视觉评分不能替代真实 Side Panel。

## 9. 独立评分与未关闭风险

### 9.1 11 个维度独立评价

以下为本轮按真实源码与证据给出的**工程就绪度专家判断**，不代表测试成功率、市场统计或兼容率。每项独立，不计算平均/总分；95/100 是达到相应门槛后的目标，不能预先赋分。Chrome 项 0 表示本轮缺少身份一致的完整原生签收证据，不表示测试发现浏览器质量为零。

| 维度 | 当前 /100 | 可定位依据 / 主要缺口 | 达到 95 目标所需事实 |
| --- | ---: | --- | --- |
| 产品定位 | 93 | 四用户群、五维、一核清楚；普通用户 Page 主链未交付 | E07–E15 真实安装任务完成，普通/开发/AI 入口不强依赖 |
| 用户脚本兼容 | 46 | 受限 D1 parser/require/preview 已有；正式自动运行与 GM 缺 | 公布支持 profile，选定 metadata/GM 子集逐方法原生验证，明确未支持范围 |
| 现代 JavaScript 开发体验 | 80 | 单文件/ESM、源码/产物视图与本地 map 已入 main；源码持久化/错误映射及原生链未闭 | 源码/产物分离、错误定位、构建/导入/冻结可重现，完整开发链通过 |
| 浏览器自动化 | 84 | Controller/Locator/observe/Task/结果/停止有实现；任务成功率未量化 | 代表性用户任务精确目标、动作、结果和停止通过，同候选效果证据完整 |
| 后台和定时任务可靠性 | 18 | 通用 Run/Journal 可复用；Background/Trigger/Alarms 尚缺 | E29–E32 故障恢复、DST/misfire、租约/并发原生通过，保证边界清楚 |
| AI Agent 可扩展性 | 67 | Agent→Task 合同和 main Native/CLI 六方法接线已有；真实 Mac/Codex 未闭 | E05/E34/E36 原生 E2E，退出 AI 后两次独立任务运行/停止通过 |
| MV3 生命周期 | 61 | 现有 SW/Host 恢复基础；Page 注册/启动 guard/Cron 未闭 | 重启/升级/休眠/撤权竞态、scheduler 的恢复合同原生通过 |
| 安全与权限 | 70 | Authority/锁和本轮审查修复；世界身份、撤权与宽权限仍有缺口 | E12/E16 sender/target/代次、GM 目标交集、公开渠道权限/许可通过 |
| UX | 85 | 三页签与直接开发保留；Page 安装/错误/版本路径未闭 | 普通用户完整任务、Side Panel/a11y、新 profile 开关/授权与恢复通过 |
| 可维护性 | 87 | 禁止第二内核/DB/权限/网络；40 稳定任务覆盖 188 ID | 新消费者沿唯一合同，类型/平台适配及错误文档一致，没有第二状态权威 |
| 真实 Chrome 验证 | 0 | 本轮源码/组件/构建不等于受控 Chrome/Codex；旧候选不能代签 | 同 SHA/产物/权限的原生用户链、原始回执及必要 F3/ZIP 可核对 |

### 9.2 当前发布阻断

1. **Page 主链缺失**：compiler 不等于 installed/register；新文档未经真实安装身份授权即执行属于安全 blocker，归 E07–E15。
2. **启动时序与撤权竞态**：异步 guard 与 document-start 严格时机尚未同候选证明；不能静默延后或只做 unregister 后宣传无竞态，归 E12/E15。
3. **源码已合但用户证据未闭**：main189 已包含 Native/HTTP/Program；旧 base CI、组件 PASS、timeout 被吸收均不能替 Native/用户门槛。最新 f1ca 的扩展 ID 超时仍 FAIL；E04 草稿修复也不等于 MAIN SDK/CORS 通过，归 E03/E04/E05。
4. **默认权限与公开分发**：main 目前广泛站点/敏感 API；应用层 gate 是必要保护，但不自动满足公开渠道最少权限。归 E40，任何新 grant 不能继承全扩展权限。
5. **同步 GM 与网络副作用**：同步值不能伪装；GM XHR 不解除凭据/redirect/target gate；取消和 UNKNOWN 不等于远端没有效果，归 E19/E24/E25。
6. **跨版本/平台与供应链**：未测的 Chrome 行为、Firefox/Safari、竞品 Beta、签名或 hash 都不能推导运行安全/全面兼容；归 E37～E40。

以上任一关键 gate 未闭，相关阶段不签收；计划、代码提交或高价值分均不能抵消。

## 10. 本轮已执行的切片、文档和证据

### 10.1 实际源码范围

本轮产品切片候选为 `84dc3c7abe08505ae5e24849315dc8dd5587932d`，基于本计划审计 main。它完成 E08.1/E40.1：

- `src/ui/page-dependencies.js`：异步 inspect/prepare 及 approval 前对当前源码重新进行准入；相同依赖的晚到报告可复用资产信息，但不得覆盖当前源码的 grants/match 等错误。无 input 事件的源码替换也重新评估，并将诊断同步到当前 UI。
- `src/scripting/user-scripts/dependency-metadata.js`：把已有 `@antifeature` 描述投影成当前脚本审查警告；风险披露不充当安全判定，也不自行扩大 grants。
- 现有 parser/UI 的定向测试：新增能在旧实现复现失效的回归，保护正文变化仍可复用同一依赖锁；无 Sidebar 结构、RunHost、权限 schema 或第二网络/执行内核变动。

Page 正式安装、GM、Cron/Background、UserCSS、跨浏览器仍没有因此变成完成。E08/E40 工程任务整体保持 `PARTIAL`；切片可以分别达到 `SOURCE_IMPLEMENTED/COMPONENT_TESTED/BUILD_VERIFIED`，Chrome 仍独立为 `NOT_TESTED`。

### 10.2 验证记录与 Git 身份

最终集成记录须附原始日志路径及合入后的 main SHA；本表将已验证产品候选、历史/局部候选和原生未验分开。

| 候选 / 操作 | 实际结果 | 证据范围与限制 |
| --- | --- | --- |
| 产品切片 `84dc3c7` 的相关组件 | 71/71 PASS；源检查 138 项通过 | `COMPONENT_TESTED`；[相关组件原始日志](../framework/workstreams/evidence/r8-engineering-r1-b62cc961/final-components.log)、[源码检查](../framework/workstreams/evidence/r8-engineering-r1-b62cc961/final-source-check.log)；后续组合证据仍以实际候选为准 |
| 产品切片 `84dc3c7` 的完整环境 | 197/197 PASS | 已对该产品源码补跑全环境；不代表后来 main `71fa54e` 的新增测试通过 |
| 随后合并 main `71fa54e` 的集成检查 | 新增至 198 项，初跑 197 PASS / 1 FAIL；README 最小修正后 198/198 PASS、canonical 12/12 PASS、源码检查 138 通过 | 初次失败由 README 重写触发标准入口保护；本地修复随后被远端 `ca3e765` 等价修复取代，最终保留远端版本。该新组合测试不得用旧 197/197 代替 |
| 产品切片 `84dc3c7` 最终生产/开发 build、verify | PASS；prod `4b5c7f0abe22d4d98e297a34253fe4b106fdb9af30649498b5d2d4adede71649`；dev `f2ba88748aa159accf0475cfcc8ffe3240b717929fcf683dbeb2a1d254c3a2f6` | `BUILD_VERIFIED` 于本候选；[生产构建](../framework/workstreams/evidence/r8-engineering-r1-b62cc961/final-build-production.log)、[开发构建](../framework/workstreams/evidence/r8-engineering-r1-b62cc961/final-build-development.log)、[verify](../framework/workstreams/evidence/r8-engineering-r1-b62cc961/final-verify-package.log)；生产 SW 327366/327680 字节，余量仅 314 字节，后续增代码必须检查产物预算 |
| Native + HTTP + Program 组合 `75e4cde`（审计当时未入 main） | CI 47/47 Native、58/58 共享、254 PASS/4 SKIP 环境、157 check、双构建/verify；真实 CFT Options 0/1 FAIL | run `37815030847`；[组件原始日志](../framework/workstreams/evidence/r8-engineering-r1-b62cc961/github-job-113441346897.log)、[Mac 原始日志](../framework/workstreams/evidence/r8-engineering-r1-b62cc961/github-job-113441346340.log)。这不是本轮产品 `84dc3c7` 的测试，也不是 Chrome/Codex 用户链通过 |
| 本地 PR #22 独立修复候选 `a4c06cb` / docs-only `deb1a90` | 157/157 组件、140 项源码检查、生产/开发 build/verify PASS；未推送 | 祖先核对发现远端已由 `e5cd4b4`/`bb0669c` 完成相应修复；不重复覆盖远端，也不将本地测试结果迁移为最新 PR Native PASS |
| Native+HTTP 候选 `33a551a6`，CI run `37813749061` | Native 47/47、共享 56/56、source 155、环境 249=245 PASS/4 SKIP；prod/dev/verify PASS；Mac Host IPC 3/3 | [组合组件/构建原始日志](../framework/workstreams/evidence/r8-engineering-r1-b62cc961/github-job-113436938535.log)；[Mac 原始日志](../framework/workstreams/evidence/r8-engineering-r1-b62cc961/github-job-113436938851.log)。CFT 155 extension loaded/manifest installed 仅 smoke；Options renderer 退出与 Runtime.evaluate timeout 导致 diagnostic 0/1 FAIL，不能标完整 Native PASS |
| 同步 main `c2538e9` 后最终环境/计划契约 | 201/201 environment PASS；139 项静态检查 PASS；审查增强后计划契约 3/3 PASS | `delivery-environment-tests.log`、`delivery-source-check.log`、`backlog-contract-reviewed.log`；主线新增契约已保留并增强为唯一主责、前置父任务和分期检查，未降低 188/40 门槛 |
| 生产/开发 ZIP 打包 | `npm run pack`、`pack:dev` 与再次 `verify` PASS | ZIP 生产 SHA `5764eb84ce44595f36cfa3e0f2bec20b18164309066cbda45f050c58908a0f98`；开发 SHA `1211cbabdfba499449a1423e663dd492ac08097c1afdee44ac9fb5a00d71e4e1`；仅打包级证据，未完成该 ZIP 原生 F3 |
| 188 功能 ID → 40 工程任务映射 | 校验命令与结果见 10.3 | 属于计划一致性验证，不是产品实现/测试覆盖率 |
| Chrome 原生与用户任务 | 本轮审查切片 `NOT_TESTED`；Native 候选的 Chrome smoke 为局部证据，完整用户诊断未通过 | 本轮未在用户 Mac 执行 UI 审查/完整任务；远端 CI 的 Options/Runtime.evaluate 失败不能被 continue-on-error 隐藏为验收成功 |
| 最终 F3 / 同产物 ZIP 安装 | 未关闭 | 继续遵守 AGENTS 原始完整验收合同，不能以文档或 Node 代签 |

本轮对最新 main 测试页/README 变动执行了 E06 集成保护，发现标准入口 guard 被 README 改写触发并做过局部修复。随后远端 `ca3e765` 已提供等价修复，最终保留远端版本；本地 `c84585f` 仅留历史，不将远端 README 成果冒充本轮独有最终 diff，也不削弱测试 guard。最终交付文档包括本计划、R8 ADR 第 10 节的 14 项决策、唯一功能目录中本轮审查证据更正及 implementation-status 的最新摘要；本计划只维护任务映射，未另造功能矩阵。最终 main SHA、PR 链接、实际 pushed/merged 状态由主集成者在同轮交付记录中核准，不能由本地任务分支名推断。

### 10.3 计划一致性验证

校验直接读取功能目录和本计划，不维护第二份 188 ID 数据库：匹配功能目录的表格 ID，提取每张任务卡的“功能映射”与“前置”（忽略 E08.1 等子切片注解），检查任务数、漏项/未知 ID/重复归属、前置父任务存在性和整任务强前置图无环；子切片先后按第 5.1 节的显式合同验收，不把文本解析当完整语义证明。**全部 188 项都须有工程主责，主责任务中允许明确延期或不实现。**

2026-10-09 实际静态校验：功能目录 188 IDs；E01–E40 共 40 任务；主责映射 188；遗漏 0、未知 ID 0、重复 owner 0、未知前置 0；依赖 DAG 无环。全部卡片包含映射、独立价值/契合度/复杂度/风险、源码状态/证据、复用/改动、API/数据/生命周期、前置、独立通过条件、本地环境、阻断与下一步。该结果仅验证计划一致性。仓库已有 `tests/environment/r8-backlog-contract.test.mjs`，集成者同步升级其旧表格解析为本节稳定任务卡格式，继续保留丢失/未知/重复 ID、非法 owner、缺字段、错误阶段和循环依赖等负例门槛；固定“35 补充项”的旧布局断言不能代替 188 项唯一主责验证。

### 10.4 产品切片已合入 main：发布身份与最终接管差异

[PR #25](https://github.com/shopable-ai/opendesk-browser/pull/25) 已于 **2026-10-08 17:31:38 UTC** 合入 main，产品集成提交为 `70fb3449ae97cfdf69b4fc83f0466e36f8501006`，PR head 为 `a884942e63a82220c4188ca73dbe232b1a48387b`。命令行 Git 无推送凭据，本次使用已授权 GitHub 连接器发布单个原子提交；全部 39 个变更 blob 和完整源码树 `b40e454218daa9c19f799cf7d74023ca0a47a128` 与已审查本地候选 `ab89a84051d8b26233134d1d8df5920e03ac8a1f` 一致。上文 `84dc3c7` 是原本地产品审查/构建身份，原始证据不改写；**不得仅因该本地 SHA 不是远端 main 的祖先就重复开发已交付修复**。

发布源码树再次运行环境组 **201/201、0 fail、0 skip**。PR 两组 CI 实际 checkout `162e9ab23feb4ea272e167f851584da67de0c974`，其 tree 与最终产品集成 main 完全相同；合入后的 [Page/package CI](https://github.com/shopable-ai/opendesk-browser/actions/runs/37817254650/job/113448926961) 直接 checkout `70fb3449`，D1/消费者 121/121、canonical HTML 12/12、计划契约 3/3、源码检查 139 文件、双构建/verify 均通过。生产/开发 packageHash 与 10.2 的本地构建相同。[Sidebar/Controller 回归](https://github.com/shopable-ai/opendesk-browser/actions/runs/37817254841/job/113448927927) 的三组组件分别为 146/146、15/15、34/34；这些测试组互有重叠，也包含原生驱动的 Node 合同测试，不是实际 Chrome 验收。Chrome、安装后用户任务、Codex/F3 仍 `NOT_TESTED`。

该主交付分支已由现有清理 workflow 删除；本地多 Agent 临时 worktree 已清理，后续 10.5 在原独立工作目录的新短期分支继续。原本地审查、Backlog 与未推送的等价 PR #22 修复历史保留在 `audit/r8-r1-reviewed-b62cc961`、`audit/r8-backlog-b62cc961`、`audit/r8-pr22-redundant-b62cc961` 三个**本地审计标签**；PR #22 本地核验 dist 另行保留。本轮 root 没有删除其他会话分支、改写原始 receipt 或执行 #11 合并。

**以下为随后被 main189 整合取代的历史差异，不再作为待解文本冲突。** 针对 `main@70fb3449` 与 `Native@75e4cde417bc885e7bf2117beca8ac66c56fabb7` 的固定三方审计，共同祖先为 `0dcc23b6e1a3409a0dc06f2afd2884ed1e74a448`，仅以下三个文件存在文本冲突：`examples/tasks/README.zh-CN.md`、`examples/tasks/demo-form.html`、`tests/environment/basic-browser-page.test.mjs`。源码审查修复可自动合入，但仍须与 Native 的 Program/Sidebar 消费者回归。

另有不在文本冲突清单中的真实消费者差异：Native 的 `examples/tasks/http-axiosx-page-draft.js` 定位“发送请求”，并返回 `channel: 'page-sdk-axiosx-through-page-api'`；main 按钮是“发送 GET”，调用网页原生 `fetch`。**只改按钮名会把 Fetch 错记为 SDK axiosx 验收。** E04 在该快照下必须统一页面、说明、测试和草稿的真实网络路径，保留 SDK 未安装/拒权与跨源检查，沿用 PR #20 的服务及 requestId；不得另造第二 HTTP 服务，也不能直接选一侧 HTML 后保留另一侧的成功标签。main189 随后保留 main 的三个文件，但仍遗漏独立草稿；本轮按 10.5 修正该消费者。旧 `75e4cde` 的构建及 Chrome 局部证据不自动转移。

### 10.5 main189 的 Native 集成复核与 HTTP 消费者修复

在 PR #25 后，另一并行集成者于 **2026-10-08 17:38:58 UTC** 将 [PR #11](https://github.com/shopable-ai/opendesk-browser/pull/11) 合入 `main@189a7037afce89efe7fef7772e781fd70643143c`。最终 head `f1ca724a52e3190447c9be93ed9b00b8a97b52fd`、HTTP PR CI 实际 checkout `d0f64fc0040dc0afb406db8fa2c33fd5de49e9da` 与 main189 的完整 tree 均为 `de160da09a533a338c77d711e8722db8683706fc`。#20/#22 随之真实进入 main；#11 已非 Draft。前述历史文本冲突已由该集成解决，三个文件保留 main70 的内容。此事实不把既有原生失败变成成功，也不要求重新打开三个已合 PR。

本轮沿 E04/E06 修复遗漏的真实消费者，产品提交为 `35fd8a27c7364a8e5cfe6993ab07324423224e19`：`examples/tasks/http-axiosx-page-draft.js` 改用页面实际的“发送 GET” Locator，并返回 `page-fetch-through-page-api`。保留旧文件名兼容既有引用，注释明确这是 Page API 驱动网页标准 fetch；SDK axiosx 仍独立验收。`tests/environment/basic-browser-page.test.mjs` 新增两个回归，执行该实际草稿、解析实际 HTML 的标签与按钮、触发真实页面处理函数，并向已有 `http-test-server.mjs` 发送 HTTP，验证 200/503 状态、响应内容、requestId、URL、omit credentials 与真实通道。未新增测试服务、网页按钮、权限、运行引擎或 Sidebar 结构。

| 验证范围 / 固定身份 | 实际结果 | 证据与限制 |
| --- | --- | --- |
| 新 HTTP 消费者的旧实现复现 / 修复后定向组 | 旧实现 0 PASS / 2 FAIL；修复后 16/16 PASS | `http-page-draft-before.log` / `http-page-draft-after.log`；真实本地 HTTP 服务与源码/组件接线，DOM harness 与 Node fetch **不是 Chrome CORS 或原生输入证明** |
| 当前本地完整环境，重建当前 dist 后 | 278 项：268 PASS / 6 FAIL / 4 SKIP，命令 exit 1 | `integrated-environment-after-build.log`；六项均在 Native Host fixture 的 Unix socket `listen` 返回 `EPERM`，不是全量 PASS。未修改测试、跳过失败或降低合同。重建前旧 dist 的 settings exposure 失配另保留在 `integrated-environment-tests.log`，不能移作当前产物证据 |
| 当前本地源码检查 | 160 文件 PASS | `integrated-source-check.log`；HTTP 草稿修复不增加新的扩展构建入口 |
| main189 Page / Sidebar CI | Page 123/123、canonical 12/12、计划 3/3；Sidebar 149/149、Locator 15/15、驱动 Node 合同 34/34 | [Page job](https://github.com/shopable-ai/opendesk-browser/actions/runs/37818199067/job/113452164444)、[Sidebar job](https://github.com/shopable-ai/opendesk-browser/actions/runs/37818199036/job/113452163009)；这是 main189 基线，未包含后续新增的两个 HTTP 回归 |
| main189 多文件 / 同树 HTTP CI | 多文件 37/37、两个示例 validate/build 与 check PASS；HTTP 88/88、check PASS | [多文件 job](https://github.com/shopable-ai/opendesk-browser/actions/runs/37818199068/job/113452162750)、[HTTP job](https://github.com/shopable-ai/opendesk-browser/actions/runs/37818127611/job/113451915107)；Source Map 生成器存在不等于运行时错误已映射回源码 UI |
| Native 最终 head f1ca 的同树 Node CI | Native 47/47、共享 58/58、环境 276=272 PASS/4 SKIP/0 FAIL；160 check、双构建/verify PASS | [Native Node job](https://github.com/shopable-ai/opendesk-browser/actions/runs/37818118949/job/113451886704)；该 CI 环境能够运行 Host socket 测试；不能替当前本地失败写 PASS，也不包含本轮新增两个回归 |
| Native 最终 head f1ca 的 macOS/CFT | Host/CLI 模拟 Chrome framing 3/3；真实 Chrome 0 PASS / 1 FAIL | [Mac 原始 job](https://github.com/shopable-ai/opendesk-browser/actions/runs/37818118949/job/113451886488)，CFT `155.0.8059.39`；`real unpacked OpenDesk extension ID timed out`、exit 1，被 `continue-on-error` 吸收。失败原因尚未归因到产品或运行器，不能沿用旧候选的 extension-loaded smoke，也不是 Native/Codex E2E PASS |
| 当前本地生产 / 开发构建与 verify / pack | 全部 PASS | 构建 packageHash 与 main189 CI 相同，见下文；同源码输入但 ZIP 尚未在 Chrome 安装，F3 未关闭 |

当前生产 packageHash 为 `3972c99cbd4367a6e5b1bdb653741c892612408da8bde7aac72d75a25130f3de`，开发为 `8de76f8b99610f306951973a400004fab6a10044deb172ac4e378d9f6070566d`。生产 SW **324976 / 327680 bytes，余量 2704 bytes**；10.2 的 314 bytes 是旧产品快照，不再用于描述当前 main。当前生产 ZIP SHA256 为 `a49aadb7111f2dcd4af0fc4e8800b5e692191cebdd9ddaa0692e62f01dc7deff`，开发为 `a5523c49d2d03f45b5eb2dcb2256b92962bc67e86245b57fe2634799726218e3`。原始日志与独立 build/pack receipt 均保存在本工作流证据目录，未覆盖旧候选 receipt。

同步修正原 HTTP 本地验收 GOAL，使网页 fetch、MAIN Page SDK axiosx、Controller axiosx 分别取证。功能目录只因真实消费者将 TRG-011、AI-003、AI-007 从 M 调整为 P，统计为 **21 S / 78 P / 89 M / 0 U**；这不是通过率。Native Host 仍只是认证 IPC，复用活跃 Sidebar 的 RunHost、最长 120 秒，BG-010 独立长任务仍 M，MCP 仍缺实现。当前本轮切片为 `SOURCE_IMPLEMENTED / COMPONENT_TESTED / BUILD_VERIFIED`，完整环境组存在上述执行限制，Chrome/本机 Codex/安装后任务为 `NOT_TESTED`，`FINAL_FRAMEWORK_ACCEPTED=NO`。

### 10.6 收尾同步 mainbd：新增样例与真实失败门禁

收尾时再次 fetch 并无冲突同步 `main@bd47d40c9cf88af6942fe35c7468a92c3042c2d1`，本地组合为 `9c9cfaece540a68ec8cb2a0ac5b2e8799d625c3d`。189→bd 的 28 个文件仅增加多文件 Sidebar 示例/API 文档、Native 测试观察修复和 CI；`src/`、`scripts/`、manifest、依赖锁及 WXT 配置没有变化。本轮两个 HTTP 文件亦未变。保留并行新增的 `examples/programs/sidebar-{page-demo,controller-demo,assets-contract}` 及 `docs/framework/sidebar-project-api-r1.zh-CN.md`，不将资产校验样本误写成 CSS/JSON/PNG 构建器已支持。

针对新同步差异运行实际 HTTP 草稿、页面/HTTP、三类工程样例、Native admission 观察与计划契约，**44/44 PASS**；最新源检查 **161 文件 PASS**。完整本地环境组仍保留 10.5 所示当次 278=268/6/4 的失败记录，没有在 socket 条件未变时重复执行或把该统计改成最新分母。mainbd 的 [Native Node CI](https://github.com/shopable-ai/opendesk-browser/actions/runs/37820856174/job/113461221812) 为 47/47、58/58，完整环境 **281=276 PASS/0 FAIL/5 SKIP**；新增 bare Chrome 基线在 Linux 跳过，不能混作原生证据。这是 mainbd 基线，不包含本轮额外的两个 HTTP 回归。

新的 [Page/package CI](https://github.com/shopable-ai/opendesk-browser/actions/runs/37820856140/job/113461221669) 保持 123/123、12/12、3/3、161 check 与双构建/verify，通过生产/开发 ZIP 解压列表、每个文件字节、receipt/hash 的 **ZIP_EXACT_DIST_BYTES** 检查；packageHash 与 ZIP hash 均与 10.5 相同。它证明 ZIP 对应 dist，不是 Chrome 安装验收。

该主线已移除 `continue-on-error`，Native workflow 在 main 自动执行并区分 ARM/Intel runner。[macos-15 ARM](https://github.com/shopable-ai/opendesk-browser/actions/runs/37820856174/job/113461222196) 与 [macos-15-intel](https://github.com/shopable-ai/opendesk-browser/actions/runs/37820856174/job/113461222019) 的 Host/CLI framing 各 3/3；真实 CFT `155.0.8059.39` 各 **0 PASS/2 FAIL**，工作流明确 failure。两者均先在不加载扩展的 bare renderer 基线出现 `CDP Runtime.evaluate timeout`，随后扩展可发现，但 Options 分别超时/renderer gone。这个对照把浏览器/运行器基础环境列为优先排查方向，不能证明扩展全部无缺陷或将其豁免为 PASS。完整 Native/Chrome/Codex/安装后任务/F3 门槛仍未关闭。

以上新增日志及逐文件 hash 已追加到本工作流回执的 `postSyncBaseline`；此前 189/f1ca/70 的结果仍只描述各自固定候选。本轮后续 PR 的精确发布提交与合入 SHA 以实际 Git/PR 记录为准，不能由本地审查提交号推断远端祖先身份。

### 10.7 最终运行时基线 main74：保留并行 Sidebar 工具并重新验证产物

再次读取真实 main，`74d261b7be865830742c5b3d061ba53d0b41033c` 已包含并行 `59153b6460c453cd2f548cc23586d91a5c2959ef` 的 Sidebar 工具包、opaque UI sandbox、本地 packer 与 14 个 WXT 入口修复。本轮以独立分支无冲突合入，本地组合为 `52b4da41586ab437eb4c3f389c2868d12f3842fe`。这次改变运行时与构建输入，10.5–10.6 的 packageHash 仅保留历史身份。**这些工具源码不是本轮 root 的新增实现**，本轮未扩展或重做 Sidebar。

原“我的任务 / 发现 / 开发”三个一级页签保留；新增工具只在“我的任务”内部打开受限 UI。现有 `OpenDeskTool` 桥只有本地 storage、当前页面标题/URL 与 tasks.open；后者只聚焦原已安装任务，不调用 RunHost 执行。它有独立 UI 包与 chrome.storage.local 配置，但尚未复用 ProgramRef、固定 Revision/hash、安装 generation、正式验证与 Authority receipt；E39/E40 记录这一治理缺口。ECO-011/PORT-007 由 M 改为 P，当前目录 **21 S / 80 P / 87 M / 0 U**，不增加总目录或任务编号。

独立审查还发现应单独收敛的工具生命周期事项：tasks.open 关闭 iframe 后无法再向原 Promise 回送成功；排队操作在实际 dispatch 时的旧实例拒绝、跨窗口安装/卸载/存储 CAS 与同 ID 数据来源尚需合同及行为负例。既有工具测试包含静态接线断言，不能冒充完整可信消息行为验证。扩大工具执行/网络能力前须接入原身份与权限体系，不能形成第三套自动化版本/权限模型。

本地新组合的元数据审核、HTTP 草稿、Task Workbench、工具合同、Native 包与计划定向组 **72/72 PASS**；源码检查 **167 文件 PASS**；生产/开发 build、verify、pack 及 ZIP 解压逐文件比对 PASS。生产/开发 packageHash 分别为 **`2633c57189f55e6de43a8f0e9c9aff2035ac1d22291b7879f7fe46312a8d2e6b`** 与 **`1124f3fa7144396b6fcdafa585cdbc04dd89c57e36a0b36de6f815b9110afe9a`**。生产 ZIP 为 `7e8c6306602b4444ab76c1439fb930e4850183f8012a44dd589c458d1b22ce2e`（401937 bytes），开发 ZIP 为 `d51ed9fe30e1efe339adf49313a77274a529ef885c392e1ed64f5cbdca08e945`（1059087 bytes）。SW 仍为 324976 bytes、余量 2704 bytes，**SW 未变不代表整包未变**。旧 dist/ZIP receipt 保留，不覆盖成新验证。

固定 main74 的 [Page/package CI](https://github.com/shopable-ai/opendesk-browser/actions/runs/37821428251/job/113463151316) 为 123/123、12/12、3/3、167 check 与双构建/verify/ZIP 对字节 PASS；[Native Node CI](https://github.com/shopable-ai/opendesk-browser/actions/runs/37821428202/job/113463151817) 为 47/47、58/58、环境 **284=279 PASS/0 FAIL/5 SKIP**。它们不包含本轮新增两项 HTTP 回归；后续 PR 应在实际合并树执行相应 CI。本地先前 Unix socket EPERM 的六项失败不删除或迁移分母，当前定向集成不据此声称全量本地 PASS。

[ARM CFT](https://github.com/shopable-ai/opendesk-browser/actions/runs/37821428202/job/113463152282) 与 [Intel CFT](https://github.com/shopable-ai/opendesk-browser/actions/runs/37821428202/job/113463152074) 均为 Host/CLI framing 3/3、真实 Chrome **0 PASS/2 FAIL**，Native workflow 明确 failure。无扩展 renderer/CDP 超时，带扩展 Options 出现 renderer gone；CFT 为 155.0.8059.39。当前没有 `continue-on-error` 吞掉失败，不用旧 f1ca 的绿色结果描述该主线。需要本地可工作的 Chrome/CFT 环境接管，不能把 bare renderer 的失败当作扩展自动通过。

manifest 的特权 extension_pages CSP 和浏览器权限列表未新增，但共享 sandbox CSP 放开了 blob 脚本、本地/data/blob 图片及样式；它同时是原 Controller 与新工具文档的上限。两份文档的 Meta CSP 分别保留更窄约束，构建验证通过；真实 opaque world、无 chrome API、跨实例消息、卸载和资源回收仍 `NOT_TESTED`。本轮新包也未做真实 ZIP 安装或 F3，`FINAL_FRAMEWORK_ACCEPTED=NO`。完整 raw、hash 和审查结果见工作流 `finalRuntimeBaseline`。

### 10.8 发布前组合 main576：按实际增量更新，不移用旧包证据

发布前再次核对 `main@5769730beb9fddc6fc788a2702409ec06076feac`，无冲突保留其 Page UI/静态资源构建、宿主消息负例与跨窗口实例失效；本轮两个 HTTP 文件未变化，原审查仍适用。新 Page UI 复用既有 USER_SCRIPT 与构建器，未增加运行权限；Sidebar 工具现有 source/origin/instance 负例及 storage.onChanged，不能继续笼统称“只有静态消息测试”。排队执行时重验、跨窗口 CAS、task-open 终止回执和统一 ProgramRef/Authority 仍需补齐。主线加入的 UI 专项段完整保留，未覆盖并行工作。

新组合定向 **49/49 PASS**（Page UI/资源构建、源码工程、实际工具宿主、HTTP 草稿、元数据 UI 与计划），source check **172 PASS**，生产/开发构建、verify、pack 和 ZIP 对字节均 PASS。生产 packageHash `75dd897fee5a906dbe5de00b30c98d8c5b3d0ea8a5a7cca756e17660d478e73f`，开发 `e61be2a4604d567e754258f3224058bb84e554a115116d786c0e565076c383f7`；生产 ZIP `f9bb274aefba9f53f1f7cf439f936577f683fddc58c150ea5bdfda6bb484e621`（402096 bytes），开发 ZIP `5cad83e60eb25265f7235fadf5c8d1aab1714e7534a388944374d94061abd7b4`（1059857 bytes）。这才是该组合的产物，前节 2633/1124 继续只描述 main74。

完整记录在工作流 `prePublicationBaseline` 和 `final-master-*` 原始文件。未重复执行环境条件未变的本地 Unix socket 全量失败，亦未修改其历史分母。[main576 Native workflow](https://github.com/shopable-ai/opendesk-browser/actions/runs/37822085415) 实际为 failure；本轮本地 Chrome/Codex/安装后用户链和 ZIP F3 保持 NOT_TESTED。实际 PR 合并树仍须跑相应 CI 后才集成；最终远端 SHA 由 Git/PR 记录给出，本地原始审查 SHA 不改写。

## 11. 下一批应立即推进的工作与可执行 GOAL

### 11.1 紧接本轮的顺序

| 次序 | 可立即推进的工作 | 为什么先做 | 验收边界 |
| --- | --- | --- | --- |
| 1 | 核对已完成的 PR #25 主干交付记录；复用 #22 远端已完成修复 | 审查修复已通过 10.4 所列身份进入 main，避免因本地 SHA 不同而重复开发 | 只检查后续差异，保持原始 SHA/产物证据；#11/#20/#22 仍按真实目标分支与 Native 状态处理 |
| 2 | E05/E04/E03 从最新 main 继续真实 Chrome/Codex 验收 | Native、HTTP 和 Program 已合 main；本轮草稿修复闭合已有集成断点 | 固定后续候选/产物，独立验证三条网络路径、源码保存与 Native 用户链；不追已关闭 PR 重复集成 |
| 3 | E07/E09 的 Page Candidate 持久合同与类型专属验证入口 | 后续安装、触发与 GM 都依赖真实固定身份 | 可独立提交 Candidate/CAS/拒绝越级组件切片；真实 proof 缺失时不授 Available |
| 4 | E07 安装记录与 E12 启动身份握手，再接 E10 对账 | 先证明谁可运行、当前是否仍获准，才能安全持久注册 | 无 GM 的受限 profile，撤权/代次/世界可信；原生单独验证 |
| 5 | E08 正式导入、E13 回滚、E14 最小 UI 与 E15 原生用户闭环 | 把接口转为普通用户真正能完成的任务 | 同候选安装→匹配→停用→重启/更新→失败回滚全链；之后再启 GM |

### 11.2 下一轮工程 GOAL（可直接执行）

> **GOAL：OpenDesk Browser R8 Engineering Program R2 —— 验收已集成能力，并实现 Page Candidate 的可信持久合同。**
>
> 直接操作 `shopable-ai/opendesk-browser`，默认中文。先 fetch 最新 main 和 PR #11/#20/#22（尤其核对 #20/#22 合入 #11 Native 候选后的组合 head），读取 AGENTS.md、parallel-development、本执行计划、功能总目录、R8 ADR 第 10 节、implementation-status 与 Agent→Task 合同。PR #25 已将审查切片经 `a884942e` 合到 `main@70fb3449`；`84dc3c7` 只保留为原本地审查/构建身份，不能用祖先检查把该修复误判为未合入。PR #11 已通过最终 head `f1ca724a` 合到 `main@189a7037`，#20/#22 一并进入主线；当前 fixture 是 `tests/fixtures/program/d1-userscript.html`。本轮 HTTP 草稿已改为“发送 GET”与 page-fetch-through-page-api；按 10.5 核对实际新差异，旧冲突和本地 SHA 不得触发重复实现，不用旧回执签新候选。
>
> 使用独立 worktree/短期分支，保持 main 作为唯一正式集成分支；不覆盖并行工作、不强推、不强合 Draft。现有 Native/HTTP/多文件能力已在 main，沿固定后续候选继续分项验收；实际 Chrome/Codex 不可访问时保留 NOT_TESTED，不为清理分支丢失工作。
>
> 本轮主切片选 E07/E09：复用现有 Page manifest/compiler、dependency manager、Broker/Authority 和 IndexedDB v2 frameworkKV，建立固定 Page Candidate 的导入、读取、幂等/CAS 与类型专属验证入口。字段至少绑定 namespace/programId/revision/sourceHash/manifestHash/runtimeKind、真实来源、规则和依赖锁；Controller Task v1 不变。任何用户传入 stage、Controller Result 或不匹配 Page proof 均不能使 Page 变成 Available；没有真实 Page proof 时保持 Candidate/NOT_TESTED，不写自动批准的占位实现。
>
> 先核对是否已有最新 PR 完成同切片；按真实源码调整实际改动。完成源码与消费者接线、schema/状态/跨 namespace/hash 篡改/陈旧回执/并发幂等的定向组件测试、生产/开发构建和 verify。新增测试只围绕实际差异，保持原三页签、RunHost、Page API、单文件与 ESM、axiosx/HTTP 方案，不另建 DB/权限/网络/执行内核。
>
> 给 E10/E11/E12 产出下一批可消费的数据/接口合同，明确哪个 API 尚未接 native；本轮不必同时实现 GM、Cron、UserCSS 或所有注册 UI。更新本执行计划的对应任务、唯一功能目录状态/证据和实施状态。获授权的主集成者审核当前 main、冲突、定向测试和实际验收等级后串行合入；报告最终 SHA、PR、SOURCE/COMPONENT/BUILD/NATIVE 各层真实证据和仍未关闭门槛。

### 11.3 本地 Chrome/Codex 精确接管

本地执行者先读实际可访问仓库和当前原始证据，确认源码 SHA/产物与要验收的候选一致。标准人工页面仍为 `examples/tasks/demo-form.html`；若原 PR 要求其专属服务，应先确认对应文件已在当前候选，复用原命令/端口，不另造 HTTP 服务。不要把操作系统路径可见性、CFT 安装、Allow User Scripts 或网站授权写成默认已经满足。

1. **当前 E08.1/E40.1 UI 切片**：真实 Sidebar 开发区加入受支持 `@require`，在检查/读取依赖尚未结束时修改为不支持 `@grant`/`@resource`/`@connect` 或无效 `@match`；晚到结果不能解除拒绝。检查后、审批前再次改源码，批准仍阻断并显示当前原因。还原受支持正文，同依赖锁可继续用；`@antifeature` 风险/locale 文案随当前源码更新，恶意文本只显示不执行。核对原草稿/preview/保存/Stop 控件完整。
2. **PR #20 HTTP**：读取 PR 原 `docs/framework/prompts/goal-r7-axiosx-local-http-acceptance.txt`，使用其 HTTP 服务/页面和 requestId，分别验证 fetch CORS、已安装 Page SDK axiosx 和 Controller axiosx 的真实收到请求/响应/错误。当前草稿与页面按钮已统一为真实 fetch，MAIN SDK 使用原 GOAL 的独立授权调用；三条实际 transport 分别取证，Fetch 不得返回 SDK axiosx 的 channel。没有真实服务端证据不能用 UI 字符串当成功。
3. **PR #22 多文件**：使用修复后 fixture 和 `tests/framework/program-native-acceptance.mjs`；实际源码工程→构建→原目录导入→同窗口开发区→明确点击运行→真实效果/源码保留/结果/Stop。编译 bundle 不写回用户的可读源码，不借 Candidate 文件自动安装。
4. **PR #11 Native**：读取原 `goal-native-agent-local-acceptance-r1.txt`；真实启用与绑定 Host/扩展，运行/获取/停止、相同 requestId 去重、ACK 丢失/导航/撤权；连接与 PENDING 均不是最终成功。退出 Agent/Host 后普通安装 Task 仍能重复运行。
5. **后续 R8.1**：仅在 E07～E14 已接线后的固定候选开展 E15 的安装/匹配/nonmatch/frame/run-at/撤权/重启/回滚完整验收；在此之前只报告当前切片，不伪造页面安装 proof。

每个结果都记录 Chrome 版本、候选 SHA、扩展/产物 hash、profile/权限状态、exact document 和真实 effect/registration/run/result ID，以及原始证据路径。失败先定位并修最小缺口；测试条件未变化不无意义重试，不覆盖历史 receipt。

## 12. UI 开发专项增补（2026-10-09）

本次专项核对基线为 main@`70fb3449ae97cfdf69b4fc83f0466e36f8501006`。本次保存前保留刚合入主线的工程计划及证据；以上 PR/阶段状态仍按各自候选引用，本节不代替其它工作流的集成检查。**当前 Sidebar 自身 UI 与 `paramsSchema` 已有源码，但完整用户 UI 资产、JSX/Vue 编译和 Tailwind 容器加载尚未接通。**

采用 [UI 专项设计](../architecture/browser-framework/ui-development-and-style-isolation-r1.zh-CN.md)：框架由项目选择，基础 CSS 在实例容器按需加载；网页内 UI 优先 ShadowRoot；任意用户代码不进入特权 Sidebar。Tailwind 与 React/Vue 是独立维度，不设插件全局框架开关。

专项归入 **E33 开发工具与资产构建**，复用 **E17/E20** 中适用的样式、资源处理基础，正式安装/停用生命周期与 **E12/E14** 对齐，特权边界纳入 **E40**。这些关联不是把完整 GM 兼容、Native Agent 或整个 E23 作为原生 UI 手动闭环的先决条件。原生 UI 手动验证可以在现有 Page 运行边界稳定后独立推进；正式安装能力仍须通过对应安装验收。

实施顺序：

1. 原生网页 UI：输入框、按钮、状态、结果与本地图片，贯通资源构建/导入、Shadow 挂载、交互、关闭/重开与受管资源清理。
2. 复用同一资产与容器链增加 React、Vue 编译适配，以及可选 Tailwind；逐项验收框架版本、弹层、离线资源与产物容量。
3. 确有复杂侧栏界面需求时，再实现独立 sandbox 展示文档与窄消息桥，继续使用当前 Authority/RunHost。

**UI 开发不同于 E37 的 UserCSS 网站主题管理。** 原 188 项目录中的 DEV-003/004/010/011 是本专项的上层追踪入口，不表示其此前已经覆盖或验收 React/Vue/Tailwind。保留原 188 项与 E01～E40 的身份，不复制新总清单、不增加虚假完成率；专项详细行为及验收见上述设计。

本轮只完成设计与真实缺口记录，没有新增运行时、放宽 CSP、安装框架依赖或执行真实 Chrome UI 测试。
