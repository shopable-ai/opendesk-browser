# OpenDesk Browser · HTTPS ESM URL 导入（构建阶段）R1

更新：2026-10-09。此功能是**本地 JavaScript 项目构建能力**，不是 Sidebar 远程脚本加载器，也不是新的 UserScript / `@require` 表单。

## 一句话

JavaScript 源码允许写标准静态 HTTPS URL 导入；首次由本地开发者明确固定依赖，之后整个构建离线复用相同 SHA-256 字节：

```js
import add from 'https://cdn.jsdelivr.net/npm/lodash-es@4.17.21/add.js';

export default async function main() {
  return add(20, 22);
}
```

URL import 不代表浏览器会发起远程执行，最终 `program.js` 包含本地编译的模块代码，复用现有 Page USER_SCRIPT 或 Controller RunHost。**不扩展权限，不改变用户点击运行、精确网页身份、正式任务安装或验证合同。**

## 建议操作（Codex 和终端相同）

示例位于 `examples/programs/remote-esm-page`。

1. 首次：`npm run build:program -- examples/programs/remote-esm-page --lock-remote`。
   - 开发者明确触发一次网络获取；构建器拒绝非 HTTPS、用户信息、私网/IP、非常规端口、重定向、超大源码、未知 MIME、动态 `import()` / `require()` / `eval()`。
   - 下载仅供**本地构建器**使用，最多 32 个静态模块、单模块 128 KiB、合计 256 KiB。
   - 生成 `opendesk.remote-lock.json`（URL、SHA-256、大小）与 `.opendesk/remote-cache/<sha256>.mjs`（原始 UTF-8 字节），同时允许 `import` / `export ... from` 的 HTTPS、相对和同站绝对路径静态依赖。
   - 审阅后，把**锁文件和缓存字节同时提交到项目版本管理**。没有锁并不能自动视为可信资源；首次获取并非来源审核或安全证明。
2. 后续：`npm run build:program -- examples/programs/remote-esm-page`。
   - **严格离线**；校验全部模块字节 SHA-256。缺少锁、缓存内容被篡改、换了 CDN 内容/模块 URL，立即失败，不静默重下。
   - 不再需要 `@require`、URL 输入框、固定依赖版本下拉框等界面。
3. 使用生成的 `program.opendesk-draft.json` 或 `program.js` 按现有流程导入 OpenDesk，明确选择目标网页并试运行。生成工件状态仍是 **BUILT_UNVERIFIED**；编译成功不能替代 Chrome 真实验收或任务正式安装。

## 与本地和 npm 依赖的关系

- 本地文件：`import { fn } from './fn.js'`，照旧。
- npm：`import { debounce } from 'lodash-es'`，照旧由 `package.json` + `package-lock.json` 固定。
- 网络 ESM：`import { fn } from 'https://host.example/lib/v1/mod.mjs'`，按本方案固定并离线编译。
- 单文件 Sidebar 编辑器中的原始 `import 'https://...'` **不会被直接执行**；这需要先进入现有多文件项目构建流程。未来可由 Codex CLI / IDE 简化传输，但无需新增依赖配置 UI。
- 传统 `@require` 只保留**既有已批准锁**兼容，不自动转换成远程 ESM，也不跨越运行世界。

## 关键技术边界与故障策略

- **Manifest V3**：`<script src="https://...">`、`fetch(...).then(eval)` 不是普通扩展代码的发布方案；网页 User Scripts API 的政策例外不能当作对其他执行世界的自动许可。这里的网络发生在本地开发环境，构建后运行内容固定。
- **不用 `webpack.experiments.buildHttp`**：当前工程固定 Webpack 5.95.0，该插件后续修复了绕过 URI 许可范围的漏洞。本方案只给 Webpack 传入显式匹配、内容已经固定并验证的本地临时模块路径。
- URL 必须 HTTPS，禁止重定向、凭证、IP 字面量、localhost/local/internal 等；完整 ESM 图静态可解析。带裸包名、动态导入、CommonJS、CSS/WASM、超限资源应转用 npm/本地包或等后续独立设计。
- 不对任意远程 JS 的安全性、许可证、第三方服务内容、生产发布审核作保证。新增网络依赖仍需开发者检查代码、许可证和导入目标。
- 构建时同一个 SHA-256 字节重复引用，不重新下载；对于已有多份内容，只从当前固定 URL 列表解析，每个模块固定一个哈希。缓存缺失和内容变动不自动修复。

## 定向测试及验收级别

`node --test tests/environment/remote-esm-import.test.mjs tests/environment/program-project.test.mjs tests/environment/program-build.test.mjs`

测试通过只表示构建/模块级证据，不等于真实 Chrome Page UI 的端到端验收。实际验收还需同一 build SHA 的 `program.js`、Page Runner、Permission、目标 document、运行回执和结果记录。

参考：
- https://developer.chrome.com/docs/extensions/develop/migrate/remote-hosted-code
- https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements
- https://webpack.js.org/configuration/experiments/
- https://github.com/webpack/webpack/security/advisories/GHSA-38r7-794h-5758
- https://github.com/webpack/webpack/security/advisories/GHSA-8fgc-7cc6-rx7x
