# R7.2 续接：已知 HTTP 错误与候选身份

本轮修复了真实 Chrome 中发现的缺陷：SDK 已完整收到 404/429/500 响应，却将运行保留为未知效果。现在只有受信 HTTP Driver 的完整响应回执能在同一事务中生成持久 `sdk-result.httpErrorWire` 并完成运行；交付错误正文前仍核对 document、grant、网站权限和 deadline。恢复或重复请求只返回已保存的 E_HTTP，不重发网络效果。超时、传输失败、无效 JSON 或仅抛出一个携带 response 的错误仍保留未知效果。

当前 PR 相对集成基线仅修改 `sdk-broker.js`、`sdk-methods.js`、对应 Broker 回归测试和本文档/README。未修改 Controller、共享 Network Driver、公开 SDK 方法、依赖或签名任务包。原始回执在 [独立证据目录](../evidence/r72-resume-20261009/)，索引为 `evidence-manifest.json`。

## 两个候选，分别计证据

| 候选 | 身份 | 验证 |
| --- | --- | --- |
| 完整 R7.2 HTTP 页面冻结候选 | `c44d441d17de2c3b64fa9fec32dae86323a8203c`，基于 `31056c6766fe23731ada9c37832b9171e5edabcc` | SOURCE、NODE、BROWSER、限定 NATIVE 已验证；364/364 定向测试、check、两种构建与 verify PASS |
| 面向最新 main 的 SDK 修复 | 产品提交见 `integrated-candidate-identity.json`，整合 main `5769730beb9fddc6fc788a2702409ec06076feac` | SOURCE、NODE 已验证；362/362、check、两种构建与 verify PASS；新构建 NATIVE NOT_TESTED |

冻结候选开发包 hash：`130340c8eec325a4adcd0054f490d56b34e5250c8b2faf62bbaa2709371094b9`；生产包 hash：`b30bedc944d28cd66ee219eec4fb49dec9c41a3a5b7835485346b28a085beea2`。原始构建 receipt 生成在提交前，`frozen-candidate-identity.json` 已逐文件验证其全部 122 个 product input 与 c44d441 相同，且独立记录 HTML/示例/测试 hash。没有重写 receipt 的旧 SHA。

集成候选开发包 hash：`4ac266f044e8e927f7aa972f880a08009b473150e22e22558c1fe62f6e1d97b6`；生产包 hash：`58c37fae95f0c2fb739b87cbb93d37c52b12fd5fb5db1b7679741567df71d67d`。其 sourceInputs 全部匹配当前产品文件，构建期间没有源码漂移。第三个隔离 CFT 已启动并检查实例，但 CUA 报告 Mac 锁定、自动解锁失败，尚未完成可信用户批准；不能将冻结候选的 NATIVE PASS 移到此包。

PR #20 在本轮期间已由其他集成流程合入 native 分支，再进入 main。最新 main 的 README 明确要求极简 Fetch GET 页面，已经移除 SDK/POST/响应控件，与本次完整 R7.2 合同冲突。没有覆盖新的 Lab 页面或放宽旧合同；当前集成修复保留 main 页面。完整 HTTP 候选和测试仍可从 c44d441 恢复。产品收敛问题已向用户提出，尚待明确；这不是一个已关闭的 R7.2 页面验收。

## 冻结候选实际证据

| 能力与等级 | 实际结果 | 原始证据 |
| --- | --- | --- |
| 网页 Fetch，BROWSER | 真实同源 GET 200、超时与取消；服务端记录 `closed-before-response` | `final-ui-fetch-timeout.json`、`final-ui-fetch-cancel.json`、`http-requests.jsonl`；同源 GET 的前轮原始证据保留在旧工作流 |
| MAIN SDK，NATIVE | 精确 document/network 原生批准，SDK GET/POST 200；404/429/500 为 E_HTTP 并有持久结果 | `final-sdk-install.json`、`final-native-get.json`、`final-native-post.json`、`final-sdk-http-errors.json`、`final-sdk-http-errors-db.json` |
| 精确 43111→43112，BROWSER / NATIVE | 自己的两个 Node 服务；原生 Fetch 被 CORS 拦截；SDK 未批准拒绝且无新增目标请求；原生批准目标后 JSON 200 | `cross-network-events.json` 的 `MissingAllowOriginHeader`、`cross-native-sdk-denied.json`、`cross-approved-install.json`、`cross-native-sdk-approved.json`、`http-requests-43112.jsonl` |
| Worker 重启，NATIVE | 自然休眠/重启后旧跨源 grant 的 `crossOriginActive` 为 false，closeReason=`worker-restart-reapproval-required`；保留 SDK 拒绝 E_GRANT_REVOKED；重新原生批准后 200 | `cross-native-db.json`、`cross-after-worker-idle-db.json`、`cross-retained-after-worker-idle.json`、`cross-native-sdk-reapproved.json`；没有使用任务管理器结束进程 |
| 网站权限撤销，NATIVE | Chrome 扩展详情页撤销权限；浏览器 origins=[]；真实保留对象 E_PERMISSION，pending/timers=0 | `site-permission-native.txt`、`site-permission-after.json`、`retained-sdk-after-site-removal.json` |
| 导航，BROWSER / NATIVE | 新 documentId，不继承旧 SDK 或保留变量；未在跨 realm 重新调用旧对象 | `final-new-document.json`、`final-new-document-native.json`；跨 realm 旧对象调用 NOT_TESTED |
| UI 竞态，BROWSER | 非法 POST JSON 不发送；改 URL 后旧结果不覆盖新结果；SDK stop 仅停止展示，后台 HTTP 仍完成 | `final-invalid-json.json`、`final-ui-late-url.json`、`final-ui-sdk-stop.json`；POST 正文编辑退役另外有红→绿 Node 回归 |
| Controller Worker，NATIVE | 独立 GET 200；独立 E_PERMISSION 和 E_NETWORK 两项 failed/released，不混入成功组合 | `final-worker-get.json`、`final-worker-permission-result.json`、`final-worker-no-listener-result.json`、`final-native-db.json` |
| 正式 Page API，NATIVE | HTTP 草稿通过真实页面动作返回 200、正文、headers，两次 completed/released | `final-http-draft-input.json`、`final-http-page-api.json`、`final-http-page-api-repeat.json` |
| 原签名任务，NATIVE | 精确源码草稿→精确 runId 核证→Available→安装；安装版本两次填写 Alice，completed/released | `final-form-draft-input.json`、`final-form-catalog.json`、`final-form-installed-db.json`、`final-form-installed-repeat-db.json` |
| 现代搜索，NATIVE | fill 覆盖预填值，重建按钮后点击/等待，重复仅各增加一次 | `final-modern-search-input.json`、`final-modern-search.json`、`final-modern-search-repeat.json`、对应 page 快照 |
| 布局与文本安全，BROWSER | CFT 视口模拟 1280/390，scrollWidth=innerWidth；原生 Tab 焦点可见；JSON XSS 字符串/HTML 响应以 textContent 展示 | `viewport-1280.png`、`viewport-390.png`、对应 JSON、`keyboard-focus.json`、`final-native-json-safety.json`、`final-native-html-safety.json` |

这些都是冻结候选的限定本机证据；没有替代独立最终 F3、ZIP 安装一致性、原 603＋19、B05、1000 mixed/10 reconnect/两轮禁插件或六项资源 baseline。

## Controller 持久身份

下表均从完整原始 IDB 读取，并使用官方 codec 解码；每条自身 revision.sourceHash 均与所运行示例一致，retirementState=`released`。

| 实际功能 | runId | resultId | 终态 |
| --- | --- | --- | --- |
| HTTP Page API | `451fb04c-eaa0-4fbd-8abb-7d13cb01d514` | `02b157ef-fcd6-4ea1-81f4-e8cbc96761bd` | completed |
| HTTP 重复/reset | `bbcc66e7-d715-450a-aa72-9e3a75dc3a52` | `ed999215-c2c7-4856-9648-4b06f9d2703e` | completed |
| Worker GET | `c4877dee-5ed2-4a68-9327-43163c89c519` | `324a27c9-748c-4183-8ebb-3d6e1a0c7f04` | completed |
| Worker 未授权 | `da98827f-0f9d-4c64-927a-094659e31453` | `64889cf1-0f59-41da-8327-11cb4cfa150e` | failed E_PERMISSION |
| Worker 无监听 | `a1b84ee3-9001-423c-a549-a94f0bbb2000` | `574c4bc8-93d0-48a4-a436-75ba3403a3e7` | failed E_NETWORK |
| 现代搜索 | `d01c6139-85ff-4a9d-9685-29040a4c4eb5` | `89418f93-b41f-4578-8c5b-eeeec1ef79f4` | completed |
| 现代搜索重复 | `1bc8b836-dfe7-440f-8a62-96c2845acf4c` | `bdea5532-5a68-4570-b0b4-47a720b69b33` | completed |
| 原签名草稿 | `9767ea28-39bc-4a1a-ba90-c743dcca24f2` | `84c3b6da-c891-4d87-aba4-55c3732ad988` | completed |
| 安装任务 | `c96d33a9-babd-4868-a686-0c3cf6f253b4` | `1af2f9a8-5ae1-4562-96a4-215850f980a9` | completed |
| 安装任务重复 | `5586af13-fe62-4990-98ea-50771ecc39c7` | `40374495-17e9-4e29-be1e-502add016345` | completed |

HTTP 草稿 hash=`653bdf813467a8b7859ebd360477728bcaa835ed252ee462fcaf4f6999a15926`；Worker 示例 hash=`b8ce4564121a957d0a401593eb77aba5ac7af04b4d93763e0b2639a8094f2bd1`；现代搜索 hash=`1618934805a4104191be8e2005a608d0537a51ca65c1e291c8a8fb042ed34b2d`；签名任务 sourceHash=`1f72cf17aa04e8a8597ef43e554ae5507f9da58b73e46d731373cd318f6dcf63`、manifestHash=`57598844f11f75d7566c5adeab283a3aaed0614d151590a6f34124e7abf3632a`，未修改。

## 验证与边界

Node 回归先在旧实现确认失败，再修复通过，日志 `sdk-regression-before.log` / `sdk-regression-after.log` 和页面 `regression-before.log` 已保留。Broker 测试验证真实 admission/result/digest 身份、GET/POST 非 2xx 的一次网络效果、恢复结果、交付前撤权，以及伪造 E_HTTP/无效 JSON 仍未知且禁止重放。只读审计没有发现新的 SDK 阻断项。

冻结候选完整定向命令与当前集成命令均为：

```bash
node --test tests/framework/k2-sdk*.test.mjs tests/framework/k4-sdk*.test.mjs tests/framework/k4-network*.test.mjs tests/framework/k3-controller-authority.test.mjs tests/framework/k3-context*.test.mjs tests/environment/basic-browser-page.test.mjs tests/environment/basic-browser-http.test.mjs
npm run check
npm run build
npm run build:dev
npm run verify
```

源码与手写文档的 `git diff --check` 通过。原始 WXT/Chrome 日志中的空格、ANSI 输出和原生快照空行保持原样；没有为消除日志格式提示而改写原始证据。

冻结候选先前失败的 offscreen 现代 Locator reset 已保留原始 stopped/released 回执；改为兼容 `page.click('#reset-all')` 后 HTTP 草稿通过，不将其推断为生产 Locator 自动滚动缺陷。旧候选的 HTTP unknown 行、SDK timeout 的 paused_unknown、旧回执与旧 profile 证据均保留，没有迁移成新 PASS。SDK「停止显示结果」没有变成网络取消能力。安装任务的整浏览器重启、停用/卸载矩阵、完整 Save 输入与单一 native ack 并未在此轮最终阶段重新验证，不能据此正式关闭那些合同。

每次只使用自己的 CFT clone、fresh profile、准确 PID 和扩展 dist；所有 UI 使用原生 CUA。CDP 仅用于只读观察、经授权的真实 MAIN SDK 调用和标注过的视口模拟。第一次发现 43112 被其他 Python 占用时没有停止它；它实际退出后才运行自己的精确端口组合。第二次释放 43111 后，新 Python PID 78850 接管，保持其进程与 main 工作目录不变。释放记录见独立资源 JSON。

当前保留 Draft。剩余：明确 R7.2 与最新极简 GET 页的产品合同；Mac 解锁后，验证当前集成包的可信 SDK 安装与完整 HTTP 错误持久结果；按 PR 当前 HEAD 核对 CI。发布、main 合入、最终 F3 和 ZIP 安装不在此次已通过声明中。
