# 网络 JavaScript：声明、审核、固定与运行

> 当前验证状态（2026-10-12）：标准静态 `import` 是新代码的主要依赖声明模型。普通 Page/Controller 草稿的独立 HTTPS ESM 准备、审核、批准与离线编译已实施，并有[独立候选真实 CFT 回执](../framework/workstreams/evidence/static-import-drafts-20261012/browser-13/acceptance.json)：Page 返回 `9`、缓存复用无 CDN 请求；Controller 返回 `8`，保留持久结果与 released。12 个检查中 2 个在该次执行通过，10 个明确复用同包已有单项成功，原失败记录保留。随后收到的本地受管预览安装交接补丁另有定向回归，不把原浏览器回执升级为新组合包验收；详见[主工作流](../framework/workstreams/static-import-drafts-20261012.md)。按钮是否出现取决于实际加载的构建。TOC 完整 Native/MCP、React UI/Run/Stop、工具安装及 F3/ZIP 仍 NOT_TESTED。本轮项目锁见[独立记录](../framework/workstreams/static-import-drafts-projects-20261012.md)。

这里的“网络 JavaScript”指来自 npm/CDN 等外部来源的代码。**来源 URL、代码格式、执行世界和授权是四件不同的事。** 先选择合适入口，再准备固定字节，最后明确运行。

## 1. 选择入口与代码格式

| 场景 | 声明位置 | 首次准备 | 实际运行 |
| --- | --- | --- | --- |
| 普通 Controller 草稿 | 静态 HTTPS `import` + 零参数 `async function main()` 或 `export default async function main()`；默认 `_`、`dayjs`、`OpenDeskLibs` 无需 CDN | 源码旁选择「用于 Controller」→ 下载准备 → 查看原文 → 勾选审核 → 批准 | 每次 Run 离线校验后编译为自包含经典产物；单独「运行草稿」 |
| 普通 Page 草稿 | 同样的静态 HTTPS `import` + 零参数入口；Page 使用 `document` | 源码旁选择「用于网页 Page」→ 下载准备 → 查看原文 → 勾选审核 → 批准 | 每次 Run 离线校验后编译；单独网页试运行，world 为 USER_SCRIPT |
| 本地多文件 Controller/Page/React/Vue | `package.json` + 静态 `import`，npm 锁/安装目录，或 HTTPS ESM 锁/缓存 | 本地显式准备依赖；原解析器离线构建 | 已有 `opendesk.dev.*` MCP 或本地项目明确 Run |
| 已安装侧栏工具 | 工具项目 npm/本地模块，离线打成一个经典 IIFE；`tool.config.json` 指定本地产物 | 审核依赖、许可证、构建 JS/CSS 与固定 JSON | 工具 → 导入 → 审阅 → 安装/更新 → 主动打开 |
| 兼容经典 Page 草稿 | 保留原 UserScript `@require` 示例和已批准锁 | 经典全局/UMD 专用的原准备、审核与批准流程 | 原 Page 路径；不自动转换成 ESM，不适用于 Controller |

| 你拿到的文件 | 当前可用路径 | 边界 |
| --- | --- | --- |
| 公开 **HTTPS ESM**，有真实 ESM 导出 | 普通草稿可使用直接导入的独立 leaf；更完整的静态图使用本地项目 | 草稿依赖自身不能再导入/重导出其他模块；不能作为经典 Page `@require` |
| 经典全局、UMD、某个 `.min.js` | 兼容 Page `@require`；或审核后放入自己的本地项目尝试静态副作用导入 | `.min.js` 只表示压缩，不保证格式；UMD 不自动变成 ESM |
| **HTTP 代码 URL** | 远程依赖准备拒绝 | HTTP 测试网页可以是目标；这不允许 HTTP 依赖下载或 HTTP ESM import |

没有通用“把任意 UMD 转成 ESM”的承诺。已有兼容源码可在作者明确审核后保存在自己的 `vendor/`，通过 `import './vendor/library.js'` 静态副作用导入，并随源码保留 `LICENSE`。是否可用取决于该文件在构建后执行世界中的全局绑定、UMD 分支、DOM/Node 假设、动态代码和体积；逐库验证，不能假定有默认导出，也不能借此避开审核。Controller Worker 没有网页 DOM；侧栏工具也没有 Controller `page`。

## 2. 普通 Page 与 Controller 草稿：标准静态 import

新依赖直接写在作者源码中。可复制 [Page 静态 import 示例](../../examples/network-javascript/page-static-import.js)，无需另加依赖元数据：

```js
import max from 'https://cdn.jsdelivr.net/npm/d3-array@3.2.4/src/max.js';

async function main() {
  const headings = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')];
  return {title: document.title, headingCount: headings.length,
    deepestHeading: max(headings, node => Number(node.tagName.slice(1))) ?? 0};
}
```

Controller 使用同样的静态模块声明和零参数入口，运行世界选择 Controller，参见 [Controller 静态 import 示例](../../examples/network-javascript/controller-static-import.js)：

```js
import max from 'https://cdn.jsdelivr.net/npm/d3-array@3.2.4/src/max.js';

async function main() {
  return {largest: max([2, 8, 5]), title: await page.title(), params};
}
```

两种草稿都接受零参数 `async function main()` 或 `export default async function main()`。Controller 的 `page`、`params` 是受控 Worker 词法变量，不是网站 `window.page` 或 Worker `globalThis.page`；默认 `_`、`dayjs`、`OpenDeskLibs` 不需重复 npm 安装或 CDN 声明。Page 使用 `document`，不拥有 Controller `page/params/axiosx`；自己的预置库按[执行世界合同](runtime-globals-and-preinstalled-libraries.zh-CN.md)使用。

没有新依赖时可直接使用原入口，例如：

```js
async function main() {
  return {title: await page.title(), date: dayjs().format('YYYY-MM-DD')};
}
```

### 准备、审核与单独运行

1. 在源码旁「网络 JS」的运行世界选择「用于网页 Page」或「用于 Controller」；对应 `network-js-world` 的值为 `esm-page` / `esm-controller`。来源 URL 不等于目标网站授权。
2. 点击「下载并准备依赖」。针对源码中直接声明的 HTTPS URL 下载候选字节；这一步不批准、不编译执行网页业务、不 Run。
3. 逐项点击「查看缓存源码」，核对来源、实际原文、大小、SHA-256 和许可证信息；unknown 许可证信息不能当作已确认许可。
4. 勾选「我已审核来源、源码、SHA-256 和许可证信息」，再明确批准当前固定字节。
5. 核对源码、参数、目标和所需网站/用户脚本权限，然后单独点击「运行草稿」或网页试运行。保存、下载、查看和批准不代替 Run。

批准锁按运行世界隔离：Page 的批准不能给 Controller 使用，反向也一样。每次 Run 都离线重新核验当前源码/声明、锁、缓存原文哈希、来源权限和 owner；缓存丢失、篡改、审核过期或撤权时拒绝，不偷偷联网补救，也不自动批准另一个版本。

修改依赖 URL、版本或运行世界后，重新明确下载准备、查看实际原文并批准新锁；旧批准不能沿用。编译失败、缺少命名导出或产物超限时保留错误，修改源码或改用本地项目后再有意运行。缺缓存只能由作者明确重新准备并审核固定字节，Run 不负责恢复缓存。

核验通过后，用扩展固定、离线的 Babel 编译资源将作者源码和已批准的 leaf 模块准备为**经典、自包含 JavaScript 产物**，沿用原 Controller Worker 或 Page USER_SCRIPT 执行。不会向网站插入 CDN script，也不会在运行时 fetch 后执行代码。编辑器保留作者的 import 源码；运行结果的 `sourceHash` 对应实际编译产物，不能与编辑器原文哈希混为一谈。

普通 Page 核对实际回执的 `sourceHash/documentId/world/worldId/receiptNonce`；受管本地 Page 另按其原 `previewId` 查询。Controller 查原 `runId`、`controller-result/resultId`、结果自身 revision/sourceHash 与 retirement released。撤权、文档变化、断连或未知效果先查原结果/诊断，不自动重发 Run/Stop；Stop 不回滚业务。

### 普通草稿的范围

只接受源码直接 HTTPS 导入的、拥有真实 ESM 导出的独立 leaf 模块：最多 **16 个模块，每个 128 KiB**，最终编译执行产物 **不超过 100,000 UTF-8 字节**。这些是准备和运行的不同预算，模块预算不保证产物一定装得下。

普通草稿的依赖模块还拒绝计算成员访问、反射构造器、解构导出与保留导出 `__esModule`；这是一条明确受限的模块路径，不能承诺任意 ESM 库均可转换。支持函数内部合法 `new.target`。不符合这些限制的库可走审核后的本地项目构建或逐库 vendor/适配。

依赖自身的第二级 import/re-export 图、裸 npm 包、磁盘相对 import、`import.meta`、动态 import/require、顶层 await（TLA）和 UMD 自动转换均拒绝；HTTP 代码 URL、凭据、非法来源和合同外网络行为继续拒绝。需要完整静态依赖图、npm 或 React/Vue 多文件组件时使用第 4 节本地项目。Mustache 的经典 UMD 文件不自动成为 ESM；它保留在第 3 节兼容示例中。

Page 原始 import 草稿目前只支持试运行，尚未建立作者源码与编译产物共同保存为 Page 候选的合同，相关保存按钮明确禁用。需要持久安装或交付时，使用已有本地项目固定产物流程；不把普通草稿 Run 当作程序安装。

这条受限路径的真实证据见[当前候选回执](../framework/workstreams/evidence/static-import-drafts-20261012/browser-13/acceptance.json)，其 packageHash 为 `985faf8da051a7b7a5dbcd784165800de4d163f67b477e7e07dff4ef215256d5`。Controller 只验证计算、受控词法变量、持久结果和资源释放，没有验证 Native 网页效果或 Stop；缓存损坏、撤权和重开批准的拒绝路径仍仅有组件证据。原 `@require` 成功或原 ESM 拒绝记录不替代新增流程的验收。

## 3. 兼容经典 Page 草稿：保留原 `@require`

### 声明

此节保留经典全局/UMD 的兼容入口、原示例和历史批准回执。新 ESM 代码以第 2 节标准 import 为主；不把已有经典库或历史锁自动迁移成 ESM。选择普通「网页 JavaScript」草稿。Page 使用 `document`，没有 Controller `page`、`params` 或 `axiosx`。以下完整声明采用已存在的固定 jQuery 3.7.1 来源与零参数入口：

```js
// ==UserScript==
// @name OpenDesk jQuery heading
// @match http://127.0.0.1/*
// @match https://example.com/*
// @require https://cdn.jsdelivr.net/npm/jquery@3.7.1/dist/jquery.min.js
// @run-at document-idle
// @noframes
// ==/UserScript==

async function main() {
  if (typeof jQuery !== 'function' || jQuery.fn.jquery !== '3.7.1') {
    throw new Error('E_DEPENDENCY_NOT_READY');
  }
  return {
    version: jQuery.fn.jquery,
    heading: jQuery('h1').first().text()
  };
}
```

需要体验首次真实网络下载时，可改用下面的经典 UMD 示例（当前候选验证状态见文末，不把示例代码存在当作已验证）：

```js
// ==UserScript==
// @require https://cdn.jsdelivr.net/npm/mustache@4.2.0/mustache.min.js
// ==/UserScript==
async function main() {
  return {value: Mustache.render('Hello {{name}}', {name: 'OpenDesk'}), title: document.title};
}
```

普通 DOM 草稿只读取标题时可以直接用 `document.querySelector('h1')`，不必为了示例添加依赖。jQuery 的这个精确 URL 命中[扩展固定资源](../../src/scripting/user-scripts/packaged-dependencies.js)，准备时可读取已打包字节而不是访问 CDN；**仍需明确审核与批准，来源 URL 不等于授权**。其他公共 HTTPS 经典库只有在明确准备时下载，并按现有 manager 申请来源权限。

### 首次准备与审核

单项远端下载最多 20 秒，整组下载准备最多 25 秒；超时不保存新的批准锁。缓存缺失或内容变化明确拒绝，运行不会联网补救。

运行校验的是**缓存原文与批准锁中的 SHA-256**，不会访问 CDN 比较上游最新版。同 URL 的上游内容若变化，需要你重新点击准备、查看新字节并明确批准；新下载不会替换原批准锁。运行阶段发现缓存缺失或哈希不符会失败，不临时下载、忽略哈希或自动切换版本。

操作紧邻当前源码的 `@require` 状态，复用现有 manager，不插入 URL、不增加锁选择下拉框或独立依赖配置面板：

1. **下载并准备依赖**：针对当前声明取得候选字节和审核记录。检查每项来源、版本、声明顺序、实际大小、SHA-256、完整性与许可证信息。这一步不批准、不执行。
2. **查看缓存源码**：读取该审核记录对应的缓存原文。查看的是将被执行的固定字节，不是重新打开 URL 后取得的另一个版本；只读查看不下载、不批准、不执行。
3. **我已审核来源、源码、SHA-256 和许可证信息**：由用户审核后勾选。许可证可能显示 unknown；这不等于已有可分发许可，应先查清适用许可证。SHA-256 只证明字节身份，不证明代码可信。
4. **批准这些固定字节**：明确接受审核记录中按声明顺序列出的 SHA-256，建立当前身份下的批准锁。批准仍不执行网页代码，也不安装程序。

改了依赖 URL、顺序、完整性声明或入口身份时重新核对当前声明，旧审核不能批准新声明。明确批准会在现有锁索引中记住所选版本，重开面板仍能离线复用；旧记录若有多份锁且没有明确选择，继续保守拒绝。可重新准备并审核后明确选择固定字节，或使用本地项目，不自动挑选最新代码。

### 独立网页 Run 与失败

1. 打开标准测试页或声明范围内已获准的网页，开启 Chrome「允许用户脚本」并核对网站权限。依赖来源权限与目标网站权限分别检查。
2. 审核/批准完成后，**另行点击「在当前网页试运行」**。Run 只读取与复核批准缓存，不自动下载或自动批准。
3. 核对原 `previewId/sourceHash/target` 和回执 `documentId/world`；此例返回 jQuery 版本与标题文字，是 `durable:false` 的 Page 预览，不产生 Controller 持久 `resultId`。
4. 经典 `@require` 的 `E_DEPENDENCY_MODULE` 表示依赖字节包含未构建 ESM 或动态 import。独立静态 HTTPS ESM leaf 使用第 2 节普通草稿流程，完整静态图使用第 4 节本地项目；动态 import 继续拒绝。不要改后缀、把代码包进 eval 或改成网页 MAIN 注入。
5. HTTP/非法来源、权限撤销、HTML/MIME/编码错误、哈希不符、缓存缺失、审核过期或体积越界时按实际错误处理，核对后重新明确准备；Run 不联网补齐。非受管 Page 不支持受管 Stop，不能以删除 DOM 冒充清理。

对应源码：[声明解析](../../src/scripting/user-scripts/dependency-metadata.js)、[manager 的 prepare/readReview/approve/loadForExecution](../../src/scripting/user-scripts/dependency-manager.js)、[Page 执行字节组装](../../src/scripting/user-scripts/execution-source.js)、[草稿入场检查](../../src/ui/page-dependencies.js)。既有[jQuery 示例](../../examples/tasks/jquery-page-draft.js)保留原注释和历史状态，本文不改写它。

## 4. 本地多文件 Controller、Page、React/Vue

### 声明与项目选择

项目沿用 `opendesk.project.v1` 的 `package.json#opendesk`：`runtimeKind` 区分 Controller/Page，`sourceFormat: "esm"`，`entry` 指向真实源码。相对模块静态 import 使用显式扩展名。用户函数入口推荐 `export default async function main()`，直接使用该世界允许的变量。

| 已有目录 | 入口与用途 |
| --- | --- |
| [controller-globals-zero-arg](../../examples/programs/controller-globals-zero-arg/README.md) | 零参数 Controller，直接读受控 `page` 与预置库 |
| [local-controller](../../examples/programs/local-controller/README.md) | `main.js → extract.js` 多文件 Controller；其历史参数入口只保留兼容，新代码用零参数入口 |
| [sidebar-page-demo](../../examples/programs/sidebar-page-demo/README.md) | `main.js → fixture.js/proof.js` 多文件 Page 零参数入口 |
| [page-npm-lodash](../../examples/programs/page-npm-lodash/README.md) | 精确 npm + package-lock + 本地安装目录 |
| [remote-esm-page](../../examples/programs/remote-esm-page/README.md) | `main.js → add.js → HTTPS ESM`，先显式锁定 |
| [page-ui-react](../../examples/programs/page-ui-react/README.md) / [page-ui-vue](../../examples/programs/page-ui-vue/README.md) | React JSX / Vue SFC；`framework` + `entryMode: "component"`，导出组件，由框架挂载/卸载，无需人为增加 main 参数 |

例如，在自己沿用 local-controller 配置和 `extract.js` 的项目中，推荐入口如下；本说明不改写仓库原示例：

```js
import {readSummary} from './extract.js';

export default async function main() {
  return readSummary(page);
}
```

工具函数接收 `page` 不改变用户入口零参数合同。[extract.js](../../examples/programs/local-controller/src/extract.js)已有此签名。Controller 的词法环境不扩大为网站或任意导入模块的全局环境。

### TOC React Direct：真实静态 HTTPS import 与固定框架

[page-ui-toc-react-direct](../../examples/programs/page-ui-toc-react-direct/README.md) 的实际 [src/main.js](../../examples/programs/page-ui-toc-react-direct/src/main.js) 同时声明 `react`、本地 TOC/统计模块和 D3 的固定 HTTPS `src/max.js`；App 实际把导入的 max 用于统计。`package.json` 以 `framework:react`、`entryMode:component` 选择扩展固定 React 19.2.0，不需要在此项目重复 npm 安装 React。

D3 URL 的锁在 [opendesk.remote-lock.json](../../examples/programs/page-ui-toc-react-direct/opendesk.remote-lock.json)，固定原始缓存位于项目 `.opendesk/remote-cache/`：**502 UTF-8 字节**，SHA-256 `691945a453633d9e204846af8ea4e299821b924f82b15eaf7906aba642979b1d`。本例已携带锁和缓存；普通构建读取并核验固定字节，不在每次 Run 下载。D3 只做数值计算；这不是 ECharts 实现或验收。

仓库工具链已有安装时，在仓库根可以直接离线导出：

```sh
npm run build:program -- examples/programs/page-ui-toc-react-direct
```

输出使用实际 `outputDirectory`。D3 被链接进程序；React 在构建时保留固定框架引用，真正 Page 运行时再从扩展包读取并核验框架字节；编译通过不等于两者已在 Chrome 运行。再分发含 D3 的产物需同时保留项目 `licenses/d3-array-ISC.txt`。

本地开发连接仍使用已有命令：

```sh
cd /Users/shopme/Documents/workspace/opendesk-browser/examples/programs/page-ui-toc-react-direct
opendesk browser dev .
```

保存只准备；在 Side Panel 明确运行或使用下节原 MCP 路径才操作网页。当前规则覆盖 `http://127.0.0.1:43111/*` 与 `http://192.168.30.8:8000/*`，排除各自 `/private/*`；来源 URL 不是目标网站权限。此处新增 LAN 规则和对应测试属于并行工作，旧 CI 不自动覆盖当前全部输入。

[原 workstream](../framework/workstreams/react-url-import-20261012.md)记录 `7fcdb8b…` 的五项 builder/离线失败回归 CI PASS；模型原始 TAP 为 7/7。本轮项目职责只核对固定字节与源码身份，不重跑构建。TOC 的精确来源直连、Mac Native/MCP Run/Stop、可见目录/统计与 JSON 安装仍 **NOT_TESTED**。不能把其他本地 ESM 固定产物的 USER_SCRIPT 成功、历史 React/Vue CLI 编译或组件 PASS 提升为本 TOC 的原生 PASS。

### 首次 npm/HTTPS 准备与审核

已有 npm 项目先查看它自己的 `package.json`、精确版本、锁文件和 LICENSE，缺少安装目录时才在仓库根运行示例的现有命令：

```sh
npm ci --prefix examples/programs/page-npm-lodash --ignore-scripts
```

根项目 npm 安装不会替用户项目准备依赖。实际消费的 npm 包必须与项目锁和安装目录一致；不在 dev.run 中执行 npm 安装。

HTTPS 示例的真实[模块](../../examples/programs/remote-esm-page/src/add.js)使用标准静态 import。以下等价的单模块入口显示其格式，运行需先完成同样的远程锁定：

```js
import add from 'https://cdn.jsdelivr.net/npm/lodash-es@4.17.21/add.js';

export default async function main() {
  return {value: add(20, 22), pageTitle: document.title};
}
```

在仓库根执行既有 CLI；`REVIEW_TOKEN` 必须替换为首条输出的真实 **20 位十六进制** `reviewToken`：

```sh
node scripts/lock-program-remote.mjs examples/programs/remote-esm-page
node scripts/lock-program-remote.mjs examples/programs/remote-esm-page --approve REVIEW_TOKEN
```

首条为离线 URL 审阅，返回 `REVIEW_REQUIRED`、根 URL/域名和 token，不下载、不执行。第二条明确批准这些根 URL 的下载/固定；新发现的每个传递 URL 在可信交互终端单独询问，不是域名级或通配授权。源码/目录/锁身份变化后旧 token 失效。

成功为 **`LOCKED_NOT_EXECUTED`**，不是运行、安装或源码已审计完成。随后检查 `opendesk.remote-lock.json` 的 URL/bytes/SHA-256 与 `.opendesk/remote-cache/*.mjs` 原始字节，审核源码和对应许可证，再决定是否明确运行。源码、锁、固定缓存和适用 LICENSE 一同保留。已有完整锁/缓存时复核后离线复用，不为每次 Run 重新下载。

HTTPS 图只接受静态 import/re-export，最多 **32 节点、每节点 128 KiB、总计 256 KiB**；拒绝 HTTP、动态 import/require/代码求值、凭据、私网与任意重定向等合同外输入。其他源码/执行/Native 消息上限仍独立生效；锁定成功不保证最终能装入预算。

### 离线构建与现有 MCP 运行

日常本地 Run 不必先导出固定程序。需要固定交付时，在仓库根使用现有离线构建器，例如：

```sh
npm run build:program -- examples/programs/controller-globals-zero-arg
npm run build:program -- examples/programs/sidebar-page-demo
npm run build:program -- examples/programs/remote-esm-page
npm run build:program -- examples/programs/page-ui-react
npm run build:program -- examples/programs/page-ui-vue
```

这些是分别选择项目的命令，不是要求每次全量构建。输出目录取实际回执 `outputDirectory`；状态 **`BUILT_UNVERIFIED`** 只证明构建完成，不等于浏览器运行、Installed、F3 或 ZIP 安装通过。缺锁/缓存时构建拒绝，不偷偷联网。

已配置本地 MCP 客户端并将项目的准确路径加入 `--allow-project` 后，目录 attach **只传 path**。以下是 MCP `tools/call` 的参数对象，占位 ID 替换为真实返回值；没有新增 download/build/review MCP 工具：

```json
{"name":"opendesk.dev.attach","arguments":{"path":"/Users/shopme/Documents/workspace/opendesk-browser/examples/programs/sidebar-page-demo"}}
```

```json
{"name":"opendesk.dev.status","arguments":{}}
```

检查真实 `bridge.extensionId/nativeConnected/enabled`、Host/`registrationId`、目标 URL/`documentId` 与 `targetError`；在同窗口打开 Sidebar，完成网站和 USER_SCRIPT 等实际所需授权。然后明确运行当前 Page 项目：

```json
{"name":"opendesk.dev.run","arguments":{"bindingId":"实际 bindingId","requestId":"network-page-1"}}
```

```json
{"name":"opendesk.dev.result","arguments":{"previewId":"原 previewId"}}
```

```json
{"name":"opendesk.dev.diagnostics","arguments":{"bindingId":"实际 bindingId"}}
```

Controller 换成对应目录 attach；run 可传项目 schema 允许的 `params`，结果改用 `{"runId":"原 runId"}`。Page 省略 Controller params/deadline；React/Vue 仍走相同 Page 运行路径。多个 Host 时传 status 返回的真实 registrationId。`remote-esm-page` 当前规则匹配 `https://example.com/*`，其他示例按各自 package 范围，不强行统一到 localhost。

修改文件后保存只准备，使用新的 requestId 明确 Run；比较新旧 sourceHash 与真实结果。未知效果不是一次新的有意运行，不能借新 ID 重放。受管 React/Vue 清理使用既有 MCP：

```json
{"name":"opendesk.dev.stop","arguments":{"previewId":"原受管 previewId","requestId":"network-page-stop-1"}}
```

Controller Stop 改用 runId，之后 result 确认 retirement released。普通 sidebar-page-demo/remote-esm-page 不含受管 UI，Stop 返回 `E_PAGE_PREVIEW_STOP_UNSUPPORTED`；受管 Page 核对 `preview-retired`、`receipt.ok:true`、`scope:managed-ui-only`，不把它当业务回滚。

### React/Vue、npx 与构建失败边界

浏览器直接编辑的 React JSX/Vue SFC **仅支持单组件和固定框架导入**：React 的 `react`、`react-dom/client`、`react/jsx-runtime`，Vue 的 `vue`，导出名称也按[固定合同](../../src/libs/page-frameworks/contract.js)检查。普通 Page/Controller JavaScript 草稿的独立 HTTPS ESM leaf 使用第 2 节流程；框架编辑器不能拿来加载任意 npm、HTTPS CDN、磁盘相对模块、动态 import 或 Vite 插件。

本地目录构建器支持自己的静态相对图、锁定 npm、锁定 HTTPS ESM，以及已实现的 React JSX/Vue SFC 转换。它不运行任意项目 Vite 配置/插件，也不自动启动 npx；`npx` 是作者在本地明确调用构建工具的方式，不是 import 格式或 runtime 能力。若项目另有 npx/Vite 预编译步骤，须单独审阅并使用该项目真实命令；不要把它当成 OpenDesk 原解析器的隐式支持。上面的原生示例已有现成命令，无需临时 npx 安装或任意插件。

`E_REMOTE_UNLOCKED` 先离线审阅再明确锁定；`E_REMOTE_CACHE/HASH/LOCK` 恢复匹配的原字节，不能临时联网替换；`E_PROJECT_NPM_LOCK` 核对包/锁/安装目录；`E_PROJECT_SYNTAX/BUILD` 用 diagnostics 的实际位置修正。断连/ACK 丢失用原 run.requestId 的 `admissionRequestId` 只读查询 result/diagnostics，不能重发 Run/Stop。详细[恢复规则](dependencies-and-errors.zh-CN.md)。

源码依据：[锁 CLI](../../scripts/lock-program-remote.mjs)、[远程模块图](../../scripts/remote-esm-modules.mjs)、[HTTPS 传输](../../scripts/remote-esm-network.mjs)、[项目校验](../../scripts/validate-program-project.mjs)、[构建器](../../scripts/build-program-project.mjs)、[Local Dev Resolver](../../native-agent/local-dev/resolver.mjs)、[MCP schema](../../native-agent/local-dev/mcp.mjs)。

## 5. 已安装侧栏工具：固定 npm、Vite IIFE 与 JSON

现有 [React starter](../../examples/sidebar-tools/react-starter/README.md) / [Vue starter](../../examples/sidebar-tools/vue-starter/README.md) 各自携带与原 package.json 一致的固定 `package-lock.json`。React 为 React/React DOM 19.2.0 + sparkline 0.3.10 + Vite 7.3.6；Vue 为 Vue 3.5.22 + Vite 7.3.6 + plugin-vue 6.0.2。根版本没有变化，锁记录完整传递图的 HTTPS 来源和 SHA-512；默认 OpenDesk 库不通过这些项目重复安装。

这是作者自己的工具 npm 工程。Vite 将框架和依赖预编译进单一 `dist/tool.js` IIFE 与 `dist/tool.css`；`tool.config.json` 指定本地资源。工具沙箱 `connect-src 'none'`，没有运行时 CDN、任意 HTTP 代理、宿主全局 React/Vue 或 Controller page。已有 v2 的 browserSdk 要求也不是通用 CDN/npm 依赖表。

### 首次安装与本地构建

以下命令从仓库根执行，选择一个项目即可；无需重编整个扩展。首次和后续清单一致的安装都使用项目锁：

```sh
# 当前目录：opendesk-browser 仓库根目录
tool=examples/sidebar-tools/react-starter
npm --prefix "$tool" ci --ignore-scripts --no-audit --no-fund
npm --prefix "$tool" run build
node scripts/stage-sidebar-tool.mjs "$tool"
node scripts/build-sidebar-tool.mjs "$tool" --out artifacts/sidebar-tools/react-notes-starter/1.1.0/react-notes-starter.opendesk-tool.json
```

Vue 使用对应路径与明确 output：

```sh
# 当前目录：opendesk-browser 仓库根目录
tool=examples/sidebar-tools/vue-starter
npm --prefix "$tool" ci --ignore-scripts --no-audit --no-fund
npm --prefix "$tool" run build
node scripts/stage-sidebar-tool.mjs "$tool"
node scripts/build-sidebar-tool.mjs "$tool" --out artifacts/sidebar-tools/vue-notes-starter/1.0.0/vue-notes-starter.opendesk-tool.json
```

`npm ci --ignore-scripts` 安装锁定包但不运行依赖安装脚本；后面的 `npm run build` 是作者明确调用项目现有 Vite 构建脚本。安装、构建都不执行网页或安装侧栏工具。审核实际源码、来源、许可证、最终 IIFE/CSS、JSON SHA-256 和能力，并随发行物保留适用许可证。

### 离线、保存与失败

已有完整 npm tarball 缓存且适配当前平台时，才可以把安装步骤替换成：

```sh
npm --prefix "$tool" ci --offline --ignore-scripts --no-audit --no-fund
```

有锁不等于有完整缓存；本轮仅生成并验证锁，没有执行 npm ci、证明离线缓存齐备或 Vite 构建。缓存缺失时离线安装失败，不把重新在线安装当成离线 PASS。package.json 与锁不一致时 npm ci 失败；依赖变更必须重新审阅版本、锁、源码和许可证，本轮没有新增依赖。

Vite 只在成功写完 JS/CSS 后发布 `dist/build-ready.json`。推荐先 `stage-sidebar-tool.mjs` 校验回执和产物哈希，再保持输入稳定打包；核对最终 JSON SHA-256 与 stage 回执一致。stage 返回 `STAGED_NOT_INSTALLED`；其产物快照可供显式导入或只读预览，均不自动安装。

原 `build-sidebar-tool.mjs` 直接读取当前 dist 文件，**独立 pack 成功不证明同一次成功 build**。stage 的指纹也不独立证明最新原始组件/npm 锁已经重建；它证明配置、运行资源及完成回执的一致性。构建失败时保留上一产物/快照，不得标记为新源码成功；缺回执、输出哈希不符、包超限或非法资源时保留实际错误，修复后再明确构建和 stage。

持续开发可在工具项目执行 `npm run build:watch`，另一个终端执行 `node ../../../scripts/watch-sidebar-tool.mjs "$PWD"`。watch 只观察已完成产物，不调用 npm、不安装工具；检测到打包/回执错误时报告 `BUILD_OR_PACKAGE_FAILED` 并保留上一预览。编译失败而旧 dist/回执没有变化时，另行查看 Vite 的真实错误日志，不能只凭预览指针判断当前源码已成功。

### 安装与范围

明确 `--out` 后，以上两个 JSON 路径均相对仓库根；不依赖从工具目录调用 packer 的默认 cwd。工具 → 导入 JSON → 核对 ID、版本、摘要与 `storage.local` 能力 → 确认安装/更新 → 主动打开。更新前备份个人数据；未知保存先对账，不重复提交；只有原回执/真实确认才能证明保存成功。

包校验的 JS 字段限 220,000 字符，实际本地 packer 读取 JS 还限 220,000 UTF-8 字节，完整 JSON 限 320,000 UTF-8 字节。React/Vue 运行时同样计入预算；不为了更大的库放宽现有边界。

工具 Vite 不接入程序的 HTTPS 锁定器。HTTPS ESM 先按许可准备为项目本地模块或选择已审核的精确 npm 包；最终不得残留远程 script/CDN external。UMD 兼容性逐库验证，不自动转 ESM。

本轮固定锁验证不是构建或新工具安装证据；实际 React 1.1.0 图表工具与 Vue 工具的新包安装、更新、打开仍 **NOT_TESTED**。源码依据：[打包器](../../scripts/build-sidebar-tool.mjs)、[stage](../../scripts/stage-sidebar-tool.mjs)、[包校验](../../src/ui/sidebar-tools/package.js)、[安装生命周期](../../src/ui/sidebar-tools/installation.js)、[沙箱 CSP](../../src/sidebar-tools/sandbox.html)；完整接口见[侧栏工具 API](sidebar-tools.zh-CN.md)。

## 6. 实际验证记录

| 本轮范围 | 取得的证据 | 仍未覆盖 |
| --- | --- | --- |
| 普通 Page/Controller 静态 HTTPS 独立模块草稿 | [当前同包真实 CFT](../framework/workstreams/evidence/static-import-drafts-20261012/browser-13/acceptance.json)：Page 返回 9、离线复用及拒绝路径；Controller 独立批准、返回 8、controller-result/revision/sourceHash 与 released；原始失败保留 | 缓存损坏/撤权/重开批准只有组件证据；Controller Native 效果/Stop、Page ESM 候选保存、新组合包未验证 |
| 本轮源码/组件回归 | [71 项定向回归](../framework/workstreams/evidence/static-import-drafts-20261012/final-regressions.tap)；交接补丁后的[125 项 UI 回归](../framework/workstreams/evidence/static-import-drafts-20261012/handoff-ui-regressions.tap)；固定编译资源与独立构建通过 | 两组有重叠，不相加；测试 doubles 和构建不是浏览器/Native/安装证据 |
| TOC React Direct | 真实静态 URL、固定 React、502 B 缓存哈希；原五项 builder CI 和模型记录保留原输入 | 当前 LAN 配置/测试有变化；TOC Native/MCP Run/Stop 和安装 NOT_TESTED |
| Page 草稿：Mustache 4.2.0 HTTPS UMD | 真实 HTTPS 200；查看的原文与响应 SHA-256 相同；准备/批准没有执行；单独 Run 返回 `Hello OpenDesk`；再次 Run 无 CDN 请求 | 浏览器缓存损坏/权限撤销、重开与重复批准仅有组件证据 |
| 历史经典 Page 候选拒绝：缺锁、改 URL、HTTP、原始 ESM | 同一受控真实 Chrome 检查，拒绝时没有 CDN 请求 | 原候选尚无普通 ESM 准备；该拒绝不代表新增 import 流程的当前结论 |
| 多文件 HTTPS ESM Page | 真实单模块下载/锁定；原构建器离线编译；固定产物在 USER_SCRIPT 返回 `9`，无运行时 CDN 请求 | 原 Native/MCP attach/run、Controller、React/Vue 项目运行未在本轮真实验证 |
| 历史源码/组件回归 | [原候选 130 项全部通过](../framework/workstreams/evidence/network-javascript-20261012/final-components.tap)，包含审核过期、篡改、超时和明确版本选择 | 保留原输入等级；测试 doubles 不是浏览器或原生证据 |
| 侧栏工具固定依赖 | 两份新锁与原清单字节一致；根版本、全部 HTTPS resolved / SHA-512 验证，见[锁原始记录](../framework/workstreams/evidence/static-import-drafts-projects-20261012/lock-validation-final.json) | 未执行 npm ci、离线安装、Vite 构建或新工具安装；NOT_TESTED |
| 新审核区宽度 | 真实 Chrome 320/420 CSS 宽度检查；并行共享样式更新后已[单独补测](../framework/workstreams/evidence/network-javascript-20261012/browser-ui-02/acceptance.json) | CSS 宽度证据，不代表物理 Side Panel 全面 95+ 验收 |
| 整体正式验收、F3、同包 ZIP 安装 | 本文不关闭、不提升历史等级 | NOT_TESTED；其他 main 输入仍可能并行变化 |

按[测试复用规则](../framework/testing-guide.md)保存原成功/失败/NOT_TESTED 和候选身份；源码存在、离线锁定、构建或预览不能互相替代。逐场景操作索引见[examples/network-javascript](../../examples/network-javascript/README.zh-CN.md)。
