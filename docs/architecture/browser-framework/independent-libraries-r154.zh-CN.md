# R15.4：独立 JS 库与 src/libs 目录

> 目标：框架维护者添加固定 classic JS 时，不必为这个单文件创建 npm 项目或让它经过 Vite；普通用户仍是零配置。真实 Chrome 与完整 F3 验收须绑定最终构建 SHA。

## 唯一源码目录

```text
src/libs/
  catalog.js                         唯一版本 / 世界 / 来源 / 资源登记表
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
3. 执行 `npm run libs:hash -- src/libs/vendor/my-utils/1.0.0/index.js` 获取原字节 SHA-256 与 bytes，在**唯一** `src/libs/catalog.js` 显式添加 ID、版本、worlds、默认/按需、方法、来源、文件、SHA、bytes、许可证及其 SHA。项目没有自动执行未登记目录文件的能力。
4. 执行 `npm run libs:list`、`npm run libs:check`、`npm run check`、`npm test`、`npm run build`、`npm run build:dev`、`npm run verify`、`npm run pack && npm run pack:dev`；在新构建产物中核对 `libs/manifest.json` 与原 JS SHA。
5. 重新加载 Chrome 扩展：生产构建与手工添加文件**都需重新发布扩展并让 Chrome 重新加载**；开发模式可观察编译、静态文件复制及安全热更新，不能把 HMR 视为旧页面已重新执行。

默认 demo：Controller 与 Page 均应可直接运行 `OpenDeskLibs.myUtils.upper('hello')`，结果为 `HELLO`。同样可以调用 `_.words('Hello World')` 与 `dayjs('2026-10-10').format('YYYY-MM-DD')`。

## 强制拒绝

未登记文件、重复 ID、导出类型缺失、注册版本不符、固定 SHA/字节不符、许可证缺失/修改或资源缺失应拒绝构建或脚本运行；不能静默 CDN 下载。扩展包检查应完整比较 dist/ZIP，且不能放宽 CSP/权限。

## 验收边界

Node VM / GitHub Actions 能验证源身份、构建、Node 功能与包完整性，但**不能替代**真实 Chrome 的 Worker/USER_SCRIPT、权限撤销、导航、停止、刷新、重启、冷/热加载性能与 MAIN 不污染检查。最终 95+ 分只能在这些原生结果可追溯且全部硬阻断项关闭后宣布。
