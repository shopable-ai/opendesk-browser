# Bookmark Manager R2.4 final driver review

Owner: current Codex session; 2026-10-15. State: IN_PROGRESS.
Baseline: ea4e9c5c (main). Local Linux checkout; no Mac Chrome access.

Write scope: src/platform/chrome/bookmarks-full.js,
tests/environment/browser-sdk-r112-full-bookmarks.test.mjs, this record.
No public schema change. Reuse the existing Host/Registry/authorization.
Resources: private checkout dist/production and dist/development; no watcher,
Chrome profile or user Mac output touched. Logs in /tmp/bookmark-*.

Initial verification: seven requested targeted suites, 62/62 Node PASS.
Current main already contains v0.3.0, optional Catalog registration, current-page
references and legacy deletion. These are baseline facts, not changes by this
session and not native acceptance evidence. Native remains NOT_TESTED.

Fix scope: recheck authorization after asynchronous preflight and immediately
before native writes; reject create/move destinations under managed ancestors.
Chrome has no compare-and-swap transaction: external mutation can still happen
between the final native read and write. No native timing measurement available.

Expanded scope after reproducible failures: scripts/{stage-sidebar-tool,
build-official-tools,prepare-public}.mjs, scripts/tests/sidebar-r19-layout-visual.mjs,
tests/environment/{official-tools-catalog-r45,sidebar-ui-preview,
browser-sdk-r106-core-contract-gaps}.test.mjs, docs/api/browser-sdk-interface-matrix.json,
and obsolete CSS path filters in browser-sdk-r5/r13 workflows.
The v2 dependencies field was accepted by the packer but rejected by staging;
official fingerprinting also treated the dependency array as a path. Both now
include every ordered dependency under the existing bounded path checks.
Removed dangling references to the deleted legacy stylesheet. Preserved the
intentional Cookie Editor portable package and verify its bytes against source.
Updated the stale page-context fixture to exercise Host document references,
and refreshed only the matrix's exact current schema Git blob hash.

## 最终结果（2026-10-15）

源码提交：`f508dc60296934d83114daa2f3cddc5e0c84c76d`，通过 GitHub 插件以
expected HEAD lease 更新 main，保留并行提交。没有强推、其他分支或 PR。
本地原提交 `20f087e6` 不是远端交付 SHA。远端的并行官方入口清理测试也已单独读取并验证。
本轮状态：源码修复 COMPLETE；Mac Native / 正式发布 BLOCKED；文件与构建资源 RELEASED。

### 用户要求的 17 项结论

| 项目 | 已核实结论与证据级别 |
|---|---|
| Full 12 接口 | getTree/get/search/create/update/move/remove/prepareRemoveTree/removeTree/observe.start/read/stop 均 SOURCE_WIRED、NODE_PASS；不是 NATIVE_PASS。SDK facade + approved Dispatcher 的真实函数调用使用 Chrome fixture。 |
| Owned / Full 隔离 | Registry、安装身份、Full 独立授权与撤权拒绝路径 NODE_PASS；原生授权界面 NOT_TESTED。 |
| 实际安装运行 | 独立包校验通过，installed:false；真实扩展中心安装 NOT_TESTED。 |
| 当前页收藏 | 公共 Schema / opaque TabRef+DocumentRef / Host / Consumer 已接线，身份与同 URL 文档替换拒绝测试通过；真实收藏 NOT_TESTED。 |
| 500/550/1000+ | Driver fixture 完整分页 500、550、1001，IPC 不超过原预算；真实 Profile 数据集及单独 100 项 Native NOT_TESTED。 |
| 文件夹 CRUD | 模型、消费端、SDK/Driver fixture PASS；真实 Chrome NOT_TESTED。 |
| 非空目录删除 | 一次性票据、身份、子树摘要、预期节点、managed、并发变更拒绝有 Node 证据。Chrome 无 CAS；最后原生读取到执行仍有竞态窗口；实际时长 NOT_TESTED。 |
| 事件 / Worker | 有界队列、overflow/gap、会话身份、重建过期、消费端全量同步 NODE_PASS；跨窗口、真实 Import、SW 重启 NOT_TESTED。 |
| 旧目录 | 远端基线已删除 src/bookmark-manager/，本轮未重新创建。 |
| 旧 HTML/CSS/import | 旧 UI 已在基线删除；本轮补清视觉服务残留 CSS 路由、CI path filter；构建复制残留由并行 ec6e254c 修复并保留。 |
| 唯一业务实现 | examples/sidebar-tools/bookmark-manager/；Host 仅保留通用能力。静态检索无旧有效运行路径。 |
| Catalog | 基线已经登记 optional；真实安装 NOT_TESTED，不代表发布门禁通过。 |
| CI | 两个专项 workflow 已触发但仍 QUEUED，见下方；本地 Node/Build 与 Actions 分开报告。 |
| 真实 Chrome | NOT_TESTED；本环境无法访问用户 Mac、Chrome Profile 或真实可信输入。 |
| Issue #75 | 不关闭；Native、安装生命周期、同候选产品证据未齐。 |
| 本轮生产代码量 | src + scripts：新增 23、删除 7、净增 16 行；其中 src Driver +12。完整代码提交（含测试/工作流/矩阵）+108/-17，不含此前其他会话删除的旧实现。 |
| Git SHA | 源码 f508dc60296934d83114daa2f3cddc5e0c84c76d；后续证据提交不改变产品代码。 |

**门禁偏差**：接手的 main 在没有 Native 证据时已经完成 Catalog 登记与旧入口删除，
不满足本次要求的先 Native 后删除/发布顺序。本轮如实登记，不伪造放行，也不恢复重复业务。

### 实际运行的验证

- 7 个指定专项套件：64/64 PASS；最终同源码核心工具/Driver/文档引用 38/38 PASS（含并行新增的唯一业务入口测试）。
- Browser SDK 广泛回归与预算：353/353 PASS；官方包/Stage/界面 28/28；文档身份/矩阵 27/27；预算单测 16/16。套件有重叠，不能相加作为独立功能总数。
- npm run check PASS（710 文件）；npm run build、build:dev、verify 均 PASS。
- npm run build:sidebar-tool -- examples/sidebar-tools/bookmark-manager PASS：0.3.0，43,327 bytes，SHA256 `9c41c26a2c7f9087523734f295eeedcba309eda3d9e418e0fbeeb30d82445289`。
- Production package `a0255dcc59398c52ec93496d116131778e86ad3b10370ec7c0cba0cf192bea36`。
- Development package `eb61f6ef6e4c49c31eed1de9b647d96ba7fa1f2239c9f13bc5bc4c036b841a9c`。
- Registry coverage 65/65 implemented；批准矩阵 67（65 public + 2 Host-only）检查 PASS。这里只刷新精确 schema blob hash，没有更改批准权限。
- **npm test FAIL**：2585 tests，2562 PASS、14 FAIL、9 SKIP。该轮早于并行新增的单个入口测试，后者包含在最终 38/38 中。
  - dev-installation-diagnostics 3 项：包诊断断言、Homebrew 节点选择及 Socket EPERM。
  - native-agent-instance 1 项、native-agent-native-host 9 项：本环境 Unix Socket listen EPERM。
  - papa-parse-r1 模块：从 catalog.js 导入不存在的 PAGE_OPTIONAL_LIBRARY_IDS，模块加载失败。
  这些失败全部保留，不绕过安全检查、不删除有效测试、不宣称全仓通过。
- [Bookmark CI 38697059855](https://github.com/shopable-ai/opendesk-browser/actions/runs/38697059855)：QUEUED。
- [SDK CI 38697059996](https://github.com/shopable-ai/opendesk-browser/actions/runs/38697059996)：QUEUED。

原始日志和两个构建回执以 gzip 保存在 [evidence/bookmark-manager-r24-final](evidence/bookmark-manager-r24-final/)。
summary.json 保留包身份与 sourceInputs 摘要；原始回执记录构建时的工作树输入。
构建是在代码提交前执行，但最终产品文件字节一致；不是 Mac Native 同候选证明。

### 逐维评分

SDK 架构一致性、Chrome API 正确性、Owned/Full 权限隔离、Host 安全、完整 CRUD、分页事件、
独立工具消费、旧业务解耦、测试回归、真实 Chrome 产品完成度，全部 **NOT_SCORED**。
前九项已有不同程度源码/Node/Build 证据，第十项 NOT_TESTED；没有独立专家审查和完整
同候选 Native 证据，不能用自评 95+ 代替验收。

### Mac Codex 可直接执行的准备命令与原生清单

先读取 AGENTS.md，核对 main、未提交修改、既有 watcher、Chrome 加载路径/ID、Go doctor 配对。
不要覆盖日常 dist/development watcher。若有占用，按仓库既有独立快照/输出协议冻结验收候选。
以下构建只在没有相应输出 writer 时运行：

```bash
cd /Users/shopme/Documents/workspace/opendesk-browser
git status --short
git log -1 --format=%H
node --test tests/environment/bookmark-manager-r2.test.mjs tests/environment/browser-sdk-r112-full-bookmarks.test.mjs tests/environment/browser-sdk-r124-current-page.test.mjs
npm run build:sidebar-tool -- examples/sidebar-tools/bookmark-manager
npm run check
npm run build
npm run build:dev
npm run verify
shasum -a 256 artifacts/sidebar-tools/bookmark-manager/0.3.0/bookmark-manager.opendesk-tool.json
```

1. 专属 CFT/Profile 加载 production 候选，记录 SHA、构建指纹、Chrome 版本、扩展 ID/目录/Profile、工具 packageHash/installEpoch。
2. 从正式扩展中心安装：首次拒绝不可见私人树，再明确允许；逐项调用 12 Full 方法并保存原生回执。
3. 使用可清理的专属测试文件夹，覆盖 100/500/550/1001、多级/空目录/长标题/中文/特殊字符/非 HTTP(S) 既有书签；比较原生树节点 ID/父子/顺序和全部 cursor 页，不以 UI 数量代替。
4. 当前页收藏分别测试导航、同 URL 重载、关闭、换标签、撤权；旧 documentRef 不得写入。
5. 跨窗口创建/改变/移动/重排/删除、导入始末；队列溢出、Gap、会话过期必须重新同步；重启 Worker 后旧会话明确失效。
6. 非空目录预检后并发改子树，必须拒绝；票据跨工具/包/epoch、重复消费、managed 后代均拒绝。测量最后原生重检至 removeTree 调用间隔并明确非原子竞态，不注入伪回执。
7. 停用/升级/卸载/重装与 Chrome 权限撤销，检查旧引用/旧票据失效、其他工具不能继承 Full，卸载不删除原生书签，沙箱无 chrome.bookmarks。
8. 保存原始收据后再判断发布、Issue #75 和逐维独立评分；不得自动把本报告的 Node/Build PASS 升为 Native PASS。
