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
