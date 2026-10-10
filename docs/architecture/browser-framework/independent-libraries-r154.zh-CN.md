# R15.4：独立 JS 库与 src/libs 目录

> 目标：框架维护者添加固定 classic JS 时，不必为这个单文件创建 npm 项目或让它经过 Vite；普通用户仍是零配置。真实 Chrome 与完整 F3 验收须绑定最终构建 SHA。

## 唯一源码目录

```text
src/libs/
  runtime-contract.js                唯一运行时 ID / 版本 / 世界 / 路径与 ABI 真源
  catalog.js                         对运行时合同补充来源、许可、导出 API、源码哈希
  core.js                            安装 OpenDeskLibs / _ / dayjs 的轻量适配器
  loader.js                          验证扩展包 SHA、组合固定资源，不运行代码
  runtime/bootstrap.js               独立 classic JS 注册握手
  packages/lodash.js                 npm 精确锁 + 8 个审计方法
  packages/dayjs.js                  npm 精确锁 + 安全核心
  vendor/jquery/3.7.1/jquery.min.js  只在 Page 明确声明时加载
  vendor/jquery/3.7.1/LICENSE.txt
  vendor/my-utils/1.0.0/index.js     直接复制的示例文件，不经 Vite
  vendor/my-utils/1.0.0/LICENSE.txt
```

旧 `src/runtime/builtin-libraries/{catalog,core,loader,page-core}.js` **只保留兼容导入转发**，不含第二套 npm 库 / 注册表。原 `src/vendor/jquery-3.7.1.*` 已迁移；最终复制资源只有一份。

## 打包与运行

- 每个 npm 包以独立 WXT unlisted IIFE 入口生成 `dist/<mode>/libs/packages/{lodash,dayjs}.js`，而不是打入 Page CORE 或 Worker runtime。
- `runtime/bootstrap.js` 与 vendor 独立 JS 由 `preparePublic` **按原字节复制**。发布路径为 `libs/runtime/bootstrap.js` 和 `libs/vendor/**`。
- 保持现有 `scripting/sandbox/worker-runtime.js` 与 USER_SCRIPT 执行器。授权检查后，可信 host 按顺序获取 manifest、bootstrap、适用世界的默认独立库及现有核心入口，逐项确认 SHA-256 后拼接成**一个固定执行单元**。
- Worker 仍只有原 opaque Blob Worker；Page 仍使用原 USER_SCRIPT worldId 和单个 `ScriptSource.code`，由源代码内部 readiness 检查防止库失败后用户脚本继续执行。只在代码被授权执行时获取库，不在网站 MAIN 全局注入。
- `libs/manifest.json` 随生产 / 开发构建生成，包含每个固定文件实际字节与 SHA，`catalogSha256` 绑定源码合同；构建检查还校验 vendor 原始文件哈希与许可证。版本 ABI 从 v1 改为 v2，**不能把既有已保存 Task/Candidate 的旧库 ABI 无条件视为已重新验证**。
- jQuery 的一行声明 `// @opendesk-lib jquery` 保持按需与既有 `@require` 互斥，仍仅 USER_SCRIPT。axiosx、Authority、SDK、RunHost 不变。SW 320 KiB 预算不变。

## 手动增加一个无需转译的 JS

1. 把经过代码审查的 classic JS / IIFE 放在 `src/libs/vendor/<id>/<version>/index.js`，同时保存来源及 SPDX 许可文件。禁止 remote import、eval、Function、外部脚本或宿主特权访问。
2. 内容使用原样合同：`globalThis[Symbol.for('opendesk.libs.register.v1')]('myUtils','1.0.0',Object.freeze({upper(text){return String(text).toUpperCase()}}))`。文件顶部以 classic IIFE 包装，不向 MAIN 注册未知全局。
3. 执行 `npm run libs:hash -- src/libs/vendor/my-utils/1.0.0/index.js` 获取原字节 SHA-256 与 bytes。在 `src/libs/runtime-contract.js` **唯一登记** ID、版本、worlds、默认/按需、发布路径与固定原始 SHA/bytes；随后在 `src/libs/catalog.js` 为同一 ID 补充源码路径、许可/来源及导出 API。`catalog.js` 扩展 runtime-contract 中的定义，不复制第二份 ID/版本/世界表。项目不会执行未登记的目录文件。
4. 执行 `npm run libs:list`、`npm run libs:check`、`npm run check`、`npm run build`、`npm run build:dev`、`npm run verify`、`npm test`、`npm run pack && npm run pack:dev`；完整 `npm test` 需要已生成的生产和开发 dist，故安排在双构建与 verify 后。在新构建产物中核对 `libs/manifest.json` 与原 JS SHA。
5. 重新加载 Chrome 扩展：生产构建与手工添加文件**都需重新发布扩展并让 Chrome 重新加载**；开发模式可观察编译、静态文件复制及安全热更新，不能把 HMR 视为旧页面已重新执行。

默认 demo：Controller 与 Page 均应可直接运行 `OpenDeskLibs.myUtils.upper('hello')`，结果为 `HELLO`。同样可以调用 `_.words('Hello World')` 与 `dayjs('2026-10-10').format('YYYY-MM-DD')`。

## 强制拒绝

未登记文件、重复 ID、导出类型缺失、注册版本不符、固定 SHA/字节不符、许可证缺失/修改或资源缺失应拒绝构建或脚本运行；不能静默 CDN 下载。扩展包检查应完整比较 dist/ZIP，且不能放宽 CSP/权限。

## 已保存程序的升级阻断

- Page Candidate 验证回执保存 `builtinAbi`、`builtinCatalogSha256`、`builtinBundleSha256`。安装、恢复、授权与自动执行时，必须重新比较当前 ABI 及 runtime catalog SHA。无字段、v1、已改变的 SHA 都是 `E_PAGE_ENVIRONMENT`，旧已安装程序被安全暂停，不从历史回执获取新版本授权。
- Controller 每次准备运行时，在可信持久 run 记录保存 `builtinAbi`。Task Candidate 必须用带当前 ABI、真实完成回执、匹配 sourceHash 的 Controller run 完成验证，随后将 ABI 写入验证记录；旧运行/旧候选不能继续启用、安装或执行，返回 `E_BUILTIN_VERSION_UNAVAILABLE`。
- 不会静默重写老 Task/Page Candidate 的不可变验证回执；通过新版本重新验证后才允许安装。普通草稿继续由当前已审核扩展包的库加载器提供零配置库。
- 以上是本次实现的 source/Node 回归合同；升级后的真实用户 Chrome 长期存量数据、跨版本离线重启仍需独立原生验收。

## 验收边界

Node VM / GitHub Actions 能验证源身份、构建、Node 功能与包完整性，但**不能替代**真实 Chrome 的 Worker/USER_SCRIPT、权限撤销、导航、停止、刷新、重启、冷/热加载性能与 MAIN 不污染检查。最终 95+ 分只能在这些原生结果可追溯且全部硬阻断项关闭后宣布。
