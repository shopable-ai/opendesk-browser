# OpenDesk Browser R16.2 — 第三方库按需供给、物理产物隔离与预算核查

日期：2026-10-12。此记录依据 GitHub main 实际源码及指定 CI 构建回执，不替代最终 Mac Chrome 或安装 ZIP 全验收。

## 核查结果：构建期预置不等于运行时加载

真实生产构建：commit `ad7683a65c415b691a019f56b1733bc248548eaa`，GitHub Actions `38156256854`（扩展包体积与库边界检查成功）。其产物记录含：
- `sw.js`：325,879 B，**仅**属于自己的后台 WXT 入口，生产预算 1,048,576 B。
- Cheerio 121,600 B、CryptoJS 66,438 B、Axios 51,677 B、query-string 9,274 B、store.js 8,689 B、FileSaver 4,131 B：每个为 **独立 WXT 自包含 JS 资源**，在明示 `// @opendesk-lib <id>` 前不会加载。
- 固定 React + ReactDOM 共用一个已有 `libs/page-frameworks/react-19.2.0.js` 文件；Vue 独立固定文件；二者仅显式加载，运行时各自有 256 KiB 读取上限。
- 默认 Page/Controller 的 `bootstrap + Lodash + Day.js + my-utils + core` 为 **运行任务时才读取**；并不自动进入 SW。
- ZIP 包含已审核的全部本地资源及许可证，安装包原始字节/压缩字节与每次执行时下载/评估/占用内存的字节数并不相等，不把上述几种度量相加得出“启动成本”。

## 当前工程原则

1. 坚持 Chrome MV3 本地固定资源：依赖的“动态/按需”指**运行时仅使用声明资源**，不是从 CDN 动态拉取未审核 JS，也不需要独立第二个 vendor 注册表。
2. 继续复用 `src/libs/catalog.js`、`runtime-contract.js`、`scripts/libs.mjs` 与已存在的 WXT entry/manifest SHA/许可证检验。
3. 以 `scripts/build-contract.mjs` 为构建期资源预算，SW 1 MiB、普通固定入口 512 KiB；业务确有实例体积增长时，可根据真实 Rollup 图、生产/开发 dist、加载器限制及 Chrome 证据同步**有理由地调整相关单项预算**，不一概把库塞进 SW 或盲目整体增限。
4. `src/libs/loader.js` 的公共库读取上限与普通 WXT 入口预算建立测试一致性关系；React/Vue 保持独立 loader 上限，不误用普通入口的 512 KiB 来宣称可用。
5. CI 覆盖构建图所有正式 npm 公共库：其 upstream 与包装器只能在自己审核的 WXT 资源中，不得隐含于 SW、默认 Page、Controller 或 Sidebar shell；资源图和实际 hash 必须绑定同一次 WXT 构建。
6. 新增“全部可选库逐一加载”测试：先执行默认 Page/Controller，证明只请求默认固定资源；再逐一选取库，证明只读本项与 manifest；未知库、默认库误选、代码 SHA 改动均拒绝。React / Vue 测单文件按需行为。
7. 工程入口数量由唯一 `PACKAGE_ENTRIES` / `BUILTIN_CATALOG` 推导，不因云控、右键菜单、新增工具的独立入口而反复维护硬编码的总数；但单个已批准关键入口仍应保留断言。

## 验收状态边界

这是 R16.2 **增量边界强化**，不是全部第三方预装目标完成；Controller 的真实 Axios 受权传输、FingerprintJS、Socket.IO 与 Tailwind 工具公共 CSS 等仍按前序合同分别开发。Node 单测、生产/development build、真实 Chrome 与最终 ZIP 是独立证据层级。新的提交需等待相同 SHA 的 CI 通过后才记工程 PASS，不能用 `ad7683...` 的成功 CI 追认为新 SHA 的原生验收。
