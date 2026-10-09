# OpenDesk Browser 测试指南与可信度说明

## 跨对话测试复用入口（2026-10-09）

新对话先查已有记录，再执行测试。**成功记录永久保留；是否可用于当前候选，取决于相关输入、合同和环境是否一致。** 换聊天、时间经过或无关文档提交本身不触发重测。本文后面的 2026-10-05 状态是历史快照，不能作为今天的 main 状态。

### 已有记录从哪里找

| 工作范围 | 人可读记录与原始证据入口 | 本次已核对的范围 | 后续责任 |
| --- | --- | --- | --- |
| Page UI R1.3.1 | [验收与复用结论](workstreams/page-ui-r131-mac-01a11ff7.md)、[机器规则/证据哈希](workstreams/page-ui-r131-mac-01a11ff7.json) 的 `reuseAgreement`；原始证据在本地 `evidence/page-ui-r131-mac-01a11ff7/` | 原候选正式 Sidebar Page USER_SCRIPT、A→B→C/D、CSS/资产/表单、窄视口与真实 200%、20 轮、SPA/BFCache、受管清理；原候选定向 58/58、环境组件 353/353（排除独立 Native Chrome 文件） | 输入/合同/环境未变时离线核对后复用，不因新对话或无关 main 更新重跑；后续 HTTP fixture 已变，按 JSON 最新影响核对只补受影响项；保留限制/未测/失败，不提升为 Installed/F3/ZIP |
| R5.2 现代 Page API | [工作流记录](workstreams/r5-2-modern-page-api-acceptance.md)、[15 项真实运行索引](evidence/r52-final-20261009-01a11c0d/acceptance.json)、[源码绑定](evidence/r52-final-20261009-01a11c0d/source-binding.json)、[本次复用核对](evidence/r52-final-20261009-01a11c0d/reuse-review.json) | 指定 Chrome 155/生产包上的两轮搜索、Locator/观察、生命周期；定向组件 123/123，双构建与 verify；不含 AI 制作、最终 F3/ZIP | 精确候选可复用这些记录；新候选先分析变化，只验证受影响项 |
| Program R3.1 | [草稿 PR #23](https://github.com/shopable-ai/opendesk-browser/pull/23)，分支内 `docs/framework/program-evidence-reuse.zh-CN.md`、`scripts/check-program-evidence.mjs` 及专属工作流索引 | 该工作流已有离线证据校验器；原身份的组件结果与未完成原生项分开保存 | 对话「收敛 Program R3.1 与复用测试证据」维护；未合入本地 main 时不假设入口已安装，也不复制第二套校验器 |
| R6.2 Native / AI→Task | 原工作流 `docs/framework/workstreams/r62-local-acceptance-01a11c24.json` 及 handoff；续接对话「继续 R6.2 原生验收与 AI→Task 闭环」 | 2026-10-09 交接时源码/组件/构建已有记录；Host 未连接，无业务 runId/resultId，原生与 AI→Task 尚未通过 | 查续接对话的最新记录；本轮 R5.2 不替它重复执行或关闭验收 |
| 整体框架正式合同 | [原验收操作与入口](product-acceptance-workflow-20261003.md)、既有 `source-compatibility-ledger.json` / `test-spec-v5.json` / 最终候选证据 | 原 603＋19、独立 B05、既定 campaign、资源 baseline、独立 F3 与 ZIP 合同保留 | 由正式集成/验收负责人关闭；各工作流局部 PASS 不自动登记为整体 PASS |

表中其他分支和对话的状态是读取时的交接事实，不是持续监控结果。更新某项时保留日期、原候选和原证据等级。每个 Agent 只写自己的工作流记录；此表只负责导航，原始结果及原正式账本仍是事实来源。

### 开始前的最小核对

1. 读取本指南、对应工作流和 [并行资源规则](parallel-development.md)。只读核对相关新对话/PR是否已有负责人；不得因为自己的对话看不到结果就认定无人处理。
2. 明确要证明的功能和证据级别。定位已有成功、失败、未测试记录，检查日志/原始 JSON 是否可读，记录其文件 SHA-256。只有 MD 的一句 PASS、截图或聊天总结不够。
3. 比较原记录与当前候选：相关产品文件及传递依赖、测试/fixture/观察器、参数与任务 `sourceHash`、权限/CSP/依赖锁/构建工具，以及需要的 Chrome/插件/站点环境。真实浏览器结果还必须核对实际加载包、launcher、target/document 和真实 Durable Result。完整 HEAD 用于追溯，不能只因 HEAD 改变就全量失效，也不能只因 HEAD 相同就忽略未提交修改。
4. 为每个功能记录复用决定，再选最小必要验证。无法说明依赖范围时明确写 `NEEDS_REVIEW`，先补影响分析；不把未知项直接改成 PASS。

| 复用决定 | 含义与动作 |
| --- | --- |
| `REUSE_RECORDED_PASS` | 所需证据完整，相关输入/合同/环境一致；引用原结果、原日期、原级别，本轮不执行该测试 |
| `AFFECTED_INPUTS` | 相关输入、参数、合同或环境改变；保留历史 PASS，列出受影响功能、变化文件和最小重测理由 |
| `EVIDENCE_INCOMPLETE` | 缺原始文件、身份、必要绑定或出现不一致；先恢复真实档案/核对身份，不能重造 receipt |
| `OWNED_ELSEWHERE` | 新对话或其他工作流已经负责该项；引用其记录，继续自己的独立工作，不启动重复执行 |
| `NOT_TESTED` / `NEEDS_REVIEW` | 尚未取得所需级别证据，或复用范围未确认；保持该状态，不能借其他层 PASS 替代 |

不同 packageHash 的真实测试保留为原包结果，不能自动变成新包 PASS。可复用旧证据做影响分析；新包的相关入口、权限和生命周期由集成者验证。正式冻结/F3/ZIP 合同要求同一最终身份时仍按合同执行。组件 PASS 不提升为原生、AI 端到端或安装 PASS；同一项成功也不抵消独立失败场景。

### 什么时候重测

- **只改结果说明、注释或无关文档**：复核链接/身份及契约一致性，不重跑产品、构建或浏览器；类型签名改变则做受影响的类型/API 核对。
- **改 Locator/观察实现、测试或 fixture**：重测受影响语义及错误路径；改实际页面/参数时核对真实路径。无关 HTTP/Program 功能继续引用原记录。
- **改 Sidebar 运行入口、Worker、Authority、Native Driver、权限或生命周期**：验证受影响链路及超时/撤权/stop/未知效果保护；不凭底层组件 PASS 保留修改后的原生 PASS。
- **改依赖、构建输入、权限/CSP或浏览器版本**：验证相应构建/包/环境约束，按变化安排原生验证。产物校验与业务功能测试分别记录。
- **同一失败没有代码、环境或观察方法变化**：先定位原因，不循环重试。新验证产生新文件，保留原失败及原成功。

### 保存与并发去重

继续使用 `docs/framework/workstreams/<工作流>.md/json` 保存人可读结论与续接事项，原始日志/JSON放该工作流独立的证据目录。MD 写明测试范围、命令、时间、候选/输入身份、环境、结果、证据链接、未测试项及失效条件；真实流程保留 runId/resultId、结果自身 revision/sourceHash、动作阶段和 retirement。无需为每个聊天再建一份全仓库账本。

执行前在**自己的**工作流记录中写 `IN_PROGRESS`、会话/工作流 ID、验证范围与候选、浏览器/端口/dist 等资源、开始时间和续接位置；完成后写结果及 `released`。其他对话只读核对，资源尚未释放则处理独立事项。过时的 `IN_PROGRESS` 需要核对原会话和真实进程，不能按时间自动抢占 profile/端口或删除数据。这是现有单资源规则的操作记录，不是新的全局 writer 登记或自动互斥系统。

每次续接报告用「复用哪些已有结果 / 哪些输入变化 / 哪些最小验证待负责人执行」。本轮只做了文档和离线证据核对，没有再次执行已通过的 R5.2 测试、构建或 Chrome 流程。

---

## 2026-10-05 历史说明（以下保留原记录）

> 核对基线：2026-10-05（Asia/Shanghai）。本说明只整理仓库中已经存在的文件、日志和 JSON 证据。本轮没有运行测试、没有启动浏览器、没有解压 ZIP，也没有修改产品源码、现有测试、账本、ZIP、构建产物或历史证据。

工程边界：

- 当前工程：/Users/shopme/Documents/workspace/opendesk-browser
- 旧工程：/Users/shopme/Documents/workspace/todo-user-vue/src-bex，只作为账本引用的来源，未被本说明改写。
- 唯一新增文件：docs/framework/testing-guide.md
- 当前 writer 记录见 docs/framework/public-owner.json。该文件记录产品实现仍在进行，当前 browserOwner 为空；本说明没有取得产品写权。

## 1. 当前结论

| 问题 | 当前事实 | 可宣称级别 |
|---|---|---|
| 产品实现状态 | wxt-progress.json 的 stepId 是 incremental-T6-candidate3，状态为 in_progress；P1—P3 已记录通过，P4/P5 仍为 implementation_in_progress，P6/P7 为 not_tested。execution-tasks.json 中 K2—K5 为 in-progress，K6 为 queued。 | 已实现一部分；整体未完成 |
| 当前候选包 | 当前候选身份是 candidate3：快照为 2026-10-05T06-07-01.627Z-incremental-T6-candidate3-candidate_build_bound。production package hash 为 5893057009280761f80837ba73a7faba07c99684e54efb8debe8d4dabb85359f，development package hash 为 97dabf8d275e9179c41cc11b83c7e40d374712c5c432f313d7e519dbf65e930c。当前双包有 build、pack、verify 记录。 | 包结构和包校验已通过；属于 B 级证据 |
| 当前真实浏览器验收 | 当前 candidate3 没有新的真实浏览器验收结果；当前 evidence 只有 readyForControllerNative=true 的重建收据和 G1 前置状态。历史 P1—P3 真实 UI 结果绑定的是 package d2c872514e2c843811549de0e25ba4b35f58e7daf870efd321cf18918c706280，不是当前 candidate3。 | 当前候选为 0 项正式真实浏览器验收 |
| 正式 603 项 | source-compatibility-ledger.json 的 caseResults 有 603 项，当前状态计数为 not-tested: 603；original603Closed 仍为 false。 | 603/603 未完成 |
| 19 项补充验收 | additionalCaseResults 有 19 项，全部为 unit-passed-native-pending，没有 pass: true、runtimePass: true 或当前 package hash。 | 19/19 只有组件层准备，不能算正式 PASS |
| F3 | wxt-progress.json.f3Accepted=false；evidence/final-verification.json 的 F3Tested=false；验收机制复核的 f3Verdict 为 pending—not performed。 | F3 未执行、未接受 |
| 是否可以宣布迁移完成 | 不可以。产品实现、当前候选的真实浏览器验收、603、19、B05、F3 和同一最终包的完整证据链均未闭合。 | 不能宣布迁移完成 |

必须把结果分为以下几类：

- 已实现：源码中存在对应模块、入口或接线；不表示已经通过真实产品验收。
- 当前候选已测试：结果的源码输入、验证输入、package hash、ZIP SHA 和结果报告能绑定到 candidate3；目前主要是构建、打包、包校验和组件层。
- 历史候选已测试：结果绑定 candidate1、candidate2、旧 P1—P3 包、旧 P4—P5 包或旧 ZIP；保留作历史和回归参考，不能升级成当前产品 PASS。
- 仅有组件或合成测试：Node 测试、fixture、合成 package、静态 scanner、拒绝路径或 source checker；能证明局部契约，不能证明真实浏览器中的正向完整链路。
- 未测试：账本或报告明确为 not-tested、NOT_TESTED 或没有当前候选的原始结果。
- 不可继承：历史候选 PASS、旧 ZIP、prototype、synthetic fixture、拒绝路径、安装截图和静态检查，都不能自动继承为当前候选功能 PASS。

## 2. 测试分层

完整链路是：

    源码检查
      → 单元/组件测试
      → 包构建与包校验
      → 当前候选人工冒烟
      → 当前候选真实浏览器验收
      → 100 并发和恢复测试
      → 最终合同验收
      → 独立 F3

| 层 | 运行入口 | 关键文件 | 输入 | 输出 | 覆盖范围 | 不能证明的内容 | 可信度 |
|---|---|---|---|---|---|---|---|
| 源码检查 | npm run check | scripts/check-source.mjs、scripts/verify-package.mjs、wxt.config.mjs | 当前源码、scripts、环境测试、K5 package 测试、manifest、SDK/resource contract、MIT 文件 | 语法检查数、构建合同、CSP、SDK 入口、资源和许可检查结果 | 当前文件能解析，固定包结构规则没有被静态违反 | 不能证明运行时、真实 sender、真实 document、浏览器 API 或正向功能 | B；若 hash 未绑定则只保留为静态证据 |
| 单元/组件测试 | node --test ... | tests/environment/、tests/foundation/、tests/framework/*.test.mjs | Node 内存对象、固定 fixture、HTTP loopback、当前源码和部分 dist | TAP 的 pass/fail/skip、断言、合成报告 | 存储、协议、codec、runtime、下载状态机、target、PagePort、ChromePage、SDK、四服务、恢复和 acceptance 规则的局部行为 | 不能证明当前浏览器安装、真实 Worker、真实扩展入口、真实权限 UI、真实 CDP、物理终止或磁盘下载 | B；明确标 synthetic 的项目为 C |
| 包构建与包校验 | npm run build、npm run build:dev、npm run pack、npm run pack:dev、npm run verify | scripts/build.mjs、scripts/pack.mjs、scripts/verify-package.mjs、scripts/zip-package.py | WXT/Vite 输入、manifest、当前 src、固定资源、两个 dist 目录 | package hash、ZIP SHA、资源清单、manifest/CSP/WAR、动态执行扫描结果 | 双模式构建、固定入口、资源完整性、包文件闭包、ZIP 生成和离线包校验 | 构建通过不等于功能通过；不能证明扩展在 Chrome 中运行 | B |
| 当前候选人工冒烟 | 人工打开工具页，按第 8 节流程 | src/ui/tool.html、src/ui/tool-shell.js、src/run-host.js、当前 ZIP | 当前 candidate3 ZIP、受控 Chrome、真实目标网页、脚本和 {"value":7} | 人工记录的 runId/resultId、页面结果、下载文件和 SHA | 最短正向运行、工具页重开、结果重读、下载、r1/r2 隔离、stop 和 SDK 授权 | 不能代替 603、19、1000/10/2 或 F3；人工冒烟不能自动登记合同 PASS | 只有保存完整原始证据才可进入 A；否则 B 或未测试 |
| 当前候选真实浏览器验收 | 原生入口脚本和受控 Chrome for Testing | tests/framework/k5-controller-product-native.mjs、k5-sdk-native.mjs、k5-sdk-native-launcher.mjs | candidate3 的同一 package/ZIP、源码/验证输入 hash、真实 Chrome 138/154、真实 launcher/PID、真实页面和权限 UI | 原始 case、CDP/launcher/raw server、截图、runId/resultId、磁盘 SHA、清理收据 | 真实扩展入口、真实 document、Worker、SDK Hello/调用、授权、导航、关闭和重开 | 没有同一候选身份、原始结果或物理证据时不能算当前候选 PASS | A 的必要路径；缺一项降级 |
| 100 并发和恢复 | B05 原生 runner、controller campaigns、SDK restart/recovery 入口 | b05-product-acceptance-20261003.mjs、b05-native-observers.mjs、k5-controller-native-campaigns.mjs、host-recovery.test.mjs、run-host-recovery.test.mjs | 真实 HTTP 100 并发、重连、宿主关闭、恢复、四崩溃点和 baseline | 每轮独立 runId/sessionId/resultId、资源六项计数、请求和磁盘证据、PASS/FAIL/BLOCKED/NOT_TESTED | 真实 B05 和恢复 | 100 个 fixture promise settle 或组件并发不能证明真实 B05；单一成功案例不能覆盖失败轮次 | A（当前包且证据齐全）或 C（fixture/历史） |
| 最终合同验收 | tests/framework/verify-product-acceptance.mjs --candidate=<candidate>，需要完整候选证据时加 --full | verify-product-acceptance.mjs、603 spec、19 supplemental、ledger、candidate identity | 完整合同清单、所有原始结果、候选 package/ZIP、环境矩阵、review 输入 | accepted、issues、证据 hash 和完整性结果 | 603 分母不变、19 补充项、campaign 完整性、证据引用、包和 ZIP 绑定、历史失败未关闭 | checker 通过只是证据结构和绑定通过；它不制造真实浏览器结果 | B/C；只有所有输入都是当前 A 证据，最终结论才有 A 级基础 |
| 独立 F3 | 独立 reviewer 按固定最终候选执行并复核 | f3-api48-cases.mjs、verify-product-acceptance.mjs、F3 evidence contract | 同一最终 package、API48 正例/异常/限制、真实入口和独立复核报告 | F3 report、review report、最终 candidate hash | 对迁移完成、API48 和 F3 合同作独立判断 | 任何早期组件、原型或旧包结果都不能替代 F3 | 当前为未测试 |

## 3. 测试命令

### package.json 已有命令

package.json 当前只定义以下命令：

    npm run check
    npm test
    npm run build
    npm run build:dev
    npm run pack
    npm run pack:dev
    npm run verify

对应关系：

| 命令 | 实际展开 | 作用 |
|---|---|---|
| npm run check | node scripts/check-source.mjs | 语法、源文件闭包、构建合同、SDK/control 入口、CSP、原始 MIT 文件和环境/K5 package 静态检查 |
| npm test | node --test tests/environment/*.test.mjs | 只运行 tests/environment/，当前环境测试静态分母是 20 项 |
| npm run build | node scripts/build.mjs production | production WXT 构建 |
| npm run build:dev | node scripts/build.mjs development | development WXT 构建，带 sourcemap |
| npm run pack | node scripts/pack.mjs production | 校验 production dist 后生成 artifacts/opendesk-browser-production.zip |
| npm run pack:dev | node scripts/pack.mjs development | 校验 development dist 后生成 artifacts/opendesk-browser-development.zip |
| npm run verify | node scripts/verify-package.mjs dist/production && node scripts/verify-package.mjs dist/development | 独立校验两个 dist 的 manifest、入口、HTML、资源、CSP、SDK resource manifest 和动态执行边界 |

完整组件测试实际命令是：

    node --test tests/environment/*.test.mjs tests/foundation/*.test.mjs tests/framework/*.test.mjs

当前对应的最新日志是 evidence/incremental-20261004-01a106d2/full-tests-candidate3.log，记录 507 pass、0 fail、0 skipped。较早的 candidate2 日志 full-tests-candidate2-506.log 记录 506 pass、0 fail。506 与 507 的差异必须保留，不能把 506 改写成 507，也不能把 507 当作 603 项验收。

npm test 不覆盖完整测试，只覆盖 environment。当前不建议把 npm test 解释成“全量测试”。可以提出增加：

    "test:all": "node --test tests/environment/*.test.mjs tests/foundation/*.test.mjs tests/framework/*.test.mjs"

这是建议，不是本轮变更；本轮没有修改 package.json。

### 原生测试入口和前置条件

本轮只记录入口和前置条件，没有执行这些脚本：

- tests/framework/k5-controller-product-native.mjs
- tests/framework/k5-sdk-native.mjs
- tests/framework/k5-sdk-legacy-consumers.mjs
- tests/framework/k5-controller-native-campaigns.mjs
- tests/framework/verify-product-acceptance.mjs

当前记录过的 controller 预检和原生入口形式是：

    node tests/framework/k5-controller-product-native.mjs \
      --contract-check --single --mode=all --chrome=138

    node tests/framework/k5-controller-product-native.mjs \
      --native --headed --single --native-ui-assist \
      --mode=production --chrome=138 \
      --rebuild-receipt=<fresh-receipt> \
      --permission-timeout=120000

前置条件：

1. 必须先完成同一源码、验证输入、package tree 和 ZIP 的 candidate identity。
2. 必须使用脚本声明的受控 Chrome for Testing，当前矩阵涉及 Chrome 138 和 154；不得使用个人 Chrome profile。
3. 必须使用 /Users/shopme/.codex/browser-testing/launch.py 所有权边界、fresh profile、实际主进程 argv/PID 证明和清理收据。
4. userScripts 权限 UI 需要由 --native-ui-assist 或已核实的受控 UI 流程完成；权限未满足时应记录 BLOCKED/NOT_TESTED，不能改成 PASS。
5. SDK 原生脚本需要本地 HTTP server、CDP 页面连接、真实扩展资源安装和真实 MessageSender/document；k5-sdk-legacy-consumers.mjs 是观测真实旧消费者导出的辅助入口，不是 synthetic completion 替代物。
6. controller campaigns 由 k5-controller-native-campaigns.mjs 调度：1000 轮 mixed、10 轮 reconnect、2 轮 pluginDisabled；每轮必须保存独立身份和资源 baseline。
7. verify-product-acceptance.mjs 是证据检查器，不会替代原生执行；它的 candidate 文件必须包含最终 production package hash，且所有引用文件在检查中保持相同 hash。

## 4. 关键测试文件与功能映射

| 类别 | 关键测试文件 | 旧功能 | 新实现 | 测试层 | 结果文件 | 当前可信度 |
|---|---|---|---|---|---|---|
| environment：环境和包结构 | tests/environment/boundaries.test.mjs、tests/environment/package.test.mjs | 工具页/目标页绑定、权限和 document 边界；MV3 包入口和静态资源 | src/ui/tool.html、src/ui/target-bootstrap.html、src/agents/health.js、scripts/verify-package.mjs | 源码/组件；package.test 读取实际 dist 并做变异检查 | 当前 89 文件 check：check-g0.log；完整组件：full-tests-candidate3.log | B。不能单独证明真实扩展安装 |
| foundation：存储 | tests/foundation/storage.test.mjs、tests/foundation/runtime.test.mjs、tests/foundation/protocol.test.mjs | template、revision、run、result、page seal、typed value、stop/deadline | src/platform/storage/repository.js、src/platform/storage/session.js、src/platform/journal.js、src/platform/protocol.js、src/platform/page-port/codec.js | Node 组件和 fixture | 完整组件日志；旧基础证据 docs/framework/evidence/basic-capability-readiness-20261002/verification.json | B；旧 208/210 是历史，不能替代当前最终候选 |
| foundation：PagePort、目标和下载 | page-port-service.test.mjs、page-port-fixtures.test.mjs、target-service.test.mjs、download-service.test.mjs | sender/document/epoch、导航、Blob、download callback、ACK gap、磁盘结算 | src/platform/page-port/、src/platform/target/、src/platform/downloads/、src/platform/host/ | 组件、loopback、合成 Chrome callback；部分真实文件 hash 规则 | full-tests-candidate3.log；增量单测 blob-green.log、hostblob-green.log | B；host/blob 单测不是真实浏览器下载 |
| k3：ChromePage、控制 API、Worker 生命周期 | k3-context.test.mjs、k3-controller-authority.test.mjs、k3-native-driver.test.mjs、k3-page-evaluator.test.mjs；原生入口 k3-control-native.mjs、k3-controller-native.mjs | ChromePage 48 API、选定 document/frame、普通 JS、控制 Worker、stop/deadline/host close、旧 element fence | src/framework/ChromePage.js、src/framework/context.js、src/framework/control/、src/scripting/packaged/page-session.js、src/scripting/sandbox/、src/platform/host/controller-methods.js | 组件 + 原生入口；当前没有 candidate3 原生结果 | 组件在 full-tests-candidate3.log；历史原生在 docs/framework/evidence/wxt/p4-p5/ | 组件 B；历史原生 C；当前正向真实入口未证明 |
| k4：四公共服务、资源、SDK、桥接、重注入 | k4-background-services.test.mjs、k4-chrome-services.test.mjs、k4-network.test.mjs、k4-resources.test.mjs、k4-sdk.test.mjs、k4-sdk-error-reference.test.mjs、k4-sdk-hello-races.test.mjs、k4-sdk-reinjection.test.mjs、k4-sdk-bundle-reinjection.test.mjs | log/getTime/bexUrl/requestResource、HTTP、storage、device、notification、SDK Hello/grant、旧 facade、reinject | src/framework/sdk/、src/platform/chrome/、src/platform/host/sdk-broker.js、src/platform/host/sdk-methods.js、src/agents/page-relay.js、src/entrypoints/sdk-main.js | Node 组件、固定资源和 bundle scanner；部分 loopback HTTP | 完整组件日志；历史 WXT component 400/19/21 见 docs/framework/evidence/wxt/components/ | B；合成 Hello/100 concurrent 明确不能算 B05 |
| k5：四服务资源包、旧消费者、原生浏览器 | k5-package.test.mjs、k5-package-four-service-resources.test.mjs、k5-sdk-native.mjs、k5-sdk-legacy-consumers.mjs、k5-controller-product-native.mjs | 固定 MAIN/ISOLATED、SDK resource、MIT、四服务、旧 AppStorage/AppLocal/HTTP/service/resource 消费者、真实入口 | src/entrypoints/、src/framework/sdk/resource-contract.js、src/framework/sdk/resources.js、src/framework/sdk/bridge.js、scripts/build.mjs、scripts/pack.mjs | package component；native 脚本可到真实 Chrome，但本候选未执行 | 当前包 build/pack/verify：build-*-g0.log、pack-*-g0.log、verify-g0.log；历史 native 见 f2-sdk-native/ | 包 B；历史 native C；candidate3 native 未证明 |
| recovery：重连、结算、宿主关闭和恢复 | host-recovery.test.mjs、run-host-recovery.test.mjs、k2-control-state-regressions.test.mjs、k2-sdk-relay-races.test.mjs | Port loss、finish response loss、host close、durable result、stop once、download resource reconciliation | src/platform/host/client.js、src/run-host.js、src/platform/storage/session.js、src/platform/downloads/blob-lifecycle.js | Node 组件和历史 native diagnostic | 当前完整组件日志；历史 wxt/p4-p5/host-recovery-all-components.log 和 p4-native-*.json | B；历史真实观察 C；未闭合四崩溃点 |
| B05：并发和四真实崩溃窗口 | b05-native-observers.test.mjs、b05-runner-launcher-safety.test.mjs、b05-native-observers.mjs、b05-product-acceptance-20261003.mjs | 100 并发、同一 run/session/result 身份、admission-abort、commit-before-dispatch、write-before-receipt、durable-before-delivery | src/platform/host/、src/platform/storage/、src/run-host.js、src/platform/downloads/；观察器绑定真实源码锚点 | 静态 observer + 历史原生 diagnostic；当前 candidate3 未执行 | evidence/wxt/p4-p5/b05-native-diagnostic-20261004-0935/report.json | C；不能继承 |
| acceptance checker：最终证据校验 | acceptance-evidence.test.mjs、verify-product-acceptance.mjs、basic-save-evidence-check.test.py、check-basic-save-evidence-20261003 | 603/19 分母、历史失败、候选身份、review 顺序、campaign、下载和 Worker 物理证据 | docs/framework/source-compatibility-ledger.json、docs/framework/evidence/continuation-20261003-current/supplemental-sdk-cases.json、tests/framework/verify-product-acceptance.mjs | checker 和规则组件；不执行产品 | full-tests-candidate3.log 中的 acceptance-evidence；历史 product-readiness.json 为 rejected，2724 issues | B/C；checker 通过也不产生浏览器 PASS |

四服务和资源包的特别边界：

k4/组件中的“四服务”主要是对 service ABI、固定 resource allowlist、SDK bridge 和错误/授权语义的组件证明。k5-package-four-service-resources.test.mjs 还会用 synthetic package 做资源闭包、manifest、SHA 和未知 JSON 变异。它不能证明真实网页从工具页获得授权后，经过真实 MAIN/ISOLATED relay，在真实 Chrome document 中调用成功。

合成并发的特别边界：

k4-sdk.test.mjs 中明确标记的 “fixture 100 concurrent original promises once settle” 只证明合成 promise/relay 的一次结算规则，不能算 B05 的真实 100 并发。B05 必须使用真实 HTTP、真实 controller/SDK 入口、真实 session 和每轮物理资源证据。

## 5. 当前实际结果

### 5.1 check

当前 candidate3 对应的 evidence/incremental-20261004-01a106d2/check-g0.log 和 check.log 都记录：

    Syntax checked 89 source/test/build files
    exit code 0

检查内容还包括 build-contract entries、固定 SDK/control entries、严格 CSP 和原始 MIT 文件。旧工程接续证据 evidence/old-features-20261004-01a1067b/source-check.log 记录的是 88 个文件，属于旧状态；89 与 88 的差异要保留。

### 5.2 完整组件测试

| 日志 | 计数 | 归属和含义 |
|---|---:|---|
| evidence/incremental-20261004-01a106d2/full-tests-candidate3.log | 507 pass / 0 fail / 0 skipped | 最新完整组件日志；与 candidate3 evidence 同组，但日志自身没有嵌入 package hash，因此只能作 B 级组件结果 |
| evidence/incremental-20261004-01a106d2/full-tests.log | 507 / 0 / 0 | 与 candidate3 日志同计数；保留为原始日志，不另作一次验收 |
| evidence/incremental-20261004-01a106d2/full-tests-candidate2-506.log | 506 / 0 / 0 | candidate2 旧日志；不能用来解释当前 603 或 F3 |
| evidence/old-features-20261004-01a1067b/components.log | 476 / 0 / 0 | old-features writer 的历史组件结果；旧候选/旧阶段 |
| evidence/wxt/components/verification.json | 400 / 0 / 0 | 更早 WXT 组件包；还记录 F3=false、original603=false |

因此，“506 与 507”是日志真实差异，不是可以抹平的口径差异。当前最新组件日志是 507/507，但它仍然是组件层。

### 5.3 production/development 构建

candidate3 的 build-production-g0.log 和 build-development-g0.log 都是 WXT 0.21.4/Vite 7.3.6/Rollup，状态为 passed：

| 模式 | assets | package hash |
|---|---:|---|
| production | 19 | 5893057009280761f80837ba73a7faba07c99684e54efb8debe8d4dabb85359f |
| development | 30 | 97dabf8d275e9179c41cc11b83c7e40d374712c5c432f313d7e519dbf65e930c |

build-production.json 和 build-development.json 也记录这两个 package hash，且 sourceDriftDuringBuild=[]。

### 5.4 打包、当前 ZIP SHA 和包校验

当前磁盘中的 ZIP 是：

| ZIP | 当前磁盘实际 SHA-256 | candidate3 identity | candidate3 pack-g0 日志 | 一致性 |
|---|---|---|---|---|
| artifacts/opendesk-browser-production.zip | 365cfb35ac4caccc93651ff92691c2ce6b3560f3f283ad7b4265af3af220ba6a | 同值 | 同值 | 一致 |
| artifacts/opendesk-browser-development.zip | 01741122375997db691a3a3c03cd1b73c6520e4836de8af029ff5b4bb1219b79 | 同值 | 同值 | 一致 |

对应 candidate3 的 package hash、ZIP SHA、源码和验证输入来自 evidence/incremental-20261004-01a106d2/candidate-identity.json：

- sourceHash=f402050208a4759cd8ce7196dc5b5431383cbd79dcf0c4b071f099d42c976941
- productInputsSha256=63087cd9f4df120dd63792429c13a15230bb108f28d32616f2d6942f999c18c0
- verificationInputsSha256=00dc1ceedb022d650291e25a44490ef2afd25483d3f15a9a0d8f5650055f425d

candidate3 的 pack-production-g0.log 记录 production ZIP 142566 bytes；pack-development-g0.log 记录 development ZIP 550478 bytes。当前磁盘文件大小也分别是 142566 和 550478 bytes。

verify-g0.log 对 production 和 development 都记录 status=passed，检查了 MV3 manifest、固定 JS entries、三个 HTML、SDK resource manifest、icon、MIT license、CSP、sandbox/WAR 和动态执行边界。

### 5.5 旧日志与当前候选的绑定差异

不带 -g0 的增量日志记录的是旧 candidate1：

- build-production.log：package 539825650f444ebaf2fa0f442fa846dfc37e0b287769c53e4ed03e045b3ba770
- build-development.log：package 9df15c829b5a80e2450abe349139b2eacd022fe7efbc0232073ff0944e28895f
- pack-production.log：ZIP dcf53b7fc67b8418902a6b37e94eefa14424ffc7137725ee87fb0981d7db7275
- pack-development.log：ZIP 53e6a11357396c3584230af575930cddd7f3f6ddd15e71ae622f38722a162e25

这些值和当前 candidate3 identity/当前磁盘 ZIP 不一致。对这组旧日志必须标记：

> **证据不能绑定当前候选包，不能作为当前候选正式 PASS。**

candidate1、candidate2 和 candidate3 的身份文件、输入 hash 和 ZIP hash 均永久保留；candidate2 与 candidate3 的 package/ZIP hash 相同，但 candidate3 的 product input hash 因 serial owner registration 更新。只有 candidate3 的 identity 加上 *-g0 的 build/pack/verify 证据能作为当前包级证据。

### 5.6 当前真实浏览器、603、19 和 F3

- 当前 candidate3 的真实浏览器正式验收：**0 项已闭合**。当前 native-rebuild-receipt.json 只表示 readyForControllerNative=true，不表示原生 case 已通过。
- 历史 P1—P3 真实 UI 记录曾有 production/development 两个 PASS，内容包括真实 UI return 7、durable result、重开后同一 runId；但它们绑定旧 package hash d2c872514e2c843811549de0e25ba4b35f58e7daf870efd321cf18918c706280，属于历史候选。
- 历史 B05 diagnostic report.json 共 18 个 case：3 PASS、7 FAIL、0 BLOCKED、8 NOT_TESTED；报告本身写明 finalProductPassed=false、original603Closed=false、b05Closed=false、f3Accepted=false，且绑定旧 package 99d6d07876c765701b4b2f4ee1470bc859588173151dc0f043f1bb9bdbafacbd。它不能继承到 candidate3。
- 另一份 P4 diagnostic p4-native-core-diagnostic.json 为 5 PASS、2 FAIL、20 NOT_TESTED，并明确 fullP4Accepted=false；同样属于历史诊断。
- 正式 603：当前 ledger 的 603 个 caseResults 全部 not-tested，没有当前 candidate3 的原始真实结果。
- 补充 19：当前 ledger 的 19 项全是 unit-passed-native-pending，组件通过不等于真实浏览器通过。
- F3：false，且独立 final verification 未测试。

## 6. 可信度判断规则

### A 级

A 级只授予当前候选包的真实浏览器结果，并且同一结果同时具有：

- 源码 hash；
- 验证输入 hash；
- 实际 package hash；
- ZIP SHA；
- 浏览器版本；
- 真实 launcher/PID；
- 原始 case；
- 原始结果；
- 结果截图或 CDP 证据。

当前没有满足全部条件的 candidate3 正式功能结果。candidate3 的 build/pack/verify 是包级 B，不应写成 A。

### B 级

B 级是当前源码或当前候选包的：

- source check、静态合同和语法检查；
- Node 单元/组件测试；
- 当前 production/development build；
- 当前 ZIP pack；
- 当前 dist/ZIP package verification；
- 可绑定到当前源码/包的 fixture、loopback 或资源闭包结果。

B 级可以证明局部实现和证据结构，不能宣称真实浏览器正向功能已经完成。

### C 级

C 级包括：

- 历史候选包、旧 ZIP、旧 package hash；
- prototype 或 F1/backend mechanism review；
- synthetic fixture、合成 package、Node promise 并发；
- 拒绝路径、非法输入、静态 scanner；
- 只做了安装/加载的截图；
- 只记录了源码存在或结构正确的静态检查；
- 没有当前候选 package hash 的报告；
- 已知 FAIL、BLOCKED、NOT_TESTED 的诊断报告。

C 级必须保留，尤其是原始失败和历史未测试项；它们不能升级为当前产品 PASS。

以下规则适用于所有层：

- 构建通过不等于功能通过。
- 拒绝非法输入通过不等于正向功能通过。
- synthetic checker 通过不等于真实浏览器通过。
- 安装截图不等于功能验收。
- 组件中 100 concurrent promise settle 不等于 B05 真实 100 并发。
- ZIP SHA 不一致时不能合并证据。
- package hash 相同也不能跳过 product inputs、verification inputs、浏览器版本、launcher 和原始结果的绑定检查。
- 任何 FAIL、BLOCKED、NOT_TESTED 或 stale 结果都不能被“最近的 PASS”覆盖。

## 7. 人工复核方法

人工复核一个候选和一项结果时，按以下顺序执行：

1. 查看 public-owner.json 和 evidence/incremental-20261004-01a106d2/candidate-identity.json，确认当前 writer、candidate3、源码 hash、验证输入 hash、package hash 和 ZIP SHA。
2. 查看 candidate identity、build receipt、pack receipt 和当前磁盘 ZIP 的 SHA；分别核对 production/development，不能只核对一个模式。
3. 确认测试报告中的 package hash 与当前 ZIP 对应的 candidate identity 一致；若报告只写“package passed”而没有 hash，最多按 B/C 处理。
4. 查看原始 PASS、FAIL、NOT_TESTED case 和原始 JSON/CDP/server/launcher 文件；先看结果，再看汇总。
5. 确认失败没有被删除、改写、skip、重命名成新 case，历史失败仍然可读。
6. 确认测试真正经过产品入口：工具页、扩展 Worker、真实 page agent/relay、真实 SDK 或真实 controller；合成 sender、手工调用 completion 或测试替身不能算真实入口。
7. 确认浏览器是本 run 的受控 Chrome for Testing，记录了请求版本、实际 binary、launcher、主进程 argv、PID 和 profile 清理收据。
8. 确认每项有真实 runId、resultId、下载文件和磁盘 SHA；下载只有 onCreated 或截图没有 complete/disk hash 时不算完成。
9. 确认工具页重开和整浏览器重启是两个不同的测试；工具页重开保持 browser session，整浏览器重启应验证 session storage 生命周期、旧 SDK grant 和持久存储，不可用同一截图替代。
10. 对最终合同验收，确认所有适用项没有 FAIL、BLOCKED、NOT_TESTED 或 stale，并且 603、19、B05、campaign、review、package、ZIP 和 F3 都绑定同一最终候选。

## 8. 当前人工冒烟测试

以下是当前代码最短的人工正向路径。它只能作为冒烟测试，不能自动登记为合同 PASS，也不能关闭 603、19 或 F3。

1. 使用当前候选 ZIP 安装到受控 Chrome for Testing，打开工具页。
2. 选择目标网页和精确 document；确认工具页展示的 tab/document/permission 与目标一致。
3. 保存脚本版本。
4. 运行以下脚本：

       return {
         title: await page.title(),
         url: await page.url(),
         value: params.value
       };

5. 使用参数：

       {"value":7}

6. 检查：
   - 返回值是对象；
   - value 是数字 7；
   - title 和 url 与目标网页一致；
   - 记录真实 runId 和 resultId。
7. 关闭并重开工具页，用同一 runId 读取结果，确认结果来自持久结果而不是重新执行。
8. 下载结果，保存下载文件，比较展示 JSON、下载 JSON 和磁盘 SHA。
9. 保存 r2 时，让 r1 保持运行；确认 r1 不被 r2 替换，两个 run 的结果和 target/document 不串页。
10. 执行 stop 场景；确认 stop 后不会重复执行、不会晚到达新的 page action，且原始结果仍可审计。
11. 执行 SDK 授权和撤权；撤权后旧 grant 不能继续调用，导航到新 document 后必须重新授权，再检查 SDK ready()、服务调用、旧消费者和资源访问。
12. 若测试工具页重开和整浏览器重启，分别记录 profile、browser PID、session incarnation、runId/resultId 和 cleanup；两者分开登记。

人工冒烟最多证明“这一次入口看起来可工作”。只有把同一 candidate identity、原始 case、CDP/截图、launcher/PID、结果和下载 hash 全部保存后，才可能成为 A 级原生证据。

## 9. 当前已证明、部分证明、未证明

### 已证明

以下内容有当前 candidate3 的包级或当前组件级原始证据：

- 当前源码 check 通过，实际检查 89 个 source/test/build 文件。
- current candidate3 production/development build 通过，package hash 分别为 5893057... 和 97dabf8...。
- current candidate3 production/development pack 通过，当前磁盘 ZIP SHA 分别为 365cfb35... 和 01741122...，并与 candidate identity 和 pack-*-g0 日志一致。
- current candidate3 verify 对两个 dist 通过固定入口、HTML、manifest、CSP、sandbox、WAR、SDK resources、icon、MIT 和动态执行边界检查。
- 最新完整组件日志记录 507 pass、0 fail、0 skipped；这是组件级结果。
- 组件和源码中已经覆盖很多存储、协议、PagePort、ChromePage、SDK、四服务、资源、恢复和下载边界。

### 部分证明

- ChromePage、控制 API、Worker 生命周期、四服务、SDK relay、下载、恢复和旧消费者都有组件或历史原生片段，但没有同一 candidate3 的完整真实浏览器链路。
- P1—P3 的历史真实 UI return 7/reopen 证明过旧包上的窄路径，但不能证明当前 candidate3。
- B05 历史报告证明过真实 runner 能记录物理观察，也保留了 7 个 FAIL 和 8 个 NOT_TESTED；它没有关闭 B05。
- 19 项补充合同有 19 项组件层标记，但仍是 native pending。
- 静态 acceptance checker 和 component acceptance tests 可以发现证据缺失、hash 漂移、分母变化和错误复核顺序，但不会产生缺失的浏览器证据。

### 未证明

- 当前 candidate3 的真实工具页正向运行。
- 当前 candidate3 的独立 SDK Hello→调用→原 Promise 交付。
- 当前 candidate3 的真实旧消费者、四服务权限/撤权/导航后重授权。
- 当前 candidate3 的 controller stop、deadline、host close、恢复和物理 Worker 终止。
- 当前 candidate3 的下载 complete、文件 bytes/hash 和重开后的同一 durable result。
- 当前 candidate3 的 603 项、19 项、1000/10/2 campaign。
- 四个真实崩溃窗口：admission-abort、commit-before-dispatch、write-before-receipt、durable-before-delivery。
- 独立 F3 和迁移完成。

### 不可继承

以下结果必须保持历史/组件/C 级：

- 历史候选 package hash 上的 PASS；
- 旧 ZIP 或旧 dist；
- prototype、F1 backend mechanism、设计 review；
- synthetic fixture、合成 package、fixture promise 并发；
- 只验证拒绝非法输入的测试；
- 只验证安装、资源存在、静态 scanner 或结构的测试；
- 只记录 readyForControllerNative、启动或权限 UI 的报告；
- package hash、ZIP SHA、源码 hash、验证输入或浏览器身份不一致的结果。

## 10. 后续顺序

推荐按以下顺序继续：

1. 修复真实浏览器入口观察器，确保 tool-shell、target document、page agent/relay、SDK/controller 观察点都来自真实产品入口。
2. 重新构建，并绑定源码、验证输入、包树和 ZIP SHA；废弃旧 candidate1/candidate2 日志对当前候选的解释权，但保留原文件。
3. 重新跑最小当前候选人工冒烟，保存 runId/resultId、截图、CDP、下载文件和磁盘 SHA。
4. 验证 ChromePage 和普通 JS，包括 exact document、frame、navigation、stop、deadline、host close 和旧 element fence。
5. 验证四服务和固定资源包，包括 SDK grant、撤权、导航后重新授权、资源 SHA 和旧消费者。
6. 验证独立 SDK 和旧消费者，覆盖 production/development × Chrome138/154 和 browser-session restart。
7. 验证 stop、deadline、host close、下载和恢复，确认未知效果不重放、durable settlement 只发生一次。
8. 验证 B05 并发和四崩溃点，保存每轮独立身份、资源 baseline、真实 PID/thread、结果和失败原件。
9. 执行 1000 轮、10 重连、2 禁模板，并确认每轮没有 FAIL、BLOCKED、NOT_TESTED 或资源泄漏。
10. 对同一最终候选包执行 603、19 和独立 F3；最后由 acceptance checker 和独立 reviewer 复核，全部通过后才可以宣布迁移完成。

## 本地源码与 MCP R2.2 定向验收

工作记录：docs/framework/workstreams/local-dev-r22-c036.json；接口：docs/framework/local-development-r22.zh-CN.md。

- 组件入口：node --test tests/environment/local-dev.test.mjs。
- 真实 Chrome：CHROME_FOR_TESTING_BIN 指向受控 CFT 后，运行 node tests/framework/local-dev-native-acceptance.mjs。使用独立 profile 与专用测试账号；不得覆盖已存在的 Native 安装。
- 项目必须经 stdio MCP → 真实 Native Host → 原 RunHost 执行。CDP 仅观察/可信输入，不能代跑项目业务。
- 运行 examples/programs/local-controller，直接修改依赖 extract.js 后再次运行；保存两次 runId/resultId、sourceHash、inputHash、documentId、结果、retirement 和实际包身份，不生成开发交接文件。
- 原生权限对话框通过本次 Chrome PID 的系统原生输入批准，并保存 AX/截图及权限读回；不能写 storage、授予权限 API 或模拟 native ACK 冒充批准。
- 记录每个失败；Node/mock、真实包内工作台 tab、真正 Sidebar、Page UI、Codex 客户端和最终 F3 分别标记，缺证据不提高等级。
