# 网络 JavaScript：静态 import、本地项目与侧栏工具

标准静态 `import` 是新代码的主要模型。普通 Page/Controller 草稿可按新准备链使用直接 HTTPS 导入的独立 ESM leaf；多文件、完整静态依赖图、npm、React/Vue 组件走现有本地项目；工具先本地预编译成 IIFE/JSON。经典 Page `@require` 保留为兼容入口，Mustache UMD 不自动变成 ESM。

> 新普通草稿已有[独立候选真实 CFT 回执](../../docs/framework/workstreams/evidence/static-import-drafts-20261012/browser-13/acceptance.json)：Page 返回 `9`、固定缓存复用无 CDN 请求；Controller 独立批准后返回 `8`，持久结果与 released 一致。该次 2 个检查通过，10 个明确复用同包原成功；所有失败保留。后续本地安装交接补丁仅补组件回归，不提升原候选的浏览器等级，见[主工作流](../../docs/framework/workstreams/static-import-drafts-20261012.md)。TOC 完整 Native/MCP、React UI/Run/Stop、工具安装与 F3/ZIP 仍 NOT_TESTED；两个 starter 锁的独立证据见[项目工作流](../../docs/framework/workstreams/static-import-drafts-projects-20261012.md)。

完整格式、审核与错误说明见[使用指南](../../docs/api/network-javascript.zh-CN.md)。`.min.js` 不保证 ESM；HTTP 依赖 URL 被拒绝，HTTP 目标测试页可以运行。默认已有库无需重复 npm 安装。

## 准备标准网页

人工网页测试统一使用 [demo-form.html](../tasks/demo-form.html)。在仓库根目录，已有服务可复用，未启动且端口可用时使用现有命令：

```sh
python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/tasks
```

打开 `http://127.0.0.1:43111/demo-form.html`，完成实际网站权限与 Chrome「允许用户脚本」。本地项目还需已授权、配对的 Native/MCP；不要替换日常扩展 `dist/development` 或另起覆盖它的构建。`remote-esm-page` 按自己的规则使用 `https://example.com/`，不能把测试网页 origin 当成依赖下载权限。

## 1. 普通 Controller 草稿

复制 [controller-static-import.js](controller-static-import.js) 的静态 import 与零参数侧栏入口，无需依赖元数据。Controller 使用 `page.title()`：

作者在编辑器保留标准 import 与零参数入口。例如选择来源实际有 ESM 导出的独立模块：

```js
import max from 'https://cdn.jsdelivr.net/npm/d3-array@3.2.4/src/max.js';

async function main() {
  return {largest: max([2, 8, 5]), title: await page.title(), params};
}
```

源码旁「网络 JS」选择「用于 Controller」（`network-js-world=esm-controller`），依次 **下载准备 → 查看缓存原文 → 勾选来源/源码/SHA-256/许可证审核 → 批准 → 单独运行草稿**。各动作与 Run 独立。Page 的批准不能用于 Controller。

`export default async function main()` 同样可用；入口不传能力对象。`page/params` 是受控 Worker 词法变量，默认 `_`、`dayjs`、`OpenDeskLibs` 已存在。没有新依赖时原零参数入口直接运行：

```js
async function main() {
  return {title: await page.title()};
}
```

每次 Run 离线校验缓存/哈希/权限/owner，再用固定离线 Babel 编译为经典自包含产物；编辑器不被产物覆盖，结果 `sourceHash` 对应执行产物。核对原 runId、controller-result/resultId、结果自身 revision/sourceHash 与 released；未知效果先查原结果/诊断，不自动重发 Run/Stop。

## 2. 普通 Page 草稿与经典兼容

复制 [page-static-import.js](page-static-import.js)，选择「用于网页 Page」（`network-js-world=esm-page`），使用同样的准备、查看、勾选审核、批准与独立网页 Run：

```js
import max from 'https://cdn.jsdelivr.net/npm/d3-array@3.2.4/src/max.js';

async function main() {
  const headings = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')];
  return {title: document.title, headingCount: headings.length,
    deepestHeading: max(headings, node => Number(node.tagName.slice(1))) ?? 0};
}
```

`export default async function main()` 也受支持。Page 使用 `document`，不拥有 Controller page/params/axiosx；自己的默认库按[世界矩阵](../../docs/api/runtime-globals-and-preinstalled-libraries.zh-CN.md)使用。每次运行离线核验和固定编译，实际 world 为 USER_SCRIPT；普通 Page 核对实际 `sourceHash/documentId/world/worldId/receiptNonce`，受管本地 Page 另用原 `previewId` 查询。

普通草稿最多 16 个直接 HTTPS 独立 ESM leaf、每个 128 KiB，最终执行 JS 不超过 100,000 UTF-8 字节。依赖的二级 import/re-export 图、裸包、相对路径、import.meta、动态 import/require、TLA 和 UMD 自动转换拒绝；更完整的静态图使用第 3 节本地项目。缺锁、缓存篡改、撤权、审核/owner 变化拒绝，不临时联网修复或跨 world 复用批准。

依赖模块中的计算成员访问、反射构造器、解构导出和保留导出 `__esModule` 也暂不支持；独立 ESM 不代表任意库都可转换。函数内部合法 `new.target` 可用。

兼容经典 Page 的 jQuery 声明与 Mustache UMD 代码继续保留在[指南的兼容章节](../../docs/api/network-javascript.zh-CN.md)及原 [jquery-page-draft.js](../tasks/jquery-page-draft.js)。经典 @require 仍须独立准备、看原文、审核、批准、Run；jQuery 精确来源可复用扩展固定字节。旧 Mustache `Hello OpenDesk` 真实回执和原 ESM 拒绝记录保留原候选，不自动把 Mustache 转为 ESM，不把旧拒绝当成新 import 能力结论。

依赖 URL、版本或运行世界变化后，重新准备、看实际原文并批准；旧锁不能沿用。运行阶段不联网恢复缺失缓存；审核过期、撤权、哈希不一致或编译失败均拒绝。普通 Page import 目前只支持试运行，Page 候选保存明确禁用；需要安装/交付时使用下面的本地项目固定产物流程。

[当前草稿 CFT](../../docs/framework/workstreams/evidence/static-import-drafts-20261012/browser-13/acceptance.json)绑定精确包、实际 world 与执行产物 sourceHash。Controller Native 效果与 Stop、浏览器缓存损坏/撤权/重开批准仍未在本轮真实验证，不由组件测试替代。

## 3. 本地多文件 Controller/Page/React/Vue

选择已有项目，修改/保存源码后明确运行；作者不必为默认库或固定 React/Vue 重复安装：

| 场景 | 实际源码与配置 |
| --- | --- |
| 零参数 Controller | [main.js](../programs/controller-globals-zero-arg/src/main.js)、[package.json](../programs/controller-globals-zero-arg/package.json) |
| Controller 多文件 | [local-controller](../programs/local-controller/README.md) 的 main.js → extract.js；旧参数入口仅兼容，新项目按指南使用零参数 main |
| Page 多文件 | [sidebar-page-demo](../programs/sidebar-page-demo/README.md) 的 main.js → fixture.js/proof.js，零参数入口 |
| npm Page | [page-npm-lodash](../programs/page-npm-lodash/README.md)，项目精确 dependencies、锁和安装目录 |
| HTTPS ESM Page | [remote-esm-page/src/add.js](../programs/remote-esm-page/src/add.js)，静态 HTTPS import |
| React JSX / Vue SFC | [page-ui-react](../programs/page-ui-react/README.md) / [page-ui-vue](../programs/page-ui-vue/README.md)，默认组件入口与固定框架 |

### TOC React Direct 的固定来源

[page-ui-toc-react-direct](../programs/page-ui-toc-react-direct/README.md) 的真实 [src/main.js](../programs/page-ui-toc-react-direct/src/main.js) 直接声明 React、本地 TOC/统计模块和 D3 HTTPS max；App 实际消费 max。React 19.2.0 由 `framework:react` / `entryMode:component` 选择扩展固定资源，不用在此目录重复 npm 安装。

项目已携带 `opendesk.remote-lock.json` 和 `.opendesk/remote-cache/` 的 502 B 原始模块，SHA-256 `691945a453633d9e204846af8ea4e299821b924f82b15eaf7906aba642979b1d`。仓库工具链可用时，从仓库根离线导出：

```sh
npm run build:program -- examples/programs/page-ui-toc-react-direct
```

结果为 `BUILT_UNVERIFIED`，目录取实际 `outputDirectory`；再分发同时保留 `licenses/d3-array-ISC.txt`。D3 数值模块被打入程序，React 在真正 Page 运行时从扩展包读取/校验；这不是 ECharts。

作者本地开发使用：

```sh
cd /Users/shopme/Documents/workspace/opendesk-browser/examples/programs/page-ui-toc-react-direct
opendesk browser dev .
```

保存只准备，之后明确运行/停止。当前目标是 `http://127.0.0.1:43111/*` 与 `http://192.168.30.8:8000/*`，各自 `/private/*` 排除。精确项目的 Native/MCP attach/run、可见目录/统计与 Run/Stop、JSON 安装仍 NOT_TESTED；原五项 builder CI 和 7 项模型记录只属于原输入，新 LAN 配置/测试另属受影响范围，见[TOC 依赖工作流](../../docs/framework/workstreams/react-url-import-20261012.md)。不要把下节 MCP 命令存在当成已运行。

### 一次准备，离线复用

npm 示例在缺少安装目录时才从仓库根执行：

```sh
npm ci --prefix examples/programs/page-npm-lodash --ignore-scripts
```

审核项目自己的 lock、实际源码和许可证；根仓库的安装不能替代项目依赖。HTTPS 示例在仓库根使用现有锁 CLI：

```sh
node scripts/lock-program-remote.mjs examples/programs/remote-esm-page
node scripts/lock-program-remote.mjs examples/programs/remote-esm-page --approve REVIEW_TOKEN
```

首条离线显示根 URL/域名/真实 20 位十六进制 token；替换 REVIEW_TOKEN 后第二条显式批准下载/固定，每个新传递 URL 在可信终端逐个审核同意。`LOCKED_NOT_EXECUTED` 不表示代码执行或安装。检查 `opendesk.remote-lock.json`、`.opendesk/remote-cache/*.mjs` 的固定原文/SHA-256 与许可证后再 Run。

仅静态 import/re-export；HTTPS 图 ≤32 节点、每个 ≤128 KiB、总计 ≤256 KiB。HTTP、动态加载、凭据、私网和合同外重定向被拒绝。已有匹配缓存时离线复用。UMD 没有通用转换保证；兼容源码可审核后保存在自己的 vendor 并静态副作用 import，保留 LICENSE，逐库验证。

### 原 MCP Run 与固定产物

项目准确路径已列入 MCP `--allow-project` 后，通过原工具调用：

```json
{"name":"opendesk.dev.attach","arguments":{"path":"/Users/shopme/Documents/workspace/opendesk-browser/examples/programs/sidebar-page-demo"}}
```

```json
{"name":"opendesk.dev.status","arguments":{}}
```

```json
{"name":"opendesk.dev.run","arguments":{"bindingId":"实际 bindingId","requestId":"network-example-page-1"}}
```

```json
{"name":"opendesk.dev.result","arguments":{"previewId":"原 previewId"}}
```

目录 attach 只传 path；先查真实 Host/网站/document，再 Run。Controller 换目录、用 runId 查持久结果；React/Vue 仍用 Page previewId。diagnostics 只读错误；受管 UI 用 `opendesk.dev.stop` 的 previewId 清理，Controller 用 runId 后查 released；普通 Page 返回 `E_PAGE_PREVIEW_STOP_UNSUPPORTED`。参数与未知 ACK 恢复见[现有 MCP 合同](../../docs/api/mcp-local-development.zh-CN.md)。没有新增 download/build MCP；不在 dev.run 自动 npm、下载、补锁或重放未知效果。

需要导出固定程序时，仓库根分别选择真实项目运行离线命令：

```sh
npm run build:program -- examples/programs/controller-globals-zero-arg
npm run build:program -- examples/programs/sidebar-page-demo
npm run build:program -- examples/programs/remote-esm-page
npm run build:program -- examples/programs/page-ui-react
npm run build:program -- examples/programs/page-ui-vue
```

回执是 `BUILT_UNVERIFIED`，不等于 Run、Installed、F3 或 ZIP 安装通过。项目构建器处理锁定 npm/HTTPS 与已有 JSX/SFC 转换，不执行任意 Vite 插件或自动 npx。作者自己的 npx/Vite 命令是另行审阅的本地步骤，不能当作解析器隐式支持。

浏览器内「直接编辑 → React JSX/Vue SFC」另属单组件入口：只允许固定 react/react-dom/client/react/jsx-runtime 或 vue 导入；不能读取本地多文件图、安装任意 npm 或导入第三方 HTTPS 图。普通 JavaScript 草稿的独立 HTTPS leaf 使用第 1/2 节新准备链。框架完整边界见[现有指南](../../docs/api/page-ui-frameworks.zh-CN.md)。

失败后保留当前错误与原 IDs，用 diagnostics 查位置；缺锁先明确准备，损坏缓存恢复匹配字节，未知入场 ACK 用 admissionRequestId 只读 result，不自动重试 Run/Stop。

## 4. 已安装侧栏工具：项目锁 → Vite → stage → JSON

[React starter](../sidebar-tools/react-starter/README.md) 和 [Vue starter](../sidebar-tools/vue-starter/README.md) 已携带与原清单一致的 `package-lock.json`。精确现有依赖没有变化：React/React DOM 19.2.0、sparkline 0.3.10、Vite 7.3.6；Vue 3.5.22、Vite 7.3.6、plugin-vue 6.0.2。作者本地编译为单一 IIFE 与 CSS，工具沙箱 connect-src 'none'，不在运行时取 CDN，也不假设宿主全局框架或 Controller page。

从仓库根只选一个项目执行。React 的 cwd 与 out 明确为：

```sh
cd /Users/shopme/Documents/workspace/opendesk-browser
tool=examples/sidebar-tools/react-starter
npm --prefix "$tool" ci --ignore-scripts --no-audit --no-fund
npm --prefix "$tool" run build
node scripts/stage-sidebar-tool.mjs "$tool"
node scripts/build-sidebar-tool.mjs "$tool" --out artifacts/sidebar-tools/react-notes-starter/1.1.0/react-notes-starter.opendesk-tool.json
```

Vue 在仓库根使用：

```sh
cd /Users/shopme/Documents/workspace/opendesk-browser
tool=examples/sidebar-tools/vue-starter
npm --prefix "$tool" ci --ignore-scripts --no-audit --no-fund
npm --prefix "$tool" run build
node scripts/stage-sidebar-tool.mjs "$tool"
node scripts/build-sidebar-tool.mjs "$tool" --out artifacts/sidebar-tools/vue-notes-starter/1.0.0/vue-notes-starter.opendesk-tool.json
```

`npm ci --ignore-scripts` 不运行依赖安装脚本；`npm run build` 是作者明确运行现有 Vite 构建。已有完整、适配当前平台的 npm tarball 缓存时才将安装步骤改为：

```sh
npm --prefix "$tool" ci --offline --ignore-scripts --no-audit --no-fund
```

锁文件不保证缓存齐备；缺缓存则离线安装失败，清单与锁不一致则 npm ci 失败。本轮只在独立临时项目生成锁并核验根版本/HTTPS resolved/SHA-512，**没有执行项目安装、Vite 构建或新工具安装**。审核依赖源码、许可证、最终 IIFE/CSS、JSON SHA-256 和能力。

Vite 完成 JS/CSS 后才发布 `dist/build-ready.json`。推荐先 stage 核验回执/输出哈希，再保持输出稳定 pack；最终 JSON SHA-256 应与 stage 一致。原 packer 直接读取 dist，独立 pack 成功不证明同次成功 build；stage 也不独立证明最新原始源码/npm 锁已重建。缺回执、哈希不符、超限或构建错误保持失败，上一快照只能代表上一产物。

`stage` 为 `STAGED_NOT_INSTALLED`，pack 为 `installed:false`；只读预览也不获得写入权。工具 → 导入明确 out 的 JSON → 审阅 ID/版本/源码摘要和 storage.local → 确认安装/更新 → 主动打开。构建不自动安装；未知保存先对账，不重复提交。字段 JS 220,000 字符、packer 读取 JS 220,000 UTF-8 字节、完整 JSON 320,000 UTF-8 字节上限继续生效，不为新库放宽 CSP 或预算。

可明确运行项目 `npm run build:watch` 与 `node ../../../scripts/watch-sidebar-tool.mjs "$PWD"` 观察成功产物；watch 不调用 npm、不安装工具。失败时保留上一预览；旧 dist/回执未变时仍须查看 Vite 错误，不把旧预览当最新源码成功。

新锁的原始日志、完整锁和验证见[lock-validation.json](../../docs/framework/workstreams/evidence/static-import-drafts-projects-20261012/lock-validation-final.json)。新包安装/更新/打开仍 NOT_TESTED；原有 packer、stage、CI 未在本职责修改。

## 验证责任

[本轮项目锁与文档职责](../../docs/framework/workstreams/static-import-drafts-projects-20261012.md)只关闭两份现有依赖锁生成/核验和文档一致性。普通草稿实现、组件回归与受限真实运行由[主工作流](../../docs/framework/workstreams/static-import-drafts-20261012.md)逐项记录；工具安装和 F3/ZIP 未关闭。

[历史网络 JS 工作流](../../docs/framework/workstreams/network-javascript-20261012.md)的 130 项组件回归、12 项绑定候选的经典 Page/固定 ESM 产物浏览器检查及宽度补测继续保留原范围；TOC 另按相关输入复用 builder 证据，Native/MCP 与安装分级。未测项不由历史 PASS、锁、构建或预览替代。
