# 工作流真实 Codex 两轮核心复测

本手册用于验证：在真实 Mac Chrome 的 OpenDesk「工作流」中输入中文并发送，经本机 Codex、现有权限与 RunHost，在同一对话把测试网页姓名先改为“测试甲”、再改为“测试乙”，分别独立读取实际 DOM。仅整理经验、解释证据或修改本文时，不启动浏览器、模型、测试或构建。

这是开发阶段的固定冒烟用例。正式 production 验收、全量测试、评分及宽度／缩放专项按 [AGENTS.md](../../../AGENTS.md) 的当前阶段另行决定。通过本文用例不会自动启动这些后续事项。

最近一次实际结果见 [2026-10-21 本机记录](../workstreams/workflow-core-20261021.md)。按仓库归档规则，通用手册纳入版本管理，逐次运行记录和原始 artifacts 留在本机；其他机器缺少记录时不能假定证据可用。历史成功只适用于记录中的候选及范围，不能替代当前源码、安装包或 Chrome 的证据。

仅用户反馈界面的单轮实测另见 [2026-10-22 本机记录](../workstreams/workflow-feedback-20261022.md)，范围见本文“只复测用户反馈界面时”；它不替代上面的两轮续聊结果。

## 怎样判断“跑通”

以下条件同时成立，才能把本次两轮核心链记为通过：

| 要证明的行为 | 必须看到的证据 |
| --- | --- |
| 真实用户入口调用真实模型 | 真正 SIDE_PANEL 中的输入、可信发送及必要的真实权限审阅；本机 Codex 规划后产生方案。doctor 的 READY、模拟模型、普通扩展标签页或 AI 文字回复不能单独证明成功 |
| 第一轮执行 | 姓名的实际 `input.value` 为“测试甲”；固定 RunHost 读回结果 `matched=true`，持久 Run/Result 完成 |
| 同一对话第二轮执行 | 保留第一轮对话及当前 Codex 会话，发送第二句；姓名实际值为“测试乙”，再次取得独立的 Run/Result 和 DOM 读回 |
| 正确执行与结果身份 | 每轮 `runId/resultId` 相符，Run、Result 与该轮冻结源码的 `sourceHash` 一致；目标 tab/window/document/origin 可核对。两轮内容不同，源码哈希可以不同 |
| 没有提交、导航或重复执行 | 表单 submit 计数为 0，URL、`performance.timeOrigin`、document 身份未变；持久操作日志每轮仅一次填写，无额外点击／提交／导航。固定只读观察的 Run 与填写 Run 分开计数 |
| 运行已经结束 | 两轮均 `completed`、`workerRetired=true`、`retirementState=released`，释放记录不重复；RunHost 槽位无活动 Run。模型对话可空闲保留以便续聊，不把它误当仍在执行网页任务 |

DOM 读回应由浏览器驱动或测试人员直接读取目标网页，不从 AI 回复复制。输入框的 `innerText/textContent` 可能为空，应读 `input.value`；生成的提取文本步骤为空，不能抵消或替代真实值校验。

## 开始前：选当前入口和候选

1. 先查 [测试指南的证据复用规则](../testing-guide.md) 和对应记录。只有时间经过、换聊天或无关文件变化时，不重复已有效的测试。相关产品／驱动／模型／权限／构建输入变化时，记录变化，再选本轮需复测的操作。
2. 只读核对 `main`、未提交 diff，以及当前 Profile、浏览器 PID、服务端口与输出 owner。保留并行工作，不创建分支、worktree 或 PR。下列路径均从仓库根目录解释。
3. 日常源码开发复用既有 `npm run dev` 和 `dist/development`。核对 Chrome 实际加载路径、真实 extension ID、构建指纹、serve 进程与连接；只有「调试」Tab 或扩展内部“已连接”文案不够。不能覆盖他人的输出或擅自重启 watcher。详见 [持续开发说明](../extension-development-r131.zh-CN.md)。
4. 本轮若需隔离浏览器，复用已归自己管理的独立测试 Profile；核对 CDP 实际端口，不硬编码历史值。日常 Profile 和登录保持原状。静态开发包、持续开发、production 包的模式分别记录；共享热更新打断对话时，本次尚未完成的两轮不得算通过。
5. 核对实际 Native 可执行文件 owner、Chrome 扩展 ID 与 Native 配对、Codex 支持版本、登录和模型网络。doctor 就绪只证明连接前提，真实推理仍须由本次发送证明。版本支持以当前实现为准，不把历史的 0.159.2 固化为永久要求，也不放宽白名单制造通过。必要代理仅作用于自己的进程，不记录凭据。

开始实际运行后，在自己的证据目录记录 `IN_PROGRESS`、候选／资源 owner 和下一条操作。未知状态先只读对账，不自动重发可能已有副作用的任务。

## 固定页面与两句请求

使用 [标准测试页面](../../../examples/tasks/README.zh-CN.md)。先检查 43111 是否已有正确服务；仅在需要且未占用时启动：

```bash
python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/tasks
```

访问 `http://127.0.0.1:43111/demo-form.html`，把它设为当前网页，打开 Chrome 真正的 OpenDesk 侧边栏「工作流」，选择本机 Codex。不得用普通 `sidepanel.html` 标签页代替。自动驱动可结合 `chrome.runtime.getContexts({contextTypes:['SIDE_PANEL']})` 与 `chrome.tabs.getCurrent()` 核对上下文；单凭 URL 不能判断。

第一轮原文：

```text
请把当前测试网页中的姓名输入框填写为“测试甲”，然后读取输入框的实际值确认。不要提交表单，不要跳转页面。
```

第一轮完成并独立读回后，在同一对话发送第二轮原文：

```text
把刚才的姓名改成“测试乙”，再读取确认，不要提交，不要跳转。
```

沿原 Authority 审阅真实缺失权限。已有合法网页摘要授权时按原合同复用，不人为每轮撤销来强迫重复审阅。真实点击发送及权限按钮；不改写 `isTrusted`，不调用内部 planner、注入方案或手工改目标值冒充执行。

等待“网页执行结束与持久回执可读”，不能只等待“停止 AI”按钮消失：规划结束与 RunHost 执行结束是两个时刻。第一轮失败或结果未知时先分类，不继续发送第二轮掩盖失败。

## 独立观察与证据保存

运行前记录姓名初值、URL、`timeOrigin` 和目标 document。submit／input 观察器每个目标文档只注册一次；观察器只计数，不调用 `preventDefault` 改变产品行为。换文档后重新记录基线。重复注册的监听会让一次填写出现两条事件，不能据此宣称重复执行。

每轮结束后，用浏览器驱动只读目标页，例如 `target` 已由真实当前目标绑定时：

```js
const dom = await target.evaluate(() => ({
  name: document.querySelector('#name')?.value,
  url: location.href,
  timeOrigin: performance.timeOrigin
}));
```

同时读取现有 RunHost 的持久 Run／Result、技术身份与操作／释放记录，不修改数据库。用唯一 `locatorAction(fill)`、操作 `submissionCount=1` 和对应的只读 `inputValue` 回执判断执行次数；观察 Run 的数量和 input 事件数不能代替这项核对。

原始 JSON、日志和截图放在自己的 `artifacts/<本次工作流>/`，不把 Profile、端口、RunId 或哈希写死为下次默认值。每次保留：

- 环境与候选：运行模式、实际加载路径／ID／构建指纹、浏览器版本、Profile／PID／CDP owner；源码工作树与构建输入分别描述。
- 两轮：原请求、对话／宿主身份、目标 document、独立 DOM、submit／导航基线、RunId、ResultId、各自 sourceHash、完成／释放状态及操作次数。
- 结论：通过的具体操作、失败与未测项、原始证据路径及 SHA-256；后续源码是否已进入受测产物。
- 收尾：活动 Run 是否结束、自有浏览器／模型会话是否保留、共享服务归谁。断开 Playwright CDP 连接不等于浏览器进程退出。

在 `docs/framework/workstreams/` 保存一份简短的可追溯结论。`artifacts/` 默认不提交；如原始文件后来不可读，只保留历史结论并标证据不完整，不凭摘要给新候选补写 PASS。本次的 `drive.mjs`／收集脚本包含历史 Profile 和 RunId，仅是现场工具，不是已经交付的通用一键测试器。

## 故障分类与最小回归

### 只复测用户反馈界面时

若本轮只调整工作流的反馈文案或诊断展示，先查看真实侧边栏的历史消息、实际构建指纹与 dev 连接。旧消息里的模型来源和执行编号不能证明新源码仍有问题；源码已改也不能证明旧页面已经更新。记录原状态，再沿同一路径的开发更新流程加载本轮改动。

只需发送一轮明确的测试页填写请求，并独立读取实际 `input.value`、核对持久 Run/Result 与读回、未提交／未导航及释放状态。姓名应选与初值不同的测试值。此单轮 UI 复测不替代上面的两轮续聊验收，也不触发 production、全量回归或评分。

- 正常聊天优先说明填写了什么及核对结果，不出现 `local_codex`、工作流／Run／Result 编号。仅持久回执与输入读回均已验证时，才能显示“已填写……并核对输入值一致”；未确认的网页效果、失败和权限要求仍直接可见，不自动重放。
- 「AI 设置」中的来源显示为“本机 Codex”。关闭设置后焦点回到原入口。
- 「运行结果 → 诊断详情（模型来源与执行编号）」默认折叠。用键盘展开后，可读取本轮模型来源、工作流、Run/Result、源码与文档身份；再折叠，焦点保留在摘要，不能把另一轮编号误当本轮成功证明。
- 新结果只出现一条运行反馈；状态区可提示“可以保存工作流”，不重复堆叠成功说明。敏感或过长的输入值不回显到聊天；原有结果预览与按需原值查看仍保留。

对应变更才选用以下检查，另保留同候选真实操作截图与原始记录：

```bash
node --test tests/environment/workflow-execution-feedback.test.mjs
node --test --test-name-pattern='Workflow chat|Workflow diagnostics' tests/environment/workflow-react-preview-contract.test.mjs
```

这些 Node 检查分别证明反馈的证据条件、敏感值处理及 React 折叠结构，不能单独证明真实模型或浏览器操作通过。

| 现象 | 当前最小动作 |
| --- | --- |
| AI 设置检查未完就发送，出现 `E_BUSY` | 查本机检查是否立即禁用发送、业务入口是否也拒绝并发、结束后是否可重试；HTTPS Provider 应保持独立 |
| “不要提交／跳转”被当成要求点击，或“改成”未识别 | 复现动作准入；核对否定、肯定转折与额外点击保护，不能删掉校验制造成功 |
| doctor READY，但发送重连／推理失败 | 区分版本、隔离配置、模型网络与真正 Provider 错误；未取得模型结果时标具体阻塞，不写“推理通过” |
| 侧边栏因源码刷新重建 | 先核对是否发生宿主／会话变化；保留证据和服务 owner，按当前入口解除阻塞，不重复全量构建 |
| 组件测试找不到已退役的 DOM | 先查夹具和当前 React 交互；断言前失败不能判产品故障，也不能记为权限验证通过 |
| 持久回执缺失、身份不符或副作用未知 | 标失败／未知并只读对账，禁止自动重放 |

仅在对应代码变化或新失败需要验证时选择以下现有命令，不因手册存在而全部执行：

```bash
# 动作准入、填写读回和持久身份校验
node --test tests/environment/workflow-direct-execution.test.mjs

# 本机连接检查与发送竞态、重试、HTTPS 独立批准
node --experimental-vm-modules --test --test-name-pattern='local check' tests/environment/workflow-focus.test.mjs
```

Node 组件中的 planner、权限和事件替身只证明定向组件行为，不能作为真实 Chrome／模型通过的证据。旧夹具失败单列，不以只运行成功子集宣称整个测试文件通过。仅修文档时核对内容、相对链接、Skill 元数据和 diff 即可。
