# Cloud Control R1.4 UI 状态投影 — 2026-10-12

## 占用与范围

- 负责人：本次受主代理指派的 executor UI 子任务；已读取 `~/.codex/prompts/executor.md`、仓库 AGENTS、R27、Sidebar R20/R26 与测试复用入口。
- 状态：IN_PROGRESS；开始 HEAD `af54d89b9fd931ae589b48daa080bf52876bfbcf`，分支 `main`。
- 唯一写入文件：`src/ui/cloud-status-presentation.js`、`src/ui/cloud-hosting.js`、`tests/environment/cloud-control-debug-r14.test.mjs`、`tests/environment/cloud-control-sidebar-r28.test.mjs`，以及此授权工作流文件。
- 契约：只消费已有 `cloudStatus()` 状态；Service 的完成后租约过期 reason 修复归主代理。不修改执行、停止、配对、领取、回传契约，不扩大 Debug 入口，不输出秘密、URL、原始错误文本。
- 初始四个目标文件 diff 为空；其他工作区改动保留。每次写入前复核本任务文件，使用局部补丁。
- 验证资源：仅 Node 环境测试与静态语法检查；不占浏览器、Profile、端口、dist/ZIP，不启动服务、不构建、不提交。

## 实施与验证计划

1. 先在两个授权环境测试文件锁定 waiting/running/stopping、结果保存、资源释放、回执与未知状态/等待原因的脱敏投影。
2. 测试覆盖 finished + completed + released + receipt 的旧 `E_CLOUD_CANCELLED` 兼容，以及真实 cancelled/stopped/failed 历史不被改写。
3. 增量调整纯投影和现有 DOM 文案；复用原布局及已有按钮/刷新职责。
4. 执行两个对应 Node 环境测试和修改 JS 的语法检查；记录输入身份、失败和最终结果。

## 证据复用与未测

- 已核对主代理 `cloud-control-r14-final-20261012.md`；本任务新增投影行为属于 AFFECTED_INPUTS，需新的定向组件验证。其他原生验收归主代理。
- Mac Chrome 300/320/360/420/520 CSS px、125%/200% 缩放、键盘 Tab/Shift+Tab/Enter/Escape 与真实焦点状态：NOT_TESTED。本任务禁止启动浏览器，组件测试不能提升为原生/F3/ZIP PASS。

## 续接记录

- 初始缺口：请求样本只有请求/运行/资源/回执标签，没有等待原因、结果保存解释；“我的”摘要未区分执行阶段与宿主未就绪。
- 首轮先加行为测试：17 项中 11 PASS / 6 FAIL（新增投影/UI 行为尚未实现）；增量实现后对应 17/17 PASS，两个 JS 和两个测试文件语法检查、定向 diff whitespace 检查通过。
- 主代理更新契约：`cloudStatus.revocation` 为 `null | {state:'pending'} | {state:'confirmed'}`。pending 时仅本机停止，服务端撤销尚待确认且禁止新配对；刷新仍只读。本任务先补此状态的脱敏投影、配对禁用和无撤销网络动作测试，再调整 UI。旧 cancel reason 仅在 finished + completed + released + receipt 全部齐全时作为历史噪声隐藏。

## 完成与交接

- 最终状态：DONE；本任务写入占用 released。Node 验证已结束；未占用浏览器、Profile、端口、dist/ZIP，未建分支/worktree/PR，未提交。
- `cloud-status-presentation.js`：请求/执行/结果保存/资源退休/回执分别使用白名单中文标签；补充等待前置条件与保守未知原因；不输出原始 reason、URL、ID、结果内容或凭据。预留 resultId 不算保存；已有 Controller 终态与结果同事务提交，才投影“结果已保存”。finished + completed + released + receipt 才隐藏历史 `E_CLOUD_CANCELLED`，原输入不变，真实 cancelled/stopped/failed/interrupted 不提升为成功。修复 limit=0 与继承属性名的投影边界。
- `cloud-hosting.js`：在现有“我的”状态与请求样本中呈现最近请求和独立的结果/释放/回执/原因；明确已停止仍待释放，宿主未就绪不显示可用。读取失败时清除旧样本且不展示原错误文本/代码。pending 显示“本机已停止；服务端撤销待确认”并禁用配对，confirmed 显示确认；未知撤销状态保守禁配对。复用现有布局、DOM ID、按钮和只读刷新边界；未新增调用或 Debug 入口。
- 两个授权测试文件：新增投影状态矩阵、历史 reason 完成条件/负向终态、等待前置条件、原输入不变、继承属性/未知/秘密脱敏、结果预留与保存区别、两个刷新入口不领取/执行/配对/撤销、读取失败清除旧样本、pending→confirmed 配对可用性的组件证据。

### 定向验证（组件级）

命令：`node --test tests/environment/cloud-control-debug-r14.test.mjs tests/environment/cloud-control-sidebar-r28.test.mjs`

- 第一轮 RED：17 tests / 11 pass / 6 fail。失败项：状态阶段与结果/资源/回执、等待原因、历史取消兼容、未知投影、“我的”停止后资源释放提示、宿主未就绪/读取失败文案。
- 第一轮实现：17 tests / 17 pass / 0 fail。
- 新 revocation 契约 RED：19 tests / 16 pass / 3 fail。失败项：撤销确认投影、E_CLOUD_REVOKED 需明确本机授权、pending 阻止配对/只读刷新。
- 最终 GREEN 原始摘要：

```text
ℹ tests 19
ℹ suites 0
ℹ pass 19
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 56.518209
```

- `node --check` 两个修改 JS 与两个测试文件：均通过、无诊断。
- `git diff --check --` 上述四个文件及本工作流：通过。
- 验证前后 11 个相关输入 SHA-256 一致；他人无关修改保留，不把此组件结果提升为 Service/原生/F3/ZIP PASS。未跑全环境、全仓库构建或 Service 测试；这些不属于此 UI 子任务。

### 最终输入身份（SHA-256）

| 输入 | SHA-256 |
| --- | --- |
| `src/ui/cloud-status-presentation.js` | `2788dad53bfc2af05422adfafcc546ac3ff09fcb0bfe01f92d498d05e4cb0edc` |
| `src/ui/cloud-hosting.js` | `23126812315c3322893b2374b8592191778a85143a4c8b6ac6aa768f2d2c6bf3` |
| `tests/environment/cloud-control-debug-r14.test.mjs` | `5d2242ea558472b04d3da4d4c3245e087bd687bbc35393346954bcf29f8e8c4d` |
| `tests/environment/cloud-control-sidebar-r28.test.mjs` | `f8bb1de2393a3bad3e8ab2df4467190edbc40b07619889b47e724333820b0a01` |
| `src/ui/debug-workbench.js` | `726073a9f2e3f716f5d1d72008d20a26c622e625783f00f0a957534ff5779054` |
| `src/ui/tool.html` | `bbc21b5527d28982a742bb6f622c56d471b869368d1adea18b275349c2f8c36c` |
| `src/ui/tool-shell.css` | `36e4da9f90feb63f50dff7554b28273960a3a670d75f6931a226163c2b6d17a7` |
| `src/ui/task-workbench.js` | `4a0a254498fb71fe09cdff1c82e9cf7e52f9c2e30d997785bed6b1729e05c2bc` |
| `src/ui/tool-shell.js` | `29182b2997d311efadb49fc13e7090285945298714afa0bd99f79782f5f1d608` |
| `src/ui/sidebar-tab-memory.js` | `83357d3d35c1a13d04075ef74cc991394818a4475b888fe9332c170fb4b0bcf2` |
| `package.json` | `da28827f8a065d44be3b86bc6c9bbb845917d0a7d91bf27b0e8daa5468a8c31e` |

Mac Chrome 300/320/360/420/520 CSS px、125%/200% 缩放、键盘 Tab/Shift+Tab/Enter/Escape、真实焦点与长中文换行：NOT_TESTED，交由主代理按最终候选补原生验证。现有窄布局 CSS/入口/Debug 隐藏静态契约包含在对应环境测试中并通过，不能替代上述实测。

## 2026-10-12 UI4P1 executor 交回后增量（IN_PROGRESS）

- 负责人：本对话独立 UI/UX 审查转 executor；用户已明确交回四文件独占写权，不递归委派。
- 起始 main：0593cba4ba022ba36c20157cc8870412e1ea0263；已复核目标文件当前内容及既有 diff，保留既有恢复差异与其他 Agent 修改。
- 唯一源码/测试写入：`src/ui/cloud-hosting.js`、`src/ui/cloud-status-presentation.js`、`tests/environment/cloud-control-sidebar-r28.test.mjs`、`tests/environment/cloud-control-debug-r14.test.mjs`；仅追加本工作流。无 Git/index 写入，不改 HTML/CSS、Service、预算或导航。
- 消费主代理事实合同：siteAuthorization granted/revoked/unknown/none；slotState available/preview/local-running/cloud-running/stopping/retirement-pending/outcome-unknown/unknown；pendingResources boolean；requests[].outcomeUnknown boolean。缺失或非法字段保守待核对，不从 fenced 推导未知副作用，不改原 Run/Result 终态。
- 最新 service 的 createdAt 有界排序及 reverse 已存在，保留当前消费者顺序；requestTotal 已接入，追加总数/样本数区分测试。
- 行为修改计划：先补负向测试；消费授权/槽/资源字段并显示等待及停止后提示；独立操作反馈；读取失败清除六个概览旧肯定指标并保留核对入口。
- 验证资源：仅本对话 Node 两份定向环境组件测试与语法/局部静态检查，不占用 Chrome/CFT、端口、dist、ZIP 或 Native profile。
- 复用：历史 19/19 与交接 38/38 仅作历史 COMPONENT_TESTED 输入；本轮 UI 行为/合同有变化，按 AFFECTED_INPUTS 运行上述两份定向测试。新候选 Native 窄宽度/键盘/焦点/200% 保持 NOT_TESTED。

### UI4P1 executor 最终交回（COMPONENT_TESTED；四文件写入占用 released）

- 验证 main：0593cba4ba022ba36c20157cc8870412e1ea0263。本轮仅上述四源码/测试文件与此工作流追加；保留接手时的未提交恢复差异、其他 Agent 源码变化。没有 Git/index 写入、commit/push、浏览器或构建操作。
- 实施：siteAuthorization、slotState 白名单投影与概览/等待原因；缺字段保守 unknown。pendingResources 独立于五条历史样本，在停止/未配对摘要与 My 中保留待处理资源提示。requestTotal 沿用接手时已存在的总数消费，并验证总数与五样本统计分离。
- 实施：outcomeUnknown === true 独立追加“网页副作用待核对，请勿重试该请求”，不改 interrupted/cancellation-pending/Result 保存/retirement/Receipt；fenced alone 和非 boolean 输入不触发未知副作用。完成后取消历史的隐藏条件保留，未知副作用为 true 时不隐藏该历史。
- 实施：读取失败清空 provider/connection/host/slot/tasks/requests 六指标、摘要与旧样本，禁用配对/启用而保留核对入口；操作/派发/完成失败只显示白名单独立反馈，输入同意/选任务错误给明确本地反馈且不触发 Service 操作。
- 边界：cheap poll 仍为 includeRequests:false；完整刷新仍 limit:5；My 固定只读控制台按钮、五产品 Tab/DevDebug 第六保留。未编辑 HTML/CSS、Service、预算及导航。
- RED：两份定向测试 27 tests / 17 PASS / 10 FAIL（新增事实/反馈缺口及对应预期）；实现后 27/27；新增轮询负向验证及资源保守判断后最终 29/29。
- 验证命令：node --test tests/environment/cloud-control-sidebar-r28.test.mjs tests/environment/cloud-control-debug-r14.test.mjs。Node v24.16.0；四文件 node --check 和授权五路径 git diff --check 均 exit 0；这些 Git 命令只读检查。
- 最终测试前后下表 12 个相关输入 SHA-256 完全一致。原生窄宽度/键盘/焦点/200% 仍 NOT_TESTED；没有将历史 Native、组件或旧候选提升为新候选 Native/F3/ZIP/95 PASS。
- 主代理集成依赖：交回时 Service 源码只读快照 SHA-256 为 45c07b13bb8a0057e9ca5d69e073b225a11034f90a37ff6888379049c2c4abb3；只读检索尚未发现新 siteAuthorization/slotState/pendingResources/outcomeUnknown 字段落盘。UI 已按用户指定合同实现并以显式 fixture 验证，当前缺字段会保守待核对；Service 事实生产和 Service→UI 当前候选集成验证仍由主代理负责，不算本轮 PASS。
- 完整增量 diff 以接手时四文件工作区副本为基线（不是 HEAD，避免把既有恢复差异算成本轮重写），见下文。其原始 unified diff SHA-256：ab320aa2467f7fe32b6ffcf34458a97cc2c6073e5c90c0acc29529d4fdc442b7。工作流自身的本轮差异为此 IN_PROGRESS 及最终交回段落的追加，历史内容未改写。

#### 四文件接手身份

| 输入 | 接手 SHA-256 |
| --- | --- |
| `src/ui/cloud-hosting.js` | `157378723f1ca66692258dab7fa0170ff5315a1199a01406aedb1890d8300d54` |
| `src/ui/cloud-status-presentation.js` | `22eca274b2b30f458613943156a43851a899a078c8dcd5bcf9ed3b0a409bfcae` |
| `tests/environment/cloud-control-sidebar-r28.test.mjs` | `ba603bec504f48f3bcc8f5b8198a14656cfdc30f73fc145a1069a68a94988768` |
| `tests/environment/cloud-control-debug-r14.test.mjs` | `618874682183ff460c77ce31b276d4903a702b211849a6599d1940c3f1676e8e` |

#### 最终组件证据输入身份（验证前后一致）

| 输入 | SHA-256 |
| --- | --- |
| `src/ui/cloud-hosting.js` | `016bb24ff668f3f07684fe5bf217e8a523aca5cc90e69b1a0d2984af1f77d723` |
| `src/ui/cloud-status-presentation.js` | `dc22b61233d6f8550d4e84a3e55c3e3867b2844dcf219c9f4ee7f7f88fed3463` |
| `src/ui/debug-workbench.js` | `726073a9f2e3f716f5d1d72008d20a26c622e625783f00f0a957534ff5779054` |
| `src/entrypoints/tool-shell.js` | `cd18fd0f142d4860aa161579e338ac56259346de05cab69eec4324ba050a6368` |
| `src/ui/tool.html` | `5479a392d85b98779868aeb433538d15cf2d09707f8dac1fcf185b20a77dfff9` |
| `src/ui/tool-shell.css` | `389e40a7a73c30bd423bc2a553d5642a4a210db9aede451e1af49610afe1f92a` |
| `src/ui/task-workbench.js` | `88f6e523b80ff69ddc7c68c3b733ef9d97aefaf13f1e67ea724f4f47851de4a7` |
| `src/ui/tool-shell.js` | `52471fb9d3ffe2ab6e2ec1448bf361053f1e41547035d37097e6d19fa510a796` |
| `src/ui/sidebar-tab-memory.js` | `6d56007a965c3cab3c8eb94aa8f7661c449ae06b4a72f3631b8601fff086409f` |
| `tests/environment/cloud-control-sidebar-r28.test.mjs` | `3f6def7ba1cf9e18b26c465a107e95df4af8b62508a89b94547ebdf313601bfa` |
| `tests/environment/cloud-control-debug-r14.test.mjs` | `af8c9162a0a66f7d2a7730720fdc713a2d9ec87f6d25e2766f313c01e2eb29e7` |
| `package.json` | `da28827f8a065d44be3b86bc6c9bbb845917d0a7d91bf27b0e8daa5468a8c31e` |

#### 最终定向测试原始 stdout

```text
✔ read-only cloud diagnostics omit tokens and all private identifiers (2.662958ms)
✔ untrusted provider state is reduced to a known diagnostic enum (1.483083ms)
✔ completed diagnostics remain read-only and preserve true cancellation counts despite old reasons (1.068917ms)
✔ revocation projects only confirmation state and separates local stop from server confirmation (0.344ms)
✔ development UI only reads cloudStatus and never claims, pairs, approves or starts a run (0.527791ms)
✔ late diagnostics after disposal are ignored (0.521458ms)
✔ production Cloud tab is visible in Side Panel while Debug remains hidden (6.218875ms)
✔ cloud status refresh is read-only and full tool/catalog tabs cannot claim cloud tasks (1.029459ms)
✔ diagnostic facts are enum-only, bounded, and conservative for absent or malicious inputs (0.7035ms)
✔ Debug reads and copies new facts without expanding its authority (0.631958ms)
✔ Side Panel keeps hosting in My and development-only Debug at sixth (6.304625ms)
✔ only tab navigation scrolls horizontally and Cloud cards wrap on narrow panels (1.082792ms)
✔ Cloud controls exist once within My and refresh stays read-only (1.467875ms)
✔ cloud request previews project whitelisted states rather than IDs or result data (0.44225ms)
✔ request previews distinguish waiting, execution, saved results, retirement and receipts (0.24075ms)
✔ waiting reasons conservatively follow hosting prerequisites (0.099375ms)
✔ only fully confirmed successful completion hides a historical cloud cancellation reason (0.608875ms)
✔ unknown states and reasons stay conservative, bounded and secret free (0.420667ms)
✔ My hosting status displays saved stopped results and pending release with read-only refresh (9.37575ms)
✔ My hosting readiness and unreadable status never expose raw errors or stale request samples (2.453375ms)
✔ pending server revocation blocks new pairing and both refresh gestures stay read-only (1.800333ms)
✔ waiting follows current website authorization and original slot reasons (0.1795ms)
✔ unknown native effects remain independent of interrupted saved results and retirement (0.16325ms)
✔ My displays current grants, bounded totals, and stopped pending resources without historical samples (1.777417ms)
✔ read failure clears every affirmative metric and blocks pairing approval while refresh and console remain usable (1.067625ms)
✔ operation rejection and local approval validation preserve trusted status and use separate safe feedback (0.965667ms)
✔ missing facts never advertise readiness even when legacy booleans are true (0.934625ms)
✔ periodic polling stays cheap between bounded refreshes and failed cheap reads clear stale facts (1.190875ms)
✔ dispatch rejection is operation feedback and does not erase successful status reads (0.50725ms)
ℹ tests 29
ℹ suites 0
ℹ pass 29
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 92.479209
```

#### 四文件完整增量 diff

```diff
--- a/src/ui/cloud-hosting.js
+++ b/src/ui/cloud-hosting.js
@@ -1,10 +1,20 @@
 // Hosting shares the visible document's existing RunHost and Authority slot.
-import {projectCloudStatus,cloudHostingSummary,projectCloudRequestSamples} from './cloud-status-presentation.js';
+import {projectCloudStatus,cloudHostingSummary,projectCloudRequestSamples,cloudSlotStateLabel} from './cloud-status-presentation.js';
 export function createCloudHosting({client,host,document:doc=globalThis.document,api=globalThis.chrome}){
   const get=id=>doc.getElementById(id),cloud=client.cloud;let disposed=false,busy=false,starting=false,timer;
   const status=get('cloud-status'),brief=get('cloud-brief'),myState=get('cloud-my-state');
   const overview=get('cloud-overview-state'),sampleList=get('cloud-request-samples');
   let lastSamples='',lastFullRefresh=0;
+  let statusText=status.textContent,operationFeedback='';
+  const updateStatus=()=>{status.textContent=[statusText,operationFeedback].filter(Boolean).join('\n');};
+  const operationFail=error=>{
+    if(disposed)return;
+    const messages={E_CLOUD_CONSENT_REQUIRED:'请先批准所选固定任务和网站范围。',
+      E_CLOUD_TASK_REQUIRED:'请先安装并选择任务。',E_PAIRING:'配对操作未完成，请核对提供者地址、身份与配对码。',
+      E_PERMISSION:'目标网站访问尚未授权，请核对网站权限。'};
+    operationFeedback=Object.hasOwn(messages,error?.code)?messages[error.code]:'操作未完成，请核对状态后再试。';
+    updateStatus();
+  };
   function sampleView(samples){
     const serial=JSON.stringify(samples);
     if(serial===lastSamples)return;lastSamples=serial;sampleList.replaceChildren();
@@ -14,23 +24,31 @@
   }
   const put=(id,text)=>{const el=get(id);if(el)el.textContent=text;};
   const fail=()=>{
-    brief.textContent='状态异常';status.textContent='云控状态暂不可读取，请稍后核对。';
+    if(disposed)return;
+    brief.textContent='状态异常';statusText='云控状态暂不可读取，请稍后核对。';updateStatus();
     myState.textContent='状态不可读取';overview.textContent='云端托管状态暂不可读取';
+    for(const metric of ['provider','connection','host','slot','tasks','requests'])put('cloud-overview-'+metric,'待核对');
+    get('cloud-pair').disabled=true;get('cloud-approve').disabled=true;
+    get('cloud-refresh').disabled=false;get('cloud-overview-refresh').disabled=false;
     lastSamples='';sampleList.replaceChildren();const li=doc.createElement('li');li.textContent='请求状态暂不可读取';sampleList.append(li);};
   // Refresh is deliberately read-only. Cloud claim/dispatch belongs only to poll().
   async function refresh(){
     const s=await cloud.cloudStatus({limit:5});if(disposed)return null;
     const projected=projectCloudStatus(s),summary=cloudHostingSummary(projected),samples=projectCloudRequestSamples(s);
     brief.textContent=projected.revocation==='pending'?'本机已停止；服务端撤销待确认':projected.revocation==='unknown'?'撤销状态待核对':
-      !projected.paired?(projected.revocation==='confirmed'?'撤销已确认':'未配对'):!projected.enabled?'已关闭':!projected.online?'连接中':!projected.reconciled?'对账中':!projected.hostReady?'宿主未就绪':!projected.slotAvailable?'执行槽繁忙':'可用';
-    status.textContent=summary+`\n已批准任务 ${projected.approvedTasks} 项 · 历史云请求 ${projected.requests.total} 条 · 已确认回执 ${projected.requests.receivedReceipts} 条（最近 ${projected.requests.sampled} 条统计）`;
+      !projected.paired?(projected.revocation==='confirmed'?'撤销已确认':'未配对'):!projected.enabled?'已关闭':!projected.online?'连接中':!projected.reconciled?'对账中':!projected.hostReady?'宿主未就绪':
+      projected.siteAuthorization==='revoked'?'网站访问已撤销':projected.siteAuthorization==='none'?'未批准网站范围':projected.siteAuthorization!=='granted'?'网站授权待核对':
+      !projected.slotAvailable?cloudSlotStateLabel(projected.slotState):projected.pendingResources!==false?'待处理资源待核对':'可用';
+    statusText=summary+`\n已批准任务 ${projected.approvedTasks} 项 · 历史云请求 ${projected.requests.total} 条 · 已确认回执 ${projected.requests.receivedReceipts} 条（最近 ${projected.requests.sampled} 条统计）`;updateStatus();
     const latest=samples[0];
-    myState.textContent=brief.textContent+' · 已批准 '+projected.approvedTasks+' 项任务'+(latest?' · 最近请求：'+[latest.state,latest.run,latest.result,latest.settlement,latest.receipt,latest.reason].filter(Boolean).join(' · '):'');
+    myState.textContent=brief.textContent+' · 已批准 '+projected.approvedTasks+' 项任务'+
+      (projected.pendingResources===true?' · 仍有待处理资源，等待停止、核对及资源释放':projected.pendingResources===false?'':' · 待处理资源状态待核对')+
+      (latest?' · 最近请求：'+[latest.state,latest.run,latest.result,latest.settlement,latest.receipt,latest.reason].filter(Boolean).join(' · '):'');
     overview.textContent=summary;
     put('cloud-overview-provider',projected.paired?'已配对':'未配对');
     put('cloud-overview-connection',projected.online?'已连接':projected.connection==='backoff'?'重连中':'未连接');
     put('cloud-overview-host',projected.hostReady?'已就绪':'不可用');
-    put('cloud-overview-slot',projected.slotAvailable?'空闲':'占用／未就绪');
+    put('cloud-overview-slot',cloudSlotStateLabel(projected.slotState));
     put('cloud-overview-tasks',String(projected.approvedTasks));
     put('cloud-overview-requests',String(projected.requests.total));
     sampleView(samples);lastFullRefresh=Date.now();
@@ -40,22 +58,30 @@
   async function dispatchNext(s){
     if(disposed||!s?.enabled||host.executionPending||starting||!s.online||!s.reconciled)return;
     const next=await cloud.cloudNext({});if(!next||disposed)return;
-    starting=true;try{const request=await cloud.cloudResolve(next);await host.start(request);host.completion.catch(fail).finally(()=>{starting=false;});}catch(e){starting=false;throw e;}
+    starting=true;try{const request=await cloud.cloudResolve(next);await host.start(request);host.completion.catch(operationFail).finally(()=>{starting=false;});}catch(e){starting=false;throw e;}
   }
-  async function action(fn){if(busy)return;busy=true;try{await fn();await refresh();}catch(e){fail(e);}finally{busy=false;}}
-  const listeners=[];function click(id,fn){const handler=()=>void action(fn);get(id).addEventListener('click',handler);listeners.push([id,handler]);}
+  async function action(fn,readOnly){if(busy)return;busy=true;
+    operationFeedback='';updateStatus();
+    try{
+      if(!readOnly){try{await fn();}catch(error){operationFail(error);return;}}
+      try{await refresh();}catch{fail();}
+    }finally{busy=false;}
+  }
+  const listeners=[];function click(id,fn){
+    const readOnly=id==='cloud-refresh'||id==='cloud-overview-refresh';
+    const handler=()=>void action(fn,readOnly);get(id).addEventListener('click',handler);listeners.push([id,handler]);}
   click('cloud-pair',()=>cloud.cloudPair({url:get('cloud-url').value,providerId:get('cloud-provider-id').value.trim(),pairingCode:get('cloud-pairing-code').value.trim(),allowLoopback:get('cloud-loopback').checked}).then(()=>{get('cloud-pairing-code').value='';}));
-  click('cloud-approve',async()=>{if(!get('cloud-consent').checked)throw Error('请先批准所选固定任务、网站范围和结果回传');const taskId=get('task-installed-list').value;if(!taskId)throw Error('请先安装并选择任务');return cloud.cloudApprove({tasks:[{taskId,resultAllowed:get('cloud-result-consent').checked}]});});
+  click('cloud-approve',async()=>{if(!get('cloud-consent').checked)throw {code:'E_CLOUD_CONSENT_REQUIRED'};const taskId=get('task-installed-list').value;if(!taskId)throw {code:'E_CLOUD_TASK_REQUIRED'};return cloud.cloudApprove({tasks:[{taskId,resultAllowed:get('cloud-result-consent').checked}]});});
   click('cloud-stop',()=>cloud.cloudStop({}));click('cloud-unpair',()=>cloud.cloudUnpair({}));
   // The user's “核对状态” gesture must never itself claim or run a cloud task.
   click('cloud-refresh',async()=>{});
   click('cloud-overview-refresh',async()=>{});
-  click('cloud-open-console',()=>api.tabs.create({url:api.runtime.getURL('ui/cloud-control.html')}));
+  click('cloud-open-console',async()=>{await api.tabs.create({url:api.runtime.getURL('ui/cloud-control.html')});});
   // Preserve the two-second dispatch cadence without scanning cloud history
   // every time. Visibility changes observations, not execution ownership.
   async function poll(){if(disposed)return;try{if(!busy){
     const s=await cloud.cloudStatus({includeRequests:false});
-    if(!busy&&!disposed)await dispatchNext(s);
+    if(!busy&&!disposed)try{await dispatchNext(s);}catch(error){operationFail(error);}
     const cloudVisible=doc.documentElement?.dataset?.opendeskTab==='tasks';
     if(!busy&&!disposed&&Date.now()-lastFullRefresh>=(cloudVisible?5000:15000))await refresh();
   }}catch(e){if(!disposed)fail(e);}finally{if(!disposed)timer=setTimeout(poll,2000);}}
--- a/src/ui/cloud-status-presentation.js
+++ b/src/ui/cloud-status-presentation.js
@@ -4,6 +4,19 @@
 const REQUEST = new Set(['waiting','prepared','permitted','finished','cancelled','cancellation-pending','OUTCOME_UNKNOWN']);
 const REVOCATION = new Set(['pending','confirmed']);
 const revocationState = value => value==null?null:REVOCATION.has(value?.state)?value.state:'unknown';
+const SITE_AUTHORIZATION = new Set(['granted','revoked','unknown','none']);
+const SLOT = new Set(['available','preview','local-running','cloud-running','stopping','retirement-pending','outcome-unknown','unknown']);
+const siteAuthorization = value => SITE_AUTHORIZATION.has(value)?value:'unknown';
+const slotState = source => SLOT.has(source?.slotState)&&
+  (source.slotState!=='available'||source.slotAvailable===true)?source.slotState:'unknown';
+const SITE_LABELS=Object.freeze({granted:'目标网站已授权',revoked:'目标网站访问已撤销',unknown:'目标网站授权待核对',none:'尚无已批准网站范围'});
+const SLOT_LABELS=Object.freeze({available:'空闲',preview:'预览占用','local-running':'本地任务运行中','cloud-running':'云任务运行中',
+  stopping:'停止中，等待执行结束','retirement-pending':'等待资源释放','outcome-unknown':'原运行结果待核对，请勿重试',unknown:'执行槽状态待核对'});
+const SLOT_WAITING=Object.freeze({preview:'等待预览结束及释放执行槽','local-running':'等待本地任务完成及资源释放',
+  'cloud-running':'等待云任务完成及资源释放',stopping:'等待原运行停止及资源释放','retirement-pending':'等待原任务资源释放',
+  'outcome-unknown':'原运行结果待核对，请勿重试',unknown:'执行槽状态待核对'});
+export const cloudSiteAuthorizationLabel = value => SITE_LABELS[siteAuthorization(value)];
+export const cloudSlotStateLabel = value => SLOT_LABELS[SLOT.has(value)?value:'unknown'];
 const boundedCount = value => Math.min(Number.isSafeInteger(value) && value >= 0 ? value : 0, 999999);
 
 export function projectCloudStatus(raw, {version='未知', capturedAt=new Date().toISOString(), hostOccupied=false}={}) {
@@ -11,13 +24,14 @@
   const rows = Array.isArray(source.requests) ? source.requests : [];
   const counts = Object.fromEntries([...REQUEST].map(name=>[name,0]));
   counts.other=0;
-  let receipts=0, retired=0;
+  let receipts=0, retired=0, unknownOutcomes=0;
   // Keep an upper bound on large historical journals; no raw request object survives projection.
   const sampled=rows.slice(-2000);
   for(const row of sampled){
     const state=REQUEST.has(row?.state)?row.state:'other';counts[state]++;
     if(row?.receipt != null)receipts++;
     if(row?.retirementState==='released')retired++;
+    if(row?.outcomeUnknown===true)unknownOutcomes++;
   }
   return {
     schema:'opendesk.cloud-control.diagnostics.v1',capturedAt,
@@ -26,14 +40,23 @@
     revocation:revocationState(source.revocation),
     connection:CONNECTION.has(source.connection)?source.connection:'unknown',
     online:source.online===true,reconciled:source.reconciled===true,
-    hostReady:source.hostReady===true,slotAvailable:source.slotAvailable===true,
+    hostReady:source.hostReady===true,slotAvailable:slotState(source)==='available',
+    siteAuthorization:siteAuthorization(source.siteAuthorization),slotState:slotState(source),
+    pendingResources:typeof source.pendingResources==='boolean'?source.pendingResources:null,
     hostOccupied:Boolean(hostOccupied),approvedTasks:boundedCount(source.tasks?.length),
     requests:{total:boundedCount(source.requestTotal??rows.length),sampled:boundedCount(sampled.length),states:counts,
-      receivedReceipts:boundedCount(receipts),releasedSlots:boundedCount(retired)}
+      receivedReceipts:boundedCount(receipts),releasedSlots:boundedCount(retired),unknownOutcomes:boundedCount(unknownOutcomes)}
   };
 }
 
 export function cloudHostingSummary(status){
+  const resources=status.pendingResources===true?'仍有待处理资源，等待停止、核对及资源释放。':
+    status.pendingResources===false?'':'待处理资源状态待核对。';
+  const availability=hostingAvailabilitySummary(status),site=cloudSiteAuthorizationLabel(status.siteAuthorization);
+  return availability+(availability.includes(site)?'':' '+site+'。')+(resources?' '+resources:'');
+}
+
+function hostingAvailabilitySummary(status){
   if(status.revocation==='pending')return '本机已停止；服务端撤销待确认。确认前不能重新配对。';
   if(status.revocation==='unknown')return '撤销状态待核对；暂不能确认可重新配对。';
   if(!status.paired&&status.revocation==='confirmed')return '本机已停止；服务端撤销已确认。可重新配对提供者。';
@@ -42,7 +65,11 @@
   if(!status.online)return '托管已启用，但提供者尚未连接。请检查网络和连接状态。';
   if(!status.reconciled)return '已连接提供者，正在对账；尚不能确认可执行。';
   if(!status.hostReady)return '连接和对账已完成；需要可用的浏览器执行宿主。';
-  if(!status.slotAvailable)return '连接与对账已完成；执行槽占用中，等待原任务完成及资源释放。';
+  if(status.siteAuthorization==='revoked')return '目标网站访问已撤销，请恢复网站授权。';
+  if(status.siteAuthorization==='none')return '尚无已批准网站范围，等待批准任务及网站范围。';
+  if(status.siteAuthorization!=='granted')return '目标网站授权待核对；尚不能确认可执行。';
+  if(!status.slotAvailable||status.slotState!=='available')return '连接与对账已完成；'+SLOT_WAITING[SLOT.has(status.slotState)?status.slotState:'unknown']+'。';
+  if(status.pendingResources!==false)return '执行资源状态待核对；尚不能确认可执行。';
   return '托管已启用，连接和对账已完成；可等待已批准任务。';
 }
 
@@ -75,7 +102,13 @@
     if(status.online!==true)return '等待提供者连接';
     if(status.reconciled!==true)return '等待连接对账';
     if(status.hostReady!==true)return '等待浏览器执行宿主就绪';
-    if(status.slotAvailable!==true)return '等待原任务完成及资源释放';
+    const authorization=siteAuthorization(status.siteAuthorization),slot=slotState(status);
+    if(authorization==='revoked')return '目标网站访问已撤销，等待恢复网站授权';
+    if(authorization==='none')return '尚无已批准网站范围，等待批准任务及网站范围';
+    if(authorization!=='granted')return '目标网站授权待核对';
+    if(slot!=='available')return SLOT_WAITING[slot];
+    if(status.pendingResources!==false)return status.pendingResources===true?
+      '仍有待处理资源，等待核对及资源释放':'待处理资源状态待核对';
     return '等待浏览器开始执行';
   }
   if(row?.state==='prepared')return '等待执行许可';
@@ -93,7 +126,7 @@
   return requests.slice(-size).reverse().map(row=>{
     // A historical assignment expiry cannot invalidate a confirmed successful result.
     // Keep cancellation history unless all four completion facts agree; never mutate it.
-    const completed=row?.state==='finished'&&row?.runState==='completed'&&row?.retirementState==='released'&&row?.receipt!=null;
+    const completed=row?.state==='finished'&&row?.runState==='completed'&&row?.retirementState==='released'&&row?.receipt!=null&&row?.outcomeUnknown!==true;
     const reason=row?.reason==null||row.reason===''||completed&&row.reason==='E_CLOUD_CANCELLED'?'':label(REASON_LABELS,row.reason,'状态原因待核对');
     return {
       state:row?.state==='finished'&&row?.runState!=='completed'?'请求已结束':label(REQUEST_STATE_LABELS,row?.state,'状态未识别'),
@@ -103,7 +136,7 @@
       result:SAVED_RUN_STATES.has(row?.runState)?'结果已保存':'结果保存未确认',
       settlement:label(RETIREMENT_LABELS,row?.retirementState,'资源释放未确认'),
       receipt:row?.receipt!=null?'回执已确认':'回执未确认',
-      reason:[requestProgress(row,raw),reason].filter(Boolean).join('；')
+      reason:[requestProgress(row,raw),row?.outcomeUnknown===true?'网页副作用待核对，请勿重试该请求':'',reason].filter(Boolean).join('；')
     };
   });
 }
--- a/tests/environment/cloud-control-sidebar-r28.test.mjs
+++ b/tests/environment/cloud-control-sidebar-r28.test.mjs
@@ -51,7 +51,8 @@
   assert.equal(projectCloudRequestSamples({requests:[{state:'https://secret.example'}]})[0].state,'状态未识别');
 });
 
-const readyStatus={provider:{},enabled:true,online:true,reconciled:true,hostReady:true,slotAvailable:true};
+const readyStatus={provider:{},enabled:true,online:true,reconciled:true,hostReady:true,slotAvailable:true,
+  siteAuthorization:'granted',slotState:'available',pendingResources:false};
 const sample=(row,status=readyStatus)=>projectCloudRequestSamples({...status,requests:[row]})[0];
 
 test('request previews distinguish waiting, execution, saved results, retirement and receipts',()=>{
@@ -79,7 +80,7 @@
   for(const [override,reason] of [
     [{provider:null},'等待配对提供者'],[{enabled:false},'托管已关闭，等待重新启用'],
     [{online:false},'等待提供者连接'],[{reconciled:false},'等待连接对账'],
-    [{hostReady:false},'等待浏览器执行宿主就绪'],[{slotAvailable:false},'等待原任务完成及资源释放']
+    [{hostReady:false},'等待浏览器执行宿主就绪'],[{slotAvailable:false,slotState:'retirement-pending'},'等待原任务资源释放']
   ])assert.equal(sample({state:'waiting'},{...readyStatus,...override}).reason,reason);
 });
 
@@ -178,3 +179,148 @@
     assert.doesNotMatch([...map.values()].map(el=>el.textContent).join('\n'),/SECRET/);
   }finally{hosting.dispose();}
 });
+
+
+test('waiting follows current website authorization and original slot reasons',()=>{
+  for(const [siteAuthorization,reason] of [
+    ['revoked','目标网站访问已撤销'],['unknown','目标网站授权待核对'],['none','尚无已批准网站范围']
+  ])assert.match(sample({state:'waiting'},{...readyStatus,siteAuthorization}).reason,new RegExp(reason));
+  for(const [slotState,reason] of [
+    ['preview','等待预览结束'],['local-running','等待本地任务'],['cloud-running','等待云任务'],
+    ['stopping','等待原运行停止'],['retirement-pending','等待原任务资源释放'],
+    ['outcome-unknown','原运行结果待核对'],['unknown','执行槽状态待核对']
+  ])assert.match(sample({state:'waiting'},{...readyStatus,slotAvailable:false,slotState}).reason,new RegExp(reason));
+  const missing={provider:{},enabled:true,online:true,reconciled:true,hostReady:true,slotAvailable:true};
+  assert.match(sample({state:'waiting'},missing).reason,/目标网站授权待核对/);
+  assert.match(sample({state:'waiting'},{...readyStatus,slotState:undefined}).reason,/执行槽状态待核对/);
+  assert.match(sample({state:'waiting'},{...readyStatus,pendingResources:undefined}).reason,/待处理资源状态待核对/);
+});
+
+test('unknown native effects remain independent of interrupted saved results and retirement',()=>{
+  const row={state:'cancellation-pending',runState:'interrupted',retirementState:'fenced',
+    outcomeUnknown:true,reason:'E_CLOUD_CANCELLED',resultId:'PRIVATE_RESULT'};
+  const before=structuredClone(row),value=sample(row);
+  assert.equal(value.state,'取消处理中');assert.equal(value.run,'已中断');assert.equal(value.result,'结果已保存');
+  assert.equal(value.settlement,'资源释放中');assert.equal(value.receipt,'回执未确认');
+  assert.match(value.reason,/网页副作用待核对，请勿重试该请求/);
+  assert.deepEqual(row,before);assert.doesNotMatch(JSON.stringify(value),/PRIVATE_RESULT/);
+  for(const outcomeUnknown of [false,undefined,'SECRET']){
+    assert.doesNotMatch(sample({...row,outcomeUnknown}).reason,/网页副作用待核对|SECRET/);
+  }
+  assert.match(sample({...row,retirementState:'released',receipt:true}).reason,/网页副作用待核对/);
+});
+
+test('My displays current grants, bounded totals, and stopped pending resources without historical samples',async()=>{
+  const {document,map}=hostingFixture();const calls=[];
+  let response={...readyStatus,enabled:false,siteAuthorization:'revoked',slotAvailable:false,
+    slotState:'retirement-pending',pendingResources:true,requestTotal:37,requests:[]};
+  const forbidden=()=>assert.fail('read-only refresh must not execute');
+  const cloud={cloudStatus:async request=>{calls.push(request);return response},cloudNext:forbidden,cloudResolve:forbidden};
+  const hosting=createCloudHosting({document,client:{cloud},host:{executionPending:true,start:forbidden}});
+  try{
+    await flush();
+    assert.match(map.get('cloud-overview-state').textContent,/已关闭.*目标网站访问已撤销.*仍有待处理资源/);
+    assert.match(map.get('cloud-my-state').textContent,/仍有待处理资源/);
+    assert.equal(map.get('cloud-overview-slot').textContent,'等待资源释放');
+    assert.equal(map.get('cloud-overview-requests').textContent,'37');
+    response={...readyStatus,requestTotal:37,requests:Array(5).fill({state:'waiting'})};
+    map.get('cloud-refresh').listeners.get('click')();await flush();
+    assert.match(map.get('cloud-status').textContent,/历史云请求 37 条.*最近 5 条统计/);
+    assert.deepEqual(calls[0],{includeRequests:false});
+    assert.ok(calls.filter(r=>r.includeRequests!==false).every(r=>r.limit===5));
+  }finally{hosting.dispose();}
+});
+
+test('read failure clears every affirmative metric and blocks pairing approval while refresh and console remain usable',async()=>{
+  const {document,map}=hostingFixture();let failed=false,consoleOpens=0;
+  const cloud={cloudStatus:async()=>{if(failed)throw {code:'E_PRIVATE',message:'SECRET https://private.example'};return readyStatus}};
+  const api={runtime:{getURL:p=>'chrome-extension://test/'+p},tabs:{create:async()=>{consoleOpens++;}}};
+  const hosting=createCloudHosting({document,client:{cloud},host:{executionPending:true},api});
+  try{
+    await flush();assert.equal(map.get('cloud-overview-connection').textContent,'已连接');
+    failed=true;map.get('cloud-refresh').listeners.get('click')();await flush();
+    for(const id of ['provider','connection','host','slot','tasks','requests']){
+      assert.equal(map.get('cloud-overview-'+id).textContent,'待核对',id);
+    }
+    assert.equal(map.get('cloud-pair').disabled,true);assert.equal(map.get('cloud-approve').disabled,true);
+    assert.equal(map.get('cloud-refresh').disabled,false);assert.equal(map.get('cloud-overview-refresh').disabled,false);
+    map.get('cloud-open-console').listeners.get('click')();await flush();assert.equal(consoleOpens,1);
+    assert.doesNotMatch([...map.values()].map(el=>el.textContent).join('\n'),/PRIVATE|SECRET|https?:\/\//);
+    failed=false;map.get('cloud-overview-refresh').listeners.get('click')();await flush();
+    assert.equal(map.get('cloud-overview-connection').textContent,'已连接');
+    assert.equal(map.get('cloud-overview-slot').textContent,'空闲');
+  }finally{hosting.dispose();}
+});
+
+test('operation rejection and local approval validation preserve trusted status and use separate safe feedback',async()=>{
+  const {document,map}=hostingFixture();let reads=0,approvals=0;
+  const cloud={cloudStatus:async()=>{reads++;return {...readyStatus,enabled:false}},
+    cloudApprove:async()=>{approvals++;throw {code:'E_PRIVATE_SECRET',message:'https://SECRET.example'};}};
+  const hosting=createCloudHosting({document,client:{cloud},host:{executionPending:true}});
+  try{
+    await flush();const initialReads=reads;
+    map.get('cloud-approve').listeners.get('click')();await flush();
+    assert.match(map.get('cloud-status').textContent,/请先批准所选固定任务和网站范围/);
+    assert.equal(approvals,0);assert.equal(reads,initialReads);
+    map.get('cloud-consent').checked=true;
+    map.get('cloud-approve').listeners.get('click')();await flush();
+    assert.match(map.get('cloud-status').textContent,/请先安装并选择任务/);assert.equal(approvals,0);
+    map.get('task-installed-list').value='PRIVATE_TASK';
+    map.get('cloud-approve').listeners.get('click')();await flush();
+    assert.equal(approvals,1);assert.equal(reads,initialReads);
+    assert.match(map.get('cloud-status').textContent,/操作未完成，请核对状态后再试/);
+    assert.doesNotMatch(map.get('cloud-status').textContent,/状态暂不可读取|PRIVATE|SECRET|https?:\/\//);
+    assert.equal(map.get('cloud-overview-connection').textContent,'已连接');
+    assert.equal(map.get('cloud-overview-slot').textContent,'空闲');
+    map.get('cloud-refresh').listeners.get('click')();await flush();
+    assert.equal(reads,initialReads+1);
+  }finally{hosting.dispose();}
+});
+
+test('missing facts never advertise readiness even when legacy booleans are true',async()=>{
+  const {document,map}=hostingFixture();
+  const cloud={cloudStatus:async()=>({provider:{},enabled:true,online:true,reconciled:true,hostReady:true,slotAvailable:true,requests:[]})};
+  const hosting=createCloudHosting({document,client:{cloud},host:{executionPending:true}});
+  try{
+    await flush();assert.equal(map.get('cloud-brief').textContent,'网站授权待核对');
+    assert.equal(map.get('cloud-overview-slot').textContent,'执行槽状态待核对');
+    assert.match(map.get('cloud-overview-state').textContent,/目标网站授权待核对.*待处理资源状态待核对/);
+    assert.doesNotMatch(map.get('cloud-my-state').textContent,/可用/);
+  }finally{hosting.dispose();}
+});
+
+
+test('periodic polling stays cheap between bounded refreshes and failed cheap reads clear stale facts',async t=>{
+  const {document,map}=hostingFixture();document.documentElement={dataset:{opendeskTab:'tasks'}};
+  let timestamp=6000,scheduled,failed=false;const calls=[];
+  t.mock.method(Date,'now',()=>timestamp);
+  t.mock.method(globalThis,'setTimeout',(fn,delay)=>{assert.equal(delay,2000);scheduled=fn;return 1;});
+  const cloud={cloudStatus:async request=>{
+    calls.push(request);if(failed)throw {message:'SECRET'};
+    return {...readyStatus,requestTotal:request.includeRequests===false?null:90,requests:[]};
+  },cloudNext:()=>assert.fail('pending local execution must not claim')};
+  const hosting=createCloudHosting({document,client:{cloud},host:{executionPending:true}});
+  try{
+    await flush();assert.deepEqual(calls,[{includeRequests:false},{limit:5}]);
+    timestamp=8000;await scheduled();
+    assert.deepEqual(calls,[{includeRequests:false},{limit:5},{includeRequests:false}]);
+    failed=true;timestamp=10000;await scheduled();
+    for(const metric of ['provider','connection','host','slot','tasks','requests'])
+      assert.equal(map.get('cloud-overview-'+metric).textContent,'待核对');
+    failed=false;timestamp=12000;await scheduled();
+    assert.deepEqual(calls.slice(-2),[{includeRequests:false},{limit:5}]);
+    assert.equal(map.get('cloud-overview-requests').textContent,'90');
+  }finally{hosting.dispose();}
+});
+
+test('dispatch rejection is operation feedback and does not erase successful status reads',async()=>{
+  const {document,map}=hostingFixture();let claims=0;
+  const cloud={cloudStatus:async()=>readyStatus,cloudNext:async()=>{claims++;throw {code:'E_PRIVATE',message:'SECRET'};}};
+  const hosting=createCloudHosting({document,client:{cloud},host:{executionPending:false}});
+  try{
+    await flush();assert.equal(claims,1);
+    assert.equal(map.get('cloud-overview-connection').textContent,'已连接');
+    assert.match(map.get('cloud-status').textContent,/操作未完成，请核对状态后再试/);
+    assert.doesNotMatch(map.get('cloud-status').textContent,/状态暂不可读取|SECRET/);
+  }finally{hosting.dispose();}
+});
--- a/tests/environment/cloud-control-debug-r14.test.mjs
+++ b/tests/environment/cloud-control-debug-r14.test.mjs
@@ -13,7 +13,7 @@
   return {document,map};
 }
 const response={executorId:'PRIVATE-ID',provider:{url:'https://sensitive.example',providerId:'private'},enabled:true,online:true,
- connection:'authenticated',reconciled:true,hostReady:true,slotAvailable:true,tasks:[{taskId:'PRIVATE-TASK',siteOrigins:['https://secret.local']}],
+ connection:'authenticated',reconciled:true,hostReady:true,slotAvailable:true,siteAuthorization:'granted',slotState:'available',pendingResources:false,tasks:[{taskId:'PRIVATE-TASK',siteOrigins:['https://secret.local']}],
  requests:[{requestId:'PRIVATE-REQUEST',runId:'SECRET-RUN',state:'finished',retirementState:'released',receipt:{token:'SENSITIVE'}}]};
 test('read-only cloud diagnostics omit tokens and all private identifiers',()=>{
  const value=projectCloudStatus({...response,credential:'SENSITIVE'},{version:'1.2.3',capturedAt:'2026-10-11T00:00:00.000Z'});
@@ -40,7 +40,7 @@
  assert.equal(value.requests.receivedReceipts,1);assert.equal(value.requests.releasedSlots,1);
  assert.doesNotMatch(JSON.stringify(value),/E_CLOUD_CANCELLED|SECRET|https?:\/\//);
  assert.deepEqual(raw,before);
- assert.match(cloudHostingSummary({...value,slotAvailable:false}),/等待原任务完成及资源释放/);
+ assert.match(cloudHostingSummary({...value,slotAvailable:false,slotState:'retirement-pending'}),/等待原任务资源释放/);
  assert.match(cloudHostingSummary({...value,hostReady:false}),/需要可用的浏览器执行宿主/);
 });
 test('revocation projects only confirmation state and separates local stop from server confirmation',()=>{
@@ -105,7 +105,7 @@
  assert.ok(start>=0&&end>start);
  assert.doesNotMatch(hosting.slice(start,end),/cloudNext|cloudResolve|host\.start/);
  assert.match(hosting,/click\('cloud-refresh',async\(\)=>\{\}\)/);
- assert.match(hosting,/if\(!busy&&!disposed\)await dispatchNext\(s\)/);
+ assert.match(hosting,/if\(!busy&&!disposed\)try\{await dispatchNext\(s\)/);
  assert.match(shell,/let cloudHosting=null;/);
  assert.match(shell,/const actualSidePanel=await isActualSidePanelContext\(\{api:chrome,href:hostUrl\.href\}\)/);
  const sidePanelStart=shell.indexOf('const actualSidePanel='),sidePanelEnd=shell.indexOf('const toolId=requestedToolId',sidePanelStart);
@@ -116,3 +116,38 @@
  assert.match(sidePanelOnly,/tabMemory\.restore\(\)/);
  assert.equal((sidePanelOnly.match(/createCloudHosting\(/g)||[]).length,1);
 });
+
+
+test('diagnostic facts are enum-only, bounded, and conservative for absent or malicious inputs',()=>{
+ const raw={...response,siteAuthorization:'revoked',slotState:'outcome-unknown',pendingResources:true,
+   requestTotal:123,requests:[{state:'cancellation-pending',runState:'interrupted',retirementState:'fenced',outcomeUnknown:true}]};
+ const before=structuredClone(raw),value=projectCloudStatus(raw);
+ assert.equal(value.siteAuthorization,'revoked');assert.equal(value.slotState,'outcome-unknown');
+ assert.equal(value.pendingResources,true);assert.equal(value.requests.total,123);assert.equal(value.requests.sampled,1);
+ assert.equal(value.requests.unknownOutcomes,1);assert.equal(value.slotAvailable,false);
+ assert.match(cloudHostingSummary({...value,enabled:false}),/已关闭.*目标网站访问已撤销.*仍有待处理资源/);
+ assert.deepEqual(raw,before);
+ for(const unsafe of [undefined,'SECRET https://private.example','constructor','__proto__']){
+   const unknown=projectCloudStatus({...response,siteAuthorization:unsafe,slotState:unsafe,pendingResources:unsafe});
+   assert.equal(unknown.siteAuthorization,'unknown');assert.equal(unknown.slotState,'unknown');
+   assert.equal(unknown.pendingResources,null);assert.equal(unknown.slotAvailable,false);
+   assert.doesNotMatch(JSON.stringify(unknown),/SECRET|https?:\/\/|constructor|__proto__/);
+ }
+ assert.equal(projectCloudStatus({...response,requests:[{retirementState:'fenced',runState:'interrupted'}]}).requests.unknownOutcomes,0);
+});
+
+test('Debug reads and copies new facts without expanding its authority',async()=>{
+ const {document,map}=fixture();let copied='',reads=0;
+ const forbidden=()=>assert.fail('diagnostics must remain read-only');
+ const cloud={cloudStatus:async request=>{assert.deepEqual(request,{});reads++;return {...response,
+   siteAuthorization:'unknown',slotState:'preview',pendingResources:false,requestTotal:76}},
+   cloudNext:forbidden,cloudResolve:forbidden,cloudPair:forbidden,cloudApprove:forbidden};
+ const debug=createDebugWorkbench({document,client:{cloud},host:{start:forbidden},clipboard:{writeText:async text=>{copied=text;}}});
+ try{
+   await debug.refresh();map.get('debug-copy').listeners.get('click')();await Promise.resolve();
+   const value=JSON.parse(copied);
+   assert.equal(value.siteAuthorization,'unknown');assert.equal(value.slotState,'preview');
+   assert.equal(value.pendingResources,false);assert.equal(value.requests.total,76);assert.equal(reads,1);
+   assert.doesNotMatch(copied,/PRIVATE|SECRET|SENSITIVE|https?:\/\//);
+ }finally{debug.dispose();}
+});
```
