# OpenDesk Send Queue · ChatGPT 网页增强

Program ID: `opendesk.chatgpt-send-queue` · `page-userscript` · `USER_SCRIPT` · 范围仅 `https://chatgpt.com/*` · 版本 `0.1.0`。

## 目标与真实功能边界

这是独立 Page Program。**不是** Prompt Shortcuts、OpenDesk 自身 `src/ui/react/components/conversation.tsx`、Chrome 独立扩展或 ChatGPT API 客户端。正式包为本目录的 `opendesk.chatgpt-send-queue.opendesk-page.json`，通过 OpenDesk「扩展 → 导入」审阅身份、版本及网站范围后安装，归「网页增强」。2026-10-25 已在专属 Mac CFT 完成核心发送与正式 Page 安装；证据范围见文末。

S01：官网正在回复时，用户继续输入并点击蓝色队列按钮两次；原生草稿分别进入同一对话的内存队列。等待网站显示回复完成、原生发送控件变为安全可用、输入框无他人草稿后，先填入消息，下一轮重新核对网页与按钮，再**只点击一次**；准确找到一个新增用户消息节点才能认定确认。下一条要等待新的助手回复节点明确结束后继续。队列不通过私有网络端点、cookie、模拟官方 API 或后台配额发送。

S02：**点击编辑＝取消这条消息的排队，并把正文取回 ChatGPT 原生输入框**；用户在原输入框继续修改，可手动发送或重新点击蓝色按钮入列。队列不出现第二个编辑框、保存/取消操作或隐藏编辑状态。只有原生输入框完全空白且无附件、当前会话一致、目标消息非发送中/unknown 时才能取回；否则保留原草稿和队列并提示，不强行覆盖。原有删除、键盘 `Alt+↑/↓` 重排、展开第三条以后和提前发送保持；忙碌时提前发送须确认停止，停止或发送不明时拒绝自动重试。

R4.3：每行左侧只显示编号，正常队列没有逐条暂停按钮。`Shift + 点击蓝色按钮` 可主动暂停/恢复；可恢复的暂停在状态提示区显示小型恢复按钮。unknown 或等待已点击结果确认时，不显示恢复操作；任何入口都不能绕过 unknown。暂停在填入后、原生点击前也生效；已经点击的消息仍继续只读确认或进入 unknown，不能回退成“尚未发送”。

确认发送后，即使队列暂时清空，也保留原会话与新一轮回复完成栅栏；此时再次入列不能借用旧回复完成状态。停止结果不明会关联到所选消息；人工核对原对话并确认删除该条后，剩余队列仍暂停，须显式恢复。

R4.4：下一条必须对应刚确认的唯一用户消息和其后的唯一新助手回复，历史节点被替换或多出其他轮次时保守等待。写入前、聚焦后和原生点击前重新核对输入框身份、完整草稿、附件及输入法状态。固定桥持有公开 `data-opendesk-composer-owner` 标记时，队列拒绝操作；该标记仅能阻止队列，不提供执行权限。固定桥的可信适配器由其自身目录维护，不再引用本项目业务源码。

S03：只在已打开的 `chatgpt.com/c/<id>` 对话内尝试发送；身份不唯一、站点 DOM 改动、输入框包含附件/原生草稿、会话切换、原生发送结果未知，均不猜测，不补发。队列最多 20 条、单条 8192 字符。

### 视觉和网页安全

沿用 R3 紧凑视觉方向：与输入框上方连体、0px 垂直间距、1px 分隔、35px 行高、默认只显示两条、无文字标题栏、蓝色皇冠为样式标志且明确不表示官方认证/VIP。插入前后检查官网 `form` 宽度不缩窄，否则隐藏并暂停；不覆盖原生停止/发送按钮，也不改 Prompt Shortcuts 只填草稿的合同。本轮按正常窗口验证实际操作，不执行宽度或缩放专项矩阵。

### 安全与持久化限制

队列仅存于当前 Page USER_SCRIPT **内存**。不会把私人聊天消息写入 ChatGPT 网站可读的 `localStorage` 或 `sessionStorage`。`beforeunload` 请求浏览器警告；刷新、扩展重载、页面意外消失后 **队列无法恢复**。这是尚未解除的 R4 缺口，需经过审计的持久化公开能力才能交付跨刷新恢复；不得另造 Host。当前版本建议只排队短时需要发送、可重新输入的内容。

发送/停止以 DOM 操作驱动；如果站点使用不可控原生事件校验、编辑器阻止合成输入、布局改变、网页本身禁用发送，保守停止而不是绕过。未知点击后的队列项保留为 `unknown`；用户检查历史后才手动删除；不得自动继续。原生草稿含空白字符也会阻止自动填入；仅把富文本编辑器的空文档 `<p><br></p>` 识别为空，不用 trim、NBSP 替换或删除末尾换行掩盖内容变化。官网对特殊空白的实际行为尚未验证；无法准确读回时保守停止，不认定发送成功。

### 开发和验证

~~~bash
cd /Users/shopme/Documents/workspace/opendesk-browser
node --check examples/programs/chatgpt-send-queue/src/main.js
node --check examples/programs/chatgpt-send-queue/src/site.js
node --check examples/programs/chatgpt-send-queue/src/engine.js
node --check examples/programs/chatgpt-send-queue/src/view.js
node --test examples/programs/chatgpt-send-queue/tests/*.test.mjs
node scripts/validate-program-project.mjs examples/programs/chatgpt-send-queue
~~~

本地多文件接入：`opendesk browser dev "$PWD/examples/programs/chatgpt-send-queue"`，从「开发」明确在有授权的 ChatGPT 页面执行；项目的 `main()` 返回 `programId/status/runtime/persistence`，只是求值结果，不等于完成发送。冻结候选时才执行 `npm run build:program -- examples/programs/chatgpt-send-queue`，导入/验证/安装沿当前 `opendesk-program-publish` Skill，不添加第二安装器。

人工验收时，使用无敏感内容语句，仅在专属测试对话尝试；记录浏览器/扩展身份、程序 SHA、实际消息与回复完成信号、原生发送与停止状态及截图。切勿把 Node 模拟、R3 HTML 模拟视为真实成功。

Status (2026-10-25, R4.4): `CORE_NATIVE_PASS / PAGE_INSTALLED`，版本 `0.1.0`、r1，固定源码 SHA-256 `08e7f0bcd98b8bcf78cfd32a62ea928460a3408806686aab4a484da4d916f367`。43 项定向 Node 测试通过。真实 ChatGPT A2/B2 各发送一次；A3/B3 同时入队，A3 回复期间 B3 等待，完成后 B3 才发送。相同源码已在专属 CFT 正式安装，自动运行、停用清理、恢复后新文档自动运行及编辑取回/原生草稿保护均有实际证据。安装只在该临时 Profile，未安装到日常 Chrome。当前浏览器包早于固定桥适配器解耦，**新桥与队列同时交付的原生竞态、升级/卸载、真实 IME 和特殊空白仍未验证**；跨刷新队列恢复尚不支持。本轮不是 production 全量验收。详见[唯一 workstream](../../../docs/framework/workstreams/send-queue-r4-20261025.md)。
