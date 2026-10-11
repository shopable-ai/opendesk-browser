# GOAL：OpenDesk Browser R24.3 — JSX/Vue SFC 业务代码轻量构建、共享运行时、自动准备与 Mac Chrome 真实验收

默认中文。仓库：https://github.com/shopable-ai/opendesk-browser
代码候选 PR：https://github.com/shopable-ai/opendesk-browser/pull/66
文档历史 PR：https://github.com/shopable-ai/opendesk-browser/pull/64
工作记录：`docs/framework/workstreams/page-ui-shared-runtime-r243-20261011.md`

你作为 Chrome MV3、WXT/Vite、React 19、Vue 3 SFC、Node.js、R23 Native LocalDevResolver、Page USER_SCRIPT、构建缓存与 Mac CFT 安全验收联合负责人，直接在真实 Mac 本地源码仓库完成**检查、修复、测试、文档、证据和安全提交**。不要仅解释或重新设计第二套架构。

## A. 先安全核查

1. 核对 `AGENTS.md` / `docs/framework/testing-guide.md`、真实 `git status`、当前分支/HEAD、origin/main、是否有其他 Agent 正在写入；**绝不覆盖未提交变更**。PR #66 是隔离的候选，不直接强推、reset、clean 或抢共享 Chrome/Native/dist 资源。用户本地 main 可能有并行修改，安全引入 PR 的代码并仅暂存任务自身文件。
2. 读 R24.1 的真实 961871/144502 B 失败记录、R24.2 Direct 的真实 Chrome 证据、R23 本地自动准备与目录连接合同。不得用旧 PASS 冒充当前候选。
3. 核对 PR #64 与 #66 文档差异，保留历史失败证据，并消除旧版“当前始终超限”与新版有条件轻量构建之间的叙述冲突。

## B. 优先让两个高级示例真正运行

1. 安装仓库锁定工具链以及 React/Vue 项目各自锁定的依赖（`npm ci --ignore-scripts --no-audit --no-fund`）；运行两个 `npm run build:framework`，读取 `src/compiled/framework.js` 的**实际字节**。不因 Vite PASS 推断 OpenDesk PASS。
2. 执行 `node --test tests/integration/page-framework-shared-runtime-r243.test.mjs`、R24.1/R24.2 定向回归和 `npm run check`。定位任何 Vite alias、SFC helper、React Hooks 双实例、导入/哈希/容量问题，修改后重新测试；**不能通过放宽 Page 源文件或最终 100000 B 预算让测试通过**。
3. Vue 现有 `src/vue-runtime-adapter.js` 只是**当前测试模板专用**：严格审计 helper 行为，不能把模拟 openBlock 误认为任意 Vue SFC 兼容。若要达到产品级通用 SFC，优先从官方固定 Vue 运行时导出经确认的完整 compiler helper API，重新生成资源、SHA 和 license 清单，并与运行时版本绑定；不使用页面 Vue、CDN、MAIN、eval 或外部动态注入。
4. React JSX 采用规范 JSX 编译；createRoot/Hooks 必须来自同一个扩展固定 React，不能用户源包再引用 ReactDOM。错误须指向真实 `.jsx` / `.vue` 源码，而不是仅“webpack 失败”。

## C. 完成单命令开发的真正产品合同

目标体验：在项目中执行 `opendesk browser dev .` → 合法 JSX/.vue 保存后**由受信工具后台自动转换并准备** → 侧栏显示 ready / updating / source-error 和最新版本身份 → 用户点击运行才执行网页业务 → Stop 完全清理。无需用户先执行 Vite、npm run build 或自己提交 compiled 文件；初次安装 CLI 时可由维护者预装受审核的编译器与运行时。当前 PR #66 只是“用户显式启动 Vite watch + R23 自动准备”的过渡模式，不能宣称单命令已实现。

在 R23 原 Resolver 内增量添加可信编译适配，继续复用原编译器、缓存、inputHash/sourceHash/artifactId、Native 消息/权限与执行器；编译工具版本固定并验 SHA/许可证。绝不在用户目录运行任意 `npm scripts` / Vite config 或下载代码。watcher 监测真实源输入和受信转换产物；支持原子保存、高频防抖、旧代丢弃、语法失败不回退旧字节；Go→Sidebar 传递 `preparation` 状态的缺口也需核查修补。保留 single-file direct / Controller / npm / HTTPS 现有行为。

## D. Mac 本地真实验证与关闭条件

标准测试页：`python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/tasks`，网站 `http://127.0.0.1:43111/demo-form.html`。使用独立 Chrome for Testing Profile 和已确认 SHA 的扩展/Native Host，真实 USER_SCRIPT、站点授权及回执，不伪造 Native ack 或手工更改 DOM 充当执行结果。

至少覆盖两个原始高级项目的可执行业务 JS 预算、React Hooks 状态、Vue SFC template/ref 状态、DOM 高亮/撤销、20 次 Run/Stop、重复保存、Vite/转换语法错误恢复、SPA/BFCache、站点与安装权限、严格 CSP、不同窗口/文档隔离、来源 SHA 与实际构建包一致，以及 Provider 断开后不误执行旧源码。若无法完成任一项，明确 BLOCKED/NOT_TESTED 与可复现阻碍，不能自评分 ≥95 或宣称正式交付。

保留测试命令、原始构建大小、版本哈希、截图/回执、触发条件、PASS/FAIL/NOT_TESTED 和释放资源清单到 R24.3 专属 workstream；仅在安全条件下提交并更新 PR，不覆盖他人改动、不强推 main、不未经授权发布扩展。最终回答分别说明：源码状态、组件/CI、真实 Chrome、Go 状态、单命令自动编译完成度、余留缺陷与下一步。
