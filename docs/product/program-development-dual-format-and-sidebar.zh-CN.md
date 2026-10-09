# OpenDesk Browser：单文件即时运行与多文件项目开发

更新：2026-10-09，R9 校对当前 Sidebar 控件、依赖构建及证据。沿用现有“我的任务 / 发现 / 开发”和 RunHost，不重新设计 Sidebar，也不恢复已移除的依赖配置界面。

## 先选正确的开发方式

| 你的需求 | 目前最短使用路径 | 当前限制 |
| --- | --- | --- |
| 临时自动化、读取网页标题 | Sidebar「开发」直接写普通 JavaScript →「运行草稿」 | Controller 使用 `page`，不能把 DOM 的 `document` 当作 Worker 全局变量 |
| 当前网页加按钮或读 DOM | Sidebar「开发」直接写 JavaScript →「网页 JavaScript 试运行」 | Page USER_SCRIPT 预览不等于正式安装与自动生效 |
| Codex 修改本地多文件 ESM 项目（含 npm/锁定 HTTPS） | 授权目录 → Native/MCP 连接 → 读取最新代码并在内存中构建 → 明确运行 | npm 必须已安装并有一致锁；HTTPS 必须已有锁及缓存；单文件直连不接受裸 npm import |
| 项目需要 npm 包 | 项目独立的 `package.json` / `package-lock.json` → `npm ci` → 本地 MCP/Sidebar 显式运行；正式交付才另行构建冻结产物 | 不会将包自动安装到扩展 Background，也不能在手工草稿直接解释 import |
| 项目需要 HTTPS ESM | 静态 `import 'https://...'` → 首次受信构建明确锁定并缓存 → 已授权本地项目可离线显式运行；交付仍可冻结产物 | MCP 运行不会自动创建锁或下载远程 JS；缺锁、缺缓存或哈希变化时拒绝 |
| 想让网页脚本以后自动生效 | Page 验证、安装与恢复的独立工作流 | 单次预览、Build 成功均不代表自动安装已验收 |

所有路径都复用既有 Controller / RunHost / Page、网站授权与目标文档身份，不建立第二套执行内核，也不恢复 `@require` URL 表单。这里列的是**当前可实现的操作与限制**，不是全部功能已通过用户 Mac Chrome 的宣告。

## 简单功能直接写 JavaScript

在“开发”编辑器输入代码，不要求 @require 或用户脚本头部。

自动化任务使用原底部“运行草稿”，例如：

```js
async function main() {
  return {title: await page.title(), url: await page.url()};
}
```

需要访问 DOM 时，使用同一编辑器下的 **“网页 JavaScript 试运行 → 在当前网页试运行”**，例如：

```js
async function main() {
  return document.querySelector('h1')?.textContent || '';
}
```

这两个入口的运行世界不同：Controller 有 page/params；Page 有 document。运行前仍检查目标与网站授权。源码可暂不保存，但“运行成功”不等于已安装任务。新自动化优先使用 [现代 Page/Locator API](../framework/modern-page-api.zh-CN.md)，不是把 document 操作搬进 Controller。

## Page 试运行后保存固定版本（R12 候选入口）

目前 Sidebar 「开发 → 网页 JavaScript 试运行」完成一次真实预览并得到可信执行结果后，增加「保存网页脚本版本」。点击后沿用当前 E07.1 的 `importPageCandidate` 和 `frameworkKV`，形成固定 Candidate，**不会正式安装，更不会重新打开网页自动执行**。在「版本管理与任务制作」中调整脚本 ID 和 revision（留空默认 1）；同一 ID+revision 内容不能覆盖，修改源码要增版本并再次试运行。

不必为了保存普通 JS 手写 @match：没有 UserScript 头的源码，保存时为**当前 HTTP(S) 主机**补充 @match、document-idle、noframes 注释，不扩大到任意网站；若已有 UserScript 头则严格保留其原始声明。补注释意味着冻结源码字节与预览的 SHA 不同，后续正式 Page 类型验证必须重新核对实际冻结代码、世界、文档和网页效果。旧版 @require 仍只接受已有固定批准锁。页面导航、草稿更改后，必须重新预览才能再次保存。可见的 Candidate ID 与 manifestHash 是待审核身份，不是安装/授权凭证。

尚未交付的 P0：独立 Page Verified/Available 权威、真实 `chrome.userScripts.register/getScripts/unregister`、匹配规则原生验证、用户确认安装、启停/撤权后的下一文档阻断、SW 重启对账、更新回滚。**请勿把「保存网页脚本版本」解释成已经启用。** 当前还不要求依赖 Codex/MCP 常驻才能读取保存的 Candidate，但无法将其作为安装脚本使用。

## 本地目录开发：直接修改源码并通过 MCP 执行

日常开发优先选择 **连接已授权项目目录 → Codex/AI 修改源文件 → MCP/Sidebar 明确运行 → 查询真实结果**，不要求反复打包 JSON 再上传。当前 `native-agent/local-dev/resolver.mjs` v2 已通过现有 `buildProgramProjectInMemory` 支持项目级精确锁定的 npm 依赖、以及已有锁和缓存的 HTTPS ESM；未锁项目明确失败，不在 `dev.run` 时联网。PR #37、#42 已合入 main；Local Dev R2.2 的真实 macOS CI 定向验收已记录，但不代表用户自己 Mac/Codex 环境或全系统 F3 验收均完成。参见 [本地开发 R2.2](../framework/local-development-r22.zh-CN.md)。受管 Page UI 已有显式再次运行与受控清理的源码实现，P3 的同候选真实 Chrome 验收仍须单列；这不是自动文件监听，也不等于 Page 正式安装。

最短启动步骤（首次连接需要真实用户授权，之后 Codex 只改项目文件）：

1. 在 Mac 上准备 Node 22.12+、构建并加载当前扩展，按 [Native 安装说明](../framework/local-development-r22.zh-CN.md#首次配置)为真实扩展 ID 完成 `node native-agent/cli.mjs setup --extension-id "扩展ID"`。
2. 在仓库根目录配置 `codex mcp add opendesk-dev -- node "/Users/shopme/Documents/workspace/opendesk-browser/native-agent/local-dev/mcp.mjs" --allow-project "/Users/shopme/Documents/workspace/opendesk-browser/examples/programs/local-controller"`；`--allow-project` 的绝对路径是明确的读取授权范围。
3. 在目标网页及同窗口 OpenDesk 工作台完成权限批准；可由 Codex 依次调用 `opendesk.dev.attach → status → run → result`，或在 Sidebar「开发 → 本地项目连接」选择「本地项目」、刷新并选择已授权项目，再明确点击运行。
4. Codex 修改 `src/*.js` 后使用**新的、有意执行的**请求，再次检查真实 `sourceHash / runId / resultId / documentId`。未知效果、断连或页面导航时不要盲目重试。单纯修改代码不自动重跑有副作用的任务。

**重要边界：**`E_DEV_DEPENDENCY` 针对直接连接的独立单文件等未通过项目锁定的外部依赖，并非整个本地 Resolver 不支持 npm/HTTPS。多文件项目使用自己的 `package-lock.json` 和已安装 `node_modules`；HTTPS 另需 `opendesk.remote-lock.json` 与正确哈希的 `.opendesk/remote-cache`。`dev.run` 每次验证所需闭包并在内存中构建，严禁 `eval`、临时 CDN 注入或绕过既有授权。

下方构建/导入属于**不可变发布、兼容导入及首次 HTTPS 显式锁定**等场景；npm/已锁 HTTPS 的授权本地项目已经可以通过现有 Resolver 走内存构建与显式运行，**不必每次生成 JSON**。

## 多文件正式构建与导入（交付场景）

每个项目独立 package.json、src/main.js 及其他 ESM 模块；使用 npm 时有该项目自己的 package-lock.json。扩展根目录 npm ci 安装的是构建工具，不等于所有用户项目依赖都安装好了。

```sh
npm ci --ignore-scripts
npm ci --prefix examples/programs/page-npm-lodash --ignore-scripts
npm run build:program -- examples/programs/page-npm-lodash
```

这个例子是真实的两个本地模块 + lodash-es@4.17.21，最终得到单个 program.js、artifact.json 和 program.opendesk-draft.json。没有运行时 CDN，不需要向 Background 加 min.js。构建日志给出实际输出目录。

保持 Sidebar 开启，从“发现 → 导入”打开现有完整任务目录，导入 program.opendesk-draft.json，然后回到“开发”。文件下拉展示只读源码快照；“高级诊断”查看真正执行的生成代码；点击 **“新建”** 回到普通可编辑草稿。快照不能在浏览器内替代本地 ESM 构建。

Page 用“在当前网页试运行”，Controller 用“运行草稿”。构建和导入不发放权限，也不自动运行。Controller 示例仍可用 `npm run build:program -- examples/programs/controller-title`，另外生成原 Task v1 Candidate JSON。源码、草稿与正式任务包不要混用。

## 标准 HTTPS ESM：只在本地构建阶段锁定

已支持的**项目源码**可以使用标准静态 HTTPS 导入，不需要 `@require`：

```js
import add from 'https://cdn.jsdelivr.net/npm/lodash-es@4.17.21/add.js';

export default async function main() {
  return add(20, 22);
}
```

直接使用已有 [remote-esm-page 示例](../../examples/programs/remote-esm-page/README.md) 从仓库根目录执行：

```sh
npm ci --ignore-scripts
# 首次联网：开发者明确同意新增依赖并锁定实际内容
npm run build:program -- examples/programs/remote-esm-page --lock-remote
# 再次构建：仅使用已锁定内容，不重新访问 CDN
npm run build:program -- examples/programs/remote-esm-page
```

首次构建后审阅项目下的 `opendesk.remote-lock.json` 和 `.opendesk/remote-cache/*.mjs`，将这**两类文件与源码一起版本化**。SHA-256 保证锁定字节未变，**不代表第三方代码安全或可信**。缓存缺失或篡改时构建应拒绝，不能暗中联网重新获取。生成的 `program.js` / `program.opendesk-draft.json` 沿用上节「发现 → 导入 → 开发 → 明确试运行」；示例配置针对 `https://example.com/*`，不是自动对任意测试站点安装。构建成功时状态仍是 `BUILT_UNVERIFIED`。

同一项目可以组合本地相对 `import`、经 `npm ci` 安装且 `package-lock.json` 固定的 npm 包，以及上述远程静态 import。**授权本地多文件项目**可经 `buildProgramProjectInMemory` 在内存中构建固定执行字节，再通过既有 MCP/Sidebar 运行；**正式交付**经 `build:program` 输出 `program.js` 和草稿。单文件 Sidebar 手工源码直接粘贴原始 `import ... from 'https://...'` 将得到 `E_ESM_BUILD_REQUIRED`，**不代表浏览器能即时解释它**。Local Dev 不能自动下载依赖或批准权限；只接受真实安装/锁定的依赖。细节见 [HTTPS ESM 安全与锁定规则](../architecture/browser-framework/https-esm-imports-r1.zh-CN.md)。

## 加库的正确位置

| 需要 | 正确位置 |
|---|---|
| 扩展框架 Background、Content、固定 MAIN SDK 需要库 | 扩展根 package.json/lock + **各执行世界真正的固定入口**静态 import，经 WXT 验证对应产物；见 [R9.1 依赖世界与旧双重加载分析](../architecture/browser-framework/background-dependencies-restoration-r1.zh-CN.md) |
| Page 或 Controller 用户项目需要 lodash 等 | 在该项目安装精确版本，Local Dev v2 可内存编译后显式运行；正式交付才经 Webpack 输出自己的 program.js，不进入扩展根 Background |
| 传统全局库/jQuery 兼容 | 只使用已审核的 vendor、来源、许可证、哈希与受批准的 USER_SCRIPT 世界；不把全局 `# OpenDesk Browser：单文件即时运行与多文件项目开发

更新：2026-10-09，R9 校对当前 Sidebar 控件、依赖构建及证据。沿用现有“我的任务 / 发现 / 开发”和 RunHost，不重新设计 Sidebar，也不恢复已移除的依赖配置界面。

## 先选正确的开发方式

| 你的需求 | 目前最短使用路径 | 当前限制 |
| --- | --- | --- |
| 临时自动化、读取网页标题 | Sidebar「开发」直接写普通 JavaScript →「运行草稿」 | Controller 使用 `page`，不能把 DOM 的 `document` 当作 Worker 全局变量 |
| 当前网页加按钮或读 DOM | Sidebar「开发」直接写 JavaScript →「网页 JavaScript 试运行」 | Page USER_SCRIPT 预览不等于正式安装与自动生效 |
| Codex 修改本地多文件 ESM 项目（含 npm/锁定 HTTPS） | 授权目录 → Native/MCP 连接 → 读取最新代码并在内存中构建 → 明确运行 | npm 必须已安装并有一致锁；HTTPS 必须已有锁及缓存；单文件直连不接受裸 npm import |
| 项目需要 npm 包 | 项目独立的 `package.json` / `package-lock.json` → `npm ci` → 本地 MCP/Sidebar 显式运行；正式交付才另行构建冻结产物 | 不会将包自动安装到扩展 Background，也不能在手工草稿直接解释 import |
| 项目需要 HTTPS ESM | 静态 `import 'https://...'` → 首次受信构建明确锁定并缓存 → 已授权本地项目可离线显式运行；交付仍可冻结产物 | MCP 运行不会自动创建锁或下载远程 JS；缺锁、缺缓存或哈希变化时拒绝 |
| 想让网页脚本以后自动生效 | Page 验证、安装与恢复的独立工作流 | 单次预览、Build 成功均不代表自动安装已验收 |

所有路径都复用既有 Controller / RunHost / Page、网站授权与目标文档身份，不建立第二套执行内核，也不恢复 `@require` URL 表单。这里列的是**当前可实现的操作与限制**，不是全部功能已通过用户 Mac Chrome 的宣告。

## 简单功能直接写 JavaScript

在“开发”编辑器输入代码，不要求 @require 或用户脚本头部。

自动化任务使用原底部“运行草稿”，例如：

```js
async function main() {
  return {title: await page.title(), url: await page.url()};
}
```

需要访问 DOM 时，使用同一编辑器下的 **“网页 JavaScript 试运行 → 在当前网页试运行”**，例如：

```js
async function main() {
  return document.querySelector('h1')?.textContent || '';
}
```

这两个入口的运行世界不同：Controller 有 page/params；Page 有 document。运行前仍检查目标与网站授权。源码可暂不保存，但“运行成功”不等于已安装任务。新自动化优先使用 [现代 Page/Locator API](../framework/modern-page-api.zh-CN.md)，不是把 document 操作搬进 Controller。

## Page 试运行后保存固定版本（R12 候选入口）

目前 Sidebar 「开发 → 网页 JavaScript 试运行」完成一次真实预览并得到可信执行结果后，增加「保存网页脚本版本」。点击后沿用当前 E07.1 的 `importPageCandidate` 和 `frameworkKV`，形成固定 Candidate，**不会正式安装，更不会重新打开网页自动执行**。在「版本管理与任务制作」中调整脚本 ID 和 revision（留空默认 1）；同一 ID+revision 内容不能覆盖，修改源码要增版本并再次试运行。

不必为了保存普通 JS 手写 @match：没有 UserScript 头的源码，保存时为**当前 HTTP(S) 主机**补充 @match、document-idle、noframes 注释，不扩大到任意网站；若已有 UserScript 头则严格保留其原始声明。补注释意味着冻结源码字节与预览的 SHA 不同，后续正式 Page 类型验证必须重新核对实际冻结代码、世界、文档和网页效果。旧版 @require 仍只接受已有固定批准锁。页面导航、草稿更改后，必须重新预览才能再次保存。可见的 Candidate ID 与 manifestHash 是待审核身份，不是安装/授权凭证。

尚未交付的 P0：独立 Page Verified/Available 权威、真实 `chrome.userScripts.register/getScripts/unregister`、匹配规则原生验证、用户确认安装、启停/撤权后的下一文档阻断、SW 重启对账、更新回滚。**请勿把「保存网页脚本版本」解释成已经启用。** 当前还不要求依赖 Codex/MCP 常驻才能读取保存的 Candidate，但无法将其作为安装脚本使用。

## 本地目录开发：直接修改源码并通过 MCP 执行

日常开发优先选择 **连接已授权项目目录 → Codex/AI 修改源文件 → MCP/Sidebar 明确运行 → 查询真实结果**，不要求反复打包 JSON 再上传。当前 `native-agent/local-dev/resolver.mjs` v2 已通过现有 `buildProgramProjectInMemory` 支持项目级精确锁定的 npm 依赖、以及已有锁和缓存的 HTTPS ESM；未锁项目明确失败，不在 `dev.run` 时联网。PR #37、#42 已合入 main；Local Dev R2.2 的真实 macOS CI 定向验收已记录，但不代表用户自己 Mac/Codex 环境或全系统 F3 验收均完成。参见 [本地开发 R2.2](../framework/local-development-r22.zh-CN.md)。受管 Page UI 已有显式再次运行与受控清理的源码实现，P3 的同候选真实 Chrome 验收仍须单列；这不是自动文件监听，也不等于 Page 正式安装。

最短启动步骤（首次连接需要真实用户授权，之后 Codex 只改项目文件）：

1. 在 Mac 上准备 Node 22.12+、构建并加载当前扩展，按 [Native 安装说明](../framework/local-development-r22.zh-CN.md#首次配置)为真实扩展 ID 完成 `node native-agent/cli.mjs setup --extension-id "扩展ID"`。
2. 在仓库根目录配置 `codex mcp add opendesk-dev -- node "/Users/shopme/Documents/workspace/opendesk-browser/native-agent/local-dev/mcp.mjs" --allow-project "/Users/shopme/Documents/workspace/opendesk-browser/examples/programs/local-controller"`；`--allow-project` 的绝对路径是明确的读取授权范围。
3. 在目标网页及同窗口 OpenDesk 工作台完成权限批准；可由 Codex 依次调用 `opendesk.dev.attach → status → run → result`，或在 Sidebar「开发 → 本地项目连接」选择「本地项目」、刷新并选择已授权项目，再明确点击运行。
4. Codex 修改 `src/*.js` 后使用**新的、有意执行的**请求，再次检查真实 `sourceHash / runId / resultId / documentId`。未知效果、断连或页面导航时不要盲目重试。单纯修改代码不自动重跑有副作用的任务。

**重要边界：**`E_DEV_DEPENDENCY` 针对直接连接的独立单文件等未通过项目锁定的外部依赖，并非整个本地 Resolver 不支持 npm/HTTPS。多文件项目使用自己的 `package-lock.json` 和已安装 `node_modules`；HTTPS 另需 `opendesk.remote-lock.json` 与正确哈希的 `.opendesk/remote-cache`。`dev.run` 每次验证所需闭包并在内存中构建，严禁 `eval`、临时 CDN 注入或绕过既有授权。

下方构建/导入属于**不可变发布、兼容导入及首次 HTTPS 显式锁定**等场景；npm/已锁 HTTPS 的授权本地项目已经可以通过现有 Resolver 走内存构建与显式运行，**不必每次生成 JSON**。

## 多文件正式构建与导入（交付场景）

每个项目独立 package.json、src/main.js 及其他 ESM 模块；使用 npm 时有该项目自己的 package-lock.json。扩展根目录 npm ci 安装的是构建工具，不等于所有用户项目依赖都安装好了。

```sh
npm ci --ignore-scripts
npm ci --prefix examples/programs/page-npm-lodash --ignore-scripts
npm run build:program -- examples/programs/page-npm-lodash
```

这个例子是真实的两个本地模块 + lodash-es@4.17.21，最终得到单个 program.js、artifact.json 和 program.opendesk-draft.json。没有运行时 CDN，不需要向 Background 加 min.js。构建日志给出实际输出目录。

保持 Sidebar 开启，从“发现 → 导入”打开现有完整任务目录，导入 program.opendesk-draft.json，然后回到“开发”。文件下拉展示只读源码快照；“高级诊断”查看真正执行的生成代码；点击 **“新建”** 回到普通可编辑草稿。快照不能在浏览器内替代本地 ESM 构建。

Page 用“在当前网页试运行”，Controller 用“运行草稿”。构建和导入不发放权限，也不自动运行。Controller 示例仍可用 `npm run build:program -- examples/programs/controller-title`，另外生成原 Task v1 Candidate JSON。源码、草稿与正式任务包不要混用。

## 标准 HTTPS ESM：只在本地构建阶段锁定

已支持的**项目源码**可以使用标准静态 HTTPS 导入，不需要 `@require`：

```js
import add from 'https://cdn.jsdelivr.net/npm/lodash-es@4.17.21/add.js';

export default async function main() {
  return add(20, 22);
}
```

直接使用已有 [remote-esm-page 示例](../../examples/programs/remote-esm-page/README.md) 从仓库根目录执行：

```sh
npm ci --ignore-scripts
# 首次联网：开发者明确同意新增依赖并锁定实际内容
npm run build:program -- examples/programs/remote-esm-page --lock-remote
# 再次构建：仅使用已锁定内容，不重新访问 CDN
npm run build:program -- examples/programs/remote-esm-page
```

首次构建后审阅项目下的 `opendesk.remote-lock.json` 和 `.opendesk/remote-cache/*.mjs`，将这**两类文件与源码一起版本化**。SHA-256 保证锁定字节未变，**不代表第三方代码安全或可信**。缓存缺失或篡改时构建应拒绝，不能暗中联网重新获取。生成的 `program.js` / `program.opendesk-draft.json` 沿用上节「发现 → 导入 → 开发 → 明确试运行」；示例配置针对 `https://example.com/*`，不是自动对任意测试站点安装。构建成功时状态仍是 `BUILT_UNVERIFIED`。

同一项目可以组合本地相对 `import`、经 `npm ci` 安装且 `package-lock.json` 固定的 npm 包，以及上述远程静态 import。**授权本地多文件项目**可经 `buildProgramProjectInMemory` 在内存中构建固定执行字节，再通过既有 MCP/Sidebar 运行；**正式交付**经 `build:program` 输出 `program.js` 和草稿。单文件 Sidebar 手工源码直接粘贴原始 `import ... from 'https://...'` 将得到 `E_ESM_BUILD_REQUIRED`，**不代表浏览器能即时解释它**。Local Dev 不能自动下载依赖或批准权限；只接受真实安装/锁定的依赖。细节见 [HTTPS ESM 安全与锁定规则](../architecture/browser-framework/https-esm-imports-r1.zh-CN.md)。

## 加库的正确位置

| 需要 | 正确位置 |
|---|---|
| 扩展框架 Background、Content、固定 MAIN SDK 需要库 | 扩展根 package.json/lock + **各执行世界真正的固定入口**静态 import，经 WXT 验证对应产物；见 [R9.1 依赖世界与旧双重加载分析](../architecture/browser-framework/background-dependencies-restoration-r1.zh-CN.md) |
| Page 或 Controller 用户项目需要 lodash 等 | 在该项目安装精确版本，Local Dev v2 可内存编译后显式运行；正式交付才经 Webpack 输出自己的 program.js，不进入扩展根 Background |
/`_` 从 Background 偷渡到网页 MAIN |
| 源码写静态 HTTPS import | 使用已支持的构建期远端锁流程，不在浏览器里动态执行 |

Codex 增加依赖时审查许可证和实际消费者，维护精确版本与锁文件，再核对 artifact.json 的 npmDependencies、npmBundledModules、npmLockSha256 和 sourceHash。扩展本身另有 WXT build receipt 的 bundleModules。**声明依赖并不证明代码进入产物；编译成功也不证明浏览器授权链通过。**

## 旧脚本如何迁移

现有 @require 解析器和已批准依赖锁保留；唯一匹配的合法锁可继续复验复用。无锁或多锁时拒绝，回本地 npm/ESM 项目固定后构建再导入。当前页面没有新 @require 地址表单、版本下拉、jQuery 复选框或入口格式选择器。

不要无条件把旧 @require 替换成 import：经典全局库、模块导出和运行世界可能不同。`examples/tasks/jquery-page-draft.js` 是有既存合法 jQuery 锁时的兼容检查，不是新配置可直接免审核运行的安装方案。复杂新项目以源码构建为主。

## UI 与资源

简单程序不需要框架，原生 DOM/表单即可。小型 Page CSS/JSON/图片可按项目合同打包，使用时明确挂载并优先 ShadowRoot，不能全站注入 Tailwind reset。React/Vue/Tailwind 属可选制作端方案，不代表当前直接支持 JSX/TSX/.vue 或浏览器内编译。

用户自定义 Side Panel 工具通过现有独立工具包和隔离文档展示，见 [侧栏自定义工具](sidebar-custom-tools-r1.zh-CN.md)。其 JS 不能作为扩展高权限组件直接执行，工具包不是 Page/Controller Program。

## 出错时如何处理

| 看到的情况 | 正确处理 |
| --- | --- |
| `E_ESM_BUILD_REQUIRED` | Sidebar 手工草稿含未经构建的 ESM；回本地项目构建，再导入固定产物 |
| `E_DEV_DEPENDENCY` | 独立单文件或未获批准的 `@require` 不能直接加载外部代码；改为有完整锁的多文件项目或构建冻结产物 |
| `E_PROJECT_NPM_LOCK` | 多文件项目声明的 npm 包、已安装版本与 `package-lock.json` 不一致，或缺少可信 HTTPS resolved/SHA-512；在项目目录核查 `package.json` 和锁后执行 `npm ci --ignore-scripts`，不允许忽略锁继续运行 |
| `E_REMOTE_UNLOCKED` | HTTPS import 缺 `opendesk.remote-lock.json`；先在受信本地构建端明确执行 `--lock-remote`，不能让 MCP 运行时自行抓取 |
| `E_REMOTE_CACHE` / `E_REMOTE_HASH` | 检查已提交的缓存/锁文件，不能静默在线补齐或忽略哈希错误 |
| `E_DEV_DISCONNECTED` | 检查同窗口工作台、Native 授权和 MCP；不执行替代的未授权下载/运行 |
| `E_EFFECT_UNKNOWN` / `E_DOCUMENT_STALE` | 先确认网页实际状态、原 runId 与目标文档，不能简单重试有副作用的操作 |

## 当前验证等级

PR #37（本地开发）、#38（npm 依赖迁移）、#39（HTTPS ESM 安全修复）已合入 main。R9 有真实 npm 包构建与定向 CI，R10 有公开 CDN 14 模块首次固定/离线重建及远程 ESM Node 测试证据；Local Dev 的部分真 Chrome for Testing CI 记录不代表**用户自己的 Mac/Codex**已经验收。当前仍不能宣称 npm+HTTPS 经 MCP 直连运行、整体网页脚本自动安装、断连/撤权/重启及最终 F3/ZIP 已完成。证据以 [R9 工作记录](../framework/workstreams/r9-dependency-closure-20261009.md)、[R10 工作记录](../framework/workstreams/r10-https-esm-security-20261009.md) 和同候选原始回执为准。

**后续本地 Codex 与 Mac Chrome 验收：**优先核对已合入的 [本地开发 R2.2](../framework/local-development-r22.zh-CN.md) 的固定 npm/HTTPS 闭包与实际 `runId/previewId/sourceHash`，再按 [R12 本地验收目标](../framework/prompts/goal-r12-local-mac-codex-acceptance.md) 完成用户机器的原生确认。旧 R10.1 GOAL 中“Local Dev 仍不支持锁定 npm/HTTPS”的前置判断已过时，不能照搬实施。

继续开发先读 [项目合同](../architecture/browser-framework/program-project-authoring-r1.zh-CN.md)、[依赖迁移表](../architecture/browser-framework/third-party-library-map.md) 及现有 Codex Skill；不必再创建另一套 IDE、构建器或依赖设置页面。

本地目录的改错闭环与原始错误定位见 [本地 AI 开发 R1](../framework/local-ai-loop-r1.zh-CN.md)。本机 Codex 101→102→真实异常→修复 103 的 Mac CFT 回执、候选输入与未通过项在 [R1 工作流](../framework/workstreams/local-ai-loop-r1-01a12158.md) 单独记录；它不替代 Page 正式安装、自动运行与最终 F3/ZIP 验收。
