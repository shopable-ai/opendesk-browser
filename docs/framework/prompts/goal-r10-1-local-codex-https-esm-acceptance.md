# GOAL：OpenDesk Browser R10.1 —— 本地 Codex / MCP + npm / HTTPS ESM 闭环与真实 Mac Chrome 验收

> **执行环境：本地 Mac Codex**。本文件是下一轮具体执行交接，不是当前通过证明。先读 [统一使用方式](../../product/program-development-dual-format-and-sidebar.zh-CN.md)、[Native/MCP 连接](../local-development-r22.zh-CN.md)、[HTTPS ESM 安全规则](../../architecture/browser-framework/https-esm-imports-r1.zh-CN.md) 与根目录 `AGENTS.md`。

## 目标与实际基线

仓库 `shopable-ai/opendesk-browser`；本地路径仅在真实存在时使用 `/Users/shopme/Documents/workspace/opendesk-browser`。默认中文，直接开发/修复/测试，不是方案报告。

历史合并参考（执行时必须重新核对最新 `origin/main`）：PR #37 Native/Local Dev/MCP → `47a00fa64cb5ce134ad85724e37d7031b14e3c19`；PR #38 npm 项目和依赖审计 → `75923b3d8cd606d34933a45b1d1e2e51cf3db60d`；PR #39 HTTPS ESM DNS/TLS/缓存安全 → `99269e624574976d02afe3de20d9bb338f0e4b2f`。**三条 PR 均已合入 main，不能重复实现。**

目前 `native-agent/local-dev/resolver.mjs` 的 Local Dev v1 明确拒绝 npm/HTTPS import（`E_DEV_DEPENDENCY`），而独立发布构建器 `scripts/build-program-project.mjs` 已具备 npm lock/HTTPS 已锁定字节构建能力；简单 JS、相对 ESM 及 Page/Controller 入口保持可用。

本轮要以**一个受信项目目录、一个运行权限入口和现有源码构建器**为基础，将「Codex 编辑多文件（含 npm 和固定 HTTPS 模块）→ 同一授权目录重新解析最新源码 → 原 Page/Controller 执行 → 返回真实结果和哈希 → 改完再次有意运行」打通，不需要每次生成 JSON 手工上传、不增加新 Runtime 和 `@require` 表单。

## 实施优先级

1. **确认真实状态：**`git status --short`、`git fetch origin`、Worktree、PR/CI、`AGENTS.md`、受影响依赖/源码范围；禁止覆盖别人未提交的工作。优先复用 main，必要变更遵循独立工作区、PR 审查、授权串行集成。
2. **安全构建器复用：**Local Dev 已授权的项目只能读取边界内的源码/锁和缓存；严格离线消费已锁定 npm/HTTPS 模块。第一次出现未锁定 HTTPS URL 时，报告来源并**要求开发者单独明确批准构建期 `--lock-remote`**，MCP/Sidebar 运行请求不得自动触发下载。复用 R10 固定公网 IP 的 HTTPS 网络安全实现，不放宽 DNS、TLS/peer、重定向、哈希、symlink、TOCTOU、大小、超时或并发锁检查。
3. **ESM 语义：**验证 local/npm/HTTPS 同图静态导入，含 default、named、namespace、`export * from`、相对传递依赖、重复引用及 URL 查询参数；同一次运行身份锁定最终可执行字节与 `sourceHash`。不支持动态 import()/WASM 等时必须明确报错。
4. **Sidebar 与 Codex：**继续使用现有「开发 → 本地项目连接」和 7 个 `opendesk.dev.*` MCP tools；简单源码仍使用一个默认编辑区，Page 用 USER_SCRIPT，Controller 用 RunHost/Worker，不能混用 document/page；不能新增平行 Native/MCP 执行器或依赖管理 UI。
5. **真实 Chrome：**受控 `examples/tasks/demo-form.html`（`python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/tasks`），专用 Chrome for Testing profile。保留真实用户网站/Native 授权；验证普通 JS、npm/HTTPS ESM 返回 42、修改源码后重跑、运行期 Network 没有 CDN JS 下载、导航/撤权/失联/Stop/超时、过期结果拦截。记录真实 Chrome 版本、包身份、目标 documentId、runId/resultId/sourceHash、结果和网络证据。不要用 Node VM、合成 CDP 或截图替代真实验收。
6. **回归及交付：**按受影响代码选择最小必要 Node/CI；只有已改变相关输入才重跑已有成功证据，不修改 603+19/F3/ZIP 正式合同的分母。所有问题、修复、源码身份和原始回执保存到本工作流专属记录。

## 建议的最小核对命令

```sh
git status --short
git fetch origin
npm ci --ignore-scripts --no-audit --no-fund
node --test tests/environment/remote-esm-import.test.mjs tests/environment/remote-esm-security.test.mjs tests/environment/program-project.test.mjs tests/environment/program-build.test.mjs tests/environment/local-dev.test.mjs tests/environment/local-project-connection.test.mjs tests/integration/npm-project-closure.test.mjs
npm run check
npm run build
npm run build:dev
npm run verify
```

macOS CFT/Native 验收脚本及其环境要求以 `docs/framework/local-development-r22.zh-CN.md`、`tests/framework/local-dev-native-acceptance.mjs` 和现有工作流为准；不要抢占其他运行者的浏览器 profile 或端口。安装后获取同一候选的真实回执，而非仅截图。

## 评分与完成定义

六维原权重：安全 25、ESM 正确性 20、用户与 Codex 体验 20、锁定离线 15、真实 Chrome 证据 15、简洁兼容 5。设计评估、组件 CI、真实 Mac/Chrome 验收分开，**只有原始证据足以覆盖全部正式门槛才能宣称 ≥95/100**。所有失败/NOT_TESTED 保持原样，不用主观评分代替事实。

交付：修改文件清单、PR/main SHA、合并后安全删除本轮临时分支状态；真实 Node/CI/CFT/Mac 命令和结果；`42`、修改后重跑的原生身份与真实执行结果；权限/断连/导航失败关闭证据；以及未完成项。不能完成的本机原生验收标记 `NOT_TESTED`，不伪称实现完成。
