# 已安装工具的本地存储、容量和恢复 —— 2026-10-11 独立工作流

## 范围、工作树与资源

- 目标：`shopable-ai/opendesk-browser` 的 `main`，基线 GitHub HEAD `a44e2efc`（核查时）；实施期间远端 main 多次被其他任务快进。每笔提交都以实时分支 HEAD 为 parent，并用预期 HEAD 租约更新 ref，没有覆盖无关路径。
- 工作方式：在本会话通过 GitHub Connector 读取/写入真实远端源码；**未进入用户 Mac 本地工作目录**，所以没有读取本地 `git status`、占用个人 Chrome、Native Host、测试端口、构建输出或其他开发对话的 Profile。新工作流独立记录，不覆盖现有 R3/R4.5 测试归档。
- 变更限于根权限目录、共享安装/数据保存与 bridge、知识服务、市场 My Apps、容量辅助代码、定向环境和受控 Chrome 测试、API 使用文档。v1 包结构、现有 IndexedDB/锁/签名、安全入口均保留。

## 实施变化及安全合同

1. `manifest.json` 和宿主 `REQUIRED_BROWSER_API_PERMISSIONS` 同步启用 `unlimitedStorage`；WXT 继承根配置，`verifyManifest` 继续强制对齐。运行时实际检查权限，没有给工具 capabilities 添权限。
2. `storage-state.js` 提供受锁保护写入的读回确认、配额/宿主错误分类与未知效果保护；`storage-usage.js` 用 `getBytesInUse` 分别统计 local、安装包、工具数据，包含知识收件箱专用路径。不伪造已用/剩余存储容量。
3. 共享安装器处理审阅身份的固定摘要、baseline、单 ID + registry 写入、来源与操作记录；部分提交后不得还原整个旧数组、不得盲目重发批准。恢复从本机包计算规范化摘要，核对市场身份、版本和来源，不重新下载目录资源。
4. 工具保存后读回，错误码经宿主 `postMessage` 传播到沙箱；知识收件箱沿用 SW 锁，支持自己的 4 MiB 上限。
5. 卸载采用 `opendesk.sidebar-tools.uninstall-cleanup.v1` 的独立恢复标记；只有同 ID 确认为未安装时才清理本机数据，存在新的同 ID 安装时拒绝旧清理。
6. 应用市场将目录与本地加载状态分开；`#/my` 优先读取本机安装，不因目录不可用显示假空结果。恢复/容量查询入口位于「我的应用」。不能新安装不再发行的市场版本，但保留原本地安装。

## 验证约束与证据分级

已核对旧 `docs/framework/testing-guide.md` 与 R3 真实 Chrome 工作流，旧的通过记录只适用于原候选包，不冒充本次改动的验收结果。

- 当前改动增加环境定向测试：`tests/environment/sidebar-storage-unlimited.test.mjs`、`app-market-r3.test.mjs`、`sidebar-tools-host.test.mjs`、`permission-gate.test.mjs`。新断言覆盖配额拒绝、旧版本读取、没有权限的计数、知识专用路径、离线我的应用、丢回执后本机恢复、并发清理保护。
- 受控 CFT 入口：`tests/framework/app-market-r3-native.test.mjs`。在 CI 的**独立临时 Profile** 中真实查询 `unlimitedStorage`，写入隔离的 `opendesk.storage-capacity-test.v1:<UUID>:<n>` 12 个专用容量测试键，核对 `getBytesInUse(null)>10 MiB`，然后通过真实 UI 安装合规工具并重启 Chrome 读回包/笔记，最后仅删除这 12 个键并校验未残留。工具包、授权、业务数据仍由实际用户点击与原机制产生，不由测试键注入。
- 先前 CI 候选 `884e7108`：[GitHub Actions #38129041477](https://github.com/shopable-ai/opendesk-browser/actions/runs/38129041477)：定向 Node **86/86 PASS**；源码 check、双构建、verify、pack、市场站构建 **PASS**；实际 Chrome Native **PASS**；全环境回归 **1091 PASS/1 FAIL**，唯一失败为 `permission-gate.test.mjs` 旧的 `.slice(-2)` 权限尾部断言未加入 `unlimitedStorage`，后续已修复并补充回归。该结果严格绑定 `884e7108`，不能转记为新包 PASS。
- 本工作流的**最终结果应以最新 CI run 的实际状态更新**：新增的 >10 MiB 原生验证、离线市场与失败注入未取得当前候选通过收据之前均为 `NOT_TESTED_ON_FINAL_CANDIDATE`。
- 用户 Mac Chrome、个人旧扩展升级、真实设备空间满盘、跨设备 Profile 迁移、商业发布/计费、完整 F3、ZIP 最终验收：**NOT_TESTED**。这些事项不能用 Linux CI 单元或截图代替。

推荐验证命令：

```bash
node --test tests/environment/sidebar-storage-unlimited.test.mjs tests/environment/app-market-r3.test.mjs tests/environment/sidebar-tools-host.test.mjs tests/environment/knowledge-inbox-r1.test.mjs tests/environment/permission-gate.test.mjs
npm run check
npm run build && npm run build:dev && npm run verify && npm run pack
# 使用独立 CFT Profile 且生产 dist 已构建；不要运行在日常 Chrome Profile 上
CHROME_BIN=/path/to/chrome node --test --test-concurrency=1 tests/framework/app-market-r3-native.test.mjs
npm test
```

请将之后的新包 Chrome 版本、实际 packageHash、CI run ID、定向测试数与原始数据截图/JSON 追加本工作流；失败记录不得删除，未执行的测试保持 NOT_TESTED。


## 固定候选：已执行的完整 Chrome 验收与后续并行阻塞（2026-10-11）

### 候选 `5547ef39dcb37a7798d68a63f171bd27aa8635b3`：PASS（受本候选约束）

- CI：https://github.com/shopable-ai/opendesk-browser/actions/runs/38129308055 ，`market-production-native` **SUCCESS**。
- 定向 Node **86/86 PASS**；`npm run check`、production/development 构建、verify、pack、市场站构建 **PASS**；完整 `npm test`：**1092 PASS、0 FAIL、7 SKIP**。
- 真实 Linux Chrome for Testing 生产扩展：`REAL_CHROME_FIXTURE_PASS`；实际扩展 ID `jhajepcnohiplmafaiokjlcagcfjgaap`；packageHash `896522e0cb57a67d1329275f8a2b86102a6e76dc3ff76163e7847141a48aea4d`，两个浏览器正常重启，实际安装与独立页工具打开、保存、更新、撤权、卸载均在受控 Profile 中执行。
- 首次运行测试新增阶段 `host-local-storage-exceeds-10MiB`。真实权限读回 `unlimitedStorage=true`；通过 `chrome.storage.local.set` **只写 12 个测试专属键、每项 920000 字符**（合计正文 11,040,000 字节，不占工具名额、不调整工具单项上限），用真实 `getBytesInUse(null)` 断言高于 10 MiB；之后通过 UI 安装本机工具、执行 Chrome 重启，断言仍超过 10 MiB 且安装/笔记保留，最终只清除上述 12 个测试键并检查剩余为零。测试临时 Profile 归本测试独占，没有向用户真实 Chrome 写入大文件。
- 原始 CI artifact `market-r3-production-native` ID `11698212660`，保留 `artifacts/app-market-r3/native-result.json`、截图及双构建产物，可查阅具体总字节数与固定扩展身份。artifact 截止 2026-10-21（平台保留期），文档不杜撰未抄录的 byte 值。

### 后续候选的严格边界

- `09e520d549a89d809cc9e33ab0765ccf6c9cf3a0`：CI [#38129626910](https://github.com/shopable-ai/opendesk-browser/actions/runs/38129626910) 中新增的 **92/92 定向环境测试通过**。之后在包验证阶段因另一个并行 Page React/Vue 运行库的 `libs/page-frameworks/react-19.2.0.js` 访问 `prototype.constructor` 触发 `scripts/verify-package.mjs` 中现有 `Unapproved dynamic constructor reference` 安全规则，构建链退出；后续 Native Chrome 和完整环境套件按 CI 正常 **SKIPPED**。这个失败不能记录为本轮容量测试失败，也不允许忽略包校验器。
- `f848433c2df7d364893b38d5d5a89566feefecd5`：CI [#38129743082](https://github.com/shopable-ai/opendesk-browser/actions/runs/38129743082) 中进一步扩充的 **93/93 定向测试通过**（新增工具存储配额错误透传与知识收件箱原数据保留用例）；随后遇到相同并行 React 生成物安全校验阻塞，未在该候选重新跑完原生 Chrome/全环境验收。
- 故当前结论是：**存储主干功能已实施；`5547ef39` 的真实 Chrome + >10 MiB 通过，后续定向 Node 补丁通过；最终合并所有并行 Page 框架代码的生产包尚未通过整体验收**。待 React/Vue 子任务自行修复其真正的打包/代码来源问题并保持安全规则不放宽后，应该对最新 main 重跑同一 market CI 和受控 Chrome 证据绑定；不能把旧候选 PASS 擅自升级为最新 main PASS。


## 追加：同 ID 重装、旧窗口代际隔离与孤立笔记保护

- 候选 `5c390e5ab5812c30508384755ef6bc0846a7039d`：发现旧逻辑可能在正式安装包尚未写入时先清理同 ID 孤立工具数据，遇到浏览器写入拒绝则无恢复能力。现改为检测孤立数据并拒绝安装 `E_TOOL_ORPHAN_DATA`，不静默删除原笔记。更新相关 Node 断言。
- 候选 `08e8260f5bf025aeacd0045e05efcebb82314d1e`：新增独立宿主元数据 `opendesk.sidebar-tools.revocation-epochs.v1`。卸载确认阶段持锁持久化该 ID 的随机代际，所有写入前在受信任宿主 / 知识服务的原有锁内核对当前代际；即便再装完全相同 id/version/bytes、旧窗口错过 onChanged，旧工具上下文也不能向新实例写回。未把代际写进严格的工具包 v1；预览和第三方工具也无法直接获得宿主 storage 权限。
- 最新两项定向场景：`tests/environment/sidebar-tools-host.test.mjs` 模拟旧窗口错过卸载和同包重装通知，`tests/environment/knowledge-inbox-r1.test.mjs` 验证后台消息持锁防止旧代际访问。在其最终 CI 结果核对前标记 `NOT_TESTED_ON_LATEST_CANDIDATE`；保留旧候选 5547 的真实 Chrome 通过证据但不冒充本次补丁通过。


## 2026-10-11 续接：已安装工具可靠性增量及证据

本次续接仍只操作真实 GitHub `main`，没有访问用户的 Mac 本地工作区、用户 Chrome Profile、Native Host 或构建资源。所有源码提交均基于写入前核对的最新远端 main，采用非强推的 expected HEAD 快进；没有改其他任务的证据或清空任何历史数据。

- `6f41e414`：统一 `requireCompleteInstalledSidebarTools()`，安装/恢复/卸载遇损坏、重复或超数的工具数组时抛 `E_STORAGE_CORRUPT`，防止过滤异常行后覆盖其他工具；市场本机列表不再等待官方发行资源逐个读取，发行包校验只是可失效的 UI 来源核对；容量统计增加已知待清理工具命名空间，仍完全使用 `getBytesInUse`，不读取笔记正文。
- `1c371012`：补充损坏安装数组不丢原包、目录资源永远不返回时本地应用仍可打开、待清理容量字节数真实计数测试。市场 [CI #38132340605](https://github.com/shopable-ai/opendesk-browser/actions/runs/38132340605) SUCCESS（受固定候选约束）。
- `6e1ea729`、`d6964638`：Side Panel 本机安装记录读失败不显示假空态，卸载锁内遇损坏数组不得覆盖任何行；新增两项测试。市场 [CI #38132582573](https://github.com/shopable-ai/opendesk-browser/actions/runs/38132582573) 中 **109/109 定向 PASS、双构建 PASS、Linux 受控 Chrome 12 阶段/两次浏览器重启 PASS**。该候选完整环境回归 1 项 Page R12 历史站点匹配断言失败；Page 负责人随后以 `9129a9f4` 修正。不能把该失败指认为存储缺陷，也不能把固定包的原生结果提升到新版本。
- `4e5f309d`、`9c85ffba`：增加本机请求代际，较早读回不能覆盖新列表，新增乱序返回测试。[市场 CI #38132839380](https://github.com/shopable-ai/opendesk-browser/actions/runs/38132839380) **110/110 定向 PASS**；之后被并行 Developer 文件 `src/ui/local-project-install.js` 的错误正则阻断 `npm run check`。其修复已独立提交为 `8c31df13`，旧失败记录保留。
- `707dec368`：增加“容量计数失败只显示暂时无法读取，不显示 0”真实 UI 组件测试。当前候选完整市场 CI 的最终结果待对应运行结果绑定，不能凭先前通过推断新结果。

验证入口沿用 `tests/environment/app-market-r3.test.mjs`、`sidebar-storage-unlimited.test.mjs`、`sidebar-tools-host.test.mjs`、现有双构建校验与 `tests/framework/app-market-r3-native.test.mjs`。严格区分既有 `5547ef39` 的 >10 MiB 原生验证、`c8b5b2ef` 的 [市场 CI #38131130907](https://github.com/shopable-ai/opendesk-browser/actions/runs/38131130907) 和 [知识 CI #38131130903](https://github.com/shopable-ai/opendesk-browser/actions/runs/38131130903) SUCCESS，以及最新合并候选；未通过完整最新包 CI、Mac Native/F3/ZIP 的项目一律保持未验收。新的本地 UI 保护不改变 12 包、320000 字节、普通工具 8192/32768 字节或知识专用 4 MiB 上限。


### 最新受控 Chrome 失败证据与原生点击修复（续接）

- `707dec36898be38118d348f0939d1389fc2ecfaf`：[市场 CI #38132999590](https://github.com/shopable-ai/opendesk-browser/actions/runs/38132999590) 先通过 **111/111 定向组件测试、双构建及包校验**。原生 CFT 在 `market-fixed-unavailable-version-and-current-batch` 阶段的循环卸载遇到 `Chrome timeout: expected native confirmation`；不是容量上限断言失败，该轮尚未到达 >10 MiB 阶段。
- 已下载并逐项核对原始 CI artifact `11699643590`：`native-result.json` 的 `failedStage` 与真实 Side Panel 快照一致；前两次卸载确认框（网页剪藏、知识收件箱）来自真实点击且 `matched=true`，批量重装后列表显示五个实际安装版本，随后市场标签页关闭，下一次卸载未收到原生确认。失败没有清空用户实际安装数据或放宽原权限校验。
- `9b0f1a9af9fb2f2fc57f04023e3f99aed2f14cc4` 只修改 `tests/framework/app-market-r3-native.test.mjs` 的 `uninstall()`，在原有可信 CDP 鼠标输入之前显式前台激活实际 Side Panel target；确认框仍必须由真实 Chrome 发出、实际用户批准步骤仍必需，未使用 DOM 合成事件、未改源代码/权限逻辑，也未降低原生断言。**此修复的最终 CFT 结果仅以重新运行的同一候选 CI 为准**，不能拿旧包 PASS 冒充新包通过。

 
## 2026-10-11 最终受控 Chrome CI 核对（Mac 待验）

最新已确认功能候选为 `a1f75e918ba5c4f3747408802d5ee280f29f988a`，对应 [市场与真实 Chrome CI #38134215155](https://github.com/shopable-ai/opendesk-browser/actions/runs/38134215155) 全部步骤 **SUCCESS**：112/112 定向 Node 通过；`npm run check`、生产与开发 WXT 构建、`verify`、`pack`、市场静态路由均通过；Linux Chrome for Testing 的 12 个完整阶段 `REAL_CHROME_FIXTURE_PASS`，2 次正常整浏览器重启、24 个真实确认框。真实 Chrome 运行中 `unlimitedStorage` 为已授予，`getBytesInUse(null)` 超过 10 MiB；使用专用容量测试键，没有改变 12 工具/320000 单包/普通数据 8192 与 32768/知识 4 MiB 的产品限制，结束后只清理专用键。

上述 CFT 的 `packageHash=83d5702533f1be2e0a5a3b5275c62bc4bb66000a9ea1be7e8d925781e370f6c4`，对应 CI 记录的 `a1f75e91`；同次完整 `npm test` 为 **1142 PASS / 0 FAIL / 7 SKIP**，受控 Linux Chrome 真流程为 1/1 PASS。CI artifact `market-r3-production-native` ID `11700247503`，ZIP 摘要 `sha256:0b804fc2ec0cec3a93c2bd642d9cd98f395e362e624c0d161033e8f3a8c16eaf`。

核对该 CI 源提交到 `895f19d3cf64ddbdacc55f98054e7a54ec09ab10`，期间只有 `docs/framework/workstreams/knowledge-inbox-r24-20261011.md` 和 `docs/framework/workstreams/reading-toc-r46-20261011.md` 两份文档变化，无存储/权限/构建/原生验收输入变化。该范围的源码证据可复用，但不替代 Mac 本地 Chrome、真实旧 Profile 升级、物理磁盘空间写满、独立 F3/ZIP 完整验收。下一步是使用本机 Codex + 独立 Chrome for Testing Profile 验证本次存储专项，复用同包通过记录，不重跑无关大型工作流。
