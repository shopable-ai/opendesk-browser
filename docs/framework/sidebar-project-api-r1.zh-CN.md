# OpenDesk Browser · 多文件 Program API 与 Demo 操作 R1

> 2026-10-09：本文只描述**已在 main 实现的 API**与随仓库提交的示例；源码目录直接读取与 Page 自动安装仍有实施缺口；Page 资源已支持有界本地打包。Native Bridge 与多文件源码快照代码已合入 main，但真实 Mac Chrome/Codex 端到端仍须单独验收。

## 1. 源文件和执行环境是两回事

| 维度 | Page USER_SCRIPT | Controller |
| --- | --- | --- |
| `runtimeKind` | `page-userscript` | `controller` |
| 源入口 | `export default async function main() {}` | `export default async function main({page,params}) {}` |
| 运行对象 | 当前页面的 `document` | 受控 Worker 的 `page` 与 `params` |
| 网站声明 | `pageRules`，`world:"USER_SCRIPT"` | `siteOrigins` 单一精确 HTTP(S) origin 和 `permissions:["page.automation"]` |
| Sidebar 单次运行 | 开发 → 网页用户脚本 → 在当前网页试运行 DOM 脚本 | 开发 → 底栏运行草稿 |
| 正式安装 | Page Program 安装/重启/撤权链尚未完成 | Task v1 Candidate → Verification → Available → 显式安装 |

多个 ESM 文件会被编译为一个固定 classic `program.js`，**不会创建第三个 JavaScript Runtime**。不能在 Page USER_SCRIPT 中直接调用 Controller 的 `page.getByRole`；也不能在 Controller 里假定网页的 `document` 是 Worker 全局变量。

## 2. `package.json` 与 Program 源合同

所有项目使用一个 `package.json`，不额外手工维护 `opendesk.json`。必须包含合法 npm `name`、`version`、`private:true`、`type:"module"`、非空 `description` 以及 `opendesk` 描述。

Page 的最小例子：

```json
{
  "name": "@example/my-page",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "description": "示例页面脚本",
  "opendesk": {
    "format": "opendesk.project.v1",
    "id": "example.my-page",
    "runtimeKind": "page-userscript",
    "sourceFormat": "esm",
    "entry": "src/main.js",
    "pageRules": {
      "matches": ["http://127.0.0.1/*"],
      "excludeMatches": [],
      "runAt": "document_idle",
      "allFrames": false,
      "world": "USER_SCRIPT"
    }
  }
}
```

Controller 采用 `opendesk.siteOrigins`（一个精确 origin）、`permissions:["page.automation"]` 和 `paramsSchema`（不允许未知属性的封闭对象 Schema）。参考 [Controller Demo](../../examples/programs/sidebar-controller-demo/package.json)。

本地 ESM 示例可写 `import {helper} from './helper.js'`。入口必须具有 default export。npm 裸包导入需在 dependencies/package-lock 中锁定；禁止任意远程 `import('https://...')`、动态 import、eval/require 和自动运行项目 Webpack 插件。是否允许第三方资源进入执行世界由已有权限/依赖合同决定，不能仅凭文件存在而自动批准。

## 3. 已实现的编程与命令 API

- `validateProgramProject(input: string)`：从 `scripts/validate-program-project.mjs` 导出；`input` 是项目目录或其 `package.json` 路径。返回 `{status:"AUTHORING_VALID_NOT_PACKAGED",id,version,runtimeKind,entry,sources,assets,npmPackages,installable:false}`。其中 `sources/assets` 各行有 `path,sha256,bytes`。
- `buildProgramProject(input: string,{outputDirectory?,mode?:'production'|'development'}={})`：从 `scripts/build-program-project.mjs` 导出。重做静态检查，调用固定 Webpack 生成单个 classic JS，冻结实际字节与 SHA-256，返回 `{status:"BUILT_UNVERIFIED",outputDirectory,sourceHash,sourceBytes,installable:false,...}`。
- 标准构建文件为 `program.js`、`artifact.json` 和 **`program.opendesk-draft.json`**（`opendesk.program-draft.v1`）。草稿包含冻结可执行 JS、源码文件的只读快照及 SHA-256；源码模块的 UTF-8 BOM 保留在快照和哈希中。Page 支持与源合同相同的 SemVer prerelease；Controller Candidate 仍要求稳定版本。实际格式化 JSON 文件（含末尾换行）不得超过 512000 字节。Controller 额外输出 `program.opendesk-task.json`，**只是待验证 Candidate**。默认输出到 `artifacts/programs/<id>/<version>/r31-<mode>/<hash-prefix>-<authoring-prefix>/`。默认 production 压缩；`npm run build:program -- examples/programs/sidebar-page-demo --mode development` 可生成可读 JS 和本地 `program.js.map`，并不会自动给运行错误虚构源码行号。构建、保存、导入、发布、安装是不同动作。

构建器不执行项目 `package.json.scripts`，不运行自带 Webpack 配置，也不会自动连外网获取新依赖；`npm ci --ignore-scripts` 是本地开发环境准备，不是扩展运行时能力。相同不可变输出目录不能被不同字节覆盖（`E_BUILD_IMMUTABLE`）。

当前静态限制：最多 64 个源码模块，总源码不超过 128 KiB；单个源码文件最多 256 KiB；Page 输出不超过 100000 字节；Controller 输出不超过 65536 字节。这些是现行门槛，不是无条件的未来兼容承诺。

## 4. 可复制的实际使用步骤

```sh
npm ci --ignore-scripts
node --test tests/environment/sidebar-project-demo.test.mjs
node scripts/validate-program-project.mjs examples/programs/sidebar-page-demo
node scripts/validate-program-project.mjs examples/programs/sidebar-controller-demo
npm run build:program -- examples/programs/sidebar-page-demo
npm run build:program -- examples/programs/sidebar-controller-demo
python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/tasks
```

打开 `http://127.0.0.1:43111/demo-form.html`；Chrome 138+ 加载本仓库最新 `dist/development`，确保网站权限与 Chrome「允许用户脚本」生效。

在构建输出的 `outputDirectory` 中找到 `program.opendesk-draft.json` 与 `program.js`。目前有三条真实路径：
1. **推荐**：在同窗口打开 Sidebar →「发现 → 导入」的独立完整任务目录，选择 `program.opendesk-draft.json`。它校验编译字节和各源码哈希，并向同窗口「开发」交付**只读源文件列表 + 固定执行字节**。默认显示 `program.js · 实际执行代码`，并标明 Page 的 DOM 试运行或 Controller 的运行草稿入口；可在同一列表切换只读源码快照，执行字节保持不变。
2. **兼容**：完整任务目录选择 `program.js`，进入「开发」未保存草稿，界面只知道它是已编译程序，没有源码快照。
3. **手动**：复制完整 `program.js` 到 Sidebar 编辑器后运行。
这三条路径都不是直接选择一个原始源码文件夹进行浏览器内 npm/ESM 编译，也不会自动安装或执行。

草稿中的哈希只校验各段字节一致，不能证明附带的源码快照生成了执行代码，也不能证明作者或构建器可信。源码快照仅供参考；运行前检查默认展示的实际 `program.js`，构建对应关系另需可信本地构建回执。导入也执行运行环境的体积限制：Controller 最多 65536 字节，Page 最多 100000 字节，超限均以 `E_LIMIT` 拒绝。

- **Page Demo**：在「网页用户脚本 · 依赖与试运行」明确点击 DOM 试运行，页面 `#lab-text` 出现 `#opendesk-multifile-page-proof`。重复运行仍只有一个标记。
- **Controller Demo**：在底栏「运行草稿」，参数 `{"keyword":"OpenDesk"}`。等待 `#results` 显示「结果：OpenDesk」、`#search-count` 每次只增加 1，并核对真实持久 `runId/resultId`。

Controller Locator 不自动滚动；先用真实网页滚动将搜索输入和按钮移入视口。若通过页面锚点改变 URL 片段，应重新捕获当前网页目标；新捕获的同文档片段目标可被接纳，旧捕获目标、导航中状态和 document 变化继续拒绝。此校验修复的组件证据与真实 Chrome 验收分别记录，不能相互替代。
- **Controller Candidate**：如需安装，先导入 `program.opendesk-task.json` 并通过实际运行证据、Authority/Verification 与用户确认，不能仅因 Hash 正确就标为 Available。

浏览器 DOM 标记不等于可信执行回执；Node 断言不等于真实 Chrome 已完成验收。运行页面请只用 `examples/tasks/demo-form.html`，不要新建重复的测试 HTML。

## 5. 资源 API：Page 有界打包，Controller 拒绝

当前 main 的 Page 构建支持 `opendesk.assets`，最多 32 条，格式为 `{path:"assets/panel.css",kind:"css"}`。CSS 单项最多 24 KiB，JSON 16 KiB，图片 32 KiB，全部资源总计最多 60 KiB；最终 Page `program.js` 仍不超过 100000 字节。支持 `.css`、`.json` 和 `.png/.jpg/.jpeg/.webp`，校验真实字节、UTF-8、JSON、图片签名、受限相对路径、SHA-256 和构建期间字节变化。

资源在构建时冻结到同一个 `program.js`：CSS 为文本，JSON 为 JSON 文本，图片为受预算约束的 data URL。运行时通过 Page 入口的 `assets` 参数使用，不新增网络 fetch、主机权限、CDN 或 `GM_getResourceURL`。CSS 只能引用已声明的相对图片；拒绝远程/data/blob URL、`@import`、CSS 转义及 `image()`/`image-set()`/`src()` 等未支持的字符串 URL 语法。Controller 声明资源会得到 `E_PROJECT_ASSET_ENV`。

```sh
node scripts/validate-program-project.mjs examples/programs/sidebar-assets-contract
npm run build:program -- examples/programs/sidebar-assets-contract
node --test tests/environment/program-assets.test.mjs
```

这个 Page Demo 当前应构建成功，同时资源安全负向用例必须拒绝。原 R1 提示词要求全部资源以 `E_PROJECT_ASSET_BUILD` 拒绝，已被 main 的 Page 资源实现改变；[验收记录](workstreams/sidebar-multifile-native-r1-20261009.md)保留旧基线的真实拒绝与新基线差异。构建结果为 `BUILT_UNVERIFIED`；CSS 生效、JSON 使用、图片显示及撤权/导航/重启仍须真实 Chrome 证据。草稿的只读多文件快照目前包括 JS 源模块，资源文件不能因此被宣称已有独立源码展示。

## 6. 常见错误和安全响应

| 错误 | 说明 |
| --- | --- |
| `E_PROJECT_PATH` / `E_PROJECT_SYMLINK` | 非法、项目外或符号链接文件；禁止读取 |
| `E_PROJECT_IMPORT` / `E_PROJECT_DYNAMIC_IMPORT` | 未批准的远程/动态/本地依赖，必须改为受控静态图 |
| `E_PROJECT_NPM_LOCK` | npm 包清单与锁不一致 |
| `E_PROJECT_ASSET_ENV` | Controller 不能使用 Page 资源适配器 |
| `E_PROJECT_ASSET_URL` / `E_PROJECT_ASSET_TYPE` / `E_PROJECT_ASSET_JSON` / `E_PROJECT_ASSET_LIMIT` | 不支持的 CSS 引用、图片签名、JSON 或资源预算，失败关闭 |
| `E_PROJECT_META` | 元数据无效；`package.json` 带 BOM 在固定 Webpack 边界提前拒绝 |
| `E_PROJECT_OUTPUT_LIMIT` | 最终 JS 超过当前运行宿主的体积限制 |
| `E_BUILD_IMMUTABLE` / `E_PROJECT_CHANGED` | 字节被改写或构建竞态，不能默默继续 |

Controller Locator 的真正公开 API 见 [Modern Page API](modern-page-api.zh-CN.md) 和 [types/opendesk-page.d.ts](../../types/opendesk-page.d.ts)；不是 Playwright Node 全量 API。

后续直接文件夹导入、ZIP 和资源生命周期的技术路线见 [目录与资源接入合同](../architecture/browser-framework/sidebar-project-intake-r1.zh-CN.md)。Native Agent Bridge PR #11 和 Program 源快照 PR #22/#23 已合入 main；但**源码合入不等于已完成本机 Chrome/Codex 端到端验收**，只有真实连接、权限、同一执行字节与结果回执才能将这条流程认定为可用。
