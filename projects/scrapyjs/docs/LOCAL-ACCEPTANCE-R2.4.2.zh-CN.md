# ScrapyJS R2.4.2 · 本机验收与真实执行阻断

日期：2026-10-30。结论：原 DOM 用户闭环已在真实 Mac Chrome 验证，静态 HTTP 业务内核已修复并通过 Node；**生产公网 HTTP 仍 BLOCKED**。本轮结束于验证及最小修复，不进入 R2.5，不修改 Desktop。

## 范围、最新 main 与去重

- 唯一业务 owner：`examples/sidebar-tools/scrapyjs/`，Sidebar App 复用原 React、SDK、固定 `scrapyjs.capture` Task 与安装器。未写平台 `src/`，未增加权限、Runtime、服务或执行合同副本。
- 开始时读取 main、fetch origin/main 并合入远端新增文档；测试候选基线 `0fd942223bfe47a2a30ef144661c5df8f0ea0fd2`。后续 main 并行提交不涉及本工具，保留其改动。本任务提交 SHA 见 Git 提交及最终交付；证据索引另存候选基线与输入文件 SHA，不伪称未提交文件属于该基线。
- 已读取相关对话 `01a18c16-88ce-7ae3-ac04-d28269b63de5` 的完成记录，核对 `b7ffa039724a837bcf86ad8fe28086fbd7d0db2d`、正式包及 `runtime-identity-repair-20261030.json`。App 1.6.4 / Task 0.4.1 已由该 owner 修复并晋升，本轮复用，没有重复升级。
- 实际入口：原「开发」导入同源草稿 → 明确 Run → 原任务验证/本地可用/安装；随后「扩展 → 导入扩展 → 原审阅 → 打开 scrapyjs」。选择本机 demo 页，保存命名配置，调用固定 Task 查看真实数据和下载。
- 原 CFT149、日常 `dist/development`、既有 watcher 和 Native 配对均未替换或重载。测试复用已有隔离快照及关闭的任务自有 Profile；CFT155 有头运行真实扩展，模式为 **STATIC_DEVELOPMENT_SNAPSHOT_NO_SERVE**。快照加载路径、ID、输入树 SHA、Profile 复制校验在原始报告中；不声称此快照连接了日常 serve 或完成 production 验收。
- 原 AI 请求 `cb6d0e92-0e45-4ae0-a30c-96377d535106` 仍 unknown，未发送、重放或绕过围栏。AI 草稿组件受 App CI 覆盖，真实模型主链 NOT_TESTED。

## 已修复及复现

| 缺陷 | 修复前证据 | 最小修复与验证 |
|---|---|---|
| 首次 SHA await 后，调用者或 Host 参数可改动受审 Recipe、URL、Header、Plan | `static-http-trial-before.log` 中对应失败 | 首次 await 前私有深复制；向 Host 传独立参数副本，签名、提取及回执使用同一快照 |
| 累计字节耗尽仍发下一次 GET，剩余额度没有传入 Host | 同上，预算用例失败 | 请求前拒绝零余额；`maxBytes=min(单页上限,剩余额度)`，读体后复核，超限不保存 |
| 读回 SHA await 中 Stop，仍返回 completed | 同上，第四次 digest 用例失败 | 读回 SHA 后再次检查原 AbortSignal；Stop 不伪称宿主已退休 |
| Host 返回的共享 records/receipt 在 SHA 等待期间可变，校验内容与返回内容不一致 | `readback-before.log` 两项 FAIL | 接收持久读回对象后立即深复制；计算、回执校验与返回只用私有副本，最终 21/21 PASS |
| App CI Chromium 旧 Button-only shim 缺共享 Chat 导出，React 初始化失败 | `app-ci-browser.log`：`createConversationSession is not a function` | 内存编译现有公开 Button、SharedConversationFrame、createConversationSession，复用同一 React；4 项通过，SDK 仍为模拟 |
| 原生驱动截图出错可跳过关闭 CFT | 独立 reviewer 在原 finalizer 注入截图失败，closeCalls=0 | 截图和关闭独立处理；实际 finalizer 的截图失败、关闭失败两条注入路径均验证必达 close、持久报告及非 PASS 总状态 |

新增 8 项 HTTP 回归，覆盖上述四类业务缺陷；没有改原 R2.2 Schema、DOM 引擎、App 业务 UI 或包身份。原生驱动还修正隐藏 JSON Tab、表格详情控件列、过早 Stop、草稿确认及 hover 菜单操作；这些是驱动断言/操作问题，未要求有效产品迁就测试。

## 执行命令与结果

只运行本工具和本轮相关检查；以下路径均相对仓库根目录。原始输出保存在 `artifacts/scrapyjs/r242-local-acceptance/`，SHA 索引见 `../evidence/local-acceptance-r242-20261030.json`。

```sh
node --test examples/sidebar-tools/scrapyjs/tests/{static-http-trial,execution-v1,execution-interop,page-adapter,extraction-contract,engine}.test.mjs
node scripts/app-ci.mjs build scrapyjs
GITHUB_SHA=0fd942223bfe47a2a30ef144661c5df8f0ea0fd2 node scripts/app-ci.mjs node scrapyjs
# CHROME_BIN 为已有本机 CFT149 可执行文件；没有下载或替换日常 Chrome
GITHUB_SHA=0fd942223bfe47a2a30ef144661c5df8f0ea0fd2 CHROME_BIN="$CHROME_BIN" node scripts/app-ci.mjs browser scrapyjs
node --test examples/sidebar-tools/scrapyjs/tests/static-http-trial.test.mjs
node examples/sidebar-tools/scrapyjs/tests/static-http-chromium.mjs artifacts/scrapyjs/r242-local-acceptance/static-http-chromium-final
```

- 初始合同/DOM/HTTP 定向 **62/62 PASS**；原 HTTP 13 项通过，新增故障用例先红后绿，最终 **21/21 PASS**。
- 原 App CI Node 最终 **200/200 PASS**，覆盖原合同、DOM、命名配置、AI 提案及结果模型等；与 21 项重叠，不相加。此为本机执行现有 App CI 命令，不冒称新的 GitHub workflow 已通过。
- App CI build 只构建工具候选；Node 和 browser 都返回 `CANDIDATE_SOURCE_IDENTICAL`。候选与正式 App **1.6.4 / 84,235 bytes / SHA256 `42fdb94d777947d3e2921b045656f0278111b56e707d724a2288ce91b61d7ecb`** 逐字节相同。静态 adapter 尚未接入该包，无需为本轮内核/测试/文档重复发版。
- App CI CFT149：原 React + 真实共享展示组件、模拟 SDK **4 项 PASS**；不等于安装态/真实采集/HTTP。
- CFT155 实际 DOMParser/JSON：HTML 两行及 JSON 两行与独立预期一致；脚本未执行，观察窗口内未收到图片/iframe 旁路请求。绑定最终 adapter SHA `14c3ee7e4eb41a09835923fbf06bdbaffb88866d294c5059742d603a54fdedd7`；仅证明固定解析 fixture。
- 修改脚本的 Node 语法检查、局部 diff 空白检查通过；无需新增依赖或重建 Browser。清理故障注入只证明驱动，不算 HTTP/Chrome 产品证据。

真实扩展命令与接续：

```sh
node examples/sidebar-tools/scrapyjs/tests/native-core.mjs --source=artifacts/scrapyjs/r242-local-acceptance/controller.js --draft=artifacts/scrapyjs/r242-local-acceptance/program.opendesk-draft.json --params=artifacts/scrapyjs/r242-local-acceptance/params.json --task-package=examples/sidebar-tools/scrapyjs/controller/scrapyjs.opendesk-task.json --out=artifacts/scrapyjs/r242-local-acceptance/native-task-valid-input
node examples/sidebar-tools/scrapyjs/tests/native-local-acceptance.mjs --out=artifacts/scrapyjs/r242-local-acceptance/native-app-current-table
node examples/sidebar-tools/scrapyjs/tests/native-local-acceptance.mjs --resume=artifacts/scrapyjs/r242-local-acceptance/native-app-current-table/report.json --out=artifacts/scrapyjs/r242-local-acceptance/native-app-resume
node examples/sidebar-tools/scrapyjs/tests/native-local-acceptance.mjs --resume=artifacts/scrapyjs/r242-local-acceptance/native-app-resume/report.json --out=artifacts/scrapyjs/r242-local-acceptance/native-app-finish
node examples/sidebar-tools/scrapyjs/tests/native-local-acceptance.mjs --resume=artifacts/scrapyjs/r242-local-acceptance/native-app-finish/report.json --out=artifacts/scrapyjs/r242-local-acceptance/native-app-lifecycle
```

`native-core` 的 draft 来自既有同源码编译产物，输入与固定 Task SHA 精确一致；参数使用 `127.0.0.1:43111/demo-form.html`，独立读取预期 `产品设计 / 浏览器技术 / 交互体验`。该本地 fixture 不是公网 HTTP 许可。脚本导入不是隐式执行，仍经原开发 Run/任务审阅。

真实证据通过 SHA 引用链拼接，**没有一条声称所有步骤在同一新会话整套重跑**：

| 原始报告 | 已证实内容 | 原始总状态 |
|---|---|---|
| `native-task-valid-input/report.json` | 同源 Controller Run、真实 DOM 预期、原 Task 验证及安装 | PASS_SCOPED |
| `native-app-current-table/report.json` | 原 App 审阅安装、命名保存销毁重开、三行真实表格、JSON/CSV 文件字节读回、重复 Run 无二次审阅 | FAIL：随后 Stop 过早，只完成派发前取消；已成功步骤保留 |
| `native-app-resume/report.json` | 等待实际 running 后 Stop，同一 runId `e0567d9c-f44e-4c00-8f4d-f2c96dd6ff29` 进入 stopped/released，持久取消回执 | FAIL：返回时原草稿确认未处理 |
| `native-app-finish/report.json` | 原草稿确认取消保留 iframe，再次确认丢弃 | FAIL：未 hover 导致 more 按钮不可点击 |
| `native-app-lifecycle/report.json` | 实际菜单停用、读回已停用、恢复并重开，命名配置与完整 JSON 不变；无可运行 HTTP 按钮 | PASS_REAL_BROWSER_LOCAL_DOM_APP |

所有自有浏览器均有关闭回执；只从已关闭 Profile 复制，并核对来源/副本树 SHA。旧失败报告没有改写 PASS。更早的无效导入路径、隐藏 Tab、表格控件列等驱动失败亦保留在 artifacts，按证据索引分类。最终驱动增加同一 runId 的严格 Stop 断言，并独立读回既有报告核对一致；该断言调整与 finalizer 修复未触发无关的重复采集。

## 旧 E_TOOL_BUILD 的归因

[41042514274](https://github.com/shopable-ai/opendesk-browser/actions/runs/41042514274) 仍为 **189/190、FAIL**，HTTP 新增 13 项全通过；更早 [41041483759](https://github.com/shopable-ai/opendesk-browser/actions/runs/41041483759) 已有同一失败。前者源码 config 为 1.6.3，正式 JSON 仍 1.3.1，确为未晋升的一致性差异。当前 `b7ffa0397` 已沿原候选/测试/晋升链解决，App 1.6.4 与 Task 0.4.1 的同源检查本轮通过；不把历史 CI 改写通过，也不将其归因于 HTTP 模块。本轮没有手工改生成包、修改身份或降低检查。

## 可信 HTTP：已有能力与最小缺口

以下是源码事实及其边界，未进行公网请求；不能用 Mock、客户端 approved 或仅 URL 字符串过滤证明可信执行。

| 事项 | 现有代码证据 | 当前判断 |
|---|---|---|
| 可信审批/Origin | `src/ui/sidebar-tools.js` 的 requestBrowserClick；`src/platform/chrome/context-menus.js` 的 verifyBrowserOwner、真实 sender、包 hash/epoch、Chrome permission、单次参数绑定点击 | 有每次调用授权；没有完整 Recipe/Plan、1–3 页预算的一次批准持久 HTTP Grant |
| DNS/peer IP | `src/framework/sdk/browser-contract.js` URL 校验；`src/platform/chrome/network.js` 直接 fetch | 没有全部 DNS 解析地址、重绑定及最终 socket peer IP 证明；**生产 BLOCKED** |
| 重定向/超时/体积 | network `credentials:omit`、`redirect:manual`、拒绝 opaque、Abort、15 秒服务预算、流式读体；adapter 拒绝重定向及跨 Origin | 基础保护存在；没有完整可信多页累计执行回执，无法由字符串校验弥补连接级安全 |
| Header 三层 | `src/framework/sdk/registry.js`、`src/framework/sdk/browser-contract.js` 规范/禁项；network 将规范化 headers 传给 fetch | configured/submittedToHost 有组件证据；实际 wireObserved、serverObserved 均 null，无线上真实性 PASS |
| Stop/退休 | network 取消 fetch/reader；context-menus 撤权 abort；`src/platform/host/controller-methods.js` 原 Controller Stop 与退休 | DOM Stop 已实证；尚无 HTTP operation 身份对应的取消、退休与独立读回链 |
| 持久化/SHA | Controller 结果按原 namespace、runId、resultId、revision 保存并 get；`src/platform/storage/repository.js` 源码 SHA/CAS | 已有执行身份与存储可复用；不是 HTTP 结果内容 SHA 的独立重算回执。adapter 的该部分仅测试 Host |
| 响应消息 | 通用 `registry.js` response 256 KiB；Side Panel context-menus 网络正文 8,192 bytes、结果信封 12,000 bytes；Controller result-transfer 另有 192 KiB/分块限制 | 不能拿通用 256 KiB 声称 Sidebar 能返回 64 KiB HTML。需可信侧有界提取/持久结果投影，不全局加上限 |
| Task 合同 | `src/platform/tasks/contract.js` 原安装 Task 只允许 page.automation/可选 storage.persistent；controller-methods 拒绝安装 Task 的 AXIOS 调用 | 不能将现有固定 DOM Task 冒充已获 HTTP 网络能力 |
| v1 表示 | `contracts/execution-v1.mjs` 与唯一 Schema：browser-tab / desktop-http / desktop-browser / android-cellular，无 browser-http；JSON 也无映射类型 | 不冒充 browser-tab 导航 Header；测试中 desktop-http 能力声明只是 fixture，不是 Browser 或 Desktop 实测节点 |

需要独立评审的最小公共缺口为：连接级全 DNS/实际 peer 安全证明；绑定不可变 Recipe/Plan/Origin/节点及累计预算的可信批准；HTTP operation 取消退休和按原执行身份的结果 SHA 独立读回；单一合同中合法的 browser-http / JSON 表示及相应 Task 权限。**本轮仅提出缺口，没有新增 Go/Node 常驻服务，也没有另造 Authority。**

Browser 已满足当前页 DOM 采集，但目前不满足受审公网 HTTP 试采。只有用户确需独立 HTTP、连接级安全证明及 Browser fetch 无法提供时，可选 Desktop 才有必要；先验证已存在 Desktop `9d79d3be48536adfac9304f15c4c31651ee3921a` 能力，不重复迁移/开发，不把 Desktop 作为 DOM 使用前提。

## 验收等级与未完成

| 等级 | 本轮范围 |
|---|---|
| SOURCE_COMPLETE | 本轮静态 HTTP 内核差量修复与测试驱动；不是完整 HTTP 产品完成 |
| NODE_PASS | ScrapyJS App CI 200/200、HTTP 21/21，存在包含关系 |
| CHROMIUM_PASS | CFT149 模拟 SDK React 4 项；CFT155 真实 HTML/JSON 解析固定 fixture |
| REAL_BROWSER_PASS | Mac CFT155 安装态 DOM、保存、查看、下载、重复运行、Stop、草稿确认、停用/恢复；仅隔离静态 development |
| BLOCKED | 生产公网 HTTP、DNS/peer IP 证明、真实 HTTP 授权/退休/持久 SHA 全链；无可运行 UI |
| NOT_TESTED | 公网 Header 三层真实性、HTTP 真网络、真实 AI 主链、production、Native 配对/Go HTTP、R2.5 |
| REAL_DESKTOP_HTTP_PASS / MAC_DESKTOP_PASS | 均 NOT_TESTED；真实 Mac Chrome 运行不等于 Desktop 应用或物理原生 UI 验收 |

## 独立八维评分

由独立只读 reviewer Zeno 评估**完整 HTTP 试采准备度**，不是仅评价此次 diff；未测试是证据缺口，不直接认定产品故障。设计、实现覆盖及真实运行分别求八维算术平均，不将 DOM 实证换算成 HTTP PASS。

| 维度 | 设计 /100 | 代码 /100 | 真实运行 /100 | 低于 95 的主要原因 |
|---|---:|---:|---:|---|
| 产品架构 | 93 | 84 | 65 | v1 缺 browser-http / JSON，可信执行链未贯通 |
| 便利性 | 89 | 70 | 75 | DOM 闭环可用，HTTP 一次审阅到结果尚不可用 |
| HTTP 正确性 | 91 | 76 | 40 | 内核已测，真实传输/取消退休/持久 SHA 未接 |
| Header 真实性 | 94 | 72 | 15 | 无 wire/服务器回显实证 |
| 安全权限 | 97 | 90 | 80 | 正确阻断，但连接级证明及 HTTP Grant 未落实 |
| 代码复用 | 97 | 96 | 85 | 原 React/Task/SDK 已复用，HTTP Host 尚未实证 |
| 维护成本 | 93 | 90 | 70 | 跨端维护未验证；历史记录多，驱动清理问题已随后最小修复 |
| 测试证据 | 91 | 88 | 68 | 缺真实 HTTP、Desktop、Header 与 production 证据 |
| **各列八维算术平均** | **93.125** | **83.25** | **62.25** | 三层均未达整体 95，不宣称正式通过 |

以上为 reviewer 完成时评分；随后修复其指出的截图清理缺陷并验证两条失败路径，保留该评分，不自行加分。最终 reviewer 的复核结论及来源文件 SHA 记录在证据索引。R2.5 本轮不实施，后续先处理可信能力缺口，再决定正式 HTTP 执行位置。
