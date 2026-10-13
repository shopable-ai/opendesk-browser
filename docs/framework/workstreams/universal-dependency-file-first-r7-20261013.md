# Universal Dependency R7 — File-First / SHA 共享阶段证据账本

日期：2026-10-13。范围仅为第三方依赖资产和旧版独立资源迁移，**不覆盖 Framework R8 Browser SDK** 的 chrome-types、WXT/webext-core、Host、Authority、Browser API 映射。

## 最新基线和交付边界

- 审查起点：`de52893a69d5107b4d60f837c9e570d7298ac588`（远端 `main`）；本文件随实际提交更新，不把旧 SHA 误称为未来 HEAD。
- **已在此前源码具备**：`src/libs/runtime-contract.js` 唯一预装 Catalog、`loader.js` 对扩展文件及 manifest SHA 的校验、`dependency-manager.js` 按 hash 保存 IndexedDB 字节、每 namespace 审核/lock、`execution-source.js` Page 原子拼接及校验、Controller R4 ESM 固定图。
- **本次新增**：同一个已被显式批准且实际 HTTPS 下载的 `(URL,SHA-256)` 元数据共享索引；新程序 `inspect` 可看到 `sharedCacheChoices`，`prepare({explicitUserAction:true,selections:[{order,sharedAssetSha256}]})` 复用已验证 SHA 字节而**不下载**，但仍产生全新 pending review，随后还需要当前 namespace 自己的 `approve` 和锁才能执行。
- **故意不做**：物理写入 `dist/libs`、跨 namespace 共享锁或安装权限、由扩展 SW 动态 eval、把 ESM exports 冒充全局、修改 R8 SDK、把 `chrome.userScripts.js` 多来源直接设为正式默认模式。
- 本阶段验收等级：源码/Node 测试和 GitHub CI 需分别记录；**没有同包 Chrome/Mac 原生回执即 NOT_TESTED，不得标记 R7–R10 完结。**

## 旧文件 → 机制 → 目标世界 → 新职责 → 结论（源码审计）

| 旧来源 | 旧加载及消费者 | 世界 | 新职责 | 迁移决定 / 风险 |
|---|---|---|---|---|
| `src-bex/background.ts` | TS `import lodash/moment/axios`，旧构建器静态打包 | Background | WXT 固定入口 / 各产品显式 import | REPLACE；不共享 Page 全局 |
| `scrapyJsChrome/background-sw.js` | `BACKGROUND_SCRIPTS` + `importScripts(...)` | SW classic | 既有受信 Background 打包与 Native transport | ADAPT；不把用户库注入 SW |
| `src-bex/manifest.json` | `content_scripts.js/css` 独立文件 | ISOLATED | 现有可信 WXT Content/Relay | ADAPT；不能向用户包授信 |
| `src-bex/my-content-script.ts` | `appendScript(getURL(...))` 加载 core/lodash/moment/axios/js-cookie | MAIN | USER_SCRIPT 固定文件候选加载计划 | ADAPT；未 await onload/error，不能照搬 |
| `src-bex/ChromePage.ts` | `addScriptTag/addStyleTag` DOM 插入 | MAIN | Page 受控加载/生命周期 | REPLACE；有 `new Function` 和注入风险 |
| `assets/js/core/brige.js` | CustomEvent + 页面全局 Promise 回调映射 | MAIN | 既有 Page port/Host/Authority | REPLACE；丢响应/清理风险 |
| `assets/js/core/axiosx.js` | Bridge HTTP 调用 | MAIN | 现有 SDK network 经授权 Broker | REPLACE；不是 Axios npm 包 |
| `assets/js/core/appStorage.js`, `appLocal.js` | Bridge 存储全局 | MAIN | 现有授权存储/SDK | REPLACE；不得开放全局特权 |
| `assets/js/core/common.js` | notify Bridge helper | MAIN | 已有通知能力再映射 | NEEDS_REVIEW；不是第三方 npm |
| `assets/js/lodash.min.js` | file 全局注入 | MAIN | Page/Controller `_` 独立固定资源 | ADAPT；新旧版本不同 |
| `assets/js/moment.min.js` | file 全局注入 | MAIN/ISOLATED | 已批准 Day.js 迁移 | REPLACE；不得冒充 Moment 全量兼容 |
| `assets/js/axios.min.js` | file 全局注入 | MAIN/ISOLATED | 新版固定 Axios opt-in | ADAPT；网络授权独立 |
| `assets/js/js.cookie.min.js` | file 全局注入 | MAIN/ISOLATED | 新版固定 jsCookie opt-in | ADAPT；作用域不自动跨世界 |
| `assets/js/custom_event.js` | Content 监听 MAIN 自定义事件并转发 | ISOLATED | 既有受控 relay / messaging | REPLACE；数据未经授权可伪造 |
| `assets/js/detect_focus.js` | Content 监听 focus/click/keydown/mousemove 并发消息 | ISOLATED | Time Review 独立产品负责 | REPLACE；不是公共依赖，不迁入 runtime |

证据：`docs/contracts/source-snapshots/todo-src-bex/src-bex/` 与 `docs/contracts/source-snapshots/scrapyJsChrome/background-sw.js` 的文件内容；不是旧版 Chrome 通过证据。

## 真实世界当前边界

| 作者使用场景 | 已存在机制 | 本轮变更 | 独立文件执行状态 |
|---|---|---|---|
| Controller Worker | 固定默认库 + R4 ESM linker，零参 `main()` | 不改 Worker 模型 | 仍采用现有受控组合；未验收多文件 Worker |
| 开发中 Controller 单文件 | 已有固定 ESM 图准备 | 不重写编译器 | NOT_TESTED 新方案 |
| Page USER_SCRIPT | 审核 HTTPS `@require` + 原子 compile | **同 URL 跨程序离线共享 SHA 字节** | `js:[{code}]` 仍是正式安全路径 |
| Content ISOLATED | WXT 固定包 | 不授信用户下载代码 | 非本轮 |
| 网站 MAIN | 显式高级兼容 | 保持默认禁用 | 非默认 |
| React/Vue Page | 固定框架、受控组件编译 | 仅复用 hash/授权规则 | 独立文件待同世界 native 验证 |
| Side Panel 独立工具 | `OpenDeskTool` 沙箱 | 不注入宿主全局 | NOT_TESTED 新方案 |
| Background SW | 可信固定入口 | 禁止用户库注入 | 非用户依赖运行世界 |
| Native 多文件项目 | package/lock 和已有构建器 | 不复制新 npm installer | 现有固定 bundle |
| Scheduled / Cloud | 固定 revision + 原 Runner | 不创建第二资产仓库 | 恢复/撤权待专项验证 |

## R7 共享内容调用链（已编码，仍以 CI 结果为准）

1. A 程序通过原 `prepare` 在受控 HTTPS 下载后形成 pending review。**此时全局共享来源索引为空**。
2. A 程序的 `approve` 同事务写入 namespace lock、引用和共享 `url → SHA` 元数据；只有 `sourceKind=https, acquisition=download, resolvedUrl=url` 的真实下载可进入共享索引。
3. B 程序 inspect 返回 `sharedCacheChoices`；此数据**不是**批准或执行令牌。原 `cacheChoices` 仍只表示 B 自己已批准的缓存。
4. B 用户通过现有受信 RPC 明确提交 `sharedAssetSha256` 选择；Resolver 校验同 URL 关联、全部字节及 SHA 后，返回新的 pending review；**无 fetch、无需下载权限**。
5. B 必须独立接受 SHA/风险，`approve` 产生 B namespace 的不同 lockId。运行时仍经现有 `loadForExecution`、Site/Authority/RunHost 验证。
6. 原下载来源 URL 改版形成新 SHA，不覆写 A 旧锁；本地上传的替代字节和仅 pending 的记录不能伪装为网络已批准来源。

## File-First 的下一道正式门槛

`chrome.userScripts` 的 `file` 来源是扩展安装包内固定相对路径，**不能指向 IndexedDB 的虚拟文件**；用户新下载资产仍应通过该 API 支持的受控 `code` 注入，或在 sandbox/Worker 采用已经验收的转换执行模型。单纯拆 `sources.join('\n;\n')` 为若干 ScriptSource 未能证明异常传播、同步 fail-stop、作用域和 Stop 生命周期；未得到 Chrome 同包回执前，保留原有原子编译器。安全边界依照官方 `userScripts` 文档与 MV3 远程代码政策。

## 精准后续任务（不与 R8 重叠）

- P1：给 Page 固定包 `file` 路径设计含执行完成哨兵的受控预编译资源；同包 Chrome 先试验非生产默认路径。
- P2：让 UI 消费 `sharedCacheChoices` 并提供“复用已审核字节 / 在线下载”的显式操作；确保来源版本与许可证展示。
- P3：将同样的 SHA 复用带给 Controller ESM 固定图、React/Vue 组件和 Native 项目，但不能把 Classic 的 globals 转成 ESM exports。
- P4：Chrome restart、离线、撤权、版本升级、Stop、已安装工具、Scheduled、Cloud 全链路真实验收；性能以 SHA 资产字节和实际浏览器 profile 量测，尚无量化结论。

## Standard / Developer 打包诊断修正（2026-10-13）

R15 `libs:doctor --strict` 错把六个 Developer-only `PAGE_BROWSER_PRIVATE_FILES` 当成 Standard 物理打包必备，真实生产与开发 Standard 包因此报告 `PACKAGE_FAIL missing`。本轮改为直接复用 `scripts/browser-editions-r245.mjs` 的 `compilerResourcesForEdition` 与物理 `browser-edition.json`，按照版本校验：Standard 不得有这六项、Developer 必须全有，其他固定库和 SHA 校验不放宽。独立 Node 测试覆盖反向负例；不触碰 R8 Browser SDK 映射。


## R7.1 — Side Panel「开发」Classic JS 首次安装与程序独立锁（2026-10-13）

### 目标与实现边界

- R7.1 仅扩展已有 Dependency Manager 的 UI 接线和程序级锁归属；保留 IndexedDB SHA 字节存储、既有 Host/Authority、Page USER_SCRIPT 单份原子 JS、Controller ESM 编译器及 R8 Browser SDK。
- 原有 Host namespace 覆盖同一个 Side Panel 的所有脚本，因此本轮对通过「开发」编写的 Page `@require` 脚本，在既有 namespace 下派生固定 `programId` 身份；资产跨程序共享，锁和审核绝不共享。既有不含 `programId` 的运行合同保留兼容，不重写旧 Candidate。
- `src/ui/page-dependency-install.js`（新）显示预装 / 本程序已审核缓存 / 跨程序 SHA 字节 / HTTPS 新下载，必须先检查、真实点击后下载，再逐项查看完整 SHA、原始 URL、MIME、许可证状态和风险，逐条勾选后显式批准。Chrome 来源权限申请保持真实点击的同步权限请求，网页执行许可仍由既有 Page 入口另行验证。
- `src/ui/page-dependencies.js`、`src/ui/script-editor.js`、`src/ui/tool.html`、`src/ui/tool-shell.css`：复用原有开发界面和 Broker RPC，展示可选固定锁；更改程序 ID、来源、源码或取消后不复用未批准的旧审核。
- `src/scripting/user-scripts/dependency-manager.js`、`preview.js`、`page-program-contract.js`、`src/ui/page-candidate-source.js`：可选程序级锁身份贯穿 inspect → prepare → approve → preview → frozen Candidate → installed read，仍由 Authority 负责页面许可和运行。
- 测试：`tests/environment/page-dependencies-ui.test.mjs`、`tests/environment/page-dependency-r71-ui.test.mjs`、`tests/environment/dependency-manager.test.mjs`，覆盖真实点击语义的组件模拟、B 未批准拒绝、SHA 复用不联网、不同锁、篡改拒绝、旧 API 兼容。组件模拟不是原生 Chrome PASS。

### 真人浏览器待核对示例

此案例选择此前未预装的 Classic UMD 库；以下下载地址、许可证、SHA 和函数结果均须通过网络实测重新确认，不能把样例当作验收回执。

```javascript
// ==UserScript==
// @name R7.1 Classic dependency smoke
// @require https://cdn.jsdelivr.net/npm/marked@15.0.12/lib/marked.umd.js
// ==/UserScript==
async function main() {
  return {type: typeof globalThis.marked?.parse,
    html: globalThis.marked?.parse('**OpenDesk**')};
}
```

Chrome 验收路径：使用相同源文件和 `programId=marked-a`，检查→确认下载来源权限→获取→记录真实字节 SHA → 审核→独立点击试运行；保存冻结 Page Candidate。再创建 `programId=marked-b`，不能直接继承 A 的锁，选择相同来源下共享 SHA，在离线状态建立 pending review，独立批准后试运行，并确认 B 不发起新的网络下载。两程序使用同一资产 SHA 但锁必须不同。

另需测试：重复运行与浏览器重启后的离线成功、SHA 修改和资产缺失拒绝、撤销权限安全失败、页面刷新/导航/Stop 无重复执行，Standard 与 Developer 在同一具体候选 SHA 下分别通过真实 Chrome。留存 `sourceHash`、下载 URL/MIME/SHA/次数、各 programId 锁 ID、实际函数返回值、tab/document/preview 回执、package SHA、Chrome/OS 版本、CI URL 和真实 Mac Chrome 证据。

### 证据状态与未完成限制

| 验收项 | 当前证据 |
| --- | --- |
| GitHub main 改动 | 实现提交 `bc6dc46aa17f56006010ac27af8484a6eaf96f70`；测试/CI 补丁 `d61eea4889dcc5835f89b536760c0d71e02249e6`；均已在 `main`，未改 R8 |
| 定向 Node / 已有依赖资产 / 源码检查 | [Page userscript dependencies and package · 38352293156](https://github.com/shopable-ai/opendesk-browser/actions/runs/38352293156) **PASS**：D1/UI 186/186、冻结 Candidate 10/10、网页 fixture 11/11、R8 backlog 3/3；`npm run check` PASS |
| 页面安装组件回归 | [Native Page program source and authorization boundaries · 38352293233](https://github.com/shopable-ai/opendesk-browser/actions/runs/38352293233) **PASS**：162/162 Node 合同与模拟，`npm run check`、`npm run build:dev` PASS；此工作流的 Native 一词不等同于真实 Chrome |
| 生产/开发包与固定资源 | 上述 38352293156 **PASS**：生产 83 个文件、packageHash `6f3b1e71ed996638fe3631bd956baf04cc040ccb6614cc866b7908c188a3ab89`；开发 117 个文件、packageHash `ac64773912f7235e0af37915c28b387d3aa07e696f292f7388de6f93e9510d46`；`npm run verify` 与 ZIP=dist 字节一致性 **PASS**。ZIP SHA256 分别为 `54be995b4e5a05c5b365828b3e6ce3c592d047793dafcd208aea0f46d38a8390`、`93855cf1cb813d95b54a86ccc2b2d67894601b5a538f8a2a7f4bc38bf7f5810c` |
| 全新第三方库真实 CDN 字节及 SHA / MIME / 许可证 | NOT_TESTED；未从真实 Chrome 下载，不填臆造值 |
| 程序 A/B 真正运行、授权、缓存次数、离线及回调结果 | NOT_TESTED；Node mock/VM 仅能证明局部逻辑 |
| Mac Chrome 155 Standard/Developer 基础回归（非 R7.1 新依赖验收） | [R24.5 · 38352072345](https://github.com/shopable-ai/opendesk-browser/actions/runs/38352072345) 在 `macos-15` 使用 `Google Chrome for Testing 155.0.8059.39`，Standard Side Panel JS 真实执行及 Developer React/Vue Run/Stop 的 **macOS Chrome job PASS**；证据 artifact `r245-standard-and-developer-native-bc6dc46...` 内含 `r245-standard-chrome/acceptance.json`、`r245-developer-chrome/acceptance.json` 与原生截图。其 sourceHead 是实现提交 `bc6dc46a`（后续 `d61eea48` 仅改测试与 CI），**没有执行 R7.1 新 CDN @require 审核/跨程序共享场景** |
| Browser SDK R8 / Cookies | OUT_OF_SCOPE；未修改 |

**验收边界**：源码提交和模拟测试不是用户体验全链路关闭；只有受信 Chrome 回执、同包身份与实际网络/执行结果闭环后才能标记产品 PASS。

## R7.2 D02/D03 Chrome 真正用户操作验收驱动（2026-10-13）

- `tests/framework/page-dependency-r72-cft-cycle.mjs` 通过现有 CFT Runner 的真实 Chrome Side Panel 鼠标、键盘触发获取/审核/运行/保存，不伪造 Broker 审核与 Preview。
- `.github/workflows/r72-dependency-native-cft.yml` 使用 macos-15 Chrome for Testing 155.0.8059.39，Standard 和 Developer 分别构建/验证，运行 Node D02/D03 测试并保留原生 acceptance.json。
- 使用固定新库 `marked@15.0.12` Classic UMD，核对真实 CDN 来源、下载 SHA、真实导出返回值、Program A/B 不同批准锁、B SHA 复用和第二程序零新下载、两个 Page Candidate 的保存。
- 本提交仅为 **IMPLEMENTED_DRIVER**；后续根据每次 CI/job/acceptance.json 实际结果分别记 `CHROME_PASS`/`CHROME_FAIL`，CI 未验证之前不能写 PASS。整 Chrome 重启断网 D09、Controller 新 Classic D05、工具多库 D07、定时和云控 D10 仍未正式关闭。
- 用户 Mac 本地环境无法访问：`MAC_NATIVE_NOT_TESTED`。不能把 GitHub macOS CI 代替用户原生 Mac 验收。

## 2026-10-13 产品决策变更：自己开发脚本无需逐库人工审核（历史 R7.1 证据原样保留）

- **新产品规则**：用户自己编写或由 AI 为自己生成的脚本，在「开发」点击 Run 应自动解析、获取/复用、技术校验、固定 SHA/版本/依赖图并运行，不需要再点击“检查→获取→逐条审阅 SHA/许可证→批准锁→再运行”。旧的 `reviewId` / `approve` / `explicitUserAction` 状态与旧 CI 仅说明历史源码/测试事实，不能当最终 UX 成功。
- 程序 B 命中 A 相同已固定库时无需第二次**人工**审批；系统自动绑定新的 programId、Revision、world 锁，绝不自动继承 A 的站点/敏感操作权限。真正缺少 Chrome origin/站点权限仍走真实原生手势；安装、定时、云控授权确认的是程序能力/网站/数据范围，不是逐项库文件。
- SHA、来源、确切版本、依赖闭包、大小、私网/重定向限制、CWS/MV3、Authority、Stop/撤权/未知执行阻断全部继续自动严格执行；不允许用户下载 JS 进入特权 SW/Host，不得静默升级锁。
- **新增产品验收**：正常脚本一次 Run；新 Classic 和 ESM 在无额外库审批点击时真正运行库函数；A/B 的人工库确认次数=0、B 网络下载=0、技术锁不同；完全重启/断网、坏 SHA、拒绝 Chrome 权限仍行为正确。旧 R7.1 审核 Node 测试 PASS 不等于新 UX PASS。
- 以上最新规则以 `docs/framework/universal-dependency-runtime-usage-contract.zh-CN.md` 与 `docs/framework/prompts/goal-universal-dependency-runtime-r7.2-scenario-first-20261013.zh-CN.md` 为准；不修改上文任何历史提交 SHA、旧验收账本或运行结果。

## R7.2 Native / File-First 方案冻结与执行交接（2026-10-13）

**本段是文档合同更新，绝不代表底层代码或 Chrome 验收已完成。**

- 权威长期方案：`docs/framework/universal-dependency-runtime-usage-contract.zh-CN.md` 第 3.1 节，文档提交 `f86b40cb04f851c6350c4e1f289080c722354d15`。选择 Native API + File-First + SHA 内容共享 + 静态 ESM 必要编译；远程网页 `script.src` 非默认通用方案；本地 Blob script.src 只在对应工具 sandbox 中按适用政策受控使用。所有旧 `@require`/Controller/Tool 的边界以及网站和程序权限继续有效。
- 唯一执行 GOAL：`docs/framework/prompts/goal-universal-dependency-runtime-r7.2-scenario-first-20261013.zh-CN.md` 新 P0.2，文档提交 `824847a1df7c5103edcbd157bfc0650056303e53`。优先修改真实源码打通“Run 一次→自动处理新库→返回函数结果→A/B 复用 SHA→保存并离线复跑”，再推进 Controller、Tool、React/Vue、安装/定时/云控；不重新选择架构。
- **旧真实测试不能误当通过**：GitHub R7.2 工作流 `38359159942`（候选 `5e339c289a61f2710fec5d08f602498d736ecccf`）两个 macOS job 的依赖 Node 测试各 **27/27 PASS**，但当时 `npm run check` 因 `Unexpected web accessible resources` 失败，Chrome 运行步骤均 **SKIPPED**。最新 main 的 `scripts/verify-package.mjs` 已改变 Web Accessible Resources 的校验方式，但这**不构成**本轮 R7.2 现候选同包构建/Chrome PASS；必须按下一轮真实 CI 确认。
- `tests/framework/page-dependency-r72-cft-cycle.mjs` 当前仍以旧 R7.1 **人工多步审核**测 A/B，不证明新合同要求的“只点击 Run + 无逐库审批”。需改造其断言与真实 Chrome 驱动，且将手工流程的历史结果保留为限定证据。
- **当前证据结论**：DECISION_FROZEN / DOC_UPDATED；R7.2 新目标 D02–D12 的完整产品闭环仍 **NOT_TESTED / INCOMPLETE**（以各 case 独立原始证据为准）；用户 Mac `MAC_NATIVE_NOT_TESTED`；CWS `COMPLIANCE_NOT_CLOSED`。不能因上述文档提交或理论方案评分宣布 95+。


## R7.2 新实现及候选证据交接（2026-10-13）

本节优先于上文 R7.1 的「逐库人工审核」及旧版 D02/D03 多按钮 CFT 状态；历史日志与旧 SHA 保留，不用本节回写伪造 PASS。**本轮确实修改并推送了源码和原生验收驱动，不等于 CI 已通过。**

| 用户场景 | 已写入 main 的实现 / 驱动 | 当前验收 |
| --- | --- | --- |
| D01–D02 Page Classic 一次 Run 自动固定 | `a4b287891ae536ed46034cfaf7459c9913613fbe` 将 `captureForRun/resolveForRun` 接入原 Broker Manager；`b6db44391272d76e5d6c60eef4089bc580f6d67d` 将 CDN 来源权限申请连接至真实 Run 点击 | SOURCE_WIRED；新增 Node 与真实 CFT 未确认 PASS |
| D03 A/B 同库 SHA 字节共享、锁各自独立 | `tests/framework/page-dependency-r72-cft-cycle.mjs` 已取消旧多步人工审核验收，改用真实 Chrome 各点击一次 Run；`tests/environment/page-dependency-one-click-r72.test.mjs` 增加组件测试 | DRIVER_COMMITTED / NATIVE_PENDING；[D02/D03 macOS CI](https://github.com/shopable-ai/opendesk-browser/actions/runs/38383604136) 曾处于 QUEUED，以最新候选 job 和 acceptance.json 为准 |
| 无依赖脚本原有行为 | [Chrome 失败 38381758426](https://github.com/shopable-ai/opendesk-browser/actions/runs/38381758426) 确认无 `@require` 的普通/固定 Page 执行误遭 `E_DEPENDENCY_INSPECT_PENDING`；`350a499a59968ac54cd294fba1ee863129870570` 在现有许可链上修复，增加无依赖测试 | CHROME_FAIL_FOUND / CODE_FIXED / POST_FIX_CHROME_PENDING；不得以旧候选子步骤通过冒充新候选通过 |
| Controller / React / Vue HTTPS ESM 一键准备 | 复用现有 `page-component-remote.js` 自动固定图与原 Worker 编译器；`b7c80d53a9fb09118137d65bbebeb0997444d950` 新增静态根来源权限只读预热、同步 Run 授权与传递新域名安全阻断；`ae502f2a33ca90b8024471098ad50b481fb81878` 在首次自动下载时拒绝 `latest/main` 等未固定来源，保留旧锁离线读取 | SOURCE_WIRED / TESTS_COMMITTED / REAL_CHROME_PENDING |
| D05 原始三模块 `@vanillaes/csv@4.1.3` | `daf76f902650b54f3fa3ca8d209d70d58589f0a9` 新增 `tests/framework/controller-dependency-r72-cft-cycle.mjs` 接入 Developer 版真实 macOS CFT。通过真实 Side Panel Run → RunHost → Authority → Worker 验证上游 SHA、`count=2,total=21`、runId/resultId、二次无网络与保存 Revision | DRIVER_COMMITTED / CHROME_NOT_YET_CONFIRMED；目标结果不能写成实际原生输出 |
| D07 Side Panel Tool 多份 Classic 固定资源 | 已有 `package.js`、`bridge.js`、`build-sidebar-tool.mjs` 接入本地 SHA / Blob 顺序加载、onload/error；`sidebar-tool-multiscript-r72.test.mjs` 为模拟测试 | SOURCE_WIRED / TOOL_NATIVE_LIFECYCLE_NOT_CLOSED |
| Controller 新增 Worker-compatible Classic、D09 真正 Chrome 重启断网、D10 定时/云控 | 旧预装库与 Runner 仍保留，但全新 Classic 下载→Worker，以及完整重启断网/撤权/定时/云控同一固定 Revision，本轮无足够原始回执 | INCOMPLETE；不能用 Controller ESM 的 Node/Chrome 驱动代替 Classic PASS |

**验证分级与未完成事项：** 历史 R7.2 CI 27/27 Node PASS 只属于旧候选；新增 Node/Standard/Developer/Package/ZIP 仍以当前 SHA 实际 jobs 为准。`MAC_NATIVE_NOT_TESTED`（本会话不能访问用户 Mac），`OFFLINE_NOT_CLOSED`，`CWS_COMPLIANCE_NOT_CLOSED`。未知 Native effect、无权限、坏 SHA 等必须继续安全阻断。八维 95+ 为 `NOT_SCORED`，而非宣称达到。
