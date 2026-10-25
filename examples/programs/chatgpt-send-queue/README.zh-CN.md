# OpenDesk Send Queue · ChatGPT 网页增强

Program ID: `opendesk.chatgpt-send-queue` · `page-userscript` · `USER_SCRIPT` · 范围仅 `https://chatgpt.com/*` · 版本 `0.1.0`。

## 目标与真实功能边界

这是独立 Page Program。**不是** Prompt Shortcuts、OpenDesk 自身 `src/ui/react/components/conversation.tsx`、Chrome 独立扩展或 ChatGPT API 客户端。正常安装需通过 OpenDesk 已有「扩展 → 网页增强」候选、验证、安装与网站权限审阅。未获得真实已登录 ChatGPT DOM 和安装证据前，不宣称「已经可用」。

S01：官网正在回复时，用户继续输入并点击蓝色队列按钮两次；原生草稿分别进入同一对话的内存队列。等待网站显示回复完成、原生发送控件变为安全可用、输入框无他人草稿后，先填入消息，下一轮重新核对网页与按钮，再**只点击一次**；准确找到一个新增用户消息节点才能认定确认。下一条要等待新的助手回复节点明确结束后继续。队列不通过私有网络端点、cookie、模拟官方 API 或后台配额发送。

S02：列项可编辑、删除、键盘 `Alt+↑/↓` 重排，展开第三条及以后；第一行左侧暂停/恢复，右侧提前发送、编辑、删除 SVG 操作。原生回复进行中提前发送，会弹出确认，并通过 ChatGPT 原生停止控件停止；停止不明则进入 `unknown`，拒绝自动重试。

S03：只在已打开的 `chatgpt.com/c/<id>` 对话内尝试发送；身份不唯一、站点 DOM 改动、输入框包含附件/原生草稿、会话切换、原生发送结果未知，均不猜测，不补发。队列最多 20 条、单条 8192 字符。

### 视觉和网页安全

沿用 R3 紧凑视觉方向：与输入框上方连体、0px 垂直间距、1px 分隔、35px 行高、默认只显示两条、无文字标题栏、蓝色皇冠为样式标志且明确不表示官方认证/VIP。插入前后检查官网 `form` 宽度不缩窄，否则隐藏并暂停；不覆盖原生停止/发送按钮，也不改 Prompt Shortcuts 只填草稿的合同。真正的四档窄屏、缩放、ChatGPT React 布局需用户 Mac Chrome 验收，Node 不能证明。

### 安全与持久化限制

队列仅存于当前 Page USER_SCRIPT **内存**。不会把私人聊天消息写入 ChatGPT 网站可读的 `localStorage` 或 `sessionStorage`。`beforeunload` 请求浏览器警告；刷新、扩展重载、页面意外消失后 **队列无法恢复**。这是尚未解除的 R4 缺口，需经过审计的持久化公开能力才能交付跨刷新恢复；不得另造 Host。当前版本建议只排队短时需要发送、可重新输入的内容。

发送/停止以 DOM 操作驱动，尚未取得真实网站兼容性证明；如果站点使用不可控原生事件校验、编辑器阻止合成输入、布局改变、网页本身禁用发送，保守停止而不是绕过。未知点击后的队列项保留为 `unknown`；用户检查历史后才手动删除；不得自动继续。

### 开发和验证

~~~bash
cd /Users/shopme/Documents/workspace/opendesk-browser
node --check examples/programs/chatgpt-send-queue/src/main.js
node --check examples/programs/chatgpt-send-queue/src/site.js
node --check examples/programs/chatgpt-send-queue/src/engine.js
node --check examples/programs/chatgpt-send-queue/src/view.js
node --test examples/programs/chatgpt-send-queue/tests/engine.test.mjs
node scripts/validate-program-project.mjs examples/programs/chatgpt-send-queue
~~~

本地多文件接入：`opendesk browser dev "$PWD/examples/programs/chatgpt-send-queue"`，从「开发」明确在有授权的 ChatGPT 页面执行；项目的 `main()` 返回 `programId/status/runtime/persistence`，只是求值结果，不等于完成发送。冻结候选时才执行 `npm run build:program -- examples/programs/chatgpt-send-queue`，导入/验证/安装沿当前 `opendesk-program-publish` Skill，不添加第二安装器。

人工验收时，使用两条无敏感内容测试语句，仅在测试对话尝试；记录真实网站 URL（脱敏）、浏览器/扩展身份、程序 SHA、用户消息新增节点数、每轮回复完成信号、原生发送与停止状态、队列与输入框实测宽度和截图。切勿把 Node 模拟、R3 HTML 模拟视为真实成功。

Status (2026-10-25): `SOURCE_CANDIDATE`；真实 Mac Chrome、官方 ChatGPT 双消息成功、正式安装/升级/停用/撤权均为 **NOT_TESTED**，细节见专属 workstream。
