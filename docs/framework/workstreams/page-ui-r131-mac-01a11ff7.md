# Page UI R1.3.1：本地 Mac 验收快照与复用规则

核心链路及最终候选的连续 20 轮均 PASS。修复了 SDK 观察链、浮动宿主与失效文档清理、CSS 可用性诊断，以及 Demo 初始化失败时残留启动入口的问题。新增 6 个可重现回归。独立评分未达到每项 95 的目标；性能量化验收为 NOT_TESTED，面板在小视口中遮挡底层控件的限制保留。

本记录仅关闭本次 Page UI 范围；不代表整个浏览器自动化框架、独立最终 F3、ZIP 安装或 Native Agent 已验收。

## 后续会话先读：复用结论与重测边界（2026-10-09）

默认复用已有成功证据，先离线核对，后选择最小必要验证。原验收交付 SHA 为 `7e80fa8f702e10e1bcda432b7b6aec4c02f12c68`；本次核对 HEAD `0f9667bc3e95a4e17a11b495df9d2da8f3288bb0` 仅新增另一模块的 CI 修改。59 份原始证据齐全且哈希一致，143 个构建源码输入和 Demo 源文件/资产没有漂移。本次保存结论没有重跑安装、测试、构建或 Chrome。

- **可复用：**原受控标准页上的正式 Page USER_SCRIPT A→B→C/D、CSS/资源/表单、窄视口、真实 200%、20 轮、SPA/BFCache 和受管资源清理，以及各自输入未变的 58 项定向和 353 项环境组件结果。引用原日期、原包与原证据级别。
- **不触发重测：**换聊天、经过时间、无关文档/注释/CI、无相关输入变化的 main SHA 更新。不要从 `npm ci`、全部构建、Chrome 启动或 20 轮重新开始。
- **按变化重测：**SDK 挂载/CSS/事件改动只测受影响场景；生命周期/退役/释放改动才重做对应压力循环。Demo/资产/编译器/锁文件改动先做相应校验与构建；实际扩展文件与完整草稿 JSON 均等同原字节且合同、环境一致时可复用原生证据。
- **入口或环境改变：**Sidebar、USER_SCRIPT 执行器、权限/world/CSP、launcher、Chrome 版本、fixture 或观察方法变化，先做影响分析，再测对应真实链路；不把旧包 PASS 自动改为新包 PASS。
- **保持缺口：**面板遮挡限制、第三方框架页面与 CPU/heap 未测、Native Agent/F3/ZIP 未测及历史 Native Chrome 失败继续保留，不能借本轮 PASS 关闭。
- **档案与并发：**原始证据目录属于验收档案，不当作临时缓存清理。异机缺证据时先恢复原档案并核对哈希；另一工作流已有负责人时引用其记录，不争用 Profile、端口或 dist。

续接时另一工作流合入 `ea9670df73561dc3460730de167ffc3baaa5306b`，修改标准页 HTTP 场景 06 及其组件测试。当前完整 HTML 哈希为 `3ed786eb2189c92cf6ce85d39e164ea25e54edc4976afd3812a38aa008c692ad`，与原验收页不同；因此最新复用决定为 **AFFECTED_INPUTS**。离线逐字比较确认 head/CSS、Page UI 锚点工具栏与重绘处理器未变，扩展 143 个构建输入及 Demo 源码/资产仍未变。原记录继续绑定原 fixture，不能改称新 HTML 已真实验收。HTTP 项先查其负责人记录，只补受影响验证；静态比较不提升为新原生 PASS，也不自动重做 Page UI 的全部构建、环境测试或 20 轮。

机器可读规则在本专属 JSON 的 `reuseAgreement`；原始验收字段和证据哈希保留不变。后续报告只需写“复用了什么、哪些输入改变、需要哪些最小验证”，不另建重复账本或第二套校验器。完整入口见 [测试指南](../testing-guide.md)。

## A. Git、候选与资源身份

- 工作目录：`/Users/shopme/Documents/workspace/opendesk-browser`；全程使用现有 `main`，本轮没有创建分支或 Worktree。
- 历史起点：`b8a55f3cbeb5fe66091ac3fc2ecb60645b2f696e`。遵照用户追加指令，没有重复初始拉取；后续 main 新增本地缺失的提交时，仅获取对应新 SHA，没有重复 git pull。
- 提交前发现远端更新，已安全快进至 `996df38fd63f49630f2c8cad4c552b5f82462124`。`src/ui/tool.html` 的并行 CSP meta 修改与上游改动无重叠；三方比对后只合入上游片段，原 CSP 修改完整保留，索引随后归于上游内容。
- 后续最新 main `ce8f80d2c65b91c3d0c48b42bd83fc59143b3b04` 改动 Sidebar 初始化，安全合入后重新完成正式导入、核心链路、20 轮及全部补充原生验收。再合入 `841fa9e455fcef2e75caafaeb5d8b3dde0c928ac` 的 ESM 构建器改动，重新构建和回归；实际扩展包及完整草稿 JSON 与该原生候选字节一致，复用同一执行身份的证据，见 `latest-main-reuse.json`。
- 本轮源修复提交：`f2c794e8becd10a8e40e1e905efd37a3499e68fd`；Sidebar 集成提交：`4153a9794d0f34dbdf5cfb9be11c260a402c8768`。最后构建器集成提交及远端核对结果见交付回执。
- 本轮提交及提交后的本地/远端 SHA，见本地交付回执 `docs/framework/evidence/page-ui-r131-mac-01a11ff7/git-delivery.json` 和本报告所属 Git commit。
- 修改的代码与测试：`src/scripting/user-scripts/page-ui.js`、`src/scripting/user-scripts/page-ui-mount.js`、`examples/programs/page-ui-basic/src/main.js`、`tests/environment/page-ui.test.mjs`、`tests/environment/page-ui-mount.test.mjs`。另提交本专属 `.md/.json` 验收记录。
- 仓库已有其它 Agent 分支及 Worktree，均保留。并行 Native Agent / Controller / Sidebar Tools 的未提交文件、构建回执及未跟踪文件未纳入本轮提交；完整列表保存在交付回执，仍存在本轮范围之外的未集成工作。
- 实际 Chrome：官方 CFT `155.0.8059.39`，隔离临时 Profile，MV3，加载实际 `dist/development`。为了与并行 CFT 的 macOS 窗口输入隔离，使用该官方可执行文件的本轮专属应用副本，仅修改 app 身份，不修改浏览器二进制。
- 最终开发包：`04d50e90264ec26d714543b371c8e0bba32bc68a5d4a214e5f8a06827ce5a001`，测试前后文件指纹一致；包包含工作区已存在的并行修改，不能称为干净 main 的整包安装验收。
- 正式导入的生产模式草稿：`artifacts/programs/sample.page-ui-basic/0.1.0/r31-production/8a0590c46bd2ced1-ff07b77c87bf/program.opendesk-draft.json`。
- 最新构建器输出：`artifacts/programs/sample.page-ui-basic/0.1.0/r31-production/8a0590c46bd2ced1-7929c67cac73/program.opendesk-draft.json`。它与正式导入草稿的完整 JSON 字节相等，文件 SHA-256 均为 `06648da039a1c9514eee5a876cc97862aa43dc7b874d40c136f3f41cdebe3a58`；不是只比较 entry source。
- 冻结执行源码 SHA-256：`8a0590c46bd2ced15fc8116f9ea3535d89401daddcc210248c021ef0c93beb14`。正式回执均核对这一身份，未粘贴或替换 SDK 执行代码。
- 唯一标准页：`http://127.0.0.1:43217/demo-form.html`，HTTP 与最新仓库文件的 SHA-256 均为 `287f14ad90cadbe31df1df050ed184648824f2f9e287a5363b6c6783a3b715b5`。43111、43121 已占用，未终止其进程。
- 本轮所有 Chrome Profile 已由原有可信 launcher 删除；最终 `cleanupStatus=PASS`、`profileRemoved=true`、`pidAliveAfterExit=false`、`residual=[]`。本轮 HTTP 43217 已释放，production 包和其它浏览器资源未触碰。

原始证据在本地 ignored 目录 `docs/framework/evidence/page-ui-r131-mac-01a11ff7/`。最新集成候选的原生证据使用 `native-integration-final/`，由最终构建字节比对绑定到最新 main；历史候选、失败、观察方法修正记录全部保留。本专属 JSON 记录了源码及最终原始证据文件的哈希；原始 Chrome Profile、个人数据和临时构建产物没有提交。

## B. 实际工程命令及结果

Node `24.16.0` / npm `11.13.0`，项目要求 Node `>=22.12.0`，未降低要求或添加依赖。独立 CFT 使用仓库现有可信 launcher / CDP；检查过 `dev:chrome` 的交互启动行为后采用隔离的可信启动路径。

| 命令 | 结果 | 本地日志 |
| --- | --- | --- |
| `npm ci --ignore-scripts --no-audit --no-fund` | PASS | `npm-ci.log` |
| `npm run check` | PASS，181 个文件 | `check-delivery-final.log` |
| 下列 7 个文件的 `node --test` | 58 PASS / 0 FAIL | `targeted-delivery-final.log` |
| `node scripts/validate-program-project.mjs examples/programs/page-ui-basic` | PASS，AUTHORING_VALID_NOT_PACKAGED | `validate-delivery-final.log` |
| `npm run build:program -- examples/programs/page-ui-basic` | PASS，构建字节身份 8a0590… | `program-ui-delivery-final.log` |
| `npm run build:program -- examples/programs/page-ui-basic --mode development` | PASS | `program-ui-dev-delivery-final.log` |
| `npm run build:program -- examples/programs/page-heading` | PASS，最新构建器重新实跑 | `program-heading-delivery-final.log` |
| `npm run build:program -- examples/programs/controller-title` | PASS，最新构建器重新实跑 | `program-controller-delivery-final.log` |
| `npm run build:dev` | PASS，40 个输出资源 | `build-dev-delivery-final.log` |
| 全部环境组件测试，排除独立 Native Chrome 文件 | 353 PASS / 0 FAIL | `environment-components-delivery-final.log` |
| 本轮早期整套环境尝试，含 Native Chrome 文件 | 341 PASS / 1 FAIL | `environment-final.log` |
| `git diff --check`（本轮 5 个代码/测试文件） | PASS | 提交前执行 |

定向命令：

```sh
node --test tests/environment/page-ui.test.mjs tests/environment/page-ui-mount.test.mjs tests/environment/basic-browser-page.test.mjs tests/environment/program-assets.test.mjs tests/environment/program-build.test.mjs tests/environment/program-project.test.mjs tests/environment/sidebar-project-demo.test.mjs
```

环境组件命令，明确排除一个独立原生模块，未将其算作跳过后通过：

```sh
node --input-type=module -e 'import {readdirSync} from "node:fs";import {spawnSync} from "node:child_process";const files=readdirSync("tests/environment").filter(p=>p.endsWith(".test.mjs")&&p!=="native-agent-chrome-real.test.mjs").map(p=>"tests/environment/"+p);const r=spawnSync(process.execPath,["--test",...files],{stdio:"inherit"});process.exit(r.status??1);'
```

早期整套尝试的实际命令为 `node --test --test-skip-pattern='real macOS Chrome' tests/environment/*.test.mjs`。文件模块初始化仍产生异步活动，最终报 `Actual Chinese stale-binding recovery hint timed out: status is not defined`。该失败没有删除或提升为 PASS；所属文件有另一会话的未提交修改，本轮不扩展修复范围。最新 main 的组件分母随上游测试变动而变化，保留早期 51/56/57/340/343/347 等日志，不混算不同候选。

构建成功仅证明字节生成。Page UI 的执行结论来自下面的正式 Sidebar 原生验收；原 Page/Controller 示例只有本轮构建验证，没有声称其原生任务安装通过。

## C. 真实 Chrome 矩阵

最新 main 将入口文案从“网页用户脚本 · 依赖与试运行 / 在当前网页试运行 DOM 脚本”改为“网页 JavaScript 试运行 / 在当前网页试运行”。本轮最终实控的就是最新入口，导入身份明确为 `Page · DOM 试运行 · src/main.js`。它是正式产品的即时 Page USER_SCRIPT 调试入口，不等同 Installed 自动任务或正式 Task 持久结果；没有使用 Controller“运行草稿”替代。

证据文件均位于本地 `docs/framework/evidence/page-ui-r131-mac-01a11ff7/native-integration-final/`：

| 项目 | 状态 | 直接证据及观察 |
| --- | --- | --- |
| 扩展加载 / Service Worker | PASS | `session.json`、`permissions-worlds.json`；实际 MV3 sw.js 正常响应 |
| Sidebar 正式导入及执行入口 | PASS | 原生文件选择器导入上述草稿；`final-core.json` 的 completed 回执及同一源码哈希 |
| USER_SCRIPT 许可与隔离 | PASS | 新 Profile 原生打开“允许运行用户脚本”；world 配置 messaging=false；回执明确 USER_SCRIPT、没有 MAIN/unsafeWindow；`getScripts()` 为空，未安装自动运行 |
| 原位按钮 | PASS | `final-core.json` A；3 个示例宿主，按钮独立 ShadowRoot，inline 位于原 toolbar，既有节点保留 |
| 点击真实页面标题 | PASS | A/B/C 的可信点击、标题反馈；`final-A.png`、`final-B.png`、`final-C.png` |
| A → B | PASS | 标准页“模拟区域重绘”真正替换区域；同一 host 转 anchored，reason=inline_target_rerendered |
| B → C | PASS | 仅移除受控 fixture 锚点；同一 host 转 floating，reason=target_disconnected，点击仍可用；无重复 click handler |
| D：文档失效与 pagehide | PASS | `document-invalid-observation.json`、`navigation-bfcache.json`；stopped / document_invalid 或 pagehide 清理，受管计数零 |
| D：明确挂载失败 | PASS | `explicit-mount-failure.json`；重复锚点使正式入口报错，hosts=[]，全部受管计数零 |
| CSS 不可用诊断与安全停止 | PASS | `css-disabled-observation.json`；disabled sheet 的 cssReady=false，css_blocked，全部清理 |
| 严格 CSP | PASS | `extra.json`；网页自身 style 被真实 CSP 拒绝，隔离 USER_SCRIPT 样式可用、点击和退出正常；不误判为 CSS 不可用 |
| CSS 隔离 | PASS | `compatibility-v2.json`；全局 button / 同名 class / 字体 / 根字号 / 深浅主题均未污染 ShadowRoot；`css-isolation.png` |
| 原网页按钮及表单 | PASS | 可信鼠标、浏览器原生文本输入及提交；原有计数正常，UI 点击不增加提交，不导航 |
| 位置、滚动及尺寸 | PASS | 320/400/600/1280 CSS 视口、滚动、宿主/锚点尺寸变化、隐藏锚点与边缘；`viewport-*.png`。窄视口为真实 CFT 的 CDP viewport，不宣称 Mac 物理窗口宽 320 |
| 200% 页面缩放 | PASS（有界面限制） | 原生 Cmd+plus 与 AX 明确 200%；`zoom-200.json/png`。需先关闭覆盖底层控件的示例面板，再操作原位按钮及网站重绘 |
| PNG 与 CSS 资源 | PASS | 实际 stylesheet、PNG complete/naturalWidth；坏图片的 imagesReady=false；`compatibility-v2.json` |
| 连续 20 轮 | PASS | `lifecycle-20.json/log`：每轮 3→2→3→anchored→floating→0，原生点击、同一实例及 handler 唯一性 |
| SPA URL / 深层 DOM / 父链迁移 | PASS | `lifecycle-edge.json`、`extra.json`；pushState 不重建实例；深层移除可安全浮动，祖先整体迁移后的新链也可检测 |
| BFCache | PASS | `pagehide.persisted=true`、返回 `pageshow.persisted=true`，均 isTrusted；返回后 UI 保持已清理状态，不自动重放；`navigation-bfcache.json` |
| 再执行同一任务 | PASS | `extra.json`；旧 named world 的实例和资源全退役，新实例数为 3，完全退出后 0 |
| 受管资源清理 | PASS | 20 轮及最终退出 MO/RO/listener/timeout/interval/RAF/URL 均为 0；额外实际分配 Blob、managed interval/timeout/MO，退出后 URL 被 revoke，fetch 拒绝 |
| 本轮浏览器与端口清理 | PASS | `cleanup.json` 和上一级 `http-cleanup-final.json`；原有其它端口、Profile 不动 |
| React/Vue/Angular/Svelte 专门网页与第三方网站 | NOT_TESTED | 本轮按指定唯一标准页验收，不外推框架专用结论 |
| CPU/堆内存量化压力基准 | NOT_TESTED | 原生资源账本有证据，未测完整 CPU/heap 基准 |
| Native Agent macOS 握手 / 全框架 F3 / ZIP | NOT_TESTED | 不属于本次 Page UI 范围，未假造 native ack |

资源证据来自实际 USER_SCRIPT realm 中对原生 API 的被动记录：真实创建与 disconnect/remove/cancel/revoke，而非仅数 DOM。记录器保留原生调用及回调，不生成 UI，不调用 main，不伪造点击或回执。使用条件断点确保在未改动的正式程序前安装记录器，随后关闭 debugger。测试监听器与测试用 references 不计入 SDK 受管账本，关闭隔离 Profile 时一并回收。

初始被动注入的时序竞争、CSP“必然阻止扩展样式”的错误测试假设，以及小视口被面板覆盖的首次点击均保留失败记录。修正了观察方法与点击命中检查后重新跑完整最终候选，未用这些失败候选代替最新 PASS。

## D. 缺陷、根因与修复

| 缺陷 | 根因及最小修复 | 覆盖 |
| --- | --- | --- |
| 深层祖先移除后实例脱离 DOM 而资源残留 | 原观察只覆盖 3 层；改为目标及宿主完整父链的直接 childList，包含 Document 边界，不用 subtree 或全站扫描 | 失败回归 → PASS；真实深层 SPA 移除 → floating |
| 祖先整体迁移后遗漏新父链 | 原 target/host 仍 connected 时没有更新观察集合；迁移后重建集合 | 新回归先 FAIL 后 PASS；真实迁移及移除 PASS |
| 浮动宿主被删除或根文档失效后资源残留 | floating 阶段原本停止观察；保留仅检测自身宿主及文档边界的观察，失效时记录 stopped 原因并 destroy | 两个回归；实际 root / floating host 移除全部归零 |
| disabled CSS 的诊断仍 ready；默认浮动实例未检查 CSS | cssReady 加 disabled 判断；所有实例进行一次有界 CSS 检查，仅 opt-in mount 使用可见性降级 | 回归及实际禁用 style → css_blocked 清理；严格 CSP 可用时保持正常 |
| Demo 明确挂载失败留下启动入口 | launcher 先创建，inline preflight 异常越过后续清理登记；提前登记统一 dispose，用 try/catch 回收后再抛原错误 | 新增 Demo 实际源码回归先 FAIL；正式 Sidebar 受控重复锚点由 hosts=1/MO=1/listeners=3 修复至全零 |

没有新增第二套 SDK、架构层、框架适配器、依赖、权限或自动化安装。CSS 检查是一次启动后检查，不声称持续监测后续任意 CSS 改写。

## E. 独立证据评分

Hume 只读审阅源码及原始证据；Volta 独立审阅差异，未发现阻止提交的 P0/P1。两者均不是独立最终 F3，不将只读审阅提升为独立原生执行。主验收单独核对了 launcher 清理回执；评分专家未独立确认该回执。

| 维度 | 分数 / 状态 |
| --- | --- |
| 原位按钮可靠性 | 95/100 |
| Shadow DOM 隔离 | 96/100 |
| 网站功能兼容性 | 85/100（标准页内已实测；框架专项及第三方网站未测） |
| 自动降级和恢复 | 94/100 |
| 生命周期管理 | 96/100 |
| UI 位置与交互 | 86/100（小视口面板遮挡限制） |
| 性能与维护成本 | NOT_TESTED（有资源释放和维护范围证据，无 CPU/heap 量化基准） |
| 权限和安全边界 | 88/100（本轮隔离/许可/本地网络证据；非完整安全审计） |

没有人为补足至 95。评分只对应受控标准页范围，不能外推全站、全框架或全部威胁模型。

## F. 遗留项

- Page UI / Demo：小视口及 200% 缩放时，打开的示例面板会覆盖底层网页控件；关闭面板后可正常操作、重新打开与退出。本轮保留这一实际界面限制，不扩展通用布局管理器。
- Chrome / 验收覆盖：没有真实第三方框架页面及完整性能压力基准。BFCache 与本轮隔离 Profile 本身无剩余 blocker。
- 仓库其它模块：Native Chrome 测试文件产生独立异步 `status is not defined` 失败，保留原始日志；Native Agent macOS 握手没有在本轮复测，不能声称已修复或当前仍失败。并行未提交工作保留原状，未据此扩大 Page UI 修复。
