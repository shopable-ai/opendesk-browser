# Sidebar 自定义工具 R1 · Mac 验收账本

本工作流按用户 2026-10-09 的明确授权，在现有 main 上实施独立修复，不建立开发分支。共享工作区其他对话的源码、暂存内容、合并状态及原始证据均保留。源项目只读；没有新增依赖、发布或 push。

当前结论：**整体验收为 NATIVE_NOT_VERIFIED；最新纯 main 完整测试为 FAILED（355 tests / 354 pass / 1 fail / 0 skip）**。失败项是真实 Native 权限审批等待超时；随后及时观察的专项重试遇到 Mac 锁屏，无法操作原生弹窗，未绕过审批。不能宣称五项均达到 95/100 或最终验收合格。源码提交 `7e80fa8f702e10e1bcda432b7b6aec4c02f12c68` 的 GitHub CI 实际为 8 个 workflow 成功、1 个 Native Agent workflow 失败；该 CI 的 CFT 布局缺陷已经本地复现和修复，修复提交 `0f9667bc3e95a4e17a11b495df9d2da8f3288bb0` 尚未在远程运行。

证据根目录：`docs/framework/evidence/sidebar-tools-r1-mac-01a11fa4/`。每份旧失败、候选构建回执、浏览器生命周期、观察器修正和截图都保留。`candidate-closeout.json` 描述历史工作树候选；`pure-main-closeout.json` 与 `production-delivery.json` 记录纯提交快照及实际 dist 交付；`evidence-index.json` 记录原始文件的逐项 SHA256。包含他人暂存内容的保全补丁仅留本地，不纳入本轮提交。

## 修复及根因

| 文件 | 真实缺陷或边界 | 修复与回归证据 |
| --- | --- | --- |
| `src/ui/sidebar-tools.js` | 异步请求排队后仍可能使用旧窗口；写入完成与卸载删除未建立屏障；不同面板字段更新可能互相覆盖 | tool Web Lock 持有到实际存储提交；锁内重新核对实例、工具目录和包内容；安装/卸载按 tool→catalog 顺序锁定。`host-before.log` 记录旧源码失败，host 8 项回归通过；真实双面板不同字段保存、排队请求与卸载已通过，已进入 Chrome I/O 的写入竞态仍未原生验证 |
| `src/ui/sidebar-tools.js` | Chrome storage 返回属性顺序变化，整包 JSON.stringify 比较误判合法工具已更新/卸载，真实中文保存失败 | 按验证后 schema 内容比较；键顺序变化不撤权，JS/能力变化仍撤权。`property-order-before.log` FAILED，`property-order-after.log` PASS；真实保存和重启恢复见 native-final3 |
| `src/ui/sidebar-tools.js`、`src/ui/tool.html`、`scripts/verify-package.mjs` | 工具导航后可能重发实例授权；宿主缺少子 frame 导航边界 | 二次 load 关闭旧实例，不重发 token；宿主增加并精确校验 `frame-src 'self'`。真实 HTTP 导航 enforce、服务端零请求，以及 about:blank 导航关闭有原生证据 |
| `src/native-agent/service-worker.js`、`src/native-agent/settings.js` | nativeMessaging 已批准但旧 Worker 的 Native API 绑定未刷新，错误说明不清楚 | 返回 requiresReload，给出结束任务后手动重载扩展的中文说明；不自动重载、不变更权限/RunHost/ledger。桥接 22 项与真实 Host/CLI、Worker 更替、撤权通过 |
| `tests/environment/native-agent-chrome-real.test.mjs` | 原生驱动异步读取遗漏 awaitPromise，把 Promise 对象误当授权结果；测试 profile 的 Host 安装位置不一致 | 等待实际 ok/enabled、真实 permission；使用独占 profile Host；精确停旧 Worker 并确认新 target/API；保留旧失败。历史工作树完整测试记录 permission/Host/CLI/revocation PASS；最新纯 main 的审批因环境条件失败，不提升为当前 PASS |
| `tests/environment/sidebar-tools.test.mjs` | 工具包路径边界缺少回归覆盖 | 补充 traversal、symlink、资源预算和重复资源失败用例，不放宽 packer |
| 三个 `tests/framework/sidebar-tool*.mjs` 驱动 | 需要可追溯的经典 JS 框架编译、受控 Chrome 生命周期及真实输入观察 | 编译仅用既有本地依赖；Input 实际命中且 isTrusted、完整值相等；CSP eval 显式禁止 DevTools 绕过；时间戳回执保留本次事件。旧累计点击记录仍保留，派生说明见 closeout-observer-correction.json |
| `.github/workflows/native-agent-r1.yml` | setup-chrome 的 macOS 安装路径丢失 `.app` 外层，renderer 无法初始化 Mach rendezvous/sandbox，两个架构 CI 都在 about:blank 诊断失败 | 复制完整原有 bundle 为真正 `.app`，cmp 校验 Info.plist 和可执行文件字节相同；同机扁平路径 FAIL、恢复路径 PASS，最终 workflow shell 实际通过；没有关闭 sandbox、改变权限合同或跳过测试 |

## 工程检查

| 操作 | 已执行结果 | 原始文件（证据根目录下） |
| --- | --- | --- |
| `npm ci --ignore-scripts` | CI_PASS；lock/dependency 清单没有本轮修改 | npm-ci.log |
| `npm run check` | CI_PASS，177 个 source/test/build 文件及固定入口、严格 CSP、MIT 检查 | check-closeout2.log |
| `npm test` | **最新纯提交执行 FAILED：355 tests / 354 pass / 1 fail / 0 skip**，Native 权限审批超时 | pure-main-7e80fa8f/test.log、test-result.json；专项重试 2 / 1 / 1 / 0，Mac 锁屏；历史工作树 test-final7 为 342 / 342 / 0 / 0，不能替代本行 |
| `npm run build` | CI_PASS，构建过程无 source drift | build-production-final5.log、build-final5/build-production.json |
| `npm run build:dev` | 本轮早期实际执行 CI_PASS；随后 development 交给 Page UI 工作流，未争用重建 | build-dev-final3.log、build-dev-final3/build-development.json |
| `npm run verify` | CI_PASS；production/development 均通过实际包检查，但候选身份分别记录 | verify-final5.log |
| `npm run build:sidebar-tool -- examples/sidebar-tools/quick-notes` | CI_PASS；JSON 含 HTML、CSS、经典 JavaScript、data PNG 本地资源 | quick-notes-final.log、tool-fixtures/quick-notes-v1.0.0.opendesk-tool.json |
| 纯 main `check` / `build` / `build:dev` / `verify` / `build:sidebar-tool` | CI_PASS；独立 git archive 快照、既有 node_modules 只读复用、无他人未提交输入，构建过程 source drift 为空 | pure-main-7e80fa8f/ 下对应日志及构建 receipt；production 实際交付后再次 verify 通过 |
| GitHub CI | **FAILED**：源码提交 8 个 workflow 成功、Native Agent workflow 失败；修复提交尚未远程执行 | github-ci-observation.json、github-native-ci-log-{0,1}.json；[失败 run](https://github.com/shopable-ai/opendesk-browser/actions/runs/37923619450) |

Native CI 的两个 macOS runner 均在 renderer 初始化失败，尚未进入权限审批；这与本机锁屏导致的权限失败是不同原因。本机对照只改变 `.app` 外层路径，原始可执行文件与 Info.plist 保持逐字节一致。`ci-flat-bundle-before.log` / `ci-restored-bundle-after.log` 保存 FAIL→PASS，`ci-bundle-workflow-exact.log` 保存最终 shell 实际通过。vendor CFT 自身严格 codesign verification 返回 1，诊断原文保留，**不声称完整 sealed signature 验证通过**；最终 workflow 用 cmp/hash 保证既有 vendor 字节未被改写，没有新增签名豁免。

`npm-audit.json` 保留 3 个既有开发依赖告警（high serialize-javascript、moderate terser-webpack-plugin、low webpack）。没有运行强制 audit fix 或新增依赖，也没有把这些告警写成已修复。

## 原生验收

真实 Mac Chrome for Testing **155.0.8059.39**，revision `3ff7ac5a9224be9156d7f8703a06e22890aafd34`。仅操作本工作流独占 profile；CFT 原始可执行文件与 UI 专属副本 SHA 相同，仅副本使用独立 bundle ID 防止多个 CFT 的 UI 错绑。没有关闭 sandbox 或降低 CSP。启动、整浏览器退出、同 profile 新进程、profile 删除均有 launcher 原始记录。最早 native/cleanup.json 的 FAIL 保留，虽已删除 profile、residual 为空，仍不改写为 PASS。

| 验收项 | 状态及实际范围 | 证据 |
| --- | --- | --- |
| 我的任务／发现／开发；原草稿保存、运行、停止、结果、历史 | NATIVE_PASS（所列 case）；纯 main 包确认完整输入与唯一真实 Save、成功/停止各 1 个真实 run、结果自身 revision/sourceHash 及 released | native-isolated-proposal/task-and-save-verdict.json；历史 Task v1 流程见 native-final3/task-records-after-uninstall.json |
| 选择 JSON 不自动安装/执行；确认后新增选项卡，主动打开才运行界面 | NATIVE_PASS | native-final3/selected.json、installed.json；native-main-final5/selected.json、final-tool.json |
| HTML/CSS、本地图片、当前普通网页 title/URL | NATIVE_PASS；图片真实加载 naturalWidth=1，按示例自身白色 PNG 解释 | native-final3/installed.json；native-main-final5/final-tool.json |
| 中文保存、关闭重开恢复 | NATIVE_PASS；纯 main 包又做真实输入/保存及 20 次销毁重建恢复 | native-isolated-proposal/cycles-20.json、last-input.json；历史 native-main-final5/final-tool.json |
| 整浏览器退出并用同 profile 重启恢复 | NATIVE_PASS，绑定 native-final3 精确包和记录；不能提升为之后整包全部通过 | native-final3/launcher-tools-r1-restart-verified.json、restart-persistence.json、restarted-restored.json |
| 工具更新、缩减能力、恢复本地数据 | NATIVE_PASS（显式安装更新及新实例）；旧实例在延迟事件/在途竞态中的真实覆盖未完成 | native-final3/update-selected.json、updated.json、capability-revocation.json |
| 返回任务列表、跳转已安装任务且不自动启动 | NATIVE_PASS；已安装 readonly Task v1 的真实完成/停止保留，跳转前后实际 runId 集合未增加 | native-final3/before-task-open.json、after-task-open.json、task-completed.json |
| 卸载只删除对应目录/数据，不影响其他工具和任务记录 | NATIVE_PASS（所列快照）；纯 main 新增真实排队 SDK 写入后 UI 卸载、双 frame 退出、目录/数据保持删除；已提交到 Chrome I/O 的竞态未验证 | native-isolated-proposal/queued-uninstall-verdict.json、task-and-save-verdict.json；其他工具已安装数据保持见历史 native-final3/uninstall-isolation.json |
| sandbox 无 runtime/tabs/storage 特权 API，动态 eval 被实际 CSP 拒绝 | NATIVE_PASS | native-final3/security.json、native-main-final5/security.json |
| 跨 iframe、错误实例/工具 ID、旧实例重放、未知能力、非法存储 key | NATIVE_PASS（所列具体消息攻击）；合法桥接入口真实返回正确中文错误 | native-main-final5/security.json |
| 伪造 payload namespace/toolId 不能越权 | NATIVE_PASS：历史实际其他工具数据读取拒绝；纯 main 带伪造 toolId/namespace 的 SDK 写入只进入 caller 自身 namespace，不建立另一 namespace | native-final3/namespace-isolation.json；native-isolated-proposal/namespace-write-isolation.json（该 profile 另一 namespace 本来不存在，不声称其已安装数据在本次写攻击中被重验） |
| 网页导航、另一个真实浏览器窗口、业务页断网、本地保存与恢复在线 | NATIVE_PASS（业务 tab 网络断开，非整个 OS 断网）；旧侧栏仍绑定自身窗口 | native-final3/windows-navigation-offline.json |
| 工具 iframe 的 HTTP 导航及再次 load | NATIVE_PASS；真实 enforce、HTTP 服务端零请求，二次导航关闭 | native-final3/navigation-security.json、navigation-security-cleanup-fixed.json |
| UI sandbox 没有削弱计算 sandbox 的内联样式、data 图片、blob script 限制 | NATIVE_PASS；对应计算 sandbox 字节在之后候选仍一致；静态校验全部指令 | native-final3/computation-csp.json、candidate-closeout.json |
| 连续关闭/打开 20 次及事件/DOM 计数 | NATIVE_PASS；pure 9e19 包 GC 后 documents 1、nodes 1082→1080、listeners 76→75，关闭后工具 iframe 0；旧 final5 为 1122→1120、77→76。均不宣称零堆泄漏 | native-isolated-proposal/cycles-20.json；历史 native-main-final5/cycles-20.json |
| 400、600 CSS px 真正嵌入 Side Panel | NATIVE_PASS，限定旧工作树 final5 候选；实测宿主 400/600、工具 354/554，根无横向溢出，中文真实保存。pure 9e19 的整包 400/600 未重验 | native-main-final5/layout-400.json；native-main-final5-width600/layout-600.json |
| 320 CSS px 真正 Side Panel | NATIVE_NOT_VERIFIED；CFT 当前原生侧栏夹到最小 360。360 时工具视口 318 可用，但不能代替 320 的宿主验收 | native-final3/width-check.json、layout-360.json；官方源码约束见下文 |
| 浏览器 200% 缩放 | 网页 200% 已真实执行且侧栏可用；**工具自身 200%：NATIVE_NOT_VERIFIED**，host/tool DPR 仍为 2、网页 DPR 为 4 | native-final3/zoom200.json、zoom-metrics.json |
| React＋Tailwind、Vue 预编译经典 JS/静态 CSS 的安装和运行 | NATIVE_PASS（native-final3 精确候选）；真实计数 0→1，Tailwind 蓝背景 rgb(37,99,235)，API 隔离 | native-final3/react-framework.json、vue-framework.json；tool-fixtures/ 中保留确切产物及许可证 |
| 官方 JSX/TSX/Vue SFC/Tailwind 源码直接编译导入 | **NOT_SUPPORTED**；本轮是验收用本地预编译，不是已接入官方编译器，也不表示所有框架特性支持 | tool-fixtures/compiler-report.json、sidebar-tool-framework-build.mjs |
| Native Messaging 的真实 permission、Worker 更替、Host/CLI、撤权 | 历史工作树 NATIVE_PASS；**最新纯 main NATIVE_NOT_VERIFIED / 执行 FAILED**，审批超时后重试因 Mac 锁屏不能操作弹窗 | test-final7.log 的真实历史记录；pure-main-7e80fa8f/test.log、native-retry.log |
| 两个真实 Side Panel 并发不同字段写入 | NATIVE_PASS，10 对真实 opaque iframe SDK 并发请求、20 个字段全保存；两 host、两 Chrome window 确认；不是同 key 冲突，也不是 20 次 Native UI 输入 | native-isolated-proposal/two-panels-storage.json、two-panels-window-observation.json |
| 旧实例延迟 onChanged 撤权、已经进入 Chrome I/O 的写入卸载 | CI_PASS 组件回归；**NATIVE_NOT_VERIFIED**，不能用前面的排队请求提升 | sidebar-tools-host.test.mjs；read-only-review-queued-uninstall.json |

纯 main 的排队卸载 case 用真实 Web Lock 暂停队列，工具调用公开 `OpenDeskTool.request("storage.set")`，实际宿主记录 iframe WindowProxy 来源；不 mock Chrome storage 或宿主 handler。用户原生点击和确认卸载后 caller iframe 即刻为 0，释放锁后两 host 的 iframe 均为 0、目录及 namespace 保持删除。驱动 arm 后若在显式 release 前失败，需释放测试锁或关闭所属 panel/window；本轮实际成功 release，最终整个专属浏览器退出且 profile 删除，cleanup.json 为 PASS，不遗留测试锁。

两次双面板观察器失败也保留：Chrome runtime context 的 windowId 返回 -1，不能据此判断两个真实窗口相同；OOPIF 不在所读 Page.getFrameTree 的 childFrames 中，后续按实际 parentId/parentFrameId、host document 和 chrome.windows.getCurrent 的不同 windowId 核实。任务派生结果只统计带 runId 的 2 个真实 run，不把可变 shared host-slot 当作第三个任务或要求其在后续运行中保持不变。这些是观察方法更正，不是重写旧失败回执。

Chrome 当前最小宽度及边框换算取自该 revision 的 [side_panel_entry.h](https://github.com/chromium/chromium/blob/3ff7ac5a9224be9156d7f8703a06e22890aafd34/chrome/browser/ui/side_panel/side_panel_entry.h#L36) 和 [side_panel.cc](https://github.com/chromium/chromium/blob/3ff7ac5a9224be9156d7f8703a06e22890aafd34/chrome/browser/ui/views/side_panel/side_panel.cc#L353)。400/600 测试在本工作流 Chrome 完全退出后设置专属 profile 的原生宽度偏好，再真实重启并测量；不是改产品 DOM/CSS 来伪造尺寸，也不报告原生拖动手柄已通过。

## 候选身份及可复用边界

native-final3 整包为 `ce3b971e92917b7e479ba8baa692af494c7ac2ba88f83fbc7de8bf3b02c24a69`；final4 为 `63c5dd8020b8211ccfde52e988a7fcc82aed06ad2ba9572dced6b3a2cb3a8d4e`；工作树 final5 为 `6dbe36ee657994dd8906b76f69893d2e7f767c5a08f6f7da2659a5e7cfc82df1`。各 build/session 原始文件包含逐路径字节 SHA，不能因元数据更新将旧整包验收提升。

final5 新增重验宿主 UI、400/600、中文存储、攻击消息、20 次重建、原草稿运行/停止及 Native Agent。与 final3 相同的独立 sandbox/bridge 和计算 sandbox可按对应字节复用。旧候选上的更新、卸载、整浏览器重启和完整 Task v1 流程仍按旧身份列示。final5 含其他对话两份未提交控制器输入，**不代表纯提交 main 的整包验收**。

纯源码提交 `7e80fa8f702e10e1bcda432b7b6aec4c02f12c68` 的 production 包为 **`9e190a738a1e06a179213a04dab035d83b00f4f72b043c227b2d9151ef9b3f94`**。隔离 proposal 与该 git archive 构建逐文件完全一致，因此 `native-isolated-proposal` 虽使用历史目录名，实际浏览器加载包字节与纯 main 一致。该包已交付本地 dist/production；旧 final5 完整备份保留在专属临时目录，其他对话的 dist/development 未触碰。后续 CI-only 提交没有改变任何 product inputs。纯 development 包为 `657c6771f10a7774f7abfe75742c530789ffa34f4085151e6dcc6e045c394f9a`，构建在独立目录，不冒充共享 development 产物。

同步收尾时，远端 main 新增测试页 axiosx 提交 `ea9670df`，本地另有 Page UI 验收文档提交 `d27ba52a`。本轮用合并提交 `62590ced93e0b42fe8776b8f980ce6457309ba7b` 保留两侧历史，未 reset/rebase，也未更改他人未提交和未跟踪文件；合并的测试页面定向验证 **17/17 PASS**。从源码候选到该合并提交，src/scripts/manifest/package/lock/wxt 等 product inputs 仍无差异，故无需为文档和测试页提交重复构建或提升旧整包结果。355 项完整测试仍明确绑定 7e80fa8f，不推算合并后的总测试数。

与 final5 的变更为 sw.js、ui/tool-shell.js；其余 24 个文件的精确相等列表见 pure-main-closeout.json。当前 pure 包新原生证据包括安装门禁、中文存储、消息攻击、20 轮关闭重开、真实 360 侧栏、双面板并发与排队卸载、真实任务完整保存/完成/停止。400/600 截图及整浏览器重启、框架预编译运行仍绑定各自旧包，只能按相同具体输入复用，不能升级为整个 pure 包完整验收。

canonical URL 始终为 `http://127.0.0.1:43111/demo-form.html`。已有服务器 PID10400 属于 sidebar-demo-r3-01a11fba 工作树，本轮只读复用；实际 HTTP 字节 SHA `e34875d26855e4d869ae6a8a5b36ffc702cd70efe135f6846eff8fbbf6c05a3c` 与本轮读取时仓库 fixture `e542180c021506002454a326aee74df3d33639a4f2481dc9ef131cbc55442765` 不同，保留 canonical-served.html 和 identity。上述 title/URL/只读任务不依赖两份 fixture 的新增差异，不将服务页声称为当前仓库文件字节一致。

## 质量及余项

本轮证据限定评分：功能 94、安全 94、视觉 90、生命周期 94、开发体验 92；目标均为 95。评分是工程判断，不是产品进度百分比或测试数量换算。所列关键消息/CSP 攻击未发现残留失败，但未知原生竞态、视觉缺口和候选身份差异仍限制最终结论。

```text
Sidebar 自定义工具 R1
  工具包与安装更新卸载：实施已修复；所列原生功能已证实；整包身份收敛见候选记录
  实例与存储边界：组件回归通过；消息攻击、双面板不同字段并发、排队卸载原生通过；已提交Chrome I/O及延迟撤权未验证
  生命周期：当前候选20轮通过；旧精确候选整浏览器重启通过；不声称零堆泄漏
  原任务与 Native Agent：pure包草稿完成/停止通过；Task v1旧候选通过；pure包Native权限需Mac解锁后专项复验
  视觉：pure包360通过；旧final5候选400/600通过；pure整包400/600、320宿主与工具自身200%未验证
  框架开发：预编译React/Tailwind及Vue通过；官方源码编译入口未接入
  主线交付：源码与CI修复已串行提交；pure生产包已交付；GitHub旧CI失败，修复后CI/独立最终F3/ZIP新候选未验收
```

原603＋19、独立B05、1000 mixed/10 reconnect/2轮禁插件、六项 baseline、独立最终F3、ZIP安装一致性等总体迁移合同仍保留，本轮有限 Sidebar 验收不替代它们，也不更改分母或冻结 owner/receipt。

截图：证据根目录 `screenshots/sidebar-400-final.png`、`screenshots/sidebar-600-final.png`；另保留 native-final3 React/Vue、更新、重启及 200% 页面截图。实际本轮源提交与证据提交 SHA 在最终 Git 记录和最终答复列出；本文件不伪造自包含 commit SHA。
