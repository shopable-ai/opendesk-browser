# R13.1 WXT 持续开发服务

状态：R13.1 范围已实施、真实 Chrome 已验证，独立质量审查 96/100。会话 `01a121ab-6c6f-7f83-b036-550e30483361`，按本轮明确授权在 main 实施，不创建分支/Worktree。交付提交以本记录所属 Git 提交及远端包含关系识别；不覆盖协作者提交、stash 或历史验收文件。

## 缺口与通过条件

- 静态资源仅由 `scripts/build.mjs` 一次性复制，`package.json` 尚无持续 `dev`。固定 classic IIFE 入口使静态 Sidebar 不直接接受 ESM HMR。
- 修改 `package.json`、`wxt.config.mjs`、构建准备与开发服务脚本；按必要范围接入 Sidebar/Background 的开发专用更新协调。复用现有草稿保存、身份/权限/回执，不重放业务。
- 首次 `npm run dev` 生成完整 `dist/development`，持续运行；只重建变化依赖的入口。HTML/CSS/Sidebar JS 自动更新，Background 安全重载；页面注入代码由下一次明确执行或新文档使用，不自动导航业务网页。
- 真实受控 Chrome 在同一目录验证 CSS 洋红 outline 添加/删除、HTML、JS、共享模块、Background、注入模块、运行中任务、停止/重启与无重复连接。保留日志、输出哈希、真实 UI 和执行身份。
- 开发服务停止后执行受影响组件、源码检查、正式双模式构建/包验证。提交推送前审查并安全合并并发 main 变更；不强推。

## 证据复用与资源

- 已读 `testing-guide.md`；已有 Page API、Page UI、Sidebar 原候选 PASS 仅用于影响分析，不能替代本轮开发更新验收。
- 已读 `sidebar-r13-20261010-01a1217c.json`：其 Chrome/43111 已释放、仅使用独立包快照；其未跟踪记录不归本轮改写。
- 观察到另一个 Local AI 会话在独立 worktree/profile 运行 Chrome，保持其进程、Native Host 和产物。
- 本轮独占 `.wxt/public`、`dist/development` 与后续 `dist/production`；开发服务与独立完整构建串行执行。开发端口 43119、输出守卫 43120、演示端口 43111 和本轮受控 CFT 均已释放。最后 Ctrl+C 返回 0、日志包含 `Stopped`、没有残留输出锁/开发更新标记。
- 原始证据目录：`docs/framework/evidence/wxt-dev-r131-01a121ab/`。不改全局正式验收账本、旧 receipt 或 writer 登记。

## 实现与刷新边界

- `scripts/prepare-public.mjs` 复用原构建静态资源映射；`scripts/dev.mjs` 用已安装 WXT 的 `createServer`，首次完整准备后持续运行。没有逐次调用生产构建或另启 Chrome。
- `scripts/wxt-development.mjs` 将 HTML/CSS 源码变化映射到 WXT 的 public 监听队列，JS 仍使用 WXT/Vite 原生模块图，只编译受影响入口。替换默认无条件 reload 通知，原子发布实际输出哈希及 SDK 资源清单。
- CSS 在同一工具文档替换样式链接；HTML/Sidebar JS 在保存草稿后刷新工具文档并建立新宿主身份；Background 等扩展资源在所有宿主确认空闲后重载扩展。Chrome 关闭 Sidebar 时由人重新打开。
- 注入文件只更新包内资源；现有业务网页与已安装实例保留旧生命周期，新文档/下一次明确执行使用新文件。开发服务不导航网页、不 reinject、不执行用户脚本。
- 保留 Foundation/Native 身份与 ledger，更新期间拦截新执行准入；活跃任务、USER_SCRIPT 预览、待处理 Native 请求、未释放资源及未知结果继续阻止刷新。工具页按当前 token 保存草稿并确认；断线/过期确认不触发刷新。
- 开发专用 session/local 草稿备份只恢复到仍未被用户修改的初始编辑器。正式 `build:dev`/production 均不包含开发客户端。
- OS 持有的 43120 socket 守卫阻止第二个 dev/独立构建争用输出；异常终止后可恢复。关闭时等待初始化、重启链、静态复制、WXT 增量队列及哈希发布完成，重复信号共用一次清理。

## 真实 Chrome 验收

受控 Chrome for Testing 155.0.8059.39，PID `36314`，独立 bundle `ai.opendesk.wxtdev.r131.01a121ab`，独立 fresh profile；扩展 `ccfcjegpkdlgbclopjmadlcjedelidmf` 从 `/Users/shopme/Documents/workspace/opendesk-browser/dist/development` 加载。输入由 CUA 原生操作；CDP 仅观察 DOM、计算样式、脚本加载、console 与只读存储，不赋值 DOM、不合成事件、不伪造回执。

| 用例 | 实际结果与原始证据 |
| --- | --- |
| CSS 添加/删除 | `final-css-before/added/removed.json` 和同名 PNG：同一工具文档 `bc9fc62e-a995-496f-95ad-9dff43032b56` 从无 outline → `rgb(255, 0, 170) solid 3px` → 无 outline；草稿和资源数量保持。无手动构建/扩展刷新。 |
| HTML | `html-added.json`/PNG：标签实际变为「我的 R13.1」，工具宿主身份更新，未保存手工草稿完整恢复；之后源码标记已删除。 |
| Sidebar JS | `sidebar-js-added.json`/PNG：真实顶部状态显示 JS 测试文本，新工具文档保留草稿；之后标记已删除。 |
| 共享模块 | `shared-browser-both.json`：`src/environment.js` 变化由 WXT 重建相关入口，SW 和工具文档分别收到真实 console 标记；不是仅凭编译日志判断。 |
| 运行中 Background 更新 | `task-running-before/after-change.json`：同一运行与工具身份保持，明确显示刷新延后。第一次 30 秒样例触发既有 `E_TIMEOUT`，记录为 stopped/released，不能算成功任务；第二次 20 秒样例完成并 released 后扩展才重载，重新打开 Sidebar 草稿仍在。 |
| 注入模块 | `injection-before-only/after-only.json`、`injection-old-document.json`：新产物未自动替换旧业务文档的已注入脚本。原生刷新目标网页并明确运行后，`injection-new-document.json`/`injection-new-scripts.json` 显示新 isolated world 加载了更新的 packaged page-session。 |
| 无重放 | `final-ledger.json` 只有三次明确 Run 对应的三个 controller-result 和三个 run，全部 retirement released；一个 timeout、两个成功。停止/重启/页面刷新均未增加新运行。 |
| 停止与恢复 | `dev-restart-final.log`：相同固定目录启动、CSS 再次成功、Ctrl+C 清理结束。`exclusive-output.json`：第二个 dev 和 build:dev 均返回 1，活动输出 marker 未改变。 |

最后 CSS 增量产物 revision：`2a77b921a2b41b25026ce0eaeffa3a80c416f2ecf01e878c1f887421d511f724` → `ef7da055ee8ef6a8a9da72e5ffe358056bacf54505a5c9ba968ce714dde10d27` → 原 revision。CSS 实际 SHA-256：`7e2874a727570b6526d98b15d96f9c5be52d624dd38361ff7ec2c4e20690f33b` → `6d4909592a77d36daf6b9a121eeeb3d58fc029f815ec114a261c9b39b3599c6c` → 原 hash。

三次结果的精确 runId/resultId、result 自身 revision/sourceHash、输出包哈希、源码输入指纹与 39 份原始证据的 SHA-256/字节数，见[本流证据索引](wxt-dev-r131-01a121ab.json)。原始日志/JSON/PNG 留在本地 evidence 目录；索引随代码提交，不将摘要冒充完整原始回执。

## 最终验证与限制

- `npm run check`：225 个源码/测试/构建文件，PASS。
- 新开发协议及输出锁回归：8 PASS；全部 environment 文件排除独立 `native-agent-chrome-real.test.mjs` 后：545 PASS、0 FAIL。
- 正式 `build:dev` 与 production 顺序完成，原有 14 classic 入口、路径、CSP、字节预算和严格包验证全部 PASS。专属 `builds/build-*.json` 的 164 个源码输入零漂移，验收后逐一与当前源码 hash 相符。
- 正式 development packageHash：`4925f94fe831e22064f3acc1f364d93bb21352c7a47192fa3986673d1963666f`；production：`93117206bfd14bfbf4344ad0e34e303114f1f81f03818860efc914f95ede1586`。这两个静态包与 WXT serve 的开发包装不同，不能混用身份。
- `npm run verify`：两个目录 PASS。包溯源测试使用本流 `OPENDESK_BUILD_EVIDENCE_DIR`，核对实际文件/模块图，不覆盖旧 receipt。
- 保留失败：初次完整 `npm test` 为 543 PASS / 3 FAIL / 1 SKIP，两项包溯源在正式构建后已通过；再验为 545 PASS / 1 FAIL / 1 SKIP。剩余为现有真实 Native CLI 测试的 `Chrome AX process identity changed (-2700)`。名称过滤未排除该文件，所以最终组件批次明确按文件排除它；既有失败未删除，也不宣称完整 npm test 或 Native CLI PASS。
- 早期真实 Chrome 发现 WXT 0.21.4 在禁用 reloadCommand 时仍注册 commands listener、开发连接 sender 缺 documentId、重复 SIGINT 提前退出和拒绝第二服务误删 marker；保留失败观察，修复后按变化范围再验。页面读取的历史 console 包括旧断服 fetch 失败，不作为当前更新成功证据。
- 独立架构审查无剩余 actionable defect。独立 R13.1 评分 96/100：模块图/固定输出 20/20、UI/草稿 20/20、任务安全 28/30、注入生命周期 15/15、关闭/身份证据 13/15。扣分来自部分竞争条件只用组件回归覆盖、最终关闭资料整理不足；Native AX 失败明确保留。此评分不授予框架正式 Native、最终 F3 或 ZIP 接受，本轮不发布。

## 工作树

    持续开发服务：已实施；WXT 增量监听与固定目录真实通过
    安全自动更新：已实施；真实运行中延后、草稿恢复、三次明确运行无重放
    真实 Chrome 验收：本轮功能通过；原始哈希/UI/ledger 保留；独立 Native CLI AX 失败未关闭
    文档与交付：README/中文指南与最终双构建通过；main 提交/远端身份以 Git 历史核对
