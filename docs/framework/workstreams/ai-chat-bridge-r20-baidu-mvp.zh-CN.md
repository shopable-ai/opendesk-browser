# AI Chat Bridge R2.0 · 百度搜索 MVP（操作及验收）
 
本产品在官方 ChatGPT 网页上呈现一个 OpenDesk 受信小面板。ChatGPT 的 JSON 回复只是任务候选；真正的网站权限、已安装 Task、运行和结果交付由现有 OpenDesk Foundation/Controller/RunHost/Authority 核验。它不是原生 MCP 工具。

## 一屏操作（Chrome 桌面）

1. 打开安装了开发版 OpenDesk Browser 的 Chrome，在扩展按钮或工具栏入口开启 OpenDesk 侧边栏，确保与 ChatGPT 是**同一个浏览器窗口**。进入 https://chatgpt.com 并打开或创建一个正式对话；地址必须包含 `/c/会话ID`，不是首页的空白草稿。
2. 在 ChatGPT 页面右上方的「OpenDesk · 浏览器任务」小面板内，选择「百度搜索前三条」。输入「搜索关键词」（默认样例为 `OpenDesk Browser`），点击「建立请求」。
3. 请求文本会填到官方 ChatGPT 输入框，**由用户在官网发送**；扩展不会在建请求时直接提交。如果输入框有草稿、附件、IME 正在输入或官网还在回复，会阻止填入并提示，不覆盖用户内容。
4. **模式 A（手动）**：官网完整回复一个严格匹配的任务候选后，点击 OpenDesk「执行」。**模式 B（一次自动）**：发送请求后、等待 AI 生成候选期间点击「批准本次自动执行」；匹配的完整候选出现后，扩展自动执行一次，无需再点击执行。
5. OpenDesk 以新建 owned tab 进入 `https://www.baidu.com/s?wd=已编码关键词`，只运行已安装固定版本的 `baidu.search.top3@1.0.0`，按保守 DOM 规则过滤广告和不可确认的结果，最多读取三条标题、摘要与链接；不足三条则只返回实际条数。
6. 成功取得确定的 Run/Result、资源释放、来源/请求/安装身份与一次性批准复核后，结果会作为**一条新增用户消息**写回原 ChatGPT 对话；官网 AI 基于该真实结果续答。搜索结果文本只作为未经信任的数据，不是模型可遵循的指令。

## 安装准备及状态

- 两个允许的任务：`page.read.fixed@1.0.0` 和 `baidu.search.top3@1.0.0`。二者必须**分别**经过原 Task Catalog 导入、同源真机验证、标记 Available、安装固定版本、保持 Enabled。一个已安装不代表另一个已安装；Candidate 不会自动成为 Available。
- 百度只允许精确 `https://www.baidu.com` origin，原对话只允许 `https://chatgpt.com`；Chrome 站点访问权限与 Task 安装授权互不替代。用户撤权或安装变更立即禁止新执行/结果发送。
- 面板显示成功且官方对话收到结果：确定送达。百度 `success` 可能只有 1–3 条；`no_results` 说明网页未找到结果；`blocked` 说明验证码/风控；`dom_unavailable` / `dom_changed` 说明搜索区域不可用/结构变化。不会绕过验证码。
- `E_BRIDGE_INSTALL` / `E_BRIDGE_PERMISSION`：先检查受信安装、任务启用及 Chrome 站点权限；`E_BRIDGE_CONTEXT`：模型候选和用户选择的关键词不一致；`E_BRIDGE_SEND_UNKNOWN` 或 `E_CHAT_DELIVERY_UNKNOWN`：结果发送未得到确定回执，不可对相同请求再次执行或再次发送，应人工检查原对话。
- 固定网页读取留作第二个可选择任务及 R1.2 回归样例。完成一个请求后可新建请求；每次新请求必须产生新的 Worker nonce，旧的批准不能复用。

## 证据口径

`tests/environment/chatgpt-baidu-bridge-r20.test.mjs` 与 R1.2/R1.3 相关测试仅证明 Node/组件合同，不代表真实百度 DOM、Mac Chrome 安装、网站权限或官网 AI 续答通过。完整 MVP 仅在真实 Mac Chrome 中取得百度场景 A/B 的 runId、resultId、原会话送达证据后可标记验收通过。未实测一律写 `NOT_TESTED`。
