# AI 客服 R3.1-FULL · 回执未知只读恢复与长期交付记录

2026-10-26。仓库 `shopable-ai/opendesk-browser`，唯一修改分支 `main`。本记录只覆盖本轮新增；其余 R1.3 / R1.3.2 / R1.4 / R1.5 / R2.1 结论保留各自原始证据，不累加为真实产品验收。

## 原始产品目标与文件归属

在原 `ai-knowledge-answers`（0.1.5）基础上完成「安装 → 知识维护 → 限定网站授权 → 客户监听 → 固定/相似知识匹配 → 真实 Shared Provider 草稿 → 人工批准/限定自动固定发送 → 真实网页按钮 → 独立唯一回执 → 暂停/撤权/恢复」。不新建 Host、Provider、SDK 或第二套自动化引擎。

所有准确路径、两个 HTTP 启动命令、用户实际操作与故障恢复均在 [唯一入口 README](../../../examples/sidebar-tools/ai-knowledge-answers/README.zh-CN.md) 置顶保留。`preview/index.html` 加载正式 `src/`，它不渲染或模拟可信 Runtime 的真实能力；历史 `/mnt/data/` 演示不作为永久来源。

## 源码增量与风险控制

此前 Runtime 对 `UNKNOWN` 禁止再次发送（正确）；但缺少供用户从同一可信侧栏主动重新读取原网页回执的路径。原发送实际上可能已完成而 Chrome 执行回执丢失，用户只能人工查看，无法把已存在的唯一 DOM 结果恢复为 `CONFIRMED`。

新增 **仅 UNKNOWN 的只读核对**：
1. 可信 UI 原生用户点击，通过原 Host 调用原 Runtime；禁止未经批准的脚本触发。
2. 仍使用原 Adapter、固定 `127.0.0.1:43111` 精确路径和 `documentId` 绑定，仅调用 `adapter.read()`，**没有 `adapter.send()` 或新的点击**。
3. 同一会话内必须取得唯一原客户（ID、线程、问题全文、适用范围一致），及唯一客服回复（replyTo、线程、原答案全文、回复 ID 唯一）。成功才改 `CONFIRMED` 并写回来源 messageId。
4. 无回复、重复回复、身份不符、页面切换、读取失败或会话过期仍 `UNKNOWN`／停止，要求人工排查，不重发，不自动补发。
5. 只读核对在暂停期可以完成已发生事实的认定；暂停并不重新许可实际发送。原来源/ETag/Provider/自动固定授权与未知发送禁重试不变。

改动文件：
- `trusted/local-test-runtime.js`：`reconcileUnknown` 与 `reconcile` 入口。
- `trusted/host.js`：传递可信 UI 的原事件。
- `trusted/Workspace.jsx`：UNKNOWN 行内按钮与核对中反馈。
- `tests/environment/ai-knowledge-chat-r13.test.mjs`：已点击但回执丢失、无/多个回执、暂停、真实点击约束及源码边界测试。
- `README.zh-CN.md` 和本记录。

## 状态证据（禁止无证据 PASS）

| 范围 | 结果 | 注释 |
| --- | --- | --- |
| 正式知识管理业务 | ALREADY_DONE，历史 CORE_NATIVE_PASS | 0.1.5 Mac CFT 保存、编辑、重开侧栏后查询，见 README；不是当前提交重新运行 |
| 固定本地 DOM 自动客服 | IMPLEMENTED，NATIVE_E2E_NOT_TESTED | 原 Adapter/Runtime 已有功能；真实监听、唯一客服回执没有近期授权环境证明 |
| 真实 Shared Provider 与 AI 草稿 | IMPLEMENTED，NATIVE_PROVIDER_NOT_TESTED | Node fake 测试与真实 Provider 必须分开 |
| 原 UNKNOWN 发送保护 | ALREADY_DONE，历史 Node PASS | 旧 Runtime 的禁重试和暂停/去重证据可复用 |
| R3.1 UNKNOWN 只读恢复 | CI_NODE_PASS（4/4 新增）／NATIVE_NOT_TESTED | 原 GitHub App CI 158/158 包含新增定向测试；真实网站不借用该结论 |
| 同源 HTTP 知识预览 | ALREADY_DONE，R3.1_NOT_TESTED | 43112 启动后在本地浏览器访问；不等于 Browser 可信侧栏 |
| 正式包与安装身份 | 0.1.5 旧证据；本轮 NOT_TESTED | 未改变沙箱业务包，不应因 Trusted 变化无依据修改 JSON |
| 用户已批准的真实第三方客服网站 | BLOCKED_NO_TARGET | 需完成本地 fixture 的可信真实闭环后再对具体站点另行授权 |


## R3.1 CI 真正执行的结果与源码绑定

首次源码提交 `6a91458bb61e732cee7f8c8e52ef33f92226c50e` 包含只读核对；后续提交 `29caf7d45f2b5c2b743338ef6749ea9913d16eb6` 仅增加 `app.ci.json`，让原 `scripts/app-ci.mjs` 自动发现六份业务 Node 测试。没有新增 workflow、Host、Provider 或 SDK。

GitHub Actions `OpenDesk App CI`：[run 40284151167](https://github.com/shopable-ai/opendesk-browser/actions/runs/40284151167)，`app-validate (ai-knowledge-answers)` job **`121443898437`** 读取并构建准确提交 `29caf7d`：

- `node scripts/app-ci.mjs node "ai-knowledge-answers"` 实际结果：**158/158 PASS，0 FAIL**。其中新增 R3.1 四项均是 GitHub 原始 job 日志的独立 `ok`（序号 113–116），分别覆盖真实点击后丢失回执、无/多回执和暂停、真实 UI 点击边界、同一 Runtime/Host/JSX 所有权。
- 候选构建：`0.1.5`，`57,435` 字节，SHA-256 `e65e942b7715c0801e93f784a7923f4f0a814a076f39aeb31a89a3e6ebb4bc36`；输出 `CANDIDATE_SOURCE_IDENTICAL`。这证明候选与被测源码同源，但不是正式晋升安装或真实浏览器运行。
- 该 App profile `kind=ui`，本轮 Chrome/browser 和 macOS Native 步骤未要求、未执行；fake Chrome/Provider 的 Node 结果不可改写为真实 Provider 或 DOM E2E PASS。其他并行工作流失败需按各自源头核查，不替代本产品已执行的 job。

## 九个独立质量维度（基于现有证据的工程评估，不冒充外部专家认证）

| 维度 | /100 | 扣分与依据 |
| --- | ---: | --- |
| 功能完整性 | 74 | 知识管理较成熟，真实第三方网站与正式自动客服上线未完成 |
| 客服业务闭环 | 56 | 本地固定链已实现，缺真实可信监听、人工发送和唯一 DOM 回执 |
| 知识事实安全 | 86 | 来源与数字规则、固定范围、人工审核已实现；真实语义边界待测 |
| 自动发送可靠性 | 82 | 定向去重、ETag、批准固定答案和 UNKNOWN 只读核对有 Node 证据；原生尚缺 |
| 用户体验 | 84 | 管理页有历史 Chrome 操作证据；可信客服操作和全宽实际使用未验收 |
| 架构复用 | 96 | 沿用原 Host、Consumer、Runtime、Adapter 和 App CI，未增第二套 |
| 异常恢复 | 88 | 暂停、撤权、并发、迟到结果、UNKNOWN 只读核对有 Node 证据；真实中断尚缺 |
| 测试证据 | 81 | 此次 158/158 Node 与历史管理界面 CFT PASS，真实 Provider/DOM 无结果 |
| 可维护性 | 93 | README 可独立启动、状态台账、复用 App CI，仍需 Native 与站点合同 |

算术平均：`(74+56+86+82+84+96+88+81+93) / 9 = 82.22/100`。产品尚未达到所有维度 ≥95；尤其真实客服闭环缺少 Native E2E 和实际 Provider 回执，不能靠 Node 分数推高。下一条真正增量是**在合法 Mac Chrome 入口复核正式安装/可信代码 → 新客户消息 → 真实固定答案发送和回执 → UNKNOWN 只读恢复 → 真实 Shared Provider 草稿及人工发送**，已通过的源码和 Node 不重复开发。

## 本地 Codex 的最短剩余增量（非重复开发）

按 README 启动、使用原 `dist/development` watcher，核对 Chrome 当前工具真实身份、官方发行、最新可信源码是否已编译并可见。先运行新增四项 R3.1 Node/fake Chrome 回归和最小 Host/Provider 保护，若失败只修对应代码；随后**必须从真实安装工具**依次完成：

- 新客户消息 → 固定知识 → 人工发送 → 实际客服 DOM → 独立 ID 回执；
- 模拟一个实际发出但 SDK 回执丢失的可控异常 → `UNKNOWN` → 用户只读核对 → `CONFIRMED`，保证网站点击次数没有增加；
- 真实 Shared Provider 的非精确问答 → 来源审阅 → AI 草稿 → 实际人工点击 → 同客户回执；
- 3秒/4条、暂停、停止、Provider 切换/撤权、文档与会话切换、ETag 和重复点击。

若官方 Chrome UI 入口继续被策略拒绝，不绕过；保留 `BLOCKED` 并提供本机 Codex 操作与原始回执。Node fake、HTTP 预览、Mac CFT/Native、真实 Provider、第三方站点始终独立记录。原客户 ID 和回复 ID 只从实际页面读回，不可制造。
