# R2.8 · 精确复用已安装 0.2.2、真实 Page 安装与原请求审批

**任务：** `OD-SUBAGENT-CHAT-A2B2A-R2-TRUSTED-CLOSURE`。当前仍未完成 B 全文回 A；BUSINESS **BLOCKED**，不是 PASS。

## 最新决策与实际入口

用户针对唯一已安装 Task 版本冲突回复「感觉高版本可以会更好，你作为专家合理判断；」。采用现有 WebFlow **0.2.2**：保留它对当前 ChatGPT composer、完成识别及官方消息 UUID 的修复；将 Subagent 的声明与可信结果消费者精确迁到同一版本，不覆盖 WebFlow 的原不可变包或 R11 UNKNOWN。独立兼容性核查确认原共享 verifier 已支持该版本，无须改另一套 Controller/Host/结果适配器。

业务 owner 仍为 `projects/subagent/`，类型仍为 USER_SCRIPT 网页增强。请求复用原 `@opendesk/tasks`、TaskWorkbench、Authority、Controller 和 Durable Result；可信 SW 消费者仍是原 `trusted/result.js`，同步其唯一来源 pin 与保护测试。未增加 Runner、数据库、授权或兼容别名。

## 构建与安装

- 复用已有 `node scripts/dev.mjs` writer；没有启动第二份 Browser build/dev、改日常扩展目录或 ID。调试页实际观察到开发服务连接、指纹 `f0c8ac4cfeef`；后续 watcher 又发布更新并导致扩展会话重载。磁盘 revision 不冒充浏览器已应用证据。
- 原 `build-program-project.mjs` 与 `build-page-install-package.mjs` 在隔离 artifacts 生成 Subagent **0.2.1/r2**。sourceHash `6e5d6a7578307a94627f8a785703af7e35e4d5fba067ea8ec5d5c5ef42649665`，packageHash `f77a2f64cea967b69d7e4f2fea1a0287cc92a5fc17539d66892f78e8b5cad58d`。见 [候选摘要](candidate-summary.json)。
- 本轮先在稳定运行时通过原「扩展 → 导入」安装 0.2.0/r1；R2.7 `E_BUILTIN_RESOURCE` 未复现，未无依据修改资源 loader。见 [初次成功安装读回](page-install-readback.json)。
- 之后同一原入口审阅「0.2.0/r1 → 0.2.1/r2」、固定包及源码 hash，点击一次确认更新。[更新后原列表读回](page-update-readback.json)：installation `3d3dd82b-1fab-43a0-b0fe-464683c313aa`、generation=2、active、enabled、ready、nativeState=registered、error=null；精确委托 0.2.2。旧文档清理有一条其他标签的 pending 记录，未接管或刷新该标签。
- 可信源码修改最初漏同步精确 pin，被原 `opendesk-fixed-sw` 构建保护拒绝；补齐唯一 pin 及对应测试后，原 watcher 恢复发布。未放宽来源保护。实际加载绝对路径及 Native pairing 本轮未独立取证；production 静态候选未验收。

## A 的真实请求与两阶段审批

已有普通测试对话作为本轮 A：`https://chatgpt.com/c/6af6fdcf-061c-83ec-ac2a-cf89307b0789`。不操作原 WebFlow R11 A/B。A 的官方 composer 读回为空；只在 Subagent Mini Chat 填写并读回「请介绍 WebFlow 的三个主要优势。」，真实点击创建一次。Mini Chat 显示「请在 OpenDesk 原任务审批中确认」。

原 TaskWorkbench 自动打开冻结请求，显示来源 A、Subagent、Task 0.2.2、独立 owned `https://chatgpt.com/` 和 `{prompt:"请介绍 WebFlow 的三个主要优势。",send:true}`；点击一次「保存并核对」，出现「参数和网页身份已持久保存并读回，尚未提交网页执行」与「确认执行一次」。见 [具体审批准备](task-review-ready.json)。用户随后明确回复 **「批准这一次发送」**；这项授权保留，不再次询问同一批准。

但开发服务安全重载后，恢复原准备时界面显示「来源网页或任务授权已失效；原请求只读，不能再次执行」。原 UI「查询状态」触发的真实 RPC 回应见 [原准备及请求读回](task-preparation-readback.json)：

| 身份 / 状态 | 真实读回 |
| --- | --- |
| requestId | `9cfd521f-b637-4082-9c70-a2ce2a6f5355` |
| preparationId | `page:9cfd521f-b637-4082-9c70-a2ce2a6f5355` |
| Task 安装 | `aa3663d9-8f52-4008-8092-b66aa5489027` / generation=3 / 0.2.2 |
| Task manifestHash | `907ed4de341c42dc3aa7890a8ce99afee30a63b8a971a8b28126e74271083050` |
| Task contentHash | `0d9eea01b8e5f4ff4433cba0f52b5fd80979870e7c0a118b0beffcb9fa02b8b4` |
| A 绑定 | tab=1114139442 / frame=0 / document=`74902FBF01F8860C609C01615FF98271` |
| inspectTaskRun | preparation.state=`unknown` / settled=false |
| readPageTaskRequest | request/preparation.state=`prepared` / approvalAllowed=false / snapshot=null |
| runId / resultId / B URL | null / null / 无 |

两种 state 是原接口各自的读投影，未擅自改写为一致。源码 `inspectTaskRun` 在 preparation 的 browserSessionIncarnation 与当前会话不同且尚无 Run 时投影 `unknown`；提交检查还要求原会话、A 文档与安装授权保持有效。原准备的 expiresAt 为 **2026-11-13 13:46:18.353 UTC（21:46:18.353 上海）**，也已早于最终查询；仅恢复 UI 不能使其合法执行。当前不具备合法原审批准入，未点击「确认执行一次」、未创建 B 或发送消息；用户批准不能替代这些保护。原请求及来源槽均保留，不取消后另建请求，不换 requestId、A 或 B 规避 UNKNOWN。

[A 最终读回](a-after.json)与[创建前基线](a-before.json)相比，官方对话正文 SHA-256 和官方 composer 的内容及 HTML 均未变化。Mini Chat 显示「查询失败；原任务仍保留，不会重新发送。」，输入保留、创建按钮禁用、answer 为空、B 链接为 null。已 handOff 同一 TaskSpace 给用户，未在错误状态调用 finish，也未保留本任务原生 UI 锁。

读回方法是在本任务精确绑定的原 Side Panel 短暂复制原 UI 自己发出的 `chrome.runtime.sendMessage` 回应，原 Promise 和参数不变，finally 恢复方法并删除诊断标记；没有直接伪造 Host 请求或读写内部数据库。浏览器仅用 ego TaskSpace 138；侧栏未暴露为常规 Page，使用其文档允许的 CDP 接口并先核对实际窗口、A tab、URL、active 与 visible。扩展重载关闭了中间目录页，未因此重放创建或发送。

## 定向验证

| 范围 | 结果 | 本轮证明 |
| --- | --- | --- |
| [Subagent](subagent.tap) | 48/48 PASS | 精确 0.2.2、官方 UUID 与拒绝非 UUID；原全文投影、来源与 UNKNOWN 保护 |
| [Page 两阶段工作台](workbench.tap) | 6/6 PASS | 冻结 `send:true` 不被 schema 默认 false 或展示草稿覆盖 |
| [可信来源 pin](provenance.tap) | 1/1 PASS | 只批准三项精确 SW 输入；漂移、其他执行世界、符号链接和兄弟模块继续拒绝 |

未运行全仓 CI、production 验收、评分驱动的额外测试或已延期矩阵。SOURCE/NODE/PAGE_BUILD/PAGE_PACKAGE/INSTALL 有上述定向证据；CHROME_NATIVE 仅证明真实安装、A 创建和审批准备；B 原生单发、完整 Result 及 A 全文/链接为 **NOT_TESTED**。本轮可用性不以 Node 数量或安装成功替代。

本轮执行命令为 `node --test projects/subagent/tests/*.test.mjs`、`node --test --test-name-pattern='^page request' tests/environment/my-react-workbench.test.mjs`、`node --test --test-name-pattern='^Subagent Result' tests/environment/bundle-provenance.test.mjs`。日志为 Node spec reporter 输出，沿用 `.tap` 文件名；不是机器 TAP 格式。语法检查及 `git diff --check` 通过。未记录每条测试的原始开始/结束时间或不可变全输入清单，不能追补或将日志复制时间冒充运行时间；没有为消除这一审查限制作额外重跑。

已只读核对 `controller-methods.js` 的原请求、准备、检查与取消路径：现有合同允许读取、复用原准备或取消，**没有同请求重绑会话或续期动作**；原准备的再次保存也不会重写旧记录。当前安全执行分支到此受阻，重复查询不能恢复准入。未实现新的 Authority 恢复合同，未以取消后另建请求替代恢复。后续若处理该恢复能力缺口，应由平台 Authority owner 独立评审，在保留原单次执行、来源、安装身份和 UNKNOWN 保护的前提下设计；当前保持 BLOCKED。用户已给出的单次发送批准无需重复询问，但不能当作创建第二条逻辑请求的授权。

## 五视角独立复核

五名原生子 agent 分别只读审查，模型/provider 继承父任务，无产品写入、浏览器、测试、构建或提交。评分针对**实际第一阶段闭环**，不等于代码质量或其他轮次评分；不能以平均分替代业务证据。

| 视角 | agent | 分数 | 结论与主要缺口 |
| --- | --- | ---: | --- |
| 产品 | Kuhn `01a1d52d-cedc-7ce2-b99d-4220d2cb1145` | 40 | 安装与请求准备成立，B 全文和 A 展示未交付；prepared 被统一提示待审批存在静态可达风险 |
| 架构解耦 | Descartes `01a1d52d-d20c-72d2-985b-301bcd1595a8` | 40 | 原 Host/Controller/日志与消费者精确迁移成立；过期且跨会话的原请求无现有重绑/续期入口 |
| 脚本协议 | Kepler `01a1d504-efc3-7a13-8a2b-dec9eb85066c` | 35 | pin/hash/UUID 协议一致，但真实 Run/Result、B 全文及 A 回显缺证 |
| 安全 | Jason `01a1d52f-4e65-79f3-987a-c8862ff4ebde` | 50 | 当前安全停住，UNKNOWN 与来源槽保留；应用中的 SW 来源及完整执行链仍未实证 |
| 测试证据 | Arendt `01a1d52f-a07c-7cf1-a69c-b24ed75050db` | 35 | 48+6+1 与候选/安装 hash 一致；无 B 单发、持久全文、A 回显证据，测试运行元数据有上述限度 |

平均 **40/100**，未达到 95。共同否决条件是绕过原 `approvalAllowed=false` / UNKNOWN，或无同请求 B 全文、真实链接与 A 展示便宣称闭环。产品指出的待审批文案风险是源码可达推断；本轮最终实际文案已由 `a-after.json` 证明为「查询失败；原任务仍保留，不会重新发送。」，未为未复现的分支扩大修改。

本轮改动与证据未提交/推送；保留 main 上所有其他 owner 的 dirty，尤其 `scripts/bundle-provenance.mjs` 中独立 AI Scroll settings pin 修改。未创建分支、worktree 或 PR。原 watcher 与未知请求保持原 owner/原身份，未停止或接管并行服务。
