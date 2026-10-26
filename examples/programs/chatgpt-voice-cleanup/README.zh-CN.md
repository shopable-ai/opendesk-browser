# ChatGPT 官网语音文字整理 R0.4：辅助式最小 Demo

## 原始目标与产品边界

用户在 ChatGPT 网页利用系统语音输入法生成草稿，希望使用已有的官网普通聊天能力纠正中文同音错字、英文技术术语、口语重复、语序和标点，并安全回填原输入框，不自动发送，不需要额外 API Key，也不消耗 Codex/Work 额度。

当前 Page Program ID 为 opendesk.chatgpt-voice-cleanup，仅面向顶层 https://chatgpt.com/*。它使用既有 @opendesk/ui、Page USER_SCRIPT 与安装/权限生命周期，业务源码仅在本项目中，不另建 Provider、RunHost、SDK、网关或宿主。

**重要状态：USER_ACTION_REQUIRED。本版本没有自动调用 ChatGPT 模型的能力，也没有官方 MCP 正文回传的受信接收通道。** 本项目不是「官网 AI 整理全自动闭环」；任何手工粘贴的结果，不论 JSON 是否有 requestId，都只能视为用户提供的数据，不能宣称来自可信插件调用。

## 当前可以操作的流程

1. 在原 ChatGPT 网页打开悬浮面板，点击「读取草稿」；只读取，不发送。此时绑定原文、当前 URL、文档对象、唯一原生编辑器与所属表单。
2. 输入或调整待整理原文、术语提示；点击「生成整理请求」创建一次 requestId。整理 Prompt 保留数字、日期、金额、URL、否定含义及明确要求，并强调术语是上下文而不是全局替换规则。
3. 点击「复制请求」，由用户在自己有权使用的 ChatGPT 官网对话提交。希望不进入普通聊天历史，可手动选择个性化临时对话；本程序并不会自动创建或控制临时对话，且官网临时对话的插件支持与权限须按账户实际验证。
4. 将官网回答手动粘贴到面板。JSON 仅检查用户提供的 requestId；纯文本只作人工确认，两者都不是可信 OpenDesk MCP 回传。
5. 点击「填入原输入框」。写入前后核对原页面、唯一编辑器、表单、原草稿未改变、无附件/富内容、未处于输入法组合态。聚焦后重新检查，写入后马上与延迟再次读回。绝不自动发送。
6. 目标草稿改变、结果非本轮、当前文档切换或写入未知时失败关闭并保留原草稿。写入未知时当前文档禁止重复写入，需要人工核对后重新打开页面。用户可取消本次、复制结果。

## 源码、权限与预览

- src/model.js：整理提示、术语、手动 JSON 校验、回填闸门。
- src/site.js：已有 ChatGPT DOM 选择器、原草稿绑定、原生编辑器填写与独立读回；不读取令牌，不访问私有 backend-api。
- src/widget.js：正式界面和同源预览共用的互动逻辑。
- src/main.js：已安装 Page Program 的原生受管 UI 生命周期。
- assets/panel.css：正式与预览使用的同一份 CSS。
- preview/index.html：显式标记为模拟网页，只替换站点输入框适配器，不模拟任何官方 AI 或 MCP 调用。
- tests/model.test.mjs：业务逻辑定向测试。

仓库根目录执行：

    node --test examples/programs/chatgpt-voice-cleanup/tests/*.test.mjs
    node scripts/validate-program-project.mjs examples/programs/chatgpt-voice-cleanup
    python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/programs/chatgpt-voice-cleanup

在本机访问 http://127.0.0.1:43111/preview/index.html 。该路径不能当成公网预览；预览也不证明 ChatGPT 官网、模型调用、MCP 工具或真实安装已通过。

正式运行需用 OpenDesk 已有多文件 Page Program 开发入口显式试运行，并按既有 Page Candidate → Verified → Installed 流程审批网站范围；不能把 GitHub 源码文件出现视为已安装。

## 与现有 Bridge 的关系

已核对原 src/native-agent/chatgpt-fixed-bridge-*.js、chatgpt-bridge-trigger-gate.js、workspace-chatgpt.js 和已有 Durable Result：前者是模型提出浏览器任务，可信 Host 执行固定 Task 并把真实结果送回 ChatGPT；不是模型通过官方 MCP 将编辑后的文字主动发送给悬浮窗。

如果将来官方授权工具支持正文反向推送，须先做独立实测，并在现有受信通道核对 requestId、原始 tabId/documentId/URL、结果身份、授权代际、幂等/冲突状态。不得把网页 postMessage、手工 JSON、代码推断或模拟回执冒充受信工具。没有上述能力前不新增第二套 Host。

## 竞品路线排除及额度边界

Sub2API 和 CLIProxyAPI 的 Codex/CLI OAuth 通道并非普通 ChatGPT 网页聊天池；Chat2API 使用旧版 AccessToken / RefreshToken 和私有协议，更新记录久远；gpt-web-gateway 用真实浏览器自动化包装 API 并明确提示上游服务条款风险，不能等同正式商业授权。公开 API 另行计费；Sign in with ChatGPT 第三方调用也不能假定使用普通网页聊天额度。

ChatGPT 官方插件或 MCP 能在具备权限时由 ChatGPT 主动调用外部工具；这不等于页面悬浮窗可以主动一键发起官网模型推理。当前缺少经验证的官方直接触发接口。

## 未完成项、真实测试与本地 Mac 验收

- 官方插件主动调用正文接收工具并与原 Page Program 关联：NOT_IMPLEMENTED / NOT_TESTED。
- 官方 Personalized Temporary Chat 下目标插件真实可用、插件写入是否需确认：NOT_TESTED。
- 原网页不切换且一键自动发起模型：BLOCKED_BY_SUPPORTED_API。
- Node 定向测试和程序项目校验：须核实本次实际执行结果，不能从测试文件存在推出 PASS。
- 真实 Mac Chrome / ChatGPT / IME / 编辑器 React 重建、SPA 导航、安装升级/撤权：NOT_TESTED。
- 当前交付是辅助 UI 的业务源码与预览，未宣称网页普通聊天额度可程序化无限使用。

Mac Codex 只处理本项目实际未完成的测试和修复，不能重复开发相同功能；先检查用户原工作区、已存在的开发进程和 latest main，保留他人的未提交更改，禁止创建新分支、worktree 或 PR。

## 2026-10-26 调研证据与 P1 明确阻断项

官方依据：

- https://help.openai.com/en/articles/8914046-temporary-chat-in-chatgpt ：Personalized Temporary Chat 可以使用已有插件；Unpersonalized 不使用插件，临时会话不进入普通历史（除非主动保存）。
- https://help.openai.com/en/articles/12584461-developer-mode-and-full-mcp-connectors-in-chatgpt ：自定义 MCP 的完整写入权限主要面向合格 Business / Enterprise / Edu；Pro 自定义 MCP 的 read/fetch 不等于任意自定义写入工具获授权。已安装的专门应用如具备写入工具，也需单独检查权限和参数。
- https://help.openai.com/en/articles/20001542-using-your-chatgpt-plan-in-other-apps-and-sites ：Sign in with ChatGPT 合作应用 AI 请求使用 Work/Codex 共享额度；不应声称属于网页普通聊天池。
- https://openai.com/policies/terms-of-use/ ：禁止未获授权的程序化提取输出及绕过访问限制。
- https://learn.chatgpt.com/docs/chrome-extension ：官方 Chrome side chat 可在浏览器旁侧展示聊天，但没有向第三方 Page Program 提供自动发起模型请求与直接接受回执的公开合同。

开源对照：2026-10-26 仓库推送记录可核查：
- https://github.com/Wei-Shaw/sub2api ：Codex 模型清单处理器面向 Codex CLI/桌面客户端，并非官网普通聊天的公开 API。
- https://github.com/router-for-me/CLIProxyAPI ：Codex/CLI OAuth 通道，额度归属不能推定普通网页聊天。
- https://github.com/HuggingBear/Chat2API ：最后代码更新 2024-07；旧版 AccessToken/RefreshToken 私有协议，不能推定现可用。
- https://github.com/stufently/gpt-web-gateway/blob/main/CHANGELOG.md ：2.16.2 (2026-10-26)；2.16.0 报告网页任务卡住和诊断/重试，其 README 公开披露官网自动化条款风险和 backend-api 截取。

本轮 P0 公开资料与最新代码分类已开展，当前账号的实际额度/许可没有模拟或确认；P1 未发现可授权的「AI 整理正文写入 OpenDesk」工具，真实插件调用、回执身份与新会话均 NOT_TESTED；P2 仅独立 Page 辅助程序源码与模拟预览存在，正式 Chrome 尚未验收。没有任何一项可以升级称作完整自动闭环 PASS。

下一次实测顺序：先在支持写入的**已有** OpenDesk 应用/工具及账号权限下寻找一个目标明确的安全正文接收动作；如无此能力则记录 BLOCKED，不重复研究 Codex 网关；随后仅验证普通用户手动从官网临时对话复制 JSON、输入框冲突保护与读回。任何新宿主/通信 API 必须经独立缺口审计，不能为了做演示临时开放网页事件权限。
