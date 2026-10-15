# Bookmark Manager R2.4 runtime closure

Owner: Codex session 6a663b0db1a3, 2026-10-15. State: SOURCE_COMPLETE / NATIVE_BLOCKED.
Branch: main. Baseline: 8dc346e0432e11115862b39614b2d46a04f5cebb.
Environment: independent Linux clone; user Mac and Chrome Profile unavailable.

Write scope: src/platform/chrome/bookmarks-full.js;
examples/sidebar-tools/bookmark-manager/{src/main.js,tool.config.json,README.zh-CN.md};
tests/environment/{browser-sdk-r112-full-bookmarks,bookmark-manager-r2,bookmark-manager-r24-lifecycle}.test.mjs;
.github/workflows/bookmark-manager-r2.yml; this workstream and its evidence directory.
No Registry, Schema, facade, Host, permission or installation protocol change.

Confirmed gaps: the ninth snapshot in 120 seconds fails E_LIMIT even for routine
refresh/CRUD; subscription starts after reading the tree, leaving an unobserved
change window; refreshing while a form is open replaces its reviewed precondition.
Also review in-flight generation/ticket expiry fences immediately before writes.

Call path remains sandbox consumer -> OpenDeskSDK generated facade -> installed
tool bridge -> trusted Side Panel user-intent admission -> existing Browser Host
and approved Dispatcher -> Full Driver -> Chrome. Only UI state and the existing
Driver change; no private IPC or additional trusted business implementation.

Resources: this clone's node_modules, dist/production, dist/development and
artifacts/sidebar-tools/bookmark-manager. No watcher, port or Chrome Profile used.
Reuse prior f508dc60 evidence for unchanged contracts; affected runtime tests and
requested build/full regression will be rerun with new evidence. Native remains
NOT_TESTED; existing optional Catalog/legacy deletion predates this session and
does not constitute Native release approval. Issue #75 stays open.

## 实际交付

已通过 GitHub 插件的 expected-HEAD、非强制更新提交至 main：
`a2be6815ad1f58907b10da1dc31df738b1bcacce`。
源码树 `48f8cfa4d9c65f91df1bb08dbfcea179751798a5`。
本地原提交 `5c6535be` 与远端源码树完全一致，已同步到远端正式 SHA；没有创建分支或 PR。
后续本报告及日志提交不改变任何产品、测试或构建输入。
提交证据前重新读取远端，保留并行的 `ecd1d643`（AI VIP Share 的 DESIGN、preview HTML、
preview 测试和工作记录）。这些文件不进入本轮书签源码及发行构建输入，不重跑无关验证，
也不将书签证据提升为 AI VIP Share 的验收。

实际修复：

1. 快照池仍最多 8 份；连续刷新只回收同一安装身份的最旧快照，旧游标明确过期，不再让正常 CRUD 在第九次刷新时停用两分钟。
2. 先开启 SDK 观察会话再读取完整分页快照，覆盖读取期间变更；读取失败立即关闭观察会话。
3. 自动刷新保留编辑/移动草稿及用户最初审阅的节点条件，防止外部修改被静默当成已批准版本。
4. 写入入口捕获撤权代际，在最终原生调用前再核对；撤权后重新授权也不能复用正在执行的旧请求。
5. 删除票据在所有异步预检完成后再次检查期限；票据摘要计算后的容量检查保证并发预检最多 16 张。
6. 监听到预检期间的 Chrome 书签变化时，写入失败关闭；预期节点按字段值比较，不再依赖 JSON 字段插入顺序。
7. 消费端版本提升到 0.3.1，CI 包路径按实际版本匹配，新增生命周期测试纳入专项工作流。

## 验证与包身份

原始日志、两个完整构建回执及机器摘要：
[evidence/bookmark-manager-r24-runtime-closure/summary.json](evidence/bookmark-manager-r24-runtime-closure/summary.json)。
所有测试为真实执行；Chrome fixture/DOM fixture 明确属于组件，不属于 Native。

| 验证 | 结果 |
| --- | --- |
| 用户指定七项 + 当前文档 + 新 UI 生命周期套件 | 81/81 PASS；同树本地与同 SHA CI 均验证 |
| 安装器、Host、官方 Catalog、固定入口预算 | 121/121 PASS（与其他套件有重叠，不相加当作独立功能总数） |
| npm run check | PASS，711 个文件 |
| 唯一矩阵 / 生成 Binding Catalog 校验 | PASS；67 批准 = 65 public + 2 Host-only，未改变批准范围 |
| npm run build:sidebar-tool -- examples/sidebar-tools/bookmark-manager | PASS，0.3.1，43,745 bytes，installed:false |
| npm run build / build:dev / verify | PASS；两个构建 sourceDriftDuringBuild 均为空、输入摘要一致 |
| npm test，双构建之后 | FAIL：2598 tests，2575 PASS、14 FAIL、9 SKIP |
| Bookmark 专项 CI | [38699430342](https://github.com/shopable-ai/opendesk-browser/actions/runs/38699430342) PASS |
| Browser SDK R5 CI | [38699430386](https://github.com/shopable-ai/opendesk-browser/actions/runs/38699430386) 合同及双构建 PASS |
| Browser SDK 主线 CI | [38699430625](https://github.com/shopable-ai/opendesk-browser/actions/runs/38699430625) 合同及构建 PASS；原生重启 SKIPPED |
| Sidebar 安装与打包 CI | [38699430348](https://github.com/shopable-ai/opendesk-browser/actions/runs/38699430348) PASS |
| 固定入口预算与库边界 CI | [38699431358](https://github.com/shopable-ai/opendesk-browser/actions/runs/38699431358) PASS |
| 官方市场原生 CI | [38699430316](https://github.com/shopable-ai/opendesk-browser/actions/runs/38699430316) FAIL，三项真实 Chrome 流程均阻塞 |

14 个全仓失败逐类保留：dev-installation-diagnostics 三项（包诊断断言、Homebrew Node 选择、Unix Socket EPERM），
native-agent-instance 一项及 native-agent-native-host 九项（Unix Socket EPERM），papa-parse-r1 一项
（从 catalog.js 导入不存在的 PAGE_OPTIONAL_LIBRARY_IDS，模块加载失败）。这些文件本轮未修改；
失败集合与 f508dc60 的历史记录一致，未放宽、删除或跳过测试。
首次全仓测试在没有 dist 时还有包依赖失败，补齐双构建后已消失；初始失败日志也保存。

市场 CI 的 Linux production、Linux HTTP 和 macOS HTTP 均在点击
`#sidebar-tool-discover-toggle` 时超时，尚未到 Bookmark Full 验收。
对照前一源码 f508dc60 的 [38697059850](https://github.com/shopable-ai/opendesk-browser/actions/runs/38697059850)
及 job 116296015899 原始日志，确认同样的选择器超时先于本轮存在。
没有以增加等待、合成点击或绕过 UI 来伪造通过，也未覆盖并行 UI 工作。

包身份：

- 工具 SHA256：`4e1a6c371e0abfc4e219605515460c4c188cbb38c8909f225f70e94c6f100c4a`。
- Production：`f9b6fdaf9b670f7f1b0b9bab2663ec4792d5b4709f132e2bd181561ba444e2c6`。
- Development：`4e82bf4b0a97413e56459f076a9ad500f3e95a17a0589e0d17395f2503e3dd63`。
- 初次生产构建检测到本轮最终票据容量修复造成的输入变化，已明确拒绝；仅后续冻结构建计 PASS。
- 此执行环境曾留下本会话已结束构建的 PID 锁。仅在取得其 OS 输出守卫、验证精确 token/root 和已完成会话后清理自有锁；没有停止或接管其他 watcher。

## 用户要求的 17 项结论

| 项目 | 可证明事实与剩余边界 |
| --- | --- |
| 1. Full 12 接口 | getTree/get/search/create/update/move/remove/prepareRemoveTree/removeTree/observe.start/read/stop 均经同一 Facade/Dispatcher/Driver 组件调用，SOURCE_WIRED + NODE_PASS；真实 Chrome 全部 NOT_TESTED |
| 2. Owned / Full | 独立 capability、包身份、安装代际与撤权拒绝回归 PASS；真实权限 UI NOT_TESTED |
| 3. 真正安装运行 | 独立包和安装器/Host 回归通过；此书签包真实 Profile 安装 NOT_TESTED |
| 4. 当前页收藏 | 既有 opaque TabRef/DocumentRef 链与同 URL 文档替换等拒绝用例 PASS；本轮未另造 Tab SDK；真实使用 NOT_TESTED |
| 5. 500/550/1000+ | 100/500/550/1001 fixture 全分页通过，10,500-byte 分页预算未扩大；真实 Profile NOT_TESTED |
| 6. 文件夹完整 CRUD | 组件正向/拒绝用例通过；Native NOT_TESTED |
| 7. 非空目录删除 | 根/managed/预期节点/子树摘要/身份/单次票据/期限/撤权代际/已观察到的变更均有拒绝证据；不存在原子 CAS，未观察到的最终原生读写竞态仍存在，真实窗口时长 NOT_TESTED |
| 8. 事件 / Worker | 七种事件、overflow/gap/过期、重建会话失效、先观察后快照及关闭清理有 Node 证据；跨窗口/实际 Worker 重启 NOT_TESTED |
| 9. 旧目录 | 接手基线已删除 src/bookmark-manager/；本轮没有恢复 |
| 10. 旧 HTML/CSS/import | src/scripts/workflows 静态检索无旧有效入口；旧入口移除回归通过 |
| 11. 单份业务实现 | 业务位于 examples/sidebar-tools/bookmark-manager/；宿主继续仅承载通用 SDK/Host/Driver |
| 12. Catalog | 基线已 optional 登记，0.3.1 随原构建器生成；原生安装未通过，不能称正式发布验收完成 |
| 13. CI | 上表分别给出 PASS、FAIL、SKIPPED；全仓没有宣称全绿 |
| 14. 真实 Chrome | Bookmark Full NOT_TESTED；共享市场 Native CI FAIL；没有用户 Mac、Profile、扩展 ID 或 installEpoch 的验收证据 |
| 15. Issue #75 | 保持 OPEN，不能关闭 |
| 16. 本轮生产代码量 | JS +59/-27；工具配置 +1/-1；合计 +60/-28，净增 32。源码提交全部文件含测试/说明 +286/-36；此前旧业务删除不算作本轮贡献 |
| 17. Git SHA | 产品及测试源码 a2be6815ad1f58907b10da1dc31df738b1bcacce；本报告后续提交仅增加证据 |

现有读取合同仍限制标题 256 字符、URL 4096 字符、树 20,000 节点、深度 100、快照 8 MB。
新增用例保留长中文/特殊字符及已有 file: URL 原值；超界明确失败，不假装支持任意长度或无限树。
任意超长历史节点兼容属于未扩充的合同边界。本轮没有修改普通 SDK IPC 限额。

**已有门禁偏差**：最新基线在 Native 尚未通过时已登记 Catalog 并删除旧 UI。
本轮记录这一事实，保留唯一业务实现，不恢复两套业务，也不把它认定为用户要求的先原生验收后发布顺序已满足。

## 逐维独立评分

本轮没有独立专家审查及完整 Native 产品证据，不能制造 95+ 分数。

| 维度 | 证据 / 评分状态 |
| --- | --- |
| SDK 架构一致性 | Node + 生成矩阵 + CI PASS；NOT_SCORED |
| Chrome API 正确性 | Driver fixture PASS，Native NOT_TESTED；NOT_SCORED |
| Owned / Full 权限隔离 | Node 拒绝路径 PASS，Native NOT_TESTED；NOT_SCORED |
| Host 安全 | 代际/一次性票据/并发与过期回归 PASS，真实手势 NOT_TESTED；NOT_SCORED |
| 完整 CRUD | Node PASS，Native NOT_TESTED；NOT_SCORED |
| 分页与事件可靠性 | Node PASS，原生跨窗口/Worker NOT_TESTED；NOT_SCORED |
| 独立工具消费兼容 | 包、81 项定向及 CI PASS，安装使用 NOT_TESTED；NOT_SCORED |
| 旧业务清理及解耦 | 静态与回归 PASS，历史门禁顺序偏差保留；NOT_SCORED |
| 测试与回归 | 专项 CI PASS，全仓14失败、市场Native失败；BLOCKED |
| 真实 Chrome 产品完成度 | NOT_TESTED / BLOCKED；无95+结论 |

## Mac Codex 验收命令及操作清单

先读 AGENTS.md，核对 main、未提交文件、现有 npm run dev watcher 和已加载扩展 ID/目录。
仅无重叠修改时快进 main；不得覆盖 watcher 的 dist/development。
下列 build 命令仅在对应输出没有 writer、按仓库协议安排的验收窗口执行：

```bash
cd /Users/shopme/Documents/workspace/opendesk-browser
git status --short
git fetch origin main
git log -1 --format=%H origin/main
# 确认没有重叠修改后，仅快进：git merge --ff-only origin/main
node --test tests/environment/bookmark-manager-r2.test.mjs tests/environment/bookmark-manager-r24-lifecycle.test.mjs tests/environment/browser-sdk-r112-full-bookmarks.test.mjs tests/environment/browser-sdk-r124-current-page.test.mjs
npm run build:sidebar-tool -- examples/sidebar-tools/bookmark-manager
shasum -a 256 artifacts/sidebar-tools/bookmark-manager/0.3.1/bookmark-manager.opendesk-tool.json
npm run check
# 仅在验收输出资源已释放的窗口运行：
npm run build
npm run build:dev
npm run verify
```

1. 专属 CFT/Profile 加载 production 候选；记录源码 SHA、构建 hash、Chrome 版本、扩展 ID/目录/Profile、工具 packageHash/installEpoch。
2. 从正式扩展中心安装 0.3.1：首次拒绝不能显示私人树，再明确允许；逐一执行全部 12 个接口，并保留真实原生回执。
3. 专用测试目录放入 100/500/550/1001 条、多级/空目录/256 字符/中文/特殊字符/已有非HTTP(S)节点；比对全部原生 ID、父子及顺序。连续刷新/CRUD 超过20次，确认不再耗尽快照。
4. 分页中新增/修改/删除、跨窗口变更和导入，必须最终重新同步；验证所有七类事件、溢出/Gap/会话过期、Worker重启及跨包/epoch引用失效。
5. 编辑时由另一窗口改名，保留草稿但提交应冲突；当前页收藏覆盖导航、同URL重载、切换、关闭和撤权。
6. 非空目录预检后变更子树、managed后代、票据过期/重复/跨安装及预检中撤权均失败关闭；记录最后原生重检到执行间隔及未观察竞态边界。不得宣称原子CAS，不自动重放未知写入。
7. 停用、升级、卸载、重装与Chrome撤权；原生书签不被卸载删除，其他工具不能继承Full，沙箱不能访问chrome.bookmarks。
8. 市场Native选择器失败先由其UI/验收负责人核对真实布局；不绕过可信输入。取得全部同候选证据后，再决定发布、Issue关闭与逐维独立评分。

文件与构建资源：RELEASED。没有 Mac watcher、浏览器 Profile 或 Native 配对被改动。

## R2.4 NEXT · GitHub 网页增量续接与现行 Native 门禁（2026-10-15）

**阶段状态：PARTIAL / HANDOFF_READY / ISSUE #75 OPEN；未发布，未作 95+ 评分。** 本段只记录本轮增量，不改写上面的 R2.4 历史候选、已归档 `summary.json` 及其原始 SHA；来源为已连接 GitHub 的源码/Actions，不是用户 Mac/CFT。机器可读记录：[github-main-resume-20261015.json](evidence/bookmark-manager-r24-runtime-closure/github-main-resume-20261015.json)。

- **增量基线与身份**：本轮首次核查远端 `main=6b111e5537e63b0809bbd4e2daec8d7de9c8b4fa`；旧提示词的 `f8d2b22d` 已不是 HEAD。历史 R2.4 组件 PASS 保留在 `a2be6815ad1f58907b10da1dc31df738b1bcacce`，SDK R11.3 的 437/437 保留在 `0c4d4a885efb09b467148009e0ebe4981a1ae2da`，没有替换为新 SHA。当前独立书签工具配置已到 **0.3.4**，原始 0.3.1 包不能用作新候选。代码变更发生在其他并行工作期间，旧原生缺口需要重新分级。
- **本轮唯一执行源码改动**：`tests/framework/app-market-r3-native.test.mjs` 从隐藏的 `#sidebar-tool-discover-toggle` / 旧工具列表改为真实可见的 R4 `#extension-center` 列表、搜索、筛选、市场入口、详情升级和导入菜单；浮动行操作仅通过 Chrome `Input.dispatchMouseEvent mouseMoved/mousePressed/mouseReleased` 完成可信导航，仍复用原 `sidebarTools.openOfficialReview` 的安装/权限 Host。正式提交 `c8d52ef41fde83cec61d8cdd86a5ceea099591ef`，目标文件 blob `a378b976d1bc806bf1f1e64fe4731e38e0524456`。不触碰产品 UI、SDK、书签源码、权限数据库、旧宿主业务，不伪造安装回执。静态 V8 语法解析（移除静态 import 后）PASS，**不等于** Node 原生驱动执行或 Native PASS。
- **共享 UI 归属**：R4.1 工作记录 `docs/framework/workstreams/extension-center-r41-native-01a13a66.md` 显示真实负责人，本轮只改无近期重叠写入的市场原生驱动文件；旧选择器失败是测试与现行 CSS 可见性不一致，不盲目增加等待时间。未使用任何 Mac Chrome/Profile/watcher，也未覆盖其他 Agent 的工作区内容。

| 阶段 | 本轮确认状态 | 证据 / 下一实际动作 |
| --- | --- | --- |
| 基线/SDK 组件 | **REUSE_RECORDED_PASS + AFFECTED_INPUTS** | 历史 `a2be6815` 的 81/81、`0c4d4a88` 的 437/437 原样保留；书签 0.3.4、统一扩展中心 UI 和发行依赖已变 |
| 1. 正式安装入口 | **EVIDENCE_INCOMPLETE** | 已修复旧隐藏控件的测试导航；`c8d52ef4` 对应市场 CI 在原生阶段前 FAIL，没有新包 Chrome 操作回执 |
| 2. 最小书签 Native | **PARTIAL HISTORICAL / NOT_TESTED 0.3.4** | 独立工具 README 记载 0.3.3 已真实升级、授权后显示 2159 节点，但原生建文件夹遭隐藏 URL 校验拒绝；0.3.4 的针对性表单修复仅有 Node 证据，当前会话未取得同候选 Chrome CRUD 收据 |
| 3. 完整安全/生命周期 | **NOT_TESTED CURRENT CANDIDATE** | 完整 12 方法、1001+、跨窗口/Worker、撤权、危险删除全矩阵仍须同候选 Native 原件；不能用 2159 节点读取替代 |
| 4. 工程与 CI | **BLOCKED / AFFECTED_INPUTS** | 书签源 CI `38707598882` 71/71 Node PASS，但 AdBlock 可信源码指纹不匹配使生产构建 FAIL；市场 `38708321527` 三个 Job 在组件测试失败，均没运行到 Chrome |
| 5. 发布/独立审查 | **NOT_SCORED / BLOCKED** | 没有同候选全套 Native 和独立逐维评分；#75 保持 OPEN，不关闭、不宣称 95+ |

**原始 CI 依据：** [书签 CI #38707598882](https://github.com/shopable-ai/opendesk-browser/actions/runs/38707598882) — 71 PASS、0 FAIL 的 Node 专项之后在 `Trusted AdBlock source changed; review and re-pin` 处拒绝生产构建；[市场 CI #38708321527](https://github.com/shopable-ai/opendesk-browser/actions/runs/38708321527) — Linux 生产组件 161 PASS/1 FAIL（Cookie Editor portable 文件与源码生成包不一致），Linux/macOS HTTP 组件各 100 PASS/1 FAIL（reading-kit 当前 quick-notes 1.1.8 与发行工具 1.1.9 不一致）。CI 整体 FAIL，不可忽略这些阻塞或把导航修复标记为原生通过。共享/其他业务文件按其现有 owner 协调，不修改固定发行身份或取消诚信断言。

**Git 与产物**：本轮生产文件新增/删除/净变更均为 **0**；测试代码改动 **1 文件**；本轮新增一份可机读失败回执到既有 R2.4 evidence 目录、在本工作流追加上述状态。GitHub 真实源码提交 `c8d52ef4`，证据提交与其分开保存；本会话没有用户 Mac 的 Chrome 版本、Profile、扩展 ID、加载目录、0.3.4 包 SHA、installEpoch 或同候选打包指纹，全部保留 `NOT_TESTED`/空值，不使用历史包身份填充。

**下一个可执行断点**：先由 Cookie Editor、阅读套装/Quick Notes、AdBlock 对应负责范围解决真实构建/组件断言；在稳定的最新 `main` 上仅补受影响 CI。然后使用未被其他 watcher 占用的隔离输出和真实 Mac CFT，按 `AGENTS.md`、`testing-guide.md` 冻结候选并通过正式扩展中心审阅 0.3.4；先验证拒绝/允许/2159 树和实际文件夹/书签 CRUD，再进入其余 12 方法、安全与生命周期。**实际打包命令**是 `npm run build:sidebar-tool -- examples/sidebar-tools/bookmark-manager`，从 `tool.config.json` 读取版本定位产物，不再使用上文历史固定的 0.3.1 路径；`build:dev` 必须先核对 watcher 所拥有的输出，不擅自覆盖。全阶段通过后方可决定关闭 Issue #75。

### 并行提交后复核：更新输入而非重写历史 PASS

本轮证据提交前后，其他任务的 `2cbfbb454ce111e0b0ada487611e48602946e63f` 继续修改了同一市场原生驱动的末尾**键盘/焦点**场景，将仍指向隐藏 Discover 控件的旧断言迁移到 R4 正式列表。最新读取 `tests/framework/app-market-r3-native.test.mjs` blob 为 `3e0a00adaef2c1435fda70870f026cbb083e096f`；我方 `c8d52ef4` 的 blob `a378b976...` 是它的历史父输入，**不是当前完整脚本的通过身份**。后续原生测试请对更新后的完整脚本重新执行，且该共享文件新增代码由相应原生测试工作负责人维护，不以旧版本覆盖。

同期统一 SDK 新增独立工具 `browser.storage.local.keys/getQuota` 合同，`src/framework/sdk/browser-contract.js` blob `b2f202ba47da655b99064ec7aebab19846c99f7b`、`src/framework/sdk/browser-schemas.js` blob `f9f64da8d86eb83a83b0b15ab9dbe1752c042caf` 已改变，另有 `src/ui/sidebar-tools/storage-state.js` 的通用受控存储实现改动。即使不改变书签 Full Driver，也必须将最终 Browser 构建输入标为 **AFFECTED_INPUTS**，不能沿用 `c8d52ef4` 的完整包/Native 身份。核查时 `main=``7a29f545fc78f46fd35cb8ce266645e3b5030c05`；相关组件/Native 尚未在此 SHA 上取得 PASS。证据档案仅作为各自历史候选的原始收据。


## R2.5 NEXT · Save verification and product UI (2026-10-15)

**状态：SOURCE_TEST_PASS / STANDALONE_TOOL_BUILD_PASS / SHARED_BUILD_BLOCKED / NATIVE_NOT_TESTED / NOT_SCORED。** 本节追加在既有 R2.4 台账，不重写 0.3.3/0.3.4 历史 Chrome 2159 节点及隐藏 URL 表单故障证据；当时的成功读取不能替代当前 0.3.5 的 Chrome 写入验收。

### 用户问题、查明的缺陷与解决

- 用户报告旧界面编辑/保存失败。历史 0.3.3 非可见 URL 字段参与原生表单校验是**已证实的一种**保存阻断；0.3.4 只有 Node 回归，其他保存失败原因尚不能排除。
- R2.5 源码核查确认原表单 native `invalid` 不进入 `submit`，因而可能没有明确反馈；写入 SDK 请求返回后，UI 未核实刷新后的原生树却直接显示“已更新”；后台读取过程中发生的进一步编辑可能被旧草稿覆盖；删除确认也曾引用最新树而非原来审阅的子树。以上属于**源码确认的设计和可靠性风险**，并非宣称已在用户 Mac 上分别复现。
- 0.3.5 将非适用字段置为 disabled 以排除原生校验；每个有效字段仍经过 Service 校验。校验错误具备可见文本、ARIA；`input/change` 保留最新草稿；删除确认对原审阅节点和签名做比对。
- 0.3.5 写入成功回执**仅代表请求返回**。客户端随后通过 Full SDK 重新读取整棵原生树并按 ID、标题、URL、parentId 或删除结果验证；不能核实则保留原草稿并锁住重复危险提交，提示用户先检查原生书签。读回失败、`E_OUTCOME_UNKNOWN` 均不得自动重放。Chrome API 不支持原子 CAS；只读核验不承诺跨设备无竞态或永久持久化。
- 独立工具依然只调用 `OpenDeskSDK.browser.bookmarks.*`，不复制 Host、Driver 或第二套业务层，旧 `src/bookmark-manager/` 不恢复。工具配置为 `0.3.5`，需要正式安装/升级重新审阅。

### UI 方案对比与统一预览

方案 A：单栏多级钻取，窄窗口结构简单，但查看详情、编辑、返回目录反复往返；在桌面大面积空白。方案 B：响应式主从视图，宽窗口左侧树/搜索、右侧详情；窄 Side Panel 选中详情优先展示，可就地编辑、移动、删除。**本轮选择 B**，保留已有 Model/Service/分页/SDK，使用 `od-page`、`od-button`、`od-icon-button`、`od-field`、`od-surface` 语义组件；样式仅负责树、选中态和排版。原有颜色及按钮规则不再由工具覆盖；官方构建从唯一 `design-tokens.css` / `design-system.css` 编译合法公共 CSS。

延伸既有 `scripts/preview/build-preview.mjs` 的 Bookmark Manager 适配，将**同一正式工具 HTML/CSS/JS**置于受限离线 iframe，只替换 `OpenDeskSDK` Mock 边界。新的 `scripts/preview/bookmark-manager-mock.js` 提供受控内存分页/CRUD/事件、最多 2159 条虚拟节点及六种场景；不持久化或读写真实 Chrome，不伪造安装身份。可运行：

```sh
node scripts/preview/build-preview.mjs --tool bookmark-manager --surface side-panel --scenario success --theme light --width 360 --height 760
node scripts/preview/build-preview.mjs --tool bookmark-manager --surface side-panel --scenario permission-denied --theme light --width 360 --height 760
```

HTML 设计评审另有一份在线对话内的可交互纯内存原型；该设计稿不属于签名生产包和 Source-Bound Preview 的原件，不能替代后者的证据。

### 源码、测试与发布门禁

- 版本升级与 UI/Preview 初始提交：[0f620b94](https://github.com/shopable-ai/opendesk-browser/commit/0f620b94aa9c8875bf4a50a8a8b34e06c23d2611)；版本测试断言修复：[0f010917](https://github.com/shopable-ai/opendesk-browser/commit/0f0109176665189d0c5fb43e117578eb5035463b)；最终写后读回、未确认状态禁止重复危险提交：[503efc31](https://github.com/shopable-ai/opendesk-browser/commit/503efc31fff492e6361c019bbb406e2b44b623b8)。均经正常非强制 main 更新提交，不改写其他 Agent 的输入。
- [书签专项 Actions #38716096582](https://github.com/shopable-ai/opendesk-browser/actions/runs/38716096582)：四套相关专项 **75 PASS、0 FAIL**；`npm run check` **PASS**；官方 `npm run build:sidebar-tool -- examples/sidebar-tools/bookmark-manager` **PASS**，输出 `artifacts/sidebar-tools/bookmark-manager/0.3.5/bookmark-manager.opendesk-tool.json`。可下载[该候选构建证据包](https://github.com/shopable-ai/opendesk-browser/actions/runs/38716096582/artifacts/11963017433)（不是 Chrome Native）。
- 同一 Actions 的 **全 Browser `npm run build` FAIL**，证据为预先存在的共享 AdBlock `examples/sidebar-tools/adblock/trusted/host-controls.js` 源码指纹门禁：`Trusted AdBlock source changed; review and re-pin`。未擅自重设可信哈希、放宽断言或改写独立所有者文件。其后 production verify、development build 和 `npm run verify` **SKIPPED / BLOCKED**。
- [首次 Production Source-Bound Preview CI #38715068068](https://github.com/shopable-ai/opendesk-browser/actions/runs/38715068068) **PASS**（含新 Bookmark Manager 模拟预览合同）；当时提交尚未包含上述最终 UI 写后确认逻辑，不能将其绑定为最终同候选 Chrome 实测证明。
- **真实 Chrome 0.3.5**：正式安装/授权、编辑及创建/移动/删除、查看刷新后原生结果、撤权、跨窗口/Worker、全部十二方法与 2000+ 大规模操作均 **NOT_TESTED**。设计视觉与键盘/无障碍的独立原生审阅亦 **NOT_SCORED**。
- **专家门禁**：设计七维、真实产品九维继续逐项独立判定。当前仅能确认源码和静态/Node 合同；所有需要独立视觉复核或真实 Chrome 收据的评分保留 **NOT_SCORED**，不存在跨维平均分或“已经达到 95+”结论。Issue #75 仍保持 **OPEN**，不可发布。


### R2.5 production-source-bound preview CI confirmation

[Sidebar Preview Contract #38716711733](https://github.com/shopable-ai/opendesk-browser/actions/runs/38716711733) 在 `44fed81162c232f1001bbe794d9e58e18497660a` **PASS**：共享设计源锁、组件与模拟边界负例、工具打包/预览生成、既有 Quick Notes headless Chrome 回归全部通过。其独立产物 [bookmark-manager-source-bound-preview（Artifact 11961999146）](https://github.com/shopable-ai/opendesk-browser/actions/runs/38716711733/artifacts/11961999146) 包含真实 Bookmark Manager 同包 HTML/CSS/JS 的 success、empty、error、loading、permission-denied、untrusted 共六个离线 HTML。**这些新 Bookmark Manager HTML 在本 CI 只通过生成及 Node 合同，尚无同候选独立 Chrome 真实点击/视觉截图证据**；Quick Notes 的 Chrome 浏览器通过不得冒充 Bookmark Manager 的 Browser Native。Notebook、用户 Mac 安装与授权持续 NOT_TESTED。

## R2.6 · 原位编辑工作区与交互预览闭环（2026-10-15）

**候选版本：0.3.6；状态：PRODUCTION_SOURCE_CHANGED / REAL_CHROME_OFFLINE_MOCK_INTERACTION_PASS / NODE_75_PASS / CHECK_PASS / INDEPENDENT_PACKAGE_PASS / SHARED_BROWSER_BUILD_BLOCKED / NATIVE_NOT_TESTED / EXPERT_95_NOT_SCORED / ISSUE_75_OPEN。**

本轮由用户提出“编辑名称、URL 不应跳转到独立页面”的反馈触发。R2.5 源码确认普通编辑使用 `s.mode` 切换使整个列表隐藏，窄面板详情距离当前条目较远，已确认写入后清除选择。上述均为源代码证据；Chrome Native 未重现前不得包装为用户 Mac 端实测。

### 交互决策、生产修改及风险合同

- **统一 Inspector**：`src/index.html`、`src/main.js`、`src/style.css` 将已有只读详情、编辑表单、移动及危险删除确认放入同一个 DOM 详情区域，不再开普通编辑子页面；Wide 为 740px 起列表/详情左右分栏，窄侧栏复用同一详情 DOM 挂在选中列表项附近，当前检索条件和展开目录不消失。CSS 只写布局，公共 `od-*` 外观与 Token 继续由唯一正式 `src/ui/design-system.css` 和 `src/ui/design-tokens.css` 构建时注入；不引入 React/Radix/private IPC。
- **保存与上下文**：已确认 SDK 写入后重新读取原生树，再保留/选中真实新节点的 ID；列表、选择和搜索持续显示；取消无写入；保存失败保留草稿；显式草稿切换闸；F2/Escape/Enter 有操作入口；目标文件夹按路径检索，禁止文件夹自身/后代目标继续由 Model/Service 校验。编辑同时涉及名称/URL/移动时，服务端 SDK 拆分两步，中间先读回检查，不能核实或部分成功即阻断盲目重试，**不伪称跨 Chrome 两种写操作的原子事务**。
- **冲突保护**：仍基于审阅时的节点签名做预检和 Host 检查；外部变化引发的 `E_BOOKMARK_STALE` 不自动覆盖。手动“重新读取并对比”后，用户才可以明确采用最新 Chrome 版本作为基线并重新保存；草稿保留。未知结果禁用重复提交；撤权清空私有 DOM、草稿、搜索及 SDK 观察者。危险的非空文件夹删除保留已审阅子项签名、Host 短时一次性票据与明确二次确认。
- **严格 iframe 的保存修复**：生产 `bm-save` 使用 `type=button` 并直接从点击/Enter 的用户手势运行原有受校验的 SDK 逻辑；不放宽 Preview/工具 iframe 的 `sandbox`、不开放 `allow-forms`、不通过表单 HTTP 提交。这是正式浏览器点击测试暴露的实际可操作性缺口，旧 Node 人工派发 `submit` 未能证明真实保存按钮能用。
- **正式依赖加载修复**：既有 `scripts/preview/build-preview.mjs` 漏载工具包 `pkg.scripts`（书签 `model.js`、`service.js`），之前会输出“看起来可用”但实际无法启动的 HTML。R2.6 改为在入口 JS 前按正式包验证后的顺序注入依赖，使用依赖字节参与预览 UI digest，更新唯一既有 `contracts/ui-preview/quick-notes.lock.json`；没有新建第二套 Preview Builder/Skill。
- **独立 Mock 实验台**：`scripts/preview/bookmark-manager-mock.js` 以折叠控制区模拟保存明确失败、未知结果、外部改动及授权撤销，仅操作内存；这些控件不在生产 `src/index.html` 中。已有 2159 节点分页/搜索数据未减少。新增 `scripts/tests/bookmark-manager-r26-preview-chrome.mjs`，让同源正式 HTML/JS/CSS 在真正无头 Chrome（非安装态）执行窄 360px、宽 960px 交互并生成截图/JSON；CI 触发器只增加这一已拥有脚本，不改变其他工具的正式 UI。

### R2.5 与 R2.6 的用户操作路径

| 用户操作 | R2.5 | R2.6 |
| --- | --- | --- |
| 查看并编辑已有书签 | 点列表、进入独立表单视图，列表隐藏 | 选中书签即显示同区详情，点编辑在当前位置输入，列表仍可见 |
| 保存 | 保存后无条件清除选择，需再定位原项目 | SDK 读回成功后保持/选中修改后的 ID，同步详情及搜索结果 |
| 切换草稿 | 缺少完整的未保存切换提示 | 仅用户明确放弃草稿才切换，或继续编辑 |
| 目录移动 | 很长的原生下拉 | 输入路径关键字筛选目标目录，安全预检仍用原 Service |
| 新建 | 新表单独立视图 | 同区新建；读回验证后自动选中新节点 |

此对比为源代码操作状态的路径差异，非计时基准；图片、焦点质量与键盘可达性不能仅凭此表给出 95 分。

### 同候选 CI 证据与真实限制

- [正式书签工具源码 CI #38723734914](https://github.com/shopable-ai/opendesk-browser/actions/runs/38723734914)，在提交 `d527a8356ac16817f3338864bb2a0d92b7609c19`：原有书签 SDK/生命周期等 **75 PASS / 0 FAIL**；`npm run check` **PASS**；0.3.6 独立工具包 **PASS**。之后全 Browser `npm run build` **FAIL**，因并行任务范围内 `examples/sidebar-tools/adblock/trusted/host-controls.js` 的可信源码指纹校验。没有绕过审计/重置其他代理提交；后续 Browser verify / development build **BLOCKED / NOT_RUN**。
- [正式 Source-Bound Preview CI #38723734762](https://github.com/shopable-ai/opendesk-browser/actions/runs/38723734762)，同一候选 `d527a835`：原 Preview Kit 的合同、隔离、安全反例、正式工具打包、生成矩阵、Quick Notes 既有 Chrome smoke 均 **PASS**；新书签专项真实 Chrome 中 **`MOCK_BROWSER_INTERACTION_PASS_NOT_INSTALLED`，2 视口**。覆盖 2159 尾部搜索、选中原位编辑、保存后保持选择、取消不写入、未保存草稿切换、按路径移动、明确失败后手动重试、外部冲突显式审阅与再次保存、未知结果写锁、撤权清理、无外部网络、无脚本异常和无横向页面溢出。预览截图及机读记录位于此 CI 的 `quick-notes-contract-previews` Artifact 内 `artifacts/preview-chrome/bookmark-r26-{narrow,wide}.png` 与 `bookmark-r26-interaction.json`。
- **可打开的正式来源 HTML**：[bookmark-manager-source-bound-preview — Artifact 11967260379](https://github.com/shopable-ai/opendesk-browser/actions/runs/38723734762/artifacts/11967260379)。提取 `artifacts/previews/bookmark-manager/side-panel-success-light-360.html` / `side-panel-success-light-960.html`，直接在浏览器打开；独立沙箱仅 Mock，不读取/修改真实 Chrome 书签。6 种原有 Preview 场景仍可生成。源码、依赖、设计 Token 与正式工具同源。
- **Native**：0.3.6 的真实 Chrome 安装/升级、Full Bookmarks 授权、真实保存及删除、跨窗口冲突、Safari 及 Mac Profile 等均 **NOT_TESTED**。用户对视觉/操作的实际主观反馈尚待确认，独立 95+ 视觉审查、无障碍审计、各种分辨率截图审阅均 **NOT_SCORED**；不发布、不关闭 Issue #75。

### 逐维验收门禁（不得以均分遮掩）

视觉 7 维（整体品质、设计系统一致性、信息层级、排版/图标/密度、列表/交互状态、窄栏、宽页面）：**正式设计源一致性与响应式 CSS 有构建/浏览器 Mock 证据；独立视觉逐维评分仍为 NOT_SCORED**，不能仅凭样式代码给 95。

交互 8 维（浏览导航、原位编辑、新建/修改、文件夹移动、草稿/保存、错误/冲突、键盘/无障碍、2159 项规模）：**上述核心操作已经真实 Chrome 离线 Mock 自动化验证**；真实授权 SDK Host 写入、完整真实 Chrome 键盘辅助技术、触摸和长时大量书签仍待独立验收。尚不能为每个维度提供独立 95+ 专家分数，统一标记 `MOCK_PASS / NATIVE_NOT_TESTED / 95_NOT_SCORED`。

下一候选行动：确认这份源代码不被并行 Agent 覆盖；与 AdBlock 所有者协调可信指纹阻塞，不私下绕过；在真实 Mac Chrome 用正式 Extension Center 安装 0.3.6，授权 Full Bookmarks，逐项验证选中→编辑→保存及 URL/目录变化确实反映 Chrome 原生树、滚动焦点、撤权及非空文件夹危险删除。收集原生安装 ID、工具版本、运行时哈希、Chrome 操作回执和视觉/键盘截图后再逐项给分。Issue #75 继续 OPEN。


## R2.7 · 生产 UX 修复、原位编辑安全边界与同源 Chrome 证据（2026-10-15）

**状态截至提交 3b418bec：PRODUCTION_SOURCE_CHANGED / SOURCE_BOUND_PREVIEW_PASS / HEADLESS_CHROME_MOCK_PASS / NATIVE_NOT_TESTED / 95_NOT_SCORED / ISSUE_75_OPEN。** 本轮继续使用 0.3.6 正式工具；保留宿主和公开 SDK 的权限、安全删除、冲突预检和未知写入结果保护；不得将离线 Mock 的读回视为 Mac 正式安装 Native 回执。

### 本轮已改生产代码（增量实现，非另建原型）

- **瞬时读取失败和草稿保护**：\`examples/sidebar-tools/bookmark-manager/src/main.js\` 只对已加载且仍有授权的工作区、明确识别的暂时传输错误保留列表及编辑草稿；撤权、状态未知或数据不可用继续 fail-closed。外部窗口删除当前选中书签后，编辑草稿仍可复制，但提交禁用、提示不能覆盖已删除项。保存并读回确认后如项目不匹配当前搜索，显示可理解的提示，不隐式清空搜索。
- **大目录选择**：目标文件夹有超过 120 个匹配时仍保留第 121 项以后的已选项，避免清空过滤条件后移动目标无声改变；候选 DOM 仍保持 120 项上限加 1 个已选项。
- **键盘与视觉**：列表行重新渲染后恢复原来的展开/条目/菜单按钮焦点；Escape 取消草稿切换提示后焦点返回编辑控件。正式工具的刷新、当前页收藏、文件夹/书签图标改用已有共享 \`od-icon-button\` 和 token 驱动 SVG，创建书签/文件夹优先级清晰，未引入自有颜色、设计 token 或图标包。正式 \`src/index.html\`、\`src/style.css\` 与 \`src/main.js\` 为唯一生产实现。
- **新增模拟诊断与交互**：仅 \`scripts/preview/bookmark-manager-mock.js\` 添加下一次分页读取超时、额外 130 文件夹及外部删除；\`scripts/tests/bookmark-manager-r26-preview-chrome.mjs\` 在原运行器补充了新建书签和文件夹、搜索上下文反馈、超限文件夹选择、瞬时刷新错误保留草稿、外部删除写锁、Escape/列表焦点及撤权反例。在同源生成的真实 HTML/JS/CSS 上生成窄 360px、宽 960px 详情/编辑/冲突各三张截图，不复制长期分叉 UI。
- **R2.7 Node Fixture**：正式 UI 改为合法的 SVG 命名空间创建后，原 Node 手工 DOM fixture 不支持 \`createElementNS\`，曾使下游用例错误性地报告授权 UI 不可用。只在 \`tests/environment/bookmark-manager-r2.test.mjs\`、\`tests/environment/bookmark-manager-r24-lifecycle.test.mjs\` 补齐 SVG 节点模拟，不修改正式产品逻辑或删除用例。

涉及正式与测试提交（全部在主分支正常非强制更新）：
\`d26018d\`、\`2ce5d8a\`、\`a2b0678\`、\`29e0390\`、\`f17a2af\`、\`27fcb09\`、\`d5b3013\`、\`518859b\`、\`185da9c\`、\`bc2ce6a\`、\`3b418be\`、\`67dc6b1\`、\`4837f2b\`。并行开发不断更新 \`main\`，不要把上面列出的某一 SHA 冒充永远不变的 HEAD。

### CI、构建、预览身份（分级，不越级声称 Native）

| 验证 | 同候选/状态 |
| --- | --- |
| R2.7 最新源码预览契约 | [CI #38738814513](https://github.com/shopable-ai/opendesk-browser/actions/runs/38738814513) 在 \`3b418bec\` 上 **PASS**：Preview 输入源码锁、共享设计/包、负向安全合同，以及真实 headless Chrome 离线模拟交互共 2 视口；Chrome Mock 标记 \`MOCK_BROWSER_INTERACTION_PASS_NOT_INSTALLED\`，不是原生插件 |
| Chrome 新视觉截图/JSON | [quick-notes-contract-previews Artifact 11975955068](https://github.com/shopable-ai/opendesk-browser/actions/runs/38738814513/artifacts/11975955068) 内 \`artifacts/preview-chrome/bookmark-r27-{narrow,wide}-{details,editing,conflict}.png\` 共 6 张，交互日志 \`bookmark-r26-interaction.json\` 包含额外视觉文件名与 SDK/设计源指纹 |
| 可操作生产同源 HTML | [bookmark-manager-source-bound-preview Artifact 11975955075](https://github.com/shopable-ai/opendesk-browser/actions/runs/38738814513/artifacts/11975955075) 内 \`artifacts/previews/bookmark-manager/side-panel-success-light-360.html\`；直接打开，属隔离离线 Mock，不连接用户书签 |
| R2.7 首次专项 Node | [CI #38738178026](https://github.com/shopable-ai/opendesk-browser/actions/runs/38738178026) 在 \`d5b3013\` 上 **51 PASS / 24 FAIL**；旧 DOM fixture 不支持新合法 SVG，完整构建尚未进入。失败历史保留，不能用 Preview CI 覆盖 |
| SVG Fixture 后复测 | [CI #38739585579](https://github.com/shopable-ai/opendesk-browser/actions/runs/38739585579) 于此记录时为 **QUEUED / NOT_YET_VERIFIED**，需核对最终 Node、check、包和 Browser Build 分步骤回执；不得继承 R2.6 的 Node 75 PASS 为当前结果 |
| 正式 Mac Chrome 安装/Full Bookmarks/CRUD | **NOT_TESTED**：没有用户专属 Profile、扩展 ID、安装 epoch、同源原生数据收据。不能宣称 Native PASS |
| 视觉七维、交互八维及工程评分 | **NOT_SCORED / NOT_FULLY_ACCEPTED**：CI Chrome 离线点击与新截图提供可复核样本，不能替代独立真实用户视觉及 Native 审查，未有逐维 95+ 结论 |

### 剩余产品验收

先确认专项 Node 75/75 与 \`npm run check\`、独立官方包、全 Browser Build 的 **当前** 结果；若 AdBlock 可信指纹或其他并行安全门禁失败，不跳过、不盲目重新计算指纹。随后在隔离正式 Chrome Profile、同一候选安装版本及授权身份下，人工点击并录入原生读回回执：Full Bookmarks 首次授权/撤权、书签及文件夹创建重命名、原位 URL 编辑、混合更新与目录移动、非空子树安全删除/票据、外部窗口编辑/删除、未知写入结果禁止盲目重试、滚动/键盘/焦点和 2159+ 数据真实性。所有 Chrome Native 工作待有可访问的正式 Mac/Chrome 环境才可执行；Issue #75 继续 OPEN，逐维产品专家 95 分数不可凭 Mock 自动宣称。


## R2.7.1 · 紧凑原位编辑、独立 Chrome 可视证据、0.3.7 安装候选

继续增量落实，而非重做 UI/SDK/宿主。正式工具版本由 0.3.6 升至 **0.3.7**（\`331d539\` + \`4a38221\`）：\`src/ui/sidebar-tools/installation.js\` 的市场安装规则拒绝同版本替换新字节 (\`E_VERSION_CONFLICT\`)，因此 R2.7 不可让新源码继续伪装旧发布版本。此版本为 **INSTALLABLE_CANDIDATE**，没有原生安装收据，不能宣称升级 PASS。

源码与交互：
- \`src/index.html\` 和 \`src/main.js\` 将已有文件夹选择器收敛到共享 \`od-disclosure--flat\`。普通名称/URL 编辑只展示当前文件夹路径与可展开的摘要；用户点击摘要后继续使用原有路径搜索及 Host 安全移动。新建与明确移动始终展开，不额外增加步骤；无合法目标文件夹时自动展开便于恢复。用户重新进入编辑会恢复紧凑状态，刷新不丢失已展开目录或草稿。
- 表单 Enter 仅在名称/URL 输入框触发原有保存，\`summary\`、选择器及按钮保留原生键盘行为（\`96874a0\`）。新增 Chrome Mock 回归针对 folder disclosure 可点击、组合改名+移动必须读回两步结果、新建展开与取消、未知副作用保护。
- 窄视口发生已证实的外部冲突时滚动到已有审阅区，使「重新读取并对比」操作可见而不自动重试（\`8497ffa\`）；主编辑辅助文案移除对用户无意义的 SDK 术语（\`2095893\`）。
- \`scripts/tests/bookmark-manager-r26-preview-chrome.mjs\` 仍是唯一生产同源 Chrome 交互脚本；没有第二套 UI 或 Runner。为避免共享 AdBlock Preview CI 中途失败掩盖本工具验收，**在原** \`.github/workflows/bookmark-manager-r2.yml\` 中追加此脚本、原有 builder 的 HTML/截图 JSON artifact，以及 CI Linux 的 Noto Sans CJK 字体依赖；之后继续执行未减弱的 Browser Build/verify 安全门禁。此为同源隔离 Mock，不是原生扩展安装。
- Chrome CJK 可读性审查发现旧 CI 图像的汉字大面积缺字（不可用于可靠中文视觉评分）；新专项 CI 通过安装 \`fonts-noto-cjk\` 恢复真实中文字形，能审查窄/宽两视口详情、编辑、冲突三状态。

### 已取得的新实证（明确绑定历史候选）

- [Bookmark 专项 #38746591054](https://github.com/shopable-ai/opendesk-browser/actions/runs/38746591054) 在 \`700764a\`（当时 0.3.6）**Node 75/75、check、独立包、同源 Chrome Mock 2/2 PASS**，中文 \`fc-match\` 为 \`Noto Sans CJK SC\`；视觉 HTML/6 张截图/交互 JSON：[Artifact 11980281101](https://github.com/shopable-ai/opendesk-browser/actions/runs/38746591054/artifacts/11980281101)。生产 Browser Build **FAIL**，未取消构建门禁。
- [Bookmark 专项 #38747285986](https://github.com/shopable-ai/opendesk-browser/actions/runs/38747285986) 在 \`4a38221\`（正式候选 **0.3.7**）**Node 75/75、check、独立包、同源 Chrome Mock 2/2 PASS**；可读中文预览与报告：[Artifact 11980411213](https://github.com/shopable-ai/opendesk-browser/actions/runs/38747285986/artifacts/11980411213)。本次全 Browser Build 在另一并行的 Reading TOC 本地化资源 \`examples/sidebar-tools/reading-toc/locales.json\` 进入高权限 \`page-relay\` 固定 bundle 的**安全来源限制**处 FAIL；没有绕过检查或私自白名单。历史 AdBlock Trusted pin 漂移也是单独的既有安全问题，不能因为此构建未触发它就标记已解决。
- \`8497ffa\` / \`2095893\` 的后续冲突可见性/文案候选：[Bookmark 专项 #38747767609](https://github.com/shopable-ai/opendesk-browser/actions/runs/38747767609)，记录本段时处于 **IN_PROGRESS/NOT_YET_VERIFIED**；后续报告必须更新到实际完成状态。

**Native**：仍为 \`NATIVE_NOT_TESTED\`。没有真实 Mac Chrome/Full Bookmarks 授权/安装身份、用户书签原生写后读回或跨窗口删除证据。设计、操作、工程分别不得宣称 95+；Issue #75 继续 OPEN。真正发布需在安全门禁恢复并取得同版本同 hash 的 Chrome Native CRUD 后验收。


### R2.7.1 最新冻结的书签组件证据（0.3.7）

[Bookmark 专项 CI #38747767609](https://github.com/shopable-ai/opendesk-browser/actions/runs/38747767609) 在 \`20958934a641d4c059b3107ad5e99c015e2a14ca\`：**Node 75 PASS / 0 FAIL、npm run check PASS、独立 v2 包 PASS、Noto Sans CJK SC 字体检查 PASS、真实无头 Chrome 生产同源 Mock 2 视口 PASS**；Chrome 输入输出边界明确 \`MOCK_BROWSER_INTERACTION_PASS_NOT_INSTALLED\`。六张已恢复中文的真实渲染截图证明详情/紧凑编辑/外部冲突状态；此候选还验证了缩小文件夹选择器、展开目录组合编辑/移动、冲突审阅按钮滚动可见和简洁保存文案。官方 HTML、六张截图与 JSON 证据：[artifact 11979122960](https://github.com/shopable-ai/opendesk-browser/actions/runs/38747767609/artifacts/11979122960)。

同候选官方独立包 \`artifacts/sidebar-tools/bookmark-manager/0.3.7/bookmark-manager.opendesk-tool.json\` 字节数 **85,377**，SHA-256 **\`367f966c84d9ace1d634e81d7c5929e3356e1dd7fa9ad9ca5ab1360ceb641a17\`**（[artifact 11978359530](https://github.com/shopable-ai/opendesk-browser/actions/runs/38747767609/artifacts/11978359530)）；Full Bookmarks 独立 capability 不变，发布身份仍需 Native 验证。Package 和 Preview 同 SHA、同工具版本，预览专用 Mock SDK 不在正式包内。

全 Browser \`npm run build\` **FAIL**：\`[opendesk-fixed-page-relay] Historical/user/vendor code cannot enter a privileged fixed bundle: examples/sidebar-tools/reading-toc/locales.json\`，属于并行 Reading TOC 本地化/共享 bundle 安全来源边界；未批准补全来源前不可绕过，后续 Verify/Dev Build **SKIPPED**。共享 Preview Contract 的 AdBlock Chrome 用例也存在独立失败；本轮书签专项复用原 Chrome 测试成功，不能借此宣称共享全仓无失败。

与远端后续 main 比对：至读取时仅本工作记录及其他并行模块变化，没有 Bookmarks 产品/SDK/Preview 输入变化，因此本候选组件证据仍有效，最终 Browser Build/Native/Issue #75/专家逐维 95+ **NOT_CLOSED**。


## R2.8 · 只读选择 / 草稿切换 / 预览实验台外置（2026-10-15）

**用户反馈**：在原位编辑期间再选中其他书签，原实现 \`onAction()\` 的脏草稿切换仅在编辑表单末尾显示 \`bm-draft-guard\`，原表单仍可见且提示可能在窄侧栏视野之外；用户误以为点新书签打开/维持了编辑弹窗。离线 Mock 又在 \`bookmark-manager-mock.js\` 内对 \`tool-root.before(previewLab)\` 注入“预览实验台”，导致实验按钮和正式工具的视觉边界混淆。两项均有真实源码根因，并非二次设计需求。

**源码修复**（唯一业务实现 \`examples/sidebar-tools/bookmark-manager/src/\`）：
- 普通行点击只查看详情；干净表单点击行直接退出编辑进入只读。脏草稿点击其他行时仍保留旧选择，但明确展示目标名称与“继续编辑草稿 / 放弃草稿并查看”两种动作，暂时隐藏原编辑表单，且滚动到决策提示避免窄侧栏下方不可见；未获明确同意不自动保存、不修改原生节点。Escape 或保留恢复原草稿和焦点，明确放弃后才切换并显示**只读**详情。
- 将 \`bm-draft-guard\` 从 Inspector 末尾移到只读详情与编辑表单之间，新增 \`bm-draft-context\` 文案；撤权时也清除该文本，避免旧私有书签标题残留在隐藏 DOM。
- 为符合已批准安装器不允许同版本换包的原则，正式安装候选由 0.3.7 提升为 **bookmark-manager@0.3.8**；静态版本回归同步更新。
- 此次未修改 Full Bookmarks SDK、Host、删除一次性票据、代理、权限或独立业务目录结构。

**预览与安装包边界**：
- 删除 \`scripts/preview/bookmark-manager-mock.js\` 对工具 iframe 的任何实验台 DOM 插入。离线实验 UI 只生成在 \`scripts/templates/sidebar-tool-preview-shell.html\` 模拟 \`.preview-device\` **之外**的 \`#od-preview-bookmark-lab\`，默认折叠，八项诊断按钮均被明确标注“预览测试辅助工具（不属于书签管理器）”。
- \`scripts/preview/bookmark-manager-lab.js\` 仅作外层 Preview 控制器。它与隔离的 Mock iframe 只通过命名白名单 \`opendesk.preview.bookmark.command.v1/ack.v1\` 和请求 ID 交互，外侧核对 iframe WindowProxy / opaque origin / 请求一致性，内侧核对 \`event.source===parent\` 和精确命令。只影响 Mock 内存，不放宽 \`sandbox="allow-scripts"\`、CSP 或正式工具安装包的 JS 资源声明。
- 扩展原有 \`scripts/tests/bookmark-manager-r26-preview-chrome.mjs\`，新增“干净编辑点击条目直接只读”“脏草稿确认时表单隐藏、原选择保留”“明确放弃后目标只读”“实验台在模拟设备之外”“外部辅助按钮真实 Chromium 点击且收到 Mock 回执”“iframe 与安装包均无实验 DOM”等断言；新增 Node 黑盒消息反例与包内容隔离断言。
- 约束保存于 \`.agents/skills/opendesk-ui-preview/SKILL.md\`、\`docs/architecture/browser-framework/ui-preview-contract-r1.zh-CN.md\` 和工具 README；只有 Mock/外层 Lab 承载诊断，不得以后用一句“仅模拟”作为将控件放入正式 UI 的理由。
- 共享 Quick Notes 输入锁再次检查了全部 14 个 Git blob：模板与 builder 变更均经过人工差异审阅；并行 packer 推广保护和 Reading TOC adapter 的合法输入变更也逐项复核后才更新。严禁禁用 stale lock；后续并行代码再变仍须绑定新的候选。

**验收状态**：源代码及测试已经提交于 \`main\`；新 CI 提交入队（含 [Bookmark 专项 #38754049482](https://github.com/shopable-ai/opendesk-browser/actions/runs/38754049482) 与 [Preview #38754049040](https://github.com/shopable-ai/opendesk-browser/actions/runs/38754049040) 历史候选）。这些 run 在本段记录时尚无最终 PASS 证据；不得把 R2.7 0.3.7 的 75/75、Mock 双视口和 Browser Build 结果自动迁移至 R2.8 0.3.8。正式 Mac Chrome Native CRUD / Full 权限 / 视觉逐维 95+ 均 **NOT_TESTED / NOT_SCORED**，Issue #75 继续 OPEN；全 Browser Build 的独立 AdBlock / Reading TOC 等安全门禁不得绕过。
