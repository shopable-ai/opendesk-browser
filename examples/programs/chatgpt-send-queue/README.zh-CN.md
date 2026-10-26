# OpenDesk Send Queue · ChatGPT 网页增强

Program ID: `opendesk.ai-send-queue` · `page-userscript` · `USER_SCRIPT` · 范围仅 `https://chatgpt.com/*` · 版本 `0.1.3`、r2（新身份）。

## 新身份与旧安装并存（2026-10-26）

`opendesk.ai-send-queue` 从 0.1.2/r1 开始采用独立安装身份；R5.5 源码升级为 0.1.3/r2。该身份，须通过原 Page 安装入口单独审阅。旧正式包 `opendesk.chatgpt-send-queue.opendesk-page.json`（旧身份 0.1.2/r4）保留只读，不迁移旧安装、授权或内存队列。业务模块、样式、资源与网站范围沿用原实现。

新旧身份原本可分别挂载生命周期并驱动发送。新入口发现旧活动生命周期标记时返回 `status: skipped` / `reason: legacy-active`，不创建队列或 UI；若旧生命周期稍后出现，新实例在下一次轮询或用户操作前只销毁自己的资源，不调用旧清理、不清空、不复制或接管旧队列。标记只用于保守阻止运行，不授予权限。局部视图 ID 保留原样，不代表安装身份或授权迁移；退出后不自动重启。请先人工处理旧队列，再通过原安装管理入口停用旧安装，在新文档使用单独获批的新安装。此保护不证明任意旧版本或不同执行世界的原生并存安全。

0.1.2/r1 历史版本的 5 项身份/生命周期定向 Node 测试、入口语法、项目校验、原打包器格式/哈希与候选同源检查通过。新包 `sourceHash: 01cad4e3f16f843aea6fe722c7989b4860ea11412a3f5cb6d22c4c714bcd31f1`，`packageHash: 0cc2ab295f0141b53f2351215122f05632d07f7d1dd565de55c58d81311d8441`。仅验证新身份、旧生命周期避让、包格式及哈希；不重跑 FIFO 全套，不操作浏览器。离线候选输出位于 `artifacts/ai-four-products-r126-content-20261026/queue-candidate/`，使用原 `npm run build:program` 与 `scripts/build-page-install-package.mjs`。原生安装、自动运行、发送、站点并存及撤权均为 `NOT_TESTED`。

## R5.5 · 正式源码清空安全补丁（2026-10-26）

新源码在原生草稿写入/清空后，重新确认活动会话、form、editor、附件、输入法和原始草稿的完整读回。若网页在 input 事件后替换编辑器、恢复草稿、部分写入或抛出异常，**不将草稿加入可发送队列**，暂停队列，并在现有按钮提示区域保留未入队原文的显式复制入口；浏览器拒绝 Clipboard API 时允许手动选择复制。恢复备份仅保留当前页面内存，刷新会丢失；不会上传或静默存储私人内容。

入队前执行只读容量、长度、会话校验，队列已满不先清空官网输入框。新旧 Program ID 继续隔离。0.1.3/r2 的正式编译包、真实安装、同 ID 升级与官方 ChatGPT 发信回归必须以 CI 构建和真实 Mac Chrome 证据分别确认，不能将隔离单测当作原生 PASS。

## 目标与真实功能边界

这是独立 Page Program。**不是** Prompt Shortcuts、OpenDesk 自身 `src/ui/react/components/conversation.tsx`、Chrome 独立扩展或 ChatGPT API 客户端。新独立正式包为本目录的 `ai-send-queue.opendesk-page.json`，通过 OpenDesk「扩展 → 导入」审阅身份、版本及网站范围后安装，归「网页增强」。新身份未在 Chrome 安装或运行，原生证据为 `NOT_TESTED`；文末旧身份的历史证据不适用于新包。

S01：官网正在回复时，用户继续输入并点击蓝色队列按钮两次；原生草稿分别进入同一对话的内存队列。等待网站显示回复完成、原生发送控件变为安全可用、输入框无他人草稿后，先填入消息，下一轮重新核对网页与按钮，再**只点击一次**；准确找到一个新增用户消息节点才能认定确认。下一条要等待新的助手回复节点明确结束后继续。队列不通过私有网络端点、cookie、模拟官方 API 或后台配额发送。

S02：**点击编辑＝取消这条消息的排队，并把正文取回 ChatGPT 原生输入框**；用户在原输入框继续修改，可手动发送或重新点击蓝色按钮入列。队列不出现第二个编辑框、保存/取消操作或隐藏编辑状态。只有原生输入框完全空白且无附件、当前会话一致、目标消息非发送中/unknown 时才能取回；否则保留原草稿和队列并提示，不强行覆盖。原有删除、键盘 `Alt+↑/↓` 重排、展开第三条以后和提前发送保持；忙碌时提前发送须确认停止，停止或发送不明时拒绝自动重试。

R4.3：每行左侧只显示编号，正常队列没有逐条暂停按钮。`Shift + 点击蓝色按钮` 可主动暂停/恢复；可恢复的暂停在状态提示区显示小型恢复按钮。unknown 或等待已点击结果确认时，不显示恢复操作；任何入口都不能绕过 unknown。暂停在填入后、原生点击前也生效；已经点击的消息仍继续只读确认或进入 unknown，不能回退成“尚未发送”。

R4.7：当队列只是在等待上一条 AI 回复结束时，不再显示额外的等待文案，也不保留空白状态栏。准备发送、等待官网确认、主动暂停和 unknown 仍显示实际原因；原有等待栅栏、FIFO 顺序与未知结果禁止自动重试的安全规则不变。

确认发送后，即使队列暂时清空，也保留原会话与新一轮回复完成栅栏；此时再次入列不能借用旧回复完成状态。停止结果不明会关联到所选消息；人工核对原对话并确认删除该条后，剩余队列仍暂停，须显式恢复。

R4.4：下一条必须对应刚确认的唯一用户消息和其后的唯一新助手回复，历史节点被替换或多出其他轮次时保守等待。写入前、聚焦后和原生点击前重新核对输入框身份、完整草稿、附件及输入法状态。固定桥持有公开 `data-opendesk-composer-owner` 标记时，队列拒绝操作；该标记仅能阻止队列，不提供执行权限。固定桥的可信适配器由其自身目录维护，不再引用本项目业务源码。

S03：只在已打开的 `chatgpt.com/c/<id>` 对话内尝试发送；身份不唯一、站点 DOM 改动、输入框包含附件/原生草稿、会话切换、原生发送结果未知，均不猜测，不补发。队列最多 20 条、单条 8192 字符。

### 视觉和网页安全

沿用 R3 紧凑视觉方向：与输入框上方连体、0px 垂直间距、1px 分隔、35px 行高、默认只显示两条、无文字标题栏、蓝色队列按钮斜戴独立透明 WebP 游戏皇冠（80×60，4KB，无背景），仅为装饰且不表示官方认证/VIP。插入前后检查官网 `form` 宽度不缩窄，否则隐藏并暂停；不覆盖原生停止/发送按钮，也不改 Prompt Shortcuts 只填草稿的合同。本轮按正常窗口验证实际操作，不执行宽度或缩放专项矩阵。

### 安全与持久化限制

队列仅存于当前 Page USER_SCRIPT **内存**。不会把私人聊天消息写入 ChatGPT 网站可读的 `localStorage` 或 `sessionStorage`。`beforeunload` 请求浏览器警告；刷新、扩展重载、页面意外消失后 **队列无法恢复**。这是尚未解除的 R4 缺口，需经过审计的持久化公开能力才能交付跨刷新恢复；不得另造 Host。当前版本建议只排队短时需要发送、可重新输入的内容。

发送/停止以 DOM 操作驱动；如果站点使用不可控原生事件校验、编辑器阻止合成输入、布局改变、网页本身禁用发送，保守停止而不是绕过。未知点击后的队列项保留为 `unknown`；用户检查历史后才手动删除；不得自动继续。原生草稿含空白字符也会阻止自动填入；仅把富文本编辑器的空文档 `<p><br></p>` 识别为空，不用 trim、NBSP 替换或删除末尾换行掩盖内容变化。官网对特殊空白的实际行为尚未验证；无法准确读回时保守停止，不认定发送成功。

**已复现的长对话限制**：官网已收到消息并回复后，DOM 用户消息数量仍可能不满足「发送前数量 + 1」，队列会保守进入 unknown。本轮诊断明确命中数量校验；是否由虚拟化或历史加载引起尚未证明，未放宽历史身份校验。短会话 A→B→C 通过不代表任意长度对话均可连续运行。出现该提示时先核对原对话，不能再次点击原生发送或自动重排重试。

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

旧身份历史记录（不证明新身份 PASS）

Status (2026-10-26, R4.7 UI-only): 源码与正式 Page 安装包 r4 已同步去除正常回复等待时的冗余提示和空状态行；正式包固定源码 SHA-256 `2773494e95d343d2002022683921523c2be9b72b5720e4eb14023ad3ab789020`，仅变更展示条件，未修改发送引擎。r4 尚未在真实 Mac Chrome 安装或运行本地 Node 测试，标记 `NOT_TESTED`；以下为 r3 历史验收证据，不可自动视为 r4 PASS。

Status (2026-10-26, R4.6 历史记录): `CORE_ABC_NATIVE_PASS / PAGE_UPDATED_WITH_LIMITATIONS`，版本 `0.1.2`、r3，固定源码 SHA-256 `68a73289c820fade777168230b7a60272f2d629cb16f4fd13b52dabe5c1804d4`。43 项定向 Node 测试通过。专属 CFT 的同一轮复杂 A 生成时 B/C 分别入列并同时显示等待；A 明确完成后 B 才入站，B 生成时 C 继续等待；最终三条各一次，C 回复完成，队列及草稿为空，无 unknown。两段等待与最终状态均保存原生截图。A 的完成依据为官网完成操作与后续受控交接，模型未输出所要求的 END 标记，不宣称模型完整遵循了题目。

已通过既有 Page 更新审阅由 r1→r2→r3，原安装身份、网站范围与 `page.dom` 不变。正式包与真实安装候选逐字节一致；安装仅在原专属临时 Profile，日常 Chrome 未安装。R4.4 的自动运行、停用/恢复及编辑保护保留为其对应候选的历史证据。**长对话数量校验限制仍存在；新桥与队列同时交付的原生竞态、卸载、真实 IME 和特殊空白仍未验证**；跨刷新恢复尚不支持。本轮为原静态开发宿主的核心验证，不是 production 全量验收。详见[唯一 workstream](../../../docs/framework/workstreams/send-queue-r4-20261025.md)。
