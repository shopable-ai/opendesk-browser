# R13 CI 分类（只读诊断，2026-10-22）

结论：这 25 项失败首先指向 **R21 授权合同与离线 fixture 未同步**，不是已证实的 Chrome/Provider 故障，也不能仅归因于缺少 continueWith。首轮 folder.create 在 SDK dispatch 前就会被默认授权守卫拒绝。相对 a36689ac，该阻断路径已存在于其父版本；其引入点是 05218b090。没有取得更早一次同场景 CI 的成功/失败证据，不能称为“长期旧 baseline 故障”。

## CI 已观察事实

- [run 39698306875 / job 119561032815](https://github.com/shopable-ai/opendesk-browser/actions/runs/39698306875/job/119561032815)，候选 `a36689ac0ecad72ad378144ad39812a72d31ef62`。已直接读取 GitHub job 原始日志，并对照本地 [摘录](/Users/shopme/Documents/workspace/opendesk-browser/artifacts/bookmark-agent-r211-followup/ci-r32-react-failure-excerpts.log)。
- 00:14:36Z，R304 五 width PASS；00:14:37Z 启动 R13；00:17:55Z 输出 15 PASS / 25 FAIL。
- 24 个 width/theme/zoom 组合均在 `conversation-r13-chrome.mjs:193` 等待 entry>=3 超时；另一个 R15 case 在 :249 等待文件夹可见超时。不是 25 种独立根因。
- 驱动第 2 行明确数据/AI 为 MOCK；R304 CRUD PASS 也只是这个隔离 fixture 的证据，不能替代真实 Native 验收。

## 首轮阻断的源码链（高置信度；不是重新运行浏览器所得）

1. [offline request](/Users/shopme/Documents/workspace/opendesk-browser/examples/sidebar-tools/bookmark-manager/preview/react/src/main.jsx:40) 等待 800ms 后，只返回 `{proposal:mockIntent(request),metadata:...}`（:53）。没有 authorization。两个失败句式均被 mockIntent 匹配为合法 folder.create；主矩阵还包含后续 bookmark.create。
2. [App](/Users/shopme/Documents/workspace/opendesk-browser/examples/sidebar-tools/bookmark-manager/src/react/App.jsx:328) 将 `initial.proposal` 交给 loop，:330 仍传 `expectedTree:tree`，但 :331 的 `beforeWrite:authorization?.assertWrite&&beforeWrite` 得到 undefined。mode=preview 不会触发 :302 的 trusted-only 授权字段前置检查。
3. [loop 默认参数](/Users/shopme/Documents/workspace/opendesk-browser/src/ui/conversation/bookmark-agent-loop.js:67) 对 undefined 使用默认拒绝回调，抛 `E_MODEL_GRANT_REQUIRED`。
4. [executeBookmarkPlan](/Users/shopme/Documents/workspace/opendesk-browser/src/ui/conversation/bookmark-actions.js:217) 在 write() 的 :220 先 await beforeWrite，:221 才设置 issued=true，之后才调用 Service。因此授权拒绝时没有发出 SDK create；错误保留 writeIssued=false。不存在“创建已完成，只是等待 complete”的必要前提。
5. entry>=3 原本依赖至少一个已验证动作消息。首轮拒绝只会走用户消息/错误收尾，足以解释主矩阵首个超时；同一拒绝也解释 R15 没有新文件夹。CI 日志只有超时，没有直接打印该轮 E_MODEL_GRANT_REQUIRED 或写调用计数，故这是确定源码链支持的归因，未冒称读取了失败页面的错误文本。

## expectedTree 与 public mock contract 核对

- [初始 context](/Users/shopme/Documents/workspace/opendesk-browser/examples/sidebar-tools/bookmark-manager/src/react/App.jsx:278) 从当前 tree/selection 固定目标；驱动 :161/:246 选择的是 editable fixture folder 10，不是锁定根。
- [mock getTree/create](/Users/shopme/Documents/workspace/opendesk-browser/scripts/preview/bookmark-manager-mock.js:107) 提供 `{nodes,snapshotRef,nextCursor}`，:119 create 接受 Service 发出的 `{title,parentId,url?}` 并返回真实 fixture 记录/id；[Service](/Users/shopme/Documents/workspace/opendesk-browser/examples/sidebar-tools/bookmark-manager/src/service.js:60) 正常消费该分页合同并构造树，createFolder 在 :130 起自行 load/校验目标。
- [requireFresh](/Users/shopme/Documents/workspace/opendesk-browser/src/ui/conversation/bookmark-actions.js:204) 比较 expectedTree 与 fresh tree 的 id/title/url/parentId。同一个无外部修改的 fixture 数据源、已存在父目录 10 没有可见的签名冲突证据；同计划新创建的 folder 由 confirmedInTurn 放行后续引用。不能据此断言所有 public contract 兼容，但目前没有 expectedTree 导致这 25 次失败的证据。
- :337 缺少 continueWith 时，preview 会返回明确的离线 question；这发生在首轮动作之后。它会限制完整 R21 连续决策证明，却不能单独解释首个 entry>=3 及 folder-visible 超时。

## 历史与本轮新增边界

- `git show e4c216634 -- .../src/react/App.jsx`：引入 App→runBookmarkAgentLoop，传入条件式 beforeWrite；当时 loop 默认 beforeWrite 仍是空回调。
- `git log -S E_MODEL_GRANT_REQUIRED -- src/ui/conversation/bookmark-agent-loop.js` 和 `git show 05218b090 -- .../bookmark-agent-loop.js`：05218b090（06:34:11 +08:00）将默认空回调改为拒绝写入；offline fixture 没同步提供授权。这个组合直接产生上述阻断。
- a36689ac（08:12:26 +08:00）只改 loop 重试判定、requestChatCompletionJSON HTTP metadata 和 R21 测试；没有改 fixture、App、executeBookmarkPlan 或该默认拒绝。E_MODEL_GRANT_REQUIRED 不在新旧重试白名单中，首次执行也发生在 retry catch 之前。因此没有证据把这 25 个超时归因于 a36689ac 新增的 T7 判定。
- 历史定位证明“a36689ac 之前已有同一源码不匹配”，不证明父提交的 CI 已跑过并出现同样 25 FAIL。R13 报告源码中仍硬编码的旧 URL/root 缺口说明也不能作为本轮运行根因；当前驱动已经选 folder 10 并用 canonical URL。

## 最小修复建议（未实施）

1. 优先修 `preview/react/src/main.jsx`：在离线 request 返回中明确提供仅服务该 in-memory mock、随本轮 signal/生命周期失效的 fixture authorization/assertWrite。保持 offline_fixture/nativeVerified=false 标签。不要改生产 loop 的缺授权默认拒绝，不要借用真实 Host/Native 授权。首个超时的最小修复不要求先造新 Provider 或实现完整 continueWith。
2. 驱动 :193/:249 等待时同时读取当前轮错误/终态；遇到明确拒绝立即报告该错误，而不是只给 6 秒 Timeout。用动作回执及 fixture 节点读回判断成功，entry 数只作为呈现断言。现有预览 fallback 可继续明确返回 question；若要声称 R21 自动完成，再另补有界 fixture continuation/complete，不能把固定句式模型当真实 Provider。

仅写此报告；未修改产品/fixture/driver，未运行测试、浏览器、构建或模型。真实故障修复及重跑仍未执行，当前 CI 仍应保留 FAIL。
