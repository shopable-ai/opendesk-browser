# OpenDesk ESM R2.2：Examples、Native 与真实 Chrome 验收

2026-10-11。以下 PASS 只覆盖明确列出的输入、执行链和场景；原始回执及截图保留在 `.runtime/`，不进入版本控制。

## 1. 仓库、提交与验收身份

Browser 仅在 main 工作。实际验收候选的已提交源码 HEAD 为 `6f763f08b4c8df894a7e299f95f88015612416a9`；整理报告时 main HEAD 为 `2ff4ee317fa8fdfe2afe873a04d0c15fe4991c30`；本任务技术提交为 `c878687b5ec3f25c2c3476e8993e265e28513c1e`。Go 默认分支核实为 master，当前 HEAD `9615110725e514b6f607740174cbf7b427654ff9`；四个直接相关 Native 修复已普通推送，远端 SHA 核实一致。未创建分支、Worktree 或 PR，未强推、reset 或 clean。
Browser 本文后置提交的最终 SHA 与推送状态由最终回复及 `.runtime/esm-r22-01a1296d/git-delivery.json` 补充，避免文档自引用提交 SHA。其他 Agent 的文件、共享 43111 服务器、日常 Chrome/Native 安装均保留。

以下 E 表示仓库根目录下 `.runtime/esm-r22-01a1296d/`；C 表示其中 `candidate-merged/`。C 是独立 git archive 验证快照，不是 Worktree；原归档 a735d30b 和后续已提交源码更新、验证覆盖层分别登记，未改写共享 dist。
初始覆盖层见 `E/validation-overlays.json`；后续更新见 `candidate-updates-attempt8.json`、`candidate-updates-final-delivery.json`、`candidate-updates-final-merged.json`。最终逐输入绑定见 `E/final-product-input-binding.json`。

|构建|receipt attemptId|packageHash|编译输入数|
|---|---|---|---|
|production|`81612635-9601-4004-817c-41b5010813e6`|`9a77b978f223e061e404cf6a94cad1537acd4604ec8722c0c29206b464cfb34a`|256，与已验证候选 main 6f763f08 全部 MATCH、构建中无漂移|
|development|`58b12ce9-33ce-441c-b6bf-2e08ead17ccb`|`a039329390f8aff21112818fbfc41f6b08454d804b96dc37425192fbce960a2c`|256，与已验证候选 main 6f763f08 全部 MATCH、构建中无漂移|

用户反馈后停止追加全量复验。验收之后其他任务变化不借用本轮 PASS：当前已提交输入差异 ["scripts/build-market-site.mjs"]；当前工作区输入差异 ["scripts/build-market-site.mjs", "src/native-agent/settings.js", "src/native-agent/workspace.js"]。这些后续变化未纳入本轮候选验证；Native/compiler/本任务驱动身份仍逐项核对。
真实 Chrome 使用 development 回执，扩展 ID `migjjbbbplmhfcfldjkmekcafcldmgmk`；Google Chrome for Testing 155.0.8059.39。`E/native-attempt11/acceptance.json` 为 23/23 PASS、resourcesReleased=true、packageBytesUnchanged=true；验证脚本及 Native 输入 SHA 与当前 root 一致。
生产包固定入口 19 个，物理 SW 320970 字节。本任务按原 327680 字节要求额外核验，剩余 6710 字节。并行 Marketplace 提交 e4ee663b 将仓库预算配置改为 327680 字节；本任务没有调整预算，也不依赖该放宽通过。Native 完整 JSON 上限始终 61440 字节。

## 2. 复用资产与实际修复

已阅读本任务规定的 AGENTS、testing-guide、parallel-development、R2/R21、R17、MCP 文档和现有七个项目；检查实际最新实现，不按旧提示重做已修复问题。复用 program-entry/Webpack/LocalDevResolver、七个 opendesk.dev.* 工具、现有 Native runner、CFT launcher、demo-form.html 和标准测试目录。
复用 R2/R21 的原始 ESM 拦截、完整响应预检、HTTPS URL 独立审批与旧结果只读恢复；本轮发现并建立失败输入的修复为：

- ESM 检测器：合法 classic 对象 import 方法中的嵌套 dynamic import 原会漏拦截；正则默认值/控制块正则原会误判。补充现有词法扫描的边界，没有新建完整解析器，保留 E_ESM_BUILD_REQUIRED。
- local-controller 的 extract.js 原缺少 heading，补上实际 Locator 读取；version/title 保留。
- Node wire 超限诊断补足完整 JSON 的 jsonBytes/limitBytes，不改 60 KiB 上限。
- Go modern Native 二次编码含 scoped binding 与 HTML/U2028/U2029 转义后，原会丢失准确容量诊断；现在拒绝最终编码后的超限响应，返回准确字节与 NOT_DISPATCHED，退休 pending/timer，后续小响应继续处理。
- 真实 late ACK 验收发现历史断点行号失效，改为实际 Source Map sourcesContent 的唯一语义锚点，真实旧 ACK 到达后检查已 fenced/pending 为空；未伪造 ACK。
- 43111 已由其他任务占用时，现有 runner 只读核对并复用 demo 与已登记 reading-toc-article.html 的字节 SHA；后者用于非目标网页拒绝，不新建服务器或修改原项目 pageRules。

## 3. 实际修改文件与新增断言

技术提交的 22 个文件可用 `git show --stat c878687b` 逐一核对：

- `.github/workflows/local-dev-r22.yml`
- `.github/workflows/program-project-source.yml`
- `.gitignore`
- `examples/programs/README.md`
- `examples/programs/controller-title/README.md`
- `examples/programs/local-controller/README.md`
- `examples/programs/local-controller/src/extract.js`
- `examples/programs/page-heading/README.md`
- `examples/programs/page-npm-lodash/README.md`
- `examples/programs/remote-esm-page/README.md`
- `examples/programs/sidebar-controller-demo/README.md`
- `examples/programs/sidebar-page-demo/README.md`
- `native-agent/wire.mjs`
- `src/ui/esm-source-detector.js`
- `tests/environment/esm-r21-wire-boundary.test.mjs`
- `tests/environment/local-project-connection.test.mjs`
- `tests/environment/opendesk-native-provider.test.mjs`
- `tests/environment/page-dependencies-ui.test.mjs`
- `tests/framework/esm-r22-examples.mjs`
- `tests/framework/local-dev-native-acceptance.mjs`
- `tests/framework/r101-controller-lifecycle.mjs`
- `tests/integration/esm-examples-acceptance.test.mjs`

后置文档/驱动调整：本记录、examples/programs/README.md、controller-title/README.md、page-npm-lodash/README.md、sidebar-controller-demo/README.md、tests/framework/esm-r22-examples.mjs、tests/framework/local-dev-native-acceptance.mjs。正式 HTML 清单测试的并行远端修复 7d5e4b94 已复用；tests/environment/basic-browser-page.test.mjs 保留本任务已通过的 TOC fixture 必须在 README 明确登记的附加断言，不新增示例或 runner。
Go 仅改 internal/browserbridge/{wire.go,wire_test.go,host_dev_multi_unix.go,host_dev_multi_unix_test.go}，提交 96151107。没有修改 Goja 模块合同或其他 GUI 文件。
新增 L2 集成文件 tests/integration/esm-examples-acceptance.test.mjs 共 5 例：真实例子文件图/构建闭包、子模块与缓存、Controller 编译异常、Mock HTTPS 审批/拒网/坏缓存、合法大编译结果完整 JSON 超限。扩展原容量、Provider、定位和词法测试；新增 Native helper 只给既有 runner 增加 Examples 断言，没有第二套驱动、打包器或业务执行器。

## 4. 各 Examples 构建与运行状态

|示例|真实运行与授权范围|
|---|---|
|sidebar-page-demo|localhost USER_SCRIPT，多文件 Page、三次明确运行、proof.js 修改与单节点：L4 PASS|
|sidebar-controller-demo|localhost 正式 Controller Locator，搜索结果、计数 0→1、异常传播：L4 PASS|
|local-controller|localhost title/heading、extract.js version 1→2、最新源码重新解析：L4 PASS|
|page-heading|显式 localhost 授权临时副本：L4 PASS；原 example.com NOT_TESTED|
|controller-title|显式 localhost 授权临时副本：L4 PASS；原 example.com NOT_TESTED|
|page-npm-lodash|真实 npm 安装闭包、localhost 副本 text/safeHtml=Browser Test Lab：L4 PASS；原站点 NOT_TESTED|
|remote-esm-page|原标准 HTTPS import + 受控 Mock 锁、localhost 授权副本：L4 PASS；真实 CDN/原站点 NOT_TESTED|

各项目 README 给出作用、src/main.js 入口、仓库根目录开发/构建命令、运行环境、站点授权、预期结果、保存后明确重跑和自动化等级。公开命令在 C 的仓库根目录原样运行，输出目录由实际回执获取：`E/examples-cli-merged/summary.json`。六个无远端未锁定项目共 12 条 validate/build 命令退出 0；npm 示例另真实 npm ci 安装。HTTPS 示例构建见受控批准流程，不未经授权访问 CDN。
README 新补充的 sidebar-controller keyword 后缀表达式及 controller-title 完整 async wrapper 仅静态审阅，两个新教学修改步骤 Chrome NOT_TESTED；实际修改重跑证据限 Page proof.js 和 local-controller extract.js。

## 5. Page 原始回执、DOM 与源码修改

下表从最新原始 esm.actual-result 事件派生；完整参数、receiptNonce、preview world、documentId、旧结果查询和 DOM 保存在 events.jsonl。

|项目/结果|requestId|previewId/runId|resultId|sourceHash|documentId|
|---|---|---|---|---|---|
|sample.sidebar-page-demo {"heading":"周末阅读清单","message":"多文件 Page 程序已运行 · 周末阅读清单","status":"PAGE_DEMO_OK"}|`esm-r22-f37cd087-4740-4ef9-a724-533baa82e3b0`|`50894d40-517b-4d59-836a-684928d1a233`|`非持久 Page preview`|`25a950aa0b600f4b587993a0c8aa4dfb920c0be773de0d27d47cb7e2212925b7`|`9F2B843911686875F099A8148B13E9B0`|
|sample.sidebar-page-demo {"heading":"周末阅读清单","message":"多文件 Page 程序已运行 · 周末阅读清单","status":"PAGE_DEMO_OK"}|`esm-r22-e14ef01a-7305-4bd7-9b74-76c35b110f8b`|`5f4df169-c5a2-4bf7-911d-a166f592a68d`|`非持久 Page preview`|`25a950aa0b600f4b587993a0c8aa4dfb920c0be773de0d27d47cb7e2212925b7`|`9F2B843911686875F099A8148B13E9B0`|
|sample.sidebar-page-demo {"heading":"周末阅读清单","message":"多文件 Page R2.2 已运行 · 周末阅读清单","status":"PAGE_DEMO_OK"}|`esm-r22-0697b5d8-0285-4984-9439-b620634be927`|`e30fc4ef-affc-4116-9437-da99819e4c1d`|`非持久 Page preview`|`94159db4c9de50a1513ed797397a97685243eb2d4c076fcd527f3663e6c4e955`|`9F2B843911686875F099A8148B13E9B0`|
|sample.local-controller {"heading":"Browser Test Lab","title":"OpenDesk Browser · Browser Test Lab","version":1}|`esm-r22-f1becd02-d55e-4445-97e4-4a92d131b3c5`|`774403ed-af39-45a9-bebe-cff2bbaa83a6`|`1e043a88-2b01-49de-9599-16bfae387bb2`|`a135ac05ba6e32c65df9037388aa7a9d4f67bfd5dc8404e7a54d39865782cb88`|`9F2B843911686875F099A8148B13E9B0`|
|sample.local-controller {"heading":"Browser Test Lab","title":"OpenDesk Browser · Browser Test Lab","version":2}|`esm-r22-d664f13d-d8f2-42aa-9d9d-0435138e4072`|`b675ed37-ad92-4ab3-88e4-a02ba92f208b`|`2c364780-c180-4edc-b877-58229f76d482`|`5a28612f743cc17df0f2c511fed9d788978315af17509e8b7cc044224a834c0f`|`9F2B843911686875F099A8148B13E9B0`|
|sample.sidebar-controller-demo {"counter":"提交次数：1","keyword":"OpenDesk R2.2","result":"结果：OpenDesk R2.2","status":"CONTROLLER_DEMO_OK"}|`esm-r22-ddb0426a-5246-44c9-9193-32825629da41`|`d48edf3b-3466-4212-913f-b8c801c94951`|`2e63ee6e-8976-42b6-8305-19cb500889af`|`7941bc55a327b4ef5decdcede6ccf61a5dc2f65b5594836d5558b345d5df74df`|`9F2B843911686875F099A8148B13E9B0`|
|sample.sidebar-controller-demo null|`esm-r22-cdd0ff60-8b79-472d-a815-deb1c20b9ee2`|`49128a06-195b-4c65-be18-5663c0e1391a`|`cd6551ed-0ca3-4c65-9402-1d788650fe03`|`95ef5e2dd1e2665d7f1343045e28eebcc5c8136e21730d05e58d4fcc3d37707e`|`9F2B843911686875F099A8148B13E9B0`|
|sample.local-controller {"heading":"Browser Test Lab","title":"OpenDesk Browser · Browser Test Lab","version":2}|`esm-r22-5eb80a1a-1476-4fdd-8c51-8421fee351ea`|`9172a1bf-e1e8-46d3-93ab-9ee0380e5adb`|`17816829-ca21-4f76-8c82-1f0c1cf565fb`|`5a28612f743cc17df0f2c511fed9d788978315af17509e8b7cc044224a834c0f`|`9F2B843911686875F099A8148B13E9B0`|
|sample.sidebar-page-demo {"status":"SKIPPED_OUT_OF_SCOPE"}|`esm-r22-820f027c-ddf7-41c5-848a-17d0e4eeb5da`|`4f84500a-ab99-4951-b949-2826aa0f6f70`|`非持久 Page preview`|`94159db4c9de50a1513ed797397a97685243eb2d4c076fcd527f3663e6c4e955`|`CFB97E8D6BDC8ED2FAB1A886E8DFA16E`|

Page 前两次明确运行 sourceHash 相同而 previewId 各异，DOM 仍只有一个 #opendesk-multifile-page-proof，位于 #lab-text。临时副本只修改 proof.js 的可观察文字，未运行时 DOM 不变；第三次明确运行获得新 sourceHash/previewId，显示“多文件 Page R2.2 已运行 · 周末阅读清单”，节点仍为一个；原 preview 的源码与 resultText 未变。原始 Examples 不改动，测试副本在 runner 清理中删除。
实窗证据：`E/native-attempt11/esm-page-proof.png`。父 Agent 与独立审阅者检查过实窗截图；标记、表单、文字和留白正常。

## 6. Controller 结果与明确再次运行

sidebar-controller-demo 通过正式 Controller page Locator 使用 getByLabel/getByRole/getByText/locator；真实网页 #results 为“结果：OpenDesk R2.2”，#search-count 从提交次数 0 到 1，闲置观察不增。缺失 Locator 得到真实 E_SELECTOR_NOT_FOUND，持久结果准确传播，不用 Node Playwright page 代替执行环境。
local-controller 第一次 version=1、title 与 heading 均来自网页；只改临时副本 extract.js 的版本字段，保存后未运行不执行，第二次新 requestId 读取 version=2。新 sourceHash/runId/resultId 改变，旧持久回执不变，无额外手工 build:program、上传编译结果或重装扩展。runRevision 与持久结果 revision 见原始事件及派生索引。
实窗证据：`E/native-attempt11/esm-controller-result.png`。`E/final-acceptance-index.json` 是事后原始证据索引，保留 full revision/timings/DOM，不冒充截图捕获时的独立身份 manifest。

## 7. 失效阻断与未知效果恢复

真实导航后旧 documentId 返回 E_DOCUMENT_STALE，非目标 TOC 网页正式 Page 链返回 SKIPPED_OUT_OF_SCOPE 且不写 proof。实际关闭 USER_SCRIPT 权限得到 E_USER_SCRIPTS_UNAVAILABLE，恢复权限后闲置仍不执行。detach 返回 E_DEV_DETACHED；Native 撤权、port 断开、外部导航及旧 ACK 到达均有真实生命周期记录，禁止隐式重放。
丢失 ACK 时返回 E_EFFECT_UNKNOWN，只用原 admission/request 身份查询；恢复到同一个 run/result，实际 dispatch 与搜索计数都仅增加一次。未知执行效果不是“已执行失败”，缓存命中也不等于业务成功。CDP 只驱动/观察测试窗口、权限和 DOM，没有注入业务结果或伪造 Native ACK。

## 8. Native JSON 边界与 Go 修复

Node encode、Provider、实际 dev.response 和 run.start 都按完整 UTF-8 JSON 测量 61439、61440、61441。包含大量换行/引号/反斜杠、中文/emoji、完整 sourceHash 等元数据以及合法大 Webpack 项目；超限不截断源码/参数、不复用旧源码，未入场明确 NOT_DISPATCHED，后续小消息恢复。
Go 修复前的真实 Node Provider→Go Host socket/stdio 红例保留在 E/native-wire-before-product-js.log；修复后两条 JS 真实传输测试共 121 条记录、32 次预期拒绝通过，涵盖 legacy/modern scoped rewrite 与 Go 特殊转义后的最终字节。Go browserbridge 72 条、scriptloader 16 条通过。fresh Go binary SHA、工具链和四项源码映射见 E/native-wire-final-summary.json 及 Go `.runtime/tests/native-wire-01a1296d/build-inputs.json`；不是旧已安装程序。
该 Go Host stdio/socket 测试算 L3，Chrome 帧由受控客户端提供；最新真实 Chrome 的 Node Native Host 链单独算 L4。Go Host 与 Chrome 合并执行链 NOT_TESTED；不混淆两者。

## 9. HTTPS ESM 与完全离线构建

保留 `import add from 'https://cdn.jsdelivr.net/npm/lodash-es@4.17.21/add.js';` 和原 https://example.com/* 规则。未锁定 review 无网络/无执行，未批准不能下载或进入业务运行。受控 Mock 使用原 lock-program-remote/remote-esm-modules/remote-esm-network：根 reviewToken 批准，新增 B、C URL 分别审批；拒绝 C 不生成完整锁。
批准后锁与三项 SHA-256 缓存完整；OS 网络权限拒绝的 Node 子进程重复真实 Webpack 构建成功，探测联网 ERR_ACCESS_DENIED，无新增下载。改本地包装模块得到新源码；缺缓存/篡改缓存明确拒绝，不能执行旧缓存代码。编译产物行为相同由受控测试证明；下载代码没有在锁定/审阅阶段执行。
真实 Page 只运行显式 localhost 授权临时副本与本任务作者编写的 Mock 模块，不改原项目规则，不执行真实 CDN 第三方代码。普通 CI 不联网下载 CDN；手动真实 CDN job 默认为 false，要求显式根批准和新增 URL 精确名单，本轮未运行。

## 10. Go/Goja 模块合同

实际 `go test ./pkg/scriptloader/...` 16 PASS；生产 ModuleScriptLoader/Goja bundle/bootstrap 的独立 9 组 15 个叶场景亦 PASS。包括 .mjs 相对多文件、具名 main、init-only、非函数 main、async main reject、初始化抛错、npm exports root/subpath、静态 literal dynamic import 被打包支持、运行期动态 import 和不支持的 Node API 明确失败。
Browser default 函数与 Go 具名 main 是不同合同，没有统一成错误入口。非函数 main 在 Go 现有语义下不被调用，不应按 Browser 非函数默认入口合同误判。Go 实例证据见关联仓库 `.runtime/tests/esm-r22-01a1296d/goja-summary.json`；不声称完整 OpenDesk Execution/EventLoop/GUI 验收。

## 11. Node、构建与 CI

先在独立候选执行 npm ci --ignore-scripts --no-audit --no-fund；用户要求的七个定向文件及 program-build/新增集成等共 82 PASS，npm 闭包 1 PASS。最新 builds-final-merged 双构建后，完整 environment 矩阵 1040 条、1039 PASS、1 SKIP、0 FAIL，见 E/environment-node-final-merged.log。
environment 矩阵唯独不运行会选择日常 Chrome/Profile 的 native-agent-chrome-real.test.mjs；本任务使用同一个正式独立 Native/CFT runner 替代。条件 Go Native 项跳过与单独显式实际 Go Host L3 两例分开报告。
npm run check、build、build:dev、verify 最新均退出 0；日志为 E/{check,build-production,build-development,verify}-final-merged.log。接口与打包没有另建实现，预算不删除断言。
program-project-source.yml 已覆盖 Examples 变更触发、Node 26.3.1、OS 拒网的 Mock 构建；local-dev-r22.yml 扩展现有 macOS CFT Native driver 的 esm-examples 23 例、独立 Profile/instance/evidence、development Source Maps 与清理。YAML 本地解析通过；GitHub 远端 CI 实际执行 NOT_TESTED。L2 与 L3/L4 名称保持分层。

## 12. 本机组件与运行资源

Node 实际 v26.3.1。R17 npm 包 @shopable/opendesk-dev 0.1.0-r17.1 的正式 bin 是 bin/opendesk-dev.mjs，不是 Browser 根 package.json 的 native-agent/cli.mjs。只读核对日常登记 entry SHA 一致，但其六个内部 runtime 文件比当前 main 旧；保留共享安装，没有拿它测试新协议。
用现有 pack-opendesk-dev.mjs 打包后，真实 npm 安装到 E/npm-cli-isolated-prefix，私有测试 HOME 登记；六个 runtime 文件与当前 main SHA 全部 MATCH，--register-go、--version 和 fresh Go browser dev --help 转发均退出 0。见 E/registered-npm-cli-readonly.json、npm-cli-current-isolated-summary.json；这不代表日常全局旧安装已升级。
本轮 Native Chrome 使用独立 Node Host instance esm-r22-01a1296d、当前 candidate 与匹配扩展包；Profile、Host 与项目临时副本均由既有 runner 清理。只读复用其他任务的 43111 demo/TOC，核对 HTTP 200 和实际 SHA；未结束其服务器或浏览器进程。

## 13. 性能与完整 JSON 测量

E/performance-merged.json 记录独立阶段，不把 cacheHit 当业务通过。下列测量的编译器与 Examples 输入在最终合并中未改变：

|项目/阶段|ms|cacheHit|sourceBytes|sourceHash|inputHash|
|---|---|---|---|---|---|
|sidebar-page-demo/first|297.42|False|1517|`25a950aa0b600f4b587993a0c8aa4dfb920c0be773de0d27d47cb7e2212925b7`|`2321243b87f8ee5cba275e675a1402248983accaa94b073b4843b8c98c833894`|
|sidebar-page-demo/repeat|13.66|True|1517|`25a950aa0b600f4b587993a0c8aa4dfb920c0be773de0d27d47cb7e2212925b7`|`2321243b87f8ee5cba275e675a1402248983accaa94b073b4843b8c98c833894`|
|sidebar-page-demo/child-edited|37.37|False|1507|`b4a1673ef65c8563dcbb5784ac90677cedbef0280c250e23bad96e4d58ea6867`|`d4175f51687051065f8abebb04b4aed8b564e62c257ebd393c6efc7a203f24ee`|
|sidebar-controller-demo/first|25.77|False|1129|`7941bc55a327b4ef5decdcede6ccf61a5dc2f65b5594836d5558b345d5df74df`|`d4b6149860f62bd2104187c0c96dab20c3a23b740c659744424becc1118c4da3`|
|sidebar-controller-demo/repeat|4.99|True|1129|`7941bc55a327b4ef5decdcede6ccf61a5dc2f65b5594836d5558b345d5df74df`|`d4b6149860f62bd2104187c0c96dab20c3a23b740c659744424becc1118c4da3`|
|sidebar-controller-demo/child-edited|21.34|False|1141|`a81724884c94a012086a0a00f16bb73eacdb8c7e78a3812fac0c22ac19441e20`|`ab3a35d9907412e071018a85949a0303c39ab0d3580ffd7d98c609ceea866f91`|
|local-controller/first|16.01|False|760|`a135ac05ba6e32c65df9037388aa7a9d4f67bfd5dc8404e7a54d39865782cb88`|`809fd07a5892c0aae9fd53d1a93e0ae72aad26b9e806a07757eeb42ad86fb599`|
|local-controller/repeat|3.27|True|760|`a135ac05ba6e32c65df9037388aa7a9d4f67bfd5dc8404e7a54d39865782cb88`|`809fd07a5892c0aae9fd53d1a93e0ae72aad26b9e806a07757eeb42ad86fb599`|
|local-controller/child-edited|16.01|False|760|`5a28612f743cc17df0f2c511fed9d788978315af17509e8b7cc044224a834c0f`|`c7f767f556e90a76bd11236f04584bc9fc8466f8203b2d68fdc20c51655c63f0`|
|remote-esm-page/OS-network-denied-locked-Mock-rebuild|404.41|NOT_MEASURED|827|`83dffd16473aee218f58bba9bfe998e1c1ccc6cf0491d885faebedacf8af55f9`|`NOT_MEASURED`|

Chrome 每次明确入场的 nativeAdmissionMs、解析到结果 elapsedMs、构建 timings、source/inputHash、cacheHit/sourceBytes 在 E/final-acceptance-index.json 逐项记录；elapsedMs 包含解析/入场/轮询，不称为纯脚本执行时间。容量场景 Native 完整 JSON 实测 61439/61440/61441，普通业务 Native JSON 字节数 NOT_MEASURED。

## 14. 证据限制、独立评分与交付

失败/历史通过不覆盖：attempt1–5 为前置或真实失败及修复过程，attempt6/7/9/10 为历史候选通过；attempt8 因共享 43111 EADDRINUSE 未业务执行，保留失败与清理；最终取本记录明确绑定的 attempt11，源码变化后都刷新包，而不是借旧日志证明新版本。
独立审阅分数按限定范围的证据质量与可靠性给出，没有为了 ≥95 目标提分。没有剩余已确认的范围内 P1/P2 产品缺陷；截图缺独立捕获时身份 manifest、两个新 README 教学修改未真实重跑、日常 npm 旧安装待独立升级，均保留。

|维度|分数/100|
|---|---|
|ESM 兼容性|92|
|HTTPS 依赖安全|88|
|Node 构建正确性|94|
|Chrome 实际执行|94|
|Go 模块兼容性|92|
|开发者体验|88|
|Examples 实用性|88|
|自动化测试可信度|92|
|维护成本|86|
|Native 消息可靠性|91|

评分原文 E/final-review-go.json、final-example-review.json、native-wire-final-summary.json 记录具体范围与扣分，历史 scores 不冒充 current_scores。全球 ESM/完整安全覆盖、真实 CDN、原始公网站点、远端 CI、跨平台 live、Go Host+Chrome 合并链、Installed/F3/ZIP、全新用户手工 Sidebar 全流程为 NOT_TESTED / NOT_SCORED。
九项 Browser/Go 独立评分最后绑定 attempt9/e62014ef；attempt11 的合并候选另有本轮真实功能与输入验证，未追加独立重评分。分数不代表后续并行改动或整个最终 main 的全量认证。
最终提交仅暂存本任务拥有的路径；普通 main/master 推送分别核对远端 SHA。共享未提交文件与运行现场不归入本任务提交。完整交付状态及其他 Agent 保留清单见 E/git-delivery.json。
