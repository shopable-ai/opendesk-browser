# GOAL：OpenDesk Browser R15.7 Final —— 公共预装库真实执行、回归修复与 Mac Chrome 验收

日期：2026-10-11。默认中文。

仓库：https://github.com/shopable-ai/opendesk-browser

这是给**本地 Mac Codex** 的执行任务，不是新的独立架构方案。请直接操作本机正式仓库，核查最新 main，实施仍缺失的真实用户 API，修复测试、完成构建和 Chrome 原生验收；确保最终给出具体文件、PASS/FAIL/NOT_TESTED、Git commit SHA，不只写说明。

## 0. 严格工作约束

只在 main 工作，不创建分支、Worktree 或 PR。不强推、不 reset --hard、不 clean、不覆盖其他 Agent 的未提交差异、Chrome Profile、dist、ZIP、日志或原始证据。**先核对并行任务**：AGENTS.md、src/libs/AGENTS.md、docs/framework/testing-guide.md、docs/framework/parallel-development.md、docs/framework/workstreams/ 和相应已存在证据。同步仅在可安全快进时进行。

先运行并记录：
```bash
pwd
git status --short --branch
git rev-parse HEAD
git fetch origin main
git rev-parse origin/main
git log -8 --oneline
node --version
npm --version
```
有未提交工作/并行 writer 时，先划定受影响文件/独立测试资源，不覆盖他人代码；不能安全同步就保留现场，不制造假 HEAD 或直接覆盖。生产 SW 硬限保持 327680 字节，CSP/permissions 不扩大。

## 1. 继承当前真实实现，禁止再次重建框架

先读取：

- docs/architecture/browser-framework/public-preinstalled-libraries.contract.zh-CN.md（R1.1 加 R15.7 实施进展）
- src/libs/README.md、src/libs/{runtime-contract,catalog,core,loader,identity}.js
- src/libs/packages/{dayjs,lodash,js-cookie}.js（这三个入口已存在，其余目标仍需真正实现）
- src/libs/adapters/axios-transport.js（仅薄适配，真实 Axios 尚未接入）
- src/entrypoints/js-cookie.js、src/scripting/user-scripts/{execution-source,preview,installed-programs,page-program-package}.js
- src/libs/page-frameworks/{contract,loader,react-19.2.0,vue-3.5.22}.js（现有 React/Vue Page 预装资产，不能重复开发）
- package.json / package-lock.json（已固定 js-cookie@3.0.8 等）
- src/scripting/user-scripts/{execution-source,preview,dependency-manager,packaged-dependencies}.js
- src/scripting/sandbox/{worker-runtime,page-proxy}.js
- src/platform/chrome/network.js、src/framework/sdk/registry.js
- scripts/{libs,libs-doctor,build-contract,prepare-public,verify-package}.mjs、wxt.config.mjs、根 package-lock.json。

已写入源码：Day.js 固定四插件及 Catalog/ABI；Axios **纯协议适配器**和五组测试；真实 js-cookie@3.0.8 的 npm 锁、固定 WXT 入口/资源 manifest、Page opt-in 预览与已安装执行、源码及产物测试。不能把 adapter 通过测试写成真实 Axios 已安装或已在 Runner 可用。既有 React/Vue `src/libs/page-frameworks` 及 `// @opendesk-lib react|vue` 已经在 main，**不得**再建立另一套 `packages/react.js`、`packages/vue.js` 或第二个 ReactDOM 构建物。单一已有页面运行器和工具安装器继续复用。

## 2. 第一阶段：先确认并修复 R15.7 已写入源码

读并运行：
```bash
npm ci --ignore-scripts
node --test tests/environment/axios-transport-r157.test.mjs
node --test tests/environment/builtin-libraries.test.mjs tests/environment/builtin-idempotence-r155.test.mjs
npm run libs:list
npm run libs:check
npm run check
```

核对：
- `dayjs.duration(90,'seconds').asMinutes() === 1.5`
- `dayjs.utc('2026-10-11T00:00:00Z').tz('Asia/Tokyo').format('HH:mm') === '09:00'`
- `dayjs('2026-02-30','YYYY-MM-DD',true).isValid() === false`
- `dayjs.extend`、`dayjs.locale`、`dayjs.tz.setDefault` 不公开，源内插件初始化顺序正确。
- 内置 ABI 已升级；旧 v2 Candidate / Task / Page 安装验证回执应 fail closed，需要重新验证/重新保存，而不是绕过校验。
- `src/libs/adapters/axios-transport.js` 只接收窄 `http/getUri`，不能直接 import chrome/受信 Broker、不能后备使用不受权 fetch；权限失败绝不能由 validateStatus 转为 HTTP 成功。
- 重点审查 Axios 传输测试与真源代码是否一致，修复真实失败，不能降低断言或吞错。

记录每条测试的 commit/input identity、命令、exit code 和日志位置；若受本机资源占用影响，先做无冲突的静态/单元项。

## 3. 第二阶段：把真正用户可用的 Axios 接上现有 Runner

先确认上游兼容、安全版本、许可证、锁文件 integrity 和与 Chrome MV3 的正确 bundle。通过根 `npm install --save-exact --ignore-scripts axios@<审核确定的版本>` 形成真实 package-lock，不手填 npm SHA，也不要使用旧 0.x min.js 充数。

- 增加经审核的 `src/libs/packages/axios.js`、明确 WXT 本地固定资源、唯一 Catalog 与 ABI/资源哈希。用户要调用真实 Axios create/defaults/interceptors/get/post，而不是把 axiosx 改名。
- 在 Controller 的既有 `services.axiosx`/Broker 环境中用 `createAuthorizedAxiosTransport`；适配器的入口仅由可信 Runner 绑定。Page 的普通网络遵守站点 CORS；特权跨站请求只能接该程序已有授权，未接上则明确不支持，禁止静默升级。
- 解决当前 `E_HTTP.response` 跨消息字段、非2xx + validateStatus、URL/paramsSerializer 单次序列化、JSON transform 单次处理、headers/credentials/redirect 限制、timeout=0、AbortSignal 真正取消到宿主及停止/撤权时中止。当前 adapter 对 signal 明确报 `E_AXIOS_CANCEL_UNSUPPORTED`，未解决前不能宣称完整支持取消。
- 没有具体验证前，不提供二进制、multipart、PATCH、Node adapter、任意 Authorization/凭据绕过。不扩展权限/ABI 以掩盖失败。
- 为用户 Sidebar → Controller / USER_SCRIPT 新增真实示例和实际调用测试（包括错误、撤权、同域/跨域、导航、SW 重启），并验证输出来自真实 Axios 而非简单仿造代理。

## 4. 第三阶段：其余已经确定的用户预装库，不再回到范围讨论

用户目标还包括真实 CryptoJS、js-cookie、query-string、store、FileSaver、Cheerio、FingerprintJS、Socket.IO Client 和 Tailwind 用户 UI 样式；日期只用 Day.js、不新增 Moment。按目标执行世界、许可/安全/字节预算分批接入，确有发布阻断要具体报告。预装是扩展本地携带；默认加载和明确按需加载分开。不要求普通用户安装 npm。

- `packages/` 使用 npm 上游精确锁 + WXT 自包含资源，不假写空包装模块。
- `vendor/` 保持当前 jQuery 3.7.1 和 my-utils 单一原字节资产/许可证；不把其他库一股脑复制旧 min.js。
- `adapters/` 保留实际 Axios 薄转换；不要预建 store/file-save/socket 空适配或第二 Broker。
- `page-frameworks/` 已有 React19.2.0/Vue3.5.22 Page 包；复用两者零构建普通 JS 示例、单实例 React createRoot、受管 UI 卸载，不重复引入。工具 iframe 的共享可选能力如果还没接，标出真实缺口再最小增量完善。
- FingerprintJS 无自动采集/上报；Socket.IO 无默认连接、不恢复旧远控业务，停止/退权/卸载清理。旧 TimeReview、Monaco、ECharts、Docsify 不迁入这轮。

如工作量较大，先把前两阶段完成到真实验收，再按业务风险和依赖优先级实施第三阶段；不得用一份“审计库存”冒充公共运行库已交付。

## 5. 完整工程与真实 Mac Chrome 验收

完成有实际代码变更的最终候选，并在不争用其他 Agent 测试资源的条件下执行：
```bash
npm run libs:list
npm run libs:check
npm run check
npm run build
npm run build:dev
npm run libs:doctor -- --strict
npm run verify
npm test
node --test tests/environment/shipped-builtin-worlds.test.mjs
npm run build:size
npm run pack
npm run pack:dev
```

R15 GitHub Actions `R15 built-in libraries qualification` 按最新 commit SHA 核对；不能把先前已取消或旧 SHA 的 CI 当最新通过。检查 dist/production/libs、dist/development/libs、manifest、库组版本/许可证/字节 SHA、SW <=327680、正式 ZIP 内每个资源与 dist 一致。

真实 Chrome 使用 AGENTS.md 标准页面：
```bash
python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/tasks
```
访问 `http://127.0.0.1:43111/demo-form.html`，在独立已授权测试 profile 加载**同一个新构建候选**。优先复用 `tests/framework/r155-final-native.mjs`、`tests/framework/r15-native-sidebar.mjs` 与当前 React/Vue 既有原生测试/fixture 的运行方式。至少验证 Controller/USER_SCRIPT 的真实日期 API、Axios HTTP/权限拒绝、jQuery opt-in、React/Vue 不污染网站 MAIN、离线、重新载入、Worker 重启、停止/撤权、旧 ABI 拒绝。不能用 Node VM 或手工设置 DOM 冒充真实 Chrome 回执。原生不可执行明确标 `NATIVE_UNVERIFIED`。

## 6. 最终交付及 Git

- 保留已完成旧测试及其 packageHash；只对变化输入作受影响重验，正式 F3/ZIP 独立合同不从组件结果继承。
- 更新 `src/libs/README.md`、公共预装能力合同及本工作流专属文档，明确每个库 `ACTIVE_BUILTIN` / `PARTIAL` / `NOT_IMPLEMENTED` / `NATIVE_UNVERIFIED`，记录实际公开 API、源码/产物、消费者、许可证、SHA。
- 只在安全 main 状态下提交通过定向验证的变更，提供实际 commit SHA、修改文件清单、CI 链接、失败/跳过项、SW 体积和待完成工作。
- 质量目标设计与工程均达到 95+ 是验收要求，不是任意自评。任一未完成 P0 需要如实标出，不能宣称整轮已完成。不要仅返回下一份 GOAL；**直接实施、测试、修复并提交**。

## 7. R15.7 已实现的 js-cookie：真实本地验收

最新 main 的 `packages/js-cookie.js` 和 `entrypoints/js-cookie.js` 已接上 `// @opendesk-lib js-cookie`、扩展本地固定资源、已安装 Page 和预览。其物理包/多入口构建后运行：

```bash
node --test tests/environment/js-cookie-r157.test.mjs
node --test tests/environment/native-agent-package.test.mjs tests/environment/libs-doctor-r155.test.mjs
```

在 Sidebar「开发 → 网页 JS」的已授权网页实际运行：

```js
// @opendesk-lib js-cookie
async function main() {
  Cookies.set('od-r157-test','HELLO',{path:'/'});
  const answer=Cookies.get('od-r157-test');
  Cookies.remove('od-r157-test',{path:'/'});
  return answer;
}
```

必须真实返回 HELLO；检查 Cookie 移除、禁用/撤权/导航、完整版本 ABI、同页面 MAIN 不存在被注入的 `Cookies` 变量；不把一个 Node VM PASS 冒充 Chrome PASS。现有入口总数是 **20**，不再是历史硬编码 19。CI 曾明确报告旧测试写死数量及生产 SW 超 327680 字节，后续代码/夹具进行了修复；一定复验最终 SHA，不复用失败旧候选。

## 8. 其余 packages 不得被省略

以下仍**缺少完整真实用户运行链**，不得将 `src/libs/README.md` 规划路径当作已实现：`src/libs/packages/{axios,crypto-js,query-string,store,file-saver,cheerio,fingerprintjs,socket-io}.js` 及 Tailwind 用户 UI 公共预编译样式。根据版本/许可/执行世界、严格打包预算依次落地，一项必须包含真实上游/npm 锁、本地固定 WXT 资源、完整 loader/Catalog/公开 API、用户实例、负向及真实 Chrome 证据。js-cookie 已落地，不要重复重做；React/Vue 保留现有 page-frameworks。每批区分 ACTIVE_BUILTIN、PARTIAL、NOT_IMPLEMENTED、NATIVE_UNVERIFIED。

`npm run libs:doctor` 仅覆盖已经登记的库，不能证明全部目标库已完成。严禁复制全部历史 JS 到 SW、恢复运行时 CDN，或放宽权限和 CSP。
