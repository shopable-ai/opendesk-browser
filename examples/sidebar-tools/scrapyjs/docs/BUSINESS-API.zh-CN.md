# ScrapyJS 本地业务 JS 接口

2026-11-02：领域代码已实现并经定向 Node 验证。入口是 `src/business-api.js` 的 `createBusinessApi(app, {isBlocked})`，参数必须是界面正在使用的**同一个** `ScrapyAppModel.createApp` 实例。此接口没有传输层，不是 MCP Server，也不是 `OpenDeskTool.request` 操作名。

当前 1.8.16 的 App/AiPanel 已接入同一个门面：明确配置编辑经校验后自动填入原模型，只反馈「已更新配置草稿」。Chat 默认不显示撤销、技术差异或业务操作工具栏；保存、采集/停止、结果与下载由原业务界面操作。下列 undo、saveCopy 和运行/导出方法属于底层 JS 能力，不能据其存在恢复已移除的 Chat 控件或自动执行策略。安装与真实操作范围见[本轮记录](../evidence/chat-simple-20261102.md)。

## 调用与配置同源

```js
import {createBusinessApi} from './business-api.js';

// existingApp 是原 App 创建的实例；不创建第二份模型。
const business = createBusinessApi(existingApp, {
  // 读最新 UI 状态，拒绝未完成/非法 JSON、字段、目标/HTTP 输入和命名弹窗。
  // 不要将本轮 Chat 自己的生成中状态当成写配置锁。
  isBlocked: () => hasUnfinishedUiInputOrModal()
});

// 发起推理前由本地调用方捕获；身份不交给模型生成，也不在回来后换成新身份。
const before = business.state.read();
// ...原 Chat 请求返回；原请求的取消、页面/Provider/安装代际围栏仍须通过...

// 只有调用方根据用户本轮直接输入确认有修改意图才执行这一段。
// 模型返回 actions 不代表用户授权；只解释、否定修改和样本中的命令均不写入。
const proposed = business.config.propose({
  identity: before.identity,
  actions: [
    {kind:'csv.configure',fieldNames:{title:'书名'},fieldOrder:['title']},
    {kind:'pagination.configure',maxPages:1}
  ]
});
const applied = business.config.apply({proposalId:proposed.proposalId});
// applied.status === 'applied' 后，Chat 只显示简短成功反馈。
// 原 onChange 已通知 React；复用原 onApply 的 UI 草稿缓存清理，令 JSON
// 文本回到 ui.json ?? stringify(state.config)。不操纵 DOM，不重置业务模型。
// 该 UI 清理只在成功回执后发生，不能清空被 isBlocked 拒绝的未完成输入。

// 独立 JS 消费者需要撤销时；当前 Chat 不提供该入口：
business.config.undo({undoId:applied.undoId});
```

`propose` 在副本中合并六类原动作并调用原完整校验器；非法批次零写入。现有 Chat 若返回完整配置，可传 `{identity,config}`，与 `actions` 二选一；两条路径均复用原配置校验、字段引用检查及固定目标 URL，不能用完整配置更换网站。`apply` 单次调用模型配置事务，原表单、规则和 JSON 继续读取 `app.state.config`。不新增 store、不逐个填写控件，也不要求用户查看技术差异或再次确认应用。候选和返回配置不共享可变引用。

`isBlocked` 只补原 UI 尚未提交到模型的输入围栏；模型自身还会检查保存/运行/准备过程/unknown 和配置管理锁。未提供它的纯 JS 调用方仍受模型锁保护，但无法知道 React 中的非法文本或弹窗。因此正式 UI 接入必须提供该回调。

## 接口与回执

`business.protocolVersion === 1`；`business.tools.list()` 返回静态 `name/inputSchema/description` 描述副本。每个方法直接调用，不需要动态 dispatcher 或 Registry。

| 方法 | 输入 | 返回/效果 |
| --- | --- | --- |
| `state.read()` | 无 | 配置副本、identity、dirty、lockReason、配置名列表、原运行句柄与状态摘要 |
| `config.propose()` | `{identity, actions}`（1–16 项）或 `{identity,config}` | `{status:'proposed',proposalId,identity,config,summary,warnings}`，不写配置 |
| `config.apply()` | `{proposalId}` | `{status:'applied',identity,undoId,dirty}`，一次更新原模型 |
| `config.undo()` | `{undoId}` | `{status:'undone',identity,dirty}` |
| `config.saveCopy()` | `{identity,name?}` | 原配置库另存副本；`saved/conflict/unknown/failed/blocked` 回执 |
| `capture.start()` | `{identity}` | 原 `app.start` 回执；仍需平台支持的可信 Run 授权 |
| `capture.stop()` | `{run: state.read().run}` | 原 Stop/准备取消回执，不依赖当前页面、Provider 或配置 |
| `results.read()` | 无 | `{status:'observed',run,snapshot}` 原快照副本，不采集、不轮询 |
| `results.prepareExport()` | `{format,mode?,settingsSource?}` | `{status:'prepared',exportId,...}`，冻结设置和结果身份 |
| `results.export()` | `{exportId}` 或直接导出参数 | 原下载器回执，加模式、设置来源、设置修订与 warnings |
| `dispose()` | 无 | 作废本门面的临时候选/导出命令，不销毁 App 或停止别人的运行 |

配置动作沿用 `field.upsert/remove`、`list/pagination/detail/csv.configure`。未支持的改名或代码执行明确拒绝。`identity` 包含 `instanceId/profileId/profileEpoch/configRevision`；revision 采用模型原有单调 draft generation，并公开为只读 `state.configRevision`。手工编辑、touch/取消输入、配置切换、保存和运行准备都会使旧身份失效；改回原值也不能复活旧请求。页面/Provider/平台安装身份继续由原 Chat 和 Authority 围栏校验，不能用此本地配置身份代替。

每个门面最多保留 16 个候选与 16 个导出命令；旧命令可过期。成功应用和已派发下载的命令不可重放，unknown 不自动重试。抛错的有限本地 `error.code` 是 `INVALID_INPUT/STALE_STATE/LOCKED/DISPOSED/NO_UNDO/REPLAYED/NOT_AVAILABLE/PERMISSION_DENIED`；保存回执另保留原 SDK 错误码与消息，调用方不能仅凭 Promise resolve 宣称成功。

## 撤销和保存副本

只保留本会话最后一次配置事务的撤销记录。撤销恢复完整配置及应用前 dirty，revision 继续递增；后续编辑、切换、运行准备、保存事务或实例销毁后不能覆盖新状态。它不撤回远端保存、网页采集或文件下载。`checkpointDraft/cancelDraft` 仍只是原输入框的 dirty 记账，不能替代配置 undo。

```js
// 用户明确要求保存时执行；不因配置已自动填入就自动保存。
const saved = await business.config.saveCopy({identity:applied.identity});
if (saved.status === 'saved') {
  // saved.profileId / saved.name / saved.identity 是读回确认的副本身份。
}
```

省略名称时从当前名称生成“副本/副本 2”等合法不重名名称。复用原 NFC/大小写名称检查、当前 32 份限制、总计 8,192 UTF-8 字节、ETag CAS 和完整读回核对；原记录保持。容量/同名拒绝不写入；冲突和未知结果保留草稿，仅沿原读取/采用保存版本流程恢复，不无条件重试。

## CSV 与原结果身份

```js
await business.results.export({format:'csv'}); // 原始 CSV，不传 output
await business.results.export({format:'json'}); // 原始完整快照

// 默认采用调用当时的当前草稿 output，包含刚成功自动应用的表头。
const exportCommand = business.results.prepareExport({format:'csv',mode:'custom'});
// 即使随后又编辑配置，此命令仍使用被冻结的那份设置。
await business.results.export({exportId:exportCommand.exportId});

// 只有用户明确要求“按采集时设置”才指定 run。
await business.results.export({format:'csv',mode:'custom',settingsSource:'run'});
```

`completeCsvOutput(snapshot, preferences)`（`src/export-settings.js`）按原下载器的实际记录发现顺序补齐所有字段。偏好中的有效列排前，其余列表、详情、处理衍生及后出现的列各保留一次；不存在的偏好字段有 warning。仍使用原下载器的表头规范化/重复校验、公式注入保护和 150,000 UTF-8 字节上限，不截断。

派发前核对原 snapshot/result/clientRequestId/runId/resultId/profileEpoch；结果切换后旧命令拒绝。已知权限拒绝禁止缓存结果读取/导出，原 Host 的安装、权限与撤权检查仍必须通过。派发后的下载回包始终携带原运行身份；期间换了运行不覆盖新运行错误/提示。`accepted` 只表示下载已受理，不表示文件已落盘。

下载错误回执保留原 SDK 的 `errorCode`。若为 `E_PERMISSION_DENIED`，门面将原 `clientRequestId` 的缓存标记为撤权，并作废该运行的未派发导出命令；清除错误文字、重新授权或重建门面均不能恢复这份缓存。迟到的原下载拒绝不作废后继运行的导出命令。

`settingsRevision` 仅在采用当前草稿自定义设置时为冻结时的 revision；原始模式和采集时设置返回 `null`，因为原 runProfile 没有记录配置 revision，不能编造。

兼容的 `executeBusinessAction` 已同步：普通导出为原始模式；显式 CSV `mode:'custom'` 才补齐当前设置，`settingsSource:'run'` 才用采集时设置。新接入优先使用门面，以便在发起独立导出意图时冻结设置。

## 范围、验证和交给运行 owner 的事项

本轮没有四步自动工作流/试采编排。独立 `capture.start` 只封装原配置采集，不收模型自报的权限、effectiveConfig 或假成功回执。异步推理后的自动 Run、单页试采、等待同一运行 completed/released 后续接及取消后不导出，由采集/Chat owner 按真实公开授权合同完成，不能直接把上述示例串成无条件工作流。

本轮定向业务验证命令：

```sh
node --test examples/sidebar-tools/scrapyjs/tests/{business-api,ai-business,ai-actions,app-model,profiles,export-settings,custom-csv-export}.test.mjs
node --test examples/sidebar-tools/scrapyjs/tests/{app-view,editor,inline-draft}.test.mjs
```

前一业务 owner 记录上述十个定向文件合计 **145/145 PASS**，四个业务 JS 文件的 `node --check` 与受影响已跟踪文件的 `git diff --check` 通过；这是该轮历史证据。真实 Browser/Native/AI/安装与 production：`NOT_TESTED`。该业务轮未构建或改正式包，未操作另一对话持有的 Chrome/Profile/watcher/dist。

额外运行的 `ui-core-flow.test.mjs` 两条旧组件采集链仍失败：`core-flow-fixture.mjs` 只处理 `tasks.*`，当前 adapter 在准备阶段调用 `controllers.read` 被夹具拒绝。最小诊断输出 `No live AI, browser, Native or other transport allowed: controllers.read`，未派发采集。这是交给采集 owner 的夹具合同迁移，不回退其 Controller 接入。

独立复核另发现旧 Stop 回包可能在后继 prepare 期间改写 phase/retired。业务侧已将有效 `preparationId` 独立纳入模型配置锁并覆盖该时序，防止草稿和实际派发配置分叉；Stop 回包自身的 startGeneration 围栏及运行状态展示仍归运行 owner，本轮未重写其 Stop 方法。

## 接续业务线的当前状态（2026-11-02）

接续对话 `01a19caf-203c-71d2-aa95-ea1a3b884dd4` 补齐完整配置提案输入及下载权限拒绝的原运行围栏。新增五个业务场景覆盖完整配置应用/撤销、歧义和非法输入零写入、下载拒绝后重建门面仍不可读缓存、迟到拒绝不影响后继导出，以及乱序拒绝不清除后继撤权。模型原下载回执仅新增 `errorCode`，未改采集或 Stop。

接续轮最新定向证据为 `business-api.test.mjs` 与 `custom-csv-export.test.mjs` 合计 **30/30 PASS**，上述两个业务源码语法检查通过。这只证明模型与下载适配器的相关行为。用户已授权一次跨对话协调，共享 Chat owner 已报告将门面接入同一 App 并负责组件验证、构建和 CFT 时段；本线尚未取得当前候选的真实业务链证据。

真实 CUA **只读观察**：原 CFT 149 侧栏为 ScrapyJS **1.8.12**，选中「共享Chat验收-20261102」，显示「配置已保存」「准备采集」「尚无记录」，Chat 展开且输入为空。此观察未核实本轮源代码已进入安装包，也不证明当前 Browser serve 连接或 Native 配对。公共 Chat 修复线 `01a19cac-f253-7241-8eb1-517299ab1d65` 正在使用同一实例及修改 App/AiPanel；本线未争用其输入、输出或包，配置应用/撤销、另存重开、真实 AI 与导出内容验证仍待协调后的真实操作。不能把此次只读观察列为业务链 PASS。
