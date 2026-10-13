# GOAL：OpenDesk Browser Universal Dependency Runtime R7.2 — Scenario-First Final Closure

## 从旧 src-bex 独立 JS 的真实用法出发，完成 Classic / ESM / Controller / Page / Tool / 安装及真实 Chrome 闭环

**日期：2026-10-13。默认中文。执行优先：直接实施真实源码、测试、修复、提交。**

GitHub：`https://github.com/shopable-ai/opendesk-browser`
用户 Mac 本地：`/Users/shopme/Documents/workspace/opendesk-browser`
唯一可写分支：`main`。用户明确授权在安全、无并行冲突、必要验证通过时提交并推送 main。**不创建分支、Worktree、PR、不强推、不破坏性 reset/clean、不覆盖其他 Agent 的未提交改动。**

## P0 核心产品闭环与执行方式

**首要目标：用户或 AI 编写脚本，用户直接点击 Run，系统自动解析/获取/校验/固定第三方 JS，不强制人工审核库；只有真实 Chrome 站点或敏感能力、安装/定时/云控授权才需要相应用户同意。保存固定版本后无需 AI、npm、重建 Chrome 扩展就能反复执行。** 第三方库优先使用独立 Classic JS 文件；真的需要 import/export 时才做受控 ESM 编译。必须继续使用唯一已有的 Dependency Manager、Catalog、SHA 资产库、Host、Authority、RunHost、Program Revision、USER_SCRIPT 和工具沙箱，不创建第二套。

本轮不要再只输出架构或下一份 GOAL；先复核最新源码和实际证据，立即补足缺口。阶段执行不中途要求普通可逆操作的逐次批准；遇到同文件并行写入或本地目录无法访问，停止不安全写入并记录。不能用 GitHub Node/模拟 PASS 冒充 Mac Chrome PASS，无法访问 Mac 标记 `MAC_NATIVE_NOT_TESTED`。

### 一、必须先读的已冻结用户场景合同

1. `AGENTS.md`、`docs/framework/testing-guide.md`。
2. `docs/framework/universal-dependency-runtime-usage-contract.zh-CN.md`：**优先按 D01–D12 完整用户场景推进，不重新研究旧代码**。
3. `docs/framework/workstreams/universal-dependency-file-first-r7-20261013.md`、`docs/framework/workstreams/universal-dependency-runtime-r4-20261013.md`。
4. `docs/api/runtime-globals-and-preinstalled-libraries.zh-CN.md`、`docs/architecture/ui-layout-conventions-r27.zh-CN.md`、`src/ui/design-tokens.css`。
5. 关键实现：`src/ui/page-dependency-install.js`、`page-dependencies.js`、`script-editor.js`、`page-component-remote.js`、`page-component-preparer.js`、`src/scripting/user-scripts/dependency-manager.js`、`page-component-dependencies.js`、`execution-source.js`、`src/libs/runtime-contract.js`、`loader.js`、`src/libs/page-frameworks/controller-esm-linker-r4.mjs`、`src/sidebar-tools/bridge.js`、`src/ui/sidebar-tools/package.js`、`scripts/build-sidebar-tool.mjs`、`src/platform/host/controller-methods.js`。本任务不重复 Framework R8/R9 浏览器 SDK、Cookies 或 Time Review/Stay Focus 产品工作。

旧证据来源只在必要时查 `docs/contracts/source-snapshots/todo-src-bex/src-bex/` 和 `docs/contracts/source-snapshots/scrapyJsChrome/background-sw.js`；本轮不再通过遍历旧项目重做分析。

## P0.1 新冻结产品决策（优先于本文历史“每库审核”步骤）

- 开发中的脚本是用户自己写或 AI 根据用户要求生成的。**点击 Run 即用户的开发试运行意图**；禁止把依赖 SHA、许可证、传递模块和锁拆成“检查→下载→人工勾选→审批→再运行”的多个步骤。允许可折叠透明详情，不强制用户看。
- Run 自动检查资源来源/类型/确切版本、依赖图、SHA、字节大小、缓存和目标世界；缺失库可以在受支持的受控世界下按现有下载边界获取，自动生成对应 Program/Revision/world 固定记录。B 复用 A 同一 SHA 不需要再人工审批相同库，但不得继承 A 的网站/敏感能力授权。
- 真实缺少 Chrome 来源/网页权限时必须经用户手势请求；安装后允许定时/云控/外部系统重复执行时须确认**程序能力、网站、参数和结果范围**。不得取消 Authority、CWS/MV3 边界、坏 SHA/私网/重定向阻断或在特权 SW/Host 执行下载代码。版本歧义时才提示选择，不能悄悄用 mutable latest。
- **源码现实与目标严格分离**：R7.1 的 `page-dependency-install.js`、R4 的 `page-component-remote.js` 仍存在强制人工审批路径。先改造现有 UI/状态机/Manager 的调用方式，维持原子校验与锁，并补新单元 + 实际 Chrome 用户交互，不能宣称已经符合本目标。
- **优先验收**：无新增库和预装库均一次 Run；新 Classic 或 ESM 只 Run 一次（若 Chrome 需权限则仅原生弹窗），程序自动获取、校验、固定并运行真正第三方函数；B 同库无需新审批且 CDN 下载 0 次；保存/重启/离线成功，缺权限/坏 SHA/不兼容时安全阻断。

## P0.2 唯一实施路线：直接加载优先，不能误做 CDN script.src

本轮以 `docs/framework/universal-dependency-runtime-usage-contract.zh-CN.md` **第 3.1 节**为固定技术决策：Native / File-First、按执行世界装载固定原始字节、仅 ESM 必要编译。此前对 A（网页 CDN script.src）、B（所有库重新编译）、C（混合原生方案）的分数只是方案估计，**不代表源码已实现或 95+ 验收**。

**产品体验门槛：用户只点 Run。** 系统自动解析与复用预装、当前程序固定 SHA、跨程序相同字节或首次网络资源；自动生成每个 Program/Revision/world 技术锁，不再要求每个库单独“检查→下载→勾选 SHA→批准”。这不免除真正的 Chrome 权限、网站/敏感能力及安装/定时/云控授权。

**技术边界：** Page Classic 优先原 `chrome.userScripts.execute` + `USER_SCRIPT` + 已校验 `js:[{code}]`，Classic 不经 Babel；扩展包内真正存在的文件才可用 `js.file`。普通 `document.createElement('script')` + 远程 `script.src` 不能替代 USER_SCRIPT，不能默认注入 MAIN；Tool 的本地 Blob script.src 属既有 opaque sandbox，按序加载需要真实 onload/error 证据。Controller 继续受控 Worker，不能把远程第三方 JS 注入特权 SW；ESM 继续 Developer 固定 linker，Standard 不放大型编译器。对 CWS/MV3 必须按世界单独核查，不认定 Worker/Blob 自然豁免。

### 按用户目标实施的五道连续关卡（不能只写测试驱动）

1. **修复真正阻塞验证的环境问题。** 从当前 HEAD 和现有工作流复用证据开始：历史 R7.2 CFT `38359159942` 的 27/27 Node 通过，但当时 `scripts/verify-package.mjs` 报 `Unexpected web accessible resources`，**Chrome 被跳过**；最新 main 已可能修正，先核查文件/当前 CI 而非复写 Browser SDK 其他 Agent 修改。保留失败原件，对当前候选运行必要的 `npm run check`、定向 Node 和 Standard/Developer build/verify，再进入真正 CFT。
2. **先交付 D02/D03 Page 的真正“唯一 Run”。** 先改现有 `script-editor.js`、`page-dependencies.js`、`page-dependency-install.js` 的 UI/手势状态，再重用原 `dependency-manager.js`、`preview.js`、`execution-source.js` 和 SHA 资产库；禁止给项目加第二个依赖服务。缺 Chrome 来源权限时，`permissions.request()` 必须在真实 Run 点击的同步手势内发起；只读检查可预热。若因动态来源无法及时确认手势，则明确要求一次必要的权限操作，不能伪造或滥用该手势。新固定 Classic UMD 真实运行其原函数；B 自动用 A 的 SHA，CDN 新下载=0，但未获网站权限时 B 仍拒绝运行。**现存 `tests/framework/page-dependency-r72-cft-cycle.mjs` 是 R7.1 旧“人工审核”驱动，必须重写或新增 Run-First 断言，不允许复用其手工审批 PASS 当 D02/D03 成果**。
3. **Controller D04/D05 及保存语义。** 新 Classic 在原受控 Worker 运行，无网站 window/document 时才视为兼容；`@vanillaes/csv@4.1.3` 必须用真实上游三模块 ESM 返回 `count=2,total=21`，经过原 RunHost/Authority 得真实 Result；保存 Author Source/固定可执行资产/锁/Revision，区别草稿 Run 和已保存版本，检查 Stop/取消、重启离线及不同 Program 锁；CWS 适用性不确定时单列阻断。
4. **独立 Tool 多库 + React/Vue 额外依赖。** 仅扩展 `tool.config.json`、`scripts/build-sidebar-tool.mjs`、`src/ui/sidebar-tools/package.js`、`src/sidebar-tools/bridge.js` 与已有安装工具，不造新 Tool Host。验证两份固定 Classic 的 onload/error 加载顺序、实际界面交互、持久保存、卸载/停用/重启；React/Vue 用已有固定框架和审核图按需编译，受管 Stop 完整清理。
5. **正式安装、定时/云控及 D01–D12 验收。** 安装一次后只消费不可变 Program Revision，调度时禁止新 CDN 下载、依赖版本静默升级及重编译；检查整 Chrome 关闭重启/断网、坏 SHA、撤权、引用 GC、不同版本不串锁、unknown effect 不重放。输出 sourceHash、URL/版本/MIME/字节/SHA、A/B 锁、执行世界、下载与编译真实次数、runId/resultId、packageHash、Chrome 版本和原始结果。Node、CFT、用户 Mac Chrome、CWS 合规逐级标注，不能跨级。

**每关通过标准**是“用户实际怎样操作 → 真实源代码路径 → 程序结果 → 原始受信验证和精确候选 SHA → 剩余缺口”，不是新增演示 HTML、只增加 mock 测试、只写另一份 GOAL 或把实现提交等同完整交付。无同包证据标 `NOT_TESTED`；Mac 不可访问标 `MAC_NATIVE_NOT_TESTED`。仅在文件无并行冲突且必要测试成功时安全提交/推送 `main`，不创建工作树或其他分支。结尾按易用性、库覆盖、执行场景、缓存、安全、诊断、真实测试、架构复用八维给出**有证据的**分数，没有证据不得宣布 95+。

## P1 第一门槛：完成 R7.1 已实施 Page Classic 的真实 Chrome 闭环（先于新功能）

R7.1 的 `Page @require` 首次检查、获取、手工审核、锁、跨程序共享 SHA UI 已有源码与 Node CI；**这是历史接线，额外人工批准是要修复的 UX 缺陷**。严禁重建 Manager，优先打通 Run 自动准备。必须用真实 Standard/Developer 扩展 Side Panel 和官网/实际固定分发，证明：

- 用户/AI 源码引用此前未预装的 Classic UMD，主动点击 Run 后自动准备；**不要求先点“检查依赖”**，也不应在 Run 前主动下载；
- 如果 Chrome 缺少来源权限，由真实 Run 手势触发原生提示；之后系统自动下载、校验和固定程序 A 的锁，URL/字节/MIME/SHA/许可证详情可查、**无需手工勾选/批准依赖**；
- 在 `USER_SCRIPT` 真实执行库的原函数，返回固定可核验业务值，不用手写替代实现；
- 第二个 `programId=B`：不弹重复库审核即可复用 A 相同 SHA 字节，下载 0 次，A/B 各有自动固定锁；**不能继承 A 的网站/程序能力权限**；
- 真正关闭 Chrome、重新打开、断网后 A/B 保存的版本均能运行；SHA 损坏、撤销站点权限、锁缺失必须拒绝而不静默联网。

可先测试文件 `tests/environment/page-dependency-r71-ui.test.mjs`、`tests/environment/dependency-manager.test.mjs`，再使用真实 CFT/Chrome 自动化。`marked@15.0.12` 的 CDN 示例仅为候选，先核实 URL、分发格式、上游导出和许可证；若实际不存在就选另一个真实固定 Classic UMD，绝不伪造响应/版本/SHA/导出。证据包含 `programId`、`lockId`、`sourceHash`、`packageHash`、URL、MIME、下载次数、A/B 实际调用结果、tab/document、真实事件和回执。

只有 P1 真实 Chrome 有效，才投入后面广度扩展；因环境不可用时，至少完成可执行驱动与精确环境阻断，不能称产品闭环。

## P2 第二门槛：Controller 普通 Classic 与小型 ESM 的同一资源/授权系统

先复核是否已在新 main 实施，已实现则仅补缺失验证：

- **经典 Controller**：`async function main()` 直接访问词法 `page`/`params`、默认 `_`/`dayjs`，无需网络，不让用户传 `main({page})`，无网站 MAIN 全局。
- **此前不存在的 Classic JS**：应能在用户点击 Run 后经唯一依赖资源库自动校验、获取或复用并固定，在当前 Controller Worker 中使用受支持的 Classic API。资源字节与 Page 可共享，**但 WORLD=CONTROLLER、programId、sourceHash/Revision 必须由系统分别固定身份，能力权限独立，不能要求人工批准同一库**；不要把 USER_SCRIPT 锁当 Controller 授权，不能动态执行于特权 Host/SW。若某 Classic JS 依赖 window/document 或动态 eval，给出具体不支持诊断，绝不撒谎兼容。
- **真实 Controller ESM**：复用 R4 的固定 Babel/linker 和 `@vanillaes/csv@4.1.3` 真实三模块样例，必须返回 `count=2,total=21`；运行经过原 RunHost→Authority→opaque Worker，不能只 Node VM 演示。
- **保存语义**：保存 Author Source、编译后冻结执行资产与准确锁身份。区别“Run 当前可编辑草稿”和“Run 已保存 Revision”；后者不重新解析外网/选择新锁。测试 Save→关闭面板→重启 Chrome→离线 Saved Run、Stop、Result、撤权、A r1/B r2、重复运行 0 下载。
- Developer 小型 ESM 上限维持实际合同；Standard 不私自塞入 Babel，继续已有本地多文件受信构建路径。对裸包名无精确版本映射、错误导出、循环图、CJS/Node、CSS/WASM、动态 import 等明确诊断，不放松沙箱权限。

主要测试 `tests/environment/controller-esm-runtime-r4.test.mjs`，必须补原生 Worker、首次 Run 免库审批、实际下载/运行和保存重启测试。

## P3 第三门槛：Side Panel「工具」中的多固定资源

产品目标：AI 生成独立 HTML/CSS/JS 工具，工具项目可以引用额外 Classic/ESM 库；用户确认工具安装所需的程序能力/访问范围后通过「工具」独立运行，**不逐库审核 SHA**，**不需要用户 npm 或改扩展源码**。

- 只扩展原 `tool.config.json`/安装包/`src/sidebar-tools/bridge.js` 沙箱，必要时采用兼容旧 V1/V2 包的固定依赖资源清单/排序；**绝不创建第二个 Tool Host**。
- 已下载且由系统自动校验的 SHA 字节可免重复人工审核复用，但工具自己的 ID/版本/沙箱/权限仍要独立固定。旧单 JS 工具继续运行。
- 先测试至少两个固定 Classic JS 文件的加载顺序、缺失阻断、重开离线运行、Stop/关闭 iframe 清理；真正 ESM 工具先通过现有受信构建器生成工具自带固定资产，不隐式接受任意动态 import。
- 任何库和工具都不得继承 Controller 词法 `page/params` 或宿主 `chrome.*`；仅可用原 `OpenDeskTool`、受限 `OpenDeskSDK.browser`。不能以允许下载新库为由扩大 Browser SDK 权限或开启 unsafe-eval。

测试从 `tests/environment/sidebar-tools.test.mjs`、`tests/framework/sidebar-tools-native-session.mjs`、现有工具安装回归扩充。

## P4 第四门槛：Page React/Vue、安装、定时、云控，必须复用而非重造

- Page Classic 使用 `USER_SCRIPT`，原子拼接的失败终止、执行身份和 Stop 不得因“File-First”随意拆解。`chrome.userScripts` 的 `file` 仅指随扩展打包的物理路径，下载后 SHA IndexedDB 资产不能伪装为它；先用真实 Chrome 检查多个 ScriptSource 的语义，再决定是否切换，不要以“独立资源优先”作为安全降级理由。
- React/Vue 保留同一套固定运行时、ESM 图自动校验/缓存和受管生命周期。真实额外库参与 DOM/事件、Stop 后事件订阅/ShadowRoot/资源全部清除。
- 安装 Task/Program、定时、云控只能选用户已验证、安装、授权的固定 Revision，必须经过原 Authority/RunHost；禁止调度时网络更新依赖、重新编译旧程序或未经用户主动升级已安装程序而静默切版本。
- 旧 r1 仍能引用旧资产；新 r2 独立锁和安装批准；删除 B 不影响 A；缓存引用 GC 未安全实测前不删用户旧资产。
- 撤权、重启、失去回执、未知 Native effect 必须 fail-closed，不得自动重复真实网页动作。

## P5 测试、安全和性能验收（必须实际运行、保存证据）

按权威 D01–D12 逐项执行最小受影响测试：真实用户源码 + 精确库版本 + 原始文件/URL + 执行世界 + 每次网络次数 + 资源 SHA/文件大小 + lockId + Program/Revision + RunId/ResultId + 结果 + Chrome 版本 + packageHash。至少覆盖：

1. 首次 Run 自动获取/固定且无额外库确认；二次缓存零下载；跨 programId 库免重复审核、固定锁和敏感权限仍独立；不同版本不串锁。
2. Classic 真实导出、ESM 实际三模块函数、Page DOM、React/Vue Stop、独立 Tool HTML/CSS/JS 交互。
3. 关闭整个 Chrome→重新打开→断网→保存/安装版本、定时触发和云端投递的无网络运行。
4. SHA 损坏、无锁、私网/重定向、来源升级、CJS/Node、依赖顺序、缺页权限、版本/授权撤销、Stop、unknown-effect。
5. Standard/Developer 双构建和包校验；Standard 不带大型 Babel；加载字节、实际网络次数和缓存占用不可猜测。
6. 官方 Chrome MV3/User Scripts/Chrome Web Store 远程代码政策：按执行世界进行专门合规评估。官方参考 `https://developer.chrome.com/docs/extensions/reference/api/userScripts` 和 `https://developer.chrome.com/docs/webstore/program_policies`；不因沙箱/Worker 就自动宣布商店合规。

组件/CI PASS、CFT Chrome、用户 Mac Chrome Native、F3/ZIP 和 CWS 评估按证据等级分别登记。只能按当前候选与输入身份复用旧 PASS，不因切换对话全量重复跑测试。不能无证据自评分 95+。

## P6 真正交付、进度和提交

- 每阶段输出“用户实际怎样使用 → 真实源码调用链 → 修改点 → 实际测试证据 → 未完成项”。阶段一完成前不要将时间主要花在 UI 大改、增加 Catalog 库、ECharts 截图或写新的战略文档。
- 保持最简单的「开发」流程：AI/用户生成程序→直接点击 Run→系统自动取得、校验、缓存并固定依赖→真实返回结果→需要时保存/安装→离线复用；技术图和 SHA 作为高级详情，符合现有 UI R27 设计。
- 更新 **现有** `docs/framework/workstreams/universal-dependency-file-first-r7-20261013.md` 及必要的使用场景合同/测试入口，不生成平行且冲突的权威文档。保存每个 Case 的状态为 IMPLEMENTED / UNIT_PASS / BUILD_PASS / CHROME_PASS / MAC_NATIVE_NOT_TESTED / BLOCKED，说明具体候选 SHA 和回执。
- 修改前检查 main 和目标文件近期变更；推送前确认干净、安全与无覆盖风险。只提交有关文件，必要验证通过后直接 commit/push `main`；本地 Mac 不可访问说明限制，不能把 GitHub runner 说成用户 Mac 验收。

**最终回答首先回答：用户不修改扩展源码，是否已经在「开发」首次安装新的 Classic JS，是否能使用真实 ESM，并在工具/安装/定时/云控里重复使用；给出每个世界的最短真实用户代码、路径、安装步骤、证据级别、未关闭缺口与完整 commit SHA。八维分别评分（易用性、第三方覆盖、执行场景、缓存效率、安全、错误诊断、真实测试、架构复用），不因源码提交声称整体完成。**

**最终成功只有一个核心场景：用户/AI 写工具或任务→源码选择此前未预装的真实第三方库→只点击 Run，系统自动准备/校验/固定并返回真实结果→B 免库审批复用相同 SHA、0 新下载但能力授权独立→按需保存及授权安装→重启 Chrome 断网后原固定程序不重编译、不联网重复执行，Stop/撤权可靠。**