# 在真实 Mac 仓库继续完善 R10.1 使用说明与 API 文档

默认中文，直接创建和修改文件，完成可阅读、可按步骤使用的文档与示例，不要只输出规划。本轮重点是让我理解已经完成的这部分 OpenDesk 功能，以及实际如何使用。文档主入口放在 `docs/api/`。

## 用户目标与本轮范围

请站在第一次使用者的角度回答：OpenDesk、Native Host、Codex/MCP、Sidebar、Controller、Page USER_SCRIPT、源码目录各是什么，哪些情况需要它们；怎样从一个 JS 文件或项目目录开始，到实际运行、修改源码、读取结果和停止；遇到断连、撤权、导航、旧回执或未知结果时该怎么办。

本轮主要交付使用说明、真实 API 参考和最小可运行示例，不重新开发已合并能力，不默认继续完整框架验收。只在文档或示例核对暴露实际缺陷时给出文件、预期行为、通过条件并做必要的小修复。当前是开发环境，生产安装、ZIP、release/publish 暂缓；正式 F3 仍不得宣称关闭。93/100 是上一候选的质量判断，不是功能完成百分比。

## 工作树与接续身份

- 文档工作树：`/Users/shopme/.codex/worktrees/r101-usage-docs-01a12159/opendesk-browser`。
- 文档分支：`agent/r101-usage-docs-01a12159`。已创建 `docs/api/README.md` 使用入口和本提示词；先检查实际 HEAD、未提交修改及 workstream，再继续。
- 文档工作树以实施提交 `3d1697ff9087427e0ab290e6c2b6cd0f94f65444` 为基线。对应实施分支 `agent/r101-development-01a12159`、PR https://github.com/shopable-ai/opendesk-browser/pull/50。生成本提示词时 PR 为 open/draft、未合并；新对话须重新核对。
- 原实施树：`/Users/shopme/.codex/worktrees/r101-development-01a12159/opendesk-browser`。本地原始证据位于其 `evidence/r101-development-01a12159/`，最终提交 CI 元数据为 `ci-final-3d1697ff.json`。只读并保留，不在文档树假造或复制成新候选 receipt。
- 更早证据树：`/Users/shopme/.codex/worktrees/r101-audit-01a120eb/opendesk-browser`，其 `evidence/r101-audit-01a120eb/` 也只读保留，不能 git clean。
- 上次核对远端 main 为 `838a10833147036522956d3e2772c31e82f35461`；本地开发包的 UI 验证基于 main `77a8cdff` 与实施提交 `2e9e3ea6`，不要混淆二者。main 后续可能继续前进。
- 主目录 `/Users/shopme/Documents/workspace/opendesk-browser` 有其他工作和本地提交，不覆盖、不重置、不直接写 main。若文档树被他人占用，创建自己的 worktree/agent 分支接续。main 合入只交给获授权的集成者。

## 必须先读

完整读取本提示词，然后读取：

1. 当前工作树 `AGENTS.md`、`docs/framework/testing-guide.md`、`docs/framework/parallel-development.md`。
2. `docs/framework/workstreams/r101-development-01a12159.md` 和 `.json`，以及本轮 `docs/framework/workstreams/r101-usage-docs-01a12159.json`。
3. `docs/api/README.md`、`docs/product/program-development-dual-format-and-sidebar.zh-CN.md`、`docs/framework/local-development-quickstart.zh-CN.md`、`docs/framework/local-development-r22.zh-CN.md`。
4. 按需阅读 `.agents/skills/opendesk-program-publish/SKILL.md`、`docs/framework/modern-page-api.zh-CN.md`、`docs/architecture/browser-framework/program-project-authoring-r1.zh-CN.md`、`https-esm-imports-r1.zh-CN.md`。
5. 当前真实代码与测试：`native-agent/local-dev/{mcp,session,resolver,provider}.mjs`、`native-agent/native-host.mjs`、`src/ui/local-project.js`、`src/ui/script-editor.js`、Controller/USER_SCRIPT 相关合同与消费者。

快速入门和 Skill 曾保留“本机 Codex 未验收”“Local Dev 不支持 npm/HTTPS”的旧状态。对照具体候选、实际 resolver、最新统一指南和原始证据校正当前口径；不得为了匹配旧文字把已支持的能力删除或退回，也不得把“已锁定静态 import”夸大成任意 npm/HTTPS/动态加载。历史 receipt 和原始失败保持原样。

## 直接创建、完善这些文件

若最新 main 已有同用途文档，优先完善和合并内容，避免重复的权威入口。以下文件名可按现有命名规范微调，但职责必须覆盖：

- `docs/api/README.md`：总入口与功能选择表；面向第一次使用者解释各组件关系，指向各教程与参考。
- `docs/api/quickstart.zh-CN.md`：从已有开发环境开始的最短使用流程；首次配置与日常使用分开，步骤包含入口、操作、预期可见结果、常见阻塞与排查。
- `docs/api/local-projects.zh-CN.md`：单文件和多文件格式、package/入口/网站范围、明确目录授权、参数、静态相对 ESM，以及编辑后再次运行；说明保存不等于自动执行。
- `docs/api/mcp-local-development.zh-CN.md`：七个真实 `opendesk.dev.*` 工具的参数、必需字段、互斥选择器、返回结构、权限、错误与示例。工具为 attach/status/run/result/stop/diagnostics/detach，不编造新方法。
- `docs/api/controller.zh-CN.md`：Controller `main()` 输入、Page/Locator 的实际用法、运行和结果身份、源码 revision/hash、Stop/deadline、持久结果与旧结果冻结。只覆盖本轮需要的公开 API，完整现有 Page API 用链接复用。
- `docs/api/page-userscript.zh-CN.md`：USER_SCRIPT `main()`、受管 UI、CSS/图片/Shadow DOM、previewId、清理与 Stop、再次运行；清楚说明预览回执与持久 Controller 结果、正式 Candidate/Installed 的区别。
- `docs/api/sidebar-local-projects.zh-CN.md`：按当前真实 UI 写本地项目模式、选择项目、参数/目标、执行/结果、关闭重开、草稿保存、MCP 断连后的 Run/Stop 状态。当前入口是模式开关，不能照搬旧模式下拉菜单。
- `docs/api/dependencies-and-errors.zh-CN.md`：npm/HTTPS 锁与离线复用、首次锁定授权、缺依赖/缺缓存/哈希不符/构建失败的可操作说明；Native 撤权、断连、导航、迟到 ACK、OUTCOME_UNKNOWN 的只读恢复规则。

以上是实际文件交付，不是只列一个文件清单。必要时把最后一份拆成依赖教程和故障排查；不用机械追求页数，也不要把内部实现细节铺满用户操作流程。

同步修正现有 quickstart、统一操作指南、示例 README 和项目 Skill 的过时支持矩阵/链接，使它们指向 `docs/api/`。历史框架验收报告只补明确的当前状态指向，保留历史候选与失败事实，不把旧结果改成新 PASS。

## 示例必须真实可用

优先复用 `examples/programs/local-controller` 与 `examples/programs/local-page-ui`。至少给出：普通单文件 Controller、相对 ESM 多文件 Controller、Page 受管按钮/CSS/资产、已经锁定的 npm/HTTPS 项目四类路径。现成示例满足要求就直接引用，只补真正缺失的小例子或 README；不新造大量工程、不增加依赖、不新增 Runtime/Host/构建器。

每条路径明确：实际文件内容/入口、必要 package 字段、目标网站范围、运行入口、工具参数或 Sidebar 操作、预期返回、修改后如何再次运行、怎样读旧结果及停止。不能只展示打包命令并宣称已浏览器运行。

MCP 工具参数示例标明它们由 MCP 客户端调用，不写成网页控制台中存在的全局对象。目录 attach 只传 path 并继承 package 范围；单文件再按真实 schema 指定 runtimeKind/entryFormat/siteOrigin，变更范围按实际 detach/attach 合同处理。

Controller 使用 runId/resultId；Page 使用 previewId，不能给 Page 编造持久 Controller Result。stop 的语义必须按类型解释，不能宣称回滚任意业务效果。

测试页面统一 `examples/tasks/demo-form.html`。人工示例默认 `http://127.0.0.1:43111/demo-form.html`，Python 只托管测试 HTML，真实网站不用它。执行前检查端口归属；被占用时不要夺取他人资源，使用自己的临时端口并明确对齐示例/授权 origin。

## 验证、证据与完成标准

- 文档中的方法、参数、错误码、返回值和 CLI 选项必须查实际导出、schema 和消费者，不凭印象编造。公开 API、MCP 参数和内部 Native 协议分清楚。
- 文档改动只做所需的链接、示例语法/schema 与一致性检查，不因新聊天重跑 build、全部 Node 或 Chrome 验收。示例或产品代码确实变化才跑受影响测试，记录相关输入身份。
- 新 Native 定向 13/13、Mac IPC 3/3、当前 UI 90/90、源码检查、开发构建及真实 Sidebar/迟到 ACK 已有证据。Node/CI/Mac Native/真实 Chrome/实际 Codex/F3 的等级不提升、不相加计算产品百分比。
- 实际开发 Codex 已在旧开发包完成 101→102、两个 runId/resultId 和旧结果冻结；当前开发包按相关后端输入一致复用，不能说在每个新包都重做了。旧生产包 native-14 单独保留。
- 本地开发包 hash 为 `13c6fb622b75008cdca5edbf31c21ffbcddb2c6d46050ec512276f0fad082996`；最终提交 `3d1697ff` 的五个 CI 工作流成功，CI 测试合并提交为 `ebf1ee7cabba18f3541113c5c204c5be33985855`。CI 包与本地包不能混写。
- 原生菜单真实 AX 辅助选择已通过；自动驱动稳定性未证明。同包完整整轮、正式 F3 未关闭；生产/ZIP 暂缓。这些不是本轮文档任务必须偷偷补做的验收链。
- 未知效果或丢 ACK 后保留原 requestId/runId/previewId，使用只读 result/diagnostics；不得自动重放 run、Stop 或清理。NOT_FOUND/OUTCOME_UNKNOWN 不证明未执行，MCP 重启也不自动恢复旧归属。
- 只用受控 CFT、真实 sender、可信原生输入；禁止 DOM 赋值、synthetic events、伪造 native ACK 和放宽身份合同。O_NOFOLLOW/目录检查不是恶意同 UID 文件系统沙箱。
- 公开内容只包含必要、经过白名单处理的字段，不上传原始桌面截图、授权材料、配置凭据或完整 NetLog。原始证据保持本地只读。

完成时必须有完整 docs/api 导航、可照做的教程、与代码一致的 API 参考、可定位的示例文件、旧指南冲突的修正及检查结果。用普通中文说明“现在用户能做什么”“如何开始”“当前限制”。更新自己的 workstream，提交采用 Lore protocol；按现有授权推进独立文档分支/PR，不能直接更新 main，不能擅自合并 PR #50。

首条更新说清具体文档缺口、拟改文件及通过条件；约60秒报告实际文件成果。不要再把输出中心放在分数、测试数量或内部术语上。
