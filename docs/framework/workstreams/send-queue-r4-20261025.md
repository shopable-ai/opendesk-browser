# Send Queue R4 — 独立 Page Program 工作流

- 日期：2026-10-25
- 仓库：`shopable-ai/opendesk-browser`；**只写 `main`**
- owner：本 Send Queue 执行会话；其他并行 Agent 的原有 Page 程序、Prompt Shortcuts、Scroll Navigation、Mind Map、统一 UI 与宿主 `src/` 全都只读。
- **本轮业务写入**：`examples/programs/chatgpt-send-queue/{package.json,src/main.js,src/site.js,src/engine.js,src/view.js,assets/queue.css,tests/engine.test.mjs,README.zh-CN.md}`；唯一进度记录就是本文件。
- 执行模式：GitHub main 远程源码编辑。当前没有用户 Mac 本地仓库写入、真实已登录 Chrome/Profile、`npm run dev` watcher 访问权；不能宣称原生验收。
- 已读取：最新 `AGENTS.md`、公开 Page USER_SCRIPT / `@opendesk/ui` API、Page Schema、页面增强现有程序；R3 HTML 从用户文件库只读恢复，没有覆盖原型。
- 目标能力：页面内存队列；唯一原生编辑器保守探测；两阶段填入/点击；单次官网点击 + 新增用户消息回读确认；下一轮 AI 明确完成栅栏；提前停止须用户确认；未知停止/发送不自动重试；原生输入宽度前后检查；受管 UI 生命周期。
- 验证等级：静态语法快检 + 纯 JavaScript 状态机模拟仅属于开发期间的初步自检；尚未在用户 Mac 运行仓库 Node 测试和安装测试，不能把测试文件存在等同于 PASS。
- 不足：刷新/扩展重载恢复需要公开可信持久化能力，当前 Page USER_SCRIPT 不持有经审计的私有安全存储；不能将聊天消息明文保存到网站本地存储。目标 ChatGPT 编辑器、React 节点、按钮位置、Stop/Send 真实事件兼容性都需实测。
- 下一步：本地 Codex 针对已登录 ChatGPT 在测试对话连续两次真实发送；最优先核实 `src/site.js` 网站适配、`src/view.js` 按钮及队列的宽度/圆角，保存真实回执后再做定向回归。真实网站、正式安装、升级、停用及撤权全部 `NOT_TESTED`。

## R4.2 编辑语义精简（2026-10-25）

**产品纠偏**：不建立队列内嵌编辑器。点击某条「编辑/取回输入框编辑」后，若官网原输入框完全空白、无附件、会话身份保持且该条未处于发送中或 unknown，则将正文写回原生输入框；读回确认一致后，才把该条从待发队列删除。用户随后可在原输入框修改、手动发送，或再按蓝色按钮重新排队。

已有草稿（含空白字符）、附件、会话切换、输入控件替换、无法写入/读回或发送结果未知均**不移除队列项**；可能部分写入时保守暂停队列，避免重复发送。编辑不是删除真实 ChatGPT 对话，也不是点击后直接发送。

**修改范围**：仅 Send Queue 自有 `src/main.js`、`src/site.js`、`src/engine.js`、`src/view.js`、`tests/engine.test.mjs`、工具 README 和本记录。HTML 原型另在对话生成附件，不批量增加仓库原型版本。原生 ChatGPT 实际 DOM/React、正式安装和两轮真正自动发送仍为 **NOT_TESTED**。离线 Chromium 仅验证 320/360/400/440/700px 的队列取回、草稿保护、无横向溢出、宽度一致与 0px 间距，不得转为原生 PASS。

## R4.3 Mac 本地执行（2026-10-25）

- owner：Codex `01a17314-6b91-7c91-84af-bd4e059a7052`，源码阶段 `SOURCE_IMPLEMENTED`；本节取代上方旧会话“没有 Mac 访问权”的环境观察。用户最新明确“先完成源码，稍后做浏览器验收”，本轮不再操作 Chrome 或进入正式安装阶段。
- 起始 main：`52d44595cfa9d4becf8196cb72c83ec55784701d`；安全 fast-forward 到 `eb6d21f890095e3539c2d70a6881bb1e980db7df`。Send Queue 仍为 `8c79c1545`，未重做已有实现。其他 dirty 文件均不属于本业务，保留。
- 写入范围：本目录 `src/{engine,site,main,view}.js`、`assets/queue.css`、业务定向测试、README 及本记录；共享 SDK/Host/React/Prompt Shortcuts 不写。
- 环境：日常 Chrome / OpenDesk Developer `0.1.0`，真实扩展 ID `ccfcjegpkdlgbclopjmadlcjedelidmf`。只读核对 Chrome 已加载路径为 `/Users/shopme/Documents/workspace/opendesk-browser/dist/development`，Native allowed_origins 与 ID 一致。现有 `npm run dev` PID 36366 保留，未启动第二 writer；浏览器 serve 握手未验证，不能确认持续更新已连通，也不是 production 验收包。
- 已执行 `opendesk browser dev examples/programs/chatgpt-send-queue`：Native 已连接、目录身份确认、源码 Provider 注册；工作区 `workspace-d0396a74-5f2c-1ef5-34e2-63e86673061d`。仅注册，不是 Run 或发送证明。
- P0 首次尝试：真实已登录 Chrome，独立测试标签和窗口；已有测试对话脱敏 `c/6addec21…639` 停在“正在加载 ChatGPT 对话”，添加附件禁用。开发页已打开但尚未选择并 Run 本项目，队列按钮尚未出现。官网根页存在其他任务的非空草稿，未覆盖、未发送。浏览器 DOM 控制两次 30s 超时，原生 UI 又被其他前台操作切换到 OpenAI Platform；暂停争用前台资源。**A/B 发送 `BLOCKED`，未执行任何 Send Queue 发送点击。运行 candidate/sourceHash 尚无。**
- 接入收尾：临时 CLI session 返回 `E_NATIVE_NOT_READY` 并退出；以上 Provider/目录绑定仅为当时观察，后续验收须重新接入并读回 Authority，不得复用为有效 Run 证据。没有停止或重启其他会话 watcher。

### 本轮源码结果与证据

- `src/engine.js`：`await-native-ready` 暂停后不调用 commit；已点击后的暂停继续只读确认，页面失联或会话离开达到确认期限转 unknown，禁止重试。空白原生草稿也阻止准备发送。
- 独立反方审查证实两个额外源码缺口：确认后队列空/删除最后一条会清掉回复栅栏；停止失败未关联 item 会永久锁死且无法人工恢复。回归先得到 24 项中 18 过/6 失败，再修复为确认后始终保留栅栏和原会话，直到新助手回复明确完成；停止 false/throw 均锁定所选 item，人工核对删除后仍暂停。`src/main.js` 也在空队列仍有栅栏时保留官网手动 Stop 暂停监听。
- `src/site.js`：准备、提交、取回、确认均精确比较正文；不再 trim/NBSP 替换/删末尾换行来掩盖丢失。严格比较可能保守拒绝官网特殊空白，真实编辑器行为未验证。
- `src/view.js` / `assets/queue.css`：第一行恢复编号，正常行无暂停按钮；复用 Shift+蓝色按钮主动暂停和状态区恢复，unknown/已点击待确认无一键继续。恢复 UI 的渲染缓存包含 inFlight/phase。未改官网布局算法；现有仅 form 的宽度守卫不能证明原生编辑器未缩窄。
- 定向测试：`tests/engine.test.mjs` 24/24，`tests/site.test.mjs` 6/6；后者仅明确 DOM stubs 契约测试，不证明官网选择器或 React 输入接收。四个源文件 `node --check` 通过；项目校验为 `AUTHORING_VALID_NOT_PACKAGED` / `installable:false`。未运行无关全仓测试、Program 构建或正式安装。
- 独立只读 delta 复审确认上述两处缺口已解除，5 个内存探针通过，未发现新增安全问题；这不是官网或撤权证据。恢复可由用户明确的恢复或提前发送动作发起，均仍受原会话/unknown/回复栅栏限制，不会自动解除暂停。
- 本机忽略产物 `artifacts/send-queue-r43-01a17314/{validation,source-evidence}.json` 保存命令回执与逐文件 SHA。当前源码清单指纹 `e34cdc19971b2255c7f4ae51eaa7a2b727ae313f139e011023d14e67c61ec775`；它**不是**运行 revision.sourceHash，也不是安装 candidate SHA。运行 previewId/sourceHash/candidate 均无。
- 官网 A→B、编辑取回单条/非首条、暂停安全实测、320/360/400/440px/桌面/200% 的 form+editor+queue 实测，以及正式安装/停用/恢复/升级/撤权/卸载全部 `NOT_TESTED（用户延期）`。初次入口 `BLOCKED` 不改写为源码或真实发送 PASS。七项专家维度 UX/前端架构/浏览器扩展安全/业务正确性/异常恢复/可维护性/反方审计均 `NOT_SCORED`，不计算综合分。
- 唯一下一优先任务（浏览器阶段恢复时）：在可独占操作的原测试对话重新绑定并明确 Run 本地项目，记录实际 sourceHash、会话和消息 DOM 身份，完整验证一次真实 A→B；按首个实际失败做最小修复。其他正式验收继续排在核心链路之后。
