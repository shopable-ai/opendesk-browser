# Examples 目录归属与安全迁移审计（2026-11-02）

**审计源：** GitHub main 的 8edcf7a6e6700cec0892f604bd6fd1965f4557c3；只记录本次可见源码、配置、Git 树、README、官方 Catalog、现有定向测试和 Actions。此文档不是安装证据，不能证明所有本机脚本调用者或外部 pin 已被穷尽。下一轮迁移前必须重新核对新的 HEAD 和所有消费者。

**目标：** 每个目录有清晰的职责；保护已安装工具/任务的 ID、version、sourceHash、授权、Web Flow 结果归属，以及正在并行开发的文件。上一轮 e80c64bc87dc04ae4f3a6aaad655bd07ae11db2c 已改名 browser-sdk-r2、browser-sdk-r13、runtime-globals-demo，迁出 browser-sdk-acceptance 并删除四个历史 app-* 样本；不要重做。

## 1. 十个一级目录

| 目录 | 职责 | 状态 | 证据与本轮处置 |
| --- | --- | --- | --- |
| cloud-control/ | 云控表单与 provider 演示 | KEEP | README + local-business/ + mac24dev-demo/；非新的 Controller Runtime |
| import-ready/ | 已固定源码/哈希的 Page JSON | KEEP | 四份 .opendesk-draft.json 与 history/；移动会影响文档/来源 |
| libs/ | 受信任库静态导入说明 | KEEP | trusted-imports/；不是独立产品 |
| local-workspace/ | 本地工作区 UI 示例 | KEEP | README 明确演示内存文件，非默认真实 Native 文件桥 |
| network-javascript/ | 静态 ESM import 示例 | KEEP | Page/Controller 各一 JS，复用 tasks/demo-form.html |
| programs/ | Page/Controller 本地源码项目 | KEEP | 各 package.json opendesk.runtimeKind 决定执行世界 |
| shared/ | 示例共享素材 | KEEP | markdown/；仅本轮导航，不提取公共 Host |
| sidebar-tools/ | Sidebar Tool 模板、SDK 样本与待迁产品 | KEEP | 正式产品依 Catalog 真实路径，不能按目录名一刀切 |
| tasks/ | Task 包、JS、演示页与历史测试 | KEEP | 可安装包绑定 taskId/版本/sourceHash，test server 以当前路径服务 |
| ui/ | 离线 HTML 交互原型 | KEEP | README 声明不是正式扩展与真实执行证据 |

## 2. programs/ 逐项目台账

以下配置类型以相应 package.json 的 opendesk.runtimeKind 为准；没有做运行世界或项目 ID 的改写。BLOCKED 是有明确迁移/重命名候选，但本轮未满足消费者或并行安全条件。

| 示例目录 | 真实用途 | 状态 | 可核证依据或风险 |
| --- | --- | --- | --- |
| chatgpt-calculation-relay | Controller / 双对话任务 | KEEP | package.json + tests/ + release/；已冻结候选，不改授权 |
| chatgpt-jump-top | Page / AI 滚动导航 | BLOCKED | 正式化候选，含 Page 包、测试与跨站规则；需先确认唯一发行 owner |
| chatgpt-mindmap | 旧资源 / 本地元数据 | BLOCKED | 仅 .opendesk-local/resource.json 与 assets/xmind-runtime.js；正式源码在 projects/chatgpt-mindmap，先核许可与资源消费者 |
| chatgpt-voice-cleanup | Page / 语音文字辅助 | KEEP | 有 package.json、src/、tests/；独立产品归属可另轮评估 |
| controller-axios-zero-arg | Controller / Axios | KEEP | runtimeKind=controller，零参数运行示例 |
| controller-globals-zero-arg | Controller / 预装库 | KEEP | runtimeKind=controller，环境边界测试 |
| controller-title | Controller / 标题 | KEEP | runtimeKind=controller，ESM 基线 |
| listing-sku-inspector | Page / 本机测试页 | KEEP | runtimeKind=page-userscript；当前以 Test Lab 来源验证 |
| local-controller | Controller / MCP 开发 | KEEP | runtimeKind=controller；本地开发回归 |
| local-page-ui | Page / 浮层 | KEEP | runtimeKind=page-userscript；用户脚本 UI 示范 |
| local-project-core-check | Controller / 开发链 | KEEP | runtimeKind=controller；项目读回及停止回归 |
| mixed-import-controller | Controller / 依赖组合 | KEEP | runtimeKind=controller；HTTPS/npm/相对路径组合 |
| mixed-import-page | Page / 依赖组合 | KEEP | runtimeKind=page-userscript；独立执行世界 |
| page-globals-zero-arg | Page / 预装库 | KEEP | runtimeKind=page-userscript，不能改为 Controller |
| page-heading | Page / 标题 | KEEP | runtimeKind=page-userscript；ESM 基线 |
| page-npm-lodash | Page / npm | KEEP | runtimeKind=page-userscript；锁定依赖构建 |
| page-toast-demo | Page / 提示 | KEEP | runtimeKind=page-userscript；受控页面 UI |
| page-ui-basic | Page / 无框架 UI | KEEP | runtimeKind=page-userscript；CSS/PNG/JSON 资源 |
| page-ui-react-axios-query | Page / React + Axios | KEEP | runtimeKind=page-userscript；框架与依赖组合 |
| page-ui-react-direct | Page / React 普通 JS | KEEP | runtimeKind=page-userscript；import-ready 来源之一 |
| page-ui-react | Page / React JSX | KEEP | runtimeKind=page-userscript；import-ready 来源之一 |
| page-ui-toc-react-direct | Page / React + ECharts | KEEP | runtimeKind=page-userscript；不同能力样本 |
| page-ui-vue-direct | Page / Vue 普通 JS | KEEP | runtimeKind=page-userscript；import-ready 来源之一 |
| page-ui-vue | Page / Vue SFC | KEEP | runtimeKind=page-userscript；import-ready 来源之一 |
| remote-esm-page | Page / 远程固定模块 | KEEP | runtimeKind=page-userscript；依赖来源安全回归 |
| sidebar-assets-contract | Page / 资产完整性 | KEEP | runtimeKind=page-userscript；名称含 sidebar 不意味着 Sidebar Tool |
| sidebar-controller-demo | Controller / 表单自动化 | BLOCKED | 建议下轮 RENAME；冻结 ID sample.sidebar-controller-demo，先盘点所有消费者 |
| sidebar-page-demo | Page / DOM 标记 | BLOCKED | 建议下轮 RENAME；冻结 ID sample.sidebar-page-demo，先盘点 ESM/CI/历史证据 |
| single-file | Page + Controller / 单文件 | KEEP | 普通经典脚本与 Developer ESM 的不同入口 |

**特别注意：** projects/chatgpt-mindmap/ 具备独立源码、README、测试与发行阻塞说明；旧 examples/programs/chatgpt-mindmap/ 目前只有资源与本地元数据，且含约 4 MiB 的 XMind Runtime。不得在未核许可证/引用/旧安装身份前删它；文档应指向 projects/ 的有效 README。chatgpt-jump-top、chatgpt-voice-cleanup、chatgpt-calculation-relay 是否升级到 projects/，需先确认发行身份、实际依赖与唯一 owner。

## 3. sidebar-tools/ 逐项目台账

| 项目 | 归属说明 | 状态 | 可核证依据或风险 |
| --- | --- | --- | --- |
| ai-send-queue | 正式 Sidebar + Page 业务 | BLOCKED | catalog 指向旧目录，已有独立迁移会话；不抢写 |
| ai-vip-share | 正式 Sidebar 业务 | BLOCKED | Catalog 引用旧目录；持续开发，未来项目迁移需另验 |
| browser-fingerprint | 正式 Sidebar 业务 | BLOCKED | 含 0.2.6 安装包、测试及证据；已有独立迁移会话 |
| browser-sdk-context-menu-demo | SDK 演示 | KEEP | 前轮已重命名；不是新项目迁移对象 |
| browser-sdk-operations-demo | SDK 演示 | KEEP | 前轮已重命名；保留 API 回归样本 |
| cookie-editor | 正式 Sidebar 业务 | BLOCKED | Catalog 预装；本轮并行修复导入抽屉，不能覆盖 |
| dev-hot-preview-p0 | 开发预览回归项目 | KEEP | README 指明 Native preview watcher/同 session A→B；不是无用探针 |
| import-max-probe | 固定依赖/沙箱导入探针 | KEEP | vendor 许可证、SHA、build/ 与验证链具历史回归用途 |
| minimal-html-starter | HTML 工具模板 | KEEP | 前轮已更名；保留零参数可打包起点 |
| papaparse-csv-export | CSV 下载 SDK 示例 | KEEP | 需受控下载确认；不是 ScrapyJS 正式业务 |
| react-starter | React 工具模板 | KEEP | 预编译 IIFE + 共用打包器 |
| scrapyjs | 正式采集业务 | BLOCKED | 含 installer 包/引擎/fixtures/测试；并行 AI Chat 与 UI 修改 |
| shared-ui-demo | 共享 React UI 示例 | KEEP | 独立可安装 JSON / app.ci.json，不能用示例名误删 |
| vue-starter | Vue 工具模板 | KEEP | 独立预编译工具起点 |

**Catalog 证据：** official-tools/catalog.json 仍列出 ai-send-queue、ai-vip-share、cookie-editor 等当前路径；browser-fingerprint 与 scrapyjs 的实际安装、开发和来源还须分别查项目入口。ai-send-queue、browser-fingerprint 有其他会话负责迁移；Cookie Editor、ScrapyJS、AI VIP Share 亦可能并行更新。所有这些目录本轮只读，未来迁移时必须修正 Catalog、app.ci.json、GitHub Actions、相对路径、安装包与来源，并在真实消费链复验。

**不能随意删除的“探针”：** dev-hot-preview-p0 检查 Native watcher 和单预览 session A→B；import-max-probe 验证固定 D3/mitt 资产、许可证与 Sandbox，tracked build 不能未经生成器与消费者核对直接删除；papaparse-csv-export 演示下载权限和单次确认；shared-ui-demo 有独立 app.ci.json 和可安装包。

## 4. tasks/ 所有类型入口

| 文件 / 组合 | 状态 | 来源、消费者及搬迁风险 |
| --- | --- | --- |
| baidu.search.top3.v1.opendesk-task.json + baidu-search-top3.js | KEEP | 固定 baidu.search.top3@1.1.1；源码与包内 sourceUtf8 逐字相等 |
| google.search.top3.v1.opendesk-task.json + google-search-top3.js | KEEP | 固定 google.search.top3@1.0.0；源码与包内 sourceUtf8 逐字相等 |
| page.read.fixed.v1.opendesk-task.json + page-read-fixed.js | KEEP | 固定 page.read.fixed@1.0.0；源码逐字相等 |
| visible-search-navigation.opendesk-task.json + visible-search-navigation.js | KEEP | 固定 workflow.visible-search@1.0.1；源码逐字相等 |
| modern-search.v1.opendesk-task.json + modern-search-draft.js | KEEP | 固定 sample.modern-search@1.0.0；源码逐字相等 |
| form-fill.v1.opendesk-task.json | KEEP | sample.form-fill 包内嵌源码；本机表单演示 |
| agent-modern-search.v1.opendesk-task.json + agent-observe-draft.js | KEEP | Agent 任务/观察草稿；未证明两文件可互换 |
| ai-knowledge-chat-demo.css/.html/.js | KEEP | 本机 AI 知识聊天页面夹具 |
| browser-fingerprint.html + browser-fingerprint/ | BLOCKED | 指纹浏览器测试页面/模块，不是正式 Sidebar Tool 的源码副本；并行 owner |
| chatgpt-relay-calculator-r1.js + .README.zh-CN.md | KEEP | Controller 草稿与相应说明 |
| demo-form.html + workflow-search.html + workflow-commerce.html | KEEP | 43111 Browser Test Lab 现有服务根；改路径前需核 HTTP 测试及链接 |
| reading-toc-article.html + reading-toc-conversation.html | KEEP | Reading TOC 网页测试输入；非第二份正式产品 |
| http-test-server.mjs + http-fetch-draft.js + http-axiosx-page-draft.js + http-worker-axiosx-draft.js + worker-http-draft.js | KEEP | HTTP/Worker 受控诊断草稿及服务；当前 CI 已有相关测试 |
| jquery-page-draft.js | KEEP | 网页依赖草稿，保留原代码审查与回归入口 |
| request-sample.json | KEEP | 示例参数请求，不是可安装任务包 |
| scrapyjs-fixtures | BLOCKED | Git 树 mode 120000，是指向 ScrapyJS fixture 的符号链接；迁移会影响相对目标 |
| scrapyjs-ui-results/README.md + receiver-01a188e8.html | BLOCKED | ScrapyJS 结果页 57 条记录，既有测试输入，独立会话使用 |
| tests/search-actions.test.mjs + tests/google-search-actions.test.mjs | KEEP | 原目录自有 Node 测试；迁出需同时修改 test discovery 与 cwd |

**已进行的包与源码只读核验：** 百度、Google、page.read.fixed、visible-search-navigation、modern-search 五组原始 JS 文件，与其 Task JSON 的 sourceUtf8 **逐字符相同**（本次读取 main 文件内容对比）；这不等于重新计算全部 manifest/sourceHash，也不证明当前 Chrome 安装态成功。禁止修改可安装包的冻结源码、Task ID 或授权来整理路径。

**路径风险：** tasks/scrapyjs-fixtures 在 Git 树是符号链接（mode 120000），不能看成“重复目录”；HTTP 43111 既有演示服务把 examples/tasks 当静态根，搬 HTML 需要同时修复 URL 与所有消费者。已有测试 tests/search-actions.test.mjs 与 tests/google-search-actions.test.mjs 位于 tasks/tests/，暂不复制或迁出以免造成发现漏测或双跑。

## 5. 比较三种方案

| 方案 | 含义 | 结论 |
| --- | --- | --- |
| A：保留技术目录 + 统一导航 | 现有 Runtime/Task/安装入口不变，新增一处中文入口、纠正误导性说明及失效链接；危险搬迁单独列账 | **采用**：当前风险与收益最平衡 |
| B：将技术目录整体物理重命名为更口语化的英文 | 需要同步更新构建、相对导入、测试、CI、CLI、Native/MCP、安装来源 | 暂不采用：当前路径成本很大，消费者尚未穷尽 |
| C：把 programs、tasks、sidebar-tools 合成一个目录 | 将隔离工具、Page/Controller 项目与冻结 Task 混放，仍必须保留配置与权限世界 | 不采用：不能减少运行合同，反而提高误装与回归风险 |

## 6. 剩余迁移前置条件与停止规则

1. **别名改名**：对 sidebar-page-demo、sidebar-controller-demo 先列出完整引用、build/test/CI/历史证据与旧路径发现调用；不改变 runtimeKind、项目 ID、sourceHash。
2. **正式产品搬迁**：由 ai-send-queue、browser-fingerprint 各自既有迁移会话完成；其他产品必须先核 Catalog 唯一 owner 和并行写入状态。
3. **测试文件搬迁**：仅能在确认相对路径、43111 URL、symlink、Test Runner 与 CI 精确对应后，按单个明确 fixture 试点推进；没有证据就保持原址。
4. **重复/历史资源删除**：必须证明不存在安装/构建/测试/许可消费者，留存 Git 历史或可恢复来源，不因文件名像“probe”就删除。
5. **安全门禁**：任何来源/路径 pin 变化需重新审阅，已安装版本不得自动搬家/撤权/扩权；UNKNOWN 结果不补跑。源码字节相同也不等于已安装来源身份相同。

## 7. 本轮验证边界与历史 CI

从当前及其前一轮 main GitHub Actions 可见多个既有失败，包括 R7 axiosx HTTP、Sidebar R1 P0、App CI task-shop；这些失败已在本轮代码修改前存在。GitHub combined status 返回空列表不代表 Actions 成功。对本轮仅文档修改可进行相对链接与 Git 路径的静态核对；**此在线环境没有本地仓库和 macOS Chrome/Native 配对，Node、真实扩展安装与 Native 功能均为 NOT_TESTED**。不要把本文件当作全仓测试 PASS。
