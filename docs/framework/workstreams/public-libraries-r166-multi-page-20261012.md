# R16.6 Page 多库按需加载：工作流状态

日期：2026-10-12。分支仅 main，不创建 PR/Worktree/分支；不占用 Mac Chrome Profile、测试端口、dist 或 ZIP。

## 已提交实现

- `src/scripting/user-scripts/execution-source.js`：源码前导最多六条固定 ID、稳定去重、React/Vue 冲突拒绝、按声明顺序执行、编译组合 512 KiB 上限；旧 scalar API 兼容。
- `src/libs/loader.js`：批量可选资源用同一次版本 manifest 逐资源哈希验证，未声明的资源不读取。
- `preview.js` / `installed-programs.js` / `page-program-package.js`：真实 Page 预览、安装执行与回执链传递数组身份；升级时逐项对比，旧单库不会授权新增库。
- `tests/environment/page-multi-libraries-r166.test.mjs` 和既有 `public-libraries-on-demand-r162.test.mjs`：Node/VM 定向测试，不能冒充 Mac Chrome。
- `examples/programs/single-file/page-axios-query-string.js`：真实双库单文件页面请求示例，需在用户 Mac Chrome 执行。

## 验收与遗留

本记录只表示源码改变；同 SHA 的 CI 工程及真实 Chrome 回执应分别附加。建议运行：

```sh
node --test tests/environment/page-multi-libraries-r166.test.mjs tests/environment/public-libraries-on-demand-r162.test.mjs tests/environment/axios-public-r159.test.mjs
npm run libs:check && npm run check && npm test
npm run build && npm run build:dev && npm run libs:doctor -- --strict
npm run verify && npm run build:size && npm run pack && npm run pack:dev
```

未覆盖：Controller 真实 Axios Broker 接线和取消；Socket.IO 上游固定版本及真实联机；Tailwind 用户预编译样式隔离；React+Axios 用户可见受管 UI 实机 Demo；最新 main 原生浏览器/ZIP 安装。上述均为 `SOURCE_PENDING` 或 `NATIVE_UNVERIFIED`，不是“只剩最终验收”。不修改旧证据、不预先自评95分。

## 2026-10-12：CI 反馈与准入修复

上一候选 `9ec2df6b83eccb00b063229a69daadc3fe8cfe1d` 的 R15 总体资格 [CI](https://github.com/shopable-ai/opendesk-browser/actions/runs/38251106383) 出现 1619 PASS / 1 FAIL / 7 SKIP：多库 React 示例在 `dependency-metadata.js` 的历史三项硬编码白名单被阻断。新增从唯一 `runtime-contract.js` 导出衍生 alias 表，解析器和编译器共同引用，禁止继续维护不同步的第二份库 ID；定向测试遍历所有可选 alias。此段描述的是源码修复而非新候选的 CI PASS。

## 原生 Mac Chrome for Testing 专项新增用例

`tests/framework/page-content-native-page.js` 在现有 R16.1 macOS CFT 真实用户脚本流程中新增 Axios + query-string 同程序的同源 HTTP GET、Interceptors、参数解析、双 SHA 回执及网站 MAIN 全局未污染断言。使用原生扩展 Broker 的 `previewPageScript`、严格 documentId 和已验资源，不以本地 VM 代替。已提交测试源码不等于成功，等待对应 SHA 的 [R16.1 工作流](https://github.com/shopable-ai/opendesk-browser/actions/workflows/r16-1-page-builtin-native.yml) 得到可信原始回执。

## Controller 真实 Axios 工厂（阶段一）

`src/libs/packages/axios.js` 新增直接复用真实 upstream Axios 1.20.0 的受控 Controller 工厂；`src/libs/adapters/axios-transport.js` 接受由现有 Worker Bridge 传送的已授权 `E_HTTP.cause.response`，其余取消/撤权直接拒绝。新定向单测覆盖 `get/post/create/request/interceptors`、最终 URL、Header、HTTP 错误以及覆盖 adapter 的拒绝。**这一步只提供受控工厂和 L2 测试，不应宣称 Controller main() 已接通**；仍需在固定库按需装载及真实 Worker 入口连接后另行验收。

## Controller Axios R16.7 正式调用闭环的新增源码

在上一阶段真实 upstream Axios 受控工厂的基础上，复用**同一个** `libs/packages/axios.js` 固定 WXT 资源：`runtime-contract.js` 为 Axios 开通显式 Controller 世界（仍为 opt-in），`libs/loader.js` 使用已有 SHA manifest、`scripting/sandbox/controller.js` 只对声明的程序加载并绑定同默认 Catalog 身份，再经 Worker 原有词法 `axiosx` 使用 Broker。Controller ESM 项目 `opendesk.libraries=["axios"]` 由现有编译器生成源码前缀；历史无声明程序不加载。新增 `tests/environment/axios-controller-world-r167.test.mjs` 对已构建实际 IIFE 的 Worker VM 调用测试、示例 `examples/programs/controller-axios-zero-arg/`。这表示代码新增，需要当前提交的包/原生 Chrome 证据才能宣称产品验收，不能借前一提交的成功资格 CI 自动升级。

## 真实 Mac CFT Controller Axios 增量驱动

在现有 `tests/framework/page-content-native-page.js` 增加三条受控 Controller 测试：经过现有 Broker 的已授权跨域 GET + 请求 Interceptors + 原始结果 runId/resultId；未声明目标 Origin 时 `E_PERMISSION`；真实 HTTP 429/500 与 `validateStatus`/AxiosError。CFT 资源用 `tests/framework/page-content-native-axios.js` 从同一个 Axios npm 源生成 Page/Controller 双世界固定字节，不使用 mock Axios、网站 window 或跨站 fetch 兜底。必须等待 macOS CFT 工作流原始回执后才能将 `NATIVE_PASS` 置为真。
