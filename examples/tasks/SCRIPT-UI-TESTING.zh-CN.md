# 标准测试页：通过原产品入口测试脚本 UI

本页记录 2026-11-17 的开发实测及复用方法，不是 production 验收。执行入口为真实 Side Panel「开发 → 直接编辑 → JavaScript → 自动化」，目标为 [demo-form.html](demo-form.html)，服务为 `http://127.0.0.1:43111/demo-form.html`。没有另建执行器，没有修改固定 Task 包、安装身份或授权。

## 复用入口

复用现有 43111 服务及开发 watcher，先核对原「调试 → 本地开发服务」和当前网页。把下列文件的完整源码放入原编辑器，在「运行选项」填写参数，读回目标、源码和参数后运行一次。默认 30 秒足够这些小场景；结果未知时只查询原 Run，不重放。

| 文件 | 参数 | 证明的用户行为 |
| --- | --- | --- |
| [form-ui-draft.js](form-ui-draft.js) | `{"name":"新的唯一标记"}`，1–40 字符 | fill 姓名、select 支持、提交一次、准确完成文字 |
| [modern-search-draft.js](modern-search-draft.js) | `{"keyword":"新的唯一标记"}` | 输入引起按钮重绘后重新定位、等待可用、只提交一次 |
| [demo-ui-operations-draft.js](demo-ui-operations-draft.js) | `{"scenario":"text"}` | 文本、testId 和列表读取 |
| 同上 | `{"scenario":"click"}` | 单次点击、文字展开再收起 |
| 同上 | `{"scenario":"async"}` | 同源 HTTP 成功等待及主动取消 |
| 同上 | `{"scenario":"locator"}` | 严格唯一性、作用域、禁用/只读/遮挡保护及延迟 DOM |
| 同上 | `{"scenario":"fetch"}` 或 `{"scenario":"sdk","url":"http://127.0.0.1:43111/request-sample.json?case=新的标记"}` | 分别操作网页 Fetch 和网页 OpenDeskSDK axiosx 通道 |
| [http-worker-axiosx-draft.js](http-worker-axiosx-draft.js) | `{"url":"http://127.0.0.1:43111/request-sample.json?case=新的标记"}` | Controller Worker 自身的 axiosx；不依赖网页 SDK |

点击、显隐和 Locator 场景从标准初始状态开始。需要下一轮时先收尾并保存当前原 Run/Result，随后只刷新自己的测试文档；不要重置他人页面。扩展重载后的旧网页 SDK 可能失效，新一轮须核对文档和 SDK 连接。

## 本轮结果

所有网页动作由上述脚本通过原产品入口执行。独立检查只读取网页 DOM；持久结果另由原「运行记录与下载」及其既有 `snapshotControllerRun` 只读查询核对，没有调用第二个执行入口。表单结果还经原界面下载了 Result JSON。

| 用户操作 | 使用入口 / 脚本 | 预期效果 | 实际效果 | 证据 | 状态 |
| --- | --- | --- | --- | --- | --- |
| 填写、选择、提交 | 开发 / form-ui | 唯一标记、support、准确完成文字 | `已提交：UI-1117-core-01a1e880`，support | R1；独立 DOM；原 Result 下载 | PASS |
| 动态搜索 | 开发 / modern-search | 重绘后搜索一次 | `结果：UI-1117-search-01a1e880`，完成，提交次数 1 | R2；独立 DOM | PASS |
| 文本与列表读取 | 开发 / operations text | 标题准确，3 项列表 | 周末阅读清单；3 项；正文准确 | R3；独立 DOM | PASS |
| 点击与显隐 | 开发 / operations click | 点击 +1，展开再收起 | 0→1，返回展开文字，最终隐藏 | R4；独立 DOM | 修复后 PASS |
| 异步成功与取消 | 开发 / operations async | HTTP 200 后另发一次并取消 | 成功文字准确；最终 cancelled / 已取消 | R5；独立 DOM 核对取消终态 | PASS |
| Locator 保护与等待 | 开发 / operations locator | 拒绝歧义、禁用、只读、遮挡；合法动作成功 | strict 拒绝；4 项超时拒绝；分区 B；只读值未改；解除遮挡后计数 1；延迟按钮被点击 | R6；独立 DOM | PASS（预期拒绝为保护通过） |
| 同源网页 Fetch | 开发 / operations fetch | 真实 HTTP JSON | success，200 OK，正确 JSON | R7；独立 DOM | PASS |
| 网页 SDK axiosx | 开发 / operations sdk，新文档 | 独立 SDK 请求 HTTP JSON | success，200 OK，正确 JSON | R8；独立 DOM；原生 frame documentId | PASS（新文档） |
| Worker axiosx | 开发 / 原 Worker 草稿 | Worker 自身请求 HTTP JSON | channel=controller-worker-axiosx，status=200，正确 JSON | R9；持久 Result | PASS（不代表网页 SDK） |
| 云控源码审阅→试运行→原 Run/Result | 日常 Chrome 原「云控」 | 可取得待审程序并完成原链 | 已配对、1 项批准、Provider backoff；列表未取得内容 | 本轮原生 UI 观察；未新增云请求 | BLOCKED，链路 NOT_TESTED |
| 第三方 HTTPS、production、完整矩阵、评分 | 未执行 | 本阶段不要求 | 无新证据 | — | NOT_TESTED |

R1–R7 目标 D1：`http://127.0.0.1:43111/demo-form.html`，documentId `7D73EB8F961FB1757997B696EB8EE944`。

R8–R9 目标 D2：`http://127.0.0.1:43111/demo-form.html?case=sdk-fresh-01a1e880`，documentId `86B263A998876DE5F6971DC54A89960C`。原生 `webNavigation.getFrame` 独立读回 D2 一致。两个文档均为 tabId `1114140566`、frameId `0` 的先后文档；没有拼成一个文档。

## 原 Run / Result 关联

以下成功 Run 均为 `completed`、`retirementState=released`、`workerRetired=true`；最终执行槽空闲。S3 是本轮分组运行时的历史快照，后续仅给网络场景增加可选唯一请求 URL，当前文件为 S4。历史源码保存在本机证据目录，不覆盖当前源码。

| 证据 | runId | resultId | 目标 / sourceHash |
| --- | --- | --- | --- |
| R1 | f1be3e58-c3e9-4732-af4c-d56b3cde78c3 | f7c7dd6a-533b-4f74-ac31-2255e5836973 | D1 / S1 |
| R2 | 7ba4c3bd-56d5-45db-a5ae-80cbc259bc92 | 77d793b6-b793-42ea-9b26-bdc5c7bd462c | D1 / S2 |
| R3 | 08003490-f3fc-42f0-8835-0492bc9f868a | 2ca2c3a4-72e3-4f9d-8832-dad2c88a22fc | D1 / S3 |
| R4 | 02ab926f-c93e-48e2-ad7f-ab082fb284b5 | 01dd053d-dfd6-491c-a136-1f35013f9957 | D1 / S3 |
| R5 | a759724c-656d-42bf-9869-7af78425eca8 | f0a7e93b-a2b0-420d-94a0-df3462894754 | D1 / S3 |
| R6 | fbebd1f3-10d0-4f72-820a-aa5041034873 | bfa229aa-14d3-4da5-a618-0b08daaa70b3 | D1 / S3 |
| R7 | 853974b3-d77f-4d90-8221-c3138d61f0d4 | a307a14f-ac64-45fc-b197-bb64ce543acb | D1 / S3 |
| R8 | 2591beb6-1838-4925-ad54-bdf4b9373ec6 | 9409e5fe-bcce-403b-924d-4f94c3992046 | D2 / S4 |
| R9 | f407c5c5-bc6e-45e9-b5d4-87cf50c874fb | d2621eb6-4147-4280-a240-70ced0676388 | D2 / S5 |

完整 SHA-256：

- S1：`298e2c62327be6cf3bfa17d2a0d8f603953df85ff34caca9776fe5772def05d4`
- S2：`1618934805a4104191be8e2005a608d0537a51ca65c1e291c8a8fb042ed34b2d`
- S3：`bd5355884cfb3e819030016c5e09093e5df77bec052fb236380ca2f51f982156`
- S4：`9ec9402aeb36d31d4b77834a53316a37d1a9186f7eb322bea8ce3e275193688a`
- S5：`8392c758fbe0d8d8e2c8c7f16a2c231269f88f15e8b5b3aca0e7643fe61afa08`

本机证据目录：`.runtime/script-ui-20261117-01a1e880/`（忽略的本机产物）。`original-runs-results.json` 保存原持久查询，`case-index.json` 关联并解码原结果；每个 Run 另存同名 JSON，`sources/` 保存精确哈希源码。`dom-*.json`、`old-document.png` 保存独立网页观察；`original-core-download.json` 为原 UI 下载文件。其 SHA-256 为 `acad06e00e2bb18174f6ec4d5d752f4382341cf1dbe20f282b1e507bf5d76bc8`。

## 最小修复、失败与边界

修复 `src/scripting/packaged/locator-dom.js`：可完整放入视口的控件若只有一小部分在视口内，走既有独立滚动提交，再重新解析、稳定性及命中检查。原按钮 y=-30.734375、底部仅剩 7.265625px，命中固定页头；旧实现持续等待遮挡而未滚动。没有跳过遮挡、禁用、只读、授权或文档围栏。超过视口尺寸的元素保留可命中交集，避免永远滚动。

新增同 owner 回归先在旧实现失败，再在修复后通过。定向验证命令：

```sh
node --test --test-name-pattern='partially clipped|ARIA readonly|disabled click|duplicate semantic|lost commit callback retains|authority revoked after|precise document replacement|subpixel movement|admitted driver stages' tests/framework/r5-modern-page-api.test.mjs
```

9 项通过，覆盖当前滚动修复及受影响保护。修改模块、两份草稿的语法和 diff 格式检查通过。未运行全组测试或全量构建；复用现有 watcher。开发产物 source map 中的 locator 源码与本次源码一致。

保留两条修复前超时 Run：`d5f2164e-a79b-40e0-bc78-2419bc1ea167`（组合场景，未单独定位每一步）及 `0d83fdb6-8fed-4cff-8e8a-5a3033bf7fd7`（点击场景）；均 E_TIMEOUT、stopped、released。第一处已定位的真实失败是后者的部分视口遮挡；不将组合超时的全部原因作推断。

旧文档 SDK Run `8230de46-de33-4dda-9887-e42891554a88` 的 Result `21e8d91d-d2c5-4190-ac1d-770cedad923d` 虽已持久完成并释放，但业务值为 `state=error`、`E_EFFECT_UNKNOWN: Extension context invalidated.`，不能算网络成功。未重放原请求；保存后在新文档用新的 query 标记执行独立用例 R8。

开发运行时两种浏览器均观察到扩展 ID `ccfcjegpkdlgbclopjmadlcjedelidmf`、serve 已连接、revision `7212b21e4335b81b2d638897691393e8591389d3265b1437e684f3530d72aecf`。磁盘开发输出为 `dist/development`；Chrome 实际 unpacked 加载目录未独立核实，不以 revision 代替路径证明。原 43111 服务和 watcher 均未由本任务启停或覆盖。

ego 的安装未配对云控；日常 Chrome 原安装已配对且保留 `sample.form-fill@1.0.2` 的批准，当前显示需要重新验证、Provider backoff、执行槽空闲。未改变这些状态，未恢复远端 BFF 绑定；其精确 pin 当前接受情况未验证，不能沿用旧 README 的可用结论。

云控「待审核程序」负责取回并审阅固定源码，单次试运行仍使用原 Controller Worker，查看结果打开原 Run。它不自动安装或授予长期云控权；验证安装后的任务出现在「我的」，远程调用另依赖原云控批准。「开发」草稿和「我的」已安装任务、云控交付并非三套执行器。本轮只完成本机草稿动作和原结果核对；云控完整审阅链、安装任务运行及 Native Messaging 均未据此提升为通过。
