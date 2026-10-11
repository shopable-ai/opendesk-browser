# R15.7 公共预装库：真实源码增量与本地验收交接

日期：2026-10-11。范围：对 R1.1 文档之后的实际代码增量、只读 GitHub 溯源与 Mac Codex 续接说明。

## 开工现场

- 开工时 GitHub main：78b2a87ab9573fbb27c60da23204d0d68491531a；并行作者随后持续推进 main。本对话只修改本表列出的库代码、局部测试与独立 docs，不修改他人 Chrome Profile、dist/ZIP 或已有证据。
- 当前执行环境为隔离 Linux，没有挂载用户 Mac 工作区，无法实测 `git status`、`npm ci` 和用户 Mac Chrome；网络不能解析 npm Registry / github.com。本对话采用 GitHub Contents API 的单文件旧 blob SHA 保护写入 main；绝不声称本机 git commit 或 Native PASS。
- 重要并行成果：`src/libs/page-frameworks/` 已有 React 19.2.0 和 Vue 3.5.22 固定 Page 可选资源、合同和校验 loader；`execution-source.js` 已允许一项 `// @opendesk-lib jquery|react|vue`。避免再新增竞争性的 React/Vue npm wrapper 和第二套注册表。

## 已写入的实际改动

| 路径 | 提交 | 作用 |
| --- | --- | --- |
| src/libs/packages/dayjs.js | 450aedeba996c5e9a3f3a878a08e887585c03c31 | 锁定已有 dayjs npm 版本，扩展官方 duration、utc、timezone、customParseFormat；不暴露 extend/locale/tz.setDefault |
| src/libs/runtime-contract.js | 1118dd3aa802d68cfc42fb55c26b316b7d6ffe35 | ABI 从原 v2 更新至 v3，旧证据必须重新验证 |
| src/libs/catalog.js | 668cb2e11b1b66134510215e43dc29a97d1bfb3c | 新增 dayjs.duration/isDuration/utc/tz 公共方法合同 |
| scripts/libs-doctor.mjs | a1c8bfd25908d7aa6caaa0e6e572cf85d9518049、fe6825310eede3208d2bc32cb7d1607417da76bf | 更新诊断输出与精确 API 检查 |
| tests/environment/builtin-libraries.test.mjs | e88aac7fd9dfb5ad944e78e6f14bbaab9f89197b | 真 Day.js 模块调用、固定时区/严格解析、无变更入口等测试 |
| tests/environment/shipped-builtin-worlds.test.mjs | b35a59a9284aab0e58abeed32feb192a8039144f | 真实生产/开发 WXT IIFE 单元内 Page 日历行为测试 |
| src/libs/adapters/axios-transport.js | 55444995a3a5777e31029271543a1e98d55a0027 | 无特权、无网络 fallback 的受控 HTTP 薄协议适配；未接真实 Axios |
| tests/environment/axios-transport-r157.test.mjs | d25866fc74cc6c687cdb92ce8995b78fdf9ec406 | 五组请求/错误/拒绝测试 |
| src/libs/README.md | 2c05ec337a6404c1d16f913e8a87eb844b7f8d54 | 准确标示 Day.js、Axios adapter 与既有 React/Vue 状态 |
| docs/architecture/browser-framework/public-preinstalled-libraries.contract.zh-CN.md | 03c3a5feeff071e2bde492663bade51e2e22bfac | 修订产品合同，不重复建设已存在 Page UI runtime |
| docs/framework/prompts/goal-r157-public-libraries-mac-codex-final-20261011.zh-CN.md | 96bd4b7a91fc9f0fba88ef125c39033f5f6b1adb | 本机 Codex 真实构建、缺口修复和 Mac Chrome 验收 GOAL |

## 本次测试和限制

- Node 隔离环境：`node --check` 检验了同字节的 Axios adapter 文件；本地同逻辑五组 `node --test`：5 passed、0 failed。通过 `git hash-object` 确认适配器本地内容与 GitHub blob c88ba724eaf1e0409ac5ee2a195bdd3aa350f47b 相同。此前测试在隔离临时目录运行，不等于 npm CI 或已在真实 Axios/Runner 下调用。
- Day.js 新包装器依赖真实 `dayjs@1.11.23`、四个官方插件；当前隔离容器没有该 npm 安装包，因此尚未执行真实 Node 功能测试或 WXT 构建；已添加相关真实模块和打包产物回归，待 GitHub CI/本地 Mac 核查。
- GitHub R15 built-in qualification 曾在 main 的 2c05ec... 候选上显示 queued；新的 main 正在变化，必须检查最新候选的 CI 及日志，不能继承 pending/cancelled 结果。
- 正式扩展包、SW 体积、ZIP hash、Controller、USER_SCRIPT、升级/撤权、Mac Chrome：NOT_TESTED / NATIVE_UNVERIFIED。
- Axios adapter 明确不支持 `signal`/`cancelToken` 的单请求取消（抛 E_AXIOS_CANCEL_UNSUPPORTED），只支持 GET/POST/PUT/DELETE、最终 HTTP(S) URL、已转换的文本/JSON payload、文本响应，拒绝特权 header/凭据。缺真实 Axios npm 包/工厂和 Runner 绑定，**尚不能给普通用户直接调用 axios**，绝不将其宣称为完整 Axios 交付。
- 其余 CryptoJS、js-cookie、query-string、store、FileSaver、Cheerio、FingerprintJS、Socket.IO、Tailwind 与工具 iframe 共享能力仍需实施；日期明确只用 Day.js；不恢复 Moment/旧业务，不新增第二 React/Vue 包。

## 安全验收继续条件

- 首先本地 `npm ci --ignore-scripts`，执行 `node --test tests/environment/axios-transport-r157.test.mjs` 和 `builtin-libraries.test.mjs`、`npm run check`；修复任何真实错误。
- 再执行生产/开发 build、verify、libs:doctor -- --strict、npm test、pack/pack:dev，绑定完整同候选 SHA/资源哈希与 SW 327680B 预算。
- 使用 AGENTS.md 标准网页 `http://127.0.0.1:43111/demo-form.html` 和本机独立 Chrome Profile 执行真实 Native，核对旧 ABI 停止/重验、页面内实际库 API、撤权/离线/导航/Worker 重启。
- 继续真实上游 Axios 与现有 Broker 接线及余下公共库时，复用仓库已有 Contract、WXT 固定资源与 USER_SCRIPT/Controller/工具运行器；不要把编写方案或添加空文件作为完成。
- 可复制本地 Codex 任务：`docs/framework/prompts/goal-r157-public-libraries-mac-codex-final-20261011.zh-CN.md`。

状态：PARTIAL_IMPLEMENTATION，NOT_FINAL_ACCEPTANCE。本记录不改变历史版本验收和独立 F3/ZIP 合同。
