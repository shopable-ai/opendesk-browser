# OpenDesk Browser · ChatGPT 跨对话计算接力 R1.1

## 原始目标与本轮范围

用户预先手动安排 AI 任务，OpenDesk 在获准的官方网页上依次发送、确认助手回复、提取并保存结果、创建下一对话并携带上游结果继续。第一阶段只验证固定计算 A→B；不要开发第二套任务框架、后台服务或正式队列 UI。

- 实际执行脚本：examples/tasks/chatgpt-relay-calculator-r1.js
- 独立定向测试：tests/environment/chatgpt-relay-calculator-r1.test.mjs
- 使用现有 Controller Standard 草稿入口、Page/Locator、AppStorage、RunHost/Authority/Durable Result；本脚本不是普通 Node CLI、ChatGPT DevTools snippet 或 Send Queue 安装包。
- 原有 Send Queue 的同一对话连续发送已另行验证；本脚本只补跨新对话 A→B 的可行性检查，不修改其现有业务代码。

## 本地同步与离线检查

在线会话只修改 GitHub main，**不会自动修改 Mac 本地目录**。在本地 Codex 中先核对 git status、main 与其他并行任务；仅在不会覆盖已有修改时安全获取新提交，不强制 reset/clean/stash，不创建新分支/worktree/PR。

在 /Users/shopme/Documents/workspace/opendesk-browser 中执行：

~~~bash
node --check examples/tasks/chatgpt-relay-calculator-r1.js
node --test tests/environment/chatgpt-relay-calculator-r1.test.mjs
~~~

这些检查只证明脚本语法及假页面上的流程分支，不代表真实 Chrome PASS。

## 实际 Chrome 最短测试

1. 使用独立、已登录的真实 chatgpt.com 测试会话。先手动创建一个简单短对话，让浏览器已处于 /c/<id> 页面，并确认 AI 不在生成、官网输入框为空、无附件。保留其他任务对话及草稿。
2. 在 OpenDesk「开发」的 Controller Standard 草稿中加载完整 chatgpt-relay-calculator-r1.js；不是 Page USER_SCRIPT 安装入口，也不是直接粘贴在 ChatGPT 官网输入框。
3. 运行参数：{"left":17,"right":25,"factor":3}。在现有 Controller 允许时将 deadlineMs 设置为 120000（默认 30000 可能不够两轮 AI 回复），仅按实际公开入口设置，不虚构 API。
4. 只运行一次。观察任务 A 官方用户轮次真实发送、同轮助手回复结束、严格 JSON 解析和 AppStorage 保存/读回；脚本随后尝试点击真实 New chat、新对话中发送使用 A 读回值的 B，再确认 B 回复。
5. 预期结果 A=42、B=126；两段必须对应不同真实 /c/<id>。若通过，再用 {"left":19,"right":25,"factor":3} 在独立测试对话验证 44→132，确认 B 不使用硬编码 42。

同轮验证需要保留 Controller 运行及结果身份、实际网页消息/对话 URL、A/B JSON 原文与 AppStorage 读回；没有证据的项标记 NOT_TESTED。

## 安全与不支持的情况

脚本的单次发送前先写入 A_may_have_sent 或 B_may_have_sent，完成回复解析和读回后才晋级。AppStorage 固定键为 opendesk.chatgpt-relay-calculator.r1.active。下次运行若发现非 completed 检查点，直接拒绝新发送，先人工对账；禁止猜测是否发送成功并自动清空或重试。

脚本只允许短历史、单一已授权 Controller Run、目标官网单一编辑器、空草稿和可辨识的官方发送与新建对话按钮。任何站点 DOM 不兼容、被占用、候选歧义、输入回填失败、模型结果不合协议、超时、撤权、跨文档导航或副作用未知，均停止。公开 DOM owner 标记仅用于拒绝其他写入，绝不授予执行权限。

如果真实 ChatGPT 新建对话触发 Controller 当前目标的 documentId 替换，可能得到 E_DOCUMENT_REPLACED；这是需要下一阶段通过现有受控导航/任务交接能力解决的真实缺口，**不是自动再点击发送的理由**。

本次未在用户的真实已登录 Mac Chrome 上执行官方 A→B；这份脚本仍是 SOURCE_IMPLEMENTED / CHROME_NOT_TESTED。它不能证明正式生产队列、长时后台运行、跨刷新恢复、多个并发任务或正式扩展安装。

## 交给本地 Codex 的任务

先同步并使用这份已经存在的源码，禁止重写已完成的 Send Queue。先运行上述两项定向检查，再在专属真实 ChatGPT 测试对话尝试完整 A→B 一次。失败时只修复第一个实际阻塞，优先复用 Controller、Page、Host 和正式网页适配能力，不建立第二个任务执行器或安装系统。保护 main 上其他人的修改、w​​atcher 和临时 Profile，不创建分支、Worktree、PR，不强推。最终分别汇报 SOURCE_IMPLEMENTED / NODE_PASS / CHROME_PASS / FAILED / BLOCKED / NOT_TESTED，给出本轮的真实网页与持久结果证据。
