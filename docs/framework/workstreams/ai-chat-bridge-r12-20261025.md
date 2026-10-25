# OpenDesk Browser — AI Chat Bridge R1.2 固定网页闭环增量

## 原始目标（不得漂移）
在官方 ChatGPT 现有对话中提出 `opendesk.task.request.v1`，由用户明确点击执行或批准一次自动触发，调用唯一 Foundation Authority + 已有 RunHost 的已安装 `page.read.fixed@1.0.0`，在独立目标 Tab 读取 `https://httpbingo.org/html`，取得 Durable Result，经受信页面单次原生发送后验证消息真正出现在原对话，并观察官方 ChatGPT 下一次回复。

## R1.2 此次只做的增量
- 保留 R1.1 固定 Task、百度 Task、TaskWorkbench、Send Queue R4 的业务所有权及既有 Framework。
- `src/native-agent/chatgpt-bridge-trigger-gate.js`：可信 SW 签发 UUID 请求、一次性点击批准／单轮自动批准、短有效期、MV3 重启仍可核验的消费与撤销栅栏；不授权网站、任务安装或 RunHost。
- `src/native-agent/chatgpt-fixed-bridge-page.js`：官方 ChatGPT 的 ISOLATED 世界专用简单按钮；原生官网输入框插入请求文本，解析当前唯一完整 assistant 回复，防旧轮次／模型自称授权；自动执行仅在可信单次批准后触发；复用 Send Queue 的纯网站适配器，填入后唯一一次点击官网发送按钮，新用户消息精确回读，随后观察下一轮助手完成。没有新队列。
- `src/native-agent/chatgpt-fixed-bridge-host.js`：使用唯一侧栏 `foundationClient`／`scriptEditor.host`，核验 Available + Installed + Enabled、版本、SHA、安装授权代次及网站权限；`target.mode='owned'` 由现有 Controller Authority 创建独立目标网页，解码并验证真实持久 `resultId`／`runId`／`revision`／`sourceHash` 后经原 documentId 回传。结果未知绝不盲重放。
- 现有 `src/sw.js`／`src/ui/tool-shell.js` 上增量接线；新增一个固定受限 WXT ISOLATED 页面入口及 manifest 匹配，不改 SDK/Host/Provider 实现。
- 单元测试涵盖：错误来源、身份撤销、批准消费／重启防重放、版本和结果不匹配、一次 owned Task、权限拒绝、Stopped/Unknown、发送未知不重放。

## 状态和不能虚报的边界
- 固定 Task 的 R1.1 当前来源仍是 `SOURCE_CANDIDATE`；真实 `Available`／`Installed`／`Enabled` 为独立前置条件，不允许自动绕过。
- 本轮远端 GitHub 文件可作静态代码与语义隔离检查，但无法访问用户 Mac 工作目录、实际已登录官方 ChatGPT、加载中的 Chrome 扩展，也不能由单元模拟得出 `MAC_NATIVE_PASS`。
- 发送通过 ChatGPT 原生 DOM 适配器调用单次按钮，网站更新、React 输入框兼容与网页认证必须在原生 Chrome 验证；官方服务端未注册任何正式 MCP/OpenDesk 工具。
- 单次授权最多运行、发送、观察一轮；用户草稿、附件、IME 或轮次切换时保守拒绝。发送后只要回执模糊，禁止补发。
- 当结果已真实发送但 AI 回复超时或无法确认时，只能标注「用户消息已观察到，助手最终回复 NOT_TESTED／未确认」，不能宣称整条业务闭环 PASS。

## 最短验证
```bash
cd /Users/shopme/Documents/workspace/opendesk-browser
git switch main && git pull --ff-only origin main
node --test tests/environment/chatgpt-task-request-r1.test.mjs tests/environment/chatgpt-fixed-page-r11.test.mjs tests/environment/chatgpt-fixed-bridge-r12.test.mjs
npm run build
```
在已登录 ChatGPT 测试对话中安装并启用固定 Task 且完成真实网站授权：验证按钮与单次自动两条路径，各次只有一个 Run、一个 Result 和一条新增官网 user 消息，然后观察 assistant 真实续答；再测试两次快速点击、重复渲染、用户草稿／附件、停止／权限撤回、worker 重启、切换会话、发送结果未知；保留非敏感证据与状态等级。运行失败只做定位所需最小增量，不影响其他 Agent 修改。
